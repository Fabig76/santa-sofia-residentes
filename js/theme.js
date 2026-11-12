// ============================================================
// Santa Sofía — Tema claro/oscuro + elementos 3D
// Solo apariencia: no toca la lógica de app.js / admin.js / etc.
//   1. Botón de tema (Automático → Claro → Oscuro) en el encabezado.
//   2. index.html: portada con las 4 torres en 3D (CSS puro).
//   3. index.html: índice lateral de secciones (pantallas anchas).
//   4. index.html: tarjeta 3D del N° de formulario + botón "Copiar".
// ============================================================
(function () {
  'use strict';
  var KEY = 'ss-theme';
  var root = document.documentElement;

  // ---------- 1. Tema ----------
  var ICONS = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500L19 19M5 19l1.500-1.500M17.500 6.500L19 5"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/></svg>'
  };
  var LABELS = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };
  var ORDER = ['auto', 'light', 'dark'];

  function getTheme() {
    try { var t = localStorage.getItem(KEY); return (t === 'light' || t === 'dark') ? t : 'auto'; }
    catch (e) { return 'auto'; }
  }
  function applyTheme(t) {
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {}
  }
  function initThemeButton() {
    // Va dentro del grupo de pestañas cuando la página tiene uno
    // (index: .mode-tabs, admin: .admin-tabs); si no, en el encabezado.
    var host = document.querySelector('.mode-tabs') || document.querySelector('.admin-tabs') ||
      document.querySelector('.header-inner');
    if (!host) return;
    // Un role="tablist" solo puede contener pestañas: si el grupo lo es, se envuelve
    // en .ss-seg (el grupo visual) y el botón va junto a la lista, no dentro.
    // Se mueve el mismo nodo: las pestañas conservan sus eventos de app.js.
    if (host.getAttribute('role') === 'tablist') {
      var seg = document.createElement('div');
      seg.className = 'ss-seg';
      host.parentNode.insertBefore(seg, host);
      seg.appendChild(host);
      host = seg;
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ss-theme-btn';
    function paint() {
      var t = getTheme();
      btn.innerHTML = ICONS[t] + '<span>' + LABELS[t] + '</span>';
      btn.setAttribute('aria-label', 'Tema: ' + LABELS[t] + '. Cambiar tema');
    }
    btn.addEventListener('click', function () {
      var next = ORDER[(ORDER.indexOf(getTheme()) + 1) % ORDER.length];
      applyTheme(next);
      paint();
    });
    paint();
    host.appendChild(btn);
  }

  // ---------- 2. Torres 3D ----------
  var TOWERS = [
    { name: 'Naranja', color: '#E8892B', x: 50, y: 30, pair: 0 },
    { name: 'Amarilla', color: '#E9C23A', x: 50, y: 250, pair: 0 },
    { name: 'Verde', color: '#5E9B4A', x: 230, y: 30, pair: 1 },
    { name: 'Azul', color: '#3F8FC4', x: 230, y: 250, pair: 1 }
  ];
  function mix(hex, to, amt) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (to - v) * amt); });
    return 'rgb(' + c.join(',') + ')';
  }
  function cuboid(x, y, w, d, h, color, windows) {
    var band = windows ? 'rgba(20,40,60,0.26)' : 'rgba(0,0,0,0)';
    var sH = 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 10px, ' + band + ' 10px 16px)';
    var sV = 'repeating-linear-gradient(to right, rgba(0,0,0,0) 0 10px, ' + band + ' 10px 16px)';
    var light = mix(color, 255, 0.35), mid = mix(color, 0, 0.14), dark = mix(color, 0, 0.26);
    var faces = [
      'left:0;top:0;width:' + w + 'px;height:' + d + 'px;transform:translateZ(' + h + 'px);background:' + light,
      'left:0;top:' + (d - h) + 'px;width:' + w + 'px;height:' + h + 'px;transform-origin:50% 100%;transform:rotateX(-90deg);background:' + sH + ',' + color,
      'left:0;top:0;width:' + w + 'px;height:' + h + 'px;transform-origin:50% 0;transform:rotateX(90deg);background:' + sH + ',' + dark,
      'left:' + (w - h) + 'px;top:0;width:' + h + 'px;height:' + d + 'px;transform-origin:100% 50%;transform:rotateY(90deg);background:' + sV + ',' + mid,
      'left:0;top:0;width:' + h + 'px;height:' + d + 'px;transform-origin:0 50%;transform:rotateY(-90deg);background:' + sV + ',' + mid
    ];
    var el = document.createElement('div');
    el.className = 'ss-solid';
    el.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + d + 'px';
    el.innerHTML = faces.map(function (f) { return '<div class="ss-face" style="' + f + '"></div>'; }).join('');
    return el;
  }
  function initHero() {
    var header = document.querySelector('header.site-header');
    if (!header || !document.getElementById('mainForm')) return;

    var hero = document.createElement('section');
    hero.className = 'ss-hero';
    hero.setAttribute('aria-label', 'Portada');
    hero.innerHTML =
      '<div class="ss-hero-text">' +
        '<h2>Tus datos y tu mudanza, en un solo lugar.</h2>' +
        '<p>Actualiza el registro de tu apartamento, agenda el ascensor para tu mudanza y consulta tus reservas.</p>' +
      '</div>' +
      '<div class="ss-hero-3d">' +
        '<div class="ss-scene" role="img" aria-label="Modelo 3D de las cuatro torres: Naranja y Amarilla comparten un ascensor; Verde y Azul comparten otro">' +
          '<div class="ss-world"><div class="ss-spin"><div class="ss-ground"></div></div></div>' +
        '</div>' +
        '<div class="ss-legend"></div>' +
        '<p class="ss-hero-hint" aria-live="polite"></p>' +
      '</div>';
    header.insertAdjacentElement('afterend', hero);

    var spin = hero.querySelector('.ss-spin');
    var world = hero.querySelector('.ss-world');
    var scene = hero.querySelector('.ss-scene');
    var legend = hero.querySelector('.ss-legend');
    var hint = hero.querySelector('.ss-hero-hint');
    var towerEls = TOWERS.map(function (t) {
      var el = cuboid(t.x, t.y, 80, 80, 190, t.color, true);
      spin.appendChild(el);
      return el;
    });
    var coreEls = [0, 1].map(function (p) {
      var el = cuboid(p === 0 ? 72 : 252, 110, 36, 140, 206, '#C5CCD2', false);
      spin.appendChild(el);
      return el;
    });
    var chips = TOWERS.map(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ss-chip';
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<i style="background:' + t.color + '"></i>Torre ' + t.name;
      b.addEventListener('click', function () { select(sel === i ? null : i, true); });
      legend.appendChild(b);
      return b;
    });

    var sel = null;
    var torreSelect = document.getElementById('mudTorre');
    function select(i, fromUser) {
      sel = i;
      var pair = i === null ? null : TOWERS[i].pair;
      towerEls.forEach(function (el, k) {
        el.style.opacity = (i === null || k === i) ? 1 : (TOWERS[k].pair === pair ? 0.75 : 0.22);
      });
      coreEls.forEach(function (el, p) { el.style.opacity = (pair === null || pair === p) ? 1 : 0.22; });
      chips.forEach(function (b, k) { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      if (i === null) {
        hint.textContent = 'Toca una torre para ver con cuál comparte ascensor.';
      } else {
        var other = TOWERS.filter(function (t, k) { return t.pair === pair && k !== i; })[0].name;
        hint.textContent = 'Torre ' + TOWERS[i].name + ' comparte ascensor con Torre ' + other +
          ': un horario reservado en una bloquea el mismo horario en la otra.';
      }
    }
    select(null);

    // Si el residente elige torre en "Agendar mudanza", el modelo la resalta.
    if (torreSelect) {
      torreSelect.addEventListener('change', function () {
        var v = String(torreSelect.value || '').toLowerCase();
        var idx = -1;
        TOWERS.forEach(function (t, k) { if (v && v.indexOf(t.name.toLowerCase()) !== -1) idx = k; });
        select(idx === -1 ? null : idx);
      });
    }

    scene.addEventListener('pointermove', function (e) {
      var r = scene.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      world.style.setProperty('--rot', Math.round(px * 70) + 'deg');
      world.style.setProperty('--tilt', Math.round(58 - py * 14) + 'deg');
    });
    scene.addEventListener('pointerleave', function () {
      world.style.removeProperty('--rot');
      world.style.removeProperty('--tilt');
    });
  }

  // ---------- 3. Índice lateral de secciones ----------
  function initIndex() {
    var form = document.getElementById('mainForm');
    var card = document.getElementById('form-card');
    var view = document.getElementById('view-create');
    if (!form || !card || !view) return;
    var sections = Array.prototype.slice.call(form.querySelectorAll('.section'));
    if (!sections.length) return;

    var nav = document.createElement('nav');
    nav.className = 'ss-index';
    nav.setAttribute('aria-label', 'Secciones del formulario');
    var title = document.createElement('div');
    title.className = 'ss-index-title';
    title.textContent = 'Secciones';
    nav.appendChild(title);

    var buttons = sections.map(function (sec) {
      var numEl = sec.querySelector('.section-num');
      var head = sec.querySelector('.section-head > span');
      var num = numEl ? numEl.textContent.trim() : '';
      var label = head ? head.textContent.trim() : '';
      if (num && label.indexOf(num) === 0) label = label.slice(num.length).trim();
      label = label.replace(/\s*[\(—].*$/, '');
      var b = document.createElement('button');
      b.type = 'button';
      var n = document.createElement('b'); n.textContent = num;
      var t = document.createElement('span'); t.textContent = label;
      b.appendChild(n); b.appendChild(t);
      b.addEventListener('click', function () {
        sec.classList.remove('collapsed');
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(b);
      return b;
    });
    document.body.appendChild(nav);

    function sync() {
      var visible = !view.classList.contains('hidden') && !card.classList.contains('hidden');
      nav.classList.toggle('hidden', !visible);
      if (!visible) return;
      var current = 0;
      sections.forEach(function (sec, i) { if (sec.getBoundingClientRect().top < 160) current = i; });
      buttons.forEach(function (b, i) { b.classList.toggle('on', i === current); });
    }
    window.addEventListener('scroll', sync, { passive: true });
    new MutationObserver(sync).observe(view, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(sync).observe(card, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  // ---------- 4. Tarjeta 3D del N° de formulario ----------
  function initSuccessCard() {
    var card = document.getElementById('success-card');
    var num = document.getElementById('success-num-form');
    if (!card || !num) return;

    card.addEventListener('pointermove', function (e) {
      var r = num.getBoundingClientRect();
      var px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      num.style.setProperty('--ry', Math.round((px - 0.5) * 36) + 'deg');
      num.style.setProperty('--rx', Math.round((0.5 - py) * 24) + 'deg');
      num.style.setProperty('--gx', Math.round(px * 100) + '%');
      num.style.setProperty('--gy', Math.round(py * 100) + '%');
    });
    card.addEventListener('pointerleave', function () {
      ['--ry', '--rx', '--gx', '--gy'].forEach(function (p) { num.style.removeProperty(p); });
    });

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-secondary';
    copy.textContent = 'Copiar número';
    copy.style.marginRight = '6px';
    function reset(ms) { setTimeout(function () { copy.textContent = 'Copiar número'; }, ms); }
    // Deja el número seleccionado en pantalla: si el portapapeles está bloqueado,
    // el residente puede copiarlo a mano (Ctrl+C / mantener pulsado).
    function selectNum() {
      try {
        var sel = document.getSelection();
        var range = document.createRange();
        range.selectNodeContents(num);
        sel.removeAllRanges();
        sel.addRange(range);
        return sel;
      } catch (e) { return null; }
    }
    // Respaldo sin Clipboard API: <textarea> temporal + execCommand('copy');
    // si falla, segundo intento con execCommand sobre la selección del número.
    function legacyCopy(text) {
      var ok = false;
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(ta);
      try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      var sel = selectNum();
      if (!ok && sel) { try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
      return ok;
    }
    copy.addEventListener('click', function () {
      var text = num.textContent.trim();
      function done() { selectNum(); copy.textContent = 'Número copiado'; reset(2500); }
      function fallback() {
        if (legacyCopy(text)) { done(); return; }
        selectNum();
        copy.textContent = 'Número seleccionado: cópielo a mano';
        reset(6000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
    var actions = card.querySelector('button.btn');
    if (actions && actions.parentNode) actions.parentNode.insertBefore(copy, actions);
  }

  function init() {
    initThemeButton();
    initHero();
    initIndex();
    initSuccessCard();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
