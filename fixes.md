# MiCartera - Fixes Detectados

Fecha: 2026-06-08

Este documento resume los fixes detectados durante la revision tecnica del repo, con foco en impacto real, evidencia en codigo y accion recomendada.

## 1. Refresh global de cotizaciones con control incompleto

### Resumen

El endpoint `POST /api/prices/refresh` actualiza un documento global compartido en Firestore: `/market/cotizaciones`.

La restriccion de acceso depende de que `ADMIN_UID` este cargado en entorno. Si esa variable no esta definida, el codigo no cierra el endpoint; simplemente no aplica la validacion de admin.

### Evidencia

- [prices.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/routers/prices.py:184)
- [config.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/core/config.py:31)
- [AppContext.jsx](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/src/store/AppContext.jsx:109)

### Riesgo

- Un usuario autenticado podria disparar una operacion global que afecta a todos los usuarios.
- Se mezcla una accion de portfolio individual con una accion compartida de mercado.
- Si hay abuso o automatizacion, se incrementa el consumo de APIs externas y se contamina el cache global.

### Causa tecnica

La condicion actual es:

```python
if settings.ADMIN_UID and request.state.uid != settings.ADMIN_UID:
    raise HTTPException(status_code=403, detail="No autorizado")
```

Esto significa que si `settings.ADMIN_UID` esta vacio, no se ejecuta el bloqueo.

### Fix recomendado

- Hacer fail-closed: si `ADMIN_UID` no existe, devolver error y no permitir refresh.
- Separar en frontend la sincronizacion de portfolio del refresh global de precios.
- Considerar eliminar este endpoint del flujo normal del usuario y dejarlo solo para admin o tareas automatizadas.

### Prioridad

P0

## 2. Stress test con mocks visibles para usuarios reales

### Resumen

El hook de portfolio inicializa `stressTest` con `MOCK_STRESS_TEST`. Si el backend no devuelve datos o falla, el estado puede quedarse con informacion ficticia aunque el usuario este autenticado.

### Evidencia

- [usePortfolio.js](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/src/hooks/usePortfolio.js:133)
- [usePortfolio.js](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/src/hooks/usePortfolio.js:186)
- [AppContext.jsx](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/src/store/AppContext.jsx:95)

### Riesgo

- La UI puede mostrar escenarios de riesgo inventados como si fueran reales.
- Se degrada la confianza del usuario en la app.
- Dificulta debugging porque no queda claro si la falla es de backend o de datos.

### Causa tecnica

El estado arranca con datos mock:

```javascript
const [stressTest, setStressTest] = useState(MOCK_STRESS_TEST)
```

Y en caso de error el fetch no limpia ni marca estado:

```javascript
catch {
  // Backend no disponible o cartera vacia -> mantener mock/estado anterior
}
```

### Fix recomendado

- Para usuarios autenticados, inicializar `stressTest` como array vacio o `null`.
- Agregar estado explicito: `loading`, `error`, `empty`.
- Mostrar mensaje claro en UI cuando no haya stress real disponible.
- Reservar mocks solo para modo demo.

### Prioridad

P1

## 3. Lint declarado pero roto

### Resumen

El frontend tiene script `lint`, pero el repositorio no contiene configuracion ESLint. El comando existe, pero no se puede usar como control de calidad.

### Evidencia

- [package.json](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/package.json:10)

Resultado real observado:

- `npm.cmd run lint` falla porque ESLint no encuentra archivo de configuracion.

### Riesgo

- No hay feedback automatico sobre errores simples de frontend.
- Aumenta la probabilidad de regressions triviales.
- El repo da una señal falsa de calidad porque aparenta tener lint operativo.

### Causa tecnica

Dependencias de ESLint instaladas, pero sin `.eslintrc.*` ni `eslint.config.*`.

### Fix recomendado

- Agregar configuracion minima ESLint para React + hooks.
- Dejar `lint` funcionando en Windows con `npm.cmd run lint` y en entornos comunes con `npm run lint`.
- Si no se quiere mantener ESLint todavia, remover el script hasta dejarlo bien configurado.

### Prioridad

P1

## 4. Roadmap funcional desalineado con el estado real del codigo

### Resumen

El roadmap principal del proyecto no refleja correctamente lo que ya esta implementado. Hay funcionalidades activas en codigo que siguen figurando como planeadas o incompletas.

### Evidencia

- [ROADMAP.md](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/ROADMAP.md)
- [stress.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/routers/stress.py:1)
- [fundamentals.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/routers/fundamentals.py:1)
- [portfolio.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/routers/portfolio.py:1)

### Riesgo

- Decisiones de producto y debugging tomadas sobre documentacion vieja.
- Se pierde tiempo investigando como si faltaran features ya implementadas.
- Baja la calidad del handoff entre sesiones.

### Causa tecnica

El roadmap fue util en una etapa anterior, pero no se actualizo al ritmo de los cambios reales del repo.

### Fix recomendado

- Actualizar `ROADMAP.md` o marcarlo claramente como historico.
- Separar roadmap funcional de roadmap tecnico/debug.
- Mantener un documento corto y actualizable por fase.

### Prioridad

P1

## 5. Scripts de debug y utilitarios mezclados con deuda temporal

### Resumen

El directorio `backend/` contiene varios scripts manuales para debug, sincronizacion o migracion. Algunos siguen siendo utiles, pero hoy no hay una separacion clara entre:

- utilitarios permanentes
- scripts temporales de investigacion
- deuda tecnica pendiente de eliminar

### Evidencia

Archivos detectados:

- [debug_nvda.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/debug_nvda.py)
- [debug_firestore_nvda.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/debug_firestore_nvda.py)
- [run_sync_direct.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/run_sync_direct.py)
- [force_full_sync.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/force_full_sync.py)
- [cargar_catalysts_v7.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/cargar_catalysts_v7.py)
- [encrypt_existing_firestore_data.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/encrypt_existing_firestore_data.py)

### Riesgo

- Confusion sobre que script sigue vigente.
- Mayor costo de mantenimiento.
- Riesgo de ejecutar utilitarios viejos con supuestos rotos.
- El debugging queda atado a conocimiento tacito y no a proceso.

### Causa tecnica

Durante la etapa de correccion de `avg_cost`, cifrado y sync incremental se agregaron scripts utiles, pero no hubo una limpieza posterior.

### Fix recomendado

- Inventariar cada script.
- Marcar cuales se mantienen.
- Mover scripts de soporte real a `debug/` o `scripts/`.
- Eliminar o archivar los que ya cumplieron su objetivo.
- Documentar para que sirve cada uno y en que contexto se usa.

### Prioridad

P2

## 6. Bundle de frontend grande para una PWA movil

### Resumen

El build productivo del frontend pasa correctamente, pero Vite avisa que el bundle principal es grande.

### Evidencia

Resultado observado en build:

- JS principal: aproximadamente `651.40 kB`

Archivo relacionado:

- [vite.config.js](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/vite.config.js)

### Riesgo

- Carga inicial mas pesada en mobile.
- Peor experiencia en redes lentas.
- Menor margen para seguir sumando features sin fragmentacion.

### Causa tecnica

Todo se empaqueta en un chunk principal relativamente grande, sin suficiente code splitting para vistas o widgets menos criticos.

### Fix recomendado

- Aplicar code splitting por pagina o seccion.
- Cargar diferido componentes pesados.
- Revisar dependencias y widget embebidos.
- Medir que partes del dashboard estan impactando mas en el bundle.

### Prioridad

P2

## 7. Falta de testing util en caminos criticos

### Resumen

La base actual tiene logica de negocio no trivial en sync, avg cost, fallback de precios, auth y stress, pero hoy no hay una capa minima de tests que proteja esos flujos.

### Evidencia

- No se detectaron suites activas de tests backend en el repo.
- No se detectaron tests de frontend para hooks o estado.

Areas sensibles:

- [portfolio.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/routers/portfolio.py)
- [prices.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/routers/prices.py)
- [ppi_client.py](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/backend/app/services/ppi_client.py)
- [usePortfolio.js](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/src/hooks/usePortfolio.js)
- [AppContext.jsx](C:/Users/Drumdie/ClaudeCodeProjects/MiCartera/frontend/src/store/AppContext.jsx)

### Riesgo

- Cada fix importante depende demasiado de prueba manual.
- Los fallbacks complejos pueden romperse silenciosamente.
- Suben los costos de mantenimiento y debugging.

### Causa tecnica

El proyecto priorizo llegar a funcionalidad antes que armar una base de pruebas automatizadas.

### Fix recomendado

- Backend: tests de auth, prices, stress y portfolio.
- Frontend: tests de hooks y estados vacios/error.
- Smoke tests para login, sync y render principal.

### Prioridad

P2

## Priorizacion resumida

### P0

- Refresh global de cotizaciones con control incompleto

### P1

- Stress test con mocks visibles para usuarios reales
- Lint declarado pero roto
- Roadmap desalineado con el estado real

### P2

- Scripts de debug mezclados con deuda temporal
- Bundle frontend grande
- Falta de testing util

## Estado de validacion al momento del analisis

- `python -m compileall backend/app` OK
- `python -m compileall functions` OK
- `npm.cmd run build` OK
- `npm.cmd run lint` FAIL por ausencia de configuracion ESLint
