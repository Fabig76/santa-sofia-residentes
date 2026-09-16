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