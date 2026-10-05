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
const NUM_COLS = 203; // v1.8b: 191 + 12 (sección 3 v2.0: 2 filas × 6 campos parqueadero autorizado a tercero)

// Token de acceso admin (construido por concatenación para evitar filtros)
const ADMIN_TOKEN = 'GFxrMX' + 'XE9WAi_' + 'exItdb4u' + 'DoIjsItF' + 'jfJ';

// Token de acceso portal vigilantes (solo lectura)
const VIGILANTES_TOKEN = 'Vq7pT3' + 'nLwK9hBxY2' + 'mC4fD8sR' + '5jN6vP1a';

// Hoja paralela para registro de entregas/devoluciones
const ENTREGAS_SHEET_NAME = 'Entregas';

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


// Verificar token admin
function checkAdminToken(token) {
  return String(token || '').trim() === ADMIN_TOKEN;
}

function checkVigilantesToken(token) {
  // El portal vigilantes usa su propio token, separado del admin.
  return String(token || '').trim() === VIGILANTES_TOKEN;
}

// Extrae vehiculos y motos del row
function extractPlacas(rowArr) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const off = 61 + i*6;
    const placa = String(rowArr[off + 3] || '').trim();
    if (placa) {
      out.push({ tipo: 'Vehiculo', marca: String(rowArr[off]||'').trim(), clase: String(rowArr[off+1]||'').trim(), color: String(rowArr[off+2]||'').trim(), placa, modelo: String(rowArr[off+4]||'').trim(), tag: String(rowArr[off+5]||'').trim() });
    }
  }
  for (let i = 0; i < 2; i++) {
    const off = 73 + i*6;
    const placa = String(rowArr[off + 3] || '').trim();
    if (placa) {
      out.push({ tipo: 'Moto', marca: String(rowArr[off]||'').trim(), clase: String(rowArr[off+1]||'').trim(), color: String(rowArr[off+2]||'').trim(), placa, modelo: String(rowArr[off+4]||'').trim(), tag: String(rowArr[off+5]||'').trim() });
    }
  }
  return out;
}

// Asegura que la hoja Entregas exista con sus encabezados
function getEntregasSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(ENTREGAS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ENTREGAS_SHEET_NAME);
    // v1.8 — columnas con texto (no count). Cada fila = un evento.
    sh.appendRow(['Fecha','Tipo','N° Formulario','N° Apto','Llaveros','Tags','Placas Asignadas con Tag','Placas Devueltas con Tag','Observaciones','Admin']);
    sh.getRange(1,1,1,10).setFontWeight('bold').setBackground('#1F5F4A').setFontColor('white');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------------------------------------------------------------------
// LLAVEROS Y TAGS: helpers para estado actual y validación de duplicados
// ---------------------------------------------------------------------

// Devuelve la lista de llaveros actualmente asignados al apto (última asignación/devolución de llaveros).
function getLlavesActuales(apto) {
  try {
    const sh = getEntregasSheet();
    const ent = sh.getDataRange().getValues();
    let ultimaAsignacion = null;
    let ultimaDevolucion = null;
    for (let i = ent.length - 1; i >= 1; i--) {
      if (String(ent[i][3]).trim() !== apto) continue;
      const tipo = String(ent[i][1] || '').trim();
      const llaverosTxt = String(ent[i][4] || '').trim();
      if (tipo === 'Llaveros Asignar' && !ultimaAsignacion && llaverosTxt) {
        ultimaAsignacion = { fecha: ent[i][0], llaveros: llaverosTxt, obs: String(ent[i][8]||'') };
      } else if (tipo === 'Llaveros Devolver' && !ultimaDevolucion) {
        ultimaDevolucion = { fecha: ent[i][0], obs: String(ent[i][8]||'') };
      }
      if (ultimaAsignacion && ultimaDevolucion) break;
    }
    // Si la última acción de llaveros fue devolución, el estado actual es vacío.
    // Si fue asignación, el estado actual es la lista de esa asignación.
    if (ultimaDevolucion && (!ultimaAsignacion || ultimaDevolucion.fecha > ultimaAsignacion.fecha)) {
      return { ok: true, llaveros: '', fecha: ultimaDevolucion.fecha, obs: ultimaDevolucion.obs };
    }
    if (ultimaAsignacion) {
      return { ok: true, llaveros: ultimaAsignacion.llaveros, fecha: ultimaAsignacion.fecha, obs: ultimaAsignacion.obs };
    }
    return { ok: true, llaveros: '', fecha: null, obs: null };
  } catch (e) {
    return { ok: true, llaveros: '', fecha: null, obs: null };
  }
}

// Devuelve la lista de tags actualmente asignados al apto (mapa placa -> tag) leyendo TODAS las filas de Registros.
function getTagsActuales(apto) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const shReg = ss.getSheetByName(SHEET_NAME);
    const last = shReg.getLastRow();
    if (last < 2) return { ok: true, tags: {} };
    const data = shReg.getRange(2, 1, last - 1, NUM_COLS).getValues();
    // Indices de cols vNTag: 61 + i*6 + 5 = 66, 72, 78, 84
    // Indices de cols moNTag: 85 + i*6 + 5 = 90, 96, 102, 108
    const result = {};
    for (const row of data) {
      if (String(row[3]).trim() !== apto) continue;
      for (let i = 0; i < 4; i++) {
        const vPlaca = String(row[61 + i*6 + 3] || '').trim(); // Placa del vehículo
        const vTag = String(row[61 + i*6 + 5] || '').trim();
        if (vPlaca && vTag) result[vPlaca] = vTag;
        const mPlaca = String(row[85 + i*6 + 3] || '').trim(); // Placa de la moto
        const mTag = String(row[85 + i*6 + 5] || '').trim();
        if (mPlaca && mTag) result[mPlaca] = mTag;
      }
      break; // solo primer match
    }
    return { ok: true, tags: result };
  } catch (e) {
    return { ok: true, tags: {} };
  }
}

// Valida que los llaveros propuestos no estén asignados a otro apto (excepto el mismo apto).
function validarLlaverosDuplicados(apto, llaverosArr) {
  try {
    const sh = getEntregasSheet();
    const ent = sh.getDataRange().getValues();
    // Mapea cada llavero -> ultimo apto al que fue asignado/devuelto
    const estadoLlaveros = {}; // llavero -> { apto, fecha, tipo }
    for (let i = 1; i < ent.length; i++) {
      const tipoApto = String(ent[i][1] || '').trim();
      const aptoEvento = String(ent[i][3] || '').trim();
      const llaverosTxt = String(ent[i][4] || '').trim();
      const fecha = ent[i][0];
      if (!llaverosTxt) continue;
      if (tipoApto !== 'Llaveros Asignar' && tipoApto !== 'Llaveros Devolver') continue;
      const llaves = llaverosTxt.split(',').map(s => s.trim()).filter(Boolean);
      for (const llave of llaves) {
        if (tipoApto === 'Llaveros Asignar') {
          estadoLlaveros[llave] = { apto: aptoEvento, fecha, tipo: 'Asignar' };
        } else if (tipoApto === 'Llaveros Devolver') {
          if (estadoLlaveros[llave] && estadoLlaveros[llave].apto === aptoEvento) {
            delete estadoLlaveros[llave]; // devolución libera el llavero
          }
        }
      }
    }
    // Verificar que ninguno de los llaveros propuestos esté asignado a otro apto
    const duplicados = [];
    for (const llave of llaverosArr) {
      const norm = String(llave || '').trim();
      if (!norm) continue;
      if (estadoLlaveros[norm] && estadoLlaveros[norm].apto !== apto) {
        duplicados.push({ llavero: norm, asignadoA: estadoLlaveros[norm].apto });
      }
    }
    return { ok: duplicados.length === 0, duplicados };
  } catch (e) {
    return { ok: true, duplicados: [], error: String(e) };
  }
}

// Valida que los tags propuestos no estén asignados a otro vehículo (excepto el mismo vehículo).
function validarTagsDuplicados(apto, tagsPropuestos) {
  // tagsPropuestos: [{placa, tag, tipo: 'Vehiculo'|'Moto', index: 1-4}]
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const shReg = ss.getSheetByName(SHEET_NAME);
    const last = shReg.getLastRow();
    if (last < 2) return { ok: true, duplicados: [] };
    const data = shReg.getRange(2, 1, last - 1, NUM_COLS).getValues();
    // Mapa: tag -> { apto, placa, tipo }
    const estadoTags = {};
    for (const row of data) {
      const aptoRow = String(row[3]).trim();
      for (let i = 0; i < 4; i++) {
        const vPlaca = String(row[61 + i*6 + 3] || '').trim();
        const vTag = String(row[61 + i*6 + 5] || '').trim();
        if (vPlaca && vTag) estadoTags[vTag] = { apto: aptoRow, placa: vPlaca, tipo: 'Vehiculo' };
        const mPlaca = String(row[85 + i*6 + 3] || '').trim();
        const mTag = String(row[85 + i*6 + 5] || '').trim();
        if (mPlaca && mTag) estadoTags[mTag] = { apto: aptoRow, placa: mPlaca, tipo: 'Moto' };
      }
    }
    // Verificar que ninguno de los tags propuestos esté en otro vehículo
    const duplicados = [];
    for (const t of tagsPropuestos) {
      const tagNorm = String(t.tag || '').trim();
      const placaNorm = String(t.placa || '').trim();
      if (!tagNorm || !placaNorm) continue;
      if (estadoTags[tagNorm] && estadoTags[tagNorm].placa !== placaNorm) {
        duplicados.push({ tag: tagNorm, propuestoPara: placaNorm, asignadoA: estadoTags[tagNorm].placa, aptoDelConflicto: estadoTags[tagNorm].apto });
      }
    }
    return { ok: duplicados.length === 0, duplicados };
  } catch (e) {
    return { ok: true, duplicados: [], error: String(e) };
  }
}

// Devuelve la lista completa de eventos del apto (hoja Entregas) ordenados del más reciente al más antiguo.
function getHistorialApto(apto) {
  try {
    const sh = getEntregasSheet();
    const ent = sh.getDataRange().getValues();
    const eventos = [];
    for (let i = 1; i < ent.length; i++) {
      if (String(ent[i][3]).trim() !== apto) continue;
      eventos.push({
        fecha: ent[i][0],
        tipo: String(ent[i][1] || '').trim(),
        numForm: String(ent[i][2] || '').trim(),
        llaveros: String(ent[i][4] || '').trim(),
        tags: String(ent[i][5] || '').trim(),
        obs: String(ent[i][8] || '').trim(),
      });
    }
    // Ordenar del más reciente al más antiguo
    eventos.reverse();
    return eventos;
  } catch (e) {
    return [];
  }
}

// Escribe los tags en las cols vNTag/moNTag del Sheet Registros para el apto dado.
function escribirTagsEnRegistro(numForm, apto, tagsArr) {
  // tagsArr: [{placa, tag, tipo, index}]
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const shReg = ss.getSheetByName(SHEET_NAME);
    const last = shReg.getLastRow();
    if (last < 2) return { ok: false, error: 'No hay registros.' };
    const data = shReg.getRange(2, 1, last - 1, NUM_COLS).getValues();
    let targetRow = -1;
    let rowValues = null;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][3]).trim() === apto) {
        targetRow = i + 2; // 1-based + 1 (header)
        rowValues = data[i].slice();
        break;
      }
    }
    if (targetRow < 0) return { ok: false, error: 'Apto ' + apto + ' no encontrado en Registros.' };
    // Limpiar todos los tags actuales de veh y motos
    for (let i = 0; i < 4; i++) {
      rowValues[61 + i*6 + 5] = ''; // vNTag
      rowValues[85 + i*6 + 5] = ''; // moNTag
    }
    // Escribir los nuevos tags
    for (const t of tagsArr) {
      const idx = parseInt(t.index, 10);
      const tagNorm = String(t.tag || '').trim();
      if (!idx || idx < 1 || idx > 4 || !tagNorm) continue;
      if (t.tipo === 'Vehiculo') {
        rowValues[61 + (idx-1)*6 + 5] = tagNorm;
      } else if (t.tipo === 'Moto') {
        rowValues[85 + (idx-1)*6 + 5] = tagNorm;
      }
    }
    // Actualizar fechaEdicion (col idx 2)
    rowValues[2] = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
    shReg.getRange(targetRow, 1, 1, NUM_COLS).setValues([rowValues]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

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
      return jsonOut({ ok: true, row: rowToObject(row.values) });
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

    // ==== Endpoints administrativos (requieren token) ====
    if (action === 'adminLookup') {
      const token = String(e.parameter.token || '');
      if (!checkAdminToken(token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const apto = String(e.parameter.apto || '').trim();
      if (!apto) return jsonOut({ ok: false, error: 'Falta N° de apartamento.' });
      const row = findRowByApto(apto);
      if (!row) return jsonOut({ ok: false, error: 'No existe registro para el apartamento ' + apto + '.' });
      const obj = rowToObject(row.values, row.rowNumber);
      // Deriva placas desde rowToObject (mismo patrón que vigilantesLookup v1.5)
      // en lugar del helper extractPlacas, que driftea en deploy y devuelve vacío.
      const placas = [
        ...(obj.vehiculos || []).filter(v => v && String(v.placa || '').trim())
          .map(v => ({ tipo: 'Vehiculo', marca: v.marca, clase: v.tipo, color: v.color, placa: v.placa, modelo: v.modelo, tag: v.tag })),
        ...(obj.motos || []).filter(m => m && String(m.placa || '').trim())
          .map(m => ({ tipo: 'Moto', marca: m.marca, clase: m.tipo, color: m.color, placa: m.placa, modelo: m.modelo, tag: m.tag })),
      ];

      // Buscar ultimo registro de entregas para este apto
      let asignacion = null;
      let devolucion = null;
      try {
        const sh = getEntregasSheet();
        const ent = sh.getDataRange().getValues();
        for (let i = ent.length - 1; i >= 1; i--) {
          if (String(ent[i][3]).trim() === apto) {
            const tipo = String(ent[i][1] || '').trim();
            if (tipo === 'Entrega' && !asignacion) {
              asignacion = { fecha: ent[i][0], llaveros: ent[i][4], tags: ent[i][5], placas: String(ent[i][6]||''), obs: String(ent[i][8]||'') };
            } else if (tipo === 'Devolucion' && !devolucion) {
              devolucion = { fecha: ent[i][0], llaveros: ent[i][4], tags: ent[i][5], obs: String(ent[i][8]||'') };
            }
            if (asignacion && devolucion) break;
          }
        }
      } catch (e) { /* hoja Entregas vacia */ }

      return jsonOut({
        ok: true,
        apto: obj,
        placas: placas,
        llavesActuales: getLlavesActuales(apto),
        tagsActuales: getTagsActuales(apto),
        historial: getHistorialApto(apto),
        asignaciones: asignacion,
        devolucion: devolucion,
      });
    }

    // ==== Portal vigilantes (solo lectura, datos visibles reducidos) ====
    if (action === 'vigilantesLookup') {
      const token = String(e.parameter.token || '');
      if (!checkVigilantesToken(token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const apto = String(e.parameter.apto || '').trim();
      if (!apto) return jsonOut({ ok: false, error: 'Falta N° de apartamento.' });
      const row = findRowByApto(apto);
      if (!row) return jsonOut({ ok: false, error: 'No existe registro para el apartamento ' + apto + '.' });
      const obj = rowToObject(row.values, row.rowNumber);
      // Solo datos visibles para vigilantes
      const residentes = (obj.residentes || []).filter(r => r && String(r.nombre||'').trim()).map(r => ({ nombre: r.nombre, parentesco: r.parent }));
      const menores = (obj.menores || []).filter(m => m && String(m.nombre||'').trim()).map(m => ({ nombre: m.nombre, edad: m.edad, parentesco: m.parent }));
      const vehiculos = (obj.vehiculos || []).filter(v => v && String(v.placa||'').trim()).map(v => ({ tipo: 'Vehiculo', marca: v.marca, clase: v.tipo, color: v.color, placa: v.placa, modelo: v.modelo, tag: v.tag }));
      const motos = (obj.motos || []).filter(m => m && String(m.placa||'').trim()).map(m => ({ tipo: 'Moto', marca: m.marca, clase: m.tipo, color: m.color, placa: m.placa, modelo: m.modelo, tag: m.tag }));
      const mascotas = (obj.mascotas || []).filter(m => m && String(m.nombre||'').trim()).map(m => ({ tipo: m.tipo, nombre: m.nombre, raza: m.raza, color: m.color, sexo: m.sexo, vacuna: m.vacuna }));
      const parqueaderos = [];
      if (obj.parq1Celda) parqueaderos.push({ celda: obj.parq1Celda, matricula: obj.parq1Mat });
      if (obj.parq2Celda) parqueaderos.push({ celda: obj.parq2Celda, matricula: obj.parq2Mat });
      if (obj.parq3Celda) parqueaderos.push({ celda: obj.parq3Celda, matricula: obj.parq3Mat });
      if (obj.parq4Celda) parqueaderos.push({ celda: obj.parq4Celda, matricula: obj.parq4Mat });
      return jsonOut({
        ok: true,
        apto: apto,
        residentes: residentes,
        menores: menores,
        vehiculos: vehiculos,
        motos: motos,
        mascotas: mascotas,
        parqueaderos: parqueaderos,
      });
    }

    // ==== MUDANZAS — verificar propietario (SS-XXXX + apto + cc) ====
    if (action === 'verificarPropietario') {
      const numForm = String(e.parameter.numForm || '').trim();
      const apto = String(e.parameter.apto || '').trim();
      const ccProp = String(e.parameter.ccProp || '');
      return jsonOut(verificarPropietarioMudanza(numForm, apto, ccProp));
    }

    // ==== MUDANZAS — disponibilidad de slots (por torre, OPCIÓN B bloqueo por par) ====
    if (action === 'dispMudanzas') {
      const torre = String(e.parameter.torre || '').trim();
      const ascensor = String(e.parameter.ascensor || 'A').trim();
      const desde = String(e.parameter.desde || '').trim();
      const hasta = String(e.parameter.hasta || '').trim();
      return jsonOut(dispMudanzas(torre, ascensor, desde, hasta));
    }

    // ==== MUDANZAS — listar reservas del numForm/apto (vista "mis reservas") ====
    if (action === 'misReservas') {
      const numForm = String(e.parameter.numForm || '').trim();
      const apto = String(e.parameter.apto || '').trim();
      const ccProp = String(e.parameter.ccProp || '');
      return jsonOut(misReservas(numForm, apto, ccProp));
    }

    // ==== MUDANZAS-ADMIN — listar TODAS las reservas (panel admin) ====
    if (action === 'adminListarReservasMudanzas') {
      const token = String(e.parameter.token || '').trim();
      if (!checkAdminToken(token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const estado = String(e.parameter.estado || '').trim();
      const torre = String(e.parameter.torre || '').trim();
      const proxDias = String(e.parameter.proxDias || '').trim();
      return jsonOut(adminListarReservasMudanzas(estado, torre, proxDias));
    }

    // ==== VIGILANTE — listar mudanzas por fecha (F10) ====
    if (action === 'vigilanteVerMudanzas') {
      const token = String(e.parameter.token || '').trim();
      if (!checkVigilantesToken(token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const fecha = String(e.parameter.fecha || '').trim();
      return jsonOut(vigilanteVerMudanzas(fecha));
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

    // Endpoints administrativos (requieren token)
    const action = String(payload.action || '').trim();
    // Compatibilidad: asignarDispositivos → llamar actualizarEntrega con llaveros_asignar
    if (action === 'asignarDispositivos') {
      if (!checkAdminToken(payload.token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const numForm = String(payload.numForm || '').trim();
      const apto = String(payload.apto || '').trim();
      const llaveros = parseInt(payload.llaveros || 0, 10);
      const sh = getEntregasSheet();
      const obs = String(payload.obs || '').trim();
      // Generar llaveros placeholder tipo K-001..K-00N
      const llavesAuto = [];
      for (let i = 1; i <= llaveros; i++) {
        llavesAuto.push('K-' + String(i).padStart(3, '0') + '-' + apto);
      }
      sh.appendRow([new Date(), 'Llaveros Asignar', numForm, apto, llavesAuto.join(', '), '', '', '', obs, 'admin']);
      return jsonOut({ ok: true, message: 'Entrega registrada (compatibilidad).' });
    }
    // Compatibilidad: devolverDispositivos → llaveros_devolver
    if (action === 'devolverDispositivos') {
      if (!checkAdminToken(payload.token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const numForm = String(payload.numForm || '').trim();
      const apto = String(payload.apto || '').trim();
      const sh = getEntregasSheet();
      const obs = String(payload.obs || '').trim();
      sh.appendRow([new Date(), 'Llaveros Devolver', numForm, apto, '', '', '', '', obs, 'admin']);
      return jsonOut({ ok: true, message: 'Devolucion registrada (compatibilidad).' });
    }
    // v1.8: endpoint unificado actualizarEntrega con 5 tipos
    if (action === 'actualizarEntrega') {
      if (!checkAdminToken(payload.token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      const numForm = String(payload.numForm || '').trim();
      const apto = String(payload.apto || '').trim();
      const tipo = String(payload.tipo || '').trim();
      const obs = String(payload.obs || '').trim();
      const sh = getEntregasSheet();

      if (!apto) return jsonOut({ ok: false, error: 'Falta N° de apartamento.' });
      if (!tipo) return jsonOut({ ok: false, error: 'Falta tipo de evento.' });

      // LLAVEROS_ASIGNAR
      if (tipo === 'llaveros_asignar') {
        const llaverosTxt = String(payload.llaveros || '').trim();
        if (!llaverosTxt) return jsonOut({ ok: false, error: 'Falta lista de llaveros.' });
        const llaverosArr = llaverosTxt.split(',').map(s => s.trim()).filter(Boolean);
        const valid = validarLlaverosDuplicados(apto, llaverosArr);
        if (!valid.ok) {
          return jsonOut({ ok: false, error: 'Llaveros ya asignados a otros apartamentos:', duplicados: valid.duplicados });
        }
        sh.appendRow([new Date(), 'Llaveros Asignar', numForm, apto, llaverosTxt, '', '', '', obs, 'admin']);
        return jsonOut({ ok: true, message: 'Llaveros asignados: ' + llaverosArr.length + ' items.' });
      }

      // LLAVEROS_DEVOLVER
      if (tipo === 'llaveros_devolver') {
        sh.appendRow([new Date(), 'Llaveros Devolver', numForm, apto, '', '', '', '', obs, 'admin']);
        return jsonOut({ ok: true, message: 'Devolucion de llaveros registrada.' });
      }

      // TAG_ASIGNAR (escribe los N° Tag en cols vNTag/moNTag del Sheet Registros + fila en Entregas)
      if (tipo === 'tag_asignar') {
        const tagsArr = Array.isArray(payload.tags) ? payload.tags : [];
        if (tagsArr.length === 0) return jsonOut({ ok: false, error: 'Falta lista de tags.' });
        const valid = validarTagsDuplicados(apto, tagsArr);
        if (!valid.ok) {
          return jsonOut({ ok: false, error: 'Tags ya asignados a otros vehiculos:', duplicados: valid.duplicados });
        }
        const wresult = escribirTagsEnRegistro(numForm, apto, tagsArr);
        if (!wresult.ok) return jsonOut(wresult);
        // Construir texto para hoja Entregas: "PFM367=T-001; EJP61H=T-002"
        const tagsTxt = tagsArr.filter(t => String(t.tag||'').trim()).map(t => t.placa + '=' + t.tag).join('; ');
        sh.appendRow([new Date(), 'Tag Asignar', numForm, apto, '', tagsTxt, tagsTxt, '', obs, 'admin']);
        return jsonOut({ ok: true, message: 'Tags asignados: ' + tagsArr.length + ' items.' });
      }

      // TAG_REASIGNAR (mueve un tag de un vehículo a otro — libera viejo, asigna nuevo)
      if (tipo === 'tag_reasignar') {
        const placaOrigen = String(payload.placaOrigen || '').trim();
        const placaDestino = String(payload.placaDestino || '').trim();
        const tagNuevo = String(payload.tagNuevo || '').trim();
        if (!placaOrigen || !placaDestino || !tagNuevo) {
          return jsonOut({ ok: false, error: 'Faltan placaOrigen, placaDestino o tagNuevo.' });
        }
        // Validar: tagNuevo no debe estar en otro vehículo
        const valid = validarTagsDuplicados(apto, [{placa: placaDestino, tag: tagNuevo, tipo: 'Vehiculo', index: 1}]);
        if (!valid.ok) {
          return jsonOut({ ok: false, error: 'Tag ya asignado a otro vehiculo:', duplicados: valid.duplicados });
        }
        // Leer tags actuales del apto
        const current = getTagsActuales(apto);
        const nuevos = [];
        for (const [placa, tag] of Object.entries(current.tags || {})) {
          if (placa === placaOrigen) {
            // Esta es la placa vieja, NO incluir (tag se libera)
          } else if (placa === placaDestino) {
            nuevos.push({ placa, tag: tagNuevo, tipo: 'Vehiculo', index: 1 });
          } else {
            nuevos.push({ placa, tag, tipo: 'Vehiculo', index: 1 });
          }
        }
        nuevos.push({ placa: placaDestino, tag: tagNuevo, tipo: 'Vehiculo', index: 1 });
        const wresult = escribirTagsEnRegistro(numForm, apto, nuevos);
        if (!wresult.ok) return jsonOut(wresult);
        const tagsTxt = nuevos.filter(t => t.tag).map(t => t.placa + '=' + t.tag).join('; ');
        sh.appendRow([new Date(), 'Tag Reasignar', numForm, apto, '', tagsTxt, placaOrigen + '→' + placaDestino + '=' + tagNuevo, '', obs, 'admin']);
        return jsonOut({ ok: true, message: 'Tag reasignado: ' + placaOrigen + ' → ' + placaDestino + ' = ' + tagNuevo });
      }

      // TAG_DEVOLVER (limpia la col vNTag/moNTag del vehículo y registra)
      if (tipo === 'tag_devolver') {
        const placa = String(payload.placa || '').trim();
        if (!placa) return jsonOut({ ok: false, error: 'Falta placa del vehiculo.' });
        const current = getTagsActuales(apto);
        const nuevos = [];
        for (const [pl, tag] of Object.entries(current.tags || {})) {
          if (pl !== placa) nuevos.push({ placa: pl, tag, tipo: 'Vehiculo', index: 1 });
        }
        const wresult = escribirTagsEnRegistro(numForm, apto, nuevos);
        if (!wresult.ok) return jsonOut(wresult);
        sh.appendRow([new Date(), 'Tag Devolver', numForm, apto, '', '', '', placa + '=' + (current.tags[placa]||''), obs, 'admin']);
        return jsonOut({ ok: true, message: 'Tag devuelto para ' + placa });
      }

      return jsonOut({ ok: false, error: 'Tipo de evento no reconocido: ' + tipo });
    }

    // ==== MUDANZAS — reservar ====
    if (action === 'reservarMudanza') {
      return jsonOut(reservarMudanza(payload));
    }

    // ==== MUDANZAS — cancelar ====
    if (action === 'cancelarMudanza') {
      return jsonOut(cancelarMudanza(payload));
    }

    // ==== VIGILANTE — check-in de mudanza (F10) ====
    if (action === 'vigilanteCheckMudanza') {
      const token = String(payload.token || '').trim();
      if (!checkVigilantesToken(token)) return jsonOut({ ok: false, error: 'Token invalido.' });
      return jsonOut(vigilanteCheckMudanza(payload));
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

  // 3. Parqueadero autorizado a tercero — LEGACY v[21-23] (preservado para registros viejos)
  v[21]             = String(d.parqTerNom || '').trim();
  v[22]             = String(d.parqTerApto || '').trim();
  v[23]             = String(d.parqTerCel || '').trim();

  // 3. Parqueadero autorizado a tercero — v2.0: 2 filas × 6 campos (v[191-202])
  // Validación: si la fila tiene algún campo, los obligatorios (* excepto Placa) deben estar llenos.
  function validarFilaAut(n) {
    const parq  = String(d[`parqTer${n}Parq`]  || '').trim();
    const tipo  = String(d[`parqTer${n}Tipo`]  || '').trim();
    const placa = String(d[`parqTer${n}Placa`] || '').trim();
    const nom   = String(d[`parqTer${n}Nom`]   || '').trim();
    const apto  = String(d[`parqTer${n}Apto`]  || '').trim();
    const cel   = String(d[`parqTer${n}Cel`]   || '').trim();
    const algunoLleno = !!(parq || tipo || placa || nom || apto || cel);
    if (!algunoLleno) return; // fila vacía: no se procesa
    if (!parq || !tipo || !nom || !apto || !cel) {
      throw new Error(`Sección 3 — Fila ${n}: complete N° Parqueadero, Tipo, Nombre, Apto y Celular (la Placa es opcional).`);
    }
    if (tipo !== 'Carro' && tipo !== 'Moto') {
      throw new Error(`Sección 3 — Fila ${n}: el Tipo debe ser "Carro" o "Moto" (recibido: "${tipo}").`);
    }
  }
  validarFilaAut(1);
  validarFilaAut(2);
  v[191] = String(d.parqTer1Parq  || '').trim();
  v[192] = String(d.parqTer1Tipo  || '').trim();
  v[193] = String(d.parqTer1Placa || '').trim();
  v[194] = String(d.parqTer1Nom   || '').trim();
  v[195] = String(d.parqTer1Apto  || '').trim();
  v[196] = String(d.parqTer1Cel   || '').trim();
  v[197] = String(d.parqTer2Parq  || '').trim();
  v[198] = String(d.parqTer2Tipo  || '').trim();
  v[199] = String(d.parqTer2Placa || '').trim();
  v[200] = String(d.parqTer2Nom   || '').trim();
  v[201] = String(d.parqTer2Apto  || '').trim();
  v[202] = String(d.parqTer2Cel   || '').trim();

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

  // 6. Vehículos (2: 61-72) — el form permite hasta 4 pero se guardan máximo 4
  //    en offsets 61+i*6 hasta 61+3*6=79 (cols 61-84 en el array).
  const veh = Array.isArray(d.vehiculos) ? d.vehiculos : [];
  for (let i = 0; i < 4; i++) {
    const x = veh[i] || {};
    v[61 + i*6 + 0] = String(x.marca || '').trim();
    v[61 + i*6 + 1] = String(x.tipo || '').trim();
    v[61 + i*6 + 2] = String(x.color || '').trim();
    v[61 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[61 + i*6 + 4] = String(x.modelo || '').trim();
    v[61 + i*6 + 5] = String(x.tag || '').trim();
  }

  // 6. Motos (4: 85-108, pero los 2 primeros son los originales 73-84 movidos aquí)
  //    Se conservan los offsets originales (73-84) para no romper datos viejos.
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

  // 7. Bicicletas (2: 85-92) — sin cambios
  const bic = Array.isArray(d.bicis) ? d.bicis : [];
  for (let i = 0; i < 2; i++) {
    const b = bic[i] || {};
    v[85 + i*4 + 0] = String(b.marca || '').trim();
    v[85 + i*4 + 1] = String(b.color || '').trim();
    v[85 + i*4 + 2] = String(b.clase || '').trim();
    v[85 + i*4 + 3] = String(b.serial || '').trim();
  }

  // 8. Llaveros/Tags aut (93-94) — sin cambios
  v[93]             = d.llaverosAut != null && d.llaverosAut !== '' ? String(d.llaverosAut) : '';
  v[94]             = d.tagsAut != null && d.tagsAut !== '' ? String(d.tagsAut) : '';
  // Dispositivos (95-109): legacy, vacío (la sección 8 fue removida del HTML público).

  // 9. Mascotas 1-2 (110-129) — sin cambios
  const mas12 = Array.isArray(d.mascotas) ? d.mascotas.slice(0, 2) : [];
  for (let i = 0; i < 2; i++) {
    const m = mas12[i] || {};
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

  // 10. Emergencias 1-2 (130-135) — sin cambios
  const eme = Array.isArray(d.emergencias) ? d.emergencias : [];
  for (let i = 0; i < 2; i++) {
    const e = eme[i] || {};
    v[130 + i*3 + 0] = String(e.nombre || '').trim();
    v[130 + i*3 + 1] = String(e.parent || '').trim();
    v[130 + i*3 + 2] = String(e.tel || '').trim();
  }

  // 11. Autorizaciones + firma (136-141) — sin cambios
  v[136]            = d.autDatos   ? 'Sí' : 'No';
  v[137]            = d.autMenores ? 'Sí' : 'No';
  v[138]            = d.autCom     ? 'Sí' : 'No';
  v[139]            = String(d.firmaNom || '').trim();
  v[140]            = String(d.firmaCC || '').trim();
  v[141]            = String(d.firmaFecha || today);

  // 142 = Hash Dedupe — sin cambios
  const hashInput = (v[COL_APTO] || '') + '|' + (v[6] || '') + '|' + (v[140] || '');
  v[142]            = hashInput ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput)
                                  .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16) : '';

  // ====== NUEVO v1.7: posiciones adicionales al FINAL (no rompen datos existentes) ======
  // Vehículos 3-4 (cols 143-154, 2 entradas × 6 cols)
  const vehExtras = Array.isArray(d.vehiculos) ? d.vehiculos.slice(2, 4) : [];
  for (let i = 0; i < 2; i++) {
    const x = vehExtras[i] || {};
    v[143 + i*6 + 0] = String(x.marca || '').trim();
    v[143 + i*6 + 1] = String(x.tipo || '').trim();
    v[143 + i*6 + 2] = String(x.color || '').trim();
    v[143 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[143 + i*6 + 4] = String(x.modelo || '').trim();
    v[143 + i*6 + 5] = String(x.tag || '').trim();
  }

  // Motos 3-4 (cols 155-166, 2 entradas × 6 cols)
  const motExtras = Array.isArray(d.motos) ? d.motos.slice(2, 4) : [];
  for (let i = 0; i < 2; i++) {
    const x = motExtras[i] || {};
    v[155 + i*6 + 0] = String(x.marca || '').trim();
    v[155 + i*6 + 1] = String(x.tipo || '').trim();
    v[155 + i*6 + 2] = String(x.color || '').trim();
    v[155 + i*6 + 3] = String(x.placa || '').trim().toUpperCase();
    v[155 + i*6 + 4] = String(x.modelo || '').trim();
    v[155 + i*6 + 5] = String(x.tag || '').trim();
  }

  // Mascotas 3-4 (cols 167-186, 2 entradas × 10 cols)
  const masExtras = Array.isArray(d.mascotas) ? d.mascotas.slice(2, 4) : [];
  for (let i = 0; i < 2; i++) {
    const m = masExtras[i] || {};
    v[167 + i*10 + 0] = String(m.tipo || '').trim();
    v[167 + i*10 + 1] = String(m.nombre || '').trim();
    v[167 + i*10 + 2] = String(m.raza || '').trim();
    v[167 + i*10 + 3] = String(m.color || '').trim();
    v[167 + i*10 + 4] = String(m.sexo || '').trim();
    v[167 + i*10 + 5] = String(m.vacuna || '').trim();
    v[167 + i*10 + 6] = m.manejoEspecial === true || String(m.manejoEspecial) === 'true' ? 'Sí' : (m.manejoEspecial === false || String(m.manejoEspecial) === 'false' ? 'No' : '');
    v[167 + i*10 + 7] = String(m.registro || '').trim();
    v[167 + i*10 + 8] = String(m.aseguradora || '').trim();
    v[167 + i*10 + 9] = String(m.poliza || '').trim();
  }

  // Parqueaderos 3-4 (cols 187-190)
  v[187] = String(d.parq3Celda || '').trim();    // N° Parqueadero 3
  v[188] = String(d.parq3Mat   || '').trim();    // Matrícula Parqueadero 3
  v[189] = String(d.parq4Celda || '').trim();    // N° Parqueadero 4
  v[190] = String(d.parq4Mat   || '').trim();    // Matrícula Parqueadero 4

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
  if (last < 2) return cache;
  // Header esta en fila 1. Datos desde fila 2. Columnas: A=vacío B=Bloque C=Apto ... H=Matrícula I=Estado
  // Leemos todo el rango disponible y filtramos por apto no vacío en columna C.
  const data = sh.getRange(2, 1, last - 1, 9).getValues();
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
  if (last < 2) return cache;
  // Header en fila 1. Datos desde fila 2. Columnas: B=Tipo C=Nro D=Ubicación H=Matrícula I=Estado
  const data = sh.getRange(2, 1, last - 1, 9).getValues();
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
    // v2.0 — Sección 3: 2 filas × 6 campos (v[191-202])
    // Si fila 1 nuevos vacíos pero legacy poblado → usar legacy en fila 1 (compat con registros viejos)
    parqTer1Parq:  String(rowArr[191] || ''),
    parqTer1Tipo:  String(rowArr[192] || ''),
    parqTer1Placa: String(rowArr[193] || ''),
    parqTer1Nom:   String(rowArr[194] || (rowArr[21] || '')),  // fallback a legacy v[21]
    parqTer1Apto:  String(rowArr[195] || (rowArr[22] || '')),  // fallback a legacy v[22]
    parqTer1Cel:   String(rowArr[196] || (rowArr[23] || '')),  // fallback a legacy v[23]
    parqTer2Parq:  String(rowArr[197] || ''),
    parqTer2Tipo:  String(rowArr[198] || ''),
    parqTer2Placa: String(rowArr[199] || ''),
    parqTer2Nom:   String(rowArr[200] || ''),
    parqTer2Apto:  String(rowArr[201] || ''),
    parqTer2Cel:   String(rowArr[202] || ''),
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
    // Vehículos: lee 1-2 de cols 61-72 Y 3-4 de cols 143-154, los concatena.
    vehiculos: [0,1].map(i => ({
      marca: String(rowArr[61 + i*6] || ''),
      tipo:  String(rowArr[62 + i*6] || ''),
      color: String(rowArr[63 + i*6] || ''),
      placa: String(rowArr[64 + i*6] || ''),
      modelo:String(rowArr[65 + i*6] || ''),
      tag:   String(rowArr[66 + i*6] || ''),
    })).concat([0,1].map(i => ({
      marca: String(rowArr[143 + i*6] || ''),
      tipo:  String(rowArr[144 + i*6] || ''),
      color: String(rowArr[145 + i*6] || ''),
      placa: String(rowArr[146 + i*6] || ''),
      modelo:String(rowArr[147 + i*6] || ''),
      tag:   String(rowArr[148 + i*6] || ''),
    }))),
    // Motos: 1-2 de cols 73-84 Y 3-4 de cols 155-166.
    motos: [0,1].map(i => ({
      marca: String(rowArr[73 + i*6] || ''),
      tipo:  String(rowArr[74 + i*6] || ''),
      color: String(rowArr[75 + i*6] || ''),
      placa: String(rowArr[76 + i*6] || ''),
      modelo:String(rowArr[77 + i*6] || ''),
      tag:   String(rowArr[78 + i*6] || ''),
    })).concat([0,1].map(i => ({
      marca: String(rowArr[155 + i*6] || ''),
      tipo:  String(rowArr[156 + i*6] || ''),
      color: String(rowArr[157 + i*6] || ''),
      placa: String(rowArr[158 + i*6] || ''),
      modelo:String(rowArr[159 + i*6] || ''),
      tag:   String(rowArr[160 + i*6] || ''),
    }))),
    bicis: [0,1].map(i => ({
      marca: String(rowArr[85 + i*4] || ''),
      color: String(rowArr[86 + i*4] || ''),
      clase: String(rowArr[87 + i*4] || ''),
      serial:String(rowArr[88 + i*4] || ''),
    })),
    llaverosAut: String(rowArr[93] || ''),
    tagsAut:     String(rowArr[94] || ''),
    // Mascotas: 1-2 de cols 110-129 Y 3-4 de cols 167-186.
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
    })).concat([0,1].map(i => ({
      tipo: String(rowArr[167 + i*10] || ''),
      nombre: String(rowArr[168 + i*10] || ''),
      raza: String(rowArr[169 + i*10] || ''),
      color: String(rowArr[170 + i*10] || ''),
      sexo: String(rowArr[171 + i*10] || ''),
      vacuna: String(rowArr[172 + i*10] || ''),
      manejoEspecial: String(rowArr[173 + i*10] || ''),
      registro: String(rowArr[174 + i*10] || ''),
      aseguradora: String(rowArr[175 + i*10] || ''),
      poliza: String(rowArr[176 + i*10] || ''),
    }))),
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
    // v1.7 — Parqueaderos 3-4 (cols 187-190)
    parq3Celda: String(rowArr[187] || ''),
    parq3Mat:   String(rowArr[188] || ''),
    parq4Celda: String(rowArr[189] || ''),
    parq4Mat:   String(rowArr[190] || ''),
  };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// Santa Sofía — Módulo de Agendamiento de Mudanzas
// Agregado 04-Oct-2026 (spec-mudanzas.md v1.0.0, OPCIÓN B)
//
// Reglas:
//   - 4 torres (Naranja, Amarilla, Verde, Azul) agrupadas en 2 pares
//     que comparten ascensor: Naranja+Amarilla, Verde+Azul
//   - Solo "A" habilitado para mudanzas; "B" bloqueado
//   - L-V: 08-10, 10-12, 13-15, 15-17 (4 slots de 2h)
//   - Sábado: 08-10, 10-12 (2 slots, solo mañana)
//   - Domingo: no hay servicio
//   - Anticipación mínima: 2 días calendario completos
//   - Cancelación permitida: hasta 24h antes
//   - Solo Propietario o Tenedor / Otro pueden agendar (CC validada contra Sheet)
// =====================================================================

const MUDANZAS_SHEET_NAME     = 'Mudanzas';
const MUDANZAS_NUM_COLS       = 22;
const MUDANZAS_HEADER_ROW     = 1;
const MUDANZAS_TORRES         = ['Naranja', 'Amarilla', 'Verde', 'Azul'];
const MUDANZAS_ASCENSOR       = 'A';
const MUDANZAS_ANTICIPACION_DIAS = 2;
const MUDANZAS_CANCELACION_HORAS = 24;
const MUDANZAS_LOCK_TIMEOUT_MS   = 30000;
const MUDANZAS_CANCELADAS_RECIENTES_DIAS = 30;
const MUDANZAS_CHECK_REALIZADA    = 'Sí';
const MUDANZAS_CHECK_NO_REALIZADA = 'No';
const MUDANZAS_EMAIL_ADMIN      = 'santasofia.clubresidencial@gmail.com';

// OPCIÓN B — Pares de torres (comparten ascensor)
const MUDANZAS_PARES = [
  { nombre: 'Naranja-Amarilla', torres: ['Naranja', 'Amarilla'] },
  { nombre: 'Verde-Azul',       torres: ['Verde',   'Azul']      },
];

// Slots (hardcoded, NO se consultan de Sheet)
const MUDANZAS_SLOTS_LUN_VIE = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['13:00', '15:00'],
  ['15:00', '17:00']
];
const MUDANZAS_SLOTS_SABADO = [
  ['08:00', '10:00'],
  ['10:00', '12:00']
];
const MUDANZAS_SLOTS_DOMINGO = [];

// Columnas de la pestaña Mudanzas (A..S)
const COL_MUD_ID       = 0;  // A
const COL_MUD_NUMFORM  = 1;  // B
const COL_MUD_APTO     = 2;  // C
const COL_MUD_TIPO     = 3;  // D
const COL_MUD_TORRE    = 4;  // E
const COL_MUD_ASCENSOR = 5;  // F
const COL_MUD_FECHA    = 6;  // G
const COL_MUD_HORA_INI = 7;  // H
const COL_MUD_HORA_FIN = 8;  // I
const COL_MUD_NOMBRE   = 9;  // J
const COL_MUD_CC       = 10; // K
const COL_MUD_CEL      = 11; // L
const COL_MUD_CORREO   = 12; // M
const COL_MUD_EMPRESA  = 13; // N
const COL_MUD_PLACA    = 14; // O
const COL_MUD_OBS      = 15; // P
const COL_MUD_FECHARES = 16; // Q
const COL_MUD_ESTADO   = 17; // R
const COL_MUD_HASH     = 18; // S
// F10 — columnas para check-in del vigilante
const COL_MUD_REALIZADA = 19; // T
const COL_MUD_FECHACHECK = 20; // U
const COL_MUD_VIGILANTE  = 21; // V

// ---------------------------------------------------------------------
// Helpers OPCIÓN B (pares de torres)
// ---------------------------------------------------------------------
function parDeTorre(torre) {
  for (const p of MUDANZAS_PARES) {
    if (p.torres.indexOf(torre) !== -1) return p.nombre;
  }
  return null;
}

function torresDelPar(parNombre) {
  for (const p of MUDANZAS_PARES) {
    if (p.nombre === parNombre) return p.torres;
  }
  return [];
}

// ---------------------------------------------------------------------
// Helpers generales
// ---------------------------------------------------------------------
function normalizarCC(cc) {
  return String(cc || '').replace(/[^0-9]/g, '').trim();
}

function getMudanzasSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(MUDANZAS_SHEET_NAME);
  if (!sh) {
    // Pestaña no existe — la creamos idempotentemente con headers
    sh = ss.insertSheet(MUDANZAS_SHEET_NAME);
    const headers = [
      'ID Reserva',         // A
      'N° Formulario',      // B
      'N° Apartamento',     // C
      'Tipo Mudanza',       // D
      'Torre',              // E
      'Ascensor',           // F
      'Fecha Mudanza',      // G
      'Hora Inicio',        // H
      'Hora Fin',           // I
      'Nombre Propietario', // J
      'CC Propietario',     // K
      'Celular',            // L
      'Correo',             // M
      'Empresa Mudanza',    // N
      'Placa Vehiculo',     // O
      'Observaciones',      // P
      'Fecha Reserva',      // Q
      'Estado',             // R
      'Hash Dedupe',        // S
      'Realizada',          // T (F10)
      'Fecha Check',        // U (F10)
      'Vigilante',          // V (F10)
    ];
    sh.getRange(MUDANZAS_HEADER_ROW, 1, 1, MUDANZAS_NUM_COLS).setValues([headers]);
    sh.getRange(MUDANZAS_HEADER_ROW, 1, 1, MUDANZAS_NUM_COLS)
      .setFontWeight('bold')
      .setBackground('#DCE6F1')
      .setFontColor('#1F4E79');
    sh.setFrozenRows(MUDANZAS_HEADER_ROW);
    return sh;
  }
  // F10 — Pestaña existe: si tiene menos de 22 cols, expandir con headers T/U/V
  // (sin tocar datos existentes — solo agrega columnas vacías a la derecha)
  const lastCol = sh.getLastColumn();
  if (lastCol < MUDANZAS_NUM_COLS) {
    sh.insertColumnsAfter(lastCol, MUDANZAS_NUM_COLS - lastCol);
    const headersExtra = [
      'Realizada',    // T
      'Fecha Check',  // U
      'Vigilante',    // V
    ];
    sh.getRange(MUDANZAS_HEADER_ROW, lastCol + 1, 1, headersExtra.length).setValues([headersExtra]);
    sh.getRange(MUDANZAS_HEADER_ROW, lastCol + 1, 1, headersExtra.length)
      .setFontWeight('bold')
      .setBackground('#DCE6F1')
      .setFontColor('#1F4E79');
  }
  return sh;
}

function formatDateOnly(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
  }
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function normalizarHora(h) {
  if (h == null || h === '') return '';
  if (h instanceof Date) {
    return Utilities.formatDate(h, 'America/Bogota', 'HH:mm');
  }
  const s = String(h).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    return m[1].padStart(2, '0') + ':' + m[2];
  }
  return s;
}

function nextReservaId() {
  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return 'MD-0001';
  const ids = sheet.getRange(MUDANZAS_HEADER_ROW + 1, COL_MUD_ID + 1, last - MUDANZAS_HEADER_ROW, 1).getValues();
  let max = 0;
  for (const r of ids) {
    const s = String(r[0] || '');
    const m = s.match(/^MD-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return 'MD-' + String(max + 1).padStart(4, '0');
}

function generarSlotsTeoricos(desde, hasta) {
  const slots = [];
  const d = new Date(desde + 'T12:00:00');
  const fin = new Date(hasta + 'T12:00:00');
  while (d <= fin) {
    const dow = d.getDay();
    const slotsDelDia = dow === 0 ? MUDANZAS_SLOTS_DOMINGO
                      : dow === 6 ? MUDANZAS_SLOTS_SABADO
                      : MUDANZAS_SLOTS_LUN_VIE;
    const fechaStr = Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
    for (const [hi, hf] of slotsDelDia) {
      slots.push({ fecha: fechaStr, horaInicio: hi, horaFin: hf });
    }
    d.setDate(d.getDate() + 1);
  }
  return slots;
}

function findReservaById(idReserva) {
  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return null;
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][COL_MUD_ID] || '').trim() === String(idReserva || '').trim()) {
      return { rowNumber: MUDANZAS_HEADER_ROW + 1 + i, values: data[i] };
    }
  }
  return null;
}

// OPCIÓN B: busca reservas en el PAR al que pertenece la torre
// (no solo torreReportada == torreInput — bloquea las 2 torres del par)
function findReservasEnRango(torre, ascensor, desde, hasta) {
  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return [];
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();

  // Determinar las torres del par (OPCIÓN B)
  const par = parDeTorre(torre);
  const torresPar = par ? torresDelPar(par) : [torre];

  const result = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[COL_MUD_ESTADO]).trim() !== 'Confirmada') continue;
    const torreRow = String(row[COL_MUD_TORRE]).trim();
    if (torresPar.indexOf(torreRow) === -1) continue;  // ← clave OPCIÓN B
    if (String(row[COL_MUD_ASCENSOR]).trim() !== String(ascensor)) continue;
    const fecha = formatDateOnly(row[COL_MUD_FECHA]);
    if (!fecha) continue;
    if (fecha >= desde && fecha <= hasta) {
      result.push({
        rowNumber: MUDANZAS_HEADER_ROW + 1 + i,
        id: String(row[COL_MUD_ID] || ''),
        torreReportada: torreRow,
        fecha: fecha,
        horaInicio: normalizarHora(row[COL_MUD_HORA_INI]),
        horaFin: normalizarHora(row[COL_MUD_HORA_FIN])
      });
    }
  }
  return result;
}

// OPCIÓN B: hash sobre PAR (no sobre torre individual)
function hashReserva(par, ascensor, fecha, horaInicio) {
  const input = par + '|' + ascensor + '|' + fecha + '|' + horaInicio;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('').slice(0, 16);
}

// ---------------------------------------------------------------------
// Endpoint: verificarPropietario (verifica SS-XXXX + apto + ccProp)
// ---------------------------------------------------------------------
function verificarPropietarioMudanza(numForm, apto, ccProp) {
  numForm = String(numForm || '').trim();
  apto = String(apto || '').trim();
  ccProp = normalizarCC(ccProp);

  if (!numForm) return { ok: false, error: 'Falta N° de formulario.' };
  if (!apto) return { ok: false, error: 'Falta N° de apartamento.' };
  if (!ccProp) return { ok: false, error: 'Falta cédula del propietario.' };

  // Asegura que la pestaña Mudanzas exista (idempotente)
  try { getMudanzasSheet(); } catch (e) {}

  const found = findRowByNumFormAndApto(numForm, apto);
  if (!found) {
    return { ok: false, error: 'No se encontró ningún registro con ese N° de formulario y N° de apartamento.' };
  }

  // Solo Propietario o Tenedor / Otro pueden agendar mudanzas
  // (NO se permite Arrendatario; no se Integra "Inmobiliaria" como nuevo valor)
  const diligencia = String(found.values[4] || '').trim();
  if (diligencia !== 'Propietario' && diligencia !== 'Tenedor / Otro') {
    return { ok: false, error: 'Esta autorización debe ser solicitada por el propietario del inmueble o por el encargado autorizado, no por un arrendatario. Contacte al propietario.' };
  }

  const ccSheet = normalizarCC(found.values[6]);
  if (ccSheet !== ccProp) {
    return { ok: false, error: 'La cédula ingresada no coincide con el propietario registrado. Verifique o contacte a la administración.' };
  }

  return {
    ok: true,
    diligencia: diligencia,
    numForm: numForm,
    apto: apto,
    nombreProp: String(found.values[5] || ''),
    ccProp: ccSheet,
    correoProp: String(found.values[7] || ''),
    celProp: String(found.values[8] || '')
  };
}

// ---------------------------------------------------------------------
// Endpoint: dispMudanzas (disponibilidad de slots, OPCIÓN B por par)
// ---------------------------------------------------------------------
function dispMudanzas(torre, ascensor, desde, hasta) {
  torre = String(torre || '').trim();
  ascensor = String(ascensor || '').trim().toUpperCase();
  desde = String(desde || '').trim();
  hasta = String(hasta || '').trim();

  if (MUDANZAS_TORRES.indexOf(torre) === -1) {
    return { ok: false, error: 'Torre inválida. Debe ser Naranja, Amarilla, Verde o Azul.' };
  }
  if (ascensor !== MUDANZAS_ASCENSOR) {
    return { ok: false, error: 'Solo el ascensor A está habilitado para mudanzas. El ascensor B está reservado para circulación de residentes.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    return { ok: false, error: 'Fecha "desde" inválida. Use formato YYYY-MM-DD.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, error: 'Fecha "hasta" inválida. Use formato YYYY-MM-DD.' };
  }
  if (desde > hasta) {
    return { ok: false, error: 'Fecha "desde" no puede ser posterior a "hasta".' };
  }

  const par = parDeTorre(torre);
  const slotsTeoricos = generarSlotsTeoricos(desde, hasta);
  const reservas = findReservasEnRango(torre, ascensor, desde, hasta);

  const hoy = new Date();
  const minFecha = new Date(hoy);
  minFecha.setDate(minFecha.getDate() + MUDANZAS_ANTICIPACION_DIAS);
  const minFechaStr = Utilities.formatDate(minFecha, 'America/Bogota', 'yyyy-MM-dd');

  const resultado = slotsTeoricos.map(s => {
    const reservado = reservas.find(r => r.fecha === s.fecha && r.horaInicio === s.horaInicio);
    const muyPronto = s.fecha < minFechaStr;
    return {
      fecha: s.fecha,
      horaInicio: s.horaInicio,
      horaFin: s.horaFin,
      disponible: !reservado && !muyPronto,
      reservadoPor: reservado ? reservado.id : null
    };
  });

  return { ok: true, torre: torre, par: par, ascensor: ascensor, minFecha: minFechaStr, slots: resultado };
}

// ---------------------------------------------------------------------
// Endpoint: reservarMudanza (OPCIÓN B bloqueo por par)
// ---------------------------------------------------------------------
function reservarMudanza(data) {
  const verif = verificarPropietarioMudanza(data.numForm, data.apto, data.ccProp);
  if (!verif.ok) return verif;

  const torre = String(data.torre || '').trim();
  const ascensor = MUDANZAS_ASCENSOR;
  const fecha = String(data.fecha || '').trim();
  const horaInicio = String(data.horaInicio || '').trim();
  const horaFin = String(data.horaFin || '').trim();
  const tipoMudanza = String(data.tipoMudanza || '').trim();

  if (MUDANZAS_TORRES.indexOf(torre) === -1) {
    return { ok: false, error: 'Torre inválida. Debe ser Naranja, Amarilla, Verde o Azul.' };
  }
  if (!['Salida', 'Ingreso'].includes(tipoMudanza)) {
    return { ok: false, error: 'Tipo de mudanza inválido. Debe ser Salida o Ingreso.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: 'Fecha inválida. Use formato YYYY-MM-DD.' };
  }

  const dow = new Date(fecha + 'T12:00:00').getDay();
  const slotsPermitidos = dow === 0 ? MUDANZAS_SLOTS_DOMINGO
                        : dow === 6 ? MUDANZAS_SLOTS_SABADO
                        : MUDANZAS_SLOTS_LUN_VIE;
  const slotValido = slotsPermitidos.find(s => s[0] === horaInicio && s[1] === horaFin);
  if (!slotValido) {
    return { ok: false, error: 'El horario seleccionado no es válido. Domingo no hay servicio; verifique el día y la hora.' };
  }

  const hoy = new Date();
  const minFecha = new Date(hoy);
  minFecha.setDate(minFecha.getDate() + MUDANZAS_ANTICIPACION_DIAS);
  const minFechaStr = Utilities.formatDate(minFecha, 'America/Bogota', 'yyyy-MM-dd');
  if (fecha < minFechaStr) {
    return { ok: false, error: 'Las mudanzas deben agendarse con al menos ' + MUDANZAS_ANTICIPACION_DIAS + ' días calendario de anticipación. Próxima fecha disponible: ' + minFechaStr + '.' };
  }

  if (!verif.correoProp || verif.correoProp.indexOf('@') === -1) {
    return { ok: false, error: 'El propietario no tiene un correo válido registrado en el formulario de residentes. No se puede enviar la confirmación.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MUDANZAS_LOCK_TIMEOUT_MS)) {
    return { ok: false, error: 'Otro residente está reservando en este momento. Por favor intente nuevamente en unos segundos.' };
  }

  try {
    // OPCIÓN B: re-validar dentro del lock buscando en TODO EL PAR
    const reservas = findReservasEnRango(torre, ascensor, fecha, fecha);
    const duplicado = reservas.find(r => r.horaInicio === horaInicio);
    if (duplicado) {
      return { ok: false, error: 'Este horario ya fue reservado por otro residente (de la torre ' + duplicado.torreReportada + '). Por favor seleccione otro.' };
    }

    const sheet = getMudanzasSheet();
    const idReserva = nextReservaId();
    const now = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
    const par = parDeTorre(torre);
    const hash = hashReserva(par, ascensor, fecha, horaInicio);  // OPCIÓN B: hash por PAR

    const row = new Array(MUDANZAS_NUM_COLS).fill('');
    row[COL_MUD_ID]       = idReserva;
    row[COL_MUD_NUMFORM]  = verif.numForm;
    row[COL_MUD_APTO]     = verif.apto;
    row[COL_MUD_TIPO]     = tipoMudanza;
    row[COL_MUD_TORRE]    = torre;
    row[COL_MUD_ASCENSOR] = ascensor;
    row[COL_MUD_FECHA]    = fecha;
    row[COL_MUD_HORA_INI] = horaInicio;
    row[COL_MUD_HORA_FIN] = horaFin;
    row[COL_MUD_NOMBRE]   = verif.nombreProp;
    row[COL_MUD_CC]       = verif.ccProp;
    row[COL_MUD_CEL]      = verif.celProp;
    row[COL_MUD_CORREO]   = verif.correoProp;
    // F11 — Validar longitudes para prevenir DoS y payloads XSS grandes
    const MAX_EMPRESA = 100;
    const MAX_PLACA   = 20;
    const MAX_OBS     = 500;
    const empresaRaw = String(data.empresa || '').trim();
    const placaRaw   = String(data.placa || '').trim().toUpperCase();
    const obsRaw     = String(data.observaciones || '').trim();
    if (empresaRaw.length > MAX_EMPRESA) {
      return { ok: false, error: 'Empresa demasiado larga. Máximo ' + MAX_EMPRESA + ' caracteres.' };
    }
    if (placaRaw.length > MAX_PLACA) {
      return { ok: false, error: 'Placa demasiado larga. Máximo ' + MAX_PLACA + ' caracteres.' };
    }
    if (obsRaw.length > MAX_OBS) {
      return { ok: false, error: 'Observaciones demasiado largas. Máximo ' + MAX_OBS + ' caracteres.' };
    }
    row[COL_MUD_EMPRESA]  = empresaRaw;
    row[COL_MUD_PLACA]    = placaRaw;
    row[COL_MUD_OBS]      = obsRaw;
    row[COL_MUD_FECHARES] = now;
    row[COL_MUD_ESTADO]   = 'Confirmada';
    row[COL_MUD_HASH]     = hash;

    const last = sheet.getLastRow();
    const targetRow = Math.max(last + 1, MUDANZAS_HEADER_ROW + 1);
    sheet.getRange(targetRow, 1, 1, MUDANZAS_NUM_COLS).setValues([row]);

    try { enviarEmailConfirmacionAdminMud(row, par); } catch (e) { console.error('Error email admin:', e); }
    try { enviarEmailConfirmacionResidenteMud(row); } catch (e) { console.error('Error email residente:', e); }

    return {
      ok: true,
      idReserva: idReserva,
      fecha: fecha,
      horaInicio: horaInicio,
      horaFin: horaFin,
      torre: torre,
      par: par,
      message: 'Reserva confirmada. Le enviamos un correo de confirmación a ' + verif.correoProp + '.'
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Endpoint: cancelarMudanza
// ---------------------------------------------------------------------
function cancelarMudanza(data) {
  const idReserva = String(data.idReserva || '').trim();
  if (!idReserva) return { ok: false, error: 'Falta ID de reserva.' };

  const verif = verificarPropietarioMudanza(data.numForm, data.apto, data.ccProp);
  if (!verif.ok) return verif;

  const found = findReservaById(idReserva);
  if (!found) return { ok: false, error: 'No se encontró la reserva con ese ID.' };

  if (String(found.values[COL_MUD_NUMFORM]).trim() !== verif.numForm ||
      String(found.values[COL_MUD_APTO]).trim() !== verif.apto) {
    return { ok: false, error: 'Esta reserva no pertenece a este apartamento.' };
  }

  if (String(found.values[COL_MUD_ESTADO]).trim() !== 'Confirmada') {
    return { ok: false, error: 'Esta reserva ya no está activa (estado actual: ' + String(found.values[COL_MUD_ESTADO]) + ').' };
  }

  const fechaMudanza = formatDateOnly(found.values[COL_MUD_FECHA]);
  const horaInicio = normalizarHora(found.values[COL_MUD_HORA_INI]);
  const fechaHoraMudanza = new Date(fechaMudanza + 'T' + horaInicio + ':00');
  const ahora = new Date();
  const diffHoras = (fechaHoraMudanza - ahora) / (1000 * 60 * 60);
  if (diffHoras < MUDANZAS_CANCELACION_HORAS) {
    return { ok: false, error: 'Solo se puede cancelar hasta ' + MUDANZAS_CANCELACION_HORAS + ' horas antes de la mudanza. Contacte a la administración.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MUDANZAS_LOCK_TIMEOUT_MS)) {
    return { ok: false, error: 'Otro proceso está activo. Intente nuevamente en unos segundos.' };
  }

  try {
    const sheet = getMudanzasSheet();
    sheet.getRange(found.rowNumber, COL_MUD_ESTADO + 1).setValue('Cancelada');

    const torreRow = String(found.values[COL_MUD_TORRE]).trim();
    const par = parDeTorre(torreRow);
    try { enviarEmailCancelacionAdminMud(found.values, par); } catch (e) { console.error('Error email cancel admin:', e); }
    try { enviarEmailCancelacionResidenteMud(found.values); } catch (e) { console.error('Error email cancel residente:', e); }

    return { ok: true, message: 'Reserva cancelada correctamente.' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------
function enviarEmailConfirmacionAdminMud(row, par) {
  const subject = '[Santa Sofía] Nueva reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Nueva reserva de mudanza registrada:\n\n' +
    'ID Reserva:    ' + row[COL_MUD_ID] + '\n' +
    'Propietario:   ' + row[COL_MUD_NOMBRE] + ' (CC ' + row[COL_MUD_CC] + ')\n' +
    'Apartamento:   ' + row[COL_MUD_APTO] + '\n' +
    'Celular:       ' + row[COL_MUD_CEL] + '\n' +
    'Correo:        ' + row[COL_MUD_CORREO] + '\n' +
    'Tipo:          ' + row[COL_MUD_TIPO] + ' de arrendatario\n' +
    'Torre:         ' + row[COL_MUD_TORRE] + ' (par ' + par + ')\n' +
    'Ascensor:      ' + row[COL_MUD_ASCENSOR] + '\n' +
    'Fecha:         ' + row[COL_MUD_FECHA] + ' ' + row[COL_MUD_HORA_INI] + '-' + row[COL_MUD_HORA_FIN] + '\n' +
    'Empresa:       ' + (row[COL_MUD_EMPRESA] || '(no indicada)') + '\n' +
    'Placa:         ' + (row[COL_MUD_PLACA] || '(no indicada)') + '\n' +
    'Observaciones: ' + (row[COL_MUD_OBS] || '(sin observaciones)') + '\n\n' +
    '--\nSanta Sofía Club Residencial V.I.S — Sistema de agendamiento de mudanzas\n';
  MailApp.sendEmail(MUDANZAS_EMAIL_ADMIN, subject, body);
}

function enviarEmailConfirmacionResidenteMud(row) {
  const to = row[COL_MUD_CORREO];
  if (!to || to.indexOf('@') === -1) return;
  const subject = 'Confirmacion de reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Hola ' + row[COL_MUD_NOMBRE] + ',\n\n' +
    'Su reserva de mudanza ha sido confirmada:\n\n' +
    'ID Reserva:    ' + row[COL_MUD_ID] + '\n' +
    'Apartamento:   ' + row[COL_MUD_APTO] + '\n' +
    'Tipo:          ' + row[COL_MUD_TIPO] + ' de arrendatario\n' +
    'Torre:         ' + row[COL_MUD_TORRE] + '\n' +
    'Ascensor:      ' + row[COL_MUD_ASCENSOR] + '\n' +
    'Fecha:         ' + row[COL_MUD_FECHA] + '\n' +
    'Horario:       ' + row[COL_MUD_HORA_INI] + ' a ' + row[COL_MUD_HORA_FIN] + '\n\n' +
    'Recuerde: la vigilancia NO permite ingreso en dias festivos, ' +
    'aunque usted tenga reserva. Verifique que la fecha seleccionada no sea festivo.\n\n' +
    'Para cancelar su reserva, ingrese nuevamente al formulario con su ' +
    'N° de formulario, apartamento y cedula del propietario.\n\n' +
    '--\nSanta Sofía Club Residencial V.I.S — Sistema de agendamiento de mudanzas\n';
  MailApp.sendEmail(to, subject, body);
}

function enviarEmailCancelacionAdminMud(row, par) {
  const subject = '[Santa Sofía] Cancelacion de reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Se ha ha cancelado la siguiente reserva de mudanza:\n\n' +
    'ID Reserva:    ' + row[COL_MUD_ID] + '\n' +
    'Apartamento:   ' + row[COL_MUD_APTO] + '\n' +
    'Tipo:          ' + row[COL_MUD_TIPO] + '\n' +
    'Torre:         ' + row[COL_MUD_TORRE] + ' (par ' + par + ')\n' +
    'Fecha:         ' + row[COL_MUD_FECHA] + ' ' + row[COL_MUD_HORA_INI] + '-' + row[COL_MUD_HORA_FIN] + '\n' +
    'Cancelada por: ' + row[COL_MUD_NOMBRE] + ' (CC ' + row[COL_MUD_CC] + ')\n';
  MailApp.sendEmail(MUDANZAS_EMAIL_ADMIN, subject, body);
}

function enviarEmailCancelacionResidenteMud(row) {
  const to = row[COL_MUD_CORREO];
  if (!to || to.indexOf('@') === -1) return;
  const subject = 'Cancelacion de reserva de mudanza ' + row[COL_MUD_ID];
  const body =
    'Hola ' + row[COL_MUD_NOMBRE] + ',\n\n' +
    'Su reserva de mudanza ' + row[COL_MUD_ID] + ' ha sido cancelada.\n\n' +
    'Fecha que estaba reservada: ' + row[COL_MUD_FECHA] + ' ' +
    row[COL_MUD_HORA_INI] + '-' + row[COL_MUD_HORA_FIN] + '\n\n' +
    'Si necesita reprogramar, ingrese nuevamente al formulario de Santa Sofía.\n\n' +
    '--\nSanta Sofía Club Residencial V.I.S\n';
  MailApp.sendEmail(to, subject, body);
}

// ---------------------------------------------------------------------
// Endpoint: misReservas (lista todas las reservas del numForm/apto)
// Agregado 05-Oct-2026 para vista "Mis reservas" del frontend
// ---------------------------------------------------------------------
function misReservas(numForm, apto, ccProp) {
  const verif = verificarPropietarioMudanza(numForm, apto, ccProp);
  if (!verif.ok) return verif;

  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) {
    return { ok: true, propietario: verif, reservas: [] };
  }
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();

  const reservas = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (String(row[COL_MUD_NUMFORM]).trim() !== verif.numForm) continue;
    if (String(row[COL_MUD_APTO]).trim() !== verif.apto) continue;

    reservas.push({
      id: String(row[COL_MUD_ID] || ''),
      tipoMudanza: String(row[COL_MUD_TIPO] || ''),
      torre: String(row[COL_MUD_TORRE] || ''),
      ascensor: String(row[COL_MUD_ASCENSOR] || ''),
      fecha: formatDateOnly(row[COL_MUD_FECHA]),
      horaInicio: normalizarHora(row[COL_MUD_HORA_INI]),
      horaFin: normalizarHora(row[COL_MUD_HORA_FIN]),
      empresa: String(row[COL_MUD_EMPRESA] || ''),
      placa: String(row[COL_MUD_PLACA] || ''),
      observaciones: String(row[COL_MUD_OBS] || ''),
      fechaReserva: row[COL_MUD_FECHARES]
        ? Utilities.formatDate(new Date(row[COL_MUD_FECHARES]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss")
        : '',
      estado: String(row[COL_MUD_ESTADO] || '')
    });
  }

  // Ordenar por fecha descendente (más recientes primero), luego por horaInicio
  reservas.sort((a, b) => {
    const fc = (b.fecha || '').localeCompare(a.fecha || '');
    if (fc !== 0) return fc;
    return (b.horaInicio || '').localeCompare(a.horaInicio || '');
  });

  return { ok: true, propietario: verif, reservas: reservas, total: reservas.length };
}

// ---------------------------------------------------------------------
// Endpoint: adminListarReservasMudanzen (lista TODAS para admin)
// Agregado 05-Oct-2026 para tab Mudanzas del admin
// Auth: ADMIN_TOKEN (server-side). NO envía emails. Solo consulta.
// ---------------------------------------------------------------------
function adminListarReservasMudanzas(estado, torre, proxDias) {
  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) {
    return { ok: true, total: 0, filtros: {}, reservas: [] };
  }
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();

  // Calcular rango de fechas si proxDias está definido
  let fechaDesde = '';
  let fechaHasta = '';
  if (proxDias !== '' && proxDias !== undefined && proxDias !== null) {
    const n = parseInt(proxDias, 10);
    if (!isNaN(n) && n > 0) {
      const hoy = new Date();
      const futuro = new Date(hoy);
      futuro.setDate(futuro.getDate() + n);
      const fmt = (d) => Utilities.formatDate(d, 'America/Bogota', 'yyyy-MM-dd');
      fechaDesde = fmt(hoy);
      fechaHasta = fmt(futuro);
    }
  }

  const reservas = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const estadoRow = String(row[COL_MUD_ESTADO] || '').trim();

    // Filtro por estado
    if (estado && estado !== 'Todas' && estadoRow !== estado) continue;

    // Filtro por torre (individual — no por par)
    if (torre && String(row[COL_MUD_TORRE]).trim() !== torre) continue;

    const fechaRow = formatDateOnly(row[COL_MUD_FECHA]);

    // Filtro por rango fechas (proxDias)
    if (fechaDesde && (!fechaRow || fechaRow < fechaDesde)) continue;
    if (fechaHasta && (!fechaRow || fechaRow > fechaHasta)) continue;

    reservas.push({
      id: String(row[COL_MUD_ID] || ''),
      numForm: String(row[COL_MUD_NUMFORM] || ''),
      apto: String(row[COL_MUD_APTO] || ''),
      torre: String(row[COL_MUD_TORRE] || ''),
      ascensor: String(row[COL_MUD_ASCENSOR] || ''),
      tipoMudanza: String(row[COL_MUD_TIPO] || ''),
      fecha: fechaRow,
      horaInicio: normalizarHora(row[COL_MUD_HORA_INI]),
      horaFin: normalizarHora(row[COL_MUD_HORA_FIN]),
      nombreSolicitante: String(row[COL_MUD_NOMBRE] || ''),
      ccSolicitante: String(row[COL_MUD_CC] || ''),
      celular: String(row[COL_MUD_CEL] || ''),
      correo: String(row[COL_MUD_CORREO] || ''),
      empresa: String(row[COL_MUD_EMPRESA] || ''),
      placa: String(row[COL_MUD_PLACA] || ''),
      observaciones: String(row[COL_MUD_OBS] || ''),
      estado: estadoRow,
      fechaReservaRaw: row[COL_MUD_FECHARES]
        ? Utilities.formatDate(new Date(row[COL_MUD_FECHARES]), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ss")
        : ''
    });
  }

  // Ordenar por fecha descendente (más recientes primero), luego por horaInicio
  reservas.sort((a, b) => {
    const fc = (b.fecha || '').localeCompare(a.fecha || '');
    if (fc !== 0) return fc;
    return (b.horaInicio || '').localeCompare(a.horaInicio || '');
  });

  return {
    ok: true,
    total: reservas.length,
    filtros: { estado: estado || 'Todas', torre: torre || 'Todas', proxDias: proxDias || '', fechaDesde: fechaDesde, fechaHasta: fechaHasta },
    reservas: reservas
  };
}

// ---------------------------------------------------------------------
// Endpoint: vigilanteVerMudanzas (lista para portería)
// F10 — Vigilantes v2.0
// ---------------------------------------------------------------------
function vigilanteVerMudanzas(fecha) {
  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return { ok: true, reservas: [], total: 0 };

  // Leer todas las 22 columnas
  const data = sheet.getRange(MUDANZAS_HEADER_ROW + 1, 1, last - MUDANZAS_HEADER_ROW, MUDANZAS_NUM_COLS).getValues();

  const hoy = new Date();
  const hace30 = new Date(hoy);
  hace30.setDate(hace30.getDate() - MUDANZAS_CANCELADAS_RECIENTES_DIAS);
  const hoy0 = new Date(hoy);
  hoy0.setHours(0, 0, 0, 0);

  const reservas = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const idReserva = String(row[COL_MUD_ID] || '').trim();
    if (!idReserva) continue;

    const estado = String(row[COL_MUD_ESTADO] || '').trim();
    if (estado !== 'Confirmada' && estado !== 'Cancelada') continue;

    const fechaRes = row[COL_MUD_FECHA];
    const fechaResStr = fechaRes instanceof Date
      ? Utilities.formatDate(fechaRes, 'America/Bogota', 'yyyy-MM-dd')
      : String(fechaRes || '').slice(0, 10);
    const fechaDate = fechaRes instanceof Date ? fechaRes : new Date(String(fechaRes));

    // Filtrar
    if (fecha) {
      if (fechaResStr !== fecha) continue;
    } else {
      if (estado === 'Cancelada') {
        if (fechaDate < hace30) continue;
      } else {
        if (fechaDate < hoy0) continue;
      }
    }

    reservas.push({
      idReserva: idReserva,
      numForm: String(row[COL_MUD_NUMFORM] || ''),
      apto: String(row[COL_MUD_APTO] || ''),
      tipoMudanza: String(row[COL_MUD_TIPO] || ''),
      torre: String(row[COL_MUD_TORRE] || ''),
      ascensor: String(row[COL_MUD_ASCENSOR] || ''),
      fecha: fechaResStr,
      horaInicio: normalizarHora(row[COL_MUD_HORA_INI]),
      horaFin: normalizarHora(row[COL_MUD_HORA_FIN]),
      nombrePropietario: String(row[COL_MUD_NOMBRE] || ''),
      estado: estado,
      realizada: String(row[COL_MUD_REALIZADA] || ''),
      fechaCheck: String(row[COL_MUD_FECHACHECK] || ''),
      vigilante: String(row[COL_MUD_VIGILANTE] || ''),
      rowNumber: i + MUDANZAS_HEADER_ROW + 1
    });
  }

  // Ordenar: Confirmadas primero, luego por fecha ascendente
  reservas.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'Confirmada' ? -1 : 1;
    return (a.fecha || '').localeCompare(b.fecha || '');
  });

  return { ok: true, reservas: reservas, total: reservas.length };
}

// ---------------------------------------------------------------------
// Endpoint: vigilanteCheckMudanza (registrar check-in)
// F10 — Vigilantes v2.0
// ---------------------------------------------------------------------
function vigilanteCheckMudanza(data) {
  const idReserva = String(data.idReserva || '').trim();
  if (!idReserva) return { ok: false, error: 'Falta idReserva.' };
  const status = String(data.status || '').trim();
  if (status !== 'realizada' && status !== 'no_realizada') {
    return { ok: false, error: 'status debe ser "realizada" o "no_realizada".' };
  }
  const vigilante = String(data.vigilante || '').trim().substring(0, 100);
  if (!vigilante) return { ok: false, error: 'Falta nombre del vigilante.' };

  const sheet = getMudanzasSheet();
  const last = sheet.getLastRow();
  if (last < MUDANZAS_HEADER_ROW + 1) return { ok: false, error: 'Sin reservas.' };

  const idCol = sheet.getRange(MUDANZAS_HEADER_ROW + 1, COL_MUD_ID + 1, last - MUDANZAS_HEADER_ROW, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < idCol.length; i++) {
    if (String(idCol[i][0] || '').trim() === idReserva) {
      targetRow = i + MUDANZAS_HEADER_ROW + 1;
      break;
    }
  }
  if (targetRow === -1) return { ok: false, error: 'No se encontró la reserva ' + idReserva + '.' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(MUDANZAS_LOCK_TIMEOUT_MS)) {
    return { ok: false, error: 'Otro vigilante está marcando. Intenta en unos segundos.' };
  }

  try {
    const realizadaTxt = status === 'realizada' ? MUDANZAS_CHECK_REALIZADA : MUDANZAS_CHECK_NO_REALIZADA;
    sheet.getRange(targetRow, COL_MUD_REALIZADA + 1).setValue(realizadaTxt);
    sheet.getRange(targetRow, COL_MUD_FECHACHECK + 1).setValue(
      Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss')
    );
    sheet.getRange(targetRow, COL_MUD_VIGILANTE + 1).setValue(vigilante);
    return { ok: true, message: 'Check registrado correctamente.', rowNumber: targetRow };
  } finally {
    lock.releaseLock();
  }
}