/* ============================================================
   Santa Sofía Club Residencial V.I.S — Administración
   Formulario privado para asignación de tags/llaveros
   ============================================================ */

// Token de acceso (debe coincidir con el token en Apps Script)
const ADMIN_TOKEN='GFxrMXXE9WAi_exItdb4uDoIjsItFjfJ';
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxAnuZ7t1EqLHp-HlHbqbCsYw6p7Ueezpy37YwzgGPK1mnfrCeENNiXhOH-1Bd_hbgZLg/exec';

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
const val = (s) => { const el = $(s); return el ? el.value.trim() : ''; };

let estado = {
  aptoData: null,  // datos del apartamento cargado
  placas: [],        // vehiculos + motos del apartamento
  placasAsignadas: new Set(),  // a qué placas se les entrega
};

// Helpers
function showAlert(target, msg, kind) {
  const el = $('#' + target);
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'alert alert-' + (kind || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function showIn(target, html) {
  const el = $('#' + target);
  if (html) { el.innerHTML = html; } else { el.innerHTML = ''; }
}

// Buscar apartamento
async function buscarApto() {
  showAlert('alert-admin', '', null);
  showIn('apto-resultado', '');
  $('#seccion-asignacion').style.display = 'none';
  $('#seccion-devolucion').style.display = 'none';

  const apto = val('#aptoBusqueda');
  if (!apto) {
    showAlert('alert-admin', '⚠️ Ingresa el N° de apartamento.', 'err');
    return;
  }

  const url = APPS_SCRIPT_URL + '?action=adminLookup&token=' + encodeURIComponent(ADMIN_TOKEN) + '&apto=' + encodeURIComponent(apto);
  $('#btnBuscarApto').disabled = true;
  $('#btnBuscarApto').textContent = 'Buscando...';

  try {
    const r = await fetch(url, { method: 'GET' });
    const j = await r.json();
    if (!j.ok) {
      showAlert('alert-admin', '❌ ' + (j.error || 'No se encontró el apartamento.'), 'err');
      return;
    }
    estado.aptoData = j.apto;
    estado.placas = j.placas || [];
    estado.placasAsignadas = new Set();
    renderAptoInfo();
    renderPlacas();
    $('#seccion-asignacion').style.display = '';
  } catch (err) {
    showAlert('alert-admin', '❌ Error de red: ' + err.message, 'err');
  } finally {
    $('#btnBuscarApto').disabled = false;
    $('#btnBuscarApto').textContent = '🔍 Buscar apartamento';
  }
}

function renderAptoInfo() {
  const r = estado.aptoData;
  const html = `
    <div class="info-grid">
      <div class="lbl">Apartamento:</div><div>${r.apto}</div>
      <div class="lbl">Titular:</div><div>${r.nombreProp || '—'}</div>
      <div class="lbl">Cédula:</div><div>${r.ccProp || '—'}</div>
      <div class="lbl">Correo:</div><div>${r.correoProp || '—'}</div>
      <div class="lbl">Celular:</div><div>${r.celProp || '—'}</div>
      <div class="lbl">N° Formulario:</div><div><strong>${r.numForm}</strong></div>
    </div>
  `;
  showIn('info-residente', html);
}

function renderPlacas() {
  if (estado.placas.length === 0) {
    showIn('placas-container', '<p style="padding:14px; background:#FFF7E6; border-left:4px solid #C9A227; border-radius:6px; color:#5A4500;">⚠️ Este apartamento no tiene vehículos ni motos registradas. Verifica con el residente que haya completado el formulario principal.</p>');
    return;
  }
  let html = '';
  estado.placas.forEach((p, i) => {
    const checked = estado.placasAsignadas.has(i);
    const cls = p.placa ? 'placa-row' : 'placa-row empty';
    html += `<label class="${cls}">
      <input type="checkbox" data-idx="${i}" ${checked ? 'checked' : ''}>
      <div class="placa-label">
        <div class="placa-nombre">${p.placa || '⚠️ SIN PLACA REGISTRADA'}</div>
        <div class="placa-tipo">${p.tipo}${p.color ? ' · ' + p.color : ''}${p.marca ? ' · ' + p.marca : ''}${p.modelo ? ' · ' + p.modelo : ''}</div>
      </div>
    </label>`;
  });
  showIn('placas-container', html);

  $$('#placas-container input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.idx);
      if (cb.checked) estado.placasAsignadas.add(idx);
      else estado.placasAsignadas.delete(idx);
    });
  });
}

// Registrar entrega
async function asignar() {
  showIn('asignar-resultado', '');
  const llaveros = parseInt(val('#llaverosCantidad') || '0', 10);
  const tags = parseInt(val('#tagsCantidad') || '0', 10);
  const obs = val('#entregaObs');

  if (llaveros === 0 && tags === 0 && estado.placasAsignadas.size === 0) {
    showIn('asignar-resultado', '<div class="alert alert-err">⚠️ Debe indicar al menos una cantidad de llaveros o tags, o seleccionar al menos una placa.</div>');
    return;
  }

  const payload = {
    token: ADMIN_TOKEN,
    action: 'asignarDispositivos',
    numForm: estado.aptoData.numForm,
    apto: estado.aptoData.apto,
    llaveros,
    tags,
    placas: Array.from(estado.placasAsignadas).map(i => estado.placas[i]),
    obs,
  };

  $('#btnAsignar').disabled = true;
  $('#btnAsignar').textContent = 'Registrando...';

  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) {
      showIn('asignar-resultado', '<div class="alert alert-err">❌ ' + (j.error || 'Error al registrar.') + '</div>');
      return;
    }
    showIn('asignar-resultado', '<div class="alert alert-ok">✅ Entrega registrada correctamente.</div>');
    // refrescar
    setTimeout(() => buscarApto(), 1500);
  } catch (err) {
    showIn('asignar-resultado', '<div class="alert alert-err">❌ Error de red: ' + err.message + '</div>');
  } finally {
    $('#btnAsignar').disabled = false;
    $('#btnAsignar').textContent = '✅ Registrar entrega';
  }
}

// Mostrar seccion de devolucion
async function mostrarDevolucion() {
  showIn('devolucion-resultado', '');
  // Necesitamos consultar los dispositivos asignados actualmente
  const url = APPS_SCRIPT_URL + '?action=adminLookup&token=' + encodeURIComponent(ADMIN_TOKEN) + '&apto=' + encodeURIComponent(estado.aptoData.apto);
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) {
      showAlert('alert-admin', '❌ ' + (j.error || 'Error'), 'err');
      return;
    }
    const disp = j.asignaciones || {};
    let html = '<div class="info-grid">';
    html += `<div class="lbl">Apartamento:</div><div>${estado.aptoData.apto}</div>`;
    html += `<div class="lbl">Llaveros asignados:</div><div>${disp.llaveros || 0}</div>`;
    html += `<div class="lbl">Tags asignados:</div><div>${disp.tags || 0}</div>`;
    html += `<div class="lbl">Placas asignadas:</div><div>${(disp.placas || []).join(', ') || '—'}</div>`;
    if (disp.ultimoRegistro) html += `<div class="lbl">Último registro:</div><div>${disp.ultimoRegistro}</div>`;
    if (disp.obs) html += `<div class="lbl">Observaciones:</div><div>${disp.obs}</div>`;
    html += '</div>';
    showIn('info-devolucion', html);

    // Dispositivos a devolver
    let dispHtml = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">';
    dispHtml += `<div class="field"><label>Llaveros a devolver</label><input type="number" id="devolverLlaveros" min="0" max="${disp.llaveros || 0}" value="${disp.llaveros || 0}"></div>`;
    dispHtml += `<div class="field"><label>Tags a devolver</label><input type="number" id="devolverTags" min="0" max="${disp.tags || 0}" value="${disp.tags || 0}"></div>`;
    dispHtml += '</div>';
    showIn('devolucion-dispositivos', dispHtml);

    $('#seccion-devolucion').style.display = '';
    $('#seccion-devolucion').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showAlert('alert-admin', '❌ Error: ' + err.message, 'err');
  }
}

async function confirmarDevolucion() {
  showIn('devolucion-resultado', '');
  const llaveros = parseInt(val('#devolverLlaveros') || '0', 10);
  const tags = parseInt(val('#devolverTags') || '0', 10);
  const obs = val('#devolucionObs');

  const payload = {
    token: ADMIN_TOKEN,
    action: 'devolverDispositivos',
    numForm: estado.aptoData.numForm,
    apto: estado.aptoData.apto,
    llaveros,
    tags,
    obs,
  };

  $('#btnConfirmarDevolucion').disabled = true;
  $('#btnConfirmarDevolucion').textContent = 'Procesando...';
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j.ok) {
      showIn('devolucion-resultado', '<div class="alert alert-err">❌ ' + (j.error || 'Error al registrar.') + '</div>');
      return;
    }
    showIn('devolucion-resultado', '<div class="alert alert-ok">✅ Devolución registrada correctamente.</div>');
    setTimeout(() => { $('#seccion-devolucion').style.display = 'none'; buscarApto(); }, 1500);
  } catch (err) {
    showIn('devolucion-resultado', '<div class="alert alert-err">❌ Error de red: ' + err.message + '</div>');
  } finally {
    $('#btnConfirmarDevolucion').disabled = false;
    $('#btnConfirmarDevolucion').textContent = '✅ Confirmar devolución';
  }
}

// Wire up
document.addEventListener('DOMContentLoaded', () => {
  $('#btnBuscarApto').addEventListener('click', buscarApto);
  $('#aptoBusqueda').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarApto();
  });
  $('#btnAsignar').addEventListener('click', asignar);
  $('#btnDevolucion').addEventListener('click', mostrarDevolucion);
  $('#btnConfirmarDevolucion').addEventListener('click', confirmarDevolucion);
});
