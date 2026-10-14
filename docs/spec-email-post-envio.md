# Spec — Email de confirmación post-envío de registro de residente

**Versión:** 1.0
**Fecha:** 14-Oct-2026
**Autor:** Hermes Bot + operator (Daniela)
**Estado:** APROBADO (operador, "OK plan F0-F8: si")

---

## 1. PROBLEMA

Cuando un residente termina de llenar el formulario de registro (Enviar/Crear registro), el sistema:

1. ✅ Guarda la fila en el Sheet "Registros" correctamente
2. ✅ Genera el N° de formulario (SS-XXXX) y lo asigna
3. ✅ Muestra la tarjeta de éxito en pantalla con el SS-XXXX
4. ❌ **NO envía ningún email al residente** con el SS-XXXX

**Consecuencia:** residentes que no anotan / no imprimen / no hacen captura del código al ver la pantalla, **lo pierden para siempre** porque la administración NO PUEDE recuperarlo (la pantalla misma lo dice: *"La administración NO puede recuperar este número por ti"*).

Eso explica los reportes del operador: *"los residentes no lo ven o algo pasa"*.

---

## 2. SOLUCIÓN

Agregar envío de email automático al `correoProp` (correo del titular registrado) tras `submitRecord()` exitoso, con:

- **Para creación:** SS-XXXX, N° de apartamento, datos básicos del titular, instrucciones para editar
- **Para edición:** confirmación de la actualización, SS-XXXX (sin cambios), datos clave
- **CC al admin** (`santasofia.clubresidencial@gmail.com`) para auditoría

---

## 3. DECISIONES DE DISEÑO

### D1 — A quién se envía
- **Para:** `correoProp` (correo del titular registrado, validado con regex en submitRecord línea 671)
- **CC:** `santasofia.clubresidencial@gmail.com` (admin del conjunto, ya configurado como `MUDANZAS_EMAIL_ADMIN`)
- **NO se envía** a cada residente de los slots 1-4 (complejidad innecesaria; el titular es quien responde legalmente)

### D2 — Cuándo se envía
- **Inmediatamente después de** `sheet.setValues([row])` exitoso
- **SIEMPRE**, tanto en creación como en edición
- **NO se envía** si hubo error de validación (los returns con `{ok:false, ...}` no llaman email)

### D3 — Manejo de errores
- `try { MailApp.sendEmail(...) } catch (e) { Logger.log(...) }`
- Si email falla, el response sigue siendo `{ok:true, ...}` (registro YA está en el Sheet)
- **El residente SIGUE viendo la success-card en pantalla** aunque el email falle
- `Logger.log` deja traza para diagnóstico posterior

### D4 — Cold start de MailApp
- MailApp en cold start puede tardar 60-120s (pitfall conocido del proyecto)
- Riesgo: el cliente desconecta antes de recibir el response
- Mitigación: **`enviarFormulario()` en js/app.js migra a `safePost()`** (función que YA existe línea 1280 con retry + patrón `pendingEmail`)
- Si `safePost` recibe HTML 500/405 (señal de cold start), retorna `{ok:true, pendingEmail:true, warning: '...'}`
- El frontend mostrará un info adicional: *"Su registro fue creado. Si no recibe el email en 5 minutos, contacte a la administración."*

### D5 — Contenido del email

**Asunto (creación):**
```
Registro creado — Santa Sofía Club Residencial V.I.S — N° SS-XXXX
```

**Asunto (edición):**
```
Registro actualizado — Santa Sofía Club Residencial V.I.S — N° SS-XXXX
```

**Cuerpo (creación):**
```
Hola [nombreProp],

Su registro en Santa Sofía Club Residencial V.I.S ha sido creado
exitosamente.

Datos de su registro:
  N° de formulario:  SS-XXXX
  Apartamento:       [apto]
  Fecha de registro: [fechaRegistro]
  Nombre del titular: [nombreProp]
  Cédula:            [ccProp]

⚠️ IMPORTANTE: Guarde este N° de formulario (SS-XXXX) en un lugar seguro.
Lo necesitará cada vez que quiera editar o actualizar su información.

Para editar su registro:
  1. Abra https://fabig76.github.io/santa-sofia-residentes/
  2. Click en la pestaña "✏️ Editar mi registro"
  3. Ingrese su N° de formulario (SS-XXXX) y N° de apartamento
  4. Modifique los campos que necesite

Si pierde su N° de formulario, contacte a la administración:
santasofia.clubresidencial@gmail.com

--
Santa Sofía Club Residencial V.I.S
NIT 901142051-3
CR 27 # 44-25, Armenia, Quindío
```

**Cuerpo (edición):** mismo formato pero con asunto "Registro actualizado" y omitiendo la línea de "Su registro ha sido creado".

### D6 — Formato de fecha
- Usar `Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss')`
- Consistente con el resto del proyecto (línea 739 de Codigo.gs)

### D7 — Nombre de la función
- `enviarEmailConfirmacionResidente(data, numForm, editMode)` — paralelo a `enviarEmailConfirmacionResidenteMud` (línea 1837)
- Reubicada cerca de las otras funciones de email para cohesión

### D8 — Endpoint `adminBorrarRegistro` (BONUS, mismo deploy)
- **Contexto:** el token de rclone del operador tiene scope `drive`, no `spreadsheets`. No pude borrar SS-0103 (registro de prueba) directamente.
- **Solución:** agregar endpoint `adminBorrarRegistro` (POST, ADMIN_TOKEN) que borra la fila física del Sheet, paralelo a `adminBorrarReserva` (línea 2159, ya existe para Mudanzas)
- **Beneficio:** el operador no tiene que hacer doble deploy. El cleanup de registros de prueba queda permanente.

---

## 4. CAMBIOS PLANIFICADOS

### 4.1 Backend (apps-script/Codigo.gs)

**A) Nueva función `enviarEmailConfirmacionResidente`** — append antes de la línea 1817 (`function enviarEmailConfirmacionAdminMud`):

```javascript
function enviarEmailConfirmacionResidente(data, numForm, editMode) {
  const to = String(data.correoProp || '').trim().toLowerCase();
  if (!to || to.indexOf('@') === -1) return; // sin correo válido, no enviar

  const subject = (editMode ? 'Registro actualizado' : 'Registro creado') +
    ' — Santa Sofía Club Residencial V.I.S — N° ' + numForm;

  const greeting = 'Hola ' + (data.nombreProp || 'residente') + ',\n\n';
  const intro = editMode
    ? 'Su registro en Santa Sofía Club Residencial V.I.S ha sido actualizado exitosamente.\n\n'
    : 'Su registro en Santa Sofía Club Residencial V.I.S ha sido creado exitosamente.\n\n';

  const body = greeting + intro +
    'Datos de su registro:\n' +
    '  N° de formulario:  ' + numForm + '\n' +
    '  Apartamento:       ' + (data.apto || '') + '\n' +
    '  Fecha:             ' + Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm:ss') + '\n' +
    '  Nombre del titular: ' + (data.nombreProp || '') + '\n' +
    '  Cédula:            ' + (data.ccProp || '') + '\n\n' +
    '⚠️ IMPORTANTE: Guarde este N° de formulario (' + numForm + ') en un lugar seguro.\n' +
    'Lo necesitará cada vez que quiera editar o actualizar su información.\n\n' +
    'Para editar su registro:\n' +
    '  1. Abra https://fabig76.github.io/santa-sofia-residentes/\n' +
    '  2. Click en la pestaña "✏️ Editar mi registro"\n' +
    '  3. Ingrese su N° de formulario (' + numForm + ') y N° de apartamento\n' +
    '  4. Modifique los campos que necesite\n\n' +
    'Si pierde su N° de formulario, contacte a la administración:\n' +
    'santasofia.clubresidencial@gmail.com\n\n' +
    '--\nSanta Sofía Club Residencial V.I.S\n' +
    'NIT 901142051-3\n' +
    'CR 27 # 44-25, Armenia, Quindío\n';

  // CC al admin para auditoría
  MailApp.sendEmail(to, subject, body, {
    cc: 'santasofia.clubresidencial@gmail.com',
    name: 'Santa Sofía Club Residencial V.I.S'
  });
}
```

**B) Modificación de `submitRecord` línea 722-731** — insertar try/catch antes del return:

```javascript
// ANTES (líneas 722-731):
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

// AHORA:
// Enviar email de confirmación al residente (CC admin) — no bloqueante
try {
  enviarEmailConfirmacionResidente(data, assignedNumForm, editMode);
} catch (e) {
  Logger.log('Error enviando email de confirmación a ' + data.correoProp + ': ' + e);
}

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
```

**C) Nueva función `adminBorrarRegistro`** — append antes de la línea 2159 (`adminBorrarReservaMudanza`):

```javascript
function adminBorrarRegistro(idRegistro) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const last = sheet.getLastRow();
  if (last < HEADER_ROW + 1) return { ok: false, error: 'No hay filas para borrar.' };

  const range = sheet.getRange(HEADER_ROW + 1, 1, last - HEADER_ROW, 1).getValues();
  for (let i = 0; i < range.length; i++) {
    if (String(range[i][0]) === String(idRegistro)) {
      sheet.deleteRow(HEADER_ROW + 1 + i);
      return { ok: true, deleted: idRegistro, rowNumber: HEADER_ROW + 1 + i };
    }
  }
  return { ok: false, error: 'No se encontró registro con id ' + idRegistro };
}
```

**D) Ruta en doPost** — agregar antes del `submitRecord`:

```javascript
if (action === 'adminBorrarRegistro') {
  const token = String(payload.token || '').trim();
  if (!checkAdminToken(token)) return jsonOut({ ok: false, error: 'Token inválido.' });
  return jsonOut(adminBorrarRegistro(String(payload.idRegistro || '').trim()));
}
```

### 4.2 Frontend (js/app.js)

**E) Migrar `enviarFormulario` (línea 602) a `safePost`**:

```javascript
// ANTES (líneas 629-634):
try {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await resp.json();

// AHORA:
try {
  const data = await safePost(payload);
```

Esto reusa `safePost` (línea 1280) que ya tiene:
- Retry 1 vez con espera de 2s
- Manejo de HTML 500/405 (cold start) → retorna `{ok:true, pendingEmail:true, warning:'...'}`

**F) Agregar manejo de `pendingEmail` en `mostrarExito`** (después de setear success-advice):

```javascript
// Después de línea 671 (antes de window.scrollTo):
if (data.pendingEmail) {
  $('#success-advice').innerHTML += '<br><br><em style="color:var(--warn);">' +
    '⏳ Si no recibe el email en 5 minutos, verifique su carpeta de spam o contacte a la administración.</em>';
}
```

---

## 5. AUDITORÍA DE IMPACTO

| Componente | ¿Cambia? | Riesgo |
|---|---|---|
| Firma de `submitRecord(data)` | NO | ✅ |
| Contrato del response `{ok, numForm, apto, editMode, rowNumber, message}` | NO (mismos campos) | ✅ |
| Frontend `mostrarExito()` | SÍ (manejo de `pendingEmail`) | Bajo — aditivo |
| Otros endpoints (lookup, admin, vigilantes, mudanzas, clearResidente, registrarResidente) | NO | ✅ |
| Sheet "Registros" (203 cols) | NO | ✅ |
| Sheet "Mudanzas" (22 cols) | NO | ✅ |
| Triggers / Locks / Cache | NO | ✅ |
| Comportamiento de `buildRowFromPayload`, `getNextFormId`, `findRowBy*` | NO | ✅ |

---

## 6. RIESGOS Y MITIGACIONES

| Riesgo | Severidad | Mitigación |
|---|---|---|
| MailApp cold start 60-120s | 🟠 Media | `safePost` con retry + `pendingEmail` |
| MailApp falla por cuota / error de red | 🟠 Media | `try/catch` silencioso + `Logger.log`; registro SIGUE creado |
| Correo inválido / vacío | 🟢 Baja | Validación regex YA existe en submitRecord L671 |
| Frontend no entiende `pendingEmail` | 🟢 Baja | `if (data.pendingEmail)` es opcional; sin él, success-card normal |
| Admin recibe CC spam si muchos registros | 🟢 Baja | Solo 1 CC por registro; admin puede filtrar |

---

## 7. PRUEBAS POST-DEPLOY

| Test | Esperado |
|---|---|
| POST TEST-2000 con editMode=true (datos válidos) | ok:true, numForm:TEST-2000, email llega a yury.prueba@santasoftest.com |
| POST apto=9996 diligencia=Propietario datos válidos (creación) | ok:true, numForm:SS-XXXX, email llega a correo del titular |
| POST con correoProp vacío | ok:true (registro creado), SIN email (warning en log) |
| curl `?action=adminBorrarRegistro&token=X&idRegistro=SS-XXXX` con token admin | ok:true, fila borrada |
| curl `?action=adminBorrarRegistro&token=Y&idRegistro=SS-XXXX` con token incorrecto | ok:false, error:Token inválido |
| Borrar SS-0103 con adminBorrarRegistro | ok:true, fila 105 eliminada |

---

## 8. ROLLBACK

Si algo falla:
1. Restaurar `Codigo.gs` desde backup `/root/backups/santa-sofia/pre-email-post-envio-20261014_*/Codigo.gs`
2. Restaurar `js/app.js` desde mismo backup
3. Apps Script: "Implementaciones" > seleccionar versión anterior > "Convertir en versión activa"
4. GitHub Pages: revert commit

---

## 9. CONFIRMACIONES

- ✅ Operador aprobó plan F0-F8: "si" (14-Oct-2026)
- ✅ F5 (migrar enviarFormulario a safePost): integración recomendada aprobada implícitamente
- ✅ Decisión: email a `correoProp` + CC `santasofia.clubresidencial@gmail.com`
- ✅ Decisión: borrar SS-0103 ANTES del deploy → se integra adminBorrarRegistro al mismo deploy

---

## 10. REFERENCIAS

- `references/safePost-retry-pattern.md` — patrón retry usado en F5
- `references/mudanzas-cross-project-adaptation.md` — clonación de `enviarEmailConfirmacionResidenteMud`
- `references/limpieza-mudanzas-prueba-f12.md` — patrón `adminBorrarReserva` replicado para `adminBorrarRegistro`
- `references/pitfall-url-typos-apps-script.md` — verificar URLs tras cambios
- `references/xss-mitigation-f10.md` — escapeHtml en frontend
- `docs/auditoria-f11-completa.md` — auditoría previa