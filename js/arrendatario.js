// ============================================================
// PORTAL DE ARRENDATARIOS — Santa Sofía
// spec-arrendatarios.md F3 — 05-Oct-2026
// Endpoints: getEstadoResidente, verificarResidente,
//            registrarResidente, actualizarResidente, clearResidente
// ============================================================

// ============ CONFIGURACIÓN ============
const APP_URL = 'https://script.google.com/macros/s/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev';

// ============ ESTADO GLOBAL ============
const state = {
  apto: null,
  numForm: null,
  cc: null,
  slot: null,
  nombre: null,
  numResidentesActuales: 0,
  nombresResidentesActuales: [],
  numResidentesForm: 1,
  numMenoresForm: 0,
  numVehiculosForm: 0,
  numMotosForm: 0,
  numBicisForm: 0,
  numMascotasForm: 0,
  numContactosForm: 0
};

// ============ HELPERS FETCH ============
async function apiGet(params) {
  const url = new URL(APP_URL);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });
  const r = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  return r.json();
}

async function apiPost(payload) {
  const r = await fetch(APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  return r.json();
}

// ============ HELPERS UI ============
function val(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function showView(name) {
  ['inicial', 'con-datos', 'no-existe', 'registro', 'editar', 'exito']
    .forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== name);
    });
  window.scrollTo(0, 0);
}

function showAlert(viewName, msg, type) {
  const el = document.getElementById('alert-' + viewName);
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert show ' + (type || 'error');
  setTimeout(() => { el.classList.remove('show'); el.classList.add('hidden'); }, 8000);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============ FLUJO 1: INGRESO CON APTO ============
async function flujoInicial() {
  const apto = val('aptoInput');
  if (!apto) return showAlert('inicial', 'Por favor ingrese el N° de apartamento', 'error');

  const btn = document.getElementById('btnContinuar');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const r = await apiGet({ action: 'getEstadoResidente', apto });
    if (!r.ok) {
      showAlert('inicial', r.error || 'Error al consultar', 'error');
      return;
    }

    state.apto = apto;

    if (!r.aptoExiste) {
      const neApto = document.getElementById('neApto');
      if (neApto) neApto.textContent = apto;
      showView('no-existe');
      return;
    }

    if (!r.hayResidentes) {
      const regApto = document.getElementById('regApto');
      if (regApto) regApto.textContent = apto;
      initFormularioRegistro();
      showView('registro');
      return;
    }

    state.numResidentesActuales = r.numResidentes;
    state.nombresResidentesActuales = [];
    const cdApto = document.getElementById('cdApto');
    if (cdApto) cdApto.textContent = apto;
    const ul = document.getElementById('cdListaResidentes');
    if (ul) {
      ul.innerHTML = '';
      // Solo sabemos el conteo, no los nombres (BUGFIX-018)
      for (let i = 0; i < r.numResidentes; i++) {
        const li = document.createElement('li');
        li.textContent = '• Residente ' + (i + 1);
        ul.appendChild(li);
      }
    }
    const ccInput = document.getElementById('ccInput');
    if (ccInput) ccInput.value = '';
    showView('con-datos');
  } catch (e) {
    showAlert('inicial', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Continuar';
  }
}

// ============ FLUJO 2: VERIFICAR CC ============
async function flujoVerificarCc() {
  const cc = val('ccInput').replace(/[.\-\s]/g, '').trim();
  if (!cc) return showAlert('con-datos', 'Por favor ingrese su cédula', 'error');

  const btn = document.getElementById('btnVerificar');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try {
    const r = await apiGet({ action: 'verificarResidente', apto: state.apto, cc });
    if (!r.ok) {
      showAlert('con-datos', r.error || 'No se encontró el residente', 'error');
      return;
    }

    state.cc = cc;
    state.slot = r.slot;
    state.nombre = r.datos.nombre;
    initFormularioEdicion(r.datos);
    showView('editar');
  } catch (e) {
    showAlert('con-datos', 'Error de red: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Editar mis datos';
  }
}

// ============ FLUJO 3: REGISTRAR RESIDENTE (apto vacío) ============
function initFormularioRegistro() {
  // Renderiza 1 slot de residente vacío
  const cont = document.getElementById('regResidentes');
  if (cont) {
    cont.innerHTML = '';
    renderResidenteBlock(cont, 0);
  }
  // Inicializar contadores en 0
  state.numMenoresForm = 0;
  state.numVehiculosForm = 0;
  state.numMotosForm = 0;
  state.numBicisForm = 0;
  state.numMascotasForm = 0;
  state.numContactosForm = 0;
  ['regMenores', 'regVehiculos', 'regMotos', 'regBicis', 'regMascotas', 'regContactos']
    .forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
}

function renderResidenteBlock(container, idx) {
  const html = `
    <div class="residente-block">
      <h4>Residente ${idx + 1}</h4>
      <div class="field-row">
        <div class="field">
          <label>Nombre completo <span class="req">*</span></label>
          <input type="text" id="regRes${idx}_nombre" autocomplete="off">
        </div>
        <div class="field">
          <label>Cédula <span class="req">*</span></label>
          <input type="text" id="regRes${idx}_cc" inputmode="numeric" autocomplete="off">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Parentesco <span class="req">*</span></label>
          <select id="regRes${idx}_parentesco">
            <option value="">Seleccione…</option>
            <option value="Propietario">Propietario</option>
            <option value="Esposa">Esposa / Esposo</option>
            <option value="Hijo">Hijo / Hija</option>
            <option value="Padre">Padre / Madre</option>
            <option value="Hermano">Hermano / Hermana</option>
            <option value="Tío">Tío / Tía</option>
            <option value="Sobrino">Sobrino / Sobrina</option>
            <option value="Abuelo">Abuelo / Abuela</option>
            <option value="Nieto">Nieto / Nieta</option>
            <option value="Primo">Primo / Prima</option>
            <option value="Cuñado">Cuñado / Cuñada</option>
            <option value="Yerno">Yerno / Nuera</option>
            <option value="Suegro">Suegro / Suegra</option>
            <option value="Arrendatario">Arrendatario</option>
            <option value="Tenedor / Otro">Tenedor / Otro</option>
          </select>
        </div>
        <div class="field">
          <label>Celular <span class="req">*</span></label>
          <input type="text" id="regRes${idx}_cel" inputmode="tel" autocomplete="off">
        </div>
      </div>
      <div class="field">
        <label>Correo electrónico</label>
        <input type="email" id="regRes${idx}_correo" autocomplete="off">
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
}

function addResidente() {
  if (state.numResidentesForm >= 4) {
    return showAlert('registro', 'Máximo 4 residentes por apartamento', 'error');
  }
  const cont = document.getElementById('regResidentes');
  if (!cont) return;
  renderResidenteBlock(cont, state.numResidentesForm);
  state.numResidentesForm++;
}

function addMenor() {
  const idx = state.numMenoresForm;
  const cont = document.getElementById('regMenores');
  if (!cont) return;
  cont.insertAdjacentHTML('beforeend', `
    <div class="residente-block">
      <h4>Menor ${idx + 1}</h4>
      <div class="field-row">
        <div class="field"><label>Nombre</label><input type="text" id="regMen${idx}_nombre"></div>
        <div class="field"><label>Edad</label><input type="text" id="regMen${idx}_edad" inputmode="numeric"></div>
      </div>
      <div class="field"><label>Parentesco</label><input type="text" id="regMen${idx}_parent"></div>
    </div>
  `);
  state.numMenoresForm++;
}

function addVehiculo() {
  if (state.numVehiculosForm >= 4) return showAlert('registro', 'Máximo 4 vehículos', 'error');
  const idx = state.numVehiculosForm;
  const cont = document.getElementById('regVehiculos');
  if (!cont) return;
  cont.insertAdjacentHTML('beforeend', vehiculoBlockHtml(idx, 'Vehículo', 'regVeh'));
  state.numVehiculosForm++;
}

function addMoto() {
  if (state.numMotosForm >= 4) return showAlert('registro', 'Máximo 4 motos', 'error');
  const idx = state.numMotosForm;
  const cont = document.getElementById('regMotos');
  if (!cont) return;
  cont.insertAdjacentHTML('beforeend', vehiculoBlockHtml(idx, 'Moto', 'regMot'));
  state.numMotosForm++;
}

function addBici() {
  if (state.numBicisForm >= 2) return showAlert('registro', 'Máximo 2 bicicletas', 'error');
  const idx = state.numBicisForm;
  const cont = document.getElementById('regBicis');
  if (!cont) return;
  cont.insertAdjacentHTML('beforeend', `
    <div class="residente-block">
      <h4>Bicicleta ${idx + 1}</h4>
      <div class="field-row">
        <div class="field"><label>Marca</label><input type="text" id="regBici${idx}_marca"></div>
        <div class="field"><label>Color</label><input type="text" id="regBici${idx}_color"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Clase</label><input type="text" id="regBici${idx}_clase"></div>
        <div class="field"><label>Serial</label><input type="text" id="regBici${idx}_serial"></div>
      </div>
    </div>
  `);
  state.numBicisForm++;
}

function addMascota() {
  if (state.numMascotasForm >= 4) return showAlert('registro', 'Máximo 4 mascotas', 'error');
  const idx = state.numMascotasForm;
  const cont = document.getElementById('regMascotas');
  if (!cont) return;
  cont.insertAdjacentHTML('beforeend', `
    <div class="residente-block">
      <h4>Mascota ${idx + 1}</h4>
      <div class="field-row">
        <div class="field"><label>Tipo</label><input type="text" id="regMas${idx}_tipo" placeholder="Perro, Gato, ..."></div>
        <div class="field"><label>Nombre</label><input type="text" id="regMas${idx}_nombre"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Raza</label><input type="text" id="regMas${idx}_raza"></div>
        <div class="field"><label>Color</label><input type="text" id="regMas${idx}_color"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Sexo</label><input type="text" id="regMas${idx}_sexo"></div>
        <div class="field"><label>Vacuna al día</label><input type="text" id="regMas${idx}_vacuna" placeholder="Sí / No"></div>
      </div>
    </div>
  `);
  state.numMascotasForm++;
}

function addContacto() {
  if (state.numContactosForm >= 2) return showAlert('registro', 'Máximo 2 contactos', 'error');
  const idx = state.numContactosForm;
  const cont = document.getElementById('regContactos');
  if (!cont) return;
  cont.insertAdjacentHTML('beforeend', `
    <div class="residente-block">
      <h4>Contacto ${idx + 1}</h4>
      <div class="field-row">
        <div class="field"><label>Nombre</label><input type="text" id="regCon${idx}_nombre"></div>
        <div class="field"><label>Parentesco</label><input type="text" id="regCon${idx}_parent"></div>
      </div>
      <div class="field"><label>Teléfono</label><input type="text" id="regCon${idx}_tel" inputmode="tel"></div>
    </div>
  `);
  state.numContactosForm++;
}

function vehiculoBlockHtml(idx, label, prefix) {
  return `
    <div class="residente-block">
      <h4>${label} ${idx + 1}</h4>
      <div class="field-row">
        <div class="field"><label>Marca</label><input type="text" id="${prefix}${idx}_marca"></div>
        <div class="field"><label>Tipo / Clase</label><input type="text" id="${prefix}${idx}_tipo"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Color</label><input type="text" id="${prefix}${idx}_color"></div>
        <div class="field"><label>Placa</label><input type="text" id="${prefix}${idx}_placa" style="text-transform:uppercase"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Modelo (año)</label><input type="text" id="${prefix}${idx}_modelo" inputmode="numeric"></div>
        <div class="field"><label>Tag</label><input type="text" id="${prefix}${idx}_tag" placeholder="T-001 o vacío"></div>
      </div>
    </div>
  `;
}

async function flujoRegistrar() {
  // Construir payload
  const residentes = [];
  for (let i = 0; i < state.numResidentesForm; i++) {
    const nombre = val('regRes' + i + '_nombre');
    const cc = val('regRes' + i + '_cc').replace(/[.\-\s]/g, '');
    if (!nombre || !cc) {
      return showAlert('registro', 'Todos los residentes requieren nombre y cédula', 'error');
    }
    residentes.push({
      nombre, cc,
      correo: val('regRes' + i + '_correo'),
      cel: val('regRes' + i + '_cel'),
      parentesco: val('regRes' + i + '_parentesco')
    });
  }
  const menores = [];
  for (let i = 0; i < state.numMenoresForm; i++) {
    const nombre = val('regMen' + i + '_nombre');
    if (!nombre) continue;
    menores.push({ nombre, edad: val('regMen' + i + '_edad'), parentesco: val('regMen' + i + '_parent') });
  }
  const vehiculos = [];
  for (let i = 0; i < state.numVehiculosForm; i++) {
    const placa = val('regVeh' + i + '_placa');
    if (!placa) continue;
    vehiculos.push({
      marca: val('regVeh' + i + '_marca'),
      tipo: val('regVeh' + i + '_tipo'),
      color: val('regVeh' + i + '_color'),
      placa, modelo: val('regVeh' + i + '_modelo'),
      tag: val('regVeh' + i + '_tag')
    });
  }
  const motos = [];
  for (let i = 0; i < state.numMotosForm; i++) {
    const placa = val('regMot' + i + '_placa');
    if (!placa) continue;
    motos.push({
      marca: val('regMot' + i + '_marca'),
      tipo: val('regMot' + i + '_tipo'),
      color: val('regMot' + i + '_color'),
      placa, modelo: val('regMot' + i + '_modelo'),
      tag: val('regMot' + i + '_tag')
    });
  }
  const bicis = [];
  for (let i = 0; i < state.numBicisForm; i++) {
    const marca = val('regBici' + i + '_marca');
    if (!marca) continue;
    bicis.push({
      marca, color: val('regBici' + i + '_color'),
      clase: val('regBici' + i + '_clase'),
      serial: val('regBici' + i + '_serial')
    });
  }
  const mascotas = [];
  for (let i = 0; i < state.numMascotasForm; i++) {
    const nombre = val('regMas' + i + '_nombre');
    if (!nombre) continue;
    mascotas.push({
      tipo: val('regMas' + i + '_tipo'),
      nombre, raza: val('regMas' + i + '_raza'),
      color: val('regMas' + i + '_color'),
      sexo: val('regMas' + i + '_sexo'),
      vacuna: val('regMas' + i + '_vacuna')
    });
  }
  const contactos = [];
  for (let i = 0; i < state.numContactosForm; i++) {
    const nombre = val('regCon' + i + '_nombre');
    if (!nombre) continue;
    contactos.push({ nombre, parentesco: val('regCon' + i + '_parent'), tel: val('regCon' + i + '_tel') });
  }

  const payload = {
    action: 'registrarResidente',
    apto: state.apto,
    residentes, menores, vehiculos, motos, bicis, mascotas, contactos
  };

  const btn = document.getElementById('btnRegistrar');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }

  try {
    const r = await apiPost(payload);
    if (!r.ok) {
      showAlert('registro', r.error || 'Error al registrar', 'error');
      return;
    }
    showView('exito');
    const alertExito = document.getElementById('alert-exito');
    if (alertExito) alertExito.textContent = 'Registro exitoso. Su información ha sido guardada.';
  } catch (e) {
    showAlert('registro', 'Error de red: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Registrarme como residente'; }
  }
}

// ============ FLUJO 4: EDITAR RESIDENTE ============
function initFormularioEdicion(datos) {
  const editNombre = document.getElementById('editNombre');
  if (editNombre) editNombre.textContent = datos.nombre;
  const editSlot = document.getElementById('editSlot');
  if (editSlot) editSlot.textContent = state.slot;
  const editApto = document.getElementById('editApto');
  if (editApto) editApto.textContent = state.apto;
  const editNombreInput = document.getElementById('editNombreInput');
  if (editNombreInput) editNombreInput.value = datos.nombre || '';
  const editCcInput = document.getElementById('editCcInput');
  if (editCcInput) editCcInput.value = datos.cc || '';
  const editParentesco = document.getElementById('editParentesco');
  if (editParentesco) editParentesco.value = datos.parentesco || '';
  const editCel = document.getElementById('editCel');
  if (editCel) editCel.value = datos.cel || '';
  const editCorreo = document.getElementById('editCorreo');
  if (editCorreo) editCorreo.value = datos.correo || '';
}

async function flujoActualizar() {
  const datos = {
    nombre: val('editNombreInput'),
    cc: val('editCcInput').replace(/[.\-\s]/g, ''),
    correo: val('editCorreo'),
    cel: val('editCel'),
    parentesco: val('editParentesco')
  };
  if (!datos.nombre || !datos.cc) {
    return showAlert('editar', 'Nombre y cédula son obligatorios', 'error');
  }
  const payload = {
    action: 'actualizarResidente',
    apto: state.apto, cc: datos.cc, slot: state.slot, datos
  };

  const btn = document.getElementById('btnGuardarEdit');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const r = await apiPost(payload);
    if (!r.ok) {
      showAlert('editar', r.error || 'Error al guardar', 'error');
      return;
    }
    showView('exito');
    const alertExito = document.getElementById('alert-exito');
    if (alertExito) alertExito.textContent = 'Datos actualizados correctamente.';
  } catch (e) {
    showAlert('editar', 'Error de red: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar mis datos'; }
  }
}

// ============ FLUJO 5: CLEAR RESIDENTE (desde index.html modo edición) ============
function bindClearResidente() {
  // Esta función se llama desde el index.html cuando el usuario está en modo edición
  // y ha cargado sus datos. Agrega la zona de borrado al final del formulario.
  const form = document.getElementById('form-editar');
  if (!form) return;
  // Evitar duplicar
  if (document.getElementById('zona-borrado')) return;

  const zona = document.createElement('div');
  zona.className = 'zona-borrado';
  zona.id = 'zona-borrado';
  zona.innerHTML = `
    <h4>⚠️ Borrar datos de residentes</h4>
    <p>Si un residente o arrendatario cambió (se fue del apartamento), use esta opción para limpiar sus datos. Solo el propietario puede hacerlo.</p>
    <p><strong>Esto borrará:</strong> secciones 5, 5.1, 6, 7, 9 y 10 (residentes, menores, vehículos, motos, bicis, mascotas).</p>
    <p><strong>NO se borra:</strong> sus datos como propietario, parqueaderos, matrículas, ni la firma.</p>
    <button type="button" class="btn-danger" id="btnClearResidente">borrado de datos residente</button>
  `;
  form.appendChild(zona);

  const btn = document.getElementById('btnClearResidente');
  if (btn) btn.addEventListener('click', confirmarClear);
}

function confirmarClear() {
  // Modal de confirmación
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <h3>⚠️ Confirmar borrado</h3>
      <p>Esto borrará los residentes y vehículos del apartamento. ¿Confirmas?</p>
      <div class="modal-buttons">
        <button type="button" class="btn-secondary" id="modalCancel">↩️ Cancelar</button>
        <button type="button" class="btn-danger" id="modalConfirm">Sí, borrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('modalCancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modalConfirm').addEventListener('click', () => {
    overlay.remove();
    ejecutarClear();
  });
}

async function ejecutarClear() {
  // Necesita numForm, apto, ccProp del registro en edición
  const numForm = (typeof editState !== 'undefined' && editState.numForm) ? editState.numForm : '';
  const apto = (typeof editState !== 'undefined' && editState.apto) ? editState.apto : '';
  const ccProp = (typeof editState !== 'undefined' && editState.ccProp) ? editState.ccProp : '';
  if (!numForm || !apto || !ccProp) {
    return alert('No se pueden obtener los datos del registro. Recargue la página.');
  }
  const btn = document.getElementById('btnClearResidente');
  if (btn) { btn.disabled = true; btn.textContent = 'Borrando...'; }
  try {
    const r = await apiPost({
      action: 'clearResidente',
      numForm, apto, cc: ccProp
    });
    if (!r.ok) {
      alert('Error: ' + (r.error || 'No se pudo borrar'));
      return;
    }
    alert('✅ ' + (r.message || 'Datos del residente eliminados.'));
    location.reload();
  } catch (e) {
    alert('Error de red: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'borrado de datos residente'; }
  }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function () {
  // Botones de la vista INICIAL
  const btnCont = document.getElementById('btnContinuar');
  if (btnCont) btnCont.addEventListener('click', flujoInicial);

  // Botones de la vista CON_DATOS
  const btnVer = document.getElementById('btnVerificar');
  if (btnVer) btnVer.addEventListener('click', flujoVerificarCc);
  const btnVolverCD = document.getElementById('btnVolverConDatos');
  if (btnVolverCD) btnVolverCD.addEventListener('click', () => showView('inicial'));

  // Botones de la vista NO_EXISTE
  const btnVolverNE = document.getElementById('btnVolverNe');
  if (btnVolverNE) btnVolverNE.addEventListener('click', () => showView('inicial'));

  // Botones de la vista REGISTRO
  const btnAddRes = document.getElementById('btnAddResidente');
  if (btnAddRes) btnAddRes.addEventListener('click', addResidente);
  const btnAddMen = document.getElementById('btnAddMenor');
  if (btnAddMen) btnAddMen.addEventListener('click', addMenor);
  const btnAddVeh = document.getElementById('btnAddVehiculo');
  if (btnAddVeh) btnAddVeh.addEventListener('click', addVehiculo);
  const btnAddMot = document.getElementById('btnAddMoto');
  if (btnAddMot) btnAddMot.addEventListener('click', addMoto);
  const btnAddBici = document.getElementById('btnAddBici');
  if (btnAddBici) btnAddBici.addEventListener('click', addBici);
  const btnAddMas = document.getElementById('btnAddMascota');
  if (btnAddMas) btnAddMas.addEventListener('click', addMascota);
  const btnAddCon = document.getElementById('btnAddContacto');
  if (btnAddCon) btnAddCon.addEventListener('click', addContacto);
  const btnReg = document.getElementById('btnRegistrar');
  if (btnReg) btnReg.addEventListener('click', flujoRegistrar);
  const btnCancelReg = document.getElementById('btnCancelarReg');
  if (btnCancelReg) btnCancelReg.addEventListener('click', () => showView('inicial'));

  // Botones de la vista EDITAR
  const btnGuardar = document.getElementById('btnGuardarEdit');
  if (btnGuardar) btnGuardar.addEventListener('click', flujoActualizar);
  const btnCancelEdit = document.getElementById('btnCancelarEdit');
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => showView('inicial'));

  // Botón de EXITO
  const btnVolverIni = document.getElementById('btnVolverInicio');
  if (btnVolverIni) btnVolverIni.addEventListener('click', () => {
    // Reset STATE
    state.apto = null; state.numForm = null; state.cc = null;
    state.slot = null; state.nombre = null;
    showView('inicial');
  });

  // Si estamos en index.html (modo edición cargado), bind clear
  bindClearResidente();
});
