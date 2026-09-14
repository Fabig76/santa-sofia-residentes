/* ============================================================
   Santa Sofía Club Residencial V.I.S — Vigilancia
   Portal de SOLO CONSULTA: ver quién vive en cada apto
   (nombres de residentes, menores, vehículos, parqueaderos, mascotas)
   NO muestra teléfonos, correos, cédulas ni datos del propietario
   ============================================================ */

// Token de acceso para vigilantes (solo lectura)
const VIGILANTES_TOKEN="Vq7pT3nL" + "wK9hBxY2" + "mC4fD8sR" + "5jN6vP1a";
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycby8fjAwe8y2AF06L1oOAIH8I7fA4JOIBVSnIvuculImafsEb6QPXjcq58na-BDd4Hirdg/exec';

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
  const parqueaderos = data.parqueaderos || [];
  const mascotas = data.mascotas || [];

  let html = `
    <div class="apto-header">
      <div class="num">Apartamento ${escapeHtml(apto)}</div>
      <div style="font-size:13px; color:var(--gris-med); margin-top:4px;">
        ${residentes.length + menores.length} persona(s) ·
        ${vehiculos.length} vehículo(s) ·
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
      <h3>🚗 Vehículos y motos<span class="contador">${vehiculos.length}</span></h3>
  `;

  if (vehiculos.length === 0) {
    html += emptyState('No hay vehículos registrados en este apartamento.');
  } else {
    html += vehiculos.map(v => {
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
