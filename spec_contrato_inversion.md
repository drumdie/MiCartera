# Spec — Módulo táctico de cartera basado en Contrato de Inversión

> MiCartera · Feature de Valor Agregado · Diseño cerrado 2026-06-11
> Versión consolidada (multi-IA) + ajustes de revisión. Lista para implementar.

---

## Idea central

Cada ticker no se analiza como activo aislado sino como **posición dentro de una cartera personal**. Para eso, cada ticker tiene un **contrato de inversión** definido por el usuario.

El sistema no responde "¿qué hago con YPF?" sino:

> "Dado mi perfil como inversor, el rol que le asigné a YPF, su peso actual en cartera, sus fundamentals, sus catalizadores y sus riesgos, **¿cuál es la próxima acción que más importa ejecutar?**"

La recomendación nace del cruce entre: tesis personal + rol asignado + peso real vs banda objetivo + escenarios fundamentales + catalizadores/riesgos/kill criteria + ranking de impacto en puntos porcentuales (pp) de cartera.

### Principio de diseño

> **La app calcula. El usuario define el contrato. El LLM razona dentro de ese marco. El ranking decide qué importa primero. Y si no hay evidencia suficiente, el sistema recomienda no operar.**

---

## 1. Contrato de inversión por ticker

Contrato editable con estos campos:

### 1.1 Rol en cartera (enum cerrado — 5 valores)

| Valor | Label UI | Implica |
|---|---|---|
| `core_estructural` | Core estructural (~2030) | No se vende por volatilidad normal; correcciones = oportunidad de entrada si tesis intacta |
| `medio_plazo` | Medio plazo (1–2 años) | Tesis con vencimiento; revisar post-balance |
| `especulativa` | Especulativa / táctica | Sensible a tomar ganancia; recorte agresivo si se activa kill criterion |
| `renta_defensiva` | Renta / defensiva | Bonos, ONs, FCI — se evalúa el carry vs riesgo, no la apreciación |
| `cobertura` | Cobertura | Protección de cartera; se evalúa si el riesgo cubierto sigue vigente |

*Nota de revisión: se fusionó "Trade táctico" dentro de `especulativa` (se pisaban).*

### 1.2 Banda de peso objetivo

```json
{ "peso_min": 4, "peso_objetivo": 6, "peso_max": 8 }
```

La app clasifica la posición: por debajo de banda / dentro de banda / sobreponderada / excesivamente concentrada.

**Ajuste anti-fricción (clave para el onboarding de 22 tickers):** la banda viene con **default según el rol** y solo se edita si el usuario quiere afinar:

| Rol | Banda default (min–max) |
|---|---|
| core_estructural | 10–20% |
| medio_plazo | 5–10% |
| especulativa | 0–5% |
| renta_defensiva | 5–15% |
| cobertura | 0–10% |

La app avisa si la suma de pesos objetivo se aleja significativamente de 100%.

### 1.3 Tesis personal

Texto breve pero **evaluable**. No alcanza "me gusta la empresa": debe quedar claro qué tendría que pasar para que la tesis siga viva, se debilite o se invalide.

Ej.: *"Exposición estructural a energía argentina: Vaca Muerta, recuperación de valuación y mejora de balance. Hold hasta FID del LNG."*

### 1.4 Kill criteria

Condiciones que invalidan o debilitan seriamente la tesis. Centrales por dos motivos: fuerzan al LLM a **no justificar eternamente una posición** solo porque el usuario ya la tiene, y evitan que una caída fuerte se trate automáticamente como oportunidad de compra.

Ejemplos: deterioro fuerte del balance · cambio regulatorio adverso · pérdida del catalizador principal · suba excesiva sin mejora de fundamentals · cambio político que afecte el negocio · pérdida de margen de seguridad · riesgo no compensado por upside.

**Ajuste por rol:** los kill criteria deben ser apropiados al rol. Triggers técnicos ("ruptura de soporte clave") son válidos para `especulativa`, pero NO para `core_estructural` — una tesis 2030 no muere por un gráfico; eso es exactamente el error que el sistema previene. La UI sugiere templates de kill criteria según el rol elegido.

### 1.5 Fecha / condición de revisión

- **v1**: fecha o frecuencia sugerida (trimestral, post-balance) + marcado "stale" si el contrato no se revisa en N meses.
- **v2 (fuera de alcance v1)**: condiciones por evento ("revisar ante caída >15%", "si supera peso máximo") — requieren infraestructura de monitoreo/alertas, no solo prompt.

---

## 2. Capa determinística (la app calcula, no opina)

La app entrega **datos verificables**. El LLM no inventa números ni modifica cálculos.

Por ticker:
- Peso actual en cartera · diferencias vs peso_min / objetivo / max
- pp a recortar si excede banda · pp a comprar si está debajo
- Precio actual vs escenarios bear/base/bull (ya existen en los docs de fundamentals)
- Distancia a máximos/mínimos recientes (52 semanas)
- Variación diaria / semanal / mensual
- Flags `cayo_fuerte` / `subio_fuerte`
- Concentración por sector/grupo y por tipo de activo
- Impacto en pp de cada acción táctica posible

```json
{
  "ticker": "YPF",
  "peso_actual": 9.4,
  "peso_objetivo": 6,
  "peso_max": 8,
  "exceso_sobre_max": 1.4,
  "pp_liberables_por_recorte": 1.4,
  "precio_vs_base": "+12%",
  "precio_vs_bull": "-18%",
  "distancia_maximo_52w": "-7%",
  "cayo_fuerte": false
}
```

### La bifurcación "cayó fuerte" (corazón de la disciplina)

**Caso A — cayó fuerte, tesis intacta** → posible compra escalonada, especialmente si: está debajo de banda + rol core/medio + ningún kill criterion activado + precio acercándose a escenario bear + catalizador principal vigente.

**Caso B — cayó fuerte porque la tesis se rompió** → NO es oportunidad automática: poner en observación / reducir / esperar balance / salir si la invalidez es clara. La caída es señal de riesgo, no de precio.

---

## 3. Capa LLM

Recibe: contrato + métricas determinísticas + fundamentals + técnicos + noticias + catalizadores + riesgos + contexto de cartera completa.

Reglas del prompt:
1. **No inventar números** — razonar sobre los recibidos.
2. **Prohibido recomendar sin citar** el peso actual vs banda y el rol declarado por el usuario.
3. **Noticias filtradas por tesis**: no resumir noticias genéricas; chequear si algo activa kill criteria o adelanta/confirma catalizadores. Todo lo demás es ruido por definición.
4. **Abogado del diablo obligatorio**: siempre incluir el mejor argumento EN CONTRA de mantener la posición (antídoto del sesgo de confirmación — el riesgo n°1 de un sistema donde el usuario escribe su propia tesis y el LLM tiende a validarla).
5. **Regla anti-hiperactividad**: el LLM no está obligado a recomendar una operación. "No hay suficiente evidencia para modificar la posición" es una respuesta válida y deseable. Una buena recomendación táctica no siempre es una operación; a veces la mejor acción es no hacer nada. El módulo no debe incentivar rotación innecesaria.
6. **Auto-chequeo**: si la recomendación para una posición core y una especulativa con resultado similar es la misma, revisar el razonamiento.

---

## 4. Output por ticker (JSON, enums cerrados)

### 4.1 `salud_tesis` (enum — 4 valores)
`intacta` · `debilitada` · `en_observacion` · `rota`

Siempre acompañada de `mejor_argumento_en_contra`:

```json
{
  "ticker": "YPF",
  "salud_tesis": "intacta",
  "mejor_argumento_en_contra": "La posición ya supera la banda máxima y parte del upside base parece capturado."
}
```

### 4.2 `accion_tactica` (enum — 6 acciones operativas)
`comprar_escalonado` · `aumentar` · `mantener` · `reducir_parcial` · `salir` · `observar`

+ campo libre opcional `condicion_espera` para la narrativa ("esperar balance Q2", "esperar FID LNG", "esperar mejor precio"). El badge de UI mapea del enum; la narrativa vive en la justificación.

*Nota de revisión: la lista original de 12 acciones se colapsó — "Mantener"/"No tocar"/"Esperar próximo balance" son la misma operación con distinta narrativa. "Rebalancear hacia otro ticker" se expresa como `reducir_parcial` + `ticker_destino` opcional en la justificación.*

Coherencia con el rol (ejemplos):
- Core + caída fuerte + tesis intacta → `comprar_escalonado`
- Especulativa + kill criterion activado → `salir` / `reducir_parcial`
- Dentro de banda sin novedades materiales → `mantener`
- Sobreponderada con tesis vigente → `reducir_parcial` (solo el excedente, no la tesis)

### 4.3 `justificacion`
Debe conectar explícitamente **contrato + números + tesis + cartera**: qué dato determinístico pesa más, qué parte del contrato se activó, qué riesgo cambió, qué catalizador sigue vigente, y **qué haría cambiar la recomendación** (razonamiento condicional obligatorio).

### 4.4 `urgencia` (enum)
`alta` · `media` · `baja` · `sin_accion_inmediata`

La urgencia depende principalmente del **impacto en cartera**, no de la noticia o el precio. Una acción puede ser correcta pero poco urgente si mueve pocos pp.

---

## 5. Ranking táctico de cartera (el output más importante)

No es la recomendación individual sino el ranking global: **qué acción ejecutar primero y por qué**, ordenado por impacto en pp de cartera — no por convicción narrativa.

```json
{
  "ranking_tactico": [
    { "prioridad": 1, "ticker": "YPF",  "accion": "reducir_parcial",    "impacto_pp": 1.4, "urgencia": "alta",
      "motivo": "Supera la banda máxima. Tesis vigente, pero el exceso de peso aumenta la concentración energética." },
    { "prioridad": 2, "ticker": "SPY",  "accion": "comprar_escalonado", "impacto_pp": 2.0, "urgencia": "media",
      "motivo": "Por debajo de la banda objetivo para un rol core estructural." },
    { "prioridad": 3, "ticker": "GGAL", "accion": "mantener",           "impacto_pp": 0,   "urgencia": "sin_accion_inmediata",
      "motivo": "Tesis intacta y peso dentro de banda." },
    { "prioridad": 4, "ticker": "TXAR", "accion": "observar",           "impacto_pp": 0,   "urgencia": "media",
      "motivo": "Cayó fuerte pero la tesis muestra debilitamiento. No corresponde comprar automáticamente." }
  ]
}
```

El ranking distingue: acción importante y urgente · importante pero no urgente · tentadora pero de bajo impacto · **emocionalmente atractiva pero incoherente con el contrato** · no recomendada por falta de evidencia.

---

## 6. Diferencial del producto

Un screener con IA responde "este ticker parece barato/caro". Este sistema responde:

> "Para TU cartera, con TU tesis, TU peso actual, TUS bandas y TUS reglas de invalidez, esta es la próxima acción que más cambia el riesgo-retorno de tu cartera."

El VA está en: contratos personalizados · roles explícitos · bandas de peso · kill criteria definidos de antemano · ranking por impacto en pp · LLM limitado por datos determinísticos · capacidad de recomendar **no operar**.

---

## 7. Mapa de implementación al código actual

### Prerrequisito bloqueante
🐛 **Fix del bug de rendimientos ONs/FCI** (YM41D +1391%, MTCGD +2161%, BZ.RF USD.A +177603%, NU −95%): la capa determinística se construye sobre `peso_actual` y G/P — con esos datos rotos, el sistema prioriza mal con total confianza. **Arreglar antes de implementar este módulo.**

### Storage
- `/users/{uid}/profile` → map `contratos_por_ticker: { "YPFD": { rol, peso_min, peso_objetivo, peso_max, tesis, kill_criteria: [], revision, actualizado } }`
- `portfolioService.js`: `saveContratos(uid, map)` con `setDoc(..., { merge: true })` — espejo de `replaceCatalysts`.

### UI
- Tab dedicado **"Contratos"** (o "Mis objetivos"): lista todos los tickers agrupados por `_GRUPO_TEMATICO` (ya existe en `usePortfolio.js`), mismo orden que el tab Fundamental.
- Por fila: select rol (autocompleta banda default) + banda editable + textarea tesis + kill criteria (chips/lista con templates por rol).
- Autosave con debounce. Indicador completado/pendiente/stale.

### Capa determinística
- Frontend (`usePortfolio.js` ya calcula `pct_cartera`, agrupación y totales): agregar desvío vs banda, pp liberables/faltantes, flags cayó/subió fuerte, concentración por grupo.
- Precio vs escenarios: los escenarios bear/base/bull ya viven en los docs de `fundamentals` (cargados para los 22 tickers); parsear el precio del escenario y comparar.

### Prompt (capa LLM)
- `services/contextBuilder.js`: nueva función `buildTacticalContext(portfolio, contratos, fundamentals, catalizadores)` — o enriquecer `buildFundamentalContext` con: contratos + métricas determinísticas + reglas §3 + schema de output §4–5.
- Mismo workflow copy/paste existente (Claude.ai → JSON → pegar en la app). Sin backend nuevo de análisis.

### Ingest / validación
- Al pegar el JSON: **validar enums** (`salud_tesis`, `accion_tactica`, `urgencia`) — rechazar/avisar valores fuera de enum, no confiar en que el LLM respetó el schema.
- Backend `fundamentals.py` `save_analysis`: extender `allowed` con los campos nuevos (`salud_tesis`, `mejor_argumento_en_contra`, `urgencia`, `condicion_espera`). El `ranking_tactico` es a nivel cartera → decidir destino (doc aparte `/users/{uid}/tactico/ranking` o en profile).
- `TacticalBadge.jsx`: mapear los 6 enums nuevos (hoy mapea mantener/tomar_parcial/compra_escalonada/etc. — unificar nomenclatura).

### Fases
- **v1**: contrato (UI + storage) + capa determinística + prompt enriquecido + output por ticker + ranking + validación de enums.
- **v2**: condiciones de revisión por evento (monitoreo/alertas) · panel "Táctico de cartera" con síntesis visual del ranking · notificaciones.
