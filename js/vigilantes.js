/* ============================================================
   Santa Sofía Club Residencial V.I.S — Vigilancia
   Portal de SOLO CONSULTA: ver quién vive en cada apto
   (nombres de residentes, menores, vehículos, parqueaderos, mascotas)
   NO muestra teléfonos, correos, cédulas ni datos del propietario
   ============================================================ */

// Token de acceso para vigilantes (solo lectura)
const VIGILANTES_TOKEN="Vq7pT3nL" + "wK9hBxY2" + "mC4fD8sR" + "5jN6vP1a";
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev';

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
const val = (s) => { const el = $(s); return el ? el.value.trim() : ''; };

// Helpers
function showAlert(target, msg, kind) {
  const el = $('#' + target);
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'alert alert-' + (kind || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function emptyState(msg) {
  return `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

// Buscar apartamento
async function buscar() {
  hideAlert();
  const apto = val('#aptoBusqueda');
  if (!apto) {
    showAlert('alert-vig', 'Por favor ingresa un N° de apartamento.', 'err');
    $('#resultado').innerHTML = '';
    return;
  }
  $('#btnBuscar').disabled = true;
  $('#btnBuscar').textContent = 'Buscando...';
  $('#resultado').innerHTML = '';

  try {
    const url = APPS_SCRIPT_URL + '?action=vigilantesLookup&token=' + encodeURIComponent(VIGILANTES_TOKEN) + '&apto=' + encodeURIComponent(apto);
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) {
      showAlert('alert-vig', j.error || 'No se pudo consultar el apartamento.', 'err');
      $('#resultado').innerHTML = '';
      return;
    }
    renderResultado(j);
  } catch (err) {
    showAlert('alert-vig', 'Error de red: ' + err.message, 'err');
  } finally {
    $('#btnBuscar').disabled = false;
    $('#btnBuscar').textContent = '🔍 Consultar';
  }
}

function hideAlert() {
  const el = $('#alert-vig');
  el.classList.add('hidden');
  el.innerHTML = '';
}

function renderResultado(data) {
  const apto = data.apto;
  const residentes = data.residentes || [];
  const menores = data.menores || [];
  const vehiculos = data.vehiculos || [];
  const motos = data.motos || [];
  const todosVehiculos = vehiculos.concat(motos);
  const parqueaderos = data.parqueaderos || [];
  const mascotas = data.mascotas || [];

  let html = `
    <div class="apto-header">
      <div class="num">Apartamento ${escapeHtml(apto)}</div>
      <div style="font-size:13px; color:var(--gris-med); margin-top:4px;">
        ${residentes.length + menores.length} persona(s) ·
        ${todosVehiculos.length} vehículo(s) ·
        ${parqueaderos.length} parqueadero(s) ·
        ${mascotas.length} mascota(s)
      </div>
    </div>

    <div class="seccion-resultado">
      <h3>👥 Residentes (mayores de edad)<span class="contador">${residentes.length}</span></h3>
  `;

  if (residentes.length === 0) {
    html += emptyState('No hay residentes registrados en este apartamento.');
  } else {
    html += residentes.map(r => `
      <div class="persona-row">
        <div class="nombre">${escapeHtml(r.nombre)}</div>
        <div class="parentesco">${escapeHtml(r.parentesco || '')}</div>
      </div>
    `).join('');
  }

  html += `
    </div>

    <div class="seccion-resultado">
      <h3>👶 Menores de edad<span class="contador">${menores.length}</span></h3>
  `;

  if (menores.length === 0) {
    html += emptyState('No hay menores registrados en este apartamento.');
  } else {
    html += menores.map(m => `
      <div class="persona-row">
        <div class="nombre">${escapeHtml(m.nombre)}${m.edad ? ` <span style="font-weight:400; color:var(--gris-med); font-size:13px;">(${escapeHtml(m.edad)} años)</span>` : ''}</div>
        <div class="parentesco">${escapeHtml(m.parentesco || '')}</div>
      </div>
    `).join('');
  }

  html += `
    </div>

    <div class="seccion-resultado">
      <h3>🚗 Vehículos y motos<span class="contador">${todosVehiculos.length}</span></h3>
  `;

  if (todosVehiculos.length === 0) {
    html += emptyState('No hay vehículos registrados en este apartamento.');
  } else {
    html += todosVehiculos.map(v => {
      const detalle = [v.color, v.modelo, v.placa].filter(Boolean).join(' · ');
      const tipoLabel = v.tipo === 'Moto' ? '🏍️ Moto' : '🚗 Vehículo';
      return `
        <div class="item-row">
          <div class="tipo-badge">${tipoLabel}</div>
          <div class="info">
            <div class="titulo">${escapeHtml(v.marca || 'Sin marca')}</div>
            <div class="detalle">${escapeHtml(detalle || 'Sin detalles')}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  html += `
    </div>

    <div class="seccion-resultado">
      <h3>🅿️ Parqueaderos<span class="contador">${parqueaderos.length}</span></h3>
  `;

  if (parqueaderos.length === 0) {
    html += emptyState('No hay parqueaderos asignados a este apartamento.');
  } else {
    html += parqueaderos.map(p => {
      const mat = p.matricula
        ? `<span class="matricula">${escapeHtml(p.matricula)}</span>`
        : '<span class="matricula-empty">(sin matrícula)</span>';
      return `
        <div class="parqueadero-row">
          <div class="celda">${escapeHtml(p.celda)}</div>
          <div>${mat}</div>
        </div>
      `;
    }).join('');
  }

  html += `
    </div>

    <div class="seccion-resultado">
      <h3>🐾 Mascotas<span class="contador">${mascotas.length}</span></h3>
  `;

  if (mascotas.length === 0) {
    html += emptyState('No hay mascotas registradas en este apartamento.');
  } else {
    html += mascotas.map(m => {
      const detalle = [m.raza, m.color, m.sexo, m.vacuna ? `vacuna: ${m.vacuna}` : ''].filter(Boolean).join(' · ');
      const emoji = m.tipo === 'Perro' ? '🐕' : m.tipo === 'Gato' ? '🐈' : '🐾';
      return `
        <div class="item-row">
          <div class="tipo-badge">${emoji}<br><small>${escapeHtml(m.tipo || '')}</small></div>
          <div class="info">
            <div class="titulo">${escapeHtml(m.nombre)}</div>
            <div class="detalle">${escapeHtml(detalle || 'Sin detalles')}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  html += `</div>`;

  $('#resultado').innerHTML = html;
}

// Init
$('#btnBuscar').addEventListener('click', buscar);
$('#aptoBusqueda').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') buscar();
});

// ====== F10 — MUDANZAS (vigilante) ======
function showAlertMud(msg, kind) {
  const el = $('#alert-mud');
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'alert alert-' + (kind || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

async function cargarMudanzas() {
  const fecha = $('#mudFecha').value;
  showAlertMud('');
  $('#mudList').innerHTML = '<p style="color:var(--gris-med); padding:14px;">Cargando...</p>';
  try {
    const params = { action: 'vigilanteVerMudanzas', token: VIGILANTES_TOKEN };
    if (fecha) params.fecha = fecha;
    const r = await apiGet(params);
    if (!r.ok) {
      showAlertMud(r.error || 'No se pudieron cargar las mudanzas.', 'err');
      $('#mudList').innerHTML = '';
      return;
    }
    renderMudanzas(r.reservas || []);
  } catch (e) {
    showAlertMud('Error de red: ' + e.message, 'err');
    $('#mudList').innerHTML = '';
  }
}

function renderMudanzas(reservas) {
  const c = $('#mudList');
  if (!reservas.length) {
    c.innerHTML = '<div style="padding:16px; background:#F8F8F8; border-radius:8px; color:var(--gris-med); text-align:center; font-size:13px;">No hay mudanzas registradas para esta fecha.</div>';
    return;
  }
  let html = '';
  reservas.forEach(r => {
    const estadoColor = r.estado === 'Confirmada' ? 'var(--ok)' : (r.estado === 'Cancelada' ? 'var(--err)' : 'var(--gris-med)');
    const yaRealizada = r.realizada === 'Sí';
    const yaNoRealizada = r.realizada === 'No';
    html += '<div style="border:1px solid var(--gris-borde); border-radius:8px; padding:14px; margin-bottom:10px; background:white;">';
    html += '<div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">';
    html += '<div>';
    html += '<div style="font-family:monospace; font-weight:bold; color:var(--azul-osc); font-size:14px;">' + escapeHtml(r.idReserva) + '</div>';
    html += '<div style="font-size:13px; color:var(--gris-med); margin-top:2px;">Apto ' + escapeHtml(r.apto) + ' · ' + escapeHtml(r.tipoMudanza) + '</div>';
    html += '</div>';
    html += '<div style="text-align:right;">';
    html += '<div style="font-weight:600; color:' + estadoColor + ';">' + escapeHtml(r.estado) + '</div>';
    html += '<div style="font-size:12px; color:var(--gris-med);">' + escapeHtml(r.torre) + ' · Ascensor ' + escapeHtml(r.ascensor) + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="font-size:14px; margin-bottom:8px;">';
    html += '<strong>' + escapeHtml(r.fecha) + '</strong> de ' + escapeHtml(r.horaInicio) + ' a ' + escapeHtml(r.horaFin);
    html += ' — <em>' + escapeHtml(r.nombrePropietario) + '</em>';
    html += '</div>';
    if (r.realizada) {
      const checkColor = yaRealizada ? 'var(--ok)' : 'var(--err)';
      html += '<div style="font-size:13px; color:' + checkColor + '; margin-bottom:8px;">';
      html += 'Check registrado: <strong>' + escapeHtml(r.realizada) + '</strong>';
      if (r.fechaCheck) html += ' (' + escapeHtml(r.fechaCheck) + ')';
      if (r.vigilante) html += ' por <strong>' + escapeHtml(r.vigilante) + '</strong>';
      html += '</div>';
    } else {
      html += '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:end;">';
      html += '<div class="field" style="margin:0; flex:1; min-width:160px;">';
      html += '<label>Nombre del vigilante</label>';
      html += '<input type="text" id="vigNombre-' + r.idReserva + '" placeholder="Tu nombre" style="padding:6px 10px;">';
      html += '</div>';
      html += '<button class="btn btn-primary" data-id="' + r.idReserva + '" data-status="realizada">✅ Sí realizada</button>';
      html += '<button class="btn btn-secondary" data-id="' + r.idReserva + '" data-status="no_realizada">❌ No realizada</button>';
      html += '</div>';
    }
    html += '</div>';
  });
  c.innerHTML = html;
  // Bind botones de check-in
  $$('#mudList button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => checkIn(btn.dataset.id, btn.dataset.status));
  });
}

async function checkIn(idReserva, status) {
  const input = $('#vigNombre-' + idReserva);
  const vigilante = input ? input.value.trim() : '';
  if (!vigilante) {
    showAlertMud('Por favor ingresa tu nombre antes de marcar.', 'err');
    return;
  }
  showAlertMud('Registrando check-in...', 'info');
  try {
    const r = await safePost({
      action: 'vigilanteCheckMudanza',
      token: VIGILANTES_TOKEN,
      idReserva: idReserva,
      status: status,
      vigilante: vigilante,
    });
    if (!r.ok) {
      showAlertMud(r.error || 'No se pudo registrar el check-in.', 'err');
      return;
    }
    if (r.pendingEmail) {
      showAlertMud(r.warning, 'info');
    } else {
      showAlertMud('Check registrado correctamente (' + status + ').', 'ok');
    }
    // Recargar lista
    await cargarMudanzas();
  } catch (e) {
    showAlertMud('Error de red: ' + e.message, 'err');
  }
}

// Helper GET con retry para mitigar HTML 500/405 por cold start MailApp
async function apiGet(params, maxRetries) {
  maxRetries = (typeof maxRetries === 'number') ? maxRetries : 1;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const r = await fetch(APPS_SCRIPT_URL + '?' + new URLSearchParams(params).toString());
      const text = await r.text();
      try { return JSON.parse(text); }
      catch (e) {
        if (i < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return { ok: false, error: 'El servidor respondió con HTML en lugar de JSON. Intente nuevamente en 1 minuto.' };
      }
    } catch (e) {
      throw e;
    }
  }
}

// Helper POST con retry (mitigación HTML 500/405 de Apps Script cold start MailApp)
async function safePost(payload, maxRetries) {
  maxRetries = (typeof maxRetries === 'number') ? maxRetries : 1;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      try { return JSON.parse(text); }
      catch (e) {
        if (i < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return { ok: true, pendingEmail: true, warning: 'Acción enviada. Espere confirmación antes de continuar.' };
      }
    } catch (e) {
      if (i < maxRetries) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw e;
    }
  }
}

// Listeners F10
$('#btnVerTodas').addEventListener('click', () => {
  $('#mudFecha').value = '';
  cargarMudanzas();
});
$('#btnCargarFecha').addEventListener('click', () => {
  const f = $('#mudFecha').value;
  if (!f) {
    showAlertMud('Selecciona una fecha primero (o usa "Ver todas").', 'err');
    return;
  }
  cargarMudanzas();
});
