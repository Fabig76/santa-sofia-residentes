// ============================================================
// CLEAR RESIDENTE — botón de borrado en index.html (modo edición)
// spec-arrendatarios.md F3b — 05-Oct-2026
// Solo el propietario (ccProp) puede limpiar datos de residentes.
// Standalone — no depende de js/app.js ni js/arrendatario.js.
// ============================================================

let _clearNumForm = null;
let _clearApto = null;
let _clearCcProp = null;

function bindClearResidente(numForm, apto, ccProp) {
  if (!numForm || !apto || !ccProp) return;
  // Evitar duplicar
  if (document.getElementById('zona-borrado-clear')) return;

  _clearNumForm = numForm;
  _clearApto = apto;
  _clearCcProp = ccProp;

  // Buscar el formulario principal de edición para agregar la zona
  const formCard = document.getElementById('form-card');
  if (!formCard) return;

  const zona = document.createElement('div');
  zona.id = 'zona-borrado-clear';
  zona.className = 'zona-borrado';
  zona.style.marginTop = '24px';
  zona.innerHTML =
    '<h4>⚠️ Borrar datos de residentes</h4>' +
    '<p>Si un residente o arrendatario cambió (se fue del apartamento), use esta opción para limpiar sus datos. Solo el propietario puede hacerlo.</p>' +
    '<p><strong>Esto borrará:</strong> secciones 5, 5.1, 6, 7, 9 y 10 (residentes, menores, vehículos, motos, bicis, mascotas).</p>' +
    '<p><strong>NO se borra:</strong> sus datos como propietario, parqueaderos, matrículas, ni la firma.</p>' +
    '<button type="button" class="btn-danger" id="btnClearResidente">borrado de datos residente</button>';

  formCard.appendChild(zona);

  const btn = document.getElementById('btnClearResidente');
  if (btn) btn.addEventListener('click', confirmarClear);
}

function confirmarClear() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-content">' +
    '<h3>⚠️ Confirmar borrado</h3>' +
    '<p>Esto borrará los residentes y vehículos del apartamento. ¿Confirmas?</p>' +
    '<div class="modal-buttons">' +
    '<button type="button" class="btn-secondary" id="modalCancel">↩️ Cancelar</button>' +
    '<button type="button" class="btn-danger" id="modalConfirm">Sí, borrar</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  document.getElementById('modalCancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modalConfirm').addEventListener('click', () => {
    overlay.remove();
    ejecutarClear();
  });
}

async function ejecutarClear() {
  const url = (typeof APPS_SCRIPT_URL !== 'undefined' ? APPS_SCRIPT_URL : window.APPS_SCRIPT_URL) || '';
  if (!url) {
    return alert('No se puede obtener la URL del servidor. Recargue la página.');
  }
  const btn = document.getElementById('btnClearResidente');
  if (btn) { btn.disabled = true; btn.textContent = 'Borrando...'; }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        action: 'clearResidente',
        numForm: _clearNumForm,
        apto: _clearApto,
        cc: _clearCcProp
      }),
      redirect: 'follow'
    });
    const data = await r.json();
    if (!data.ok) {
      alert('Error: ' + (data.error || 'No se pudo borrar'));
      return;
    }
    alert('✅ ' + (data.message || 'Datos del residente eliminados.'));
    location.reload();
  } catch (e) {
    alert('Error de red: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'borrado de datos residente'; }
  }
}
