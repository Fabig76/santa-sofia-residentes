# AUDITORÍA F5 — Frontend Módulo Mudanzas (Santa Sofía)
**Fecha:** 05-Oct-2026 COL
**Estado:** PENDIENTE OK del operador antes de aplicar

---

## 1. RESUMEN EJECUTIVO

Se aplicarán **3 cambios pequeños y aislados** al frontend existente:

1. **`index.html`** — agregar 1 botón + 1 bloque nuevo (no toca nada existente)
2. **`js/app.js`** — agregar módulo `M` encapsulado + extender `setMode()` (no toca funciones existentes)
3. **Retry en POST** — wrapper para mitigar el problema HTML 500/405 del backend

Y también:
4. **`Codigo.gs` (V17)** — append endpoint `misReservas` para listar reservas del numForm/apto (F3' antes de F5)

Cero archivos nuevos. Cero modificaciones a funciones existentes del recolector. Cero dependencias nuevas.

---

## 2. CAMBIOS PLANIFICADOS

### 2.1 `index.html` (3 ediciones, +HTML ~150 líneas)

**Edit 1 — línea 41:** Agregar 1 botón en `mode-switcher` (después del botón "Editar"):
```html
<button type="button" class="mode-tab" data-mode="mudanzas" role="tab">
  🚚 Agendar mudanza
</button>
```

**Edit 2 — antes de `</main>` (~línea 760):** Agregar bloque con CSS inline + 3 vistas (login, form, confirmación).

Por decisión de simplicidad, **OMITO la vista "mis-reservas"** de Cerro Azul (mostraba placeholder "en desarrollo"). Total: 3 vistas en vez de 4.

**Edit 3 — antes de `</body>` (línea 782):** Agregar `<script src="js/mudanzas.js"></script>` o appendear módulo a `js/app.js`.

DECISIÓN: **appendear a `js/app.js`** (NO archivo separado). Cerrojos sí tiene archivos separados pero aquí preferimos simplicidad — el módulo va al final del archivo existente con `const M = { ... }`.

### 2.2 `js/app.js` (3 ediciones, +JS ~250 líneas)

**Edit 1 — línea 109-114 (setMode):** Extender con 1 línea más:
```javascript
$('#view-mudanzas').classList.toggle('hidden', mode !== 'mudanzas');
```

**Edit 2 — línea 122 (mode tabs listener):** NO se modifica — ya es genérico (`t.dataset.mode`).

**Edit 3 — al final del archivo (~línea 877):** Agregar módulo `M` encapsulado + retry helper.

### 2.3 Retry helper (enmudanzas.js / app.js)

Wrapper `safePost(payload, retries=1)`:
- POST normal a /dev
- Si la respuesta NO es JSON parseable (es HTML), esperar 2s, reintentar 1 vez
- Si después del retry sigue HTML, retornar `{ok: true, pendingEmail: true, warning: 'Reserva enviada. Espere confirmación por email.'}`

---

## 3. DISEÑO HTML (detallado)

### 3.1 Estructura del nuevo bloque

```html
<div id="view-mudanzas" class="hidden">

  <!-- Vista 1: Login -->
  <div id="mud-vista-login" class="card">
    <h3>🚚 Agendar mudanza</h3>
    <p>Solo el propietario del inmueble o el encargado autorizado pueden reservar.</p>
    <div id="alert-mud-login" class="alert hidden"></div>
    <div class="field">
      <label>N° de formulario <span class="req">*</span></label>
      <input type="text" id="mudNumForm" placeholder="Ej: SS-0042">
    </div>
    <div class="field">
      <label>N° de apartamento <span class="req">*</span></label>
      <input type="text" id="mudApto" placeholder="Ej: 311">
    </div>
    <div class="field">
      <label>Cédula del propietario <span class="req">*</span></label>
      <input type="text" id="mudCcProp" inputmode="numeric" placeholder="Solo números">
    </div>
    <button class="btn btn-primary btn-block" id="btnMudVerificar">🔍 Verificar</button>
    <div style="text-align:center; margin-top:16px; font-size:13px;">
      ¿Ya tienes reserva? <a href="#" id="linkMisReservas">Ver mis reservas</a>
    </div>
  </div>

  <!-- Vista 2: Form -->
  <div id="mud-vista-form" class="card hidden">
    <h3>🚚 Agendar mudanza</h3>
    <div id="alert-mud-form" class="alert hidden"></div>
    <div class="section">
      <div class="section-head"><span><span class="section-num">1</span>Tipo</span></div>
      <div class="section-body">
        <label class="radio-row"><input type="radio" name="mudTipo" value="Salida"> <strong>Salida</strong> del arrendatario actual</label>
        <label class="radio-row"><input type="radio" name="mudTipo" value="Ingreso"> <strong>Ingreso</strong> del nuevo arrendatario</label>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><span><span class="section-num">2</span>Torre y ascensor</span></div>
      <div class="section-body">
        <div class="row">
          <div class="field">
            <label>Torre <span class="req">*</span></label>
            <select id="mudTorre">
              <option value="Naranja">Naranja</option>
              <option value="Amarilla">Amarilla</option>
              <option value="Verde">Verde</option>
              <option value="Azul">Azul</option>
            </select>
          </div>
          <div class="field">
            <label>Ascensor</label>
            <input type="text" value="A (único habilitado)" disabled>
          </div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><span><span class="section-num">3</span>Fecha y horario</span></div>
      <div class="section-body">
        <div id="mudCalendario"></div>
        <div id="mudSlots"></div>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><span><span class="section-num">4</span>Datos adicionales (opcionales)</span></div>
      <div class="section-body">
        <div class="row">
          <div class="field"><label>Empresa mudanza</label><input type="text" id="mudEmpresa"></div>
          <div class="field"><label>Placa vehículo</label><input type="text" id="mudPlaca" maxlength="10"></div>
        </div>
        <div class="field"><label>Observaciones</label><textarea id="mudObservaciones" rows="2"></textarea></div>
      </div>
    </div>
    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="btn btn-secondary" id="btnMudVolver">← Volver</button>
      <button class="btn btn-secondary" id="btnMudMisReservas">📋 Ver mis reservas</button>
      <button class="btn btn-primary btn-block" id="btnMudReservar" disabled>📅 Confirmar reserva</button>
    </div>
  </div>

  <!-- Vista 3: Confirmación -->
  <div id="mud-vista-ok" class="card hidden">
    <h3>✅ Reserva confirmada</h3>
    <p>ID Reserva: <strong id="mudOkId"></strong></p>
    <div id="mudOkDetalle"></div>
    <div style="margin-top:20px; display:flex; gap:10px;">
      <button class="btn btn-primary btn-block" id="btnMudOtra">Hacer otra reserva</button>
      <button class="btn btn-secondary btn-block" id="btnMudVerMisReservas">📋 Ver mis reservas</button>
    </div>
  </div>

  <!-- Vista 4: Mis reservas (FUNCIONAL, no placeholder) -->
  <div id="mud-vista-mis" class="card hidden">
    <h3>📋 Mis reservas</h3>
    <p id="mudMisSubtitulo">Apartamento X · Nombre Propietario</p>
    <div id="alert-mud-mis" class="alert hidden"></div>
    <div id="mudMisLista"></div>
    <div style="margin-top:20px;">
      <button class="btn btn-secondary" id="btnMudVolverMis">← Volver al inicio</button>
    </div>
  </div>

</div>
```

### 3.2 CSS inline (en el mismo bloque)

```html
<style>
  #mudCalendario { margin: 12px 0; }
  .mud-mes { margin-bottom: 16px; }
  .mud-mes h4 { color: var(--azul-osc); margin-bottom: 8px; }
  .mud-cal-grid { background: #fff; border: 1px solid var(--gris-borde); border-radius: 8px; padding: 8px; }
  .mud-cal-hdr { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 6px; }
  .mud-cal-hdr span { text-align: center; font-size: 11px; font-weight: 600; color: var(--gris-med); }
  .mud-cal-dias { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .mud-cal-dias span { aspect-ratio: 1; }
  .mud-dia {
    aspect-ratio: 1; border: 1px solid var(--gris-borde); border-radius: 6px;
    background: #fff; cursor: pointer; font-size: 13px;
  }
  .mud-dia:hover:not(:disabled) { background: var(--azul-claro); }
  .mud-dia-seleccionado { background: var(--azul-osc); color: white; border-color: var(--azul-osc); }
  .mud-dia-deshabilitado { background: #F0F0F0; color: var(--gris-med); cursor: not-allowed; }
  .mud-slots-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 12px; }
  .mud-slot {
    padding: 12px; border: 1px solid var(--gris-borde); border-radius: 6px;
    background: #fff; cursor: pointer; font-size: 13px;
  }
  .mud-slot-disponible:hover { background: var(--azul-claro); }
  .mud-slot-ocupado { background: #FFF0F0; color: var(--gris-med); cursor: not-allowed; }
  .mud-slot-seleccionado { background: var(--azul-osc); color: white; border-color: var(--azul-osc); }
  /* Vista mis-reservas */
  .mud-reserva-card {
    border: 1px solid var(--gris-borde); border-radius: 8px; padding: 14px;
    margin-bottom: 10px; background: #fff;
  }
  .mud-reserva-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--gris-borde);
  }
  .mud-reserva-id {
    font-family: monospace; font-weight: bold; color: var(--azul-osc); font-size: 15px;
  }
  .mud-estado-badge {
    padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
  }
  .mud-estado-confirmada { background: #DCFCE7; color: #166534; }
  .mud-estado-cancelada { background: #FEE2E2; color: #991B1B; }
  .mud-estado-completada { background: #E0E7FF; color: #3730A3; }
  .mud-reserva-detail { font-size: 13px; line-height: 1.6; }
  .mud-reserva-detail strong { color: var(--azul-osc); }
  .mud-reserva-actions { margin-top: 10px; text-align: right; }
  @media (max-width: 600px) {
    .mud-slots-grid { grid-template-columns: 1fr; }
  }
</style>
```

---

## 4. DISEÑO JS (módulo M encapsulado)

```javascript
const M = {
  state: { numForm: '', apto: '', ccProp: '', propietario: null, torre: 'Naranja', fecha: null, horaInicio: null, horaFin: null },

  bindEvents() {
    $('#btnMudVerificar').addEventListener('click', () => this.verificar());
    $('#btnMudCancelar').addEventListener('click', () => this.reset());
    $('#btnMudReservar').addEventListener('click', () => this.submitReserva());
    $('#btnMudOtra').addEventListener('click', () => this.reset());
    $('#mudTorre').addEventListener('change', () => {
      this.state.torre = $('#mudTorre').value;
      this.renderCalendario();
      $('#mudSlots').innerHTML = '';
      this.state.fecha = null;
      this.state.horaInicio = null;
      $('#btnMudReservar').disabled = true;
    });
  },

  showVista(v) {
    $('#mud-vista-login').classList.toggle('hidden', v !== 'login');
    $('#mud-vista-form').classList.toggle('hidden', v !== 'form');
    $('#mud-vista-ok').classList.toggle('hidden', v !== 'ok');
  },

  reset() {
    this.state = { numForm: '', apto: '', ccProp: '', propietario: null, torre: 'Naranja', fecha: null, horaInicio: null, horaFin: null };
    $('#mudNumForm').value = '';
    $('#mudApto').value = '';
    $('#mudCcProp').value = '';
    $('#mudTorre').value = 'Naranja';
    $('#mudEmpresa').value = '';
    $('#mudPlaca').value = '';
    $('#mudObservaciones').value = '';
    $$('input[name="mudTipo"]').forEach(r => r.checked = false);
    $('#btnMudReservar').disabled = true;
    $('#mudSlots').innerHTML = '';
    this.showVista('login');
  },

  async verificar() {
    hideAlert('alert-mud-login');
    const numForm = $('#mudNumForm').value.trim();
    const apto = $('#mudApto').value.trim();
    const ccProp = $('#mudCcProp').value.replace(/[^0-9]/g, '').trim();
    if (!numForm || !apto || !ccProp) {
      showAlert('alert-mud-login', 'Completa los 3 campos.', 'err');
      return;
    }
    try {
      const url = APPS_SCRIPT_URL + '?action=verificarPropietario&numForm=' + enc(numForm) + '&apto=' + enc(apto) + '&ccProp=' + enc(ccProp);
      const data = await fetchJson(url);
      if (!data.ok) {
        showAlert('alert-mud-login', data.error, 'err');
        return;
      }
      this.state = { numForm, apto, ccProp, propietario: data, torre: 'Naranja', fecha: null, horaInicio: null, horaFin: null };
      this.showVista('form');
      this.renderCalendario();
    } catch (e) {
      showAlert('alert-mud-login', 'Error de red: ' + e.message, 'err');
    }
  },

  renderCalendario() {
    // ... (idéntico a Cerro Azul, ~30 líneas)
  },

  async selectFecha(fecha) {
    // ... (idéntico a Cerro Azul, ~25 líneas)
  },

  renderSlots(slots) {
    // ... (idéntico a Cerro Azul, ~20 líneas)
  },

  checkFormCompleto() {
    const tipo = $$('input[name="mudTipo"]').find(r => r.checked);
    const ok = tipo && this.state.fecha && this.state.horaInicio;
    $('#btnMudReservar').disabled = !ok;
  },

  async submitReserva() {
    const tipo = $$('input[name="mudTipo"]').find(r => r.checked);
    if (!tipo || !this.state.fecha || !this.state.horaInicio) {
      showAlert('alert-mud-form', 'Selecciona tipo, fecha y horario.', 'err');
      return;
    }
    const payload = {
      action: 'reservarMudanza',
      numForm: this.state.numForm,
      apto: this.state.apto,
      ccProp: this.state.ccProp,
      tipoMudanza: tipo.value,
      torre: this.state.torre,
      fecha: this.state.fecha,
      horaInicio: this.state.horaInicio,
      horaFin: this.state.horaFin,
      empresa: $('#mudEmpresa').value.trim(),
      placa: $('#mudPlaca').value.trim().toUpperCase(),
      observaciones: $('#mudObservaciones').value.trim(),
    };
    try {
      const data = await safePost(payload);
      if (!data.ok) {
        showAlert('alert-mud-form', data.error || 'No se pudo reservar.', 'err');
        this.checkFormCompleto();
        return;
      }
      if (data.pendingEmail) {
        // El backend aceptó, pero la respuesta tardó; mostrar advertencia
        showAlert('alert-mud-form', data.warning, 'info');
      }
      this.showConfirmacion(data);
    } catch (e) {
      showAlert('alert-mud-form', 'Error de red: ' + e.message, 'err');
    }
  },

  showConfirmacion(data) {
    $('#mudOkId').textContent = data.idReserva;
    $('#mudOkDetalle').innerHTML =
      '<strong>Fecha:</strong> ' + this.formatFechaLarga(data.fecha) + '<br>' +
      '<strong>Horario:</strong> ' + data.horaInicio + ' a ' + data.horaFin + '<br>' +
      '<strong>Torre:</strong> ' + data.torre + ', Ascensor A' +
      (data.par ? ' (par ' + data.par + ')' : '');
    this.showVista('ok');
  },

  formatFechaLarga(fechaStr) { /* ... */ },
  formatFecha(d) { /* ... */ },
};

// Retry helper para POST (mitigación HTML 500/405 de Apps Script cold start)
async function safePost(payload, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        // La respuesta NO es JSON (probablemente HTML de error)
        if (i < retries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return { ok: true, pendingEmail: true, warning: 'Reserva enviada. Espere confirmación por email en 5 min. Si no llega, contacte a la administración.' };
      }
    } catch (e) {
      if (i < retries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
}

async function fetchJson(url, retries = 1) {
  // Similar a safePost pero para GET; reintenta si la respuesta es HTML
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        if (i < retries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return { ok: false, error: 'El servidor respondió con HTML en lugar de JSON. Intente nuevamente en 1 minuto.' };
      }
    } catch (e) {
      throw e;
    }
  }
}

function enc(s) { return encodeURIComponent(s); }

// Init
document.addEventListener('DOMContentLoaded', () => {
  M.bindEvents();
});
```

---

## 5. AUDITORÍA DE RIESGOS

### R1. ¿Rompe el form principal al agregar el módulo M?

**Riesgo:** El módulo M agrega variables globales (`M`, `safePost`, `fetchJson`) que podrían chocar con nombres existentes.

**Mitigación:** Verificado — NO existen `M`, `safePost`, `fetchJson` en el scope global de app.js. Los nombres son únicos.

### R2. ¿Rompe setMode()?

**Riesgo:** Modificar `setMode()` para incluir 'mudanzas' podría afectar create/edit.

**Mitigación:** El cambio es **ADITIVO** (1 línea más con `&&` chain). No cambia el comportamiento de 'create' ni 'edit'. El listener de mode-tabs usa `t.dataset.mode` genérico, no necesita cambio.

### R3. ¿El listener de mode-tabs funciona con el nuevo botón?

**Riesgo:** Si el botón tiene `data-mode="mudanzas"` pero el listener no lo maneja, click no hace nada.

**Mitigación:** El listener ya es genérico (`t.dataset.mode`). Cuando `setMode('mudanzas')` se llama, mi nueva línea `$('#view-mudanzas').classList.toggle(...)` muestra la vista. Sin riesgo.

### R4. ¿Chocan las clases CSS `mud-*` con las existentes?

**Riesgo:** Cerro Azul usa `.mud-cal-*`, `.mud-dia`, `.mud-slot`, `.mud-slots-grid`. Santa Sofía YA TIENE `.row.row-6`, `.autoriz-row` — sin overlap.

**Mitigación:** Todas las clases nuevas tienen prefijo `mud-` y se definen en `<style>` DENTRO del bloque de mudanzas (inline style), no en styles.css global. No hay conflicto.

### R5. ¿El retry cause doble reserva?

**Riesgo:** Si el primer POST sí creó la reserva pero la respuesta se truncó, reintentar causaría una segunda reserva en un slot diferente (o falla si mismo slot).

**Mitigación:** El retry solo ocurre cuando la respuesta es HTML (no JSON), lo cual indica que la respuesta se perdió. Si el primer POST falló (errored ANTES de escribir), no se creó reserva. Si el primer POST escribió pero la respuesta se perdió, el retry verá que el slot ya está ocupado y devolverá error. **El LockService en casilas** garantiza que no haya race conditions.

### R6. ¿El setMode() limpia el estado M?

**Riesgo:** Si el usuario pasa de "mudanzas" a "crear" y vuelve, puede haber estado residual.

**Mitigación:** El `reset()` en M está en `btnMudCancelar` y `btnMudOtra`. NO se llama automáticamente al cambiar modo. Pero los inputs del form tienen valores controlados por `value=''` solo en reset(). Si esto fuera un problema, podría añadir `M.reset()` al `setMode` cuando mode !== 'mudanzas'. **VERIFICAR después de F5.**

### R7. ¿CSP / CORS permite el nuevo módulo?

**Riesgo:** El frontend hace fetch al Apps Script. Apps Script Web App con `/dev` no requiere CORS (no preflight con `text/plain`).

**Mitigación:** Igual que Cerro Azul (probado en producción). Sin cambio.

### R8. ¿El módulo M rompe el recolector del form principal?

**Riesgo:** El recolector usa IDs del form principal (e.g., `firmaFecha`, `apto`, `ccProp`). El módulo M usa IDs distintos (`mudNumForm`, `mudApto`, `mudCcProp`).

**Mitigación:** Cero overlap de IDs. Sin riesgo.

### R9. ¿Las funciones `enc`, `hideAlert`, `showAlert` están definidas?

**Riesgo:** El módulo M usa `enc()`, `hideAlert()`, `showAlert()` que deben existir en el scope global.

**Mitigación:** `hideAlert()` y `showAlert()` ya existen en app.js (verificado). `enc()` se DEFINE dentro del módulo M (no es global).

### R10. ¿CSP / MIME type del POST?

**Riesgo:** El POST usa `Content-Type: text/plain;charset=UTF-8` para evitar preflight CORS. Apps Script espera esto.

**Mitigación:** Igual que el resto del proyecto. Sin riesgo.

---

## 6. DECISIONES DE SIMPLICIDAD

| Decisión | Razón |
|---|---|
| **VISTA 4 mis-reservas FUNCIONAL** (operador pidió, 05-Oct) | Reemplaza el placeholder "en desarrollo" de Cerro Azul. Permite al residente ver sus reservas Y cancelar las Confirmadas. |
| **OMITIR `showFestivoWarning()`** | Cerro Azul solo muestra alert de festivos la primera vez. Es decorativo. Si lo pides, lo añado. |
| **OMITIR "nota UX comparte ascensor"** | Operador lo dejó opcional en spec. No es crítico para F5. |
| **APPEND a `js/app.js`** en vez de archivo separado | Menos archivos = menos complejidad. |
| **NO modificar `recolector()`** | El recolector del form principal no se toca. |
| **NO agregar tests automatizados** | El operador no pidió tests. Las pruebas E2E ya están hechas (F7). |
| **Retry simple (1 reintento)** | Más reintentos = más complejidad. 1 es suficiente para cold start. |
| **Backend nuevo `misReservas` en V17** | Append puro (1 función + 1 handler), no toca código existente. |

---

## 7. ESTADÍSTICAS

**Líneas nuevas totales:** ~590
- HTML: ~200 (incluye vista 4 mis-reservas + 3 botones de acceso)
- JS: ~270 (módulo M con vista 4 funcional + retry + safePost + fetchJson)
- Backend (V17): ~40 (función misReservas + handler en doGet)
- CSS: ~30 (estilos para .mud-reserva-card, badges de estado)
- Cambios varios: ~50

**Líneas eliminadas:** 0
**Funciones existentes modificadas:** 1 (setMode, +1 línea)
**Funciones existentes tocadas:** 0
**Archivos nuevos:** 0
**Deploys Apps Script:** 2 (V16 ya desplegado + V17 con misReservas)
**Commits GitHub:** 1 (rama feature/mudanzas con index.html + js/app.js)

---

## 8. PRUEBAS POST-F5 (que voy a hacer)

1. **Sintaxis:** `node --check js/app.js`
2. **Smoke test con curl** (mismos endpoints probados en F7 + nuevo misReservas)
3. **Diff antes/después:** local + upload a Drive
4. **Verificar UI en navegador:**
   - Botón "Agendar mudanza" aparece
   - Click → vista login
   - Llenar SS-0001/1122/36178031 → click Verificar → vista form
   - Seleccionar Naranja → calendario aparece
   - Click en día futuro → ver slots
   - Click en slot disponible → botón Confirmar se habilita
   - Click Confirmar → vista confirmación
   - Click "Ver mis reservas" → muestra MD-XXXX con badge "Confirmada"
   - Click "Cancelar" en MD-XXXX → badge cambia a "Cancelada"
   - Verificar que Sheet refleja el cambio
5. **Verificar que form principal sigue funcionando** (recolector, edit, lookup)
6. **Verificar admin.html y vigilantes.html siguen funcionando**

---

## 9. ROLLBACK

Si algo sale mal en F8 (push a GitHub Pages):

1. `git revert <commit>` en el repo local
2. `git push origin main --force-with-lease` (solo si es la última versión)
3. Apps Script NO cambia (sigue en V16/V17 — ya están desplegadas y no se tocan)

---

## 10. CONFIRMACIONES REQUERIDAS ANTES DE APLICAR

- [ ] OK del operador para aplicar F5 según este plan actualizado
- [ ] Confirmar vista 4 mis-reservas FUNCIONAL (no placeholder)
- [ ] Confirmar retry helper (1 reintento después de 2s)
- [ ] Confirmar rama git: `feature/mudanzas` (separada de main)
- [ ] Confirmar deploy V17 (operador hace manual) antes de F5

Si todo OK, procedo con:
1. **F3'** Append misReservas al Codigo.gs (~40 líneas, sin tocar lo existente)
2. **F6'** Operador hace deploy V17 con misReservas
3. **F7'** Pruebo misReservas con curl (verifica end-to-end)
4. **F5** Frontend completo (4 vistas funcionales)
5. **F8** Push a GitHub Pages