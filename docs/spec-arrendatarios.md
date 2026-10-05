# Portal de Arrendatarios — Santa Sofía Club Residencial (Spec V1.0)

**Fecha:** 05-Oct-2026
**NIT:** 901142051-3
**Email admin:** santasofia.clubresidencial@gmail.com
**Sheet Registros:** 1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo
**Backend actual:** Apps Script V22
**URL Apps Script (sufijo /dev):** https://script.google.com/macros/s/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev

---

## 1. Contexto y necesidad

En Santa Sofía el propietario llena el formulario principal (index.html) una vez. Pero los residentes del apartamento (esposa, hijos, arrendatario, etc.) no tienen cómo actualizar SUS propios datos (vehículos, mascotas, contactos) sin que el propietario vuelva a entrar.

**Necesidad:** que cada residente del apto pueda autoregistrar o editar SUS datos personales entrando con N° apto + cédula, igual que el portal de residentes de Cerro Azul.

**Decisión confirmada (operador, 05-Oct-2026):** el portal se llama "Portal del Residente" internamente. La pestaña externa en index.html dirá "Portal Arrendatario" — ese es el único lugar donde aparece la palabra "arrendatario".

---

## 2. Decisiones de diseño (D1-D12, adaptadas de Cerro Azul)

| ID | Decisión | Origen |
|---|---|---|
| D1 | Portal nuevo: `arrendatario.html` | adaptación Cerro Azul |
| D2 | Nombre interno: "Portal del Residente" (header, título) | operador |
| D3 | Pestaña en index.html: "Portal Arrendatario" (única mención de "arrendatario") | operador |
| D4 | Lógica idéntica a Cerro Azul: getEstadoResidente decide 3 caminos (no existe / vacío / con datos) | operador, iteración 1 |
| D5 | Auth: apto + CC (sin password). CC matchea propietario v[6] o slot residente v[30,35,40,45] | patrón Cerro Azul |
| D6 | Funciona para TODOS: Propietario, Tenedor, Arrendatario | operador |
| D7 | clearResidente SOLO en index.html (modo edición), NO en admin.html | operador |
| D8 | clearResidente: limpia secciones 5, 5.1, 6, 7, 9, 10 (incluye vehículos 3-4 en cols 143-166, mascotas 3-4 en 167-186) | adaptación Cerro Azul |
| D9 | QR por apartamento: para fase posterior | operador |
| D10 | 6 vistas: inicial, con-datos, no-existe, registro, editar, exito | Cerro Azul |
| D11 | LockService en los 3 writes (registrar, actualizar, clear) | Cerro Azul |
| D12 | Bugfixes de Cerro Azul a portar: BUGFIX-012 (editMode), BUGFIX-013 (parent), BUGFIX-018 (no exponer numForm/nombres) | auditoría |

---

## 3. Arquitectura

```
[GitHub Pages]                              [Apps Script V23]
arrendatario.html                            doGet / doPost
  + js/arrendatario.js  ───apiGet/apiPost──→  (5 endpoints)
  + assets/arrendatario.css                 + 2 helpers
                                            ↓
                                          Sheet "Registros" (203 cols)
                                          posiciones residentes v[29..48]
```

**Reutilización del backend actual (NO modificar):**
- `findRowByApto(apto)` — busca fila por apto
- `findRowByNumFormAndApto(numForm, apto)`
- `rowToObject(rowArr)` — mapea las 203 cols a objeto
- `submitRecord(payload)` — escribe fila (con editMode para update)
- `normApto(s)` — normaliza N° de apartamento
- `normalizarCC(s)` — ya existe (idéntico a normCc de Cerro Azul)

**Helpers nuevos (2):**
- `normCc(s)` — alias de `normalizarCC` (mismo comportamiento: quita `.`, `-`, espacios)
- `verificarAccesoResidenteOPropietario(apto, cc)` — busca CC en propietario v[6] o slots residentes v[30,35,40,45]

---

## 4. Endpoints backend (5)

### R.1 — `getEstadoResidente` (GET, público)
- **Input:** `?action=getEstadoResidente&apto=X`
- **Output éxito:** `{ok:true, apto, aptoExiste, hayResidentes, numResidentes}`
- **Output error:** `{ok:false, error}`
- **Comportamiento:**
  - `aptoExiste=false` → apto no registrado
  - `aptoExiste=true, hayResidentes=false` → slots 1-4 vacíos (auto-registro)
  - `aptoExiste=true, hayResidentes=true` → al menos 1 slot con nombre
- **⚠️ Seguridad (BUGFIX-018):** NO devuelve numForm, nombres ni propietario. Solo booleanos.

### R.2 — `verificarResidente` (GET, público)
- **Input:** `?action=verificarResidente&apto=X&cc=Y` (cc se normaliza con normCc)
- **Output éxito:** `{ok:true, slot, datos:{nombre, cc, parentesco, cel, correo}}`
- **Output error:** `{ok:false, error:"Cédula no corresponde..."}`
- **Comportamiento:** busca CC en v[6] (propietario) o v[30,35,40,45] (slots 1-4). Si matchea, devuelve el slot (1-4) y los datos.

### R.3 — `registrarResidente` (POST, LockService)
- **Input:** `{action, apto, residentes[], menores[], vehiculos[], motos[], bicis[], mascotas[], contactos[]}`
- **Validaciones:**
  - apto existe en Sheet
  - TODOS los slots 1-4 de residentes están vacíos
  - al menos 1 residente, máximo 4
  - residente 1+ requiere nombre + CC + parentesco + cel
- **Comportamiento:**
  - LockService 30s
  - Construye payload con `editMode:true` (BUGFIX-012: preserva numForm y fecha del propietario)
  - Normaliza `r.parentesco` → `r.parent` (BUGFIX-013)
  - Preserva dispositivos del propietario (BUGFIX-012)
  - Llama `submitRecord(payload)` que escribe en la fila existente
  - Sanitiza mensaje de error si contiene "EDITAR MI REGISTRO"
- **Output:** `{ok:true, numForm, slotAsignado, message}` o `{ok:false, error}`

### R.4 — `actualizarResidente` (POST, LockService)
- **Input:** `{action, apto, cc, slot, datos:{nombre, parentesco, cel, correo, vehiculos, mascotas, contactos}}`
- **Validaciones:**
  - apto + cc + slot (1-4) presentes
  - Re-verifica CC contra el slot (no confiar en frontend)
- **Comportamiento:**
  - LockService 30s
  - Edita SOLO los datos del slot N (no pisa otros residentes)
  - Slots compartidos (vehículos, mascotas) se manejan con cuidado: solo se editan los del slot N
- **Output:** `{ok:true, message}` o `{ok:false, error}`

### R.5 — `clearResidente` (POST, LockService + Logger.log)
- **Input:** `{action, token, numForm, apto, cc}` (cc del PROPIETARIO, no del residente)
- **Validaciones:**
  - Token del propietario (validación server-side)
  - CC matchea v[6] (propietario)
  - Opcional: cc matchea v[18] (Tenedor/Arrendatario principal, si se decide extender)
- **Comportamiento:**
  - LockService 30s
  - Limpia secciones 5 (residentes v[29..48]), 5.1 (menores v[49..60]), 6 (vehículos v[61..72] Y v[143..154]), 7 (motos v[73..84] Y v[155..166]), 9 (bicis v[85..92]), 10 (mascotas v[110..129] Y v[167..186])
  - **Nota:** en Cerro Azul solo limpia vehículos 1-2 y mascotas 1-2. En Santa Sofía hay que limpiar TAMBIÉN v[143..154] (vehículos 3-4) y v[167..186] (mascotas 3-4) — diferencia por las cols extra de v1.8b y v2.0.
  - Deja intactos: numForm, datos del propietario, parqueaderos, autorizaciones, firma
  - `Logger.log` con timestamp + numForm + apto + "clear ejecutado"
- **Output:** `{ok:true, message:"Datos del residente eliminados."}` o `{ok:false, error}`

---

## 5. Flujo del usuario (6 vistas)

```
                    ┌─────────────┐
                    │  INICIAL    │ (pide N° apto)
                    └──────┬──────┘
                           │ getEstadoResidente
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │NO_EXISTE │ │ REGISTRO │ │CON_DATOS │ (pide CC)
        └──────────┘ └────┬─────┘ └────┬─────┘
                          │            │ verificarResidente
                          │            ▼
                          │      ┌──────────┐
                          │      │ EDITAR   │
                          │      └────┬─────┘
                          │           │ actualizarResidente
                          ▼           ▼
                    ┌──────────────────┐
                    │      EXITO       │
                    └──────────────────┘
```

**Vista INICIAL:** input de N° apto + botón "Continuar". Link al index.html si es primera vez.
**Vista NO_EXISTE:** mensaje de apto no registrado, link al index.html.
**Vista REGISTRO:** form completo con secciones 5, 5.1, 6, 7, 9, 10 (4 residentes, 4 menores, 2 vehículos, 2 motos, 2 bicis, 2 mascotas, 2 contactos).
**Vista CON_DATOS:** lista de residentes actuales + input de cédula + botón "Editar mis datos".
**Vista EDITAR:** form con datos del slot N (datos personales + vehículos + mascotas + contactos). CC en readonly.
**Vista EXITO:** confirmación + botón "Volver al inicio".

---

## 6. Estructura del Sheet (posiciones confirmadas)

| Sección | Columnas | Notas |
|---|---|---|
| numForm | A (0) | preservado siempre |
| fechaRegistro | B (1) | preservado |
| fechaEdicion | C (2) | actualizado en cada edit |
| apto | D (3) | preservado |
| diligencia | E (4) | Propietario/Tenedor / Otro/Arrendatario |
| nombreProp | F (5) | preservado |
| **ccProp** | **G (6)** | **usado para clearResidente** |
| correoProp, celProp, telFijoProp | H,I,J (7,8,9) | preservados |
| matriculaApto | O (14) | preservada |
| parqueaderos 1-2 | K-N (10-13) | preservados |
| parqueaderos 3-4 (v1.7) | 187-190 | preservados |
| **Residentes slots 1-4** | **29-48** (5 cols c/u: nombre, cc, correo, cel, parent) | editables por R.3/R.4, limpiables por R.5 |
| Menores 1-4 | 49-60 (3 cols c/u) | limpiables por R.5 |
| Vehículos 1-2 | 61-72 (6 cols c/u) | limpiables por R.5 |
| **Vehículos 3-4 (v1.8b)** | **143-154** (6 cols c/u) | **limpiables por R.5 (DIFERENCIA vs Cerro Azul)** |
| Motos 1-2 | 73-84 (6 cols c/u) | limpiables por R.5 |
| **Motos 3-4 (v1.8b)** | **155-166** (6 cols c/u) | **limpiables por R.5** |
| Bicis 1-2 | 85-92 (4 cols c/u) | limpiables por R.5 |
| Mascotas 1-2 | 110-129 (10 cols c/u) | limpiables por R.5 |
| **Mascotas 3-4 (v1.8b)** | **167-186** (10 cols c/u) | **limpiables por R.5** |
| Emergencias 1-2 | 130-135 (3 cols c/u) | limpiables por R.5 |
| Dispositivos 1-3 | 95-109 | preservados por R.3 (BUGFIX-012) |
| Autorizaciones | 136-138 | preservadas |
| Firma | 139-141 | preservada |

---

## 7. Seguridad (lecciones de Cerro Azul aplicadas)

- **BUGFIX-018 (getEstadoResidente):** NO expone numForm, nombres ni propietario sin CC. Solo booleanos.
- **BUGFIX-017 (numForm como credencial):** nunca incluir numForm en mensajes de error a no-autenticados.
- **Auth por apto+CC:** la CC es el "conocimiento" que solo el residente tiene. No hay password.
- **clearResidente:** requiere CC del PROPIETARIO (v[6]), no del residente. Logger.log audita cada borrado.
- **LockService en writes:** previene race conditions (2 residentes autoregistrándose a la vez).
- **Sanitización:** mensajes de error de submitRecord se reescriben si mencionan "EDITAR MI REGISTRO" (el residente solo conoce arrendatario.html).

---

## 8. Plan de implementación (F0-F8)

| Fase | Descripción | Estado |
|---|---|---|
| F0 | Backup Codigo.gs V22 (local + Drive) | ✅ 05-Oct-2026 07:38 (md5 a17db6ead76a97b0daed0a6123f91c8d) |
| F1 | Spec redactado y aprobado por operador | ⏳ pendiente tu OK |
| F2 | Backend V23: 5 endpoints + 2 helpers (solo append) | ⏳ pendiente |
| F3 | Frontend: arrendatario.html + js/arrendatario.js + assets/arrendatario.css | ⏳ pendiente |
| F4 | Operador despliega V23 (Nueva versión) | ⏳ pendiente |
| F5 | Pruebas E2E con TEST-2000 (5 endpoints) | ⏳ pendiente |
| F6 | Push GitHub Pages (rama feature/arrendatarios) | ⏳ pendiente |
| F7 | Docs (README + GUIA §24 + SESIONES) | ⏳ pendiente |

---

## 9. Riesgos y mitigaciones

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | Concurrencia al autoregistrar | LockService 30s en R.3, R.4, R.5 |
| R2 | clearResidente borra dispositivos del propietario (bug BUGFIX-012 de Cerro Azul) | R.3 preserva dispositivos originales (no es R.5, R.5 limpia secciones específicas) |
| R3 | Residente edita slot de otro residente | R.4 re-verifica CC server-side contra el slot |
| R4 | getEstadoResidente expone datos personales | Solo devuelve booleanos (BUGFIX-018) |
| R5 | clearResidente no limpia vehículos 3-4 (v1.8b) ni mascotas 3-4 | Spec explícitamente incluye cols 143-154, 155-166, 167-186 |
| R6 | Frontend carga app.js y hereda helpers no definidos | Helpers (apiGet, apiPost, showView, showAlert) se definen LOCALMENTE en arrendatario.js |
| R7 | switchTab genérico no togglea nueva pestaña | index.html usa mismo patrón Cerro Azul: `document.querySelectorAll('[id^="tab-"]')` |
| R8 | QR no incluido en este módulo | Decidido para después (D9) |

---

## 10. Pruebas planeadas (F5)

### R.1 getEstadoResidente
1. Apto TEST-2000 (tiene residentes) → `aptoExiste:true, hayResidentes:true, numResidentes:1` (YURY)
2. Apto 2001 (no existe) → `aptoExiste:false`
3. Apto sin residentes (si existe) → `hayResidentes:false`
4. ⚠️ Verificar que NO devuelve numForm, nombres ni propietario

### R.2 verificarResidente
5. TEST-2000 + CC 1094923637 (YURY) → `ok:true, slot:1, datos:{...}`
6. TEST-2000 + CC incorrecta → `ok:false, error:"Cédula no corresponde..."`
7. CC con puntos/guiones (1094.923.637) → normaliza OK y matchea

### R.3 registrarResidente
8. Apto con slots vacíos → registra residente 1 → `ok:true, slotAsignado:1`
9. Apto con slots ocupados → rechaza con mensaje "ya tiene N residentes"
10. ⚠️ Verificar que numForm y fecha del propietario NO cambian (BUGFIX-012)
11. ⚠️ Verificar que parentesco se escribe en col correcta (BUGFIX-013)

### R.4 actualizarResidente
12. TEST-2000 slot 1 + CC correcta → actualiza cel → `ok:true`
13. TEST-2000 slot 2 + CC del slot 1 → rechaza (no es tu slot)
14. CC incorrecta → rechaza

### R.5 clearResidente
15. TEST-2000 + CC propietario + token → limpia secciones 5/5.1/6/7/9/10 → `ok:true`
16. ⚠️ Verificar que vehículos 3-4 (cols 143-154) y mascotas 3-4 (cols 167-186) TAMBIÉN se limpian
17. ⚠️ Verificar que numForm, datos del propietario, parqueaderos, firma NO se tocan
18. Logger.log muestra timestamp + numForm + apto

---

## 11. Decisiones de simplicidad (qué se OMITE por principio)

1. **NO** incluir QR en este módulo (D9, para después).
2. **NO** incluir botón clearResidente en admin.html (D7, solo index.html).
3. **NO** incluir cambio de parentesco en R.4 (solo se actualizan los datos del slot, no el parentesco — esto evita cambiar el rol del residente).
4. **NO** incluir notificaciones por email (Cerro Azul tampoco las tiene para R.5).
5. **NO** incluir paginación ni filtros (solo 4 residentes por apto, no se necesita).
6. **NO** crear pestaña nueva en el Sheet (todo va en "Registros", igual que Cerro Azul).

---

## 12. Referencias

- Cerro Azul: `https://fabig76.github.io/cerro-azul-residentes/residente.html`
- Cerro Azul backend V13 (referencia): `apps-script/Código.gs` líneas 1925-2543
- Cerro Azul frontend: `residente.html` (6 vistas) + `js/residente.js` (732 líneas)
- Cerro Azul skill: `~/.hermes/skills/productivity/cerro-azul-residentes/`
- Santa Sofía actual: V22 (adminBorrarReserva), 203 cols, mismas posiciones residentes
- Sheet posiciones: confirmadas con `rowToObject` en `apps-script/Codigo.gs` líneas 1154-1246
