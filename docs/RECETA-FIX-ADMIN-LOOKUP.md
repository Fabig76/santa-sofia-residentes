# Receta: Fix adminLookup — devolver `placas`

> Receta operativa del fix aplicado el **14-Sep-2026** que restauró la
> llave `placas` en la respuesta del endpoint `adminLookup`. Antes del
> fix, el panel admin mostraba *"Este apartamento no tiene vehículos ni
> motos registradas"* aunque el Sheet sí tuviera datos, lo que impedía
> asignar tags/llaveros a placas específicas.

## Cuándo aplicar esta receta

- El panel admin muestra "no tiene vehículos" para un apartamento que SÍ
  tiene vehículos registrados en el Sheet.
- La respuesta de `?action=adminLookup` devuelve las llaves `apto`,
  `asignaciones` y `devolucion` pero NO devuelve `placas`.
- Tras cualquier deploy donde `adminLookup` haya sido editado.

## Causa raíz

`adminLookup` derivaba `placas` desde el helper `extractPlacas(row.values)`,
que estaba desincronizado con `rowToObject` (el helper probado que SÍ
devuelve vehículos correctamente). El endpoint público `lookup` usa
`rowToObject` y funcionaba; el admin usaba `extractPlacas` y no.

## Diagnóstico de 30 segundos

Comparar dos endpoints contra el mismo apartamento (ej. apto 262):

```bash
# Endpoint público: usa rowToObject, debe traer vehículos
curl ".../dev?action=lookup&numForm=SS-0002&apto=262"

# Endpoint admin: usa extractPlacas, si NO trae placas -> bug
curl ".../dev?action=adminLookup&token=TU_TOKEN&apto=262"
```

Si `lookup` devuelve `vehiculos` pero `adminLookup` no devuelve `placas`,
el bug está en `extractPlacas` (no en los datos ni en `rowToObject`).

## Fix paso a paso

### PASO 1 — Buscar esta línea EXACTA en `apps-script/Codigo.gs`

```js
const placas = extractPlacas(row.values);
```

Está justo debajo de:

```js
const obj = rowToObject(row.values, row.rowNumber);
```

**No borrar la línea de `const obj = ...`. Solo cambiar la de `placas`.**

### PASO 2 — Reemplazar por este bloque EXACTO (copiar tal cual)

```js
const placas = [
  ...(obj.vehiculos || []).filter(v => v && String(v.placa || '').trim())
    .map(v => ({ tipo: 'Vehiculo', marca: v.marca, clase: v.tipo, color: v.color, placa: v.placa, modelo: v.modelo, tag: v.tag })),
  ...(obj.motos || []).filter(m => m && String(m.placa || '').trim())
    .map(m => ({ tipo: 'Moto', marca: m.marca, clase: m.tipo, color: m.color, placa: m.placa, modelo: m.modelo, tag: m.tag })),
];
```

**Atención a las comillas**: son simples rectas (`'`), no curvas ni dobles.
Si quedaron mal, el Apps Script editor las marca con subrayado rojo.

### PASO 3 — Guardar y redesplegar

En el editor de Apps Script (sesión `santasofia.clubresidencial@gmail.com`):

1. `Ctrl+S` para guardar.
2. Botón **Implementar** → **Administrar implementaciones**.
3. Sobre el deploy existente: clic en **Editar** (lápiz).
4. Elegir **Nueva versión** (NO "Nueva implementación") — esto preserva
   la URL del Web App.

> ⚠️ Si haces "Nueva implementación" en lugar de "Nueva versión", la URL
> del Web App CAMBIA y hay que actualizar `APPS_SCRIPT_URL` en los 3 JS
> (`js/app.js`, `js/admin.js`, `js/vigilantes.js`) + commit + push.

### PASO 4 — Verificar en el navegador

```bash
URL="https://script.google.com/macros/s/AKfycbzMdiAFq.../dev"
curl "$URL?action=adminLookup&token=TU_TOKEN&apto=262"
```

Debe devolver, además de `apto`, `asignaciones` y `devolucion`, una
llave `placas` con 2 elementos:

- `tipo: "Vehiculo"`, `placa: "PFM367"`
- `tipo: "Moto"`, `placa: "EJP61H"`

Si NO aparece `placas`, revisar:

1. Que las comillas quedaron simples rectas (`'`).
2. Que no se borró la línea `const obj = ...` de arriba.
3. Que el deploy quedó en "Nueva versión" (no borrador).

## Lecciones aprendidas

- **`extractPlacas` quedó废弃** después de este fix. `adminLookup` y
  `vigilantesLookup` ahora derivan sus listas de vehículos desde
  `rowToObject` (el helper probado).
- Patrón general: preferir reusar `rowToObject` + filtrar en lugar de
  escribir extractores paralelos que se desincronizan.
- Ver pitfall "Extractores separados devuelven vacío en deploy" en la
  skill del proyecto para más detalle.

---

Origen: archivo `fix_adminLookup_placas.txt` (raíz del repo) promovido a
docs el 16-Sep-2026. Respaldo en Drive:
`19Hmw1ZpVO9ibuGjVPmb5mAwoJVil8cz0`.
