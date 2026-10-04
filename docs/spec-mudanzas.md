# SPEC — Sistema de Agendamiento de Mudanzas
## Santa Sofía Club Residencial V.I.S — Módulo del formulario público de residentes

**Versión:** 1.0.0 (draft para revisión)
**Fecha:** 04-Oct-2026 COL
**Autor:** Hermes Agent
**Estado:** PENDIENTE OK del operador antes de implementar
**Basado en:** `spec-mudanzas.md` Cerro Azul v1.0.0 (probado en producción)

---

## 0. RESUMEN EJECUTIVO

Agregar al formulario público de Santa Sofía (https://fabig76.github.io/santa-sofia-residentes/)
una tercera pestaña "Agendar mudanza" que permita a los propietarios —o a las
inmobiliarias que los representan, o al encargado— reservar UNO de los **2 ascensores
efectivos** habilitados para mudanzas (1 por par de torres: Naranja+Amarilla comparten
uno; Verde+Azul comparten otro) en franjas de 2 horas, con al menos 48 horas de
anticipación.

El sistema NO modifica las 203 columnas existentes del Sheet `Registros`.
Agrega una pestaña nueva `Mudanzas` al Sheet y 4 endpoints nuevos al Apps Script.
El login es SS-XXXX + N° apto + cédula del propietario (3 campos, mismo patrón
que Cerro Azul pero con prefijo SS).

**Diferencia arquitectónica clave vs Cerro Azul:** OPCIÓN B (pares comparten ascensor).
En Cerro Azul, cada torre tenía su propio ascensor A (3 independientes). En Santa Sofía,
un slot ocupado en Naranja **bloquea el mismo slot en Amarilla** (mismo ascensor físico).
El Sheet Mudanzas sigue guardando la torre seleccionada por el residente (trazabilidad),
pero el bloqueo se hace por **lógica del backend** (helper `parDeTorre()`).

---

## 1. REGLAS DE NEGOCIO (CONFIRMADAS CON EL OPERADOR 04-Oct-2026)

| Regla | Valor |
|---|---|
| **Torres** | **4 (Naranja, Amarilla, Verde, Azul)** ← confirmado |
| **Pares de torres (OPCIÓN B)** | **Naranja+Amarilla comparten ascensor** · **Verde+Azul comparten ascensor** ← confirmado 04-Oct |
| Ascensores físicos por par | 2 ascensores juntos (continuos físicamente), solo **1 habilitado** para mudanzas |
| **Ascensores efectivos de mudanza** | **2 totales** (1 por par: par Naranja+Amarilla, par Verde+Azul) |
| Ascensor habilitado | **"A"** en cada par (el "B" bloqueado) ← asumido igual Cerro Azul |
| Slots Lunes a Viernes | 08:00-10:00 / 10:00-12:00 / 13:00-15:00 / 15:00-17:00 (4 slots de 2h) ← confirmado igual |
| Slots Sábado | 08:00-10:00 / 10:00-12:00 (2 slots, solo mañana) ← confirmado igual |
| Domingo y festivos | NO disponible (mensaje al usuario, sin rechazo automático) ← asumido igual |
| Anticipación mínima | 2 días calendario completos (no se puede agendar para mañana) ← confirmado igual |
| Cancelación permitida | hasta 24 horas antes de la mudanza ← confirmado igual |
| Límite de reservas por residente | sin límite ← asumido igual |
| Campos obligatorios | solo Torre + Fecha + Slot |
| Campos opcionales | Empresa mudanza, Placa vehículo, Observaciones |
| Tipo de autorización | Salida del arrendatario actual / Ingreso del nuevo arrendatario |
| Diligencia autorizada | **"Propietario" o "Tenedor / Otro"** ← confirmado. NO se permite "Arrendatario" ni se agrega "Inmobiliaria" como nuevo valor (ver §11.1) |
| Notificaciones | email al admin (santasofia.clubresidencial@gmail.com) + email al residente (correo del Sheet col 8) ← confirmado |
| Email admin | **santasofia.clubresidencial@gmail.com** ← confirmado |

### 1.1 NOTA sobre el modelo de torres (CONFIRMADO OPCIÓN B, 04-Oct-2026)

El operador confirmó: **OPCIÓN B** — los pares de torres comparten ascensor.

**Modelo definitivo (OPCIÓN B):**
- Las 4 torres se agrupan en **2 pares**:
  - **Par 1**: Naranja + Amarilla → comparten el mismo ascensor A (físicamente continuo/junto)
  - **Par 2**: Verde + Azul → comparten el mismo ascensor A (físicamente continuo/junto)
- Hay **8 ascensores físicos** (2 por torre × 4 torres), pero **2 ascensores "A" efectivos** para mudanzas (uno por par).
- En cada par, el ascensor **A** está habilitado para mudanzas y el **B** está bloqueado.
- **Regla crítica de unicidad:** un slot ocupado en una torre **bloquea el mismo slot en la otra torre del mismo par**.
  - Ejemplo: si Torre Naranja reserva ascensor A, sábado 10:00-12:00, entonces Amarilla NO puede reservar el mismo sábado 10:00-12:00 (mismo ascensor).
  - Verde y Azul operan independientemente entre sí.

**Lo que ve el residente (frontend):**
- Selecciona TORRE (Naranja, Amarilla, Verde o Azul) según dónde está su apartamento.
- NO necesita saber que comparte ascensor con la otra torre del par.
- El backend maneja el bloqueo por par automáticamente.
- (Opcional UX: mostrar nota informativa "Su torre: Naranja — comparte ascensor con Amarilla" para transparencia.)

**Lo que hace el backend (Codigo.gs):**
- El Sheet `Mudanzas` col E (Torre) sigue guardando el nombre de la **torre** que el residente seleccionó (preserva trazabilidad: "la reserva la hizo el de la torre Naranja").
- El bloqueo se hace por **lógica** (no por columna): al validar disponibilidad o al guardar, el backend busca reservas donde `torreReportada IN [...par对应的...]` (no solo torreReportada == torreInput).
- El hash de unicidad (col S, Hash dedupe) se calcula sobre (par, ascensor, fecha, horaInicio) — NO sobre (torre, ascensor, fecha, horaInicio) — porque el bloqueo es por par.

---

## 2. ARQUITECTURA (4 CAPAS, IDÉNTICA A CERRO AZUL)

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages (Fabig76/santa-sofia-residentes)             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ index.html  →  nueva pestaña "Agendar mudanza"         │ │
│  │ js/app.js   →  módulo mudanzas (login + form + lista)  │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │  POST/GET (text/plain, sin preflight)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Apps Script Web App (santasofia.clubresidencial@gmail.com)│
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Codigo.gs                                                │ │
│  │   doGet  → action=verificarPropietario                  │ │
│  │         → action=dispMudanzas                           │ │
│  │   doPost → action=reservarMudanza                       │ │
│  │         → action=cancelarMudanza                        │ │
│  │   LockService.getScriptLock()  ← concurrencia (igual CA)│ │
│  │   MailApp.sendEmail()             ← notificaciones      │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │  Sheets API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets (1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo)│
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Registros (203 cols, INTOCAS)                           │ │
│  │ Entregas (INTOCAS)                                      │ │
│  │ Mudanzas  (NUEVA, 19 cols)                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Sheet ID principal** (mismo que Cerro Azul usa en este proyecto):
`1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo`

**NO se agregan servicios externos. NO se cambia el stack. NO se migra el Sheet.**

---

## 3. ESQUEMA DE LA PESTAÑA `Mudanzas` (NUEVA, 19 COLUMNAS)

| Col | Index | Campo | Tipo | Origen |
|---|---|---|---|---|
| A | 0 | ID reserva | str | generado server-side: MD-0001, MD-0002… |
| B | 1 | NumForm | str | link a Registros col A |
| C | 2 | N° Apto | str | link a Registros col D |
| D | 3 | TipoMudanza | str | "Salida" \| "Ingreso" (input usuario) |
| E | 4 | Torre | str | "Naranja" \| "Amarilla" \| "Verde" \| "Azul" (input usuario — torre donde vive el residente) |
| F | 5 | Ascensor | str | siempre "A" (forzado server-side) |
| G | 6 | Fecha mudanza | date | YYYY-MM-DD (input usuario) |
| H | 7 | Hora inicio | str | HH:MM (del slot seleccionado) |
| I | 8 | Hora fin | str | HH:MM (del slot seleccionado) |
| J | 9 | Nombre propietario | str | denormalizado desde Registros v[5] |
| K | 10 | CC propietario | str | denormalizado desde Registros v[6] (validado) |
| L | 11 | Celular contacto | str | denormalizado desde Registros v[8] |
| M | 12 | Correo notificación | str | denormalizado desde Registros v[7] |
| N | 13 | Empresa mudanza | str | input usuario (opcional) |
| O | 14 | Placa vehículo | str | input usuario (opcional) |
| P | 15 | Observaciones | str | input usuario (opcional) |
| Q | 16 | Fecha reserva | datetime | server-side, America/Bogota |
| R | 17 | Estado | str | "Confirmada" \| "Cancelada" \| "Completada" |
| S | 18 | Hash dedupe | str | sha256[:16] de (**par**, ascensor, fecha, horaInicio) — ver §1.1 OPCIÓN B |

**Total: 19 columnas** (mismo esquema que Cerro Azul).

**Fila de encabezados (fila 1):** MAYÚSCULAS, fondo celeste claro, negrita — mismo patrón que `Registros` y `Entregas`.

**Diferencia clave vs Cerro Azul:** col E (Torre) almacena STRING con nombre de color, no número entero. Los valores permitidos son: `"Naranja"`, `"Amarilla"`, `"Verde"`, `"Azul"`.

---

## 4. ENDPOINTS NUEVOS EN `Codigo.gs`

### 4.1 GET `?action=verificarPropietario`

```
Input:    ?numForm=SS-0001&apto=311&ccProp=1234567890
Validaciones:
  1. numForm existe en Registros col A  → si no: 404
  2. apto coincide con Registros col D del mismo numForm → si no: 404
  3. v[4] (Diligencia como) == "Propietario" | "Tenedor / Otro"
     · si es "Arrendatario": RECHAZA con mensaje específico
     · si es otro valor: RECHAZA
  4. v[6] (CC propietario) == ccProp (normalizado: trim, sin puntos/guiones)
     · si no coincide: RECHAZA con mensaje "la cédula no coincide"
Output OK:  {ok:true, diligencia, nombreProp, correoProp, celProp, ccProp, apto}
Output ERR: {ok:false, error: "..."}
```

**DIFERENCIA vs Cerro Azul:** Cerro Azul aceptaba `"Inmobiliaria"` como diligencia válida.
Santa Sofía NO tiene `"Inmobiliaria"` como valor en el Sheet (solo `Propietario`, `Arrendatario`, `Tenedor / Otro`).
**Decisión:** mantener solo 2 valores permitidos (`Propietario` y `Tenedor / Otro`). Si la inmobiliaria
actúa, el operador llena el form como `Tenedor / Otro` (encargado). Ver §11.1.

### 4.2 GET `?action=dispMudanzas`

```
Input:    ?torre=Naranja&ascensor=A&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
Salida:   {ok:true, torre, par, ascensor, minFecha, slots: [
            {fecha: "2026-10-06", horaInicio: "08:00", horaFin: "10:00",
             disponible: true,  idReserva: null},
            {fecha: "2026-10-06", horaInicio: "10:00", horaFin: "12:00",
             disponible: false, idReserva: "MD-0012"},
            ...
          ]}

Algoritmo (OPCIÓN B — bloqueo por par, NO por torre):
  0. Recibe `torre` del residente. Valida que ∈ {"Naranja","Amarilla","Verde","Azul"}.
  1. Deriva `par` correspondiente a esa torre:
     · Naranja o Amarilla → par = "Naranja-Amarilla"
     · Verde o Azul       → par = "Verde-Azul"
  2. Genera todos los slots teóricos desde `desde` hasta `hasta`:
     · L-V: 08-10, 10-12, 13-15, 15-17
     · Sábado: 08-10, 10-12
     · Domingo: omitir
  3. Para cada slot, consulta Mudanzas:
     · Busca reservas donde torreReportada ∈ [torres del par]
       (NO solo torreReportada == torreInput — esto es la CLAVE de OPCIÓN B)
     · AND ascensor = "A"
     · AND fecha = fecha del slot
     · AND estado = "Confirmada"
     · Si alguna reserva cumple → disponible:false (para todo el par)
  5. Excluye slots con fecha < hoy + 2 días (anticipación 48h)
  6. Retorna lista completa (incluyendo no disponibles)

Importante: la `torre` que devuelve el backend en la respuesta es la del residente
(input), pero `par` indica a qué par de torres pertenece.
```

### 4.3 POST `action=reservarMudanza`

```
Input JSON: {
  numForm, apto, ccProp,                      // verificación (re-validar server-side)
  tipoMudanza,                                // "Salida" | "Ingreso"
  torre, ascensor, fecha, horaInicio, horaFin,
  empresa?, placa?, observaciones?
}
Validaciones (todas server-side, en orden, OPCIÓN B):
  1. verificarPropietario (mismo flujo que 4.1)
  2. torre ∈ {"Naranja","Amarilla","Verde","Azul"}, ascensor == "A"
  3. tipoMudanza ∈ {"Salida","Ingreso"}
  4. fecha es fecha válida futura ≥ hoy + 2 días calendario
  5. horaInicio/horaFin ∈ slots predefinidos
  6. NO existe ya reserva "Confirmada" en el PAR al que pertenece la torre
     · busca: torreReportada ∈ [torres del par] AND ascensor = A AND fecha = X AND horaInicio = Y
     · consulta dentro de LockService.getScriptLock().tryLock(30000)
  7. email del residente (Registros v[7]) es válido (contiene @)
Si todo OK:
  · genera ID reserva MD-XXXX
  · escribe fila en Mudanzas (col E = torreReportada del residente — preserva trazabilidad)
  · hash = sha256(par, "A", fecha, horaInicio)[:16]
  · envía email al admin (santasofia.clubresidencial@gmail.com)
  · envía email al residente
  · retorna {ok:true, idReserva, fecha, horaInicio, horaFin, torre, par}
```

### 4.4 POST `action=cancelarMudanza`

```
Input JSON: {idReserva, numForm, apto, ccProp}
Validaciones:
  1. verificarPropietario (mismo numForm/apto/ccProp)
  2. Reserva existe en Mudanzas con idReserva
  3. Reserva.col R (Estado) == "Confirmada"
  4. fecha mudanza ≥ hoy + 1 día (24h anticipación)
  5. numForm/apto de la reserva coinciden con input
Si OK:
  · Marca Estado = "Cancelada" (NO borra fila)
  · Envía email al admin
  · Envía email al residente
  · Retorna {ok:true}
```

### 4.5 GET `?action=misReservas` (05-Oct-2026, agregado en V17)

```
Input:    ?numForm=SS-0001&apto=1122&ccProp=36178031
Validaciones:
  1. verificarPropietarioMudanza(numForm, apto, ccProp) — re-validar
Output OK:  {
  ok: true,
  propietario: { diligencia, numForm, apto, nombreProp, ccProp, correoProp, celProp },
  reservas: [
    {
      id: "MD-0001",
      tipoMudanza: "Salida",
      torre: "Naranja",
      ascensor: "A",
      fecha: "2026-10-09",
      horaInicio: "08:00",
      horaFin: "10:00",
      empresa: "...",
      placa: "...",
      observaciones: "...",
      fechaReserva: "2026-10-04 17:48:19",
      estado: "Confirmada" | "Cancelada" | "Completada"
    },
    ...
  ]
}

Algoritmo:
  1. Verifica propietario (mismo flujo que 4.1).
  2. Lee pestaña Mudanzas completa.
  3. Filtra: numForm == verif.numForm AND apto == verif.apto.
  4. NO filtra por estado — devuelve Confirmadas + Canceladas (auditoría).
  5. Ordena por fecha descendente (más recientes primero).
  6. Retorna lista + datos del propietario.

Notas:
- Permite ver el historial de cancelaciones (transparencia para el residente).
- No hay límite de cantidad — el residente ve TODAS sus reservas.
- Si no tiene reservas → devuelve `reservas: []` (no error).
```

---

## 5. CONSTANTES NUEVAS EN `Codigo.gs`

```javascript
// Pestaña nueva (la crea el operador manualmente desde la UI de Sheets)
const MUDANZAS_SHEET_NAME = 'Mudanzas';
const MUDANZAS_NUM_COLS   = 19;
const MUDANZAS_HEADER_ROW = 1;

// Torres de Santa Sofía (4 torres, OPCIÓN B — agrupadas en 2 pares)
const MUDANZAS_TORRES = ['Naranja', 'Amarilla', 'Verde', 'Azul'];

// Pares de torres (OPCIÓN B) — un slot reservado en una torre bloquea la otra torre del mismo par
// (mismo ascensor físico compartido)
const MUDANZAS_PARES = [
  { nombre: 'Naranja-Amarilla', torres: ['Naranja', 'Amarilla'] },
  { nombre: 'Verde-Azul',       torres: ['Verde',   'Azul']      },
];

// Solo ascensor A habilitado para mudanzas (B bloqueado)
const MUDANZAS_ASCENSOR = 'A';

// Reglas de tiempo (iguales Cerro Azul)
const MUDANZAS_ANTICIPACION_DIAS = 2;
const MUDANZAS_CANCELACION_HORAS = 24;
const MUDANZAS_LOCK_TIMEOUT_MS   = 30000;

// Email del admin
const MUDANZAS_EMAIL_ADMIN = 'santasofia.clubresidencial@gmail.com';

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

// Helper crítico OPCIÓN B: dado nombre de torre, devuelve nombre del par.
// Devuelve null si la torre no existe.
// Ejemplos:
//   parDeTorre('Naranja')  → 'Naranja-Amarilla'
//   parDeTorre('Amarilla') → 'Naranja-Amarilla'
//   parDeTorre('Verde')    → 'Verde-Azul'
//   parDeTorre('Azul')     → 'Verde-Azul'
//   parDeTorre('Inexistente') → null
function parDeTorre(torre) {
  for (const p of MUDANZAS_PARES) {
    if (p.torres.indexOf(torre) !== -1) return p.nombre;
  }
  return null;
}

// Helper crítico OPCIÓN B: dado nombre de par, devuelve array con nombres de las torres del par.
// torresDelPar('Naranja-Amarilla') → ['Naranja', 'Amarilla']
// torresDelPar('Verde-Azul')       → ['Verde', 'Azul']
function torresDelPar(parNombre) {
  for (const p of MUDANZAS_PARES) {
    if (p.nombre === parNombre) return p.torres;
  }
  return [];
}
```

---

## 6. CAMBIOS EN EL FRONTEND

### 6.1 `index.html`

Agregar al `mode-switcher` (junto a los botones existentes de "Crear" y "Editar"):

```html
<button data-mode="mudanzas">🚚 Agendar mudanza</button>
```

Agregar contenedor (oculto por default):

```html
<div id="view-mudanzas" class="hidden">
  <!-- 4 vistas internas: login / formulario / confirmación / mis-reservas -->
</div>
```

### 6.2 `js/app.js`

Nuevo módulo `M` (mismo archivo, encapsulado):

```javascript
const M = {
  init(),          // bind eventos al mode-switcher
  login(),         // paso 1: verificar SS-XXXX + apto + CC
  renderForm(),    // paso 2: torre + calendario + slots + opcionales
  loadDisponibilidad(),  // GET dispMudanzas
  submitReserva(), // POST reservarMudanza
  cancelReserva(), // POST cancelarMudanza
  renderMisReservas(), // lista las reservas del numForm
  showFestivoWarning(), // mensaje emergente NO bloqueante
};
```

### 6.3 Flujo del usuario

1. Click "Agendar mudanza" → muestra Paso 1 (login)
2. Llena SS-XXXX + apto + CC → click "Verificar"
3. Backend valida, frontend muestra Paso 2 (formulario completo)
4. Selecciona tipo (Salida/Ingreso) → mensaje contextual amarillo
5. Selecciona torre (Naranja/Amarilla/Verde/Azul) → calendario
6. Click en un día del calendario → mensaje emergente sobre festivos (NO bloqueante)
7. Selecciona slot → campos opcionales → "Confirmar reserva"
8. Backend reserva, envía emails, muestra confirmación con MD-XXXX
9. (opcional) "Ver mis reservas" → lista las reservas del numForm

---

## 7. ANÁLISIS DE IMPACTO — ELEMENTOS AFECTADOS

### 7.1 Lo que se TOCA

| Elemento | Tipo de cambio | Riesgo |
|---|---|---|
| `apps-script/Codigo.gs` | agregar constantes + 4 funciones nuevas | BAJO (append al final) |
| Sheet `Mudanzas` | crear pestaña nueva con 19 cols | BAJO (no toca Registros/Entregas) |
| `index.html` | agregar 1 botón + 1 div | BAJO |
| `js/app.js` | agregar módulo `M` | BAJO si se encapsula bien |
| `docs/GUIA-PROYECTO-SANTA-SOFIA.md` | agregar sección §X "Mudanzas" | BAJO |
| Email templates | textos para admin/residente (mismo patrón Cerro Azul, solo email admin cambia) | BAJO |

### 7.2 Lo que se MANTIENE INTOCABLE

| Elemento | Por qué |
|---|---|
| 203 columnas de `Registros` | ya validadas en producción (SS-0001 → SS-0053+) |
| Pestaña `Entregas` | no requerida para mudanzas |
| Sheet de matrículas lookup `1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w` | no se usa en mudanzas |
| Endpoints existentes `nextId`, `lookup`, `lookupMatApto`, `lookupMatParq`, `adminLookup`, `vigilantesLookup`, `asignarDispositivos`, etc. | no se tocan |
| Hash dedupe de Registros | solo aplica a Registros |
| `apps-script/Codigo.gs` URL activa `/dev` | misma URL |
| Tokens `ADMIN_TOKEN` y `VIGILANTES_TOKEN` | se mantienen |

### 7.3 Conflictos / colisiones detectadas

| Conflicto potencial | Mitigación |
|---|---|
| ID reserva MD-XXXX vs numForm SS-XXXX | prefijos distintos, contadores separados |
| LockService.getDocumentLock() retorna null | usar `getScriptLock()` (ya aprendido en Cerro Azul) |
| Email al residente rebota (casilla llena) | usar copia oculta al admin; si falla MailApp, loggear y continuar |
| CC propietario cambia en Sheet (mudanza vende el apto) | la reserva queda con el CC viejo — agregar nota en confirmación |
| Festivos | solo mensaje emergente (sin validación automática) |
| Sheet nuevo `Mudanzas` sin headers | crear manualmente desde UI de Sheets (operador) |
| Primera carga de Apps Script lenta (~5-15s) | ya documentado en pitfall del skill |
| ADMIN_TOKEN se mantiene en Codigo.gs | NO se commitea al repo público (igual patrón actual) |
| El módulo M en app.js podría romper el recolector del form principal | encapsular con `const M = {}` separado, NO modificar funciones existentes |

---

## 8. ANÁLISIS DE CONTINGENCIAS

### C8.1 Concurrencia: dos residentes reservan el mismo slot al mismo tiempo

**Probabilidad:** MEDIA (2 ascensores efectivos × 4 slots/día L-V + 2 sábado = **10 slots/día disponibles en total**)
**Impacto si ocurre:** ALTO (doble reserva del mismo ascensor/horario)
**Mitigación implementada:**
1. `LockService.getScriptLock()` con `tryLock(30000)` antes de escribir (lección Cerro Azul)
2. Re-validación del slot dentro del lock — busca en TODO EL PAR (no solo torre)
3. Mensaje claro: "Otro residente acaba de reservar este horario."
**Probabilidad residual:** MUY BAJA (1 en 100k reservas aprox)

### C8.2 Deploy de Apps Script mata algo del flujo admin/vigilantes

**Probabilidad:** BAJA (solo se appendean funciones nuevas, no se modifican las existentes)
**Impacto si ocurre:** MEDIO (admin/vigilantes dejan de funcionar)
**Mitigación:**
1. Verificación post-deploy obligatoria: probar `nextId`, `lookupMatApto`, `lookupMatParq`, `lookup`, `adminLookup`, `vigilantesLookup` con curl
2. Si falla alguno, redeploy de versión anterior (Apps Script conserva historial)

### C8.3 Email al residente rebota

**Probabilidad:** MEDIA (1-2% de los registros pueden tener correo inválido)
**Impacto si ocurre:** BAJO (la reserva queda en Sheet, admin la ve)
**Mitigación:**
1. Email al admin va SIN copia oculta — admin tiene el dato
2. Si MailApp lanza error, loggear con `console.error` y continuar
3. El CC del propietario viene del Sheet — confiamos en que fue validado al crear
**No-bloqueante:** la reserva se confirma aunque el email falle

### C8.4 Cambio de propietario (venta del apto) entre crear SS-XXXX y agendar mudanza

**Probabilidad:** BAJA
**Impacto si ocurre:** BAJO (quien tenía el SS-XXXX puede seguir agendando)
**Mitigación:**
1. El admin debe manualmente invalidar el SS-XXXX del vendedor
2. El comprador debe crear un nuevo registro con su propio SS-XXXX
3. NO hay mitigación automática — flujo administrativo

### C8.5 Festivo en día de mudanza reservado

**Probabilidad:** MEDIA (~18 festivos/año)
**Impacto si ocurre:** BAJO (la reserva queda en Sheet, vigilancia no permite ingreso)
**Mitigación:**
1. Mensaje emergente al usuario al seleccionar fecha (NO bloqueante)
2. Admin puede cancelar manualmente desde Sheet si recibe queja
3. **No rechazamos automáticamente** — la decisión es del usuario

### C8.6 Reserva con menos de 48h de anticipación

**Probabilidad:** MEDIA
**Impacto si ocurre:** NINGUNO (rechazado por backend)
**Mitigación:**
1. Backend valida `fecha >= hoy + 2 días calendario`
2. Frontend muestra mensaje específico
3. Slots con < 48h se renderizan en gris en el calendario

### C8.7 Backend tira error 500 o timeout

**Probabilidad:** BAJA
**Impacto si ocurre:** MEDIO (usuario ve error genérico)
**Mitigación:**
1. Frontend muestra mensaje: "No pudimos procesar su reserva. Intente nuevamente."
2. No se duplican reservas porque el LockService garantiza atomicidad
3. Admin revisa logs de Apps Script si el error persiste

### C8.8 Cambio de URL del Web App (nueva implementación, no nueva versión)

**Probabilidad:** MUY BAJA (solo si se hace redeploy con breaking change)
**Impacto si ocurre:** ALTO (frontend queda desconectado)
**Mitigación:** NO se planea redeploy con breaking change. Si se necesita, seguir procedimiento P7.

---

## 9. PLAN DE IMPLEMENTACIÓN (8 FASES, CON CHECKPOINTS)

Cada fase espera OK explícito antes de avanzar.

| Fase | Acción | OK requerido | Reversible |
|---|---|---|---|
| **F0** | Backup completo Codigo.gs Santa Sofía + Sheet Registros | ⏳ pendiente | sí |
| **F1** | Aprobación de ESTE SPEC | ⏳ pendiente | sí |
| **F2** | Crear pestaña `Mudanzas` en Sheet (19 cols, headers) | ⏳ pendiente | sí (eliminar pestaña) |
| **F3** | Modificar `Codigo.gs`: constantes + 4 funciones | ⏳ pendiente | sí (revert manual) |
| **F4** | Probar endpoints con curl contra Sheet vivo (no destructive) | ⏳ pendiente | sí |
| **F5** | Modificar frontend (index.html + app.js) — rama separada | ⏳ pendiente | sí (git revert) |
| **F6** | Deploy Apps Script manual (Nueva versión, preserva URL) | ⏳ pendiente | sí |
| **F7** | Probar end-to-end con sesión de prueba real (apto SS-0001 o TEST-2000) | ⏳ pendiente | sí |
| **F8** | Push a GitHub Pages (después de F6+F7 OK) | ⏳ pendiente | sí (git revert) |

---

## 10. PROCEDIMIENTO DE ROLLBACK

Si en cualquier fase F2-F8 algo sale mal:

1. **Frontend (F5/F8):** `git revert <commit>` y `git push origin main --force-with-lease` (solo si es la última versión). Restaurar versión previa conocida.
2. **Apps Script (F3/F6):** abrir editor → revertir manualmente `Codigo.gs` → Deploy → Manage deployments → seleccionar versión anterior → Deploy. La URL `/dev` NO cambia.
3. **Pestaña Mudanzas (F2):** borrar pestaña manualmente desde UI de Sheets. Los datos quedan perdidos — por eso F0 es crítico.
4. **Emails enviados erróneamente:** admin (Fabio) puede escribir a residentes para disculparse y cancelar manualmente desde Sheet.

**Tiempo estimado de rollback total:** < 10 minutos.

---

## 11. CHECKLIST PRE-IMPLEMENTACIÓN

Antes de empezar F2, el operador debe confirmar:

- [ ] F0 backup verificado bit-a-bit (Codigo.gs + Sheet Registros export a .xlsx + CSVs por pestaña)
- [ ] F1 SPEC aprobado (este documento)
- [x] OPCIÓN B confirmada (pares comparten ascensor, 2 ascensores efectivos de mudanza) — 04-Oct-2026
- [ ] Disponibilidad para hacer F2-F8 en bloques cortos con OK entre cada uno
- [ ] Sheet `Mudanzas` aún NO creado (yo lo creo en F2 después de OK)

---

## 11.1 NOTA TÉCNICA — Decisión sobre "Inmobiliaria" en diligencia

**Contexto:**
- Cerro Azul permite: `Propietario`, `Tenedor / Otro`, `Inmobiliaria` como diligencia válida para agendar mudanzas.
- Santa Sofía **NO tiene `"Inmobiliaria"`** como valor posible en el Sheet. Solo permite: `Propietario`, `Arrendatario`, `Tenedor / Otro`.

**Decisión propuesta (default en F3 salvo objeción):**
- Solo aceptar `Propietario` y `Tenedor / Otro` como diligencia válida para agendar mudanzas en Santa Sofía.
- Si la inmobiliaria actúa, el operador llena el form como `Tenedor / Otro` (interpretación amplia del campo "Encargado o administrador del inmueble" — la UI del form ya muestra esta etiqueta).
- NO se agrega `"Inmobiliaria"` como nuevo valor permitido, para mantener 100% compatibilidad con registros existentes y no tocar la validación del backend de submit.

**Por qué no agregar "Inmobiliaria":**
- Implicaría modificar la lista de validación en `submit` (línea 211 de `Codigo.gs`: `['Propietario','Arrendatario','Tenedor / Otro']`).
- Implicaría migrar registros existentes o aceptar valores no migrados.
- El operador ya renombró "Tenedor / Otro" → "Encargado o administrador del inmueble" en la UI, manteniendo el value interno. Esto sugiere que prefiere mantener simple la lista de valores.

**Si el operador quiere agregar "Inmobiliaria" como nuevo valor:**
- Se modifica la lista en `submit` para incluir `"Inmobiliaria"`.
- Se modifica el frontend (`index.html` radio) para ofrecer 4 opciones en lugar de 3.
- Se aceptan registros nuevos con esa diligencia.
- Registros viejos sin migración siguen funcionando.
- Esto es **OUT OF SCOPE** de este spec por simplicidad.

---

## 12. ARCHIVOS RELACIONADOS

- `apps-script/Codigo.gs` — modificar (F3, append al final)
- `index.html` — modificar (F5, agregar 1 botón + 1 div)
- `js/app.js` — modificar (F5, agregar módulo `M` encapsulado)
- `docs/GUIA-PROYECTO-SANTA-SOFIA.md` — agregar sección §X "Mudanzas"
- `docs/spec-mudanzas.md` — este documento (referencia, se commitea en repo)
- `docs/sesion-mudanzas.md` — bitácora post-implementación (se crea en F8)
- Sheet pestaña `Mudanzas` — crear (F2)

---

## 13. REFERENCIAS

- Cerro Azul spec original: `/root/cerro-azul-residentes/docs/spec-mudanzas.md` (561 líneas)
- Cerro Azul `Código.gs` (líneas 689-1247): módulo de mudanzas completo implementado
- Cerro Azul `index.html` (líneas 565-880): frontend del módulo
- Cerro Azul `js/app.js` (líneas 824-1199): módulo `M` de mudanzas

---

FIN DEL SPEC v1.0.0 draft

**PENDIENTE antes de implementar:**
1. Tu OK explícito en F1 (SPEC aprobado).
2. Confirmación OPCIÓN A vs OPCIÓN B para torres (§1.1).
3. OK explícito antes de cada fase F2-F8.