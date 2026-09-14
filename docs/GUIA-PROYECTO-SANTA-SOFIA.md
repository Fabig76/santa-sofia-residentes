# GUÍA DEL PROYECTO — Santa Sofía Residentes

Última actualización: 14-Sep-2026 (después del fix del script que rompía mascotas y emergencias)

---

## 1. Objetivo

Implementar para Santa Sofía Club Residencial V.I.S el mismo patrón funcional usado en Cerro Azul:
- Página pública con formulario de residentes (HTML/CSS/JS en GitHub Pages)
- Backend Apps Script (Web App deployado)
- Base de datos en Google Sheets (143 columnas)
- **NUEVO**: Panel admin privado para gestión de llaveros/tags (admin.html)

---

## 2. Datos oficiales usados

Fuente: RUT oficial Santa Sofía subido a Drive por el usuario.

- Archivo RUT oficial: https://drive.google.com/file/d/1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ/view?usp=drive_link
- ID: `1cyS7kGSVn2LRUzFuAPIDD78Fk4o7A-PJ`

- Razón social: Santa Sofía Club Residencial V.I.S
- NIT: 901142051-3
- Dirección: CR 27 # 44-25, Armenia, Quindío
- Correo: santasofia.clubresidencial@gmail.com
- Prefijo de formulario: SS-0001

---

## 3. Carpeta Drive del proyecto

https://drive.google.com/drive/folders/1GHR3HITyjPlIFbGrEYZWVAuMewdSzxF7

---

## 4. Sheets

- **Sheet principal de respuestas**:
  https://docs.google.com/spreadsheets/d/1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo/edit
  Pestañas: `Registros` (143 cols), `Maestros`
- **Sheet nativo de matrículas para lookup**:
  https://docs.google.com/spreadsheets/d/1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w/edit
  Pestañas: `Resumen y Matrículas`, `Apartamentos`, `Parqueaderos`
- **Hoja `Entregas`** (se crea automáticamente al primer uso desde admin.html):
  Estructura: Fecha, Tipo (Entrega/Devolucion), N° Formulario, N° Apto, Llaveros, Tags, Placas Asignadas, Placas Devueltas, Observaciones, Admin

---

## 5. Resultado cruce de matrículas

- Total unidades: 462
- Apartamentos: 228 totales, 228 con matrícula buena (100%)
- Parqueaderos: 229 totales, 229 con matrícula buena (100%)
- Ambiguas resueltas: 1 (Moto 60 = 280-226117, confirmada desde archivo Bienes V1)
- Archivo Bienes V1: https://drive.google.com/file/d/1Vj_mnEwUf4nvQ1xDPxe0xd1AWtCs5gNY

---

## 6. Regla funcional para matrículas no disponibles

Si la administración tiene matrícula válida:
- El formulario la autocompleta automáticamente.
- El residente puede editarla si no coincide.

Si la administración no tiene matrícula, aparece con XXXX, está vacía, es ambigua o no se encuentra:
- El formulario NO impide seguir llenando.
- El campo queda obligatorio.
- Se muestra aviso amarillo:
  "La administración no tiene disponible la matrícula inmobiliaria de esta unidad. Por favor escríbala manualmente según su escritura, certificado de tradición o documento de propiedad."
- Si intenta enviar sin escribirla, se bloquea el envío.
- En la respuesta se marca `Requiere Revisión Matrículas = Sí`.
- Se agrega observación: "Matrícula no disponible en base administrativa; digitada manualmente por el residente."

---

## 7. Diferenciación carro vs moto (crítico)

El Sheet nativo tiene 68 números compartidos entre carro y moto (ejemplo: `Carro 109` y `Moto 109` son matrículas distintas). El Sheet mantiene UN solo registro por número por tipo, diferenciado por la columna B (Tipo).

Frontend autocompleta correctamente cuando el residente escribe `Carro 109` o `Moto 109`. Si escribe solo `109`, el sistema NO puede resolver y marca `requiereManual=true` (correcto, necesita tipo).

---

## 8. Archivos del proyecto

### Frontend (en repo público GitHub)

- `index.html`: formulario público (12 secciones).
- `admin.html`: panel admin para llaveros/tags (noindex, nofollow).
- `assets/styles.css`: estilos.
- `assets/logo.png`: logo Santa Sofía.
- `js/app.js`: lógica del formulario público (validaciones, lookup, envío).
- `js/admin.js`: lógica del panel admin (búsqueda, asignar, devolver).

### Backend (NO commiteado al repo)

- `apps-script/Codigo.gs`: backend Apps Script con token admin hardcodeado. NO se commitea al repo público por seguridad.

### Documentación

- `docs/GUIA-PROYECTO-SANTA-SOFIA.md`: este archivo.
- `README.md`: descripción breve del repo.

---

## 9. Portal público (formulario para residentes)

URL: https://fabig76.github.io/santa-sofia-residentes/

12 secciones:
- 0 Encabezado (datos del conjunto readonly)
- 1 Datos del propietario
- 2 Datos del arrendatario / tenedor (si aplica)
- 3 Autorización de uso de parqueadero a tercero (si aplica)
- 4 Inmobiliaria y/o representante del propietario (si aplica)
- 5 Datos de los residentes del apartamento (mayores de edad, hasta 4)
- 5.1 Menores de edad (hasta 4)
- 6 Vehículos y motos (2 vehículos + 2 motos)
- 7 Bicicletas (máx. 2)
- ~~8 Control de entrega de llaveros y tags~~ (ELIMINADA — va en panel admin)
- 9 Mascotas / Animales de compañía (Decreto 768/2025, hasta 2)
- 10 Contactos en caso de urgencia (hasta 2)
- 11 Autorización de tratamiento de datos (Ley 1581/2012) + firma

Flujo del residente:
1. Llena sus datos
2. Backend hace lookup de matrícula del apto en tiempo real
3. Llena mascotas y contactos de emergencia
4. Acepta la autorización de datos
5. Firma (nombre + cédula)
6. Click en "Enviar formulario"
7. Backend crea fila en Sheet con N° Formulario correlativo (SS-XXXX)
8. Pantalla de éxito muestra el N° Formulario (debe guardarlo para editar después)

---

## 10. Panel admin (admin.html) — Gestión de llaveros y tags

URL: https://fabig76.github.io/santa-sofia-residentes/admin.html

**Propósito**: La administración registra la entrega y devolución de dispositivos (llaveros electrónicos y tags de vehículos) DESPUÉS de que el residente haya enviado su formulario. Usa los vehículos ya registrados por el residente como referencia.

**Características**:
- Página `noindex, nofollow` (no aparece en Google)
- Acceso restringido por token compartido (`ADMIN_TOKEN` en `js/admin.js` y `Codigo.gs`)
- Banner visual: "Esta página es solo para personal administrativo y de vigilancia. No compartir el enlace."

### Flujo del administrador

#### Paso 1: Buscar apartamento

1. Ingresar el N° de apartamento del residente
2. Click en "🔍 Buscar apartamento"
3. El sistema llama a `?action=adminLookup&token=X&apto=Y`
4. El backend devuelve:
   - Datos del titular (nombre, cédula, correo, celular, N° Formulario)
   - Placas registradas del apartamento (vehículos + motos que el residente llenó en el formulario)
   - Última asignación/devolución si existe (de la hoja `Entregas`)

#### Paso 2: Ver vehículos del residente

El panel muestra una sección "Placas registradas en este apartamento" con cada vehículo/moto como una fila con:
- Checkbox para seleccionar a qué placas se les entrega el tag
- Información: tipo (Vehículo/Moto), marca, clase, color, placa, modelo, tag

Si el apartamento NO tiene vehículos registrados, el panel muestra:
> "Este apartamento no tiene vehículos ni motos registrados. Verifique con el residente que el formulario principal esté completado."

#### Paso 3: Registrar entrega

1. Ingresar cantidad de llaveros físicos a entregar (default 0)
2. Ingresar cantidad de tags de vehículo a entregar (default 0)
3. Seleccionar con checkbox las placas a las que se les entrega tag
4. (Opcional) Ingresar observaciones: ej. "se entregan 2 llaveros y 1 tag para vehículo"
5. Click en "✅ Registrar entrega"
6. El sistema llama a `?action=asignarDispositivos&...` con:
   ```
   token, numForm, apto, llaveros, tags, placas[], obs
   ```
7. Backend escribe fila en hoja `Entregas` con:
   - Fecha actual
   - Tipo: "Entrega"
   - Llaveros, Tags, Placas Asignadas (separadas por coma)
   - Observaciones
8. Confirmación: "Entrega registrada."

#### Paso 4: Registrar devolución

1. (Requiere haber hecho al menos una asignación previa)
2. Click en "↩ Marcar devolución"
3. El sistema consulta las placas asignadas actualmente
4. Ingresar llaveros devueltos, tags devueltos, observaciones
5. Confirma

Backend escribe fila en hoja `Entregas` con:
- Fecha actual
- Tipo: "Devolucion"
- Llaveros, Tags devueltos
- Observaciones

### Ejemplo visual del flujo

```
┌─────────────────────────────────────────────────┐
│  🔒 Acceso restringido                          │
│  Esta página es solo para personal             │
│  administrativo y de vigilancia.                │
│  No compartir el enlace.                        │
│                                                  │
│  Paso 1 — Buscar apartamento                    │
│  N° de apartamento: [311]                       │
│  [🔍 Buscar apartamento]                        │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Datos del titular                               │
│  Titular:        Yazmin Rocha Calderón          │
│  Cédula:         36178031                        │
│  Correo:         yazroca4@yahoo.es              │
│  Celular:        3132011314                      │
│  N° Formulario:  SS-0001                        │
│                                                  │
│  Placas registradas en este apartamento         │
│  (vacío si el residente no llenó vehículos)    │
│                                                  │
│  [  ] Vehículo Megane 1 sedan PFM367 2008      │
│  [  ] Moto      hero - hunk     EJP61H 2026    │
│                                                  │
│  Llaveros físicos: [2]  Tags de vehículo: [1]  │
│  Observaciones:    se entregan 2 llaveros...    │
│                                                  │
│  [✅ Registrar entrega]   [↩ Marcar devolución] │
└─────────────────────────────────────────────────┘
```

### Endpoints backend del panel admin

Todos requieren `ADMIN_TOKEN` (comparado server-side):

| Endpoint | Método | Descripción |
|---|---|---|
| `?action=adminLookup&token=X&apto=Y` | GET | Busca apto, devuelve titular + placas + última asignación |
| `?action=asignarDispositivos&...` | POST | Registra entrega, escribe fila en hoja `Entregas` |
| `?action=devolverDispositivos&...` | POST | Registra devolución, escribe fila en hoja `Entregas` |

Si token inválido: `{"ok":false,"error":"Token invalido."}`

---

## 10.1 Portal de vigilantes (vigilantes.html) — Solo consulta

URL: https://fabig76.github.io/santa-sofia-residentes/vigilantes.html

**Propósito**: El personal de vigilancia consulta quién vive en cada apartamento **sin ver datos personales** (cédula, correo, celular, datos del propietario).

**Datos que SÍ muestra**:
- N° de apartamento
- Residentes (mayores de edad): nombre + parentesco
- Menores de edad: nombre + edad + parentesco
- Vehículos y motos: marca, color, modelo, placa
- Parqueaderos: celda (ej: "Carro 119") + matrícula
- Mascotas: tipo, nombre, raza, color, sexo, fecha última vacuna

**Datos que NO muestra (privacidad)**:
- Datos del propietario (nombre, cédula, correo, celular)
- Datos del arrendatario/tenedor
- Datos del tercero autorizado a usar parqueadero
- Datos de la inmobiliaria
- Datos de contacto de emergencia
- Datos de autorización de datos
- Datos de firma
- Hash dedupe

**Características**:
- Página `noindex, nofollow` (no aparece en Google)
- Acceso restringido por token separado (`VIGILANTES_TOKEN` en `js/vigilantes.js` y `Codigo.gs`)
- Banner: "Acceso solo para personal de vigilancia. Esta página es de SOLO CONSULTA."
- NO tiene inputs de escritura ni modificación: solo el campo de búsqueda y un botón de consultar

### Flujo del vigilante

1. Ingresa el N° de apartamento en el campo de búsqueda
2. Click en "🔍 Consultar"
3. El sistema llama a `?action=vigilantesLookup&token=X&apto=Y`
4. El backend devuelve SOLO los datos visibles (filtrados server-side)
5. La página muestra las 5 secciones: Residentes, Menores, Vehículos, Parqueaderos, Mascotas

### Endpoint backend del portal vigilantes

| Endpoint | Método | Descripción |
|---|---|---|
| `?action=vigilantesLookup&token=X&apto=Y` | GET | Devuelve SOLO datos visibles para vigilancia |

Si token inválido: `{"ok":false,"error":"Token invalido."}`

### Ejemplo visual del flujo

```
┌─────────────────────────────────────────────────┐
│  👮 Acceso solo para personal de vigilancia     │
│  Esta página es de SOLO CONSULTA.               │
│  Use esta información únicamente para            │
│  identificar residentes en portería.            │
│                                                  │
│  Buscar apartamento                              │
│  N° de apartamento: [311]                       │
│  [🔍 Consultar]                                  │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│  Apartamento 311                                 │
│  2 personas · 2 vehículos · 1 parqueadero · 1 mascota│
│                                                  │
│  👥 Residentes (mayores de edad) 2               │
│  ┌─────────────────────────────────────────┐    │
│  │ Fandry Johanna Muñoz Laguna    esposa    │    │
│  │ Pablo Mauricio Borja Pimiento  esposo    │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  👶 Menores de edad 0                            │
│  (No hay menores registrados en este apartamento)│
│                                                  │
│  🚗 Vehículos y motos 2                          │
│  ┌─────────────────────────────────────────┐    │
│  │ 🚗 Megane 1 - sedan                      │    │
│  │    gris perla · 2008 · PFM367           │    │
│  │ 🏍️ hero - hunk 160r                    │    │
│  │    negro mate · 2026 · EJP61H           │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  🅿️ Parqueaderos 1                              │
│  ┌─────────────────────────────────────────┐    │
│  │ Carro 119      280-215020               │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  🐾 Mascotas 1                                   │
│  ┌─────────────────────────────────────────┐    │
│  │ 🐕 Perro Max                            │    │
│  │    Labrador · dorado · Macho            │    │
│  │    vacuna: 2026-01-15                   │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Privacidad: por qué se usan dos tokens separados

El `ADMIN_TOKEN` da acceso completo (incluye datos personales del titular y permite escribir/modificar). El `VIGILANTES_TOKEN` solo da acceso de lectura a datos no personales. Esto significa que si el link de vigilancia se filtra, NO expone datos personales. Y si el link admin se filtra, no expone a TODOS los vigilantes.

---

## 11. Despliegue

### GitHub Pages

- Repo: https://github.com/Fabig76/santa-sofia-residentes
- URL pública: https://fabig76.github.io/santa-sofia-residentes/
- URL admin: https://fabig76.github.io/santa-sofia-residentes/admin.html
- Branch: `main`, path `/`, con `.nojekyll`

NO hacer `git push` sin OK explícito del operador.

### Apps Script (deploy manual desde cuenta `santasofia.clubresidencial@gmail.com`)

1. Abrir https://script.google.com/home
2. Proyecto: `Santa Sofía - Formulario Residentes Backend`
3. El archivo `Codigo.gs` actual es la versión v1.3 (14-Sep-2026 20:16)
4. **Cada "Nueva implementación" genera URL nueva** — hay que actualizar `APPS_SCRIPT_URL` en `js/app.js` y `js/admin.js` y hacer commit + push.

#### URL activa (v1.5, deploy #8 del 14-Sep-2026 22:53)

```
https://script.google.com/macros/s/AKfycby8fjAwe8y2AF06L1oOAIH8I7fA4JOIBVSnIvuculImafsEb6QPXjcq58na-BDd4Hirdg/exec
```

Deploy ID: `AKfycby8fjAwe8y2AF06L1oOAIH8I7fA4JOIBVSnIvuculImafsEb6QPXjcq58na-BDd4Hirdg`

Archivo origen: `Codigo_gs_Santa_Sofia_v1.5.gs` (md5 `7de27291dc8851da3d3faedae0ff896d`)
- Drive: https://drive.google.com/file/d/12doJNa_zlrEtkZOwImoo0Sowz1xmtTDq/view?usp=drivesdk

### Cambios v1.2 → v1.3

1. **Endpoints admin nuevos** (adminLookup, asignarDispositivos, devolverDispositivos)
2. **Hoja `Entregas`** se crea automáticamente con el primer uso
3. **Fix de defensa en profundidad** en lookup, lookupMatApto, lookupMatParq (devuelven JSON error rápido en <1s si los parámetros están vacíos, antes se colgaban 60s)
4. **Fix manejo de mascotas**: acepta strings "Sí"/"No" (antes solo booleanos true/false)

### Cambios v1.3 → v1.4

1. **Portal de vigilantes nuevo** (`vigilantesLookup`):
   - Endpoint de solo CONSULTA para el personal de vigilancia
   - Devuelve: residentes (nombres + parentesco), menores (nombres + edad), vehículos, parqueaderos, mascotas
   - **NO devuelve**: datos del propietario, teléfonos, correos, cédulas ni ningún dato personal
   - Token separado `VIGILANTES_TOKEN` para que comprometer el token de vigilancia no exponga el panel admin
2. **Helpers nuevos en backend**: `extractResidentesVisibles`, `extractMenoresVisibles`, `extractMascotasVisibles`, `extractParqueaderos`

### Cambios v1.4 → v1.5 (14-Sep-2026 22:53)

1. **Fix crítico `vigilantesLookup`**: reescrito para usar `rowToObject` (probado y funcionando) en lugar de `extractPlacas`, que estaba devolviendo vacío en el deploy.
   - **Causa raíz**: `extractPlacas` estaba roto o era una versión vieja en el deploy. El endpoint `lookup` (que usa `rowToObject`) sí devolvía los vehículos correctamente, pero `vigilantesLookup` (que usaba `extractPlacas`) no.
   - **Solución**: `vigilantesLookup` ahora llama `rowToObject(row.values)` y filtra/mappea los campos visibles. Esto elimina la dependencia del helper problemático.

---

## 11.1 Aptos de prueba para verificación

| Apto | N° Form | Datos que debe mostrar el portal vigilantes |
|---|---|---|
| **262** | SS-0002 | 2 residentes (Fandry esposa + Pablo esposo), 2 vehículos (Megane PFM367 + Moto EJP61H), 1 parqueadero (Carro 119), sin mascotas ni menores |
| **1122** | SS-0001 | Yazmin Rocha (titular) sin residentes adicionales, sin vehículos, sin parqueadero, sin mascotas (todo vacío) |

Para verificar el portal vigilantes, consultar `apto=262` (el más completo) y `apto=1122` (el vacío).

---

## 12. Verificación post-deploy — receta

Después de cada deploy nuevo, probar en orden (reemplazar `<URL>` por la URL del Web App):

1. `<URL>?action=nextId` → `{"ok":true,"nextId":"SS-XXXX"}`
2. `<URL>?action=lookupMatApto&apto=311` → matrícula buena
3. `<URL>?action=lookupMatParq&celda=Carro%20109` → matrícula buena
4. `<URL>?action=lookup&numForm=SS-0001&apto=` → JSON error rápido (<1s) ← FIX v1.3
5. `<URL>?action=lookup&numForm=&apto=311` → JSON error rápido (<1s) ← FIX v1.3
6. `<URL>?action=adminLookup&token=X&apto=1122` → datos del apto ← ENDPOINT NUEVO
7. Pollear `https://fabig76.github.io/santa-sofia-residentes/js/app.js?_=$i` hasta que la URL nueva aparezca
8. Verificar visualmente con browser que las 12 secciones (sin 8) están completas y tienen inputs editables

---

## 13. Smoke tests end-to-end verificados

### 14-Sep-2026 (v1.3 deploy + fix script)

**Backend**:
- nextId → SS-0003 ✓
- lookupMatApto apto 311 → 280-214831 ✓
- lookupMatParq Carro 109 → 280-215010 ✓
- lookup con apto="" → 1.0s con JSON error ✓ (FIX cuelgue)
- adminLookup apto 1122 → Yazmin Rocha Calderón, CC 36178031 ✓

**Frontend público**:
- 12 secciones en orden correcto (sin 8)
- Sección 9 Mascotas: 10 hijos generados dinámicamente
- Sección 10 Emergencias: 4 hijos generados dinámicamente
- Autocompletar matrícula: apto 262 → 280-226067 ✓
- Inputs editables en todas las secciones ✓

**Frontend admin**:
- Buscar apto 1122 → muestra datos titular ✓
- Muestra "Placas registradas" (vacío para 1122 que no tenía vehículos)
- Botones "Registrar entrega" y "Marcar devolución" visibles ✓

**POST end-to-end con mascotas y emergencias**:
- POST con SS-0003 / apto 311 + Mascota 1 (Perro Rex Labrador No) + Mascota 2 (Gato Michi Persa Sí) + 2 emergencias
- HTTP 200 en 3.0s → `{"ok":true,"editMode":true,"numForm":"SS-0003"}`
- Sheet verificado: cols 111-130 y 131-136 escritas correctamente
- Fila de prueba borrada del Sheet

---

## 14. Bugs encontrados y resueltos

### Bug 14-Sep-2026: script inline rompe mascotas y emergencias

**Síntoma**: El residente podía ver las secciones 9 (Mascotas) y 10 (Emergencias) pero NO podía escribir en ellas — aparecían vacías.

**Causa raíz**: El operador quitó la sección 8 (Llaveros/Tags) con el commit 98f3d38, eliminando el `<div class="section">` del HTML pero NO eliminando el bloque de generación dinámica correspondiente del `<script>` inline. El script intentaba hacer `document.getElementById('dispositivos-container').innerHTML = html` pero `#dispositivos-container` ya no existía, por lo que `null.innerHTML` lanzaba `TypeError: Cannot set properties of null` que abortaba la ejecución ANTES de generar mascotas y emergencias.

**Fix**: Commit `a840214` eliminó las 16 líneas del bloque "Dispositivos (3)" del script inline en `index.html`.

**Lección aprendida**: Cualquier cambio de secciones debe mantener sincronizados el `<script>` inline y los `<div id="X-container">` del HTML. Verificar después con:
```js
document.querySelectorAll('#X-container').forEach(c => console.log(c.id, c.children.length))
```
Esperado: residentes=12, menores=8, vehiculos=4, motos=4, bicis=4, mascotas=10, emergencias=4.

### Bug v1.2: lookup con campos vacíos se cuelga 60s

**Síntoma**: Si llega una llamada `?action=lookup` con `apto` o `numForm` vacíos, el backend se queda 60s buscando sin éxito.

**Fix v1.3**: Validación temprana en `doGet` que devuelve JSON error en <1s.

### Bug v1.2: manejo de mascotas "Sí"/"No" se guarda vacío

**Síntoma**: Cuando el residente marca "Sí" o "No" en manejo especial, la celda del Sheet quedaba vacía.

**Causa**: El backend solo entendía booleanos `true`/`false`. Cuando el frontend enviaba string "Sí" o "No", no había match.

**Fix v1.3**: Acepta strings "Sí"/"Si"/"si" → "Sí" y "No"/"no" → "No".

### Bug v1.4: `extractPlacas` devolvía vacío en vigilantesLookup

**Síntoma**: El portal vigilantes mostraba "Vehículos y motos 0" aunque el Sheet tenía los datos.

**Causa raíz**: El endpoint `vigilantesLookup` usaba `extractPlacas` que estaba roto o era una versión vieja en el deploy. El endpoint `lookup` (que usa `rowToObject`) SÍ devolvía los vehículos correctamente — esto confirmó que el problema era específico de `extractPlacas`, no de los datos ni del Sheet.

**Diagnóstico clave**: Comparar dos endpoints contra el mismo apto:
- `lookup&numForm=SS-0002&apto=262` → devolvía `vehiculos: [Megane PFM367, Moto EJP61H]` ✓
- `vigilantesLookup&token=X&apto=262` → NO devolvía `vehiculos` ✗

**Fix v1.5**: Reescribir `vigilantesLookup` para usar `rowToObject(row.values)` y mappear/filtrar los campos visibles. No depender del helper problemático.

### Bug v1.4→v1.5: URL del Web App cambió al hacer "Nueva versión"

**Síntoma**: Después de re-deployar como "Nueva versión", el portal seguía consultando el backend viejo.

**Causa raíz**: Cada "Nueva implementación" genera una URL NUEVA. Pero cuando se hace "Nueva versión" (desde Administrar implementaciones), la URL PUEDE cambiar también. Los archivos JS (`app.js`, `admin.js`, `vigilantes.js`) seguían apuntando a la URL vieja (`AKfycbxAnuZ7...` de v5) cuando el backend ya estaba en `AKfycby8fjA...` (v6/v7/v8).

**Fix**: Actualizar `APPS_SCRIPT_URL` en los 3 JS con la URL correcta (commit `9939a7e`).

**Lección**: Después de CADA deploy (nueva implementación o nueva versión), verificar la URL del Web App y actualizar `APPS_SCRIPT_URL` en los 3 JS si cambió. Regla: `grep -n "APPS_SCRIPT_URL" js/*.js` debe mostrar la MISMA URL que el deploy activo.

---

## 15. Pendiente opcional (solo con OK del operador)

1. Borrar de Drive los archivos obsoletos:
   - `Codigo_gs_Santa_Sofia_v1.gs` y `_v1.1.gs` y `_v1.2.gs` (versiones viejas)
   - ZIPs obsoletos (v1, v1.1, v1.2, v1.3, v1.3.1, v1.3.2, v1.3.3)
   - Excel `matriculas_santa_sofia_COMPLETADO_PROPUESTA.xlsx` (v1 inicial)
2. Distribuir el QR (`14hIoPLQpAVx_3Du6vYwKjNYt3yIfdEUM`) por WhatsApp a residentes
3. Publicar aviso a la copropiedad de que el portal está activo
4. Si se quiere más seguridad: regenerar `ADMIN_TOKEN` y considerar OAuth Google real (no solo token compartido)

---

## 16. Estructura final del repo

```
santa-sofia-residentes/
├── .gitignore              # node_modules, .DS_Store, .env
├── .nojekyll               # GitHub Pages sirve archivos sin Jekyll
├── README.md               # descripción breve
├── index.html              # formulario público (12 secciones)
├── admin.html              # panel admin (gestión llaveros/tags)
├── vigilantes.html         # portal vigilantes (solo consulta)
├── assets/
│   ├── styles.css
│   └── logo.png
├── js/
│   ├── app.js              # lógica formulario público
│   ├── admin.js            # lógica panel admin
│   └── vigilantes.js       # lógica portal vigilantes
├── apps-script/
│   └── Codigo.gs           # backend (NO commiteado al repo, tiene ADMIN_TOKEN)
├── data/                   # Excels auxiliares (locales, no producción)
├── docs/
│   └── GUIA-PROYECTO-SANTA-SOFIA.md  # este archivo
├── qr/                     # archivos para generar QR
└── tests_local.py          # tests locales
```

---

## 17. Commits relevantes

```
a840214 (HEAD -> main, origin/main) fix: eliminar bloque dispositivos del script inline
3ce8c98 chore: actualizar APPS_SCRIPT_URL a v1.3 deployada
1a8bc1a feat: agregar panel admin para gestion de llaveros/tags
98f3d38 feat: quitar seccion llaveros/tags del form publico + actualizar finalidades
bddfd41 feat: reordenar campos parqueadero tipo-numero-matricula + readonly matricula
3baeebb feat: selector tipo parqueadero con mensaje explicito para evitar ambiguedad moto/carro
c08fe01 fix: deduplicar moto 60 (marcar como ambigua)
9f73ba5 fix: reconstruir lookup desde fila 2 + reasignar matriculas reales Bienes V1
36ad529 feat: actualizar archivo matriculas con datos del sheet nativo oficial
23662b9 feat: agregar 115 matriculas reales desde archivo bienes santa sofia V1
```

---

## 18. Contactos y recursos

- Operador: Fabio Iglesias (fabig76@gmail.com)
- Cuenta Apps Script: santasofia.clubresidencial@gmail.com
- Carpeta Drive del proyecto: https://drive.google.com/drive/folders/1GHR3HITyjPlIFbGrEYZWVAuMewdSzxF7
- Página pública: https://fabig76.github.io/santa-sofia-residentes/
- Panel admin: https://fabig76.github.io/santa-sofia-residentes/admin.html
- Sheet respuestas: https://docs.google.com/spreadsheets/d/1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo/edit
- Sheet matrículas: https://docs.google.com/spreadsheets/d/1qEnC5BCRags2r_RHQiB0LjK6Or1rx31Gvopr22-n12w/edit
