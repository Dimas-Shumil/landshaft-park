(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  if (!hero) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.className = 'hero__snow';
  canvas.setAttribute('aria-hidden', 'true');
  hero.appendChild(canvas);

  let visible = false;
  let ready = false;
  let isNight = false;
  let frame = 0;
  let previous = 0;
  let width = 0;
  let height = 0;
  let flakes = [];
  let stars = [];

  function detectNight() {
    const forced = new URLSearchParams(window.location.search).get('heroTime');
    if (forced === 'night') return true;
    if (forced === 'day') return false;
    const hour = new Date().getHours();
    return hour >= 20 || hour < 7;
  }

  function applyPeriod() {
    const nextNight = detectNight();
    if (nextNight === isNight && ready) return;
    isNight = nextNight;
    hero.classList.toggle('is-night', isNight);
    resize();
    sync();
  }

  function goodNetwork() {
    if (!navigator.onLine) return false;
    if (!connection) return true;
    if (connection.saveData) return false;
    if (connection.effectiveType && ['slow-2g', '2g'].includes(connection.effectiveType)) return false;
    if (typeof connection.downlink === 'number' && connection.downlink > 0 && connection.downlink < 1.2) return false;
    if (typeof connection.rtt === 'number' && connection.rtt > 450) return false;
    return true;
  }

  function makeFlake() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.9 + Math.random() * 2.5,
      speed: 18 + Math.random() * 30,
      drift: 3 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.34 + Math.random() * 0.42
    };
  }

  function makeStar() {
    const skyHeight = Math.min(height * 0.38, 360);
    let x = Math.random() * width;
    let y = 18 + Math.random() * Math.max(30, skyHeight - 36);
    if (x > width * 0.68 && y > height * 0.13) {
      x = Math.random() * width * 0.68;
    }
    return {
      x,
      y,
      radius: 0.45 + Math.random() * 1.25,
      alpha: 0.3 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      speed: 0.001 + Math.random() * 0.0022,
      sparkle: Math.random() > 0.88
    };
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const flakeCount = Math.min(155, Math.max(65, Math.round(width / 12)));
    const starCount = Math.min(105, Math.max(45, Math.round(width / 17)));
    flakes = Array.from({ length: flakeCount }, makeFlake);
    stars = Array.from({ length: starCount }, makeStar);
    drawScene(performance.now(), 0, false);
  }

  function drawStars(now) {
    if (!isNight) return;
    for (const star of stars) {
      const twinkle = 0.48 + Math.sin(now * star.speed + star.phase) * 0.38;
      const alpha = Math.max(0.12, star.alpha * twinkle);
      ctx.fillStyle = `rgba(225,239,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();

      if (star.sparkle && twinkle > 0.67) {
        const ray = star.radius * 3.6;
        ctx.strokeStyle = `rgba(241,247,255,${alpha * 0.58})`;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(star.x - ray, star.y);
        ctx.lineTo(star.x + ray, star.y);
        ctx.moveTo(star.x, star.y - ray);
        ctx.lineTo(star.x, star.y + ray);
        ctx.stroke();
      }
    }
  }

  function drawSnow(now, dt, move) {
    for (const flake of flakes) {
      if (move) {
        flake.y += flake.speed * dt;
        flake.x += (flake.drift + Math.sin(now / 2100 + flake.phase) * 6) * dt;
        if (flake.y > height + 6) {
          flake.y = -6;
          flake.x = Math.random() * width;
        }
        if (flake.x > width + 6) flake.x = -6;
      }
      ctx.fillStyle = `rgba(255,255,255,${flake.alpha})`;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawScene(now, dt, move, showSnow = true) {
    ctx.clearRect(0, 0, width, height);
    drawStars(now);
    if (showSnow) drawSnow(now, dt, move);
  }

  function draw(now) {
    const dt = Math.min((now - (previous || now)) / 1000, 0.05);
    previous = now;
    drawScene(now, dt, true);
    frame = requestAnimationFrame(draw);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }

  function sync() {
    const active = ready && visible && !document.hidden;
    const animate = active && !motion.matches && goodNetwork();

    canvas.hidden = !active;
    if (animate && !frame) {
      previous = 0;
      frame = requestAnimationFrame(draw);
      return;
    }
    if (!animate) {
      stop();
      if (active) drawScene(performance.now(), 0, false, false);
    }
  }

  if (!('IntersectionObserver' in window)) return;

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  }, { threshold: 0 }).observe(hero);

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  if (connection && connection.addEventListener) connection.addEventListener('change', sync);

  const start = () => {
    ready = true;
    applyPeriod();
    resize();
    sync();
    window.setInterval(applyPeriod, 60000);
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
