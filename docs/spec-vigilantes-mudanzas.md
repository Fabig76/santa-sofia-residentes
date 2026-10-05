# SPEC — Vigilantes v2.0 (Sección Mudanzas + Check-in)
## Santa Sofía Club Residencial V.I.S — Módulo de vigilancia

**Versión:** 1.0.0 (draft para revisión)
**Fecha:** 05-Oct-2026 COL
**Autor:** Hermes Agent
**Estado:** PENDIENTE OK del operador antes de implementar
**Basado en:** Cerro Azul vigilantes.html (4 tabs, idéntico a este patrón)

---

## 0. RESUMEN EJECUTIVO

Refactor de vigilantes.html de Santa Sofía para añadir una **sección de mudanzas** (idéntica al patrón Cerro Azul), con lista + check-in del vigilante.

**Cambios:**
1. **`apps-script/Codigo.gs`** (V19) — append 2 funciones nuevas (`vigilanteVerMudanzas`, `vigilanteCheckMudanza`) + 2 handlers en doGet/doPost.
2. **Sheet "Mudanzas"** — expansión de **19 → 22 columnas** (agregar T/U/V).
3. **`vigilantes.html`** — agregar sección "📦 Mudanzas" debajo del buscador de residentes.
4. **`js/vigilantes.js`** — agregar `cargarMudanzas()`, `renderMudanzas()`, `apiGet()`.

**NO se tocan:**
- `index.html`, `js/app.js`, `admin.html`, `js/admin.js`
- Backend V18 (5 endpoints mudanzas + adminListarReservasMudanzen siguen funcionando)
- Sheet "Registros", "Entregas", "Maestros"
- Endpoint `vigilantesLookup` existente

---

## 2. REGLAS DE NEGOCIO (CONFIRMADAS CON EL OPERADOR 05-Oct-2026)

| Regla | Valor |
|---|---|
| Estructura | **Sección integrada** en vigilantes.html (NO tabs, igual que Cerro Azul solo en su contenido) |
| Funcionalidad | **Lista + check-in** (idéntica Cerro Azul) |
| Auth | VIGILANTES_TOKEN (mismo que vigilantesLookup) |
| Lista filtros | fecha (YYYY-MM-DD) opcional |
| Sin fecha | Confirmadas futuras + Canceladas recientes (últimos 30 días) |
| Check-in | vigilante marca `Sí` / `No` + su nombre (libre, hasta 100 chars) |
| Concurrencia | LockService.getScriptLock al escribir check-in |
| Cancelación | Vigilante NO cancela (lo hace residente o admin) |

---

## 3. CAMBIO ESTRUCTURAL — SHEET MUDANZAS

**Estado actual (V18):** 19 columnas (A..S).

**Nuevo estado (V19):** 22 columnas (A..V), agregando 3 al final:

| Col | Letra | Header | Tipo |
|---|---|---|---|
| 20 | T | Realizada | str ("Sí" / "No") |
| 21 | U | Fecha Check | str ("yyyy-MM-dd HH:mm:ss") |
| 22 | V | Vigilante | str (nombre del vigilante, max 100) |

**Acción del operador (manual, una sola vez):**
1. Abrir Sheet `Mudanzas` (Sheet ID `1xL359rDrhb3_qbhY-tm2MfPXKBqbAehC3zWzsMv1PUo`)
2. Agregar 3 columnas al final con headers: "Realizada", "Fecha Check", "Vigilante"
3. Las 3 filas existentes (MD-0001, MD-0002, MD-0003) tendrán esas celdas vacías — sin impacto.

**Importante:** Esta acción NO la puede hacer el backend programáticamente. Debe ser manual.

---

## 4. ENDPOINTS NUEVOS

### 4.1 GET `?action=vigilanteVerMudanzas`

```
Input:    ?token=VIGILANTES_TOKEN&fecha=YYYY-MM-DD
Validaciones:
  1. checkVigilantesToken(token) — server-side (igual que vigilantesLookup)
  2. fecha formato YYYY-MM-DD (opcional)
Algoritmo:
  - Lee pestaña Mudanzas completa (22 cols)
  - Si fecha especificada → filtra por fecha
  - Si fecha NO especificada:
      · Confirmadas futuras (o hoy) → incluye
      · Canceladas → solo últimos 30 días
  - Ordena: Confirmadas primero, luego por fecha ascendente
  - Retorna lista con {idReserva, numForm, apto, tipoMudanza, torre,
    ascensor, fecha, horaInicio, horaFin, nombrePropietario, estado,
    realizada, fechaCheck, vigilante, rowNumber}

Output:  {ok: true, reservas: [...], total: N}
Output ERR (sin auth): {ok: false, error: "Token invalido."}

Notas:
- Devuelve TODAS las reservas del Sheet (no filtra por numForm).
- Datos reducidos para privacidad: SIN correo, SIN celular, SIN cédula.
```

### 4.2 POST `action=vigilanteCheckMudanza`

```
Input JSON: {
  idReserva: "MD-0001",
  status: "realizada" | "no_realizada",
  vigilante: "Juan Pérez"  // libre, max 100 chars
}
Validaciones:
  1. checkVigilantesToken(token) — server-side
  2. idReserva no vacío
  3. status ∈ {"realizada", "no_realizada"}
  4. vigilante no vacío, ≤ 100 chars
  5. Reserva existe (findReservaById)
  6. LockService.getScriptLock().tryLock(30000) — para evitar race
Si OK:
  · Escribe col T (20): "Sí" si status="realizada", "No" si "no_realizada"
  · Escribe col U (21): fecha actual (yyyy-MM-dd HH:mm:ss)
  · Escribe col V (22): nombre del vigilante
  · Retorna {ok:true, message:"Check registrado correctamente", rowNumber:N}

Output ERR:
  · "Falta idReserva"
  · 'status debe ser "realizada" o "no_realizada"'
  · "No se encontró la reserva MD-XXXX"
  · "Otro vigilante está marcando. Intenta en unos segundos."

Notas:
- Lock previene race conditions entre 2 vigilantes marcando la misma reserva.
- NO envía emails (es una marca local para portería).
- NO requiere saber la fecha/hora exacta — el backend la pone.
```

---

## 5. CONSTANTES NUEVAS EN `Codigo.gs`

```javascript
// Helpers reusados del V18 (ya implementados):
//   - getMudanzasSheet() → crea pestaña si no existe, retorna sheet
//   - COL_MUD_ID hasta COL_MUD_HASH = 0-18
// Nuevos identificadores de columnas:
const COL_MUD_REALIZADA = 19;  // T
const COL_MUD_FECHACHECK = 20;  // U
const COL_MUD_VIGILANTE  = 21;  // V

// Actualizar MUDANZAS_NUM_COLS:
const MUDANZAS_NUM_COLS = 22;  // antes 19

// Constante de duración "recientes" para canceladas (días hacia atrás)
const MUDANZAS_CANCELADAS_RECIENTES_DIAS = 30;

// Valores de status para check-in
const MUDANZAS_CHECK_REALIZADA = 'Sí';
const MUDANZAS_CHECK_NO_REALIZADA = 'No';
```

---

## 6. AUDITORÍA DE RIESGOS

### R1. ¿Rompe vigilantesLookup?

**Riesgo:** Refactor de frontend podría romper el buscador de residentes.

**Mitigación:** El buscador de residentes se mantiene INTACTO. Solo se AÑADE la sección de mudanzas debajo. Las funciones existentes (`buscar`, `renderResultado`) NO se tocan.

### R2. ¿Rompe el endpoint `vigilantesLookup`?

**Riesgo:** Cambiar el número de columnas (19 → 22) podría romper el endpoint que lee las 22 cols (vigilantesLookup solo lee residentes, vehículos, etc., no toca col 19-21).

**Mitigación:** Verificado que `vigilantesLookup` lee solo las primeras 19 cols (residentes, vehículos, motos, mascotas, parqueaderos). Las nuevas cols 20-22 NO las toca.

### R3. ¿La expansión del Sheet daña datos existentes?

**Riesgo:** Al expandir de 19 → 22 cols, las celdas adicionales quedan vacías. NO se tocan datos existentes.

**Mitigación:** Las 3 filas existentes (MD-0001, MD-0002, MD-0003) tendrán celdas T/U/V vacías. Sin impacto.

### R4. ¿Dos vigilantes marcan al mismo tiempo?

**Riesgo:** Race condition — dos vigilantes marcan la misma reserva.

**Mitigación:** `LockService.getScriptLock().tryLock(30000)` previene esto. Si está bloqueado, retorna mensaje claro.

### R5. ¿El vigilante introduce HTML/XSS en su nombre?

**Riesgo:** El vigilante escribe su nombre como texto libre. Posible XSS.

**Mitigación:** El frontend usa `escapeHtml()` antes de renderizar. El backend no procesa HTML.

### R6. ¿El status es válido?

**Riesgo:** Frontend envía un status inválido.

**Mitigación:** Backend valida `status ∈ {"realizada", "no_realizada"}` antes de escribir.

### R7. ¿El token es válido?

**Riesgo:** Token manipulado.

**Mitigación:** Server-side `checkVigilantesToken(token)` antes de cualquier acción.

### R8. ¿El Sheet Mudanzas existe cuando se llama?

**Riesgo:** Si el Sheet no existe, `getMudanzasSheet()` podría fallar.

**Mitigación:** `getMudanzasSheet()` es IDEMPOTENTE (crea la pestaña si no existe, con headers). Reusado del V18.

### R9. ¿El Sheet tiene 22 cols en producción?

**Riesgo:** Si el operador olvida expandir el Sheet a 22 cols, los writes a T/U/V fallarán silenciosamente.

**Mitigación:** El operador EXPANDE el Sheet ANTES del deploy V19 (acción manual documentada). Las pruebas F10.4 verifican que funciona.

### R10. ¿La sesión del Sheet expira?

**Riesgo:** Apps Script puede tener límites de tiempo.

**Mitigación:** Lock con timeout 30s. Si tarda más, retorna error.

---

## 7. DECISIONES DE SIMPLICIDAD

| Decisión | Razón |
|---|---|
| **Sección integrada (NO tabs)** | Operador eligió simple |
| **NO Salón Social** | No aplica |
| **NO exportar a PDF/CSV** | Cerro Azul tampoco lo tiene |
| **NO filtros avanzados** (búsqueda por nombre, etc.) | Cerro Azul solo tiene filtro de fecha |
| **Reusa `getMudanzasSheet`, `findReservaById`, `formatDateOnly`** | V18 ya los implementó |
| **Append a Codigo.gs** | No tocar código existente |
| **Inline CSS en style del bloque** | No modificar assets/styles.css |
| **Lock con timeout 30s** | Igual Cerro Azul |

---

## 8. PRUEBAS POST-F10 (que voy a hacer)

### F10.4 — Pruebas curl

1. Sin token → "Token invalido"
2. Token incorrecto → "Token invalido"
3. Sin fecha → lista Confirmadas futuras + Canceladas recientes
4. fecha=2026-10-09 → lista de las 3 reservas de prueba
5. fecha=2026-10-04 (pasado) → empty
6. fecha=2026-10-15 (futuro sin reservas) → empty
7. Check-in MD-0001 → "Check registrado correctamente"
8. Check-in MD-0001 otra vez → actualiza (no error)
9. Check-in status="invalid" → "status debe ser..."
10. Check-in idReserva inexistente → "No se encontró la reserva..."

### F10.6 — Pruebas E2E con browser

1. Cargar vigilantes.html → buscador residente + sección mudanzas visible
2. Sección mudanzas → input fecha + botón "Ver todas"
3. Sin seleccionar fecha → ver 3 cards (MD-0001, 2, 3 — todas Cancelada según laSheet)
4. Seleccionar fecha 2026-10-09 → ver 3 cards (filtra por esa fecha)
5. Cada card muestra: ID, Fecha, Horario, Torre, Tipo, Apto, Nombre
6. Cada card muestra botones "Sí/No realizada" + input nombre del vigilante
7. Click "Sí" → marca como realizada
8. Verificar Sheet → col T="Sí", col U=fecha, col V=nombre
9. Buscar residente 1122 → sigue funcionando (no se rompió)

---

## 9. PROCEDIMIENTO DE ROLLBACK

Si en F10.5 o F10.6 algo sale mal:

1. **Frontend:** `git revert <commit>` + `git push origin main --force-with-lease`
2. **Backend:** Abrir editor Apps Script → revertir manualmente a V18 → Deploy
3. **Sheet:** Si se expandió, revertir manualmente (eliminar 3 cols)
4. **Sin daño:** El admin y residentes siguen funcionando (mismas APIs)

---

## 10. CHECKLIST PRE-IMPLEMENTACIÓN

- [x] F10.0 Backup verificado bit-a-bit (Codigo.gs + vigilantes.html + js/vigilantes.js)
- [ ] F10.1 SPEC aprobado (este documento)
- [ ] Operador CONFIRMA expansión del Sheet 19 → 22 cols (acción manual)
- [ ] Disponibilidad para hacer F10.2 → F10.8 en bloques cortos con OK entre cada uno

---

## 11. ARCHIVOS RELACIONADOS

- `apps-script/Codigo.gs` — modificar (F10.2, append al final ~120 líneas)
- `vigilantes.html` — modificar (F10.5, agregar sección ~+100 líneas)
- `js/vigilantes.js` — modificar (F10.5, agregar funciones ~+80 líneas)
- Sheet `Mudanzas` — expandir manualmente (F10.2 pre-requisito, 19 → 22 cols)
- `docs/spec-vigilantes-mudanzas.md` — este documento (referencia, se commitea)
- `docs/auditoria-f10-vigilantes.md` — auditoría (F10.5 antes de aplicar)

---

FIN DEL SPEC v1.0.0 draft

**PENDIENTE antes de implementar F10.2:**
1. Tu OK explícito.
2. Operador CONFIRMA que va a expandir el Sheet "Mudanzas" a 22 cols ANTES del deploy V19.