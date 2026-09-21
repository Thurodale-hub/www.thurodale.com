/* Thurodale — scroll reveal and hero ring drift.
   ~1.5KB, no dependencies. Everything degrades to a fully visible page.

   The reveal is bidirectional: elements fade in whether they arrive from
   below (scrolling down) or from above (scrolling up), and they re-arm once
   they leave the viewport so the effect repeats on the way back.

   The fade-out happens off-screen, not in front of the reader. An element
   only loses its revealed state once it has fully passed the top edge, or
   dropped past the bottom activation line. Content is never dimmed while
   someone is looking at it.

   This file does NOT check prefers-reduced-motion for the reveal. It does
   not need to: the hidden state lives inside a
   @media (prefers-reduced-motion: no-preference) block in the stylesheet,
   so with reduced motion on, toggling these classes changes nothing. */
(function () {
  'use strict';

  var targets = document.querySelectorAll(
    '[data-reveal], [data-reveal-group], [data-reveal-heading], [data-reveal-panel]'
  );

  /* Per-element entry delay, in ms, via data-reveal-delay="120". Used to
     sequence siblings that are not children of a single stagger group. */
  for (var d = 0; d < targets.length; d++) {
    var ms = targets[d].getAttribute('data-reveal-delay');
    if (ms) targets[d].style.transitionDelay = parseInt(ms, 10) + 'ms';
  }

  if (!('IntersectionObserver' in window)) {
    for (var i = 0; i < targets.length; i++) targets[i].classList.add('is-visible');
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var el = entry.target;

      if (entry.isIntersecting) {
        /* Direction-aware: something arriving from above should settle
           downward, not rise. boundingClientRect.top < 0 means the element's
           top edge is above the viewport, so it is entering from the top. */
        el.style.setProperty('--reveal-dir', entry.boundingClientRect.top < 0 ? '-1' : '1');
        el.classList.add('is-visible');
      } else {
        var r = entry.boundingClientRect;

        /* Re-arm for the next pass, but only once the element is genuinely
           off-screen. The observer's root is shortened at the bottom so the
           reveal starts early, which means "not intersecting" can still mean
           "partly visible". Checking the real viewport guarantees nothing is
           ever faded out while the reader can still see it.

           Elements taller than the viewport are left alone: they only stop
           intersecting when far away, and re-arming them causes a jump. */
        var offScreen = r.bottom <= 0 || r.top >= window.innerHeight;
        if (offScreen && r.height <= window.innerHeight) {
          el.classList.remove('is-visible');
        }
      }
    });
  }, {
    /* Shortens the root at the bottom, so an element must be ~8% into the
       viewport before it reveals. Without this, anything barely peeking
       over the bottom edge would animate while nobody is looking at it. */
    rootMargin: '0px 0px -8% 0px',
    threshold: 0
  });

  for (var j = 0; j < targets.length; j++) observer.observe(targets[j]);

  /* Hero rings drift at roughly a tenth of the scroll rate, so the
     foreground text always moves faster than the decoration behind it.
     This one IS gated on the motion preference, because the transform is
     applied here rather than by the stylesheet. */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rings = document.querySelector('.hero__rings');
  if (!rings || reduceMotion.matches) return;

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var offset = Math.min(window.pageYOffset, 900) * 0.1;
      rings.style.transform = 'translate3d(0, ' + offset.toFixed(1) + 'px, 0)';
      ticking = false;
    });
  }, { passive: true });
})();
