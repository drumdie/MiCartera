# Análisis Táctico por CP (Contrato Perfil) — MiCartera

> Contrato de análisis. Claude lo usa cuando el usuario le da el texto de **"Copiar contexto"** del **Perfil de Inversión** (o dice "analizá el táctico / te paso el CP") y devuelve el JSON para **"Pegar JSON"** del Ranking táctico. Par: [analisis-fundamental.md](analisis-fundamental.md).

**No hay análisis táctico fuera del CP.** La acción táctica solo tiene sentido cruzando el contrato del usuario con la realidad de la cartera. Este análisis **cruza 5 cosas**:

1. **CP** (Contrato Perfil por ticker): rol, banda `peso_min–objetivo–peso_max`, tesis del usuario, kill criteria.
2. **Análisis Fundamental Objetivo** ([analisis-fundamental.md](analisis-fundamental.md)): tesis de empresa, escenarios, KPIs.
3. **Precios en USD** y rendimiento (precio + renta) de cada posición.
4. **% VIVO de la cartera** (peso actual de cada posición y concentración por grupo).
5. **Fechas de los catalizadores** (un catalizador próximo cambia urgencia / condición de espera).

## Entrada
El texto de **"Copiar contexto"** del **Perfil de Inversión** (`buildContratoContext`): concentración por grupo, y por posición el peso actual + clasificación vs banda + el CP + rend USD (precio y total) + fundamental Q1/escenarios + catalizadores con fecha.

## La acción táctica DEBE variar dinámicamente
La misma posición puede merecer distinta acción según:
- **% de cartera vs banda del CP:** sobre la banda → recortar el excedente por riesgo (no la tesis); debajo → ¿reforzar?; en banda → mantener.
- **Precio USD / resultado:** subió fuerte + especulativa → tomar parcial/cristalizar; cayó fuerte → ¿tesis intacta (oportunidad) o rota (kill criterion)?
- **Fechas de catalizadores:** si hay uno cercano, cambia la urgencia o la `condicion_espera` (ej. "esperar balance Q2 del DD/MM").

## Reglas de razonamiento
1. NO recomendar sin citar **peso actual vs banda** y el **rol** declarado en el CP.
2. Ponderar **Objetivos (CP) × % cartera × resultado**:
   - Core / convicción alta + subió fuerte → MANTENER; entrada en correcciones.
   - Core + sobreponderada → recortar SOLO el excedente, no la tesis.
   - Especulativa + subió fuerte → tomar parcial / cristalizar.
   - Cualquiera + cayó fuerte → chequear kill criteria del CP.
3. **Antídoto de sesgo:** para cada core, el dato más fuerte HOY EN CONTRA de la tesis.
4. Catalizadores: importan si activan un kill criterion o adelantan/confirman un evento (usar su FECHA).
5. "Mantener / no tocar" es válido. No forzar operaciones.
6. Priorizar por **IMPACTO en puntos porcentuales de cartera**, no por % de rendimiento aislado.

## Salida — JSON exacto (sin texto adicional)
```json
{
  "fecha_analisis": "YYYY-MM-DD",
  "analisis_tactico": [
    {
      "ticker": "YPFD",
      "salud_tesis": "intacta | bajo_observacion | en_riesgo | rota",
      "mejor_argumento_en_contra": "El dato más fuerte HOY en contra de la posición.",
      "accion_tactica": "comprar | mantener | tomar_parcial | vender",
      "justificacion": "Cruzá CP + números + fundamental + cartera. Citá peso vs banda y el catalizador relevante con su fecha.",
      "urgencia": "alta | media | baja | sin_accion_inmediata",
      "condicion_espera": "Opcional: qué esperar (ej. balance Q2 del DD/MM) si la acción es mantener/observar."
    }
  ],
  "ranking_tactico": [
    {
      "prioridad": 1,
      "ticker": "YPFD",
      "accion": "tomar_parcial",
      "impacto_pp": 5.6,
      "urgencia": "alta",
      "motivo": "Qué la hace la acción más importante (impacto en pp de cartera)."
    }
  ]
}
```

## Anti-desfase de los números de cartera
Los `%` y precios reflejan el momento del análisis. La app los re-renderiza en vivo; por eso en `justificacion`/`motivo` se puede citar el peso ("sobre su banda 8–12%") pero **el número exacto que se muestra lo recalcula la app** con el dato actual. Clave: `fecha_analisis` (se muestra "Táctico del DD/MM/YY").

## Cómo se muestra
Se pega con **"Pegar JSON"** en el Ranking táctico (Perfil de Inversión) → `ranking_tactico` ordena por impacto; `analisis_tactico` da la acción + justificación por posición. El **badge táctico** de cada posición (en Posiciones/Fundamental) sale de acá, no del fundamental.
