(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let visible = false;
  let ready = false;
  let frame = 0;
  let previous = 0;
  let width = 0;
  let height = 0;
  let flakes = [];
  const canvas = document.createElement('canvas');
  canvas.className = 'hero__snow';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Conservative heuristic: browsers cannot guarantee connection stability.
  // Without Network Information, use real uncached hero/navigation timings.
  function goodNetwork() {
    if (!navigator.onLine) return false;
    if (connection) {
      if (connection.saveData) return false;
      if (connection.effectiveType && connection.effectiveType !== '4g') return false;
      if (typeof connection.downlink === 'number' && connection.downlink < 1.5) return false;
      if (typeof connection.rtt === 'number' && connection.rtt > 300) return false;
      if (connection.effectiveType || connection.downlink > 0) return true;
    }
    const entries = performance.getEntriesByType('resource');
    const image = entries.find(entry => entry.name.includes('/site/images/hero-winter.webp'));
    const navigation = performance.getEntriesByType('navigation')[0];
    // Cached images alone do not prove the network is fast.
    return Boolean(image && image.transferSize > 0 && image.duration < 2500 &&
      navigation && navigation.responseStart - navigation.requestStart < 800);
  }
  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    flakes = Array.from({ length: Math.min(65, Math.max(20, Math.round(width / 25))) }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      radius: 0.7 + Math.random() * 1.8,
      speed: 13 + Math.random() * 22,
      drift: 2 + Math.random() * 7,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.25 + Math.random() * 0.4
    }));
  }
  function draw(now) {
    const dt = Math.min((now - (previous || now)) / 1000, 0.05);
    previous = now;
    ctx.clearRect(0, 0, width, height);
    for (const flake of flakes) {
      flake.y += flake.speed * dt;
      flake.x += (flake.drift + Math.sin(now / 2500 + flake.phase) * 5) * dt;
      if (flake.y > height + 5) { flake.y = -5; flake.x = Math.random() * width; }
      if (flake.x > width + 5) flake.x = -5;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${flake.alpha})`;
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    frame = requestAnimationFrame(draw);
  }
  function sync() {
    const run = ready && visible && !document.hidden && !motion.matches && goodNetwork();
    if (run && !frame) {
      if (!canvas.isConnected) { hero.appendChild(canvas); resize(); }
      canvas.hidden = false;
      previous = 0;
      frame = requestAnimationFrame(draw);
    } else if (!run) {
      cancelAnimationFrame(frame);
      frame = 0;
      canvas.hidden = true;
      ctx.clearRect(0, 0, width, height);
    }
  }
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: 0 }).observe(hero);
  window.addEventListener('resize', () => { if (canvas.isConnected) resize(); }, { passive: true });
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  if (connection && connection.addEventListener) connection.addEventListener('change', sync);
  const start = () => { ready = true; sync(); };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
