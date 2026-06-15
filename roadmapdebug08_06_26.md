# MiCartera - Roadmap de Fixes y Debug

Fecha: 2026-06-08

Este documento reemplaza el analisis informal de debugging por un plan operativo, priorizado y alineado con el estado real del repo al 8 de junio de 2026.

## Estado actual resumido

- Backend `FastAPI` compila correctamente.
- `functions/main.py` compila correctamente.
- Frontend `Vite/React` build de produccion OK.
- `npm run lint` no funciona por falta de configuracion ESLint.
- Hay features ya implementadas que el roadmap viejo no refleja:
  - stress test
  - refresh de fundamentales
  - cifrado at-rest
  - sync incremental de avg cost

## Hallazgos principales

### Prioridad P0

- `POST /api/prices/refresh` depende de `ADMIN_UID`; si esa variable no esta configurada, cualquier usuario autenticado podria disparar refresh global de cotizaciones.
- El frontend llama `refresh` de precios dentro de `syncPPI`, lo que mezcla sync de usuario con una operacion global compartida.

### Prioridad P1

- `usePortfolio.js` inicializa `stressTest` con `MOCK_STRESS_TEST` incluso para usuarios reales, y si el backend falla puede dejar datos ficticios visibles.
- El repo declara `lint` pero no tiene archivo de configuracion ESLint.
- El roadmap actual del proyecto esta desactualizado respecto del codigo real.

### Prioridad P2

- El bundle de frontend es grande para una PWA movil.
- Persisten scripts de debug/manuales en `backend/` que ya no estan claramente diferenciados entre utilitarios validos y deuda temporal.
- Falta una capa minima de tests automatizados para auth, sync, stress y hooks criticos del frontend.

### Prioridad P3

- Falta estandarizar observabilidad: logs mas consistentes, errores sanitizados y checklist de incidentes.
- Falta documentar mejor el flujo de recovery cuando PPI, Firestore o cotizaciones fallan.

## Roadmap por fases

## Fase 0 - Hardening inmediato

Objetivo: cerrar riesgos de operacion compartida y estados engañosos.

- [ ] Hacer obligatorio `ADMIN_UID` para `POST /api/prices/refresh`
- [ ] Si `ADMIN_UID` no esta configurado, fallar cerrado con `503` o `500`, no abrir acceso
- [ ] Separar `syncPPI` de `refresh` global de cotizaciones en frontend
- [ ] Mostrar estado vacio o error en stress test real cuando backend no responda
- [ ] Revisar mensajes de error expuestos al cliente y sanitizarlos donde aplique

Resultado esperado:

- Ningun usuario comun puede gatillar un refresh global compartido
- La UI no muestra mocks como si fueran datos reales

## Fase 1 - Calidad minima de desarrollo

Objetivo: recuperar feedback rapido y confiable para cambios diarios.

- [ ] Agregar configuracion ESLint minima para React/Vite
- [ ] Hacer que `npm run lint` funcione sin pasos manuales
- [ ] Definir reglas minimas: hooks, variables no usadas, globals browser
- [ ] Documentar comando correcto en Windows: `npm.cmd run lint` cuando aplique
- [ ] Actualizar `ROADMAP.md` o marcarlo como funcional/historico

Resultado esperado:

- El repo vuelve a tener una barrera basica de calidad en frontend
- La documentacion deja de contradecir al codigo

## Fase 2 - Debug reproducible

Objetivo: que los problemas de sync y calculo puedan reproducirse sin improvisacion.

- [ ] Inventariar scripts de debug en `backend/`
- [ ] Clasificar cada script: mantener, mover a `debug/`, o eliminar
- [ ] Crear un checklist de diagnostico para:
  - auth Firebase
  - login PPI
  - sync portfolio
  - avg cost
  - cotizaciones
  - stress
  - fundamentals
- [ ] Unificar logs relevantes en backend y functions

Resultado esperado:

- Menos debugging ad hoc
- Menos riesgo de dejar utilitarios temporales como deuda permanente

## Fase 3 - Testing util

Objetivo: cubrir los caminos que mas se rompen.

- [ ] Backend: tests de `prices`, `portfolio`, `stress`
- [ ] Backend: tests de middleware auth para rutas publicas y privadas
- [ ] Frontend: tests de `usePortfolio` y `AppContext`
- [ ] Frontend: tests de estados vacios/error para stress y sync
- [ ] Smoke test del flujo login -> sync -> render -> refresh

Resultado esperado:

- Los fixes de calculo y fallback dejan de depender solo de prueba manual

## Fase 4 - Performance y operacion

Objetivo: mejorar experiencia real en mobile y despliegue.

- [ ] Reducir tamaño del bundle con code splitting
- [ ] Revisar componentes pesados o no criticos para carga diferida
- [ ] Confirmar estrategia PWA y cache de assets
- [ ] Documentar runbook de incidentes operativos

Resultado esperado:

- Mejor tiempo de carga
- Mejor capacidad de respuesta ante fallos externos

## Orden sugerido de ejecucion

1. Cerrar `prices/refresh`
2. Sacar mocks en stress para usuarios reales
3. Configurar ESLint
4. Actualizar roadmap/documentacion
5. Ordenar scripts de debug
6. Agregar tests backend/frontend
7. Optimizar bundle y observabilidad

## Criterios de exito

- `npm run build` OK
- `npm run lint` OK
- sync de portfolio sin dependencia de mocks
- stress real muestra datos reales o estado explicito de error
- refresh de cotizaciones restringido correctamente
- roadmap y estado del repo alineados

## Notas de implementacion

- El build productivo del frontend pasa actualmente.
- El problema de lint es real y no de entorno: falta configuracion ESLint.
- El riesgo mas importante hoy no es de compilacion sino de control operativo y consistencia entre UI y backend.
