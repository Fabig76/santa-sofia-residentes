/* ============================================================
   Santa Sofía Club Residencial V.I.S — Administración v1.8
   Formulario privado para asignación de tags y llaveros individuales
   ============================================================ */

const ADMIN_TOKEN = 'GFxrMX' + 'XE9WAi_' + 'exItdb4u' + 'DoIjsItF' + 'jfJ';
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev';

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));
const val = (s) => { const el = $(s); return el ? el.value.trim() : ''; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let estado = {
  aptoData: null,         // datos del apartamento del adminLookup.apto
  placas: [],              // vehiculos + motos con tag actual
  llavesActuales: '',     // texto "K-001, K-002, ..."
  historial: [],           // eventos de la hoja Entregas
};

function showAlert(target, msg, kind) {
  const el = $('#' + target);
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'alert alert-' + (kind || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

function showIn(target, html) {
  const el = $('#' + target);
  if (!el) return;
  el.innerHTML = html || '';
}

function showMsg(target, msg, kind) {
  const el = $('#' + target);
  if (!el) return;
  el.className = 'msg ' + (kind || '');
  el.textContent = msg || '';
}

function hideAll() {
  $('#seccion-resumen').style.display = 'none';
  $('#seccion-tags').style.display = 'none';
  $('#seccion-llaves').style.display = 'none';
  $('#seccion-historial').style.display = 'none';
}

function showSection(id) {
  $('#' + id).style.display = '';
}

// ====== BUSCAR APTO ======
async function buscarApto() {
  showAlert('alert-admin', '', null);
  hideAll();

  const apto = val('#aptoBusqueda');
  if (!apto) {
    showAlert('alert-admin', '⚠️ Ingresa el N° de apartamento.', 'err');
    return;
  }

  const url = APPS_SCRIPT_URL + '?action=adminLookup&token=' + encodeURIComponent(ADMIN_TOKEN) + '&apto=' + encodeURIComponent(apto);
  const btn = $('#btnBuscarApto');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.innerHTML = 'Buscando... <span class="loading-mini"></span>';

  try {
    const r = await fetch(url, { method: 'GET' });
    const j = await r.json();
    if (!j.ok) {
      showAlert('alert-admin', '❌ ' + (j.error || 'No se encontró el apartamento.'), 'err');
      return;
    }
    estado.aptoData = j.apto;
    estado.placas = j.placas || [];
    estado.llavesActuales = (j.llavesActuales && j.llavesActuales.llaveros) || '';
    estado.historial = j.historial || [];

    renderResumen();
    renderTags();
    renderLlaves();
    renderHistorial();

    showSection('seccion-resumen');
    showSection('seccion-tags');
    showSection('seccion-llaves');
    showSection('seccion-historial');
  } catch (err) {
    showAlert('alert-admin', '❌ Error de red: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// ====== RENDER RESUMEN ======
function renderResumen() {
  const r = estado.aptoData;
  $('#apto-num').textContent = '#' + r.apto;

  const residentes = (r.residentes || []).filter(x => x && x.nombre).map(x => `${esc(x.nombre)} (${esc(x.parent || '')})`);
  const mascotas = (r.mascotas || []).filter(x => x && x.nombre).map(x => `${esc(x.tipo || '')} ${esc(x.nombre)} (${esc(x.raza || '')})`);
  const parqueaderos = [];
  if (r.parq1Celda) parqueaderos.push(`${esc(r.parq1Celda)} → ${esc(r.parq1Mat || '')}`);
  if (r.parq2Celda) parqueaderos.push(`${esc(r.parq2Celda)} → ${esc(r.parq2Mat || '')}`);

  const html = `
    <div class="info-grid">
      <div class="lbl">Titular:</div><div class="val"><strong>${esc(r.nombreProp || '—')}</strong></div>
      <div class="lbl">C.C.:</div><div class="val">${esc(r.ccProp || '—')}</div>
      <div class="lbl">Correo:</div><div class="val">${esc(r.correoProp || '—')}</div>
      <div class="lbl">Celular:</div><div class="val">${esc(r.celProp || '—')}</div>
      <div class="lbl">Tel. fijo:</div><div class="val">${esc(r.telFijoProp || '—')}</div>
      <div class="lbl">Estado:</div><div class="val">${esc(r.diligencia || '—')}</div>
      <div class="lbl">N° Formulario:</div><div class="val"><strong>${esc(r.numForm)}</strong></div>
      <div class="lbl">Matrícula apto:</div><div class="val">${esc(r.matriculaApto || '—')}</div>
    </div>
    ${residentes.length ? `<div class="resumen-card"><strong>👥 Residentes (${residentes.length}):</strong> ${residentes.join(' · ')}</div>` : ''}
    ${mascotas.length ? `<div class="resumen-card"><strong>🐾 Mascotas (${mascotas.length}):</strong> ${mascotas.join(' · ')}</div>` : ''}
    ${parqueaderos.length ? `<div class="resumen-card"><strong>🚶 Parqueaderos (${parqueaderos.length}):</strong> ${parqueaderos.join(' · ')}</div>` : ''}
  `;
  showIn('resumen-content', html);
}

// ====== RENDER TAGS VEHICULARES ======
function renderTags() {
  // vehiculos + motos son del adminLookup.placas (cada uno trae tag actual)
  const vehiculos = estado.placas;
  const conPlaca = vehiculos.filter(v => v.placa);
  $('#vehiculos-count').textContent = conPlaca.length;

  if (conPlaca.length === 0) {
    showIn('vehiculos-container', '<div class="help-box warn">⚠️ Este apartamento no tiene vehículos registrados. Verifica que el residente haya completado el formulario principal con sus vehículos.</div>');
    $('#btnGuardarTags').disabled = true;
    return;
  }
  $('#btnGuardarTags').disabled = false;

  let html = '';
  conPlaca.forEach((v, i) => {
    const icon = v.tipo === 'Moto' ? '🏍️' : '🚗';
    const tagActual = v.tag || '';
    const cls = tagActual ? 'vehiculo-row vehiculo-asignado' : 'vehiculo-row vehiculo-sin-asignar';
    const detalle = [v.color, v.modelo, v.marca].filter(Boolean).join(' · ');
    html += `
      <div class="${cls}" data-placa="${esc(v.placa)}" data-tipo="${esc(v.tipo)}" data-idx="${i}">
        <div class="vehiculo-icon">${icon}</div>
        <div class="vehiculo-info">
          <div class="vehiculo-placa">${esc(v.placa)}</div>
          <div class="vehiculo-detalle">${esc(detalle)}</div>
        </div>
        <input type="text" class="vehiculo-tag-input" placeholder="Sin asignar" value="${esc(tagActual)}">
        <div class="vehiculo-tag-actual">${tagActual ? '✓ Asignado' : '○ Pendiente'}</div>
      </div>
    `;
  });
  showIn('vehiculos-container', html);
}

// ====== RENDER LLAVEROS ======
function renderLlaves() {
  const llaves = estado.llavesActuales || '';
  $('#llaveros-textarea').value = llaves;
  const count = llaves ? llaves.split(',').map(s => s.trim()).filter(Boolean).length : 0;
  $('#llaves-count').textContent = count;
  $('#llaveros-historial').textContent = count > 0 ? `Última actualización: ${count} llavero(s) asignado(s).` : 'Sin llaveros asignados actualmente.';
}

// ====== RENDER HISTORIAL ======
function renderHistorial() {
  const hist = estado.historial || [];
  $('#historial-count').textContent = hist.length;
  if (hist.length === 0) {
    showIn('historial-container', '<div style="color:var(--gris-med); font-size:13px; padding:10px 0;">Sin eventos registrados para este apto.</div>');
    return;
  }
  let html = '';
  hist.forEach(ev => {
    const tipoClass = (ev.tipo || '').toLowerCase().includes('tag') ? 'tag' :
                       (ev.tipo || '').toLowerCase().includes('devol') ? 'dev' : '';
    const fecha = ev.fecha ? new Date(ev.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '?';
    const detalle = [];
    if (ev.llaveros) detalle.push(`🔑 ${esc(ev.llaveros)}`);
    if (ev.tags) detalle.push(`🏷️ ${esc(ev.tags)}`);
    if (ev.obs) detalle.push(`<em>${esc(ev.obs)}</em>`);
    html += `
      <div class="historico-item">
        <span class="fecha">${esc(fecha)}</span>
        <span class="tipo ${tipoClass}">${esc(ev.tipo || '?')}</span>
        ${detalle.join(' · ')}
      </div>
    `;
  });
  showIn('historial-container', html);
}

// ====== GUARDAR LLAVEROS ======
async function guardarLlaves() {
  const llavesTxt = val('#llaveros-textarea');
  const obs = '';  // opcional, podríamos añadir un campo de obs

  showMsg('llaveros-msg', 'Guardando...', '');

  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        token: ADMIN_TOKEN,
        action: 'actualizarEntrega',
        numForm: estado.aptoData.numForm,
        apto: estado.aptoData.apto,
        tipo: 'llaveros_asignar',
        llaveros: llavesTxt,
        obs,
      }),
    });
    const j = await r.json();
    if (!j.ok) {
      let msg = j.error || 'Error al guardar.';
      if (j.duplicados && j.duplicados.length) {
        msg += ' ' + j.duplicados.map(d => `${d.llavero} (apto ${d.asignadoA})`).join(', ');
      }
      showMsg('llaveros-msg', '❌ ' + msg, 'err');
      return;
    }
    showMsg('llaveros-msg', '✅ ' + (j.message || 'Llaveros guardados.'), 'ok');
    setTimeout(() => buscarApto(), 1500);
  } catch (err) {
    showMsg('llaveros-msg', '❌ Error de red: ' + err.message, 'err');
  }
}

// ====== DEVOLUCIÓN DE LLAVEROS ======
async function devolverLlaves() {
  if (!confirm('¿Confirmas la devolución TOTAL de llaveros de este apto?\n\nEsto marca todos los llaveros como devueltos en el historial.')) return;

  showMsg('llaveros-msg', 'Procesando...', '');

  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        token: ADMIN_TOKEN,
        action: 'actualizarEntrega',
        numForm: estado.aptoData.numForm,
        apto: estado.aptoData.apto,
        tipo: 'llaveros_devolver',
        obs: 'Devolución total desde admin',
      }),
    });
    const j = await r.json();
    if (!j.ok) {
      showMsg('llaveros-msg', '❌ ' + (j.error || 'Error al procesar.'), 'err');
      return;
    }
    showMsg('llaveros-msg', '✅ Devolución registrada.', 'ok');
    setTimeout(() => buscarApto(), 1500);
  } catch (err) {
    showMsg('llaveros-msg', '❌ Error de red: ' + err.message, 'err');
  }
}

// ====== GUARDAR TAGS ======
async function guardarTags() {
  const tagsArr = [];
  $$('#vehiculos-container .vehiculo-row').forEach(row => {
    const placa = row.dataset.placa;
    const tipo = row.dataset.tipo;
    const input = row.querySelector('.vehiculo-tag-input');
    const tag = input ? input.value.trim() : '';
    // Calcular índice según tipo (1-4)
    // vehiculos = posiciones 0,1; motos = posiciones 2,3 (en el array del Sheet)
    const allVehs = estado.placas.filter(v => v.placa);
    const idxInAll = allVehs.findIndex(v => v.placa === placa) + 1;
    tagsArr.push({ placa, tag, tipo, index: idxInAll });
  });

  if (tagsArr.length === 0) {
    showMsg('tags-msg', '⚠️ No hay vehículos para asignar tags.', 'err');
    return;
  }

  showMsg('tags-msg', 'Guardando...', '');

  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        token: ADMIN_TOKEN,
        action: 'actualizarEntrega',
        numForm: estado.aptoData.numForm,
        apto: estado.aptoData.apto,
        tipo: 'tag_asignar',
        tags: tagsArr,
      }),
    });
    const j = await r.json();
    if (!j.ok) {
      let msg = j.error || 'Error al guardar.';
      if (j.duplicados && j.duplicados.length) {
        msg += ' ' + j.duplicados.map(d => `${d.tag} ya en ${d.asignadoA} (apto ${d.aptoDelConflicto})`).join(', ');
      }
      showMsg('tags-msg', '❌ ' + msg, 'err');
      return;
    }
    showMsg('tags-msg', '✅ ' + (j.message || 'Tags guardados.'), 'ok');
    setTimeout(() => buscarApto(), 1500);
  } catch (err) {
    showMsg('tags-msg', '❌ Error de red: ' + err.message, 'err');
  }
}

// ====== DEVOLUCIÓN DE TAG (individual) ======
async function devolverTagIndividual() {
  const sel = $$('#vehiculos-container .vehiculo-row').find(r => r.querySelector('.vehiculo-tag-input')?.value.trim());
  if (!sel) {
    showMsg('tags-msg', '⚠️ No hay ningún tag asignado actualmente para devolver.', 'err');
    return;
  }
  const placa = sel.dataset.placa;
  const tagActual = sel.querySelector('.vehiculo-tag-input').value.trim();
  if (!confirm(`¿Confirmas la devolución del tag "${tagActual}" del vehículo ${placa}?\n\nEsto libera el tag para otro vehículo.`)) return;

  showMsg('tags-msg', 'Procesando...', '');

  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        token: ADMIN_TOKEN,
        action: 'actualizarEntrega',
        numForm: estado.aptoData.numForm,
        apto: estado.aptoData.apto,
        tipo: 'tag_devolver',
        placa,
      }),
    });
    const j = await r.json();
    if (!j.ok) {
      showMsg('tags-msg', '❌ ' + (j.error || 'Error al procesar.'), 'err');
      return;
    }
    showMsg('tags-msg', '✅ ' + (j.message || 'Tag devuelto.'), 'ok');
    setTimeout(() => buscarApto(), 1500);
  } catch (err) {
    showMsg('tags-msg', '❌ Error de red: ' + err.message, 'err');
  }
}

// ====== WIRE UP ======
document.addEventListener('DOMContentLoaded', () => {
  $('#btnBuscarApto').addEventListener('click', buscarApto);
  $('#aptoBusqueda').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarApto();
  });
  $('#btnGuardarLlaves').addEventListener('click', guardarLlaves);
  $('#btnDevolverLlaves').addEventListener('click', devolverLlaves);
  $('#btnGuardarTags').addEventListener('click', guardarTags);
  $('#btnDevolverTags').addEventListener('click', devolverTagIndividual);
});