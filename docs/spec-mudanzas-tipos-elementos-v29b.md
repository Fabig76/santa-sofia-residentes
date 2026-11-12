# SPEC V29b — Tipos de mudanza "únicamente de elementos" (enfoque Observaciones)

Fecha: 12-Nov-2026 · Repo `/root/santa-sofia-residentes` @ `d96c665` · Producción: Apps Script V28.
Estado: **SPEC FINAL — implementado en la rama `feature/v29b-tipos-elementos` y desplegado en producción (Apps Script V29, 12-Nov-2026 15:27, E2E OK). Sin merge a `main`.**
Sustituye a `docs/spec-mudanzas-tipos-elementos.md` (DESCARTADO: columna W nueva, NUM_COLS 22→23).
Análisis de base: `/tmp/ss-v29b-alcance.md`.

---

## Premisas del brief corregidas (leer primero)

Ninguna premisa de diseño está mal. Hay **desfases de número de línea** y **un punto que no se pudo comprobar**:

| Premisa del brief | Realidad en `d96c665` | Efecto |
|---|---|---|
| `cancelarMudanza` L1786-1830 | **L1809-1860** (L1786 es el `setValues` de `reservarMudanza`) | Ninguno: no se toca. |
| `push()` de `misReservas` L2000 | `reservas.push({` en **L1999** (campo `tipoMudanza` en L2002) | Ninguno. |
| `push()` de `adminListarReservasMudanzas` L2073 | **L2073** ✔ (campo `tipoMudanza` L2079) | Ninguno. |
| B5 "L2171" | L2171 es `rowNumber: …`, **la última** propiedad del push (L2156-2172). La línea nueva se inserta **antes** de L2171 (p. ej. tras `vigilante:` L2170) | Ninguno, solo dónde se pega. |
| "La API de Sheets no devolvió las dataValidation" | Reintentado hoy: el MCP de Google Sheets **sigue sin permiso concedido** (`get_spreadsheet` → "you haven't granted it yet") | La validación de datos de la columna D queda **SIN COMPROBAR** → se comprueba en F0 (§10). El backend no se ve afectado en ningún caso (§9.B.4). |

Además: el aviso (F2) **no debe** manejarse con `showAlert`/`hideAlert`. `hideAlert()` (`js/app.js:704-707`)
hace `el.textContent = ''` y **borraría el texto del aviso** para siempre; `showAlert()` reescribe `className`.
F5/F6 solo alternan la clase `hidden` (ver §5).

---

## 0. Resumen ejecutivo

Se añaden 2 tipos al formulario de mudanzas: **"Salida únicamente de elementos"** e **"Ingreso únicamente de
elementos"** (valor interno `Salida de elementos` / `Ingreso de elementos`). Los elementos autorizados se
escriben en el campo **Observaciones** que ya existe (col P). Al elegir un tipo de elementos aparece un aviso
dentro de la sección 1, y el navegador **bloquea** el envío si Observaciones está vacío. La portería y el admin
ven los elementos **solo** en reservas de elementos.

| | Valor |
|---|---|
| Archivos tocados | 5: `apps-script/Codigo.gs`, `index.html`, `js/app.js`, `js/vigilantes.js`, `js/admin.js` |
| Puntos de cambio | 15: B1-B6 (backend) + F1-F9 (frontend) |
| Backend | 4 líneas editadas (L1700, L1701, L1917, L1937) + 2 líneas insertadas (B4 "Elementos", B5 `observaciones`) + 1 función nueva al final |
| Google Sheet | **0 cambios** (ni columnas, ni encabezados, ni datos, ni formato) — §2 |
| `MUDANZAS_NUM_COLS` / `getMudanzasSheet()` / `COL_MUD_*` | sin cambios |
| CSS nuevo | ninguno (`.alert-info`, `--azul-claro`, `--azul`, `--gris-med`, `--err` ya existen) |
| Validación nueva en backend | ninguna (solo se amplía la lista de tipos válidos) |
| Anticipación (1 día) / cancelación (12 h) / hash por par | sin cambios |
| Reservas existentes (17: 12 Ingreso + 5 Salida) | sin cambios de dato ni de aspecto |

---

## 1. Reglas de negocio

### 1.1 Los 4 tipos

| Radio (texto visible) | Valor interno (col D) | ¿Es de elementos? |
|---|---|---|
| **Salida** del arrendatario actual | `Salida` | no (existente) |
| **Ingreso** del nuevo arrendatario | `Ingreso` | no (existente) |
| **Salida** únicamente de elementos | `Salida de elementos` | **sí** (nuevo) |
| **Ingreso** únicamente de elementos | `Ingreso de elementos` | **sí** (nuevo) |

- Detección única en todo el código: `String(tipo).indexOf('elementos') !== -1`.
  `'Salida'` e `'Ingreso'` **no** contienen `elementos` → sin falsos positivos. Los nuevos sí → sin falsos negativos.
- Valor interno ≠ texto visible a propósito: el valor interno se lee bien en crudo en Mis reservas, portería,
  admin y correo de cancelación sin mapeo de etiquetas.

### 1.2 Observaciones en tipos de elementos

- Es el lugar donde se escriben los elementos autorizados (ej.: nevera, lavadora, 4 cajas).
- **Obligatorio solo en el navegador** (F7). El backend **no** lo exige: una llamada directa a la API con
  Observaciones vacío se guarda, y la portería ve en rojo "(no indicados — consultar a la administración)".
  F7 es una ayuda de UX, **no una garantía de integridad** del dato.
- Límite de 500 caracteres: el que ya existe (`MAX_OBS`, `Codigo.gs:1764/1774`). No se añade validación nueva.

### 1.3 Lo que NO cambia

- Bloqueo por par de torres + ascensor A: un slot de elementos ocupa el slot del par igual que una mudanza
  (`hashReserva` y `findReservasEnRango` no miran el tipo).
- Anticipación de 1 día calendario, cancelación hasta 12 h antes, horarios por día de la semana.
- Quién puede reservar (verificación SS-XXXX + apto + CC del propietario).
- Correos de cancelación, check-in de portería, borrado admin.
- La pestaña `Mudanzas` y la pestaña `Registros`.
- El título de la sección 4 pasa de "Datos adicionales (opcionales)" a **"Datos adicionales"** (decisión del operador, ver §14).

### 1.4 Decisiones del operador (CERRADAS)

| # | Decisión | Valor | Justificación |
|---|---|---|---|
| D1 | ¿Bloqueo si Observaciones vacío? | **Sí, solo en el navegador** (~3 líneas en `submitReserva`) | Sin bloqueo, una reserva de elementos podría no decir qué elementos son y la portería no tendría qué autorizar. Backend sin cambio. |
| D2 | Valor interno | **`Salida de elementos` / `Ingreso de elementos`** | Se lee bien en crudo en las 3 pantallas y en el correo de cancelación; contiene `elementos` para la detección; empieza por Salida/Ingreso. |
| D3 | Textos | **Aprobados** (§8). Radio 4 corregido a "Ingreso únicamente de elementos". | — |

---

## 2. Cambios al Google Sheet — **NINGUNO**

**Diff de la hoja = 0.** Ni columnas, ni encabezados, ni datos existentes, ni formato. Solo cambia el
**contenido** que el backend escribe en la celda D de las reservas **nuevas**.

### 2.1 Demostración

1. **`MUDANZAS_NUM_COLS` sigue en 22** (`Codigo.gs:1339`). Ninguna línea del spec la toca.
2. **`getMudanzasSheet()`** (`Codigo.gs:1419-1474`):
   - La pestaña existe → no entra en la rama de creación (L1422-1452).
   - Rama de expansión (L1457-1471): `if (lastCol < MUDANZAS_NUM_COLS)`. Con 22 columnas con contenido (A..V),
     `getLastColumn()` = 22 → `22 < 22` es **false** → no se llama a `insertColumnsAfter` ni se escriben encabezados.
   - `getMaxColumns()` = 29 (rejilla) es irrelevante: la función usa `getLastColumn()` (última columna **con
     contenido**), no `getMaxColumns()`. Las columnas W..AC vacías no se tocan.
3. **Escritura de una reserva** (`Codigo.gs:1747-1786`):
   - L1747 `const row = new Array(MUDANZAS_NUM_COLS).fill('');` → 22 elementos.
   - L1751 `row[COL_MUD_TIPO] = tipoMudanza;` → celda D (índice 3). Es el **único** sitio donde cambia el valor.
   - L1786 `sheet.getRange(targetRow, 1, 1, MUDANZAS_NUM_COLS).setValues([row]);` → rango A..V de 1 fila.
     **La celda W (col 23) no está en el rango** y nunca se escribe.
4. **Tipo de dato de la col D**: ya contiene strings (`Salida`, `Ingreso`). `Salida de elementos` es otro string →
   mismo tipo; no puede interpretarse como fecha ni número (no empieza por `=`, `+`, `-`, `@`).
5. **Resto de escrituras en la pestaña** (todas sin cambios):
   - `cancelarMudanza` L1849: `setValue('Cancelada')` en col R.
   - `vigilanteCheckMudanza` L2219-2223: `setValue` en T, U, V.
   - `adminBorrarReservaMudanza`: borra la fila física por ID.
   Ninguna depende del tipo.
6. **Fórmulas, celdas combinadas, rangos con nombre**: `Codigo.gs` no usa `setFormula`, `merge*`,
   `NamedRange` ni `DataValidation` (grep sin coincidencias). Las lecturas usan `getRange(2, 1, n, 22)` por
   posición, no por nombre. Los objetos que pudiera haber **en la propia hoja** (fórmulas/filtros/validaciones
   puestos a mano) **no se pudieron leer** (MCP sin permiso) → F0 los inspecciona (§10). Aunque existieran, el
   spec no cambia el número de columnas ni de filas más allá de lo que ya hace hoy cada reserva.

### 2.2 Validación de datos en la columna D (SIN COMPROBAR)

- **Backend — corrección a la premisa del brief** ("el backend escribe directo, no le afectaría"): no es
  seguro. Con una regla en modo **"Mostrar advertencia"** (el modo por defecto) el script escribe y la celda
  queda marcada como inválida. Con una regla en modo **"Rechazar la entrada"**, Apps Script **puede** lanzar
  la excepción *"The data you entered in cell Dn violates the data validation rules set on this cell"*.
  Esto viene del comportamiento que se ha reportado y **no se ha probado en este proyecto**.
  → **Riesgo**: si la col D tuviera un desplegable `Salida, Ingreso` en modo rechazar, `setValues` (L1786)
  fallaría para los tipos nuevos. La excepción la captura el `try/catch` general de `doPost`, así que el
  residente vería un error y **no se guardaría** la reserva. Las reservas Salida/Ingreso seguirían funcionando.
  El código no crea validaciones (grep), la pestaña la creó el propio script (`insertSheet` L1424, sin
  validación) → lo esperable es que **no haya**. Pero no está comprobado.
- **Edición manual:** si existiera un desplegable de 2 valores, quien edite a mano vería las celdas nuevas
  marcadas como inválidas o no podría escribirlas.
- **Acción obligatoria en F0**: abrir `Mudanzas` → seleccionar la col D → Datos → Validación de datos.
  - Sin reglas → seguir.
  - Con regla de lista → **parar** y decidir con el operador: añadir los 2 valores a la lista (cambio en la hoja,
    hoy fuera de alcance) o quitar la regla.
- La prueba F2.1 (§11) con TEST-2000 lo detecta igualmente: si `reservarMudanza` devuelve error por validación,
  no se publica el frontend.

---

## 3. Cambios al backend (`apps-script/Codigo.gs`)

Regla: append-only salvo la excepción mínima aprobada (4 líneas editadas + 2 insertadas dentro de funciones
existentes). Nada más.

### B1 — L1700: aceptar los 2 tipos nuevos (imprescindible)

```javascript
// HOY
  if (!['Salida', 'Ingreso'].includes(tipoMudanza)) {
// V29b
  if (!['Salida', 'Ingreso', 'Salida de elementos', 'Ingreso de elementos'].includes(tipoMudanza)) {
```
Solo **añade** valores: las 17 reservas (Salida/Ingreso) y los clientes viejos siguen siendo válidos.
`tipoMudanza` ya llega con `.trim()` (L1695). La comparación es exacta y sensible a mayúsculas (igual que hoy).

### B2 — L1701: mensaje de error

```javascript
// HOY
    return { ok: false, error: 'Tipo de mudanza inválido. Debe ser Salida o Ingreso.' };
// V29b
    return { ok: false, error: 'Tipo de autorización inválido.' };
```
Ningún código cliente compara este texto (grep en `js/`: sin coincidencias); solo se muestra en `alert-mud-form`.

### B3 — L1917: correo al admin (`enviarEmailConfirmacionAdminMud`)

```javascript
// HOY
    'Tipo:          ' + row[COL_MUD_TIPO] + ' de arrendatario\n' +
// V29b
    'Tipo:          ' + etiquetaTipoMudanza(row[COL_MUD_TIPO]) + '\n' +
```
El correo al admin ya incluye `Observaciones:` (L1923) → no necesita línea de Elementos.

### B4 — L1937 + 1 línea: correo al residente (`enviarEmailConfirmacionResidenteMud`)

```javascript
// HOY
    'Tipo:          ' + row[COL_MUD_TIPO] + ' de arrendatario\n' +
    ...
    'Horario:       ' + row[COL_MUD_HORA_INI] + ' a ' + row[COL_MUD_HORA_FIN] + '\n\n' +
// V29b
    'Tipo:          ' + etiquetaTipoMudanza(row[COL_MUD_TIPO]) + '\n' +
    ...
    'Horario:       ' + row[COL_MUD_HORA_INI] + ' a ' + row[COL_MUD_HORA_FIN] + '\n' +
    (String(row[COL_MUD_TIPO]).indexOf('elementos') !== -1
      ? 'Elementos:     ' + (row[COL_MUD_OBS] || '(no indicados)') + '\n' : '') +
    '\n' +
```
**Ojo al `\n\n`**: hoy la línea Horario termina en `'\n\n'`. Para que los tipos viejos produzcan
**exactamente** el mismo cuerpo, se parte en `'\n'` + (línea condicional) + `'\n'`. Resultado para Salida/Ingreso:
`Horario: … \n` + `''` + `\n` = idéntico a hoy. (Alternativa equivalente: insertar la línea condicional
**antes** de la línea Horario y no tocar el `\n\n`; cualquiera de las dos sirve, se elige en la implementación
y se verifica con la prueba F2.2.)

### B5 — `vigilanteVerMudanzas` (+1 línea, imprescindible)

Dentro del `reservas.push({…})` (L2156-2172), por ejemplo tras `vigilante:` (L2170):
```javascript
      observaciones: String(row[COL_MUD_OBS] || ''),
```
- La función ya lee las 22 columnas (`getRange(…, MUDANZAS_NUM_COLS)`, L2122) → `row[15]` está disponible.
- Solo **lectura** de la col P. No toca T/U/V.
- Seguridad: el endpoint ya exige `VIGILANTES_TOKEN` y ya devuelve `numForm`; añadir `observaciones` no expone
  nada a usuarios no autenticados (BUGFIX-017 intacto).
- Clientes viejos de `vigilantes.js` ignoran el campo extra.

### B6 — Función nueva al final del archivo (append)

```javascript
// V29b — etiqueta legible del tipo para los correos
function etiquetaTipoMudanza(tipo) {
  const t = String(tipo || '');
  return t.indexOf('elementos') !== -1 ? t : t + ' de arrendatario';
}
```
| Entrada | Salida | ¿= hoy? |
|---|---|---|
| `Salida` | `Salida de arrendatario` | ✔ idéntico |
| `Ingreso` | `Ingreso de arrendatario` | ✔ idéntico |
| `Salida de elementos` | `Salida de elementos` | nuevo |
| `Ingreso de elementos` | `Ingreso de elementos` | nuevo |

Nombre libre: `grep -n etiquetaTipoMudanza` → 0 coincidencias hoy (sin colisión en el espacio global de Apps Script).

### Diff esperado del backend
`git diff --stat apps-script/Codigo.gs` ≈ 12-14 líneas añadidas, 4-5 eliminadas. Cualquier otra línea en el
diff = rechazo de la revisión.

---
## 4. Cambios al frontend — `index.html`

### F1 — L711: 2 radios nuevos (debajo de los 2 existentes)

```html
          <label class="radio-row"><input type="radio" name="mudTipo" value="Salida"> <strong>Salida</strong> del arrendatario actual</label>
          <label class="radio-row"><input type="radio" name="mudTipo" value="Ingreso"> <strong>Ingreso</strong> del nuevo arrendatario</label>
          <label class="radio-row"><input type="radio" name="mudTipo" value="Salida de elementos"> <strong>Salida</strong> únicamente de elementos</label>
          <label class="radio-row"><input type="radio" name="mudTipo" value="Ingreso de elementos"> <strong>Ingreso</strong> únicamente de elementos</label>
```
Mismo `name="mudTipo"` → los selectores `$$('input[name="mudTipo"]')` existentes (app.js L922, L952, L1117, L1124)
los incluyen automáticamente.

### F2 — L712: aviso dentro del `section-body` de la sección 1 (antes del `</div>` de L712)

```html
          <div id="mudTipoAviso" class="alert alert-info hidden" style="margin-bottom:0;">
            <strong>Importante:</strong> en la sección <strong>4 · Observaciones</strong> escriba los elementos autorizados (ej.: nevera, lavadora, 4 cajas). La portería solo dejará pasar lo que quede escrito ahí.
          </div>
```
- Mismo patrón que `#editIndicator` (L64) y `#mudOkAlerta` (L770): `class="alert alert-info hidden"`.
- `.hidden` es `display:none !important` (`styles.css:497`) → oculto por defecto.
- Queda dentro del grupo "1 Tipo de autorización", sin tarjetas nuevas.
- **No** se le pone `role="alert"` (es contenido estático, no un error).

### F3 — L754: placeholder de Observaciones

```html
          <div class="field"><label>Observaciones</label><textarea id="mudObservaciones" rows="2" placeholder="Información adicional. Si es solo de elementos, escriba aquí cuáles (ej.: nevera, lavadora, 4 cajas)"></textarea></div>
```
Sin `maxlength` nuevo (decisión de no ampliar alcance; el backend ya limita a 500).

---

## 5. Cambios al frontend — `js/app.js` (módulo de mudanzas)

### F4 — L952-954: listener del tipo

```javascript
    $$('input[name="mudTipo"]').forEach(r => {
      r.addEventListener('change', () => { this.toggleAvisoElementos(); this.checkFormCompleto(); });
    });
```

### F5 — método nuevo junto a `checkFormCompleto()` (L1116)

```javascript
  toggleAvisoElementos() {
    const t = $$('input[name="mudTipo"]').find(r => r.checked);
    $('#mudTipoAviso').classList.toggle('hidden', !(t && t.value.indexOf('elementos') !== -1));
  },
```
- `$$(…).find` ya se usa así en L1117 y L1124 → `$$` devuelve un array.
- **Prohibido** usar `showAlert`/`hideAlert` con `#mudTipoAviso`: `hideAlert` vacía `textContent` (L706) y
  `showAlert` reescribe `className` (L700). Solo se alterna la clase `hidden`.

### F6 — `reset()` (L913-929), junto a L922

```javascript
    $$('input[name="mudTipo"]').forEach(r => r.checked = false);
    $('#mudTipoAviso').classList.add('hidden');
```
Sin esto el aviso quedaría visible tras "Volver al inicio" / "Otra reserva" (los radios se desmarcan por código y
no disparan `change`).

### F7 — `submitReserva()` (L1122): BLOQUEO (D1)

Tras la validación de fecha/horario (L1126), antes de construir `payload`:
```javascript
    if (tipoEl.value.indexOf('elementos') !== -1 && !$('#mudObservaciones').value.trim()) {
      showAlert('alert-mud-form', 'Escriba en Observaciones (sección 4) los elementos autorizados.', 'err');
      $('#mudObservaciones').focus();
      return;
    }
```
- El `return` ocurre **antes** de `$('#btnMudReservar').disabled = true` (L1143) → el botón sigue activo y el
  residente puede corregir y reenviar.
- Usa el `#alert-mud-form` que ya existe (L705).
- No se toca `checkFormCompleto()`: el botón no debe quedar deshabilitado sin explicación.
- Solo-espacios cuenta como vacío (`.trim()`), coherente con `payload.observaciones` (L1140) y el backend (L1767).

### Lo que NO se toca en `app.js`
`showMisReservas` (L1225 ya pinta `Tipo:` con `escapeHtml` y `Obs:` en L1229) · `showConfirmacion`/`#mudOkDetalle`
(no imprimen el tipo) · `checkFormCompleto` · `payload` (ya envía `tipoMudanza` y `observaciones`).

---

## 6. Cambios al frontend — `js/vigilantes.js`

### F8 — `renderMudanzas()` (L239), tras el bloque fecha/hora (L261-264), antes de `if (r.realizada)` (L265)

```javascript
    if (String(r.tipoMudanza || '').indexOf('elementos') !== -1) {
      html += '<div style="font-size:13px; background:var(--azul-claro); border-left:3px solid var(--azul); padding:8px 10px; border-radius:4px; margin-bottom:8px; white-space:pre-wrap;">';
      html += '<strong>📦 Elementos autorizados:</strong> ';
      html += r.observaciones
        ? escapeHtml(r.observaciones)
        : '<span style="color:var(--err);">(no indicados — consultar a la administración)</span>';
      html += '</div>';
    }
```
- Dentro de la tarjeta existente. Reservas Salida/Ingreso: **sin cambio visual** (incluidas las 5 con
  Observaciones escritas: MD-0001, 0009, 0011, 0013, 0014).
- `escapeHtml` (L25). `pre-wrap` respeta los saltos de línea del textarea.
- Con backend V28 (sin B5) `r.observaciones` es `undefined` → se vería "(no indicados…)" → por eso el backend se
  despliega **antes** (§10).

---

## 7. Cambios al frontend — `js/admin.js`

### F9 — L460, celda "Tipo" de la tabla de reservas

```javascript
    const esElem = String(res.tipoMudanza || '').indexOf('elementos') !== -1;
    html += '<td style="padding:8px;">' + esc(res.tipoMudanza) +
      (esElem ? '<br><small style="color:var(--gris-med);">' + esc(res.observaciones || '(sin descripción)') + '</small>' : '') + '</td>';
```
- `adminListarReservasMudanzas` ya envía `observaciones` (L2089) → sin cambio de backend para esto.
- Mismo patrón que la celda Solicitante (L462: `<br><small style="color:var(--gris-med);">`).
- Número de columnas de la tabla: igual (10).

---

## 8. Textos finales (aprobados — D3)

| Elemento | Texto |
|---|---|
| Radio 3 | `<strong>Salida</strong> únicamente de elementos` |
| Radio 4 | `<strong>Ingreso</strong> únicamente de elementos` |
| Valor interno | `Salida de elementos` / `Ingreso de elementos` |
| Aviso (F2) | **Importante:** en la sección **4 · Observaciones** escriba los elementos autorizados (ej.: nevera, lavadora, 4 cajas). La portería solo dejará pasar lo que quede escrito ahí. |
| Placeholder Observaciones (F3) | Información adicional. Si es solo de elementos, escriba aquí cuáles (ej.: nevera, lavadora, 4 cajas) |
| Error frontend (F7) | Escriba en Observaciones (sección 4) los elementos autorizados. |
| Portería (F8) | 📦 **Elementos autorizados:** *texto* · si vacío: *(no indicados — consultar a la administración)* (rojo) |
| Admin, celda Tipo (F9) | Salida de elementos / *(descripción en pequeño)* · si vacío: *(sin descripción)* |
| Correos, línea Tipo (B3/B4) | `Tipo:          Salida de elementos` (tipos viejos: igual que hoy, "Salida de arrendatario") |
| Correo al residente (B4) | `Elementos:     Nevera, lavadora` · si vacío: `(no indicados)` |
| Error backend (B2) | `Tipo de autorización inválido.` |
| Título de la sección 4 (`index.html:753`) | `Datos adicionales` (se quita "(opcionales)": con F7, Observaciones es obligatorio en los tipos de elementos) |

Sin cambio: asuntos de los 4 correos ("…reserva de mudanza MD-XXXX").

---

## 9. VERIFICACIÓN DE NO-REGRESIÓN

Método: grep sobre `apps-script/Codigo.gs`, `js/*.js`, `index.html`, `admin.html`, `vigilantes.html`,
`arrendatario.html`, `manual-residentes.html`, `tests_local.py` a `d96c665`, y lectura de cada sitio.

### 9.A Dependencias del valor `tipoMudanza`

`grep -rn "tipoMudanza\|COL_MUD_TIPO"` → **12 coincidencias**; `grep "'Salida'\|'Ingreso'\|Salida\b\|Ingreso\b"`
→ 4 (2 ya incluidas + 2 radios de `index.html`). Total **14 sitios únicos**:

| # | Archivo:línea | Qué hace con el tipo | ¿Rompe con el valor nuevo? | Cambio |
|---|---|---|---|---|
| 1 | `Codigo.gs:1374` | `const COL_MUD_TIPO = 3` | No | — |
| 2 | `Codigo.gs:1695` | lee `data.tipoMudanza` + `trim` | No | — |
| 3 | `Codigo.gs:1700` | **lista blanca de 2 valores** | **SÍ: rechazaría el tipo** | **B1** |
| 4 | `Codigo.gs:1701` | mensaje "Debe ser Salida o Ingreso" | No rompe; texto falso | **B2** |
| 5 | `Codigo.gs:1751` | escribe en col D | No (string → string) | — |
| 6 | `Codigo.gs:1917` | correo admin: tipo + `' de arrendatario'` | No rompe; texto incorrecto ("Salida de elementos de arrendatario") | **B3** |
| 7 | `Codigo.gs:1937` | correo residente: igual | igual | **B4** |
| 8 | `Codigo.gs:1958` | correo cancelación admin: tipo crudo | No; se lee "Tipo: Salida de elementos" | — |
| 9 | `Codigo.gs:2002` | `misReservas` → JSON crudo | No | — |
| 10 | `Codigo.gs:2079` | `adminListarReservasMudanzas` → JSON crudo | No | — |
| 11 | `Codigo.gs:2160` | `vigilanteVerMudanzas` → JSON crudo | No | (B5 añade `observaciones` al lado) |
| 12 | `js/app.js:1133` | `payload.tipoMudanza = tipoEl.value` | No (envía el `value` del radio) | — |
| 13 | `js/app.js:1225` | Mis reservas: `escapeHtml(r.tipoMudanza)` | No; muestra "Salida de elementos" | — |
| 14 | `js/vigilantes.js:254` | `'Apto X · ' + escapeHtml(r.tipoMudanza)` | No; "Apto 1203 · Salida de elementos" (cabe) | F8 añade bloque aparte |
| 15 | `js/admin.js:460` | celda Tipo `esc(res.tipoMudanza)` | No | F9 |
| 16 | `index.html:710-711` | radios con `value` | No | F1 añade 2 |

(Las filas 1-2 y 5 son infraestructura; se listan por exhaustividad → 16 filas, 14 sitios con lógica.)

**¿Hay `switch`/`if-else`/mapa de tipos en el frontend que solo conozca 2 valores?** **NO.** Búsqueda explícita:
- `grep -rni "tipo" js/admin.js js/vigilantes.js js/arrendatario.js *.html tests_local.py` → los únicos `tipo`
  con lógica son de **vehículos** (`v.tipo === 'Moto'`, admin.js:145, vigilantes.js:138), **mascotas**
  (`m.tipo === 'Perro'`, vigilantes.js:186) e **histórico de llaveros/tags** (`ev.tipo`, admin.js:183).
  Ninguno toca `tipoMudanza`.
- `grep "'Salida'\|'Ingreso'"` en `js/` → **0 coincidencias**. El frontend nunca compara el tipo de mudanza;
  solo lo envía o lo pinta escapado.
- El backend tampoco filtra por tipo: `adminListarReservasMudanzas` filtra por estado/torre/fechas;
  `vigilanteVerMudanzas` por fecha/estado; `findReservasEnRango` por estado/par/ascensor/fecha.
- `manual-residentes.html`: no menciona mudanzas (grep "mudanza" → 0). `arrendatario.*`: no usa mudanzas.
- `tests_local.py`: no referencia `tipoMudanza` ni `Salida`/`Ingreso`.

**Único sitio que ROMPE sin cambio: `Codigo.gs:1700` (B1).** El resto solo se vería mal (B2-B4) o ya funciona.

**`hashReserva` y duplicados.** `hashReserva(par, ascensor, fecha, horaInicio)` (L1583) **no** incluye el tipo, y la
detección real de duplicados (L1735-1739) usa `findReservasEnRango` + `horaInicio`, que tampoco lo mira.
Consecuencia: una "Salida de elementos" el sábado 10:00 en Naranja **bloquea** ese slot para Naranja **y**
Amarilla (mismo par), igual que una mudanza. Es lo aprobado (comparten ascensor A). No hay "choque" de hash entre
tipos: es el mismo slot y se rechaza con el mensaje de siempre ("Este horario ya fue reservado…").
`dispMudanzas` marca el slot ocupado sin mirar el tipo → la disponibilidad es coherente.

### 9.B Google Sheet — impacto exacto

| Comprobación | Resultado | Evidencia |
|---|---|---|
| ¿Columnas nuevas? | **No** | `MUDANZAS_NUM_COLS` = 22 sin cambio (L1339) |
| ¿Rama de expansión de `getMudanzasSheet()`? | **No se ejecuta** | `getLastColumn()` = 22 → `22 < 22` false (L1459-1460) |
| `getMaxColumns()` = 29 vs 22 | Irrelevante | el código nunca llama a `getMaxColumns`; W..AC siguen vacías |
| ¿Escritura fuera de A..V? | **No** | L1747 array de 22; L1786 `getRange(targetRow,1,1,22).setValues` |
| ¿Se toca W (col 23)? | **No** | fuera del rango de L1786; ninguna otra escritura la alcanza |
| ¿Encabezados? | **No** | solo se escriben al crear la pestaña o en la rama de expansión; ninguna corre |
| ¿Datos existentes (17 filas)? | **No** | B1-B6 solo afectan a filas **nuevas**; `cancelar`/`check`/`borrar` sin cambio |
| ¿Tipo de dato col D? | **Igual** (texto) | ya contiene `Salida`/`Ingreso` |
| ¿Fórmulas/combinadas/rangos con nombre en el código? | **Ninguno** | grep `setFormula|merge|NamedRange|DataValidation` → 0 |
| ¿Validación de datos en col D (en la hoja)? | **SIN COMPROBAR** | MCP Sheets sin permiso. Ver §2.2. **Check obligatorio en F0** |
| ¿Filtros/formatos condicionales/fórmulas puestos a mano en `Mudanzas`? | **SIN COMPROBAR** | idem; inspección visual en F0 |
| Pestaña `Registros` (203 cols), `Entregas`, `Maestros` | **No se tocan** | ningún cambio usa `SHEET_NAME` ni esas pestañas |

### 9.C Funciones y servicios — no-regresión por endpoint y portal

| Endpoint / portal | Router | ¿Le afecta? | Por qué |
|---|---|---|---|
| `reservarMudanza` (POST) | L634 | **Sí, mínimo** | B1/B2 aceptan 2 valores más; B3/B4 cambian el texto de correo solo para tipos nuevos; escritura igual |
| `verificarPropietarioMudanza` (GET) | L440 | No | no lee el tipo |
| `dispMudanzas` (GET) | L444 | No | no lee el tipo |
| `misReservas` (GET) | L453 | No | ya trae `tipoMudanza` y `observaciones` |
| `adminListarReservasMudanzas` (GET) | L461 | No | ya trae ambos |
| `vigilanteVerMudanzas` (GET) | L471 | **Sí, +1 campo** | B5 (aditivo, ignorado por clientes viejos) |
| `cancelarMudanza` (POST) | L639 | No | valida por ID/numForm/apto/estado/12 h; correo de cancelación con tipo crudo → se lee bien |
| `vigilanteCheckMudanza` (POST) | L644 | No | busca por `idReserva`, escribe T/U/V |
| `adminBorrarReserva` (POST) | L651 | No | borra por `idReserva` |
| `tzInfo` (GET, diagnóstico V27) | L316 | No | no toca mudanzas |
| `submitRecord`, `registrarResidente`, `actualizarResidente`, `clearResidente` | — | No | módulo `Registros` |
| `lookup`, `adminLookup`, `vigilantesLookup`, `getEstadoResidente`, `verificarResidente` | — | No | leen `Registros` |
| Portal residentes (`index.html` + `app.js`) | — | **Sí** | F1-F7 solo en el módulo de mudanzas; el formulario de residentes no comparte IDs (`mudTipo`, `mudTipoAviso`, `mudObservaciones` son únicos) |
| Portal admin (`admin.html` + `admin.js`) | — | **Sí, cosmético** | F9, solo filas de elementos |
| Portal vigilantes (`vigilantes.html` + `vigilantes.js`) | — | **Sí, cosmético** | F8, solo filas de elementos |
| Portal arrendatario (`arrendatario.html` + `arrendatario.js`) | — | No | no usa mudanzas |
| Manual (`manual-residentes.html`) | — | No | no menciona mudanzas |

**Resumen: 2 endpoints afectados** (`reservarMudanza`, `vigilanteVerMudanzas`), ambos de forma **aditiva**; **3 portales**
con cambios (residentes funcional; admin y vigilantes cosméticos y condicionales); **0 servicios rotos**.

Los 4 correos:
| Correo | Cambio | Tipos viejos |
|---|---|---|
| Confirmación admin (L1908) | B3 | texto idéntico |
| Confirmación residente (L1928) | B4 | texto idéntico (ver nota `\n\n` en B4) |
| Cancelación admin (L1952) | ninguno | igual; tipos nuevos se leen "Tipo: Salida de elementos" |
| Cancelación residente (L1965) | ninguno | no menciona el tipo |

Check-in de portería: B5 solo **lee** P (`COL_MUD_OBS`); T `Realizada`, U `Fecha Check`, V `Vigilante` siguen
escritas únicamente por `vigilanteCheckMudanza` (L2219-2223), sin cambios.

### 9.D Casos borde

| Caso | Comportamiento esperado | ¿Nuevo? |
|---|---|---|
| `tipoMudanza: "Mudanza"` (inexistente) | `{ok:false, error:'Tipo de autorización inválido.'}` | texto nuevo, lógica igual |
| `tipoMudanza: "salida de elementos"` (minúsculas) | rechazado (comparación exacta, igual que hoy con "salida") | no |
| Tipo de elementos + Observaciones vacío desde el formulario | **bloqueado** por F7, foco en Observaciones, botón activo | sí (D1) |
| Tipo de elementos + Observaciones vacío por API directa | se guarda; portería ve "(no indicados — consultar a la administración)" en rojo; admin "(sin descripción)"; correo "(no indicados)". **F7 no es garantía de integridad** | sí, aceptado |
| Observaciones con solo espacios | F7 lo trata como vacío (`trim`); el backend también hace `trim` (L1767) | no |
| Observaciones de 501 caracteres | rechazado por backend (`MAX_OBS`, L1774) — **preexistente** | no |
| Observaciones que empieza por `=`/`+`/`-`/`@` | se escribe tal cual (L1779) y Sheets podría interpretarlo como fórmula. **Riesgo preexistente** (hoy ya pasa con Observaciones); V29b **no lo amplía** porque no crea un campo nuevo. Fuera de alcance | no |
| HTML/script en Observaciones | se pinta con `escapeHtml`/`esc` en las 3 pantallas | no |
| Falsos positivos de `indexOf('elementos')` | `'Salida'.indexOf('elementos')` = -1, `'Ingreso'…` = -1 → **ninguno** | — |
| Reserva de elementos en slot ya ocupado por una mudanza del par | rechazada con el mensaje de siempre | no |
| Cancelar reserva de elementos a <12 h | rechazada igual que una mudanza | no |
| Usuario con `app.js` en caché (sin F1) | solo ve 2 radios; funciona como hoy | — |

---

## 10. Plan de deploy + rollback

Orden: **backend antes que frontend** (un frontend nuevo con backend V28 falla con "Tipo de mudanza inválido").

| Fase | Acción | Quién | Criterio de salida |
|---|---|---|---|
| **F0** Preparación (solo lectura) | Backup CSV de `Mudanzas` → `rclone copyto <csv> "gdrive:Santa Sofia/v29b-tipos-elementos/mudanzas-pre-v29b-2026-11-XX.csv"` y verificar md5. **Abrir `Mudanzas` → col D → Datos → Validación de datos**; revisar filtros/fórmulas/formato condicional. Confirmar 17 filas, 22 cols con contenido. Rama `feature/v29b-tipos-elementos` | agente + operador (la validación la mira el operador si el MCP sigue sin permiso) | sin validación en D (si la hay → **parar**, §2.2) |
| **F1** Backend | B1-B6. Revisar `git diff` (≈12-14 añadidas, 4-5 eliminadas, nada más) | agente | diff limpio |
| **F2** Subir a Drive | `rclone copyto apps-script/Codigo.gs "gdrive:Santa Sofia/v29b-tipos-elementos/Codigo.gs"` + `rclone md5sum` = `md5sum` local | agente | md5 iguales |
| **F3** Deploy backend | Implementar → Administrar implementaciones → Editar → **Nueva versión** (V29) con el **mismo deploy ID** `AKfycbzMdiAF…LpsStLvyJQ` | **operador** | URL sin cambio |
| **F4** Pruebas backend | §11 P-B1..P-B6 con TEST-2000 (POST con `urllib.request`, `Content-Type: text/plain;charset=UTF-8`) | agente | todo OK + reservas de prueba borradas, vuelve a 17 filas |
| **F5** Frontend | F1-F9 en la rama; revisión de diff | agente | — |
| **F6** Pruebas E2E | §11 P-F1..P-F9 en navegador (local o Pages) | agente/operador | todo OK + limpieza |
| **F7** Merge | merge a `main` (con aprobación del operador) | agente | — |
| **F8** Push | `git push` → GitHub Pages publica; verificar en producción con recarga forzada | agente (con aprobación) | portales cargan; SESIONES/CHANGELOG actualizados |

**Rollback**
- Backend: Administrar implementaciones → Editar → volver a la **versión 28**. Las reservas de elementos ya
  creadas quedan en la hoja (col D con el valor nuevo); con V28 se siguen listando, cancelando y chequeando
  (ninguna de esas rutas valida el tipo). Solo deja de aceptar **reservas nuevas** de elementos.
- Frontend: `git revert` del merge + push. Con frontend viejo y backend V29 no pasa nada (los campos extra se ignoran).
- Datos: no hay migración → no hay nada que revertir en la hoja. Backup F0 como red de seguridad.

---

## 11. Pruebas de aceptación (solo TEST-2000: apto 2000, CC 1094923637)

Toda reserva de prueba se **borra** con `adminBorrarReserva` al terminar; la pestaña debe volver a **17 filas**.
Fechas de prueba calculadas en `America/Bogota` (mínimo mañana, nunca domingo).

**Backend (F4)**
| ID | Prueba | Esperado |
|---|---|---|
| P-B1 | `reservarMudanza` `tipoMudanza:"Salida de elementos"`, `observaciones:"Nevera, lavadora"` | `ok:true`; col D = `Salida de elementos`, P = `Nevera, lavadora`, W vacía |
| P-B2 | Correo residente de P-B1 | `Tipo:          Salida de elementos` + `Elementos:     Nevera, lavadora` |
| P-B3 | Correo admin de P-B1 | `Tipo:          Salida de elementos` (sin "de arrendatario") + Observaciones |
| P-B4 | `reservarMudanza` `tipoMudanza:"Salida"` (otro slot) | correos **idénticos** a los de hoy ("Salida de arrendatario", sin línea Elementos, mismo espaciado) |
| P-B5 | `tipoMudanza:"Mudanza"` | `Tipo de autorización inválido.` |
| P-B6 | `vigilanteVerMudanzas` con la fecha de P-B1 | JSON trae `observaciones:"Nevera, lavadora"` |
| P-B7 | `reservarMudanza` `"Ingreso de elementos"` con `observaciones:""` (API directa) | `ok:true` (backend no bloquea — esperado) |
| P-B8 | `cancelarMudanza` de P-B1 | `ok:true`; correo de cancelación admin `Tipo: Salida de elementos` |
| P-B9 | Slot de P-B1 desde la otra torre del par | rechazado "Este horario ya fue reservado…" |
| P-B10 | Limpieza `adminBorrarReserva` de todas | 17 filas, mismos IDs que el backup F0 |

**Frontend (F6)**
| ID | Prueba | Esperado |
|---|---|---|
| P-F1 | Formulario: 4 radios con los textos de §8 | ✔ |
| P-F2 | Marcar "Salida únicamente de elementos" | aparece el aviso dentro de la sección 1 |
| P-F3 | Cambiar a "Salida" | el aviso desaparece |
| P-F4 | Marcar elementos → "Volver al inicio" → volver a entrar | aviso oculto, radios desmarcados |
| P-F5 | Elementos + Observaciones vacío → Reservar | error rojo F7, foco en Observaciones, botón sigue activo, **no** hay POST |
| P-F6 | Elementos + Observaciones "Nevera" → Reservar | confirmación OK |
| P-F7 | Mis reservas | `Tipo: Salida de elementos` + `Obs: Nevera` |
| P-F8 | Portería (`vigilantes.html`) | bloque "📦 Elementos autorizados: Nevera"; una reserva Salida/Ingreso **se ve igual que antes** (comparar con MD-0009 u otra con Observaciones) |
| P-F9 | Admin | celda Tipo "Salida de elementos" + "Nevera" en pequeño; filas viejas sin cambio |
| P-F10 | Reserva de elementos sin Observaciones (P-B7) en portería/admin | rojo "(no indicados…)" / "(sin descripción)" |
| P-F11 | Formulario de residentes (no mudanzas) y portal arrendatario | sin cambios |
| P-F12 | Limpieza | 17 filas |

---

## 12. Riesgos y mitigación

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Validación de datos en col D** (no comprobada) en modo rechazar → `reservarMudanza` falla para tipos nuevos | baja | alto (la feature no funciona) | Check obligatorio en F0; P-B1 lo detecta antes de publicar frontend |
| R2 | **Desfase de deploy**: frontend publicado antes que backend | media si no se respeta el orden | alto (reservas de elementos rechazadas; portería ve "(no indicados…)") | Orden F3 → F4 → F8; rollback simple |
| R3 | **Caché del navegador** (los `<script src="js/…">` no llevan `?v=`): portería/residentes con JS viejo un tiempo | media | bajo (ven lo de hoy; nada se rompe) | Recarga forzada en los equipos de portería tras F8; limitación preexistente |
| R4 | Reserva de elementos sin Observaciones por API/cliente viejo | baja | medio (portería sin lista) | Fallo **visible** en rojo; F7 cubre el formulario |
| R5 | B4 altera el espaciado del correo de tipos viejos | baja | bajo | Nota `\n\n` en B4 + P-B4 compara el cuerpo |
| R6 | Fórmula en Observaciones (`=…`) | baja | bajo | Preexistente, no se amplía; fuera de alcance |
| R7 | Uso de `hideAlert` con el aviso borra su texto | baja (solo en implementación) | bajo | Regla explícita en F5 |

---

## 13. Dependencias

Tabla completa en §9.A. Resumen:

| Tipo | Sitios | Rompe sin cambio | Se ve mal sin cambio | Ya funciona |
|---|---|---|---|---|
| Backend `Codigo.gs` | 11 | 1 (L1700) | 3 (L1701, L1917, L1937) | 7 |
| Frontend JS | 4 | 0 | 0 | 4 |
| HTML | 1 (radios) | 0 | 0 | 1 (+2 radios) |
| Hoja `Mudanzas` | col D | 0 (salvo R1 sin comprobar) | — | — |

Dependencias externas: ninguna nueva (sin librerías, sin CSS nuevo, sin permisos nuevos de Apps Script:
`MailApp`, `SpreadsheetApp`, `LockService` ya en uso).

---

## 14. Puntos abiertos — TODOS RESUELTOS

1. **Validación de datos en col D** — **RESUELTA por el agente.** Se probó empíricamente en un Spreadsheet
   efímero: con un desplegable `Salida|Ingreso` (estricto, "Rechazar la entrada") en la columna D, la escritura
   por API (`setValues`, USER_ENTERED) de `"Salida de elementos"` **se escribe bien**; la validación de datos
   solo se aplica a la edición manual en la UI. El riesgo R1 / §2.2 no bloquea el backend. (La inspección
   visual de la hoja en F0 sigue siendo recomendable para la edición manual.)
2. **Título de la sección 4** — **RESUELTA.** El operador aprobó quitar "(opcionales)": ahora dice
   "Datos adicionales" (§8).
3. **Spec viejo** `docs/spec-mudanzas-tipos-elementos.md` — **RESUELTA.** Borrado por el agente; nunca se
   commiteó y no hay ninguna referencia a él en el repo.
4. **Equivalencia V28 desplegado = `d96c665`** — **RESUELTA por fingerprint.** El backend desplegado responde
   con `minFecha` = mañana (constante de anticipación = 1), la acción `tzInfo` existe y devuelve
   `America/Bogota` (offset 300), y el offset `-05:00` es coherente. **No comprobable sin escribir:** la
   constante de 12 h de cancelación y el texto del correo de confirmación → se verifican en las pruebas E2E (§11).
