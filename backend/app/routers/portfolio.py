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

import asyncio
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
    "ons":                      "ons",
    "fondos comunes de inversión": "fci",
    "fci":                      "fci",
    "disponibilidades":         "liquidez",
    "cash":                     "liquidez",
}

# Parámetros para MarketData/Current por categoría
_MARKET_PARAMS: dict[str, tuple[str, str]] = {
    "acciones_ar": ("ACCIONES", "A-48HS"),
    "cedears":     ("CEDEARS",  "A-48HS"),
    "bonos":       ("BONOS",    "A-24HS"),
    "ons":         ("BONOS",    "A-24HS"),
}


def _normalize_categoria(ppi_category: str) -> str:
    return _CATEGORIA_MAP.get(ppi_category.lower().strip(), "acciones_ar")


async def _fetch_opening_prices(grupos_raw: dict[str, list[dict]]) -> dict[str, float]:
    """Consulta MarketData/Current en paralelo y retorna {ticker: openingPrice}."""
    tasks: list[tuple[str, str, str]] = []
    for cat, (inst_type, settlement) in _MARKET_PARAMS.items():
        for item in grupos_raw.get(cat, []):
            ticker = item.get("ticker", item.get("Ticker", ""))
            if ticker:
                tasks.append((ticker, inst_type, settlement))

    if not tasks:
        return {}

    results = await asyncio.gather(
        *(ppi_client.get_market_data(t, it, s) for t, it, s in tasks),
        return_exceptions=True,
    )

    opening: dict[str, float] = {}
    for (ticker, _itype, _sett), data in zip(tasks, results):
        if not isinstance(data, dict):
            continue
        # Preferimos marketChangePercent de PPI (vs cierre anterior, igual que el broker)
        pct_str = data.get("marketChangePercent", "")
        try:
            pct = float(str(pct_str).replace("%", "").strip())
            opening[ticker] = pct
        except (ValueError, TypeError):
            # Fallback: calcular vs previousClose
            prev = float(data.get("previousClose") or 0)
            price = float(data.get("price") or 0)
            if prev > 0 and price > 0:
                opening[ticker] = round((price - prev) / prev * 100, 2)
    return opening


def _transform_position(
    item: dict,
    dolar_mep: float = 0.0,
    rend_dia_ppi: float | None = None,
) -> dict:
    """Transforma un item de la API PPI al formato MiCartera."""
    ticker      = item.get("ticker",      item.get("Ticker", ""))
    descripcion = item.get("description", item.get("Description", ticker))
    cantidad    = float(item.get("quantity",    item.get("Amount", 0)))
    precio      = float(item.get("price",       item.get("Price", 0)))
    valor       = float(item.get("amount",      item.get("MarketValue", cantidad * precio)))
    costo_prom  = float(item.get("averagePrice", item.get("AverageCost", 0)))

    currency = item.get("currency", "Pesos")

    # Guardar valores pre-conversión para calcular rendimientos en moneda original
    precio_orig     = precio
    costo_prom_orig = costo_prom

    if "olar" in currency and dolar_mep > 0:
        precio     = round(precio     * dolar_mep, 2)
        valor      = round(valor      * dolar_mep, 2)
        costo_prom = round(costo_prom * dolar_mep, 2)

    # Rendimiento histórico vs costo promedio de compra (moneda original)
    rend_pct = 0.0
    if costo_prom_orig > 0 and precio_orig > 0:
        rend_pct = round((precio_orig - costo_prom_orig) / costo_prom_orig * 100, 2)

    # Rendimiento del día: viene directo de PPI (marketChangePercent vs cierre anterior)
    rend_dia_pct = round(rend_dia_ppi, 2) if rend_dia_ppi is not None else 0.0

    pos = {
        "ticker":              ticker,
        "descripcion":         descripcion,
        "cantidad":            cantidad,
        "precio_actual_ars":   precio,
        "valor_corriente_ars": valor,
        "pct_cartera":         0.0,
        "rend_dia_pct":        rend_dia_pct,
        "rend_usd_pct":        rend_pct,
        "rend_ars_pct":        rend_pct,
    }

    if costo_prom > 0:
        pos["precio_compra_ars"] = costo_prom

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
        items, avg_costs = await asyncio.gather(
            ppi_client.get_account_positions(),
            ppi_client.get_average_costs(),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error al consultar PPI: {type(exc).__name__}: {exc}")

    # Leer tipo de cambio MEP para convertir instrumentos en USD → ARS
    db = firestore.client()
    cotiz_snap = db.collection("market").document("cotizaciones").get()
    cotiz     = cotiz_snap.to_dict() if cotiz_snap.exists else {}
    dolar_mep = float(cotiz.get("dolar_mep") or 0)

    if dolar_mep <= 0:
        try:
            dolar_mep = await ppi_client.get_dolar_mep()
        except Exception:
            pass

    # Pre-agrupar items raw por categoría (inyectando avg_cost si disponible)
    grupos_raw: dict[str, list[dict]] = {
        "acciones_ar": [], "cedears": [], "bonos": [],
        "ons": [], "fci": [], "liquidez": [],
    }
    for item in items:
        cat = _normalize_categoria(item.get("Category", item.get("category", "")))
        ticker = item.get("ticker", item.get("Ticker", ""))
        avg_cost = avg_costs.get(ticker)
        if avg_cost is not None:
            item = {**item, "averagePrice": avg_cost}
        grupos_raw[cat].append(item)

    # Obtener precios de apertura en paralelo para calcular rend_dia_pct
    opening_prices = await _fetch_opening_prices(grupos_raw)

    # Transformar al formato MiCartera
    grupos: dict[str, list[dict]] = {}
    for cat, raw_items in grupos_raw.items():
        grupos[cat] = [
            _transform_position(
                item, dolar_mep,
                opening_prices.get(item.get("ticker", item.get("Ticker", ""))),
            )
            for item in raw_items
        ]

    # Escribir en Firestore (Admin SDK → bypasea reglas de seguridad)
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
