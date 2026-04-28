"""
Calculadora de stress test para carteras argentinas.

Cada escenario define un shock porcentual por categoría de activo.
El impacto total es el promedio ponderado por el peso de cada categoría en la cartera.

Los shocks son estimaciones históricas calibradas para el mercado argentino.
Deben revisarse periódicamente.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.models.stress import StressEscenario, StressTest


# ---------------------------------------------------------------------------
# Definición de escenarios
# ---------------------------------------------------------------------------
# Los shocks son variaciones en USD (no en ARS nominal).
# Categorías del portfolio: acciones_ar | cedears | bonos | ons | fci | liquidez
# Para bonos usamos la distinción implícita: soberano_usd tiene menor shock que soberano_ars.
# En V1 aplicamos shock promedio por categoría completa.

_ESCENARIOS: list[dict] = [
    {
        "nombre": "Brecha cambiaria +20%",
        "descripcion": (
            "MEP y CCL suben 20% vs el tipo de cambio oficial. "
            "Las posiciones en ARS valen menos en USD; los activos dolarizados se protegen."
        ),
        "supuesto": "Brecha cambiaria sube 20 pp respecto al nivel actual",
        "shocks": {
            "acciones_ar": -0.14,   # suben en ARS pero pierden en USD
            "cedears":      0.00,   # neutro: siguen el subyacente USD
            "bonos":       -0.08,   # mixto (soberanos USD protegen, en ARS pierden)
            "ons":          0.02,   # ONs hard-dollar se protegen
            "fci":         -0.10,   # depende del tipo; promedio negativo
            "liquidez":    -0.17,   # cash ARS pierde fuerte en USD
        },
        "amortiguadores": ["CEDEARs", "ONs USD", "Bonos Hard-Dollar"],
    },
    {
        "nombre": "MERVAL cae 30%",
        "descripcion": (
            "Corrección bursátil local del 30% en acciones argentinas. "
            "Impacto directo en acciones_ar; CEDEARs y bonos amortiguan."
        ),
        "supuesto": "Shock de confianza: MERVAL cede 30% en ARS",
        "shocks": {
            "acciones_ar": -0.30,
            "cedears":     -0.05,   # correlación parcial pero baja
            "bonos":        0.00,
            "ons":          0.00,
            "fci":         -0.06,   # FCI de renta variable arrastrado
            "liquidez":     0.00,
        },
        "amortiguadores": ["Bonos", "ONs", "Liquidez", "CEDEARs"],
    },
    {
        "nombre": "Riesgo País +500 pb",
        "descripcion": (
            "El riesgo país sube 500 puntos básicos. "
            "Impacta directamente en la paridad de bonos soberanos."
        ),
        "supuesto": "Crisis de confianza soberana; EMBI+ Argentina sube 500 pb",
        "shocks": {
            "acciones_ar": -0.12,
            "cedears":     -0.03,
            "bonos":       -0.20,   # los más expuestos
            "ons":         -0.07,   # correlación parcial
            "fci":         -0.05,
            "liquidez":     0.00,
        },
        "amortiguadores": ["Liquidez", "CEDEARs"],
    },
    {
        "nombre": "Devaluación oficial 30%",
        "descripcion": (
            "El tipo de cambio oficial se deprecia 30%. "
            "Posiciones en ARS pierden valor real; activos hard-dollar se valorizan en ARS."
        ),
        "supuesto": "Ajuste cambiario oficial abrupto del 30%",
        "shocks": {
            "acciones_ar":  0.08,   # suben en ARS (pasan la inflación parcialmente)
            "cedears":      0.00,   # neutro (ya están en USD)
            "bonos":        0.12,   # bonos hard-dollar suben fuerte en ARS
            "ons":          0.10,   # ídem ONs USD
            "fci":         -0.08,   # MM y renta fija ARS pierden; renta fija USD sube
            "liquidez":    -0.23,   # cash ARS pierde fuerte (se deprecia con el dólar)
        },
        "amortiguadores": ["CEDEARs", "Bonos Hard-Dollar", "ONs USD"],
    },
    {
        "nombre": "Shock externo (S&P500 -20%)",
        "descripcion": (
            "Corrección global del mercado estadounidense del 20%. "
            "Impacta CEDEARs directamente; acciones locales con correlación menor."
        ),
        "supuesto": "Recesión en EEUU: S&P500 cae 20% en USD",
        "shocks": {
            "acciones_ar": -0.08,   # correlación parcial con mercados globales
            "cedears":     -0.20,   # impacto directo en subyacente USD
            "bonos":       -0.05,   # flight to quality parcial
            "ons":         -0.04,
            "fci":         -0.12,   # FCI con exposición internacional
            "liquidez":     0.00,
        },
        "amortiguadores": ["Liquidez", "Bonos Soberanos AR (cobertura local)"],
    },
]


# ---------------------------------------------------------------------------
# Cálculo principal
# ---------------------------------------------------------------------------

def _get_subtotal(portfolio: dict[str, Any], cat: str) -> float:
    cat_data = portfolio.get(cat, {})
    if isinstance(cat_data, dict):
        return float(cat_data.get("subtotal_ars", 0))
    return 0.0


def _top_tickers_afectados(portfolio: dict[str, Any], categorias_shock: list[str]) -> list[str]:
    """Retorna los tickers con mayor exposición en las categorías más afectadas."""
    tickers = []
    for cat in categorias_shock:
        posiciones = portfolio.get(cat, {}).get("posiciones", [])
        # Ordenar por valor corriente y tomar el top
        sorted_pos = sorted(posiciones, key=lambda p: p.get("valor_corriente_ars", 0), reverse=True)
        for p in sorted_pos[:2]:
            tick = p.get("ticker", "")
            if tick and tick not in tickers:
                tickers.append(tick)
    return tickers[:4]


def calculate_stress_test(portfolio: dict[str, Any]) -> StressTest:
    """
    Calcula el impacto porcentual de cada escenario sobre la cartera.

    portfolio: dict con estructura MiCartera (salida de usePortfolio o Firestore)
    """
    categorias = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]

    total_ars = sum(_get_subtotal(portfolio, c) for c in categorias)
    if total_ars <= 0:
        return StressTest(
            escenarios=[],
            ultima_actualizacion=datetime.now(timezone.utc).isoformat(),
        )

    escenarios_result: list[StressEscenario] = []

    for esc in _ESCENARIOS:
        impacto_total = 0.0
        # Categorías con shock negativo más fuerte (para reportar tickers afectados)
        cats_negativas = sorted(
            esc["shocks"].items(),
            key=lambda kv: kv[1],
        )[:2]  # las 2 categorías más castigadas

        for cat, shock in esc["shocks"].items():
            subtotal = _get_subtotal(portfolio, cat)
            peso = subtotal / total_ars
            impacto_total += peso * shock

        cats_afectadas = [c for c, _ in cats_negativas]
        tickers_afectados = _top_tickers_afectados(portfolio, cats_afectadas)

        escenarios_result.append(
            StressEscenario(
                nombre=esc["nombre"],
                descripcion=esc["descripcion"],
                supuesto=esc["supuesto"],
                impacto_cartera_pct=round(impacto_total * 100, 1),
                tickers_mas_afectados=tickers_afectados,
                amortiguadores=esc["amortiguadores"],
            )
        )

    return StressTest(
        escenarios=escenarios_result,
        ultima_actualizacion=datetime.now(timezone.utc).isoformat(),
    )
