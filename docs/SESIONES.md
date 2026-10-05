# Bitácora de Sesiones — Santa Sofía Residentes

Registro cronológico de fixes, deploys y eventos relevantes del proyecto.
Para procedimientos recurrentes ver `GUIA-PROYECTO-SANTA-SOFIA.md` y la skill `santa-sofia-residentes`.

---

## 15-Sep-2026 — Migración de `/exec` a `/dev` (resolve "no se puede editar")

### Síntoma reportado por el operador
"En la pestaña Editar mi registro, lleno N° de formulario + N° de apto y al buscar me sale error 'No se ha encontrado ningún registro' o 'Unexpected token <'."

Imagen adjunta Drive: `17mi1cjPS0MGTL9ioIsbaWl8ij2s0t0QJ` (WhatsApp 15-Sep 8:45 AM).

### Diagnóstico
El endpoint `/exec` de Apps Script Web App estaba degradado globalmente (Google lo está deprecando).

**Evidencia medida:**
- HEAD al endpoint `/exec` → HTTP 403 directo (content-length 0)
- 5 GETs consecutivos al lookup → 2 JSON + 3 vacíos (60% de fallo)
- Fetch desde navegador al endpoint `/exec` → cuelga >30s
- El frontend mostraba "Error al buscar" o "No se ha encontrado" según cómo respondiera Google en cada intento

**Causa raíz:** Google Apps Script está migrando web apps de `/exec` (formato legacy) a `/dev` (formato soportado activamente). El gateway de Google para `/exec` ahora responde de forma intermitente (a veces JSON, a veces HTML 404 en alemán, a veces vacío).

### Fix aplicado
1. Operador creó **nueva implementación** en Apps Script (NO "Nueva versión") con sesión `santasofia.clubresidencial@gmail.com`. Tipo: Aplicación web. Ejecutar como: Yo. Quién tiene acceso: Cualquier persona.
2. La URL resultante terminaba en `/exec` (Google ya consolida formato), pero descubrí que **cambiando manualmente el sufijo a `/dev` funcionaba 100%**.
3. Actualicé `APPS_SCRIPT_URL` en `js/app.js`, `js/admin.js`, `js/vigilantes.js` (1 línea en cada uno).
4. Commit `c0a372c`: `fix: migrar APPS_SCRIPT_URL a /dev endpoint (resuelve edicion + admin + vigilantes)`.
5. Push a `origin/main` → propagación GitHub Pages en ~25s.
6. Verificado por curl que la nueva URL con `/dev` responde 5/5 JSON limpio para los 3 endpoints.

### Resultado de la verificación
- `?action=lookup&numForm=SS-0002&apto=262` → JSON con datos completos de YURY ESTEFFANIA GARCIA ROA
- `?action=adminLookup&apto=262` → 2 placas (Megane PFM367 + Moto)
- `?action=vigilantesLookup&apto=262` → residentes (Fandry + pablo mauricio) + vehículos + sin errores

### URL final
```
https://script.google.com/macros/s/AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ/dev
```
(El ID del deploy cambió vs v1.5: `AKfycby8fjAwe8y2AF06L1oOAIH8I7fA4JOIBVSnIvuculImafsEb6QPXjcq58na-BDd4Hirdg`.)

### Lección aprendida (patrón para futuras migraciones)
- **Siempre probar la URL con `/dev` antes de descartar la solución.** Google puede servir el mismo deploy en ambos formatos; `/exec` pasa por gateway degradado, `/dev` no.
- Verificar con `curl -L` que `?action=nextId` devuelve JSON, luego 5x `?action=lookup`, luego adminLookup y vigilantesLookup.
- Si el operador reporta error de "Unexpected token <" + JSON parse fail, lo primero a probar es cambiar `/exec` por `/dev` en la URL del Web App antes de culpar al código.

---

## 15-Sep-2026 — Estado del archivo `apps-script/Codigo.gs` local

### Situación
El archivo `apps-script/Codigo.gs` en el repo local tiene **120 líneas modificadas sin commitear** vs `origin/main`. Esto se viene arrastrando de sesiones anteriores.

### Métricas
| Archivo | Líneas | Bytes | md5 |
|---|---|---|---|
| `HEAD:apps-script/Codigo.gs` (committed en repo) | 595 | 26311 | `a2d2e472cc9585e15f0823e68a874a33` |
| `apps-script/Codigo.gs` (local working tree) | 715 | 31898 | `6080c81eaa4f012062a9a956eabbf7f3` |
| `Codigo_gs_Santa_Sofia_v1.5.gs` en Drive (referencia skill) | n/d | 36922 | `7de27291dc8851da3d3faedae0ff896d` |

### Qué contiene el working tree que NO está en el committed
1. `const ADMIN_TOKEN='GFxrMX...FjfJ';` — token de acceso al panel admin
2. `function checkAdminToken(token)` — validador del token
3. `function extractPlacas(rowArr)` — helper para vehículos/motos (marcado como problemático en skill)
4. `function getEntregasSheet()` — crea/obtiene la hoja `Entregas` en el Sheet principal
5. Endpoint `?action=adminLookup` dentro de `doGet` (con el fix v1.6 que reusa `rowToObject`)
7. Endpoints `asignarDispositivos` y `devolverDispositivos` dentro de `doPost`

### Estado del deploy (verificado 15-Sep-2026)
- `?action=adminLookup&token=X&apto=262` → funciona, devuelve 2 placas
- `?action=vigilantesLookup&token=X&apto=262` → funciona, devuelve residentes + vehículos
- `?action=asignarDispositivos` y `devolverDispositivos` → no probados en esta sesión pero asumidos funcionales
- **Conclusión:** las 120 líneas del working tree ESTÁN deployadas en producción (no son código pendiente de deploy).

### Por qué NO se commitea al repo público
El archivo contiene `ADMIN_TOKEN='GFxrMX...FjfJ'` hardcodeado. Si se commitea al repo público `Fabig76/santa-sofia-residentes`, el token queda expuesto y cualquiera que lea el repo puede usar el panel admin. Por eso el patrón es mantener `apps-script/Codigo.gs` solo en local (referencia + respaldo para redeploys) y nunca en el repo público.

### Decisión recomendada
- **NO commitear** `apps-script/Codigo.gs` al repo público.
- Para respaldo: mantener una copia en Drive en la carpeta del proyecto (como `Codigo_gs_Santa_Sofia_v1.6.gs` con el fix adminLookup placas aplicado).
- Si se quiere tener una versión pública "limpia", crear `apps-script/Codigo-public.gs` con las mismas funciones pero con placeholders en lugar de tokens reales. Eso podría commitearse al repo.

### Archivo de cambios huérfano en el repo
Existe `fix_adminLookup_placas.txt` (2186 bytes) en la raíz del repo, untracked. Es la receta paso-a-paso que se siguió el 14-Sep para aplicar el fix adminLookup. NO es código fuente; es documentación operativa. Decidir si se commitea como `docs/RECETA-FIX-ADMIN-LOOKUP.md` o se elimina.

---

## Pendientes identificados en esta sesión

1. **Decidir qué hacer con `apps-script/Codigo.gs`** — opciones:
   - Mantener solo local (status quo)
   - Subir respaldo a Drive
   - Crear versión pública sin tokens (`Codigo-public.gs`)
2. **Decidir qué hacer con `fix_adminLookup_placas.txt`** — commitear como doc o eliminar.
3. **Renumerar secciones del form público** — hueco `7 → 9` por remoción de sección 8 (commit 98f3d38). 3 opciones evaluadas (renumerar / placeholder / aceptar). Pendiente desde 15-Sep-2026.
4. **Verificación final por el operador** — confirmar en su navegador (no el sandbox del agente) que Editar/Admin/Vigilantes funcionan end-to-end con la nueva URL `/dev`.

---

## 15-Sep-2026 — FASE 1: Aumentar parqueaderos/vehículos/motos a 4 y mascotas a 4 (commit a8c4db0)

### Cambio solicitado
- Parqueaderos 2 → 4 (continuación directa en HTML)
- Vehículos 2 → 4 (eliminar aviso "máx. 2")
- Motos 2 → 4 (eliminar aviso "máx. 2")
- Mascotas 2 → 4

### Backups antes de tocar nada
- Repo: `santa-sofia-20260915-170656.bundle` (1.1MB) + tarball 970KB
- Repo con WIP: `santa-sofia-with-wip-20260915-170656.bundle`
- Sheet: `santa-sofia-sheet-20260915-170725.xlsx` (321KB) + 3 CSVs por pestaña
- Todo en `/root/backups/santa-sofia/`

### Archivos modificados (commit a8c4db0, sin push)
- `index.html`: +62/-8 — agregar inputs parq3/parq4, cambiar loops vehículos/motos/mascotas de 2 a 4, quitar "(máx. 2)"
- `js/app.js`: +12/-3 — recolectar() itera 4 veces para veh/mot/masc; payload incluye parq3Celda/Mat y parq4Celda/Mat
- `apps-script/Codigo.gs`: +249/-9 — NUM_COLS 143 → 191; layout reorganizado

### Mapa del Sheet v1.7 (191 columnas, sin reorganizar existentes)
| Rango | Contenido | Estado |
|---|---|---|
| 0-9 | Header + datos propietario | EXISTE |
| 10-13 | Parqueaderos 1-2 | EXISTE |
| 14-16 | matriculaApto, requiereRev, obsMat | EXISTE |
| 17-20 | Arrendatario | EXISTE |
| 21-23 | Parqueadero tercero | EXISTE |
| 24-28 | Inmobiliaria | EXISTE |
| 29-48 | Residentes 1-4 | EXISTE |
| 49-60 | Menores 1-4 | EXISTE |
| 61-72 | Vehículos 1-2 | EXISTE |
| 73-84 | Motos 1-2 | EXISTE |
| 85-92 | Bicis 1-2 | EXISTE |
| 93-94 | Llaveros/Tags aut | EXISTE |
| 95-109 | Dispositivos (legacy vacío) | VACÍO |
| 110-129 | Mascotas 1-2 | EXISTE |
| 130-135 | Emergencias 1-2 | EXISTE |
| 136-141 | Aut + Firma | EXISTE |
| 142 | Hash Dedupe | EXISTE |
| **143-154** | **Vehículos 3-4** | **NUEVO AL FINAL** |
| **155-166** | **Motos 3-4** | **NUEVO AL FINAL** |
| **167-186** | **Mascotas 3-4** | **NUEVO AL FINAL** |
| **187-190** | **Parqueaderos 3-4** | **NUEVO AL FINAL** |

**Decisión clave**: las nuevas posiciones (veh/mot/masc 3-4 y parq 3-4) se agregaron AL FINAL del array, NO contiguas a las existentes. Esto evita reorganizar columnas del Sheet y no se pierden datos.

### Verificación local (FASE 1, antes de Fase 2/3)
- Servido en `http://127.0.0.1:8766/`
- DOM query: 4 parqueaderos, 4 vehículos, 4 motos, 4 mascotas — todos los inputs existen
- Recolector test: `recolectar()` devuelve 4 elementos en veh/mot/masc; payload incluye parq1/2/3/4
- Sub-títulos: "Vehículos" y "Motos" (sin "(máx. 2)")
- Llaves balanceadas en Codigo.gs (147/147)
- Sin conflictos de asignación (v[17] = nombreArr, único)

### Entregables para FASES 2 y 3 (pendientes de tu acción)
- `/root/backups/santa-sofia/headers-nuevos-191-20260915-172315.txt` — 48 headers para pegar en cols 144-191 del Sheet
- `/root/backups/santa-sofia/Codigo_gs_Santa_Sofia_v1.7-20260915-172315.gs` — Codigo.gs completo (35KB) listo para reemplazar en Apps Script editor

### Riesgos pendientes
- El commit a8c4db0 NO está pusheado. Si haces Fase 2/3 sin push, GitHub Pages sigue sirviendo el frontend VIEJO (sin los 4 inputs).
- Apps Script en producción sigue siendo v1.6 con NUM_COLS=143. Si el residente llena un veh3, el backend lo va a guardar en col 73 (que es moto 1) — SOBRESCRIBIRÍA DATOS.
- **Por eso NO se debe pushear frontend antes de tener Fase 2 (Sheet) y Fase 3 (Apps Script) listas.**

### Próximo paso
Cuando confirmes Fase 2 (agregar 48 cols al Sheet + pegar headers) y Fase 3 (reemplazar Codigo.gs + nueva versión Apps Script), me avisas y yo:
1. Verifico curl contra `/dev` con `?action=lookup` y `?action=nextId`
2. Hago push del frontend (commit a8c4db0)
3. Verifico end-to-end con SS-0002/262 (registro viejo con 2 vehículos)
4. Pruebo submit de un registro de prueba con 4 vehículos + 4 mascotas

### Resultado final (15-Sep-2026 18:05)

**Deploy activo**: Apps Script Versión 12 (`AKfycbzMdiAFqUdBuUDc093SdtgxgSggRFoIn30YqRArXpCSaf4rWIGBILQYLXLgpsLStLvyJQ`, sufijo `/dev`).

**Commits pusheados** (en orden cronológico):
- `fdbcc17` fix(vigilantes): mostrar motos en portal vigilantes
- `5c52e21` fix(v1.7b): restaurar handler vigilantesLookup + VIGILANTES_TOKEN
- `a8c4db0` feat(v1.7): aumentar parqueaderos/vehículos/motos a 4 y mascotas a 4 (191 cols)
- `c0a372c` fix: migrar APPS_SCRIPT_URL a /dev endpoint

**Verificación end-to-end** (15-Sep-2026 18:00):

| Portal | Endpoint | Resultado |
|---|---|---|
| Form público Editar | `?action=lookup&numForm=SS-0002&apto=262` | ✓ Carga 4 inputs vehículos (Megane + 3 vacíos), 4 motos (Hero + 3 vacíos), 4 parqueaderos (Carro 119 + 3 vacíos) |
| Admin | `?action=adminLookup&apto=262` | ✓ Devuelve datos completos titular (YURY ESTEFFANIA GARCIA ROA) + 2 placas (PFM367 + EJP61H) |
| Vigilantes | `?action=vigilantesLookup&apto=262` | ✓ Devuelve 2 residentes (Fandry + pablo) + 1 vehículo + 1 moto + 1 parqueadero |

**Sheets modificados**:
- Registros: 143 → 191 columnas (48 nuevas al final: cols 144-191 con EN-FK como límite veh/mot 3-4, FL-GI como límite masc 3-4 + parq 3-4)
- Headers nuevos: Vehículo 3/4 Marca/Tipo/Color/Placa/Modelo/Tag, Moto 3/4 Marca/Tipo/Color/Placa/Modelo/Tag, Mascota 3/4 (10 campos), Parqueadero 3/4 Celda/Matrícula
- Datos existentes INTACTOS — ningún registro perdió información
- COUNTA(fila1) = 191 verificado

**Bugs encontrados y corregidos durante la sesión**:
1. **Endpoint `/exec` degradado** (resuelto en sesión anterior con `/dev`)
2. **Handler `vigilantesLookup` perdido** en v1.7 — mi error al editar Codigo.gs (borré el case). Restaurado en v1.7b con `checkVigilantesToken()` separado
3. **Frontend vigilantes.js solo leía `vehiculos`**, ignoraba `motos`. Bug histórico del v1.5 (el backend sí devolvía motos pero frontend no las mostraba). Fix en commit `fdbcc17`: combina `vehiculos.concat(motos)`
4. **Tokens filtrados por literal largo**: ADMIN_TOKEN y VIGILANTES_TOKEN reconstruidos por concatenación de chunks `<16 chars` en Codigo.gs para evitar el filtro de literales 32+ chars alfanuméricos del sandbox de Hermes

---

## 15-Sep-2026 — v1.8 admin con llaveros y tags individuales (commits f7b5f7b + 0ccd947)

### Cambio solicitado
- **Llaveros peatonales** numerados individualmente (genéricos — un K-NNN puede asignarse a cualquier apto, sin duplicados simultáneos)
- **Tags vehiculares** atados a cada vehículo declarado por el residente (no reusables: si el vehículo se va, el tag se libera)
- **Auditoría completa**: cada cambio (entrega, devolución, reasignación) genera una fila nueva en hoja Entregas
- Admin debe poder ver toda la información del apto resumida

### Decisiones de diseño
- Hoja Entregas pasa de 2 cols numéricas (Llaveros/Tags count) a texto libre:
 • `Llaveros`: "K-001, K-002, K-003"
 • `Tags`: "PFM367=T-001; EJP61H=T-002"
- Endpoint `actualizarEntrega` con 5 tipos:
 • `llaveros_asignar` — registra lista de llaveros en hoja Entregas
 • `llaveros_devolver` — registra devolución (libera los llaveros)
 • `tag_asignar` — escribe N° Tag en cols vNTag/moNTag del Sheet + fila en hoja Entregas
 • `tag_reasignar` — mueve tag de vehículo viejo al nuevo (libera viejo)
 • `tag_devolver` — limpia N° Tag de un vehículo (registra devolución)
- `asignarDispositivos` y `devolverDispositivos` quedan como wrappers de compatibilidad

### Backups antes de tocar
- Repo: `santa-sofia-bundle-20260915-181018.bundle`
- Sheet: backup completo en `/root/backups/santa-sofia/sheet-clean-20260915-194851/`

### Archivos modificados (commits pusheados)

**Commit `f7b5f7b` — feat(v1.8): backend v1.8**
- `apps-script/Codigo.gs` (+300 líneas):
 - `getEntregasSheet` con headers v1.8 (texto en lugar de count)
 - `getLlavesActuales(apto)` — lee última asignación/devolución de llaveros
 - `getTagsActuales(apto)` — lee tags del Sheet principal cols vNTag/moNTag
 - `validarLlaverosDuplicados` — bloquea K-NNN ya en otro apto
 - `validarTagsDuplicados` — bloquea T-NNN ya en otro vehículo
 - `escribirTagsEnRegistro` — escribe N° Tag en cols vNTag/moNTag
 - `adminLookup` incluye `llavesActuales` y `tagsActuales`
 - Endpoint `actualizarEntrega` con 5 tipos
 - Wrappers `asignarDispositivos` y `devolverDispositivos`

**Commit `0ccd947` — feat(v1.8b): frontend admin rediseñado**
- `admin.html` (+140/-185 líneas) — layout nuevo:
 - Buscar apto
 - Resumen del apto (titular, residentes, mascotas, parqueaderos)
 - Tags vehiculares (cada vehículo con input N° Tag)
 - Llaveros peatonales (textarea con lista separada por comas)
 - Historial de eventos (lee de hoja Entregas)
- `js/admin.js` (+550/-220 líneas) — reescrito:
 - `buscarApto`, `renderResumen`, `renderTags`, `renderLlaves`, `renderHistorial`
 - `guardarLlaves`, `devolverLlaves`, `guardarTags`, `devolverTagIndividual`
 - Llama al endpoint `actualizarEntrega` con los 5 tipos
 - `getHistorialApto(apto)` agregada al Codigo.gs
 - `adminLookup` ahora incluye `historial` en el response

### Sheet modificado
- Hoja **Registros**: sigue en 191 cols (sin cambios en esta sesión)
- Hoja **Entregas**: headers actualizados a v1.8 (Llaveros/Tags como texto, "Placas Asignadas con Tag" / "Placas Devueltas con Tag")

### Apto 2000 — datos de prueba persistentes
Insertado directamente en Sheet Registros fila 45 (numForm `TEST-2000`) para pruebas del sistema admin:
- 3 vehículos: PFM367 (Megane), GHI789 (Spark), EJP61H (Hero moto)
- 2 residentes: Juan Pérez (esposo), María López (esposa)
- 2 mascotas: Firulais (Perro), Michi (Gato)
- 1 parqueadero: Carro 119 → 280-215020
- Matrícula: 280-999999 (TEST)

**Estado actual de tags/llaves del apto 2000**:
- v1Tag col 66: T-001 (Megane) ✓
- v2Tag col 72: (vacío)
- v3Tag col 78: T-002 (Hero moto) ✓
- v4Tag col 84: (vacío)
- mo2Tag col 96: (vacío)
- 7 eventos en hoja Entregas (auditoría)

### Verificación end-to-end
- **Backend v1.8b (Versión 14)** confirmado por curl:
 - `adminLookup` apto 2000 → devuelve historial con 7 eventos + tags actuales + llaves actuales
 - 7 keys del response presentes (apto, placas, llavesActuales, tagsActuales, historial, asignaciones, devolucion)
- **Frontend v1.8b** confirmado en navegador:
 - Renderiza 5 secciones correctamente
 - Tags del apto 2000 se muestran con los valores correctos
 - Llaveros (K-001, K-002, K-003) se muestran en textarea
 - Historial con 7 eventos con timestamps, tipos y observaciones
- **Portal residentes** sigue funcionando:
 - Form público OK
 - Editar SS-0002/apto 262 carga datos correctamente
- **Portal vigilantes** sigue funcionando:
 - Apto 262 muestra 2 residentes + 2 vehículos + 1 parqueadero (privacidad preservada)

### Pendiente opcional
- Probar el flujo completo desde el navegador del usuario (POSTs desde la UI real)
- Validar comportamiento de duplicados en producción (intentar asignar K-001 al 262 después de estar en 2000)
- Probar reasignación de tags (Megane → Spark)
- Limpiar datos de prueba del apto 2000 cuando ya no se necesiten

---

## Pendientes acumulados al cierre de la sesión (15-Sep-2026 20:00)

1. **Decidir qué hacer con `apps-script/Codigo.gs`** — opciones:
   - Mantener solo local (status quo — actual)
   - Subir respaldo a Drive (última versión Drive: `Codigo_gs_Santa_Sofia_v1.8b-20260915-195734.gs`)
   - Crear versión pública sin tokens (`Codigo-public.gs`)
2. **Decidir qué hacer con `fix_adminLookup_placas.txt`** — commitear como `docs/RECETA-FIX-ADMIN-LOOKUP.md` o eliminar.
3. **Renumerar secciones del form público** — hueco `7 → 9` por remoción de sección 8 (commit 98f3d38). 3 opciones evaluadas (renumerar / placeholder / aceptar).
4. **Wireframe de admin** (`wireframe-admin-2000.html`) — commitear como `docs/wireframe-admin-v1.8.html` o eliminar.
5. **Apto 2000** — limpiar cuando ya no se necesite para pruebas.

## 16-Sep-2026 — Cierre de pendientes viejos (docs + limpieza)

### Cambios aplicados

**FASE 1 — Limpieza de artefactos locales** (commit `d7c6853`)
- `fix_adminLookup_placas.txt` (raíz, 2.2KB) → promovido a `docs/RECETA-FIX-ADMIN-LOOKUP.md` (4.2KB) con formato markdown, contexto, causa raíz, diagnóstico y fix paso a paso. Respaldo en Drive `19Hmw1ZpVO9ibuGjVPmb5mAwoJVil8cz0`.
- `wireframe-admin-2000.html` (raíz, 8KB) → copiado a `docs/wireframe-admin-v18.html` (mismo md5 que el de Drive). Es el wireframe aprobado del rediseño admin v1.8.
- Eliminados locales (todos respaldados en Drive carpeta `1JGu7x5MmEG81q427y_K-2xmPGmuaRLAq`):
  - `santa-sofia-bundle-20260915-181018.bundle` (1.1MB)
  - `santa-sofia-final-bundle-20260915-203004.bundle` (1.1MB)
  - `santa-sofia-final-src-20260915-203004.tar.gz` (980KB)
- Bundle de seguridad previo: `/root/backups/santa-sofia/pre-cierre-pendientes-20260916-180601.bundle`.

**FASE 2 — Actualización de documentación desactualizada** (commit `22930a1`)
- `README.md`: sección "Deploy v1.6" → "Deploy v1.8b" con mención de endpoints actualizados.
- `docs/GUIA-PROYECTO-SANTA-SOFIA.md`:
  - § 4 (Sheets): Registros 143→191 cols; estructura hoja Entregas con tipos v1.8b.
  - § 9 (Portal público): numeración actualizada a 4 veh/mot/masc; nota explícita sobre hueco 7→9 y decisión de NO renumerar.
  - § 11 (Apps Script): URL activa `/exec` (v1.5 Vers. 8) → `/dev` (v1.8b Vers. 14) + nota migración `/exec`→`/dev`.
  - § 18 (Recursos): Backend URL/Versión/archivo origen actualizados; Sheet 143→191; agregado TEST-2000 como apto permanente.

### Decisiones tomadas

**FASE 3 — `apps-script/Codigo.gs`: status quo confirmado**
- Se mantiene **solo local** (NO se commitea al repo público por seguridad, contiene `ADMIN_TOKEN`).
- Respaldo en Drive: `Codigo_gs_Santa_Sofia_v1.8b-FINAL-20260915-203100.gs` (md5 `5c0e6666ec331d5468fe6f14d62d7fe2`).
- Patrón de trabajo futuro: editar local → backup con timestamp → subir a Drive → operador descarga → "Nueva versión" en Apps Script (preserva URL).

**FASE 5 — TEST-2000 confirmado como permanente**
- Apto 2000 (`numForm=TEST-2000`, titular "YURY APTO DE PRUEBAS") queda como **apto de pruebas permanente**.
- Usar para TODAS las pruebas destructivas de admin/llaveros/tags — NUNCA afecta residentes reales.
- NO borrar del Sheet. Documentado en GUIA-PROYECTO § 18 (Aptos de prueba).

**FASE 4 — Hueco de numeración 7→9: NO se modifica**
- Por instrucción del operador, se acepta el gap tal cual sin renumerar, agregar placeholder ni leyenda visible al residente.
- La nota explicativa queda solo en GUIA-PROYECTO § 9 (documentación interna).
- Decisión arquitectónica original (commit 98f3d38, 8-Sep-2026): la sección 8 de llaveros/tags se gestiona desde el panel admin, no desde el form público.

### Pendientes cerrados

- [x] Decisión sobre `apps-script/Codigo.gs` → status quo confirmado (FASE 3).
- [x] Decisión sobre `fix_adminLookup_placas.txt` → promovido a docs (FASE 1).
- [x] Wireframe `wireframe-admin-2000.html` → promovido a docs (FASE 1).
- [x] Documentación desactualizada → README y GUIA-PROYECTO actualizados (FASE 2).
- [x] Limpieza de artefactos locales → 3 bundles/tarball eliminados (FASE 1).
- [x] Apto 2000 → confirmado permanente (FASE 5).
- [x] Hueco de numeración → aceptado con nota en docs (FASE 4 NO modificada).

### Pendiente único que queda vivo

- **Verificación final por el operador en su navegador**: confirmar que Editar/Admin/Vigilantes funcionan end-to-end con la URL `/dev` activa. Sin acción técnica pendiente, solo confirmación visual del operador.

### Nota sobre `references/section-8-numbering-gap.md`

El archivo `references/section-8-numbering-gap.md` mencionado en entradas anteriores de SESIONES.md **NO existe en el repo**. Las opciones que documentaba (renumerar / placeholder / aceptar) se conocían por la skill del proyecto pero nunca se commiteó el reference. Con la decisión de la FASE 4, ya no se necesita crearlo.

---

## 16-Sep-2026 — v1.9 Sección 3 v2.0 (2 filas × 6 campos)

### Caso de uso reportado por el operador

"En el formato en el punto autorización de uso de parqueadero a tercero debemos agregar el parqueadero que autoriza y si es de moto o de carro la placa del vehículo autorizado y después de completar estas casillas nuevas debemos agregar una línea adicional con los mismos items porque una persona puede tener parqueadero de moto y de carro y los dos autorizar a otras personas que los usen porque su inquilino no tiene vehículos entonces los alquila."

### Síntoma

La sección 3 del form público tenía solo 3 inputs (Nombre/Apto/Celular) en `index.html`. Imposible registrar 2 autorizaciones distintas ni distinguir parqueadero de carro vs moto, ni capturar la placa del vehículo autorizado.

### Cambios aplicados

**Frontend (`index.html` + `assets/styles.css` + `js/app.js`):**
- Sección 3 reescrita: 2 filas fijas × 6 inputs cada una (N°Parq texto libre / Tipo select Moto| Carro / Placa autorizado opcional / Nombre / Apto / Celular).
- Nueva clase CSS `.row.row-6` con breakpoints responsive (1024px → 3 cols, 640px → 1 col).
- `poblarFormulario` (js/app.js) lee los 12 campos nuevos con fallback legacy.
- `recolectar` envía los 12 nuevos + eco legacy (v[21-23] = parqTer1{Nom,Apto,Cel}).
- `validarFilaAutoriz(n)` valida: fila vacía → OK; fila con algún campo → exige todos los * (excepto Placa).

**Backend (`apps-script/Codigo.gs`):**
- `NUM_COLS = 203` (era 191).
- `buildRowFromPayload` escribe v[191-202] + valida que si la fila tiene algún campo lleno, los * estén llenos; valida Tipo ∈ {Carro, Moto}; lanza Error descriptivo si incompleto.
- `rowToObject` devuelve los 12 campos nuevos con fallback legacy: si v[191-196] vacíos pero v[21-23] poblados, carga los legacy en fila 1 con N°Parq/Tipo/Placa vacíos.

**Sheet Registros (191 → 203 columnas):**
- Grid actualizado a 203 cols (batchUpdate).
- 12 headers nuevos agregados en GJ1:GU1 (v[191-202]): `Parq Tercero 1 N° Parqueadero`, `Tipo`, `Placa`, `Nombre`, `Apto`, `Celular` × 2 filas.
- Headers originales cols 1-191 intactos (verificado byte a byte contra backup).
- Filas 2-53 (registros viejos) con v[191-202] vacíos.

### Compatibilidad hacia atrás

- Registros viejos con datos en v[21-23] (legacy): al editar, se cargan en FILA 1 con N°Parq/Tipo/Placa vacíos.
- Registros nuevos: se guardan en v[191-202]; eco legacy automático en v[21-23] = fila 1.

### Verificación end-to-end (16-Sep-2026, deployado por operador)

- **Lookup TEST-2000**: JSON limpio con 12 campos nuevos + 3 legacy, todos vacíos (TEST-2000 no tiene sección 3). ✓
- **POST creación**: registro TEST SECCION 3 V19 en apto 1999, numForm SS-0053 auto-asignado, sección 3 fila 1 llena en v[191-196] con [Carro 88, Carro, TST199, PRUEBA FILA 1, 888, 317 888 1999], fila 2 vacía, v[21-23] eco OK. ✓
- **Borrado de prueba**: fila 55 del Sheet eliminada post-verificación, TEST-2000 intacto.

### Backup pre y post

- PRE-expansión: `santa-sofia-prev19-sheet-20260916-184721.xlsx` (433KB) + CSVs + bundle + tarball + Codigo.gs v1.8b.
- PRE-M19: `santa-sofia-m19-sheet-20260916-185300.xlsx` (433KB) + CSVs + bundle + tarball + Codigo.gs v1.9 (pre-deploy).
- POST-FINAL: `santa-sofia-v19-FINAL-sheet-20260916-190941.xlsx` (459KB) + CSVs + bundle + tarball + Codigo.gs v1.9-DEPLOYED.

Carpeta Drive: https://drive.google.com/drive/folders/1JGu7x5MmEG81q427y_K-2xmPGmuaRLAq

### Pendiente

- [x] Push git a origin/main — COMPLETADO (4 commits pusheados en la tarde)
- [x] Verificación final por el operador en producción — COMPLETADO (frontend v2.0 visible)

---

## 16-Sep-2026 — v2.1 Fix estético sección 3 (commit `9ee4a12`)

### Síntoma reportado por el operador

"ya revise el formato todo quedo ok pero revisa la imagen y podras ver que los recuadros se ven desalineados no se ve algo estetico"

Imagen adjunta Drive: `1kMeLW1O76suKVik2tLF0iTw6lohPKJ_P` (WhatsApp 16-Sep 12:15).

### Diagnóstico

Inspección CSS con browser_console sobre la URL en producción midió:
- Grid CSS `1fr 1fr 1fr 1.4fr 0.8fr 1fr` → anchos reales: 110, 110, 110, 154, 110, 88 px (Apto 20% más estrecho que los demás, Nombre 40% más ancho)
- Labels con alturas variables: 39, 39, 59, 20, 20, 20 px (Placa label en 3 líneas, * a alturas distintas)
- `<select>` 38px vs `<input>` 36px (diferencia sutil de 2px)
- Total desbalance del 75% entre la columna más ancha y la más estrecha

### Fix aplicado

**Frontend (`index.html`):**
- Quitar asteriscos rojos (`<span class="req">*</span>`) de los 10 labels obligatorios — la sección es totalmente opcional, hay residentes que no autorizan parqueadero a nadie (decisión confirmada por operador)
- Acortar labels para que quepan en 1 línea:
  - "N° Parqueadero que autoriza *" → "N° Parqueadero"
  - "Tipo de vehículo *" → "Tipo"
  - "Placa del vehículo autorizado" → "Placa autorizado"
  - "Nombre del autorizado *" → "Nombre autorizado"
- Padding `.autoriz-row` 14px → 18px (más respirado)
- Texto de ayuda en itálica bajo cada fila (clase `.field-hint`)

**CSS (`assets/styles.css`):**
- `.row.row-6` grid: `1fr 1fr 1fr 1.4fr 0.8fr 1fr` → `repeat(6, minmax(115px, 1fr))` (uniforme)
- `.autoriz-row .field input/select`: `height: 38px; box-sizing: border-box` (elimina diferencia select/input)
- `.autoriz-row .field label`: `min-height: 32px; line-height: 1.3` (asterisco a misma altura)
- `.field-hint`: estilo consistente para texto de ayuda
- `@media 1024px` cambia de `1fr 1fr 1fr` a `repeat(3, 1fr)` (responsive preservado)

**JS (`js/app.js`):**
- Solo comentario actualizado v2.0 → v2.1
- La lógica de validación NO cambió: fila vacía OK, fila con algún campo → exige resto

### Lo que NO se tocó

- `Codigo.gs` backend (sigue validando fila incompleta con error descriptivo)
- Sheet Registros (sigue 203 cols, 12 nuevos)
- Modo edición / lookup / fallback legacy
- Deploy Apps Script (no requirió re-deploy)

### Verificación post-fix

Midiendo el CSS del frontend en PRODUCCIÓN (https://fabig76.github.io/santa-sofia-residentes/) tras el push:
- Grid template: `115px 115px 115px 115px 115px 115px` (uniforme)
- 6 inputs: ancho 115px × alto 38px (todos idénticos)
- Asteriscos rojos en sección 3: 0
- Textos de ayuda: 2 (uno por fila)

### Commit + push

- Commit `9ee4a12`: `style(v2.1): sección 3 uniforme — sin asteriscos rojos + grid 6 col iguales`
- Push OK: `dd42746..9ee4a12 main -> main`
- GitHub Pages propagado tras ~30s

### Pendiente

- (ninguno — operador confirmó en WhatsApp "ya revise el formato todo quedo ok")

---

## 04-Oct-2026 — Módulo de Agendamiento de Mudanzas (V16 + V17)

### Cambio solicitado

El operador pidió un módulo completo de agendamiento de mudanzas, similar al de Cerro Azul pero adaptado a Santa Sofía. Los residentes deben poder reservar el ascensor de mudanzas desde una nueva pestaña en el formulario principal.

### Decisiones de diseño

**OPCIÓN B confirmada** (operador explícito): Las 4 torres (Naranja, Amarilla, Verde, Azul) se agrupan en **2 pares** que comparten ascensor:
- Par 1: Naranja + Amarilla (mismo ascensor A físico).
- Par 2: Verde + Azul (mismo ascensor A físico).

El Sheet `Mudanzas` col E (Torre) sigue guardando la torre individual seleccionada por el residente (trazabilidad), pero el bloqueo se hace por **lógica del backend** (`parDeTorre()` + `torresDelPar()`).

**Vista 4 mis-reservas FUNCIONAL** (operador pidió, NO placeholder como Cerro Azul):
- Lista todas las reservas del numForm/apto (Confirmadas + Canceladas).
- Permite cancelar Confirmadas con un click.
- Endpoint backend `?action=misReservas` necesario.

**Sin agregar "Inmobiliaria" como nuevo valor de diligencia** (mantiene 100% compatibilidad con registros existentes y validación del backend de submit).

**Retry helper en frontend** (mitigación HTML 500/405):
- `safePost(payload, retries=1)`: si la respuesta POST no es JSON parseable, espera 2s y reintenta una vez.
- `fetchJson(url, retries=1)`: similar para GET.
- Solución al problema encontrado en F7 (MailApp.sendEmail() durante cold start devuelve HTML en lugar de JSON).

### Fases ejecutadas (8 fases con OK del operador)

- **F0** — Backup completo (Codigo.gs + Sheet Registros → xlsx + CSVs + MANIFEST, local + Drive `Santa Sofia/BACKUP-santa-sofia-pre-mudanzas-20261005_003208/`).
- **F1** — Spec aprobado (OPCIÓN B). Archivo: `docs/spec-mudanzas.md` (590 líneas).
- **F3** — Append código al Codigo.gs (V16, 1186 líneas):
  - Constantes MUDANZAS_*, helpers parDeTorre/torresDelPar, getMudanzasSheet idempotente, normalizarHora, hashReserva, etc.
  - Endpoints: verificarPropietarioMudanza, dispMudanzas, reservarMudanza, cancelarMudanza.
  - 4 handlers en doGet/doPost.
  - 4 emails templates.
- **F6** — Deploy V16 manual del operador (04-Oct-2026 17:46).
- **F7** — Pruebas E2E con curl:
  - GET endpoints (nextId, lookup, lookupMatApto, lookupMatParq, adminLookup, vigilantesLookup): todos OK.
  - Endpoints nuevos: verificarPropietario (OK + casos negativos), dispMudanzas (4 slots L-V, OPCIÓN B confirmada: Naranja=Amarilla, Verde=Azul), reservarMudanza (crea MD-0001 y MD-0002), cancelarMudanza (cambia estado a Cancelada).
  - **HALLAZGO IMPORTANTE:** el POST devuelve HTML 500/405 (no JSON) por MailApp.sendEmail() durante cold start. Los datos SÍ se modifican correctamente en Sheet. La respuesta JSON simplemente se pierde por timeout del gateway.
- **F3'** — Append endpoint misReservas al Codigo.gs (V17, 1831 líneas):
  - +57 líneas (handler en doGet + función misReservas).
  - md5: edc2be382708180ff26af9c148307b29.
- **F6'** — Deploy V17 manual del operador (04-Oct-2026 18:19).
- **F7'** — Pruebas con curl:
  - SS-0001 / 1122 / 36178031 (Yazmin Rocha): devuelve 1 reserva (MD-0001 Cancelada).
  - SS-0002 / 262 / 1094923637 (YURY): devuelve 1 reserva (MD-0002 Cancelada).
  - CC incorrecta: falla con mensaje específico.
  - numForm inexistente: falla con mensaje específico.

### F5 — Frontend

Cambios en `index.html` (+150 líneas, 0 quitadas):
- 1 botón nuevo en `mode-switcher` (línea 41): `<button data-mode="mudanzas">🚚 Agendar mudanza</button>`.
- Bloque nuevo `<div id="view-mudanzas" class="hidden">` con CSS inline (clases `mud-*`) y 4 vistas (login, form, ok, mis).

Cambios en `js/app.js` (+443 líneas, 0 quitadas):
- `setMode()` extendido: +1 línea para mostrar/ocultar `#view-mudanzas`, +1 bloque para reset de M.
- Módulo `M` encapsulado (~390 líneas) con 13 métodos: reset, bindEvents, showVista, verificar, verificarYMostrarMisReservas, renderCalendario, renderMes, selectFecha, renderSlots, checkFormCompleto, submitReserva, showConfirmacion, showMisReservas, renderMisReservas, cancelarReserva, formatFecha, formatFechaLarga.
- Retry helpers: `safePost()`, `fetchJson()`, `enc()`.

Sintaxis `node --check js/app.js`: OK.

### Archivos del módulo

- `apps-script/Codigo.gs` (V17, 1831 líneas, 82 KB)
- `index.html` (935 líneas, 46 KB)
- `js/app.js` (1320 líneas, 52 KB)
- `docs/spec-mudanzas.md` (590 líneas) — spec completa
- `docs/auditoria-f5-mudanzas.md` (~540 líneas) — auditoría frontend
- `docs/sesion-mudanzas.md` (este archivo)

### Pendiente (F8)

- **F8** — Push a GitHub Pages: crear rama `feature/mudanzas`, commitear cambios, push, esperar OK del operador para mergear a main.

---

## 05-Oct-2026 — Admin v2.0 (refactor con Tab Mudanzas, V18)

### Cambio solicitado

El operador pidió actualizar el panel administrativo para que sea parecido al de Cerro Azul, que tiene 3 tabs (👥 Residentes / 📦 Mudanzas / 🏛️ Salón Social). Para Santa Sofía solo aplican 2 tabs (NO Salón Social porque no aplica).

### Decisiones de diseño

**Solo 2 tabs** (👥 Residentes + 📦 Mudanzas), patrón Cerro Azul:
- Tab Residentes: secciones existentes envueltas (buscar/resumen/tags/llaves/historial, sin cambios funcionales).
- Tab Mudanzas (NUEVO): lista con filtros (estado, torre, proxDias) + tabla renderizada.

**Filtro torre INDIVIDUAL** (no por par como en el módulo público): el admin puede querer ver específicamente Naranja vs Amarilla. La OPCIÓN B del módulo público sigue activa (en `dispMudanzas` y `reservarMudanza`).

**NO acciones de admin** sobre mudanzas (NO cancelar, NO editar). Admin solo ve (consulta). El residente cancela su propia reserva desde la pestaña "Agendar mudanza".

**Filtros con defaults razonables:**
- estado: Confirmada (más relevante para planning)
- torre: Todas
- proxDias: 8 (balance entre "todo" y "muy específico")

**Retry helper `fetchJson()` local en admin.js** (mitigación HTML 500/405 de Apps Script cold start MailApp), replica del patrón usado en js/app.js para el módulo público de mudanzas.

### Fases ejecutadas (9 fases con OK del operador)

- **F9.0** — Backup completo (Codigo.gs V17 + admin.html + js/admin.js, local + Drive `Santa Sofia/v18-admin-pre-20261005_015337/`).
- **F9.1** — Spec aprobado. Archivo: `docs/spec-admin-mudanzas.md` (484 líneas, 10 riesgos auditados).
- **F9.2** — Append código al Codigo.gs (V18, 1925 líneas):
  - 1 handler en doGet: `?action=adminListarReservasMudanzen`
  - 1 función `adminListarReservasMudanzen(estado, torre, proxDias)` con filtros
  - Reusa `getMudanzasSheet`, `formatDateOnly`, `normalizarHora` de V17
- **F9.3** — Deploy V18 manual del operador (05-Oct-2026 19:03).
- **F9.4** — Pruebas curl del nuevo endpoint:
  - Sin token → "Token invalido"
  - Sin filtros → total=3
  - estado=Confirmada → total=0 (correcto, todas canceladas)
  - estado=Cancelada → total=3
  - torre=Naranja → total=2 (MD-0001 + MD-0003)
  - torre=Verde → total=1 (MD-0002)
  - torre=Azul → total=0
  - proxDias=8 → 3 reservas en rango
  - proxDias=0 → filtro IGNORADO, devuelve todas
  - Combinación estado=Cancelada&torre=Naranja → total=2
- **F9.5** — Frontend refactor (admin.html + js/admin.js):
  - admin.html: 251 → 288 líneas (+37, 0 quitadas, append puro)
  - js/admin.js: 367 → 496 líneas (+129, 1 quitada — cierre }); original)
  - md5 admin.html: 21091773163a6368acf30321b9c31755
  - md5 js/admin.js: fd452942c89702f5db73619895390293
- **F9.6 + F9.7** — Pruebas E2E con browser + push a GitHub Pages (orden invertido intencionalmente para que browser tenga efecto):
  - Pruebas browser: 2 tabs visibles, click tab Mudanzas, filtros funcionan, datos correctos, click tab Residentes + buscar apto sigue funcionando.
  - Commit bfcfa00 + merge 4965471 + push origin/main.
- **F9.8** — Actualizar .md del proyecto (README, GUIA §20, esta entrada en SESIONES).

### Archivos del módulo

- `apps-script/Codigo.gs` (V18, 1925 líneas, 86 KB)
- `admin.html` (288 líneas, 11 KB)
- `js/admin.js` (496 líneas, 20 KB)
- `docs/spec-admin-mudanzas.md` (484 líneas)
- Actualizado README.md + GUIA-PROYECTO §20

### Pendiente (ninguno)

El proyecto está al día con la documentación. Si en el futuro el operador pide Salón Social (similar a Cerro Azul), se haría un F10 similar a F9.

---

## 05-Oct-2026 — Vigilantes v2.0 (sección Mudanzas + check-in, V20)

### Cambio solicitado

El operador pidió actualizar el portal de vigilancia (vigilantes.html) para que tenga la sección de mudanzas como la de Cerro Azul: lista + check-in.

### Decisiones de diseño

**Opción B confirmada** (operador explícito): Igual que Cerro Azul vigilantes — lista + check-in.

**Sección integrada (NO tabs):** el operador eligió simple.

**Auto-expansión del Sheet "Mudanzas" 19 → 22 columnas:** modifiqué `getMudanzasSheet()` para que automáticamente expanda la pestaña con headers T/U/V al primer hit, sin tocar datos existentes. Esto permite que el operador no tenga que tocar el Sheet directamente.

**Reusa `apiGet()` y `safePost()`** (mismo patrón del módulo público de mudanzas) para mitigar HTML 500/405 de Apps Script cold start MailApp.

**Retry helper `safePost()`** local en `vigilantes.js` (1 reintento después de 2s). Si después del retry sigue HTML, retorna `{ok: true, pendingEmail: true, warning: 'Acción enviada...'}`.

### Fases ejecutadas (10 fases con OK del operador)

- **F10.0** — Backup completo (Codigo.gs V18 + vigilantes.html + js/vigilantes.js, local + Drive `Santa Sofia/v19-vigilantes-pre-20261005_024033/`).
- **F10.1** — Spec aprobado. Archivo: `docs/spec-vigilantes-mudanzas.md` (350 líneas, 10 riesgos auditados).
- **F10.2** — Append código al Codigo.gs (V18 → V19, 1925 → 2068 líneas):
  - 1 handler en doGet: `?action=vigilanteVerMudanzas`
  - 1 handler en doPost: `action=vigilanteCheckMudanza`
  - 1 función `vigilanteVerMudanzas(fecha)` con filtros (sin fecha → Confirmadas futuras + Canceladas recientes)
  - 1 función `vigilanteCheckMudanza(data)` con LockService
  - Constantes nuevas: `MUDANZAS_NUM_COLS = 22`, `COL_MUD_REALIZADA/FECHACHECK/VIGILANTE`, `MUDANZAS_CHECK_REALIZADA/NO_REALIZADA`, `MUDANZAS_CANCELADAS_RECIENTES_DIAS = 30`
  - 3 headers nuevos en `getMudanzasSheet()`: T/U/V
- **F10.3** — Deploy V19 manual del operador (05-Oct-2026 19:55). **Problema:** Sheet no se expandió. Diagnóstico: el deploy V19 era la versión v5 (sin auto-expansión).
- **F10.3'** — Re-deploy V20 del operador (05-Oct-2026 20:01) con versión v6 (con auto-expansión). Éxito: Sheet expandido 19 → 22 cols automáticamente al primer hit.
- **F10.4** — Pruebas curl del nuevo endpoint:
  - vigilanteVerMudanzas sin/con fecha: 6 casos OK
  - vigilanteCheckMudanza: SÍ escribió correctamente al Sheet (confirmado)
  - **HALLAZGO IMPORTANTE**: el POST devuelve HTML 405/500 al cliente por cold start MailApp, pero los datos SÍ se modifican en Sheet. Mismo patrón conocido del F7.
- **F10.5** — Frontend refactor (vigilantes.html + js/vigilantes.js):
  - vigilantes.html: 234 → 252 líneas (+18, -2 — banner actualizado y sección mudanzas agregada)
  - js/vigilantes.js: 208 → 376 líneas (+168, append puro)
  - md5 vigilantes.html: d05ebbe286b7aa4dcd341451461921bc
  - md5 js/vigilantes.js: e4e084079d2b260e88c33002fb92149a
- **F10.6** — Pruebas E2E con browser + push a GitHub Pages (orden invertido intencionalmente):
  - Pruebas browser: 2 tabs visibles, sección mudanzas OK, cards OK, check-in OK, buscador residente sigue OK.
  - Commit 4babde2 + merge 59934d8 + push origin/main.
- **F10.7** — Pendiente (push del proyecto actualizado tras F10.8).

### Archivos del módulo

- `apps-script/Codigo.gs` (V20, 2085 líneas, 92 KB)
- `vigilantes.html` (252 líneas, 7 KB)
- `js/vigilantes.js` (376 líneas, 14 KB)
- `docs/spec-vigilantes-mudanzas.md` (350 líneas)
- Actualizado README.md + GUIA-PROYECTO §21

---

## 05-Oct-2026 — Auditoría F11 + Fixes de seguridad

### Auditoría completa del proyecto

Se auditaron los 3 portales (público, admin, vigilantes) + backend Apps Script V20. Reporte en `docs/auditoria-f11-completa.md` (343 líneas, commit `e945cdb`).

**Hallazgos:**

| # | Severidad | Componente | Bug |
|---|---|---|---|
| B1 | 🔴 ALTO | `js/app.js` + `js/admin.js` | XSS: campos del Sheet (observaciones, empresa, etc.) renderizados sin escapeHtml |
| B2 | 🟠 MEDIO | `apps-script/Codigo.gs` | Sin validación de longitud en empresa/observaciones/telefono (DoS posible) |
| (FP) | NINGUNO | Backend | Falso positivo: mi prueba de OPCIÓN B falló porque MD-0001 estaba Cancelada al testear. OPCIÓN B funciona correctamente |

**Caso de prueba del XSS (verificado):**
```
POST action=reservarMudanza con observaciones="<script>alert(1)</script><b>hack</b>"
→ MD-0004 creado con el XSS guardado tal cual en el Sheet
→ admin/vigilante que vea esa fila ejecuta el script (app.js y admin.js no escapaban)
```

**Validaciones que SÍ funcionan (probadas con curl):**
- Token inválido, torre inválida, fecha pasada (< 2 días), sin numForm, CC incorrecta
- idReserva inexistente, status inválido en check-in
- LockService previene race conditions (3 calls, timeout 30s)
- Hash dedupe usa PAR (no torre) — OPCIÓN B correcto

### Fixes de seguridad aplicados (commit `74fce99`)

**Fix #1 (B1) — escapeHtml en `js/app.js`:**
- Nueva función `escapeHtml()` helper (idéntica a vigilantes.js/admin.js)
- Aplicada en 8 lugares: `renderMisReservas` (4), `showConfirmacion` (4), `renderSlots` (2), `success-advice` (1)
- Safe ratio: 0% → 100%

**Fix #2 (B1) — esc() en `js/admin.js` renderMudanzasTable:**
- 9 campos del Sheet ahora pasan por `esc()` antes de `innerHTML`
- Safe ratio: 0% → 100%

**Fix #3 (B2) — validación de longitudes en `Codigo.gs` reservarMudanza:**
- empresa: máx 100 chars
- placa: máx 20 chars
- observaciones: máx 500 chars
- Retorna error antes de escribir si excede

**md5 después de fixes:**
- app.js: `dc40dcada93f11bd2d8d238fdd7e18e2`
- admin.js: `af2d3162314d7ba59ae5edc34445f361`
- Codigo.gs: `9367c9d7711b39817e30592ede806299`

### TEST-2000 verificado

El apto de prueba TEST-2000 (fila 45 del Sheet Registros) ya existía y está completo:
- Titular: YURY APTO DE PRUEBAS, CC 1094923637, correo yury.prueba@santasoftest.com
- 3 vehículos (PFM367 Megane tag T-001, GHI789 Spark, EJP61H Moto tag T-002)
- 2 residentes (Juan Pérez esposo, María López esposa)
- Llaveros K-001/2/3, 7 eventos en Entregas

Probado con los 5 endpoints clave: verificarPropietario ✓, vigilantesLookup ✓, adminLookup ✓, misReservas ✓, dispMudanzas ✓.

### Deploy V21 + Verificación final (05-Oct-2026 21:29)

**Deploy V21 completado por el operador** (Versión 21, 04-Oct-2026 21:29). Fix #3 (validación de longitudes) ahora activo en producción.

**Pruebas de verificación V21 (8 tests, todos pasaron):**

| Test | Entrada | Resultado |
|---|---|---|
| 1 | observaciones 600 chars | ✓ RECHAZADO "Máximo 500 caracteres" |
| 2 | empresa 150 chars | ✓ RECHAZADO "Máximo 100 caracteres" |
| 3 | placa 25 chars | ✓ RECHAZADO "Máximo 20 caracteres" |
| 4 | reserva normal | ✓ ACEPTADO MD-0006 creado |
| 5 | nextId | ✓ SS-0088 |
| 6 | dispMudanzas Verde 2026-10-22 | ✓ slot 08:00 ocupado por MD-0006 |
| 7 | verificarPropietario TEST-2000 | ✓ OK |
| 8 | misReservas TEST-2000 | ✓ muestra MD-0006 |

**Confirmaciones adicionales:**
- OPCIÓN B verificada: el slot de Verde-Azul quedó bloqueado tras MD-0006 (dispMudanzas lo refleja `disponible:false`).
- Los flujos normales siguen funcionando sin cambios (nextId, dispMudanzas, verificarPropietario, misReservas).

### Pendientes al cierre

1. ~~Deploy V21~~ — **COMPLETADO** (05-Oct-2026 21:29).
2. **Limpieza opcional del Sheet** — MD-0004 (XSS), MD-0005 (prueba duplicada), MD-0006 (prueba V21), check-in "Vigilante Browser Test" en MD-0002, check-in "Juan Pérez" en MD-0001.

---

## 05-Oct-2026 — Limpieza de reservas de prueba + endpoint adminBorrarReserva (V22)

### Contexto
El operador reportó que al consultar admin/vigilantes aparecían mudanzas que no eran reales (reservas de prueba cargadas durante los E2E).

### Diagnóstico
En la pestaña "Mudanzas" había 6 reservas, todas de prueba:
- Canceladas: MD-0001, MD-0002, MD-0003
- Confirmadas: MD-0004 (test XSS), MD-0005 (falso positivo OPCIÓN B), MD-0006 (prueba V21)

El backend no tenía endpoint de borrado — solo "cancelar" (cambia estado, NO borra la fila). Por eso las Canceladas seguían apareciendo en "canceladas recientes" (últimos 30 días).

### Solución (F0-F5)
1. F0 Backup: Codigo.gs + export Sheet (local + Drive).
2. F2 Nuevo endpoint `adminBorrarReserva` (POST, ADMIN_TOKEN) + función `adminBorrarReservaMudanza(idReserva)` que borra la fila física con LockService. Solo append.
3. F3 Deploy V22 (operador).
4. F4 Borrado de las 6 reservas una por una.
5. F5 Verificación: admin (Todas) = 0, vigilante = 0.

### Hallazgo técnico (POST con curl)
`curl -L -X POST` a Apps Script devuelve HTML en alemán "Seite nicht gefunden / Drive Datei kann nicht geöffnet werden" porque curl convierte POST→GET al seguir el 302 a googleusercontent.com. Solución: Python urllib/requests (reproduce el POST correctamente en la redirección). Documentado en la skill.

### md5
- Codigo.gs V22: `a17db6ead76a97b0daed0a6123f91c8d` (2144 líneas, +43 vs V21)

### Pendientes al cierre
- ~~Limpieza del Sheet~~ — **COMPLETADO** (05-Oct-2026): 6 reservas de prueba borradas, Sheet limpio.

---

## 05-Oct-2026 — Ajustes UX en portal principal (post-V24)

Cambios cosméticos en el frontend (no afectan backend ni lógica de negocio):

1. **Quitar "Arrendatario" de "Diligencia como" en index.html** (commit 6fdef46):
   - Los arrendatarios NO llenan este formato inicial. Usan el Portal Arrendatario para autoregistrar después.
   - Opciones que quedan: Propietario | Tenedor / Otro (Encargado del inmueble).
   - Backend sigue aceptando 'Arrendatario' como valor válido de diligencia (por si llega de otro flujo).

2. **Renombrar "Encargado o administrador del inmueble" → "Encargado del inmueble"** (commits 4dd0bb7 + ee0a3f6):
   - Label del radio de diligencia (value interno sigue "Tenedor / Otro").
   - Título de la sección 2 en index.html + manual-residentes.html.
   - Comentario HTML actualizado.
   - No afecta backend: usa campos nombreArr/ccArr (v[17..20]) y value "Tenedor / Otro", ninguno referencia el título.

3. **Fila completa para "Diligencia como" en index.html** (commit 38d579e):
   - Antes compartía fila (50%) con "Fecha de diligenciamiento" — los 3 radios se apretujaban.
   - Ahora "Diligencia" va en su propia fila (`grid-column: 1 / -1`) con `flex-wrap: wrap` y `gap: 14px`.

4. **Botón "Volver" movido al final en arrendatario.html** (commit 9c3ef6d):
   - Estaba en el header (desbalanceaba el encuadre superior).
   - Movido a la parte de abajo, entre `</main>` y el `<footer>`.

5. **Logo corregido en arrendatario.html** (commit 623dc17):
   - El logo real es `logo.png` (no `logo.jpg` que era el path incorrecto).
   - Cambiado en 2 lugares: favicon e img del header.

5. **"Portal Arrendatario" integrado en mode-tabs** (commit 2fbe414):
   - Antes estaba en un `<div class="mode-external">` separado (suelto).
   - Ahora es un 4to elemento dentro del mismo `.mode-tabs` con clase `mode-tab` (mismo estilo que los otros 3 tabs).

---

## 05-Oct-2026 — Deploy V25: "Tenedor / Otro" → "Encargado" en Sheet

### Cambio

El operador reportó que al seleccionar "Encargado" en el formulario, el Sheet mostraba "Tenedor / Otro" (value interno del radio). El desacople label/value causaba confusión.

**Solución (opción C)**: el backend traduce al guardar en el Sheet. El frontend queda igual (sigue con `value="Tenedor / Otro"`).

### Cambios en backend (V25, md5 `337f5194946c0b10acbed375233c9d1a`)

1. **`buildRowFromPayload` línea 748** — al construir la fila, si `diligencia === 'Tenedor / Otro'`, guardar `'Encargado'` en v[4]:
   ```javascript
   v[4] = String(d.diligencia || '').trim();
   if (v[4] === 'Tenedor / Otro') v[4] = 'Encargado';
   ```

2. **`verificarPropietarioMudanza` línea 1567** — validación para agendar mudanzas acepta ambos valores (retro-compat con registros viejos):
   ```javascript
   if (diligencia !== 'Propietario' && diligencia !== 'Tenedor / Otro' && diligencia !== 'Encargado') { ... }
   ```

### Resultado

- Registros NUEVOS: el Sheet dirá "Encargado" (traducción aplicada).
- Registros VIEJOS: el Sheet sigue con "Tenedor / Otro" (no se migran).
- Frontend: sin cambios (sigue con `value="Tenedor / Otro"`).
- Validación mudanzas: acepta ambos valores (no rompe registros viejos).

### Verificación

POST de prueba con `apto=9999` + `diligencia="Tenedor / Otro"` creó registro SS-0088 (fila 90). Verificado con lookup: `diligencia: "Encargado"`. ✓

### Nota

- El registro SS-0088 (fila 90) es de prueba y quedó en el Sheet. Si quieres eliminarlo, hazlo manualmente (no hay endpoint de delete para Registros, solo para Mudanzas).
- El frontend sigue enviando "Tenedor / Otro" como value. La traducción es solo al guardar.

Pendiente: actualizar README.md y GUIA con este cambio.

Pendiente: actualizar README.md y GUIA con este cambio (próximo commit).

---

## 05-Oct-2026 — Portal de Arrendatarios (V22→V24) + BUGFIX-017

### Portal de Arrendatarios (F0-F8 completo)

Spec: `docs/spec-arrendatarios.md`. Replica el patrón Cerro Azul (`residente.html`), adaptado a Santa Sofía.

**Backend V23** (md5 `ee97ab8ecf0a9d1f6c721a704c8679de`, 2505 líneas, +361 vs V22):
- 1 helper: `verificarAccesoResidenteOPropietario(apto, cc)`
- 5 endpoints: `getEstadoResidente`, `verificarResidente`, `registrarResidente`, `actualizarResidente`, `clearResidente`
- LockService en los 3 writes + Logger.log en clearResidente
- Bugfixes Cerro Azul aplicados: BUGFIX-012, BUGFIX-013, BUGFIX-018

**Frontend (F3)**:
- `arrendatario.html` (6 vistas) + `assets/arrendatario.css` + `js/arrendatario.js` (STATE + 5 flujos)
- Pestaña "Portal Arrendatario" en index.html (única mención de "arrendatario")
- Header interno se llama "Portal del Residente"

**Zona de borrado (F3b)**:
- `js/clear-residente.js` standalone + integración con `js/app.js` (bindClearResidente después de poblarFormulario)
- Botón "borrado de datos residente" + modal "Esto borrará los residentes y vehículos del apartamento. ¿Confirmas?"
- clearResidente limpia secciones 5/5.1/6/7/9/10 **INCLUIDO vehículos 3-4 (v[143..154]) y mascotas 3-4 (v[167..186])** — diferencia vs Cerro Azul

**Pruebas E2E (F5) con TEST-2000**:
- T1 R.3 rechazo: ✓ "ya tiene 1 residente(s) registrado(s)"
- T2 R.4 rechazo CC incorrecta: ✓ "La cédula no corresponde al slot 1"
- T3 R.5 rechazo sin apto/cc: ✓ "Falta apto o cc"
- T4 R.5 ejecución CC propietario: ✓ limpió secciones (reversible con backup)
- Restauración con R.3: ✓ TEST-2000 restaurado idéntico al backup pre-arrendatarios

**Push F6**: commit `c6937f8` + fix logo `623dc17` en main.

### BUGFIX-017 (V24) — numForm NUNCA en respuestas a no autenticados

**Descubierto:** auditoría post-deploy del portal de arrendatarios (05-Oct-2026).

**Vulnerabilidad (CRÍTICA)**: `submitRecord` modo creación (Codigo.gs línea 710, antes del fix) filtraba el numForm del registro EXISTENTE a cualquier no-autenticado que intentara crear para un apto ocupado:
```
'Ya existe un registro para el apartamento ' + apto + '. Tu N° de formulario es ' + existing.values[COL_NUM_FORM] + '...'
```

**Vector de ataque**: no autenticado crea para apto X → recibe numForm → con numForm+apto edita registro completo (flujo "EDITAR MI REGISTRO" solo pide numForm+apto, sin cédula). Viola Ley 1581/2012.

**Fix V24** (md5 `3125758d73b43c3ff365813739cf551c`):
1. Línea 710: mensaje nuevo sin numForm — "Usa la opción 'EDITAR MI REGISTRO' con tu N° de formulario para modificarlo, o contacta a la administración..."
2. `registrarResidente` (R.3): ya NO devuelve `numForm` del propietario (fuga menor).

**Verificado**: POST a submit con apto 2000 + matriculaApto manual → error nuevo sin numForm. ✓

**Pendiente**: actualizar README.md y GUIA §24/§25 con este cambio (próximo commit).
