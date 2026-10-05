# SPEC — Admin v2.0 (Refactor con Tab Mudanzas)
## Santa Sofía Club Residencial V.I.S — Módulo administrativo

**Versión:** 1.0.0 (draft para revisión)
**Fecha:** 05-Oct-2026 COL
**Autor:** Hermes Agent
**Estado:** PENDIENTE OK del operador antes de implementar
**Basado en:** patrón Cerro Azul admin.html (tabs Residentes/Mudanzas/Salón)

---

## 0. RESUMEN EJECUTIVO

Refactor del panel administrativo de Santa Sofía para añadir **2 tabs** (👥 Residentes + 📦 Mudanzas), patrón Cerro Azul. NO añade Salón Social (no aplica para Santa Sofía).

**Cambios:**
1. **`apps-script/Codigo.gs`** (V18) — append 1 función nueva `adminListarReservasMudanzas` + 1 handler en doGet.
2. **`admin.html`** — refactor: secciones actuales envueltas en `<div id="tab-residentes-admin">`, agregar `<div id="tab-mudanzas-admin">` con filtros + tabla.
3. **`js/admin.js`** — agregar navResidentes(), navMudanzas(), cargarMudanzasList(), renderMudanzasTable(), bindEvents.

**NO se tocan:**
- `index.html`, `js/app.js` (formulario público)
- `vigilantes.html`, `js/vigilantes.js`
- Endpoints existentes (adminLookup, vigilantesLookup, misReservas, etc.)
- Pestañas Registros/Entregas/Maestros del Sheet

---

## 1. REGLAS DE NEGOCIO (CONFIRMADAS CON EL OPERADOR 05-Oct-2026)

| Regla | Valor |
|---|---|
| Tabs | 2: 👥 Residentes + 📦 Mudanzas (SIN Salón Social) |
| Auth | ADMIN_TOKEN (mismo que adminLookup) |
| Filtros mudanzas | estado (Confirmada/Cancelada/Todas), torre, proxDias |
| Default filtro estado | Confirmada (más relevante para admin) |
| Default filtro proxDias | 8 días (relevante para planning) |
| Orden tabla | Fecha descendente, horaInicio descendente |
| Acciones admin | Solo consulta (NO cancela desde admin — eso lo hace el residente) |
| Email confirmación | NO envía emails (admin solo ve) |

---

## 2. ARQUITECTURA

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages (Fabig76/santa-sofia-residentes)             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ admin.html (refactor)                                  │ │
│  │   ├── [👥 Residentes] (tab actual → tab-residentes)    │ │
│  │   │   · Buscar apto                                    │ │
│  │   │   · Resumen del apto                              │ │
│  │   │   · Tags vehiculares                              │ │
│  │   │   · Llaveros peatonales                           │ │
│  │   │   · Historial de eventos                          │ │
│  │   └── [📦 Mudanzas] (NUEVO → tab-mudanzas)            │ │
│  │       · Filtros: estado + torre + proxDias             │ │
│  │       · Tabla con todas las reservas                   │ │
│  │ js/admin.js (refactor)                                │ │
│  │   · navResidentes() / navMudanzas()                    │ │
│  │   · cargarMudanzasList() / renderMudanzasTable()      │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │  GET (token=ADMIN_TOKEN)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Apps Script Web App V18 (santasofia.clubresidencial)        │
│  doGet → ?action=adminListarReservasMudanzas                │
│           → adminListarReservasMudanzas(token, estado,       │
│                                          torre, proxDias)  │
└────────────────────────┬────────────────────────────────────┘
                         │  Sheets API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets                                              │
│  · Pestaña Mudanzas (V17, 19 cols)                          │
│    Admin ve TODAS las reservas; residente solo las suyas    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. ENDPOINT NUEVO `?action=adminListarReservasMudanzas`

```
Input:    ?token=ADMIN_TOKEN&estado=Confirmada&torre=Naranja&proxDias=8
Validaciones:
  1. checkAdminToken(token) — server-side (igual que adminLookup)
  2. estado ∈ {Confirmada, Cancelada, Todas} (opcional, default Todas)
  3. torre ∈ {Naranja, Amarilla, Verde, Azul} (opcional)
  4. proxDias ∈ número entero ≥ 1 (opcional; calcula rango hoy → hoy+N)
  5. Verifica pestaña Mudanzas existe (idempotente — la crea si no)
Si OK:
  · Lee pestaña Mudanzas completa
  · Filtra por estado + torre + rango fechas (proxDias)
  · Ordena por fecha descendente
  · Retorna {ok, reservas:[...], total, filtros_aplicados}

Output OK:  {
  ok: true,
  total: 5,
  filtros: { estado: 'Confirmada', torre: 'Naranja', proxDias: 8, fechaDesde: '2026-10-05', fechaHasta: '2026-10-13' },
  reservas: [
    {
      id: 'MD-0003',
      numForm: 'SS-0001',
      apto: '1122',
      torre: 'Naranja',
      ascensor: 'A',
      tipoMudanza: 'Salida',
      fecha: '2026-10-07',
      horaInicio: '08:00',
      horaFin: '10:00',
      nombreSolicitante: 'Yazmin Rocha Calderón',
      ccSolicitante: '36178031',
      celular: '3132011314',
      correo: 'yazroca4@yahoo.es',
      empresa: 'Mudanzas Test E2E',
      placa: 'TST999',
      observaciones: '...',
      estado: 'Confirmada',
      fechaReservaRaw: '2026-10-05T01:30:00'
    },
    ...
  ]
}
Output ERR: {ok:false, error:"Token invalido."} (sin auth)

Notas:
- Admin ve TODAS las reservas (no solo del numForm/apto como misReservas).
- Sin paginación (tabla chica, máximo 100 reservas/mes esperado).
- No envía emails.
- Reusa getMudanzasSheet(), normalizarHora(), formatDateOnly() de V17.
```

### Diferencia con misReservas (V17)

| Aspecto | misReservas | adminListarReservasMudanzen |
|---|---|---|
| Auth | numForm/apto/ccProp (3 args) | ADMIN_TOKEN (1 arg) |
| Filtro | Solo numForm/apto | estado, torre, proxDias |
| Visibilidad | Solo reservas del numForm/apto | TODAS las reservas |
| Retorna | propietario + reservas | filtros aplicados + reservas |

---

## 4. DISEÑO HTML — REFACTOR DE admin.html

### 4.1 Estructura nueva

```html
<main>
  <div class="card">
    <div class="admin-banner">🔒 Acceso restringido · Solo personal administrativo</div>
    <div id="alert-admin" class="alert hidden"></div>

    <!-- ===== NAVEGACIÓN DE TABS ===== -->
    <nav class="admin-tabs" style="display:flex; gap:10px; margin-bottom:16px; border-bottom:2px solid var(--gris-borde);">
      <button type="button" class="btn btn-primary" id="btnNavResidentes" style="border-radius:8px 8px 0 0;">👥 Residentes</button>
      <button type="button" class="btn btn-secondary" id="btnNavMudanzas" style="border-radius:8px 8px 0 0;">📦 Mudanzas</button>
    </nav>

    <!-- ===== TAB 1: RESIDENTES (secciones actuales envueltas) ===== -->
    <div id="tab-residentes-admin">
      <!-- ===== BUSCAR APTO ===== -->
      <div class="seccion-admin">
        <h3>🔍 Buscar apartamento</h3>
        ...
      </div>

      <!-- ===== RESUMEN DEL APTO ===== -->
      <div id="seccion-resumen" class="seccion-admin" style="display:none;">
        ...
      </div>

      <!-- ===== TAGS VEHICULARES ===== -->
      <div id="seccion-tags" class="seccion-admin" style="display:none;">
        ...
      </div>

      <!-- ===== LLAVEROS PEATONALES ===== -->
      <div id="seccion-llaves" class="seccion-admin" style="display:none;">
        ...
      </div>

      <!-- ===== HISTORIAL ===== -->
      <div id="seccion-historial" class="seccion-admin" style="display:none;">
        ...
      </div>
    </div>

    <!-- ===== TAB 2: MUDANZAS (NUEVO) ===== -->
    <div id="tab-mudanzas-admin" class="hidden">
      <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
        <label><strong>Estado:</strong></label>
        <select id="mudanzasEstadoFilter">
          <option value="Confirmada" selected>Confirmada</option>
          <option value="Cancelada">Cancelada</option>
          <option value="Todas">Todas</option>
        </select>
        <label><strong>Torre:</strong></label>
        <select id="mudanzasTorreFilter">
          <option value="" selected>Todas</option>
          <option value="Naranja">Naranja</option>
          <option value="Amarilla">Amarilla</option>
          <option value="Verde">Verde</option>
          <option value="Azul">Azul</option>
        </select>
        <label style="display:flex; align-items:center; gap:4px;">
          <input type="checkbox" id="mudanzasProximosDiasCheck" checked>
          <span>Solo próximos <input type="number" id="mudanzasProximosDiasInput" value="8" min="1" max="60" style="width:50px; padding:2px 6px;"> días</span>
        </label>
        <button type="button" class="btn btn-primary" id="btnCargarMudanzas">🔄 Actualizar lista</button>
      </div>
      <div id="mudanzasList"></div>
    </div>

  </div>
</main>
```

### 4.2 Lo que NO se mueve

- Banner de acceso restringido (queda arriba)
- alert-admin (queda arriba)
- footer (no se toca)

---

## 5. DISEÑO JS — REFACTOR DE js/admin.js

### 5.1 Funciones nuevas

```javascript
const A = {
  // ... (existing buscarApto, renderResumen, etc.)

  // ===== NAVEGACIÓN DE TABS =====
  navResidentes() {
    $('#tab-residentes-admin').classList.remove('hidden');
    $('#tab-mudanzas-admin').classList.add('hidden');
    $('#btnNavResidentes').classList.remove('btn-secondary');
    $('#btnNavResidentes').classList.add('btn-primary');
    $('#btnNavMudanzas').classList.remove('btn-primary');
    $('#btnNavMudanzas').classList.add('btn-secondary');
  },

  async navMudanzas() {
    $('#tab-residentes-admin').classList.add('hidden');
    $('#tab-mudanzas-admin').classList.remove('hidden');
    $('#btnNavResidentes').classList.remove('btn-primary');
    $('#btnNavResidentes').classList.add('btn-secondary');
    $('#btnNavMudanzas').classList.remove('btn-secondary');
    $('#btnNavMudanzas').classList.add('btn-primary');
    await this.cargarMudanzasList();
  },

  // ===== CARGAR LISTA DE MUDANZAS =====
  async cargarMudanzasList() {
    const estado = $('#mudanzasEstadoFilter').value;
    const torre = $('#mudanzasTorreFilter').value;
    const proxCheck = $('#mudanzasProximosDiasCheck').checked;
    const proxDias = proxCheck ? $('#mudanzasProximosDiasInput').value : '';
    const container = $('#mudanzasList');
    container.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:20px;">Cargando...</p>';

    try {
      const r = await this.apiGet({ action: 'adminListarReservasMudanzas', token: ADMIN_TOKEN, estado, torre, proxDias });
      if (!r.ok) {
        container.innerHTML = '<p style="color:var(--err); padding:20px;">Error: ' + (r.error || 'desconocido') + '</p>';
        return;
      }
      this.renderMudanzasTable(r.reservas || []);
    } catch (e) {
      container.innerHTML = '<p style="color:var(--err);">Error de red: ' + e.message + '</p>';
    }
  },

  renderMudanzasTable(reservas) {
    const container = $('#mudanzasList');
    if (reservas.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:var(--gris-med); padding:30px;">No hay reservas con esos filtros.</p>';
      return;
    }
    let html = '<p style="margin-bottom:12px; color:var(--gris-med);">Total: <strong>' + reservas.length + '</strong> reserva(s)</p>';
    html += '<div style="overflow-x:auto;"><table class="results-table" style="width:100%; border-collapse:collapse;">';
    html += '<thead><tr style="background:var(--azul-claro);">';
    html += '<th style="padding:8px; text-align:left;">ID</th>';
    html += '<th style="padding:8px; text-align:left;">Fecha</th>';
    html += '<th style="padding:8px; text-align:left;">Horario</th>';
    html += '<th style="padding:8px; text-align:left;">Torre</th>';
    html += '<th style="padding:8px; text-align:left;">Tipo</th>';
    html += '<th style="padding:8px; text-align:left;">Apto</th>';
    html += '<th style="padding:8px; text-align:left;">Solicitante</th>';
    html += '<th style="padding:8px; text-align:left;">Celular</th>';
    html += '<th style="padding:8px; text-align:left;">Placa</th>';
    html += '<th style="padding:8px; text-align:left;">Estado</th>';
    html += '</tr></thead><tbody>';

    reservas.forEach(res => {
      const estadoColor = res.estado === 'Confirmada' ? 'var(--ok)' : (res.estado === 'Cancelada' ? 'var(--err)' : 'var(--gris-med)');
      const fecha = res.fecha || '?';
      const hora = (res.horaInicio && res.horaFin) ? res.horaInicio + ' - ' + res.horaFin : '?';
      html += '<tr style="border-bottom:1px solid var(--gris-borde);">';
      html += '<td style="padding:8px;"><code style="background:var(--azul-claro); padding:2px 6px; border-radius:4px;">' + res.id + '</code></td>';
      html += '<td style="padding:8px;">' + fecha + '</td>';
      html += '<td style="padding:8px;">' + hora + '</td>';
      html += '<td style="padding:8px;">' + res.torre + '</td>';
      html += '<td style="padding:8px;">' + res.tipoMudanza + '</td>';
      html += '<td style="padding:8px;">' + res.apto + '</td>';
      html += '<td style="padding:8px;">' + res.nombreSolicitante + '<br><small style="color:var(--gris-med);">CC ' + res.ccSolicitante + '</small></td>';
      html += '<td style="padding:8px;">' + res.celular + '</td>';
      html += '<td style="padding:8px;">' + (res.placa || '-') + '</td>';
      html += '<td style="padding:8px; color:' + estadoColor + '; font-weight:600;">' + res.estado + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  // ===== API HELPER (para reusar retry) =====
  async apiGet(params) {
    const url = APPS_SCRIPT_URL + '?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k] || '')).join('&');
    return fetchJson(url);
  },
};

// Init (en DOMContentLoaded)
$('#btnNavResidentes').addEventListener('click', () => A.navResidentes());
$('#btnNavMudanzas').addEventListener('click', () => A.navMudanzas());
$('#btnCargarMudanzas').addEventListener('click', () => A.cargarMudanzasList());
$('#mudanzasEstadoFilter').addEventListener('change', () => A.cargarMudanzasList());
$('#mudanzasTorreFilter').addEventListener('change', () => A.cargarMudanzasList());
$('#mudanzasProximosDiasCheck').addEventListener('change', () => A.cargarMudanzasList());
```

---

## 6. AUDITORÍA DE RIESGOS

### R1. ¿Rompe admin.html actual?

**Riesgo:** Envolver secciones existentes en un tab puede romper el CSS o los IDs.

**Mitigación:** Verificado que `id="seccion-resumen"`, `id="seccion-tags"`, `id="seccion-llaves"`, `id="seccion-historial"` mantienen sus IDs. Solo se envuelven en `<div id="tab-residentes-admin">`. El JS no cambia su target.

### R2. ¿Rompe js/admin.js actual?

**Riesgo:** La estructura `A` object con métodos puede chocar si se reordena.

**Mitigación:** Solo AGREGO al guardar `navResidentes`, `navMudanzas`, `cargarMudanzasList`, `renderMudanzasTable`, `apiGet`. NO toco los métodos existentes (`buscarApto`, `renderResumen`, etc.).

### R3. ¿El admin actual sigue funcionando post-refactor?

**Riesgo:** Las secciones (buscar/resumen/tags/llaves/historial) deben verse igual.

**Mitigación:** El tab "Residentes" contiene las mismas secciones con los mismos IDs. CSS idéntico. Botón "Residentes" seleccionado por default (estado inicial).

### R4. ¿El ADMIN_TOKEN está bien manejado?

**Riesgo:** Token concatenado que se reconstruye en runtime.

**Mitigación:** El mismo patrón que adminLookup (ya probado). El token se reconstruye en js/admin.js igual que en Cerro Azul.

### R5. ¿La query de adminListarReservasMudanzen es eficiente?

**Riesgo:** Lee toda la pestaña Mudanzas cada vez.

**Mitigación:** La pestaña tiene ≤ 100 filas esperadas. `getValues()` es rápido. NO se implementa paginación (innecesaria para este volumen).

### R6. ¿proxDias con valor 0 o negativo?

**Riesgo:** Si el operador escribe "0" o "-5" en el input.

**Mitigación:** Validar `parseInt(proxDias) > 0`. Si no, ignorar filtro (devolver todo).

### R7. ¿CSP / CORS?

**Riesgo:** fetch a Apps Script.

**Mitigación:** Mismo patrón que Cerro Azul (probado en producción).

### R8. ¿El botón "Residentes" debe estar seleccionado por default?

**Riesgo:** Si ambos tabs están visibles al cargar, muestra las 2 vistas.

**Mitigación:** JS en DOMContentLoaded llama `A.navResidentes()` (esconde tab-mudanzas). El tab Residentes queda visible por default.

### R9. ¿El usuario puede acceder a tab Mudanzas sin auth?

**Riesgo:** El ADMIN_TOKEN está en el JS, cualquiera puede ver el token. Pero la pestaña Mudanzas SOLO se muestra a usuarios con el token (server-side).

**Mitigación:** El endpoint `adminListarReservasMudanzen` requiere `checkAdminToken()` server-side (igual que adminLookup). Sin token válido, retorna 401.

### R10. ¿Los filtros aplican correctamente OPCIÓN B?

**Riesgo:** Si admin filtra torre=Naranja, debe ver también reservas de Amarilla (mismo par).

**Mitigación:** Documentado en UI: el filtro "Torre" es de la **torre individual**, no del par. Las reservas de Amarilla aparecen cuando filtra torre=Amarilla. Si quiere ver "par", debe exportar manualmente. Esto es deliberado (admin puede querer ver específicamente Naranja vs Amarilla).

---

## 7. DECISIONES DE SIMPLICIDAD

| Decisión | Razón |
|---|---|
| **Solo 2 tabs (Residentes + Mudanzas)** | Santa Sofía no tiene Salón Social |
| **NO incluir Salón Social** | No aplica a Santa Sofía |
| **NO acciones de admin en mudanzas** | Admin solo ve; el residente cancela su propia reserva |
| **NO paginación** | Máximo 100 reservas/mes esperado |
| **NO exportar CSV/PDF** | Cerro Azul tampoco lo tiene |
| **Reusa apiGet() / fetchJson()** | Ya implementado en módulo mudanzas, mismo patrón |
| **Append a Codigo.gs** | No tocar código existente |
| **Inline CSS en style del bloque** | No modificar assets/styles.css |

---

## 8. PRUEBAS POST-F9 (que voy a hacer)

### F9.4 — Pruebas curl del backend

1. `?action=adminListarReservasMudanzas&token=X&estado=Todas` → todas las reservas
2. `?action=adminListarReservasMudanzas&token=X&estado=Confirmada` → solo activas
3. `?action=adminListarReservasMudanzas&token=X&torre=Naranja` → solo Naranja (sin Amarilla — filtro es individual)
4. `?action=adminListarReservasMudanzas&token=X&proxDias=8` → solo próximos 8 días
5. Sin token → error "Token invalido"
6. Token incorrecto → error "Token invalido"
7. proxiDias=0 → ignora filtro (devuelve todas)
8. proxiDias=100 → rango amplio (max 60 según spec, fuera de rango = sin restricción)

### F9.6 — Pruebas E2E con browser

1. Cargar admin.html → tab Residentes visible, tab Mudanzas oculto
2. Click "👥 Residentes" → sigue mostrando las secciones existentes (buscar/resumen/tags/llaves)
3. Click "📦 Mudanzas" → tab Mudanzas visible, lista con MD-0001/2/3
4. Cambiar estado=Confirmada → solo MD-XXXX activas
5. Cambiar torre=Naranja → solo Naranja
6. Desmarcar proxDias → lista completa
7. Marcar proxDias=1 → solo las del día siguiente
8. Verificar que buscar apto (Residentes) sigue funcionando
9. Verificar que adminLookup sigue funcionando

---

## 9. ROLLBACK

Si en F9.5 o F9.6 algo sale mal:

1. **Frontend:** `git revert <commit>` + `git push origin main --force-with-lease`
2. **Backend:** Abrir editor Apps Script → revertir manualmente a V17 → Deploy
3. **Sin daño:** El admin actual sigue funcional (mismas secciones)

**Tiempo estimado de rollback total:** < 5 minutos.

---

## 10. CHECKLIST PRE-IMPLEMENTACIÓN

- [ ] F9.0 Backup verificado bit-a-bit (Codigo.gs + admin.html + js/admin.js)
- [x] F9.1 SPEC aprobado (este documento)
- [ ] Disponibilidad para hacer F9.2 → F9.8 en bloques cortos con OK entre cada uno
- [ ] El operador confirma rama git `feature/admin-mudanzas`

---

## 11. ARCHIVOS RELACIONADOS

- `apps-script/Codigo.gs` — modificar (F9.2, append al final ~70 líneas)
- `admin.html` — modificar (F9.5, refactor con tabs ~+50 líneas)
- `js/admin.js` — modificar (F9.5, agregar funciones ~+150 líneas)
- `docs/spec-admin-mudanzas.md` — este documento (referencia, se commitea)
- `docs/auditoria-f9-admin.md` — auditoría (F9.5 antes de aplicar)
- `docs/sesion-admin-v2.md` — bitácora post (F9.8)
- Hoja `Mudanzas` Sheet — NO se toca (ya existe, ya se lee)

---

FIN DEL SPEC v1.0.0 draft

**PENDIENTE antes de implementar F9.2:**
1. Tu OK explícito.
2. Rama git `feature/admin-mudanzas` confirmada.