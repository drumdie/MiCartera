// Coordinación del botón back de Android con el estado interno del dashboard.
// El handler global (AndroidBackHandler) maneja las rutas (navigate(-1)); cuando estamos
// en la pantalla principal "/", delega en el dashboard, que sabe si hay un modal abierto
// o un tab no-principal activo. Si el dashboard no consume el evento, el handler aplica
// el doble-tap para salir.
let _api = null

// El dashboard registra { handleBack, showToast }. handleBack() devuelve true si consumió
// el back (cerró modal / volvió al tab principal), false si ya estaba en el estado raíz.
export function registerDashboardBack(api) {
  _api = api
  return () => { if (_api === api) _api = null }
}

export function getDashboardBack() {
  return _api
}
