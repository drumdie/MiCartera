# Análisis Fundamental Objetivo — MiCartera

> Contrato de análisis. Claude lo usa cuando el usuario le da el texto de **"Copiar prompt fundamental"** (o dice "analizá los fundamentales") y devuelve el JSON para **"Pegar análisis fundamental"**. Par: [analisis-tactico-cp.md](analisis-tactico-cp.md).

Convierte las métricas duras de cada empresa (de Yahoo Finance, vía "Actualizar fundamentales") en un análisis **objetivo de la EMPRESA**. Es el insumo que después usa el análisis táctico.

## Entrada
El texto de **"Copiar prompt fundamental"** (tab Fundamental): por cada posición trae market cap, EBITDA TTM, EV/EBITDA, márgenes, P/E, ROE, deuda/EBITDA, sector, etc. — más el esquema de salida (el ticker `AAPL` que aparece es **solo el ejemplo del formato**, no un dato real).

## Regla de oro (el borde que NO se cruza)
Este análisis es **SOLO de la empresa**. **PROHIBIDO** incluir:
- % de cartera / concentración / peso de la posición.
- Acción táctica ("comprar / mantener / tomar parcial / vender") ni "llevarla a X%".
- Cualquier cosa que dependa de la cartera o del contrato (CP) del usuario.

Todo eso es trabajo del análisis táctico por CP. Acá la **tesis es de la empresa**: negocio, drivers del último trimestre, valuación, escenarios y riesgos. (Ej. LAR: Cauchari, costos, precio del litio, JV de Pastos Grandes → ✅. "Concentra el 16%, tomar parcial" → ❌, eso es del táctico.)

## Salida — JSON exacto (sin texto adicional)
```json
{
  "fecha_analisis": "YYYY-MM-DD",
  "analisis": [
    {
      "ticker": "AAPL",
      "sentimiento": "positivo | neutral | negativo",
      "q1_2026": "Revenue $X (+Y% a/a) · una línea (null si no hay datos recientes)",
      "kpis": { "ebitda_ttm": "USD Xb", "ev_ebitda": "Xx", "margen_ebitda": "X%", "clave_adicional": "valor" },
      "comparable_ev_ebitda": { "nombre": "Peer", "valor": "Xx" },
      "tesis": "2–3 oraciones, SOLO de la empresa (sin % de cartera ni acción táctica).",
      "escenarios": { "bear": "$X — desc", "base": "$X–Y — desc", "bull": "$Z+ — desc" },
      "analisis_extendido": "3–5 párrafos (doble salto de línea): negocio, drivers del trimestre, riesgos, racional de escenarios.",
      "fuentes": [ { "nombre": "SEC 10-Q", "url": "https://..." } ]
    }
  ]
}
```
- **NO** incluir `accion_tactica` (la define el táctico por CP).
- **`escenarios` SIEMPRE con precio:** cada escenario ARRANCA con su precio objetivo ("$62 — desc" / "AR$450 — desc"). Si no hay base para un precio puntual, usar variación esperada ("−25% — desc"). NUNCA solo la descripción — la app muestra ese valor como el número del escenario.
- `sentimiento` es sobre la empresa, no sobre la conveniencia de tenerla en cartera.
- `fecha_analisis` = hoy → la app la muestra como "Análisis del DD/MM/YY".

## Cómo se muestra
Se pega con **"Pegar análisis fundamental"** → `/fundamentals/{ticker}` → lo renderiza **FundCard** (tesis, escenarios, KPIs, fuentes), con su fecha.
