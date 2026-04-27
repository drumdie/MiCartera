Tengo un prompt con las instrucciones de la app que quiero crear.

Antes de crear cualquier archivo o ejecutar comandos, quiero que:
1. analices el prompt
2. detectes ambigüedades, riesgos o contradicciones
3. propongas una estructura de carpetas
4. propongas un plan de desarrollo por fases
5. recomiendes frontend vanilla vs React justificando la decisión
6. esperes mi aprobación

Reglas obligatorias:
- No ejecutes comandos todavía.
- No crees archivos todavía.
- No instales dependencias todavía.
- Antes de cualquier cambio futuro, menciona qué vas a crear/modificar y espera confirmación.
- El repositorio no debe incluir datos reales, credenciales, cartera real, precios reales hardcodeados ni datos de broker.
- El archivo cartera_app_v5.html es solo referencia visual/UX, no debe copiar datos sensibles al proyecto.
- Mantén el stack definido salvo que preguntes antes.

Aquí está el prompt del proyecto:

# PROYECTO: MiCartera — App de seguimiento de inversiones

## CONTEXTO
App de seguimiento de cartera de inversiones argentina. Ya existe un prototipo 
HTML funcional (cartera_app_v5.html) que define el diseño visual y la UX. 
El objetivo es convertirlo en una app real con backend, base de datos y PWA.

## STACK DEFINIDO — no cambiar sin consultar
- Frontend: PWA (HTML/CSS/JS vanilla o React, a definir)
- Backend: Python (FastAPI o Flask)
- Base de datos: Firebase Firestore
- Auth: Firebase Authentication
- Hosting: Firebase Hosting
- Functions: Firebase Cloud Functions
- Polling de datos: cada 30–60 segundos
- Target: PWA instalable + Android

## ARQUITECTURA — diseñar para escalar
- Multi-usuario desde el día 1: cada usuario conecta su propio broker
- Cada usuario tiene su propia colección en Firestore
- El código nunca tiene datos hardcodeados (precios, nominales, nombres)
- Todo dato sensible viene de variables de entorno o de la API
- El repositorio público nunca incluye datos reales de ningún usuario

## ESTRUCTURA DE DATOS — referencia (no hardcodear)
La cartera tiene estas categorías:
- acciones_ar: posiciones en acciones argentinas (BYMA)
- cedears: certificados con subyacente internacional (NYSE/NASDAQ)
- bonos: soberanos y corporativos
- ons: obligaciones negociables
- fci: fondos comunes de inversión
- liquidez: efectivo en ARS y USD

Cada posición tiene: ticker, descripcion, cantidad, precio_actual_ars, 
valor_corriente_ars, pct_cartera, rend_usd_pct, accion_tactica, tesis_corta.

Los CEDEARs tienen además: subyacente_usd y mercado_subyacente (NYSE/NASDAQ).
Siempre distinguir precio CEDEAR en ARS (BYMA) vs subyacente en USD.

## REGLAS FIJAS — nunca ignorar

1. Antes de crear cualquier archivo, mencionar qué se va a crear y esperar confirmación.

2. Todo el código debe tener comentarios explicando qué hace cada sección y por qué.

3. Sin datos hardcodeados: ningún nominal, precio, rendimiento, nombre de usuario 
   ni nombre de broker en el código. Todo viene de la API o variables de entorno.

4. El archivo con datos reales de cartera es solo referencia de estructura. 
   Nunca incluirlo en el repo ni en ningún archivo commiteado. Solo va la 
   estructura vacía que recibe datos dinámicamente.

5. Stack definido arriba — no cambiar sin consultar.

6. Roadmap multi-usuario siempre en mente: diseñar para escalar sin reescribir.

7. La app muestra rentabilidad en todas las monedas: ARS, USD MEP, USD CCL, USD BNA.
   La referencia principal para rendimiento real es USD MEP.
   Botón de moneda activo actualiza todos los valores de forma consistente.
   Botón de privacidad (ojo) oculta montos pero mantiene visibles los porcentajes.

8. CEDEARs: siempre mostrar tanto el precio en ARS (BYMA) como el valor 
   del subyacente en USD (NYSE/NASDAQ) cuando sea relevante.

9. Notificar cuando termine cada módulo o tarea significativa.

## REFERENCIA DE DISEÑO
El archivo cartera_app_v5.html define:
- Paleta de colores (dark theme, variables CSS)
- Tipografías: IBM Plex Mono, DM Mono, Syne
- Componentes: ticker rows con accordion, donut chart, KPIs, tabs, timeline
- Lógica de UI: toggle moneda, privacidad, distribución, gráficos TradingView

## TAREA INICIAL
Proponer la estructura de carpetas del proyecto y el plan de desarrollo 
por fases antes de escribir ningún archivo.