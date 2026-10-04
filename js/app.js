/* ============================================================
   Santa Sofía Club Residencial V.I.S — Lógica del formulario público
   Cambios v2 (7-Sep-2026):
   - Nuevos campos: matriculaApto, parq1Celda, parq1Mat, parq2Celda, parq2Mat
   - Lookup automático de matrículas desde el Sheet matrículas Santa Sofía
   - Avisos visuales (ok/warn/err) según resultado del lookup
   - Checkbox requiereRevision + textarea observaciones
   ============================================================ */

// URL del Web App de Google Apps Script (se pegará después del despliegue manual en santasofia.clubresidencial@gmail.com)
const APPS_SCRIPT_URL = window.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev';

// Constantes de UI
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

// ---------- Estado global ----------
const state = {
  mode: 'create',           // 'create' | 'edit'
  editLookup: null,         // datos previos cuando se carga una fila
  numForm: '',              // se asigna al crear, viene dado al editar
  submitting: false,
};

// ---------- Helpers ----------
function val(field) {
  const el = $(field);
  return el ? el.value.trim() : '';
}
function setVal(field, v) {
  const el = $(field);
  if (el) el.value = v == null ? '' : v;
}
function checked(name) {
  return $(`[name="${name}"]`) ? $(`[name="${name}"]`).checked : false;
}
function setChecked(name, v) {
  const el = $(`[name="${name}"]`);
  if (el) el.checked = !!v;
}
function showError(field, msg) {
  const wrap = $(field).closest('.field');
  if (!wrap) return;
  wrap.classList.add('has-error');
  const errEl = wrap.querySelector('.err-msg');
  if (errEl && msg) errEl.textContent = msg;
}
function clearError(field) {
  const wrap = $(field).closest('.field');
  if (wrap) wrap.classList.remove('has-error');
}
function clearAllErrors() { $$('.field.has-error').forEach(f => f.classList.remove('has-error')); }

function setFieldManualRequired(selector, required) {
  const f = $(selector);
  if (!f) return;
  if (required) f.setAttribute('data-required-manual', '1');
  else f.removeAttribute('data-required-manual');
}

// Construir la clave de lookup de parqueadero combinando tipo + celda
function getParqLookupKey(n) {
  const tipo = val('#parq' + n + 'Tipo');
  const celda = val('#parq' + n + 'Celda');
  if (!celda) return '';
  // Si el usuario ya escribio "Moto 60" o "Carro 60" en el campo, respetarlo
  const trimmed = String(celda).trim();
  if (/^(moto|carro)\s/i.test(trimmed)) return trimmed;
  // Si no, anteponer el tipo del selector si esta seleccionado
  if (tipo) return tipo + ' ' + trimmed;
  return trimmed;
}

function isFieldManualRequired(selector) {
  const f = $(selector);
  return !!(f && f.getAttribute('data-required-manual') === '1');
}
function markReviewBecauseManual(text) {
  const cb = $('[name="requiereRevision"]');
  if (cb) cb.checked = true;
  const obs = $('#observMatriculas');
  if (obs && text && !obs.value.includes(text)) {
    obs.value = (obs.value ? obs.value + ' | ' : '') + text;
  }
  toggleObservMatriculas();
}

function setRadio(name, value) {
  const els = $$(`[name="${name}"]`);
  els.forEach(el => { if (el.value === value) el.checked = true; });
}
function getRadio(name) {
  const el = $(`[name="${name}"]:checked`);
  return el ? el.value : '';
}

// ---------- Toggle secciones (plegables) ----------
function toggleSection(sec) {
  sec.classList.toggle('collapsed');
}
document.addEventListener('click', (e) => {
  if (e.target.closest('.section-head')) {
    const sec = e.target.closest('.section');
    if (sec) toggleSection(sec);
  }
});

// ---------- Switch de modo (CREAR / EDITAR) ----------
function setMode(mode) {
  state.mode = mode;
  $$('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  $('#view-create').classList.toggle('hidden', mode !== 'create');
  $('#view-edit').classList.toggle('hidden', mode !== 'edit');
  $('#view-mudanzas').classList.toggle('hidden', mode !== 'mudanzas');
  // Limpiar avisos al cambiar modo
  hideAlert('alert-edit');
  if (mode === 'create') {
    resetForm();
    // Sección 1 (encabezado) abierta por defecto
    $$('.section').forEach((s, i) => s.classList.toggle('collapsed', i !== 0 && i !== 1));
  } else if (mode === 'mudanzas') {
    M.reset();
  }
}
$$('.mode-tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));

// ============================================================
// MODO EDICIÓN: BUSCAR REGISTRO POR N° FORMULARIO + N° APTO
// ============================================================
async function buscarRegistro() {
  hideAlert('alert-edit');
  const numForm = val('#lookupNumForm');
  const apto    = val('#lookupApto');
  if (!numForm) { showAlert('alert-edit', 'Ingresa tu N° de formulario.', 'err'); return; }
  if (!apto)    { showAlert('alert-edit', 'Ingresa el N° de apartamento.', 'err'); return; }
  if (!APPS_SCRIPT_URL) {
    showAlert('alert-edit', 'El formulario aún no está conectado al servidor (falta URL del Apps Script). Avisa a la administración.', 'err');
    return;
  }

  $('#btnBuscar').disabled = true;
  $('#btnBuscar').textContent = 'Buscando...';

  try {
    const url = APPS_SCRIPT_URL + '?action=lookup&numForm=' + encodeURIComponent(numForm) + '&apto=' + encodeURIComponent(apto);
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await resp.json();
    if (!data.ok) {
      showAlert('alert-edit', data.error || 'No se encontró el registro.', 'err');
      return;
    }
    state.editLookup = data.row;
    state.numForm = data.row.numForm;
    poblarFormulario(data.row);
    $('#view-edit').classList.add('hidden');
    // FIX: #form-card está anidado dentro de #view-create. Al buscar desde la pestaña
    // "Editar mi registro", setMode('edit') ocultó #view-create. Hay que volver a
    // mostrarlo para que el form sea visible.
    $('#view-create').classList.remove('hidden');
    $('#form-card').classList.remove('hidden');
    showAlert('alert-create', 'Registro cargado. Modifica los campos que necesites y haz clic en "Guardar cambios".', 'info');
    // Marca el formulario como "modo edición"
    state.mode = 'edit';
    // Resalta el indicador de modo
    $('#editIndicator').classList.remove('hidden');
  } catch (err) {
    showAlert('alert-edit', 'Error al buscar: ' + err.message, 'err');
  } finally {
    $('#btnBuscar').disabled = false;
    $('#btnBuscar').textContent = '🔍 Buscar mi registro';
  }
}
$('#btnBuscar').addEventListener('click', buscarRegistro);

// ============================================================
// POBLAR FORMULARIO (modo edición)
// ============================================================
function poblarFormulario(r) {
  setVal('#numFormDisplay', r.numForm);
  setVal('#apto', r.apto);
  setRadio('diligencia', r.diligencia);
  setVal('#nombreProp', r.nombreProp);
  setVal('#ccProp', r.ccProp);
  setVal('#correoProp', r.correoProp);
  setVal('#celProp', r.celProp);
  setVal('#telFijoProp', r.telFijoProp);
  // v2 — Parqueaderos y matrículas
  setVal('#parq1Celda', r.parq1Celda);
  if (r.parq1Celda) {
    const m = String(r.parq1Celda).trim().match(/^(moto|carro)\s/i);
    if (m) { const el = $('#parq1Tipo'); if (el) el.value = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(); }
  }
  setVal('#parq1Mat', r.parq1Mat);
  setVal('#parq2Celda', r.parq2Celda);
  if (r.parq2Celda) {
    const m = String(r.parq2Celda).trim().match(/^(moto|carro)\s/i);
    if (m) { const el = $('#parq2Tipo'); if (el) el.value = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(); }
  }
  setVal('#parq2Mat', r.parq2Mat);
  setVal('#matriculaApto', r.matriculaApto);
  setChecked('requiereRevision', r.requiereRevision === 'Sí');
  setVal('#observMatriculas', r.observMatriculas);
  // Mostrar/ocultar textarea según checkbox
  const wrapObs = $('#observMatriculas-wrap');
  if (wrapObs) wrapObs.style.display = r.requiereRevision === 'Sí' ? '' : 'none';
  setVal('#nombreArr', r.nombreArr);
  setVal('#ccArr', r.ccArr);
  setVal('#correArr', r.correoArr);
  setVal('#celArr', r.celArr);
  setVal('#parqTer1Parq', r.parqTer1Parq);
  setVal('#parqTer1Tipo', r.parqTer1Tipo);
  setVal('#parqTer1Placa', r.parqTer1Placa);
  setVal('#parqTer1Nom', r.parqTer1Nom);
  setVal('#parqTer1Apto', r.parqTer1Apto);
  setVal('#parqTer1Cel', r.parqTer1Cel);
  setVal('#parqTer2Parq', r.parqTer2Parq);
  setVal('#parqTer2Tipo', r.parqTer2Tipo);
  setVal('#parqTer2Placa', r.parqTer2Placa);
  setVal('#parqTer2Nom', r.parqTer2Nom);
  setVal('#parqTer2Apto', r.parqTer2Apto);
  setVal('#parqTer2Cel', r.parqTer2Cel);
  setVal('#inmobRazon', r.inmobRazon);
  setVal('#inmobNit', r.inmobNit);
  setVal('#inmobContacto', r.inmobContacto);
  setVal('#inmobTel', r.inmobTel);
  setVal('#inmobCorreo', r.inmobCorreo);

  // Residentes (4)
  (r.residentes || []).forEach((res, i) => {
    const n = i + 1;
    setVal(`#r${n}Nombre`, res.nombre);
    setVal(`#r${n}CC`, res.cc);
    setVal(`#r${n}Correo`, res.correo);
    setVal(`#r${n}Cel`, res.cel);
    setVal(`#r${n}Parent`, res.parent);
  });
  // Menores (4)
  (r.menores || []).forEach((m, i) => {
    const n = i + 1;
    setVal(`#m${n}Nombre`, m.nombre);
    setVal(`#m${n}Edad`, m.edad);
    setVal(`#m${n}Parent`, m.parent);
  });
  // Vehículos (2)
  (r.vehiculos || []).forEach((v, i) => {
    const n = i + 1;
    setVal(`#v${n}Marca`, v.marca);
    setVal(`#v${n}Tipo`, v.tipo);
    setVal(`#v${n}Color`, v.color);
    setVal(`#v${n}Placa`, v.placa);
    setVal(`#v${n}Modelo`, v.modelo);
    setVal(`#v${n}Tag`, v.tag);
  });
  // Motos (2)
  (r.motos || []).forEach((v, i) => {
    const n = i + 1;
    setVal(`#mo${n}Marca`, v.marca);
    setVal(`#mo${n}Tipo`, v.tipo);
    setVal(`#mo${n}Color`, v.color);
    setVal(`#mo${n}Placa`, v.placa);
    setVal(`#mo${n}Modelo`, v.modelo);
    setVal(`#mo${n}Tag`, v.tag);
  });
  // Bicis (2)
  (r.bicis || []).forEach((b, i) => {
    const n = i + 1;
    setVal(`#bici${n}Marca`, b.marca);
    setVal(`#bici${n}Color`, b.color);
    setVal(`#bici${n}Clase`, b.clase);
    setVal(`#bici${n}Serial`, b.serial);
  });
  setVal('#llaverosAut', r.llaverosAut);
  setVal('#tagsAut', r.tagsAut);
  // Dispositivos (3)
  (r.dispositivos || []).forEach((d, i) => {
    const n = i + 1;
    setVal(`#disp${n}Tipo`, d.tipo);
    setVal(`#disp${n}Codigo`, d.codigo);
    setVal(`#disp${n}Placa`, d.placa);
    setVal(`#disp${n}Fecha`, d.fecha);
    setVal(`#disp${n}Recibe`, d.recibe);
  });
  // Mascotas (2)
  (r.mascotas || []).forEach((m, i) => {
    const n = i + 1;
    setVal(`#masc${n}Tipo`, m.tipo);
    setVal(`#masc${n}Nombre`, m.nombre);
    setVal(`#masc${n}Raza`, m.raza);
    setVal(`#masc${n}Color`, m.color);
    setVal(`#masc${n}Sexo`, m.sexo);
    setVal(`#masc${n}Vacuna`, m.vacuna);
    setRadio(`masc${n}Esp`, m.manejoEspecial === 'Sí' ? 'Sí' : (m.manejoEspecial === 'No' ? 'No' : ''));
    setVal(`#masc${n}Registro`, m.registro);
    setVal(`#masc${n}Aseguradora`, m.aseguradora);
    setVal(`#masc${n}Poliza`, m.poliza);
  });
  // Emergencias (2)
  (r.emergencias || []).forEach((e, i) => {
    const n = i + 1;
    setVal(`#em${n}Nombre`, e.nombre);
    setVal(`#em${n}Parent`, e.parent);
    setVal(`#em${n}Tel`, e.tel);
  });
  // Autorizaciones
  setChecked('autDatos', r.autDatos === 'Sí');
  setChecked('autMenores', r.autMenores === 'Sí');
  setChecked('autCom', r.autCom === 'Sí');
  setVal('#firmaNom', r.firmaNom);
  setVal('#firmaCC', r.firmaCC);
  setVal('#firmaFecha', r.firmaFecha || new Date().toISOString().slice(0, 10));
}

// ============================================================
// RECOLECTAR DATOS DEL FORMULARIO
// ============================================================
function recolectar() {
  const res = [];
  for (let i = 1; i <= 4; i++) {
    res.push({
      nombre: val(`#r${i}Nombre`),
      cc: val(`#r${i}CC`),
      correo: val(`#r${i}Correo`),
      cel: val(`#r${i}Cel`),
      parent: val(`#r${i}Parent`),
    });
  }
  const men = [];
  for (let i = 1; i <= 4; i++) {
    men.push({
      nombre: val(`#m${i}Nombre`),
      edad: val(`#m${i}Edad`),
      parent: val(`#m${i}Parent`),
    });
  }
  const veh = [];
  for (let i = 1; i <= 4; i++) {
    veh.push({
      marca: val(`#v${i}Marca`),
      tipo: val(`#v${i}Tipo`),
      color: val(`#v${i}Color`),
      placa: val(`#v${i}Placa`),
      modelo: val(`#v${i}Modelo`),
      tag: val(`#v${i}Tag`),
    });
  }
  const mot = [];
  for (let i = 1; i <= 4; i++) {
    mot.push({
      marca: val(`#mo${i}Marca`),
      tipo: val(`#mo${i}Tipo`),
      color: val(`#mo${i}Color`),
      placa: val(`#mo${i}Placa`),
      modelo: val(`#mo${i}Modelo`),
      tag: val(`#mo${i}Tag`),
    });
  }
  const bic = [];
  for (let i = 1; i <= 2; i++) {
    bic.push({
      marca: val(`#bici${i}Marca`),
      color: val(`#bici${i}Color`),
      clase: val(`#bici${i}Clase`),
      serial: val(`#bici${i}Serial`),
    });
  }
  const disp = [];
  for (let i = 1; i <= 3; i++) {
    disp.push({
      tipo: val(`#disp${i}Tipo`),
      codigo: val(`#disp${i}Codigo`),
      placa: val(`#disp${i}Placa`),
      fecha: val(`#disp${i}Fecha`),
      recibe: val(`#disp${i}Recibe`),
    });
  }
  const mas = [];
  for (let i = 1; i <= 4; i++) {
    mas.push({
      tipo: val(`#masc${i}Tipo`),
      nombre: val(`#masc${i}Nombre`),
      raza: val(`#masc${i}Raza`),
      color: val(`#masc${i}Color`),
      sexo: val(`#masc${i}Sexo`),
      vacuna: val(`#masc${i}Vacuna`),
      manejoEspecial: getRadio(`masc${i}Esp`),
      registro: val(`#masc${i}Registro`),
      aseguradora: val(`#masc${i}Aseguradora`),
      poliza: val(`#masc${i}Poliza`),
    });
  }
  const eme = [];
  for (let i = 1; i <= 2; i++) {
    eme.push({
      nombre: val(`#em${i}Nombre`),
      parent: val(`#em${i}Parent`),
      tel: val(`#em${i}Tel`),
    });
  }
  return {
    editMode: state.mode === 'edit',
    numForm: state.numForm,
    apto: val('#apto'),
    diligencia: getRadio('diligencia'),
    nombreProp: val('#nombreProp'),
    ccProp: val('#ccProp'),
    correoProp: val('#correoProp'),
    celProp: val('#celProp'),
    telFijoProp: val('#telFijoProp'),
    // v2 — Parqueaderos y matrículas
    parq1Celda: getParqLookupKey(1),
    parq1Tipo: val('#parq1Tipo'),
    parq1Mat:   val('#parq1Mat'),
    parq2Celda: getParqLookupKey(2),
    parq2Tipo: val('#parq2Tipo'),
    parq2Mat:   val('#parq2Mat'),
    parq3Celda: getParqLookupKey(3),
    parq3Tipo: val('#parq3Tipo'),
    parq3Mat:   val('#parq3Mat'),
    parq4Celda: getParqLookupKey(4),
    parq4Tipo: val('#parq4Tipo'),
    parq4Mat:   val('#parq4Mat'),
    matriculaApto: val('#matriculaApto'),
    requiereRevision: checked('requiereRevision'),
    observMatriculas: val('#observMatriculas'),
    // Resto
    nombreArr: val('#nombreArr'),
    ccArr: val('#ccArr'),
    correoArr: val('#correArr'),
    celArr: val('#celArr'),
    // v2.0 — Sección 3 (2 filas × 6 campos = 12 inputs)
    parqTer1Parq:  val('#parqTer1Parq'),
    parqTer1Tipo:  val('#parqTer1Tipo'),
    parqTer1Placa: val('#parqTer1Placa'),
    parqTer1Nom:   val('#parqTer1Nom'),
    parqTer1Apto:  val('#parqTer1Apto'),
    parqTer1Cel:   val('#parqTer1Cel'),
    parqTer2Parq:  val('#parqTer2Parq'),
    parqTer2Tipo:  val('#parqTer2Tipo'),
    parqTer2Placa: val('#parqTer2Placa'),
    parqTer2Nom:   val('#parqTer2Nom'),
    parqTer2Apto:  val('#parqTer2Apto'),
    parqTer2Cel:   val('#parqTer2Cel'),
    // v2.0 — Legacy v[21-23] (echo de fila 1 si está llena, preserva compat)
    parqTerNom:    val('#parqTer1Nom'),
    parqTerApto:   val('#parqTer1Apto'),
    parqTerCel:    val('#parqTer1Cel'),
    inmobRazon: val('#inmobRazon'),
    inmobNit: val('#inmobNit'),
    inmobContacto: val('#inmobContacto'),
    inmobTel: val('#inmobTel'),
    inmobCorreo: val('#inmobCorreo'),
    residentes: res,
    menores: men,
    vehiculos: veh,
    motos: mot,
    bicis: bic,
    llaverosAut: val('#llaverosAut'),
    tagsAut: val('#tagsAut'),
    dispositivos: disp,
    mascotas: mas,
    emergencias: eme,
    autDatos: checked('autDatos'),
    autMenores: checked('autMenores'),
    autCom: checked('autCom'),
    firmaNom: val('#firmaNom'),
    firmaCC: val('#firmaCC'),
    firmaFecha: val('#firmaFecha'),
  };
}

// ============================================================
// VALIDACIÓN DE CAMPOS OBLIGATORIOS
// ============================================================
function validar() {
  clearAllErrors();
  let ok = true;

  function required(selector, msg) {
    if (!val(selector)) { showError(selector, msg); ok = false; }
  }
  function requiredRadio(name, msg) {
    if (!getRadio(name)) {
      const el = $(`[name="${name}"]`);
      if (el) {
        // Marca el contenedor más cercano con has-error
        const wrap = el.closest('.field') || el.parentElement;
        if (wrap) {
          wrap.classList.add('has-error');
          const errEl = wrap.querySelector('.err-msg');
          if (errEl && msg) errEl.textContent = msg;
        }
      }
      ok = false;
    }
  }
  function requiredCheckbox(name, msg) {
    if (!checked(name)) {
      const el = $(`[name="${name}"]`);
      if (el) {
        const wrap = el.closest('.checkbox-row') || el.parentElement;
        if (wrap) wrap.classList.add('has-error');
      }
      ok = false;
      if (msg) mostrar(msg);
    }
  }

  required('#apto', 'Indica tu N° de apartamento.');
  requiredRadio('diligencia', 'Selecciona si eres propietario, arrendatario o encargado/administrador del inmueble.');
  required('#nombreProp', 'Nombre del titular es obligatorio.');
  required('#ccProp', 'Cédula del titular es obligatoria.');
  const c = val('#correoProp');
  if (!c) { showError('#correoProp', 'Correo del titular es obligatorio.'); ok = false; }
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { showError('#correoProp', 'Correo inválido.'); ok = false; }
  required('#celProp', 'Celular del titular es obligatorio.');

  // Santa Sofía — si la administración no tiene matrícula disponible, el residente debe escribirla.
  if (isFieldManualRequired('#matriculaApto') && !val('#matriculaApto')) {
    showError('#matriculaApto', 'Para continuar, debe escribir la matrícula inmobiliaria porque no está disponible en la base de la administración.');
    ok = false;
  }
  // Parqueaderos — opcionales. Si el residente llena uno de los dos campos, debe llenar ambos.
  const parq1TipoV = val('#parq1Tipo');
  const parq1CeldaV = val('#parq1Celda');
  if (parq1TipoV && !parq1CeldaV) {
    showError('#parq1Celda', 'Si elige el tipo de parqueadero, escriba el N° de celda.');
    ok = false;
  } else if (!parq1TipoV && parq1CeldaV) {
    showError('#parq1Tipo', 'Si escribe el N° de celda, elija primero el tipo (Moto o Carro).');
    ok = false;
  }
  const parq2TipoV = val('#parq2Tipo');
  const parq2CeldaV = val('#parq2Celda');
  if (parq2TipoV && !parq2CeldaV) {
    showError('#parq2Celda', 'Si elige el tipo de parqueadero 2, escriba el N° de celda.');
    ok = false;
  } else if (!parq2TipoV && parq2CeldaV) {
    showError('#parq2Tipo', 'Si escribe el N° de celda 2, elija primero el tipo (Moto o Carro).');
    ok = false;
  }

  if (val('#parq1Celda') && isFieldManualRequired('#parq1Mat') && !val('#parq1Mat')) {
    showError('#parq1Mat', 'Escriba la matrícula del parqueadero 1 porque no está disponible en la base de la administración.');
    ok = false;
  }
  if (val('#parq2Celda') && isFieldManualRequired('#parq2Mat') && !val('#parq2Mat')) {
    showError('#parq2Mat', 'Escriba la matrícula del parqueadero 2 porque no está disponible en la base de la administración.');
    ok = false;
  }

  // v2.1 — Sección 3 autorización a tercero (2 filas, sección totalmente opcional)
  // Si la fila tiene AL MENOS un campo lleno, los demás deben estar completos.
  // (El residente puede dejar ambas filas vacías si no autoriza parqueadero a nadie.)
  function validarFilaAutoriz(n) {
    const parq   = val(`#parqTer${n}Parq`);
    const tipo   = val(`#parqTer${n}Tipo`);
    const placa  = val(`#parqTer${n}Placa`);
    const nom    = val(`#parqTer${n}Nom`);
    const apto   = val(`#parqTer${n}Apto`);
    const cel    = val(`#parqTer${n}Cel`);
    const algunoLleno = !!(parq || tipo || placa || nom || apto || cel);
    if (!algunoLleno) return; // Fila vacía → OK, no se envía autorización
    // Algún campo lleno → validar todos los demás (Placa es opcional)
    if (!parq)  { showError(`#parqTer${n}Parq`, `Indique el N° de parqueadero que autoriza en la fila ${n}.`); ok = false; }
    if (!tipo)  { showError(`#parqTer${n}Tipo`, `Seleccione si es Carro o Moto en la fila ${n}.`); ok = false; }
    if (!nom)   { showError(`#parqTer${n}Nom`,  `Indique el nombre del autorizado en la fila ${n}.`); ok = false; }
    if (!apto)  { showError(`#parqTer${n}Apto`, `Indique el apto N° del autorizado en la fila ${n}.`); ok = false; }
    if (!cel)   { showError(`#parqTer${n}Cel`,  `Indique el celular del autorizado en la fila ${n}.`); ok = false; }
  }
  validarFilaAutoriz(1);
  validarFilaAutoriz(2);

  requiredCheckbox('autDatos', 'Debes autorizar el tratamiento de datos para continuar.');
  required('#firmaNom', 'Firma con tu nombre completo.');
  required('#firmaCC', 'Indica tu cédula en la firma.');

  // Edad menores debe ser número si está lleno
  for (let i = 1; i <= 4; i++) {
    const e = val(`#m${i}Edad`);
    if (e && (isNaN(parseInt(e, 10)) || parseInt(e, 10) < 0 || parseInt(e, 10) > 17)) {
      showError(`#m${i}Edad`, 'Edad debe ser un número entre 0 y 17.');
      ok = false;
    }
  }
  return ok;
}

// Mensajes inline flotantes para checkboxes requeridos
function mostrar(msg) {
  // Sólo usado para errores de checkbox
  const el = $('#alert-create');
  if (el && !el.classList.contains('hidden') && el.textContent.includes(msg)) return;
}

// ============================================================
// ENVIAR FORMULARIO
// ============================================================
async function enviarFormulario() {
  hideAlert('alert-create');
  if (!validar()) {
    showAlert('alert-create', 'Por favor completa los campos marcados en rojo antes de enviar.', 'err');
    // Expandir todas las secciones con error
    $$('.section').forEach(sec => {
      if (sec.querySelector('.has-error')) sec.classList.remove('collapsed');
    });
    // Scroll al primer error
    const firstErr = $('.field.has-error, .checkbox-row.has-error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!APPS_SCRIPT_URL) {
    showAlert('alert-create', 'El formulario aún no está conectado al servidor. Avisa a la administración.', 'err');
    return;
  }
  if (state.submitting) return;
  state.submitting = true;

  const payload = recolectar();

  const btn = $('#btnEnviar');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'Enviando...';

  try {
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // Sin headers custom: Apps Script Web App requiere preflight CORS simple
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!data.ok) {
      showAlert('alert-create', data.error || 'Error desconocido al guardar.', 'err');
      btn.disabled = false;
      btn.textContent = oldText;
      return;
    }
    // Éxito
    mostrarExito(data);
  } catch (err) {
    showAlert('alert-create', 'Error de red al enviar: ' + err.message, 'err');
    btn.disabled = false;
    btn.textContent = oldText;
  } finally {
    state.submitting = false;
  }
}
$('#btnEnviar').addEventListener('click', enviarFormulario);

function mostrarExito(data) {
  $('#form-card').classList.add('hidden');
  $('#success-card').classList.remove('hidden');
  if (data.editMode) {
    $('#success-title').textContent = '¡Registro actualizado!';
    $('#success-num-form').textContent = data.numForm;
    $('#success-advice').innerHTML = '<strong>N° de formulario:</strong> ' + data.numForm + ' (sigue siendo el mismo).';
  } else {
    $('#success-title').textContent = '¡Registro creado exitosamente!';
    $('#success-num-form').textContent = data.numForm;
    $('#success-advice').innerHTML = `
      <strong>⚠️ IMPORTANTE: Guarda tu N° de formulario.</strong><br>
      Tu N° de formulario es: <strong style="font-size:18px; letter-spacing:2px;">${data.numForm}</strong><br>
      Lo necesitarás cada vez que quieras editar o actualizar tus datos.<br>
      Guárdalo en un lugar seguro (anota, captura de pantalla, etc.).<br>
      <em>La administración NO puede recuperar este número por ti.</em>
    `;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// NUEVO REGISTRO / RESET
// ============================================================
function resetForm() {
  $('#mainForm').reset();
  state.numForm = '';
  state.editLookup = null;
  state.mode = 'create';
  $('#editIndicator').classList.add('hidden');
  $('#success-card').classList.add('hidden');
  $('#form-card').classList.remove('hidden');
  $('#firmaFecha').value = new Date().toISOString().slice(0, 10);
}
$('#btnNuevo').addEventListener('click', resetForm);

// ============================================================
// HELPERS DE ALERTAS
// ============================================================
function showAlert(id, msg, type) {
  const el = $('#' + id);
  if (!el) return;
  el.className = 'alert alert-' + (type || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}
function hideAlert(id) {
  const el = $('#' + id);
  if (el) { el.classList.add('hidden'); el.textContent = ''; }
}

// ============================================================
// v2 — LOOKUP DE MATRÍCULAS (autocompleta al perder foco)
// ============================================================

// Muestra/oculta un mensaje de aviso (ok/warn/err) en un div .lookup-msg
function setLookupMsg(targetId, msg, kind) {
  const el = $('#' + targetId);
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'lookup-msg ' + (kind || 'info');
  el.innerHTML = msg;
  el.classList.remove('hidden');
}

// Lookup de matrícula del apartamento
async function lookupMatApto() {
  const apto = val('#apto');
  const msgTarget = 'apto-lookup-msg';
  const matField  = '#matriculaApto';

  // Si el residente ya escribió manualmente una matrícula, NO la pisamos
  // salvo que esté vacía.
  const manualMat = val(matField).trim();

  if (!apto) {
    setLookupMsg(msgTarget, '', null);
    return;
  }
  if (!APPS_SCRIPT_URL) {
    setLookupMsg(msgTarget, 'No se puede consultar la base de matrículas: el formulario no está conectado al servidor.', 'err');
    return;
  }

  setLookupMsg(msgTarget, '<strong>Buscando matrícula del apartamento ' + apto + '...</strong>', 'warn');

  try {
    const url = APPS_SCRIPT_URL + '?action=lookupMatApto&apto=' + encodeURIComponent(apto);
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await resp.json();
    if (!data.ok) {
      setLookupMsg(msgTarget, 'Error al consultar la base: ' + (data.error || 'desconocido'), 'err');
      return;
    }
    if (data.encontrado) {
      setFieldManualRequired(matField, false);
      if (!manualMat) setVal(matField, data.matricula);
      setLookupMsg(msgTarget,
        '<strong>✓ Matrícula encontrada:</strong> ' + data.matricula + '. ' +
        'Verifique que sea correcta. Si no coincide, edítela y marque revisión administrativa.',
        'ok');
    } else if (data.requiereManual) {
      setVal(matField, manualMat || '');
      setFieldManualRequired(matField, true);
      markReviewBecauseManual('Matrícula de apartamento no disponible en base administrativa; digitada manualmente por el residente.');
      setLookupMsg(msgTarget,
        '<strong>⚠ La administración no tiene disponible la matrícula inmobiliaria del apartamento ' + apto + '.</strong> ' +
        'Por favor escríbala manualmente según su escritura, certificado de tradición o documento de propiedad. ' +
        '<strong>Este campo será obligatorio para enviar.</strong>',
        'warn');
    } else {
      setFieldManualRequired(matField, false);
      setLookupMsg(msgTarget, 'No se encontró información de matrícula para este apartamento.', 'warn');
    }
  } catch (err) {
    setLookupMsg(msgTarget, 'Error de red al consultar la base de matrículas: ' + err.message, 'err');
  }
}

// Lookup de matrícula de un parqueadero
async function lookupMatParq(n) {
  const celda = val('#parq' + n + 'Celda');
  const tipoSel = val('#parq' + n + 'Tipo');
  const matField = '#parq' + n + 'Mat';
  const msgTarget = 'parq' + n + '-lookup-msg';

  const manualMat = val(matField).trim();

  if (!celda) {
    setLookupMsg(msgTarget, '', null);
    return;
  }
  // Si no hay tipo y la celda no incluye "Moto" o "Carro", advertir
  if (!tipoSel && !/^(moto|carro)\s/i.test(String(celda).trim())) {
    setLookupMsg(msgTarget,
      '<strong>⚠️ Selecciona el tipo de parqueadero</strong> (Moto o Carro) para autocompletar la matrícula. Sin el tipo, el sistema no puede distinguir entre parqueaderos de moto y de carro que comparten la misma numeración.',
      'warn');
    return;
  }
  if (!APPS_SCRIPT_URL) {
    setLookupMsg(msgTarget, 'No se puede consultar: el formulario no está conectado.', 'err');
    return;
  }

  const lookupKey = getParqLookupKey(n);
  setLookupMsg(msgTarget, '<strong>Buscando matrícula de la celda ' + lookupKey + '...</strong>', 'warn');

  try {
    const url = APPS_SCRIPT_URL + '?action=lookupMatParq&celda=' + encodeURIComponent(lookupKey);
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await resp.json();
    if (!data.ok) {
      setLookupMsg(msgTarget, 'Error: ' + (data.error || 'desconocido'), 'err');
      return;
    }
    if (data.encontrado) {
      setFieldManualRequired(matField, false);
      if (!manualMat) setVal(matField, data.matricula);
      const tipoTxt = data.tipo ? ' (' + data.tipo + ')' : '';
      setLookupMsg(msgTarget,
        '<strong>✓ Celda ' + celda + tipoTxt + ':</strong> matrícula ' + data.matricula +
        '. Verifique que sea correcta.',
        'ok');
    } else if (data.requiereManual) {
      setVal(matField, manualMat || '');
      setFieldManualRequired(matField, true);
      markReviewBecauseManual('Matrícula de parqueadero no disponible en base administrativa; digitada manualmente por el residente.');
      setLookupMsg(msgTarget,
        '<strong>⚠ La administración no tiene disponible la matrícula del parqueadero ' + celda + '.</strong> ' +
        'Por favor escríbala manualmente. <strong>Este campo será obligatorio para enviar si diligenció este parqueadero.</strong>',
        'warn');
    } else {
      setFieldManualRequired(matField, false);
      setLookupMsg(msgTarget, 'No se encontró información de matrícula para este parqueadero.', 'warn');
    }
  } catch (err) {
    setLookupMsg(msgTarget, 'Error de red: ' + err.message, 'err');
  }
}

// Listeners: lookup al perder foco
['#apto', '#parq1Celda', '#parq2Celda'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('blur', () => {
    if (sel === '#apto') lookupMatApto();
    else if (sel === '#parq1Celda') lookupMatParq(1);
    else if (sel === '#parq2Celda') lookupMatParq(2);
  });
});
// Cambio: cuando cambia el tipo, también dispara el lookup si ya hay número
['#parq1Tipo', '#parq2Tipo'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('change', () => {
    const n = sel === '#parq1Tipo' ? 1 : 2;
    const celda = val('#parq' + n + 'Celda');
    if (celda) lookupMatParq(n);
  });
});

// Mostrar/ocultar textarea de observaciones según checkbox de revisión
function toggleObservMatriculas() {
  const cb = $('[name="requiereRevision"]');
  const wrap = $('#observMatriculas-wrap');
  if (!cb || !wrap) return;
  wrap.style.display = cb.checked ? '' : 'none';
}
document.addEventListener('change', (e) => {
  if (e.target && e.target.name === 'requiereRevision') toggleObservMatriculas();
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  $('#firmaFecha').value = new Date().toISOString().slice(0, 10);
  // Sincronizar campo firmaFecha2 (copia disabled) desde firmaFecha
  const fecha1 = $('#firmaFecha');
  const fecha2 = $('#firmaFecha2');
  function syncFecha2() {
    if (fecha1 && fecha2) fecha2.value = fecha1.value;
  }
  if (fecha1 && fecha2) {
    syncFecha2();
    fecha1.addEventListener('change', syncFecha2);
  }

  // Si la URL del Apps Script no está configurada, mostrar aviso
  if (!APPS_SCRIPT_URL) {
    showAlert('alert-create', '<strong>⚠️ Aviso:</strong> El formulario aún no está conectado al servidor. La administración debe desplegar el Apps Script y pegar la URL en <code>js/app.js</code> (constante <code>APPS_SCRIPT_URL</code>). Mientras tanto, los envíos no funcionarán.', 'err');
  }
});

// ============================================================
// MÓDULO M — Agendamiento de Mudanzas (Santa Sofía)
// Backend: 5 endpoints Apps Script
//   GET  ?action=verificarPropietario
//   GET  ?action=dispMudanzas
//   GET  ?action=misReservas
//   POST action=reservarMudanza
//   POST action=cancelarMudanza
// ============================================================
const M = {
  state: {
    numForm: '',
    apto: '',
    ccProp: '',
    propietario: null,
    torre: 'Naranja',
    fecha: null,
    horaInicio: null,
    horaFin: null,
    lastReserva: null,
    reservasCache: [],
  },

  reset() {
    this.state = { numForm: '', apto: '', ccProp: '', propietario: null, torre: 'Naranja', fecha: null, horaInicio: null, horaFin: null, lastReserva: null, reservasCache: [] };
    $('#mudNumForm').value = '';
    $('#mudApto').value = '';
    $('#mudCcProp').value = '';
    $('#mudTorre').value = 'Naranja';
    $('#mudEmpresa').value = '';
    $('#mudPlaca').value = '';
    $('#mudObservaciones').value = '';
    $$('input[name="mudTipo"]').forEach(r => r.checked = false);
    $('#btnMudReservar').disabled = true;
    $('#mudSlots').innerHTML = '';
    hideAlert('alert-mud-login');
    hideAlert('alert-mud-form');
    hideAlert('alert-mud-mis');
    this.showVista('login');
  },

  bindEvents() {
    $('#btnMudVerificar').addEventListener('click', () => this.verificar());
    $('#btnMudVolver').addEventListener('click', () => this.reset());
    $('#btnMudReservar').addEventListener('click', () => this.submitReserva());
    $('#btnMudOtra').addEventListener('click', () => this.reset());
    $('#btnMudVerMisReservas').addEventListener('click', () => this.showMisReservas());
    $('#btnMudMisReservas').addEventListener('click', () => this.showMisReservas());
    $('#btnMudVolverMis').addEventListener('click', () => this.reset());
    $('#linkMisReservas').addEventListener('click', (e) => {
      e.preventDefault();
      this.verificarYMostrarMisReservas();
    });
    $('#mudTorre').addEventListener('change', () => {
      this.state.torre = $('#mudTorre').value;
      this.renderCalendario();
      $('#mudSlots').innerHTML = '';
      this.state.fecha = null;
      this.state.horaInicio = null;
      this.state.horaFin = null;
      $('#btnMudReservar').disabled = true;
    });
    $$('input[name="mudTipo"]').forEach(r => {
      r.addEventListener('change', () => this.checkFormCompleto());
    });
  },

  showVista(v) {
    $('#mud-vista-login').classList.toggle('hidden', v !== 'login');
    $('#mud-vista-form').classList.toggle('hidden', v !== 'form');
    $('#mud-vista-ok').classList.toggle('hidden', v !== 'ok');
    $('#mud-vista-mis').classList.toggle('hidden', v !== 'mis');
  },

  async verificar() {
    hideAlert('alert-mud-login');
    const numForm = $('#mudNumForm').value.trim();
    const apto = $('#mudApto').value.trim();
    const ccProp = $('#mudCcProp').value.replace(/[^0-9]/g, '').trim();
    if (!numForm) { showAlert('alert-mud-login', 'Ingresa tu N° de formulario.', 'err'); return; }
    if (!apto) { showAlert('alert-mud-login', 'Ingresa el N° de apartamento.', 'err'); return; }
    if (!ccProp) { showAlert('alert-mud-login', 'Ingresa la cédula del propietario (solo números).', 'err'); return; }
    if (!APPS_SCRIPT_URL) {
      showAlert('alert-mud-login', 'El formulario no está conectado al servidor.', 'err');
      return;
    }
    const btn = $('#btnMudVerificar');
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Verificando...';
    try {
      const url = APPS_SCRIPT_URL + '?action=verificarPropietario&numForm=' + enc(numForm) + '&apto=' + enc(apto) + '&ccProp=' + enc(ccProp);
      const data = await fetchJson(url);
      if (!data.ok) {
        showAlert('alert-mud-login', data.error || 'No se pudo verificar.', 'err');
        return;
      }
      this.state.numForm = numForm;
      this.state.apto = apto;
      this.state.ccProp = ccProp;
      this.state.propietario = data;
      this.showVista('form');
      this.renderCalendario();
    } catch (e) {
      showAlert('alert-mud-login', 'Error de red: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  },

  // Verifica y luego salta directo a "Mis reservas" (desde link en login)
  async verificarYMostrarMisReservas() {
    hideAlert('alert-mud-login');
    const numForm = $('#mudNumForm').value.trim();
    const apto = $('#mudApto').value.trim();
    const ccProp = $('#mudCcProp').value.replace(/[^0-9]/g, '').trim();
    if (!numForm || !apto || !ccProp) {
      showAlert('alert-mud-login', 'Completa los 3 campos para ver tus reservas.', 'err');
      return;
    }
    this.state.numForm = numForm;
    this.state.apto = apto;
    this.state.ccProp = ccProp;
    this.showMisReservas();
  },

  renderCalendario() {
    const cont = $('#mudCalendario');
    const hoy = new Date();
    const minFecha = new Date(hoy);
    minFecha.setDate(minFecha.getDate() + 2);
    minFecha.setHours(0, 0, 0, 0);

    let html = '';
    for (let m = 0; m < 2; m++) {
      const ref = new Date(hoy.getFullYear(), hoy.getMonth() + m, 1);
      html += this.renderMes(ref, minFecha);
    }
    cont.innerHTML = html;

    $$('#mudCalendario .mud-dia').forEach(el => {
      el.addEventListener('click', () => {
        if (el.classList.contains('mud-dia-deshabilitado')) return;
        const f = el.dataset.fecha;
        $$('#mudCalendario .mud-dia').forEach(d => d.classList.remove('mud-dia-seleccionado'));
        el.classList.add('mud-dia-seleccionado');
        this.selectFecha(f);
      });
    });
  },

  renderMes(refDate, minFecha) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const dowNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const primerDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    let html = '<div class="mud-mes"><h4>' + monthNames[month] + ' ' + year + '</h4><div class="mud-cal-grid"><div class="mud-cal-hdr">' + dowNames.map(d => '<span>' + d + '</span>').join('') + '</div><div class="mud-cal-dias">';
    const startDow = primerDia.getDay();
    for (let i = 0; i < startDow; i++) html += '<span></span>';
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fecha = new Date(year, month, d);
      const fechaStr = this.formatFecha(fecha);
      const dow = fecha.getDay();
      const esDomingo = dow === 0;
      const muyPronto = fecha < minFecha;
      const deshabilitado = esDomingo || muyPronto;
      const selClass = (this.state.fecha === fechaStr) ? ' mud-dia-seleccionado' : '';
      const disClass = deshabilitado ? ' mud-dia-deshabilitado' : '';
      const title = esDomingo ? 'Domingo: no hay servicio' : muyPronto ? 'Menos de 48h de anticipación' : 'Click para ver horarios';
      html += '<button type="button" class="mud-dia' + disClass + selClass + '" data-fecha="' + fechaStr + '" title="' + title + '" ' + (deshabilitado ? 'disabled' : '') + '>' + d + '</button>';
    }
    html += '</div></div></div>';
    return html;
  },

  async selectFecha(fecha) {
    this.state.fecha = fecha;
    this.state.horaInicio = null;
    this.state.horaFin = null;
    $('#btnMudReservar').disabled = true;
    $('#mudSlots').innerHTML = '<p style="color:var(--gris-med);">Cargando horarios...</p>';
    try {
      const url = APPS_SCRIPT_URL + '?action=dispMudanzas&torre=' + enc(this.state.torre) + '&ascensor=A&desde=' + enc(fecha) + '&hasta=' + enc(fecha);
      const data = await fetchJson(url);
      if (!data.ok) {
        $('#mudSlots').innerHTML = '<p style="color:var(--err);">' + (data.error || 'Error al cargar horarios') + '</p>';
        return;
      }
      this.renderSlots(data.slots);
    } catch (e) {
      $('#mudSlots').innerHTML = '<p style="color:var(--err);">Error de red: ' + e.message + '</p>';
    }
  },

  renderSlots(slotsDelDia) {
    if (!slotsDelDia.length) {
      $('#mudSlots').innerHTML = '<p style="color:var(--gris-med);">No hay horarios disponibles este día (ej: domingo).</p>';
      return;
    }
    let html = '<div class="mud-slots-grid">';
    for (const s of slotsDelDia) {
      const cls = s.disponible ? 'mud-slot-disponible' : 'mud-slot-ocupado';
      const sel = (s.horaInicio === this.state.horaInicio) ? ' mud-slot-seleccionado' : '';
      const label = s.reservadoPor ? s.horaInicio + '-' + s.horaFin + '<br><small>(' + s.reservadoPor + ')</small>' : s.horaInicio + ' - ' + s.horaFin;
      html += '<button type="button" class="mud-slot ' + cls + sel + '" data-hora="' + s.horaInicio + '" data-fin="' + s.horaFin + '" ' + (!s.disponible ? 'disabled' : '') + '>' + label + '</button>';
    }
    html += '</div>';
    if (this.state.fecha) {
      html += '<p style="font-size:12px; color:var(--gris-med); margin-top:8px;">' + this.formatFechaLarga(this.state.fecha) + '</p>';
    }
    $('#mudSlots').innerHTML = html;
    $$('#mudSlots .mud-slot-disponible').forEach(btn => {
      btn.addEventListener('click', () => {
        this.state.horaInicio = btn.dataset.hora;
        this.state.horaFin = btn.dataset.fin;
        $$('#mudSlots .mud-slot').forEach(b => b.classList.remove('mud-slot-seleccionado'));
        btn.classList.add('mud-slot-seleccionado');
        this.checkFormCompleto();
      });
    });
  },

  checkFormCompleto() {
    const tipo = $$('input[name="mudTipo"]').find(r => r.checked);
    const ok = !!tipo && !!this.state.torre && !!this.state.fecha && !!this.state.horaInicio && !!this.state.horaFin;
    $('#btnMudReservar').disabled = !ok;
  },

  async submitReserva() {
    hideAlert('alert-mud-form');
    const tipoEl = $$('input[name="mudTipo"]').find(r => r.checked);
    if (!tipoEl) { showAlert('alert-mud-form', 'Selecciona el tipo de autorización.', 'err'); return; }
    if (!this.state.fecha || !this.state.horaInicio) { showAlert('alert-mud-form', 'Selecciona un día y un horario.', 'err'); return; }

    const payload = {
      action: 'reservarMudanza',
      numForm: this.state.numForm,
      apto: this.state.apto,
      ccProp: this.state.ccProp,
      tipoMudanza: tipoEl.value,
      torre: this.state.torre,
      fecha: this.state.fecha,
      horaInicio: this.state.horaInicio,
      horaFin: this.state.horaFin,
      empresa: $('#mudEmpresa').value.trim(),
      placa: $('#mudPlaca').value.trim().toUpperCase(),
      observaciones: $('#mudObservaciones').value.trim(),
    };

    $('#btnMudReservar').disabled = true;
    const oldText = $('#btnMudReservar').textContent;
    $('#btnMudReservar').textContent = 'Reservando...';

    try {
      const data = await safePost(payload);
      if (!data.ok) {
        showAlert('alert-mud-form', data.error || 'No se pudo reservar.', 'err');
        this.checkFormCompleto();
        return;
      }
      if (data.pendingEmail) {
        showAlert('alert-mud-ok-alerta', data.warning, 'info');
        $('#mudOkAlerta').classList.remove('hidden');
      } else {
        $('#mudOkAlerta').classList.add('hidden');
      }
      this.state.lastReserva = data;
      this.showConfirmacion(data);
    } catch (e) {
      showAlert('alert-mud-form', 'Error de red: ' + e.message, 'err');
      this.checkFormCompleto();
    } finally {
      $('#btnMudReservar').textContent = oldText;
      this.checkFormCompleto();
    }
  },

  showConfirmacion(data) {
    $('#mudOkId').textContent = data.idReserva;
    const fecha = this.formatFechaLarga(data.fecha);
    let detalle = '<strong>Fecha:</strong> ' + fecha + '<br>' +
                  '<strong>Horario:</strong> ' + data.horaInicio + ' a ' + data.horaFin + '<br>' +
                  '<strong>Torre:</strong> ' + data.torre + ', Ascensor A';
    if (data.par) detalle += ' (par ' + data.par + ')';
    $('#mudOkDetalle').innerHTML = detalle;
    this.showVista('ok');
  },

  async showMisReservas() {
    if (!this.state.numForm || !this.state.apto || !this.state.ccProp) {
      showAlert('alert-mud-mis', 'Faltan datos del propietario. Vuelve a verificar.', 'err');
      return;
    }
    hideAlert('alert-mud-mis');
    $('#mudMisLista').innerHTML = '<p style="color:var(--gris-med);">Cargando tus reservas...</p>';
    this.showVista('mis');
    try {
      const url = APPS_SCRIPT_URL + '?action=misReservas&numForm=' + enc(this.state.numForm) + '&apto=' + enc(this.state.apto) + '&ccProp=' + enc(this.state.ccProp);
      const data = await fetchJson(url);
      if (!data.ok) {
        showAlert('alert-mud-mis', data.error || 'No se pudieron cargar tus reservas.', 'err');
        $('#mudMisLista').innerHTML = '';
        return;
      }
      this.state.propietario = data.propietario;
      this.state.reservasCache = data.reservas || [];
      $('#mudMisSubtitulo').textContent = 'Apartamento ' + data.propietario.apto + ' · ' + data.propietario.nombreProp;
      this.renderMisReservas(data.reservas || []);
    } catch (e) {
      showAlert('alert-mud-mis', 'Error de red: ' + e.message, 'err');
      $('#mudMisLista').innerHTML = '';
    }
  },

  renderMisReservas(reservas) {
    if (!reservas.length) {
      $('#mudMisLista').innerHTML = '<div style="padding:20px; text-align:center; color:var(--gris-med);">No tienes reservas registradas.</div>';
      return;
    }
    let html = '';
    reservas.forEach(r => {
      const badgeClass = r.estado === 'Confirmada' ? 'mud-estado-confirmada' : r.estado === 'Cancelada' ? 'mud-estado-cancelada' : 'mud-estado-completada';
      const cancelable = r.estado === 'Confirmada';
      html += '<div class="mud-reserva-card">' +
        '<div class="mud-reserva-header">' +
          '<div class="mud-reserva-id">' + r.id + '</div>' +
          '<div class="mud-estado-badge ' + badgeClass + '">' + r.estado + '</div>' +
        '</div>' +
        '<div class="mud-reserva-detail">' +
          '<strong>Fecha:</strong> ' + this.formatFechaLarga(r.fecha) + '<br>' +
          '<strong>Horario:</strong> ' + r.horaInicio + ' - ' + r.horaFin + '<br>' +
          '<strong>Tipo:</strong> ' + r.tipoMudanza + '<br>' +
          '<strong>Torre:</strong> ' + r.torre + ', Ascensor ' + r.ascensor + '<br>' +
          (r.empresa ? '<strong>Empresa:</strong> ' + r.empresa + '<br>' : '') +
          (r.placa ? '<strong>Placa:</strong> ' + r.placa + '<br>' : '') +
          (r.observaciones ? '<strong>Obs:</strong> ' + r.observaciones : '') +
        '</div>' +
        (cancelable ? '<div class="mud-reserva-actions"><button class="btn btn-secondary" data-id="' + r.id + '">✕ Cancelar reserva</button></div>' : '') +
      '</div>';
    });
    $('#mudMisLista').innerHTML = html;

    // Bind cancelar buttons
    $$('#mudMisLista .btn[data-id]').forEach(btn => {
      btn.addEventListener('click', () => this.cancelarReserva(btn.dataset.id));
    });
  },

  async cancelarReserva(idReserva) {
    if (!confirm('¿Confirmas que quieres cancelar la reserva ' + idReserva + '?\n\nNo se puede cancelar con menos de 24 horas de anticipación.')) return;
    const payload = {
      action: 'cancelarMudanza',
      numForm: this.state.numForm,
      apto: this.state.apto,
      ccProp: this.state.ccProp,
      idReserva: idReserva,
    };
    try {
      const data = await safePost(payload);
      if (!data.ok) {
        showAlert('alert-mud-mis', data.error || 'No se pudo cancelar.', 'err');
        return;
      }
      if (data.pendingEmail) {
        showAlert('alert-mud-mis', data.warning || 'Reserva cancelada. Espere confirmación por email.', 'info');
      } else {
        showAlert('alert-mud-mis', 'Reserva cancelada correctamente.', 'ok');
      }
      // Recargar lista
      await this.showMisReservas();
    } catch (e) {
      showAlert('alert-mud-mis', 'Error de red: ' + e.message, 'err');
    }
  },

  formatFecha(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  },

  formatFechaLarga(fechaStr) {
    const dowNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const [y, m, d] = fechaStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dowNames[dt.getDay()] + ' ' + d + ' de ' + ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][dt.getMonth()] + ' de ' + y;
  },
};

// Retry helpers para POST/GET (mitigación HTML 500/405 de Apps Script cold start MailApp)
async function safePost(payload, retries) {
  retries = (typeof retries === 'number') ? retries : 1;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      try { return JSON.parse(text); }
      catch (e) {
        if (i < retries) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return { ok: true, pendingEmail: true, warning: 'Reserva enviada. Espere confirmación por email en 5 minutos. Si no llega, contacte a la administración.' };
      }
    } catch (e) {
      if (i < retries) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw e;
    }
  }
}

async function fetchJson(url, retries) {
  retries = (typeof retries === 'number') ? retries : 1;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      try { return JSON.parse(text); }
      catch (e) {
        if (i < retries) { await new Promise(r => setTimeout(r, 2000)); continue; }
        return { ok: false, error: 'El servidor respondió con HTML en lugar de JSON. Intente nuevamente en 1 minuto.' };
      }
    } catch (e) {
      throw e;
    }
  }
}

function enc(s) { return encodeURIComponent(s); }

// Init módulo M cuando carga el DOM
document.addEventListener('DOMContentLoaded', () => {
  if (typeof M !== 'undefined' && M.bindEvents) M.bindEvents();
});
