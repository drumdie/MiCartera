"""
Router de portfolio.
Endpoint principal: POST /api/portfolio/sync
  - Llama a la API de PPI con las credenciales del backend
  - Transforma la respuesta al formato MiCartera
  - Escribe en Firestore /users/{uid}/portfolio/{categoria}
  - El frontend lee Firestore directamente via onSnapshot (no este endpoint)

El uid viene de request.state.uid, inyectado por FirebaseAuthMiddleware.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from firebase_admin import firestore

from app.services.ppi_client import ppi_client, PPIError

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

# ---------------------------------------------------------------------------
# Mapeo de categorías PPI → MiCartera
# ---------------------------------------------------------------------------
_CATEGORIA_MAP: dict[str, str] = {
    "acciones":                 "acciones_ar",
    "cedears":                  "cedears",
    "bonos":                    "bonos",
    "obligaciones negociables": "ons",
    "fondos comunes de inversión": "fci",
    "fci":                      "fci",
    "disponibilidades":         "liquidez",
    "cash":                     "liquidez",
}


def _normalize_categoria(ppi_category: str) -> str:
    return _CATEGORIA_MAP.get(ppi_category.lower().strip(), "acciones_ar")


def _transform_position(item: dict) -> dict:
    """Transforma un item de la API PPI al formato MiCartera."""
    ticker      = item.get("Ticker", item.get("ticker", ""))
    descripcion = item.get("Description", item.get("description", ticker))
    cantidad    = float(item.get("Amount", item.get("amount", 0)))
    precio      = float(item.get("Price", item.get("price", 0)))
    valor       = float(item.get("MarketValue", item.get("marketValue", cantidad * precio)))
    costo_prom  = float(item.get("AverageCost", item.get("averageCost", 0)))

    pos = {
        "ticker":              ticker,
        "descripcion":         descripcion,
        "cantidad":            cantidad,
        "precio_actual_ars":   precio,
        "valor_corriente_ars": valor,
        "pct_cartera":         0.0,  # se recalcula en el frontend
        "rend_usd_pct":        0.0,  # requiere cotizaciones para calcular correctamente
        "rend_ars_pct":        0.0,
    }

    # Costo promedio disponible → precio de compra en ARS
    if costo_prom > 0:
        pos["precio_compra_ars"] = costo_prom

    # CEDEARs: PPI puede informar el subyacente
    subyacente = item.get("UnderlyingTicker", item.get("underlyingTicker", ""))
    if subyacente:
        pos["subyacente_usd"]     = subyacente
        pos["mercado_subyacente"] = item.get("Market", "NYSE")
        pos["ratio_cedear"]       = int(item.get("Ratio", 1))

    return pos


def _build_categoria(posiciones: list[dict]) -> dict:
    subtotal = sum(p.get("valor_corriente_ars", 0) for p in posiciones)
    return {
        "posiciones":    posiciones,
        "subtotal_ars":  round(subtotal, 2),
        "pct_cartera":   0.0,  # el frontend lo recalcula
    }


def _build_liquidez(posiciones: list[dict]) -> dict:
    detalle = [
        {
            "especie":    p.get("ticker", ""),
            "cantidad":   p.get("cantidad", 0),
            "precio_ars": p.get("precio_actual_ars", 1),
            "valor_ars":  p.get("valor_corriente_ars", 0),
        }
        for p in posiciones
    ]
    subtotal = sum(d["valor_ars"] for d in detalle)
    return {
        "detalle":       detalle,
        "subtotal_ars":  round(subtotal, 2),
        "pct_cartera":   0.0,
        "usd_total_aprox": 0.0,  # el frontend divide por MEP en tiempo real
    }


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/sync")
async def sync_portfolio(request: Request):
    """
    Sincroniza el portfolio del usuario desde PPI a Firestore.
    No requiere body — usa el uid del Firebase token verificado por middleware.
    """
    uid = request.state.uid

    try:
        items = await ppi_client.get_account_positions()
    except PPIError as exc:
        raise HTTPException(status_code=502, detail=f"Error al consultar PPI: {exc}")

    # Agrupar por categoría
    grupos: dict[str, list[dict]] = {
        "acciones_ar": [],
        "cedears":     [],
        "bonos":       [],
        "ons":         [],
        "fci":         [],
        "liquidez":    [],
    }
    for item in items:
        cat = _normalize_categoria(item.get("Category", item.get("category", "")))
        grupos[cat].append(_transform_position(item))

    # Escribir en Firestore (Admin SDK → bypasea reglas de seguridad)
    db = firestore.client()
    user_ref = db.collection("users").document(uid)

    for cat, posiciones in grupos.items():
        data = (
            _build_liquidez(posiciones)
            if cat == "liquidez"
            else _build_categoria(posiciones)
        )
        data["ultima_sync"] = datetime.now(timezone.utc).isoformat()
        user_ref.collection("portfolio").document(cat).set(data)

    return {
        "status": "ok",
        "uid": uid,
        "categorias_sincronizadas": list(grupos.keys()),
        "total_posiciones": sum(len(v) for v in grupos.values()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
