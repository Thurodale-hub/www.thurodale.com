/* ==========================================================================
   Thurodale — GA4 event tracking
   ==========================================================================

   BEFORE THIS WORKS: replace MEASUREMENT_ID below with your own G- id.
   While it reads 'G-XXXXXXXXXX' the script bootstraps, binds every listener
   and logs to the console in debug mode, but sends nothing to Google.

   DESIGN RULES OBSERVED HERE

     · Nothing here changes existing behaviour. Every listener is passive or
       non-cancelling. No preventDefault, no returned false, no navigation
       is delayed or intercepted. If this file fails to load, or is blocked
       by an ad blocker, the site behaves exactly as it does now.
     · All binding is delegated from `document`, so elements added later are
       tracked without re-initialising anything.
     · Event and parameter names are snake_case, per GA4 convention.
       Reserved GA4 names are avoided except where the recommended event is
       genuinely the right one (`search` with `search_term`).
     · Consent Mode v2 defaults analytics_storage to 'denied'. See the
       CONSENT note at the foot of this file: this is deliberate, and it
       matters for this site specifically.
   ========================================================================== */

(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-XXXXXXXXXX';   // <-- replace
  var DEBUG = false;                     // true logs every event to console

  /* The placeholder is itself a syntactically valid id (X is [A-Z]), so it
     has to be excluded by name. Without this the site requests
     googletagmanager.com on every page load with an id that does not exist. */
  var PLACEHOLDER = 'G-XXXXXXXXXX';
  var configured = /^G-[A-Z0-9]{6,}$/.test(MEASUREMENT_ID) && MEASUREMENT_ID !== PLACEHOLDER;

  /* Setup status, readable from the browser console:
       thurodaleAnalytics        -> { configured: false, measurementId: 'G-XXXXXXXXXX' }
     configured stays false until a real id is set above. */
  window.thurodaleAnalytics = { configured: configured, measurementId: MEASUREMENT_ID };

  /* ---- Bootstrap ------------------------------------------------------- */

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  /* Consent Mode v2, set BEFORE config so the default is never missed. */
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    send_page_view: true,
    anonymize_ip: true
  });

  if (configured) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(s);
  }

  /* Public surface. Other scripts call window.thurodaleTrack(...). */
  function track(name, params) {
    var payload = params || {};
    payload.page_location = window.location.pathname;
    if (DEBUG) console.log('[ga4]', name, payload);
    gtag('event', name, payload);

    /* Mirror every event as a DOM event so it can be observed without
       patching dataLayer or wrapping this function. To watch events live,
       paste this into the browser console:

         document.addEventListener('thurodale:track',
           e => console.log(e.detail.name, e.detail.params));

       Nothing in the site depends on this. */
    try {
      document.dispatchEvent(new CustomEvent('thurodale:track', {
        detail: { name: name, params: payload }
      }));
    } catch (e) {}
  }
  window.thurodaleTrack = track;

  /* Grant or withdraw analytics consent from a banner, a settings control,
     or the console. Withdrawing takes effect immediately. */
  window.thurodaleConsent = {
    grant: function () {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      try { localStorage.setItem('thurodale-consent', 'granted'); } catch (e) {}
    },
    deny: function () {
      gtag('consent', 'update', { analytics_storage: 'denied' });
      try { localStorage.setItem('thurodale-consent', 'denied'); } catch (e) {}
    },
    state: function () {
      try { return localStorage.getItem('thurodale-consent') || 'denied'; }
      catch (e) { return 'denied'; }
    }
  };
  // Restore a previous grant on subsequent visits.
  if (window.thurodaleConsent.state() === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }

  /* ---- Helpers --------------------------------------------------------- */

  function text(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  /* Where in the page furniture did this happen? Used as a parameter so
     the same link text in the header and the footer stays distinguishable. */
  function region(el) {
    if (el.closest('.site-header')) return 'header';
    if (el.closest('.site-footer')) return 'footer';
    if (el.closest('.hero'))        return 'hero';
    if (el.closest('.faq'))         return 'faq';
    if (el.closest('.doc-nav'))     return 'doc_nav';
    if (el.closest('main'))         return 'body';
    return 'other';
  }

  function linkKind(href) {
    if (!href) return 'unknown';
    if (href.indexOf('mailto:') === 0) return 'email';
    if (href.indexOf('tel:') === 0)    return 'phone';
    if (href.charAt(0) === '#')        return 'anchor';
    if (/^https?:\/\//i.test(href) && href.indexOf(window.location.host) === -1) return 'outbound';
    return 'internal';
  }

  /* ---- 1. Navigation and link clicks ----------------------------------- */

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a');
    if (!a) return;

    var href = a.getAttribute('href') || '';
    var kind = linkKind(href);
    var where = region(a);

    var params = {
      link_text: text(a),
      link_url: href,
      link_type: kind,
      nav_location: where
    };

    // Primary and secondary calls to action get their own event, because
    // they answer a different question than ordinary navigation does.
    if (a.classList.contains('btn') || a.classList.contains('cta-bar')) {
      params.cta_style = a.classList.contains('btn--primary') ? 'primary'
                       : a.classList.contains('cta-bar')      ? 'bar'
                       : 'ghost';
      track('cta_click', params);
    } else if (kind === 'email') {
      track('contact_click', { contact_method: 'email', nav_location: where });
    } else if (kind === 'outbound') {
      track('outbound_click', params);
    } else if (where === 'header' || where === 'footer' || where === 'doc_nav'
               || kind === 'anchor') {
      track('nav_click', params);
    } else {
      track('link_click', params);
    }
  }, { passive: true });

  /* ---- 2. FAQ accordion ------------------------------------------------ */

  /* `toggle` fires on <details> after the state changes. It does not bubble
     in every engine, so it is captured rather than delegated by bubbling. */
  document.addEventListener('toggle', function (ev) {
    var d = ev.target;
    if (!d || d.tagName !== 'DETAILS' || !d.classList.contains('faq__item')) return;
    var q = d.querySelector('.faq__q');
    track('faq_toggle', {
      faq_question: q ? text(q) : '',
      faq_action: d.open ? 'open' : 'close'
    });
  }, true);

  /* ---- 3. Copy to clipboard on code samples ---------------------------- */

  /* This site currently has no code samples. The handler is delegated from
     `document`, so it starts working the moment markup of the expected
     shape appears, with no change to this file:

         <pre data-code-sample data-language="css">...</pre>
         <button data-copy-code="#sample-id">Copy</button>                  */

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest && ev.target.closest('[data-copy-code]');
    if (!btn) return;
    var sel = btn.getAttribute('data-copy-code');
    var sample = sel ? document.querySelector(sel) : btn.closest('[data-code-sample]');
    track('copy_code', {
      code_language: (sample && sample.getAttribute('data-language')) || 'unknown',
      code_context: (sample && sample.id) || region(btn),
      method: 'button'
    });
  }, { passive: true });

  /* Manual selection copy inside a code sample, which the button misses. */
  document.addEventListener('copy', function (ev) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    var node = sel.getRangeAt(0).commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    var sample = el && el.closest && el.closest('[data-code-sample]');
    if (!sample) return;
    track('copy_code', {
      code_language: sample.getAttribute('data-language') || 'unknown',
      code_context: sample.id || 'inline',
      method: 'selection'
    });
  }, { passive: true });

  /* ---- 4. Filter and search on component listings ---------------------- */

  /* Also dormant: there is no component listing on this site yet. Expected
     markup, again delegated so no wiring is needed later:

         <button data-filter="type" data-filter-value="cards">Cards</button>
         <select data-filter="status">...</select>
         <input type="search" data-component-search>                        */

  document.addEventListener('click', function (ev) {
    var f = ev.target.closest && ev.target.closest('[data-filter]');
    if (!f || f.tagName === 'SELECT') return;

    /* Read the pressed state on the next tick, after the listing's own
       handler has updated it. Reading synchronously would report the state
       before or after the flip depending on listener order, which silently
       inverts apply/remove. Reporting the resulting state is unambiguous. */
    window.setTimeout(function () {
      track('filter_select', {
        filter_type: f.getAttribute('data-filter') || 'unknown',
        filter_value: f.getAttribute('data-filter-value') || text(f),
        filter_action: f.getAttribute('aria-pressed') === 'false' ? 'remove' : 'apply'
      });
    }, 0);
  }, { passive: true });

  document.addEventListener('change', function (ev) {
    var f = ev.target.closest && ev.target.closest('select[data-filter]');
    if (!f) return;
    track('filter_select', {
      filter_type: f.getAttribute('data-filter') || 'unknown',
      filter_value: f.value,
      filter_action: f.value ? 'apply' : 'clear'
    });
  }, { passive: true });

  /* Search is debounced to the settled term. Firing per keystroke would
     bury the useful signal under prefixes of itself. */
  var searchTimer = null;
  document.addEventListener('input', function (ev) {
    var input = ev.target.closest && ev.target.closest('[data-component-search]');
    if (!input) return;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      var term = (input.value || '').trim();
      if (term.length < 2) return;
      var results = input.getAttribute('data-result-count');
      // `search` is a GA4 recommended event; search_term is its parameter.
      track('search', {
        search_term: term.toLowerCase().slice(0, 100),
        search_scope: input.getAttribute('data-search-scope') || 'components',
        result_count: results === null ? undefined : Number(results)
      });
    }, 700);
  }, { passive: true });

  /* ---- 5. Scroll depth ------------------------------------------------- */

  /* Thresholds fire once each, in order, and only on pages long enough for
     the milestone to mean something. On a page barely taller than the
     viewport, "scrolled 75%" would be noise. */

  var THRESHOLDS = [25, 50, 75, 100];
  var fired = {};
  var ticking = false;

  function docHeight() {
    var b = document.body, e = document.documentElement;
    return Math.max(b.scrollHeight, b.offsetHeight, e.clientHeight,
                    e.scrollHeight, e.offsetHeight);
  }

  function measure() {
    var viewport = window.innerHeight;
    var total = docHeight();

    // Needs at least half a screen of scrolling beyond the fold to count.
    if (total < viewport * 1.5) return;

    var scrolled = window.pageYOffset + viewport;
    var pct = Math.min(100, Math.round((scrolled / total) * 100));

    for (var i = 0; i < THRESHOLDS.length; i++) {
      var t = THRESHOLDS[i];
      if (pct >= t && !fired[t]) {
        fired[t] = true;
        track('scroll_depth', {
          percent_scrolled: t,
          page_length_px: total
        });
      }
    }
  }

  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { measure(); ticking = false; });
  }, { passive: true });

  window.addEventListener('load', measure, { passive: true });

  /* ==========================================================================
     CONSENT — read this before going live.

     analytics_storage defaults to 'denied'. That is not a placeholder.
     This site's own Cookie Notice (legal.html#cookies, section 5) states:

       "Where required by applicable law, Thurodale will request consent
        before placing non-essential cookies on your device."

     Analytics cookies are non-essential. Turning GA4 on without a consent
     mechanism would put the site in direct conflict with its published
     notice. Under Consent Mode v2 with analytics_storage denied, GA4 still
     receives cookieless pings, so you get modelled traffic shape without
     storing anything on the visitor's device.

     To collect full analytics, add a consent banner that calls
     window.thurodaleConsent.grant() on acceptance and .deny() on refusal.
     ========================================================================== */
})();
