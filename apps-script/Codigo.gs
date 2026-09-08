// =====================================================================
// Santa Sofía Club Residencial V.I.S — Backend Apps Script formulario público
// Adaptado desde Cerro Azul v2 (Sep-2026):
//   - Esquema de 143 columnas
//   - Matrículas de apartamentos/parqueaderos desde Sheet nativo Santa Sofía
//   - Si la matrícula está pendiente/XXXX/no disponible, el residente debe
//     escribirla manualmente para poder enviar el formulario.
// Endpoints:
//   POST (no-CORS) -> action=submit -> crea o actualiza fila
//   GET            -> action=lookup  -> devuelve fila existente por N° Formulario + N° Apto
//   GET            -> action=nextId  -> devuelve el siguiente N° Formulario disponible
//   GET            -> action=lookupMatApto  -> devuelve matrícula de un apto
//   GET            -> action=lookupMatParq  -> devuelve matrícula de una celda de parqueadero
// =====================================================================

const SHEET_ID = '1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo';
const SHEET_NAME = 'Registros';
const HEADER_ROW = 1;
const NUM_COLS = 143; // 0..142 (era 138, ahora 143 con K..Q expandidos)

// Sheet de matrículas (referencia, solo lectura)
const MATRICULAS_SHEET_ID = '1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w';
const MATRICULAS_APTOS = 'Apartamentos';
const MATRICULAS_PARQ  = 'Parqueaderos';

// Cache en memoria de las tablas de matrículas (se reconstruye por request,
// las tablas son chicas: ~800 filas en total)
let _cacheAptos = null; // { aptoStr -> {matricula, fuente, requiereManual, motivo} }
let _cacheParq  = null; // { key -> {matricula, tipo, requiereManual, motivo} }

// Columna A (index 0) = N° Formulario
const COL_NUM_FORM = 0;
const COL_FECHA_REG = 1;
const COL_FECHA_EDIT = 2;
const COL_APTO = 3;
// Col 142 (última) = Hash Dedupe

// ---------------------------------------------------------------------
// doGet: lookup / nextId / lookupMatApto / lookupMatParq
// ---------------------------------------------------------------------
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'nextId') {
      return jsonOut({ ok: true, nextId: getNextFormId() });
    }
    if (action === 'lookup') {
      const numForm = String(e.parameter.numForm || '').trim();
      const apto = String(e.parameter.apto || '').trim();
      const row = findRowByNumFormAndApto(numForm, apto);
      if (!row) {
        return jsonOut({ ok: false, error: 'No se encontró ningún registro con ese N° de formulario y N° de apartamento. Verifica los datos e inténtalo de nuevo.' });
      }
      return jsonOut({ ok: true, row: rowToObject(row) });
    }
    if (action === 'lookupMatApto') {
      const apto = String(e.parameter.apto || '').trim();
      const r = lookupMatriculaApto(apto);
      return jsonOut(r);
    }
    if (action === 'lookupMatParq') {
      const celda = String(e.parameter.celda || '').trim();
      const r = lookupMatriculaParq(celda);
      return jsonOut(r);
    }
    return jsonOut({ ok: false, error: 'Acción no reconocida.' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------------
// doPost: submit (crea o actualiza)
// ---------------------------------------------------------------------
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }
    const result = submitRecord(payload);
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------------
// Crea o actualiza una fila en el Sheet
// ---------------------------------------------------------------------
function submitRecord(data) {
  // Validaciones mínimas del lado servidor
  const apto = String(data.apto || '').trim();
  if (!apto) return { ok: false, error: 'Falta N° de apartamento.' };
  const diligencia = String(data.diligencia || '').trim();
  if (!['Propietario','Arrendatario','Tenedor / Otro'].includes(diligencia)) {
    return { ok: false, error: 'Diligencia como debe ser Propietario, Arrendatario o Tenedor / Otro.' };
  }
  const nombreTitular = String(data.nombreProp || '').trim();
  if (!nombreTitular) return { ok: false, error: 'Falta nombre del propietario/titular.' };
  const ccTitular = String(data.ccProp || '').trim();
  if (!ccTitular) return { ok: false, error: 'Falta cédula del propietario/titular.' };
  const correoTitular = String(data.correoProp || '').trim();
  if (!correoTitular || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoTitular)) {
    return { ok: false, error: 'Correo del titular inválido.' };
  }
  const celTitular = String(data.celProp || '').trim();
  if (!celTitular) return { ok: false, error: 'Falta celular del titular.' };

  if (!data.autDatos)   return { ok: false, error: 'Debe autorizar el tratamiento de datos personales.' };
  if (!data.firmaNom)   return { ok: false, error: 'Falta nombre en la firma.' };
  if (!data.firmaCC)    return { ok: false, error: 'Falta cédula en la firma.' };

  // Si la matrícula del apto está pendiente/XXXX/no disponible, el residente
  // debe escribirla manualmente. Si la base la trae válida, se acepta.
  const matriculaApto = String(data.matriculaApto || '').trim();
  const lookupApto = lookupMatriculaApto(apto);
  if (lookupApto.requiereManual && !matriculaApto) {
    return { ok: false, error: 'La administración no tiene disponible la matrícula inmobiliaria del apartamento ' + apto + '. Para continuar, debe escribirla manualmente según su escritura, certificado de tradición o documento de propiedad.' };
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const editMode = data.editMode === true || String(data.editMode) === 'true';
  const submittedNumForm = String(data.numForm || '').trim();

  let targetRow;       // número de fila en Sheets (1-based)
  let assignedNumForm; // número de formulario que se va a guardar
  let fechaRegistroOriginal = null;

  if (editMode) {
    // Modo edición: verificar que numForm+apto coincidan con una fila existente
    const found = findRowByNumFormAndApto(submittedNumForm, apto);
    if (!found) {
      return { ok: false, error: 'N° de formulario o N° de apartamento no coinciden con un registro existente. No se puede editar.' };
    }
    targetRow = found.rowNumber;
    assignedNumForm = submittedNumForm;
    fechaRegistroOriginal = found.values[COL_FECHA_REG];
  } else {
    // Modo creación: validar que NO exista ya un registro con ese N° Apto
    const existing = findRowByApto(apto);
    if (existing) {
      return { ok: false, error: 'Ya existe un registro para el apartamento ' + apto + '. Tu N° de formulario es ' + existing.values[COL_NUM_FORM] + '. Usa la opción "EDITAR MI REGISTRO" para modificarlo.' };
    }
    // Buscar siguiente fila vacía
    const last = sheet.getLastRow();
    targetRow = Math.max(last + 1, HEADER_ROW + 1);
    assignedNumForm = getNextFormId();
  }

  // Construir el array de valores
  const row = buildRowFromPayload(data, assignedNumForm, fechaRegistroOriginal);
  sheet.getRange(targetRow, 1, 1, NUM_COLS).setValues([row]);

  return {
    ok: true,
    numForm: assignedNumForm,
    apto: apto,
    editMode: editMode,
    rowNumber: targetRow,
    message: editMode
      ? 'Registro actualizado correctamente. Tu N° de formulario sigue siendo ' + assignedNumForm + '.'
      : 'Registro creado correctamente. Tu N° de formulario es ' + assignedNumForm + '. GUÁRDALO en un lugar seguro: lo necesitarás para volver a editar tu información.'
  };
}

// ---------------------------------------------------------------------
// Convierte el payload del cliente en un array de 143 columnas
// Esquema v2: K..Q son los nuevos campos de parqueadero/matrícula
// ---------------------------------------------------------------------
function buildRowFromPayload(d, numForm, fechaRegistroOriginal) {
  const now = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
  const today = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');

  const v = new Array(NUM_COLS).fill('');

  v[COL_NUM_FORM]   = numForm;
  v[COL_FECHA_REG]  = fechaRegistroOriginal || now;
  v[COL_FECHA_EDIT] = now;
  v[COL_APTO]       = String(d.apto || '').trim();
  v[4]              = String(d.diligencia || '').trim();  // Diligencia como
  v[5]              = String(d.nombreProp || '').trim();
  v[6]              = String(d.ccProp || '').trim();
  v[7]              = String(d.correoProp || '').trim().toLowerCase();
  v[8]              = String(d.celProp || '').trim();
  v[9]              = String(d.telFijoProp || '').trim();

  // v2 — Parqueaderos y matrículas (cols K..Q = 10..16)
  v[10] = String(d.parq1Celda || '').trim();    // K: N° Parqueadero 1
  v[11] = String(d.parq1Mat   || '').trim();    // L: Matrícula Parqueadero 1
  v[12] = String(d.parq2Celda || '').trim();    // M: N° Parqueadero 2
  v[13] = String(d.parq2Mat   || '').trim();    // N: Matrícula Parqueadero 2
  v[14] = String(d.matriculaApto || '').trim(); // O: Matrícula del Apto
  const lookupAptoRow = lookupMatriculaApto(d.apto);
  const revisionManual = lookupAptoRow.requiereManual === true;
  v[15] = (d.requiereRevision || revisionManual) ? 'Sí' : 'No';     // P: Requiere Revisión Matrículas
  let obsMat = String(d.observMatriculas || '').trim();
  if (revisionManual && obsMat.indexOf('Matrícula no disponible') === -1) {
    obsMat = (obsMat ? obsMat + ' | ' : '') + 'Matrícula no disponible en base administrativa; digitada manualmente por el residente.';
  }
  v[16] = obsMat; // Q: Observaciones Matrículas

  // v2 — Lo que era M (Nombre Arrendatario) ahora es R (17), CC Arrendatario S (18), etc.
  // 2. Arrendatario
  v[17]             = String(d.nombreArr || '').trim();
  v[18]             = String(d.ccArr || '').trim();
  v[19]             = String(d.correoArr || '').trim().toLowerCase();
  v[20]             = String(d.celArr || '').trim();

  // 3. Parqueadero autorizado a tercero
  v[21]             = String(d.parqTerNom || '').trim();
  v[22]             = String(d.parqTerApto || '').trim();
  v[23]             = String(d.parqTerCel || '').trim();

  // 4. Inmobiliaria
  v[24]             = String(d.inmobRazon || '').trim();
  v[25]             = String(d.inmobNit || '').trim();
  v[26]             = String(d.inmobContacto || '').trim();
  v[27]             = String(d.inmobTel || '').trim();
  v[28]             = String(d.inmobCorreo || '').trim().toLowerCase();

  // 5. Residentes (4 filas: cols 29-48)
  const res = Array.isArray(d.residentes) ? d.residentes : [];
  for (let i = 0; i < 4; i++) {
    const r = res[i] || {};
    v[29 + i*5 + 0] = String(r.nombre || '').trim();
    v[29 + i*5 + 1] = String(r.cc || '').trim();
    v[29 + i*5 + 2] = String(r.correo || '').trim().toLowerCase();
    v[29 + i*5 + 3] = String(r.cel || '').trim();
    v[29 + i*5 + 4] = String(r.parent || '').trim();
  }

  // 5.1 Menores (4 filas: cols 49-60)
  const men = Array.isArray(d.menores) ? d.menores : [];
  for (let i = 0; i < 4; i++) {
    const m = men[i] || {};
    v[49 + i*3 + 0] = String(m.nombre || '').trim();
    v[49 + i*3 + 1] = m.edad != null && m.edad !== '' ? String(m.edad) : '';
    v[49 + i*3 + 2] = String(m.parent || '').trim();
  }

  // 6. Vehículos (2: 61-72)
  const veh = Array.isArray(d.vehiculos) ? d.vehiculos : [];
  for (let i = 0; i < 2; i++) {
    const x = veh[i] || {};
    v[61 + i*6 + 0] = String(x.marca || '').trim();
    v[61 + i*6 + 1] = String(x.tipo || '').trim();
    v[61 + i*6 + 2] = String(x.color || '').trim();
    v[61 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[61 + i*6 + 4] = String(x.modelo || '').trim();
    v[61 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 6. Motos (2: 73-84)
  const mot = Array.isArray(d.motos) ? d.motos : [];
  for (let i = 0; i < 2; i++) {
    const x = mot[i] || {};
    v[73 + i*6 + 0] = String(x.marca || '').trim();
    v[73 + i*6 + 1] = String(x.tipo || '').trim();
    v[73 + i*6 + 2] = String(x.color || '').trim();
    v[73 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[73 + i*6 + 4] = String(x.modelo || '').trim();
    v[73 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 7. Bicicletas (2: 85-92)
  const bic = Array.isArray(d.bicis) ? d.bicis : [];
  for (let i = 0; i < 2; i++) {
    const b = bic[i] || {};
    v[85 + i*4 + 0] = String(b.marca || '').trim();
    v[85 + i*4 + 1] = String(b.color || '').trim();
    v[85 + i*4 + 2] = String(b.clase || '').trim();
    v[85 + i*4 + 3] = String(b.serial || '').trim();
  }

  // 8. Dispositivos (93-94 = llaveros/tags aut, 95-109 = 3 dispositivos)
  v[93]             = d.llaverosAut != null && d.llaverosAut !== '' ? String(d.llaverosAut) : '';
  v[94]             = d.tagsAut != null && d.tagsAut !== '' ? String(d.tagsAut) : '';
  const disp = Array.isArray(d.dispositivos) ? d.dispositivos : [];
  for (let i = 0; i < 3; i++) {
    const x = disp[i] || {};
    v[95 + i*5 + 0] = String(x.tipo || '').trim();
    v[95 + i*5 + 1] = String(x.codigo || '').trim();
    v[95 + i*5 + 2] = String(x.placa || '').trim().toUpperCase();
    v[95 + i*5 + 3] = String(x.fecha || '').trim();
    v[95 + i*5 + 4] = String(x.recibe || '').trim();
  }

  // 9. Mascotas (2: 110-129)
  const mas = Array.isArray(d.mascotas) ? d.mascotas : [];
  for (let i = 0; i < 2; i++) {
    const m = mas[i] || {};
    v[110 + i*10 + 0] = String(m.tipo || '').trim();
    v[110 + i*10 + 1] = String(m.nombre || '').trim();
    v[110 + i*10 + 2] = String(m.raza || '').trim();
    v[110 + i*10 + 3] = String(m.color || '').trim();
    v[110 + i*10 + 4] = String(m.sexo || '').trim();
    v[110 + i*10 + 5] = String(m.vacuna || '').trim();
    v[110 + i*10 + 6] = m.manejoEspecial === true || String(m.manejoEspecial) === 'true' ? 'Sí' : (m.manejoEspecial === false || String(m.manejoEspecial) === 'false' ? 'No' : '');
    v[110 + i*10 + 7] = String(m.registro || '').trim();
    v[110 + i*10 + 8] = String(m.aseguradora || '').trim();
    v[110 + i*10 + 9] = String(m.poliza || '').trim();
  }

  // 10. Emergencias (2: 130-135)
  const eme = Array.isArray(d.emergencias) ? d.emergencias : [];
  for (let i = 0; i < 2; i++) {
    const e = eme[i] || {};
    v[130 + i*3 + 0] = String(e.nombre || '').trim();
    v[130 + i*3 + 1] = String(e.parent || '').trim();
    v[130 + i*3 + 2] = String(e.tel || '').trim();
  }

  // 11. Autorizaciones + firma
  v[136]            = d.autDatos   ? 'Sí' : 'No';
  v[137]            = d.autMenores ? 'Sí' : 'No';
  v[138]            = d.autCom     ? 'Sí' : 'No';
  v[139]            = String(d.firmaNom || '').trim();
  v[140]            = String(d.firmaCC || '').trim();
  v[141]            = String(d.firmaFecha || today);

  // 142 = Hash Dedupe (sha256 de apto + cc titular + cc firma)
  const hashInput = (v[COL_APTO] || '') + '|' + (v[6] || '') + '|' + (v[140] || '');
  v[142]            = hashInput ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput)
                                  .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16) : '';

  return v;
}

// ---------------------------------------------------------------------
// LOOKUP DE MATRÍCULAS (consulta el Sheet nativo de matrículas Santa Sofía)
// ---------------------------------------------------------------------

// Normaliza N° Apto / unidad: quita puntos, comas, espacios y deja mayúsculas.
function normApto(s) {
  return String(s || '').replace(/[.,\s]/g, '').trim().toUpperCase();
}

function normParqKey(s) {
  const raw = String(s || '').trim().toUpperCase();
  const n = raw.match(/(\d+)/);
  const num = n ? n[1] : raw.replace(/[^A-Z0-9]/g, '');
  if (raw.indexOf('MOTO') >= 0) return 'MOTO ' + num;
  if (raw.indexOf('CARRO') >= 0) return 'CARRO ' + num;
  return num;
}

function isMatriculaPendiente(mat) {
  const s = String(mat || '').trim().toUpperCase().replace(/\s/g, '');
  return !s || s.indexOf('X') >= 0 || s.indexOf('PEND') >= 0 || s.indexOf('PORVER') >= 0;
}

function manualResponse(kind, unidad, motivo) {
  return {
    ok: true,
    encontrado: false,
    matricula: '',
    requiereManual: true,
    motivo: motivo || 'matricula_no_disponible',
    unidad: unidad || '',
    mensaje: 'La administración no tiene disponible la matrícula inmobiliaria de esta unidad. Por favor escríbala manualmente según su escritura, certificado de tradición o documento de propiedad.'
  };
}

// Devuelve {ok, encontrado, matricula, fuente, requiereManual, motivo}
function lookupMatriculaApto(aptoRaw) {
  const apto = normApto(aptoRaw);
  if (!apto) return { ok: false, encontrado: false, requiereManual: false, error: 'N° de apartamento vacío.' };
  if (!_cacheAptos) _cacheAptos = buildCacheAptos();
  const hit = _cacheAptos[apto];
  if (!hit) return manualResponse('apto', apto, 'apto_no_encontrado');
  if (hit.requiereManual) return manualResponse('apto', apto, hit.motivo || 'matricula_pendiente');
  return { ok: true, encontrado: true, matricula: hit.matricula, fuente: hit.fuente, requiereManual: false, motivo: '' };
}

function buildCacheAptos() {
  const cache = {};
  const ss = SpreadsheetApp.openById(MATRICULAS_SHEET_ID);
  const sh = ss.getSheetByName(MATRICULAS_APTOS);
  if (!sh) return cache;
  const last = sh.getLastRow();
  if (last < 6) return cache;
  // Santa Sofía: fila 5 headers. C: Apto, H: Matrícula, I: Estado del Folio.
  const data = sh.getRange(6, 1, last - 5, 9).getValues();
  for (const row of data) {
    const apto = normApto(row[2]);
    const mat  = String(row[7] || '').trim();
    const estado = String(row[8] || '').trim();
    if (!apto) continue;
    if (isMatriculaPendiente(mat)) {
      cache[apto] = { matricula: '', fuente: MATRICULAS_APTOS, requiereManual: true, motivo: estado || 'matricula_pendiente' };
    } else {
      cache[apto] = { matricula: mat, fuente: MATRICULAS_APTOS, requiereManual: false, motivo: '' };
    }
  }
  return cache;
}

// Devuelve {ok, encontrado, matricula, tipo, requiereManual, motivo}
function lookupMatriculaParq(celdaRaw) {
  const key = normParqKey(celdaRaw);
  if (!key) return { ok: false, encontrado: false, requiereManual: false, error: 'Celda de parqueadero vacía.' };
  if (!_cacheParq) _cacheParq = buildCacheParq();
  const hit = _cacheParq[key] || _cacheParq[key.replace(/^(MOTO|CARRO)\s+/, '')];
  if (!hit) return manualResponse('parq', key, 'parqueadero_no_encontrado');
  if (hit.requiereManual) return manualResponse('parq', key, hit.motivo || 'matricula_pendiente');
  return { ok: true, encontrado: true, matricula: hit.matricula, tipo: hit.tipo, requiereManual: false, motivo: '' };
}

function buildCacheParq() {
  const cache = {};
  const ss = SpreadsheetApp.openById(MATRICULAS_SHEET_ID);
  const sh = ss.getSheetByName(MATRICULAS_PARQ);
  if (!sh) return cache;
  const last = sh.getLastRow();
  if (last < 6) return cache;
  // Santa Sofía: fila 5 headers. B: Tipo, C: Nro Parqueadero, H: Matrícula, I: Estado.
  const data = sh.getRange(6, 1, last - 5, 9).getValues();
  for (const row of data) {
    const tipoRaw = String(row[1] || '').trim();
    const unidadRaw = String(row[2] || '').trim();
    const mat = String(row[7] || '').trim();
    const estado = String(row[8] || '').trim();
    if (!unidadRaw) continue;
    const tipo = tipoRaw.toUpperCase().indexOf('MOTO') >= 0 ? 'Moto' : 'Carro';
    const keyTyped = normParqKey(tipo + ' ' + unidadRaw);
    const keyRaw = normParqKey(unidadRaw);
    const obj = isMatriculaPendiente(mat)
      ? { matricula: '', tipo, requiereManual: true, motivo: estado || 'matricula_pendiente' }
      : { matricula: mat, tipo, requiereManual: false, motivo: '' };
    cache[keyTyped] = obj;
    cache[keyRaw] = obj;
  }
  return cache;
}

// ---------------------------------------------------------------------
// Búsquedas
// ---------------------------------------------------------------------
function findRowByApto(apto) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return null;
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_APTO]).trim() === String(apto).trim()) {
      return { rowNumber: HEADER_ROW + 1 + i, values: data[i] };
    }
  }
  return null;
}

function findRowByNumFormAndApto(numForm, apto) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return null;
  const data = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_NUM_FORM]).trim() === String(numForm).trim() &&
        String(data[i][COL_APTO]).trim() === String(apto).trim()) {
      return { rowNumber: HEADER_ROW + 1 + i, values: data[i] };
    }
  }
  return null;
}

// Devuelve el siguiente N° Formulario correlativo: SS-0001, SS-0002, ...
function getNextFormId() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return 'SS-0001';
  const ids = sheet.getRange(HEADER_ROW + 1, COL_NUM_FORM + 1, last - HEADER_ROW, 1).getValues();
  let max = 0;
  for (const r of ids) {
    const s = String(r[0] || '');
    const m = s.match(/^SS-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return 'SS-' + String(max + 1).padStart(4, '0');
}

// Convierte una fila (array de 143) en objeto JS para enviar al cliente en modo edición
function rowToObject(rowArr) {
  return {
    numForm: String(rowArr[COL_NUM_FORM] || ''),
    fechaRegistro: String(rowArr[COL_FECHA_REG] || ''),
    fechaEdicion: String(rowArr[COL_FECHA_EDIT] || ''),
    apto: String(rowArr[COL_APTO] || ''),
    diligencia: String(rowArr[4] || ''),
    nombreProp: String(rowArr[5] || ''),
    ccProp: String(rowArr[6] || ''),
    correoProp: String(rowArr[7] || ''),
    celProp: String(rowArr[8] || ''),
    telFijoProp: String(rowArr[9] || ''),
    // v2 — Parqueaderos y matrículas
    parq1Celda: String(rowArr[10] || ''),
    parq1Mat:   String(rowArr[11] || ''),
    parq2Celda: String(rowArr[12] || ''),
    parq2Mat:   String(rowArr[13] || ''),
    matriculaApto: String(rowArr[14] || ''),
    requiereRevision: String(rowArr[15] || ''),
    observMatriculas: String(rowArr[16] || ''),
    // Resto (desplazado +5 vs v1)
    nombreArr: String(rowArr[17] || ''),
    ccArr: String(rowArr[18] || ''),
    correoArr: String(rowArr[19] || ''),
    celArr: String(rowArr[20] || ''),
    parqTerNom: String(rowArr[21] || ''),
    parqTerApto: String(rowArr[22] || ''),
    parqTerCel: String(rowArr[23] || ''),
    inmobRazon: String(rowArr[24] || ''),
    inmobNit: String(rowArr[25] || ''),
    inmobContacto: String(rowArr[26] || ''),
    inmobTel: String(rowArr[27] || ''),
    inmobCorreo: String(rowArr[28] || ''),
    residentes: [0,1,2,3].map(i => ({
      nombre: String(rowArr[29 + i*5] || ''),
      cc:     String(rowArr[30 + i*5] || ''),
      correo: String(rowArr[31 + i*5] || ''),
      cel:    String(rowArr[32 + i*5] || ''),
      parent: String(rowArr[33 + i*5] || ''),
    })),
    menores: [0,1,2,3].map(i => ({
      nombre: String(rowArr[49 + i*3] || ''),
      edad:   String(rowArr[50 + i*3] || ''),
      parent: String(rowArr[51 + i*3] || ''),
    })),
    vehiculos: [0,1].map(i => ({
      marca: String(rowArr[61 + i*6] || ''),
      tipo:  String(rowArr[62 + i*6] || ''),
      color: String(rowArr[63 + i*6] || ''),
      placa: String(rowArr[64 + i*6] || ''),
      modelo:String(rowArr[65 + i*6] || ''),
      tag:   String(rowArr[66 + i*6] || ''),
    })),
    motos: [0,1].map(i => ({
      marca: String(rowArr[73 + i*6] || ''),
      tipo:  String(rowArr[74 + i*6] || ''),
      color: String(rowArr[75 + i*6] || ''),
      placa: String(rowArr[76 + i*6] || ''),
      modelo:String(rowArr[77 + i*6] || ''),
      tag:   String(rowArr[78 + i*6] || ''),
    })),
    bicis: [0,1].map(i => ({
      marca: String(rowArr[85 + i*4] || ''),
      color: String(rowArr[86 + i*4] || ''),
      clase: String(rowArr[87 + i*4] || ''),
      serial:String(rowArr[88 + i*4] || ''),
    })),
    llaverosAut: String(rowArr[93] || ''),
    tagsAut:     String(rowArr[94] || ''),
    dispositivos: [0,1,2].map(i => ({
      tipo:  String(rowArr[95 + i*5] || ''),
      codigo:String(rowArr[96 + i*5] || ''),
      placa: String(rowArr[97 + i*5] || ''),
      fecha: String(rowArr[98 + i*5] || ''),
      recibe:String(rowArr[99 + i*5] || ''),
    })),
    mascotas: [0,1].map(i => ({
      tipo: String(rowArr[110 + i*10] || ''),
      nombre: String(rowArr[111 + i*10] || ''),
      raza: String(rowArr[112 + i*10] || ''),
      color: String(rowArr[113 + i*10] || ''),
      sexo: String(rowArr[114 + i*10] || ''),
      vacuna: String(rowArr[115 + i*10] || ''),
      manejoEspecial: String(rowArr[116 + i*10] || ''),
      registro: String(rowArr[117 + i*10] || ''),
      aseguradora: String(rowArr[118 + i*10] || ''),
      poliza: String(rowArr[119 + i*10] || ''),
    })),
    emergencias: [0,1].map(i => ({
      nombre: String(rowArr[130 + i*3] || ''),
      parent: String(rowArr[131 + i*3] || ''),
      tel:    String(rowArr[132 + i*3] || ''),
    })),
    autDatos:   String(rowArr[136] || ''),
    autMenores: String(rowArr[137] || ''),
    autCom:     String(rowArr[138] || ''),
    firmaNom:   String(rowArr[139] || ''),
    firmaCC:    String(rowArr[140] || ''),
    firmaFecha: String(rowArr[141] || ''),
  };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}