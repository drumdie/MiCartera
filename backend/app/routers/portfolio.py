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

    currency = item.get("currency", item.get("Currency", "Pesos"))
    is_usd   = "olar" in currency.lower()

    # FIX 1: PPI devuelve Price=0 cuando el mercado está cerrado (fin de semana),
    # pero sí devuelve MarketValue correcto. Derivar precio desde valor/cantidad.
    if precio == 0 and valor > 0 and cantidad > 0:
        precio = round(valor / cantidad, 6)

    # Guardar valores pre-conversión para calcular rendimientos en moneda original
    precio_orig     = precio
    costo_prom_orig = costo_prom

    if is_usd and dolar_mep > 0:
        precio     = round(precio     * dolar_mep, 2)
        valor      = round(valor      * dolar_mep, 2)
        costo_prom = round(costo_prom * dolar_mep, 2)

    # Rendimiento histórico vs costo promedio de compra.
    # FIX 3: Para instrumentos USD, el avg_cost calculado desde movimientos puede
    # estar en ARS (PPI registra el monto en pesos). Si costo_prom_orig es mucho
    # mayor que precio_orig, asumimos que está en ARS y lo convertimos a USD.
    rend_ars_pct = 0.0
    rend_usd_pct = 0.0
    if costo_prom_orig > 0 and precio_orig > 0:
        costo_para_rend = costo_prom_orig
        if is_usd and dolar_mep > 0 and costo_prom_orig > precio_orig * 10:
            # costo_prom_orig está en ARS → convertir a USD para comparar con precio_orig
            costo_para_rend = costo_prom_orig / dolar_mep
        rend_orig = round((precio_orig - costo_para_rend) / costo_para_rend * 100, 2)
        if is_usd:
            rend_usd_pct = rend_orig
            rend_ars_pct = rend_orig  # proxy: no incluye variación del MEP durante la tenencia
        else:
            rend_ars_pct = rend_orig

    # Rendimiento del día: viene directo de PPI (marketChangePercent vs cierre anterior)
    rend_dia_pct = round(rend_dia_ppi, 2) if rend_dia_ppi is not None else 0.0

    # Rendimiento absoluto — costo_prom y valor ya están en ARS (conversión ocurrió arriba)
    costo_total_ars  = round(costo_prom * cantidad, 2) if costo_prom > 0 else 0.0
    ganancia_ars     = round(valor - costo_total_ars, 2) if costo_total_ars > 0 else 0.0
    ganancia_usd_mep = round(ganancia_ars / dolar_mep, 2) if dolar_mep > 0 and costo_total_ars > 0 else 0.0

    pos = {
        "ticker":              ticker,
        "descripcion":         descripcion,
        "cantidad":            cantidad,
        "precio_actual_ars":   precio,
        "valor_corriente_ars": valor,
        "pct_cartera":         0.0,
        "costo_total_ars":     costo_total_ars,
        "ganancia_ars":        ganancia_ars,
        "ganancia_usd_mep":    ganancia_usd_mep,
        "rend_dia_pct":        rend_dia_pct,
        "rend_usd_pct":        rend_usd_pct,
        "rend_ars_pct":        rend_ars_pct,
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
    subtotal     = sum(p.get("valor_corriente_ars", 0) for p in posiciones)
    costo_total  = sum(p.get("costo_total_ars",    0) for p in posiciones)
    ganancia     = sum(p.get("ganancia_ars",        0) for p in posiciones)
    ganancia_usd = sum(p.get("ganancia_usd_mep",   0) for p in posiciones)
    rend_pct     = round(ganancia / costo_total * 100, 2) if costo_total > 0 else 0.0
    return {
        "posiciones":       posiciones,
        "subtotal_ars":     round(subtotal, 2),
        "costo_total_ars":  round(costo_total, 2),
        "ganancia_ars":     round(ganancia, 2),
        "ganancia_usd_mep": round(ganancia_usd, 2),
        "rend_pct":         rend_pct,
        "pct_cartera":      0.0,
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


# Categorías que tienen cotización de mercado en tiempo real
_CATS_CON_MERCADO = set(_MARKET_PARAMS.keys())

# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/sync")
async def sync_portfolio(request: Request):
    """
    Sincroniza el portfolio del usuario desde PPI a Firestore.
    No requiere body — usa el uid del Firebase token verificado por middleware.

    Manejo de datos obsoletos:
    - Si PPI no responde (mercado cerrado, fin de semana): retorna status "sin_datos_frescos"
      sin tocar Firestore — el frontend sigue mostrando los últimos datos conocidos.
    - Si PPI responde posiciones pero no market data (mercado cerrado a mitad del proceso):
      preserva el último rend_dia_pct conocido en lugar de sobreescribir con 0.
    - Escribe is_stale=True en Firestore cuando los datos de mercado no están frescos.
    """
    uid = request.state.uid
    db = firestore.client()
    user_ref = db.collection("users").document(uid)

    # Leer portfolio existente antes de intentar PPI.
    # Sirve como fallback para rend_dia_pct cuando el mercado está cerrado,
    # y como fuente de ultima_sync si PPI falla completamente.
    _CATS = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]
    existing: dict[str, dict] = {}
    for cat in _CATS:
        snap = user_ref.collection("portfolio").document(cat).get()
        if snap.exists:
            existing[cat] = snap.to_dict()

    # Intentar sync desde PPI. Si falla, Firestore queda intacto.
    try:
        items, avg_costs = await asyncio.gather(
            ppi_client.get_account_positions(),
            ppi_client.get_average_costs(),
        )
    except Exception as exc:
        ultima_sync = max(
            (d.get("ultima_sync", "") for d in existing.values()),
            default="",
        )
        return {
            "status": "sin_datos_frescos",
            "stale": True,
            "ultima_sync_exitosa": ultima_sync,
            "detalle": str(exc),
        }

    # Leer tipo de cambio MEP: Firestore → PPI → dolarapi.com
    cotiz_snap = db.collection("market").document("cotizaciones").get()
    cotiz     = cotiz_snap.to_dict() if cotiz_snap.exists else {}
    dolar_mep = float(cotiz.get("dolar_mep") or 0)

    if dolar_mep <= 0:
        try:
            dolar_mep = await ppi_client.get_dolar_mep()
        except Exception:
            pass

    if dolar_mep <= 0:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get("https://dolarapi.com/v1/dolares/bolsa")
                if resp.is_success:
                    data = resp.json()
                    compra = float(data.get("compra") or 0)
                    venta  = float(data.get("venta")  or 0)
                    if compra > 0 and venta > 0:
                        dolar_mep = round((compra + venta) / 2, 2)
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
        # Usar el AverageCost que PPI provee directamente en posiciones (coincide con el broker).
        # Solo calcular desde movimientos si PPI no lo incluye en la respuesta.
        # FIX 2: movimientos trunca tickers a 10 chars → buscar también con prefijo.
        ppi_has_cost = bool(item.get("averagePrice") or item.get("AverageCost"))
        if not ppi_has_cost:
            avg_cost_calc = avg_costs.get(ticker) or avg_costs.get(ticker[:10])
            if avg_cost_calc is not None:
                item = {**item, "averagePrice": avg_cost_calc}
        grupos_raw[cat].append(item)

    # Obtener precios de apertura en paralelo para calcular rend_dia_pct
    opening_prices = await _fetch_opening_prices(grupos_raw)

    # Detectar si el mercado está abierto: hay instrumentos que requieren market data
    # pero opening_prices llegó vacío → mercado cerrado o fuera de horario.
    hay_tickers_con_mercado = any(grupos_raw.get(cat) for cat in _CATS_CON_MERCADO)
    mercado_abierto = not hay_tickers_con_mercado or bool(opening_prices)

    # Construir mapa de último rend_dia_pct conocido por ticker (desde Firestore)
    rend_dia_conocido: dict[str, float] = {}
    for old_data in existing.values():
        for pos in old_data.get("posiciones", []):
            tk = pos.get("ticker", "")
            if tk:
                rend_dia_conocido[tk] = pos.get("rend_dia_pct", 0.0)

    # Transformar al formato MiCartera, preservando rend_dia_pct cuando no hay dato fresco
    grupos: dict[str, list[dict]] = {}
    for cat, raw_items in grupos_raw.items():
        grupos[cat] = []
        for item in raw_items:
            ticker = item.get("ticker", item.get("Ticker", ""))
            rend_dia = opening_prices.get(ticker)
            if rend_dia is None and ticker in rend_dia_conocido:
                rend_dia = rend_dia_conocido[ticker]
            grupos[cat].append(_transform_position(item, dolar_mep, rend_dia))

    # Escribir en Firestore
    now = datetime.now(timezone.utc).isoformat()
    for cat, posiciones in grupos.items():
        data = (
            _build_liquidez(posiciones)
            if cat == "liquidez"
            else _build_categoria(posiciones)
        )
        data["ultima_sync"] = now
        data["is_stale"]    = not mercado_abierto
        user_ref.collection("portfolio").document(cat).set(data)

    return {
        "status": "ok",
        "uid": uid,
        "stale": not mercado_abierto,
        "categorias_sincronizadas": list(grupos.keys()),
        "total_posiciones": sum(len(v) for v in grupos.values()),
        "timestamp": now,
    }


@router.get("/debug-costs")
async def debug_costs(request: Request):
    """
    Endpoint de diagnóstico. Muestra:
    - Todos los campos crudos que PPI devuelve por posición (para ver si incluye AverageCost)
    - Comparación entre avg_cost de PPI vs el calculado desde movimientos
    NO escribe en Firestore.
    """
    try:
        items = await ppi_client.get_account_positions()
    except Exception as exc:
        return {"error": str(exc)}

    try:
        avg_costs_calc = await ppi_client.get_average_costs()
    except Exception:
        avg_costs_calc = {}

    comparacion = []
    for item in items:
        ticker = item.get("ticker", item.get("Ticker", ""))
        if not ticker:
            continue

        ppi_avg  = item.get("averagePrice", item.get("AverageCost", item.get("averageCost", None)))
        calc_avg = avg_costs_calc.get(ticker) or avg_costs_calc.get(ticker[:10])

        comparacion.append({
            "ticker":              ticker,
            "category":            item.get("Category", ""),
            "currency":            item.get("currency", item.get("Currency", "")),
            # ¿PPI devuelve el precio promedio directamente?
            "ppi_average_cost":    ppi_avg,
            # Nuestro cálculo desde movimientos
            "calc_average_cost":   round(calc_avg, 2) if calc_avg else None,
            # Todos los campos del item crudo (para detectar el nombre real del campo)
            "raw_fields":          list(item.keys()),
            # Valores numéricos relevantes del item
            "raw_price_fields": {
                k: item[k] for k in item
                if any(s in k.lower() for s in ["price", "cost", "avg", "average", "prom"])
            },
        })

    return {
        "total_posiciones": len(comparacion),
        "posiciones":       comparacion,
    }


@router.get("/debug-movements/{ticker}")
async def debug_movements(ticker: str, request: Request):
    """
    Muestra todos los movimientos de un ticker en los últimos 5 años,
    el cálculo sin corrección y el cálculo con corrección de moneda.
    Útil para diagnosticar diferencias vs el broker.
    """
    import math
    import statistics as _stats
    from datetime import timedelta

    date_to   = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=1825)

    raw_movs: list = []
    chunk_start = date_from
    while chunk_start < date_to:
        chunk_end = min(date_to, chunk_start + timedelta(days=179))
        try:
            chunk = await ppi_client.get_movements(
                chunk_start.strftime("%Y-%m-%d"),
                chunk_end.strftime("%Y-%m-%d"),
            )
            for mov in chunk:
                t = mov.get("ticker", "")
                if t.upper() == ticker.upper() or ticker.upper().startswith(t.upper()):
                    raw_movs.append(mov)
        except Exception as exc:
            raw_movs.append({"error": str(exc)})
        chunk_start = chunk_end + timedelta(days=1)

    # Normalizar y ordenar
    movs_norm = []
    for mov in raw_movs:
        if "error" in mov:
            continue
        qty    = abs(float(mov.get("quantity", 0)))
        price  = float(mov.get("price",    0))
        amount = float(mov.get("amount",   0))
        if qty == 0 or price == 0:
            continue
        date_key = mov.get("settlementDate") or mov.get("date") or ""
        movs_norm.append({"qty": qty, "price": price, "amount": amount,
                          "date": date_key, "desc": mov.get("description", "")})
    movs_norm.sort(key=lambda m: m["date"])

    # Corrección de moneda
    eff = [abs(m["amount"]) / m["qty"] for m in movs_norm if m["qty"] > 0 and m["amount"] != 0]
    median_p = _stats.median(eff) if len(eff) >= 2 else 0
    corrections = []
    movs_corrected = []
    for m in movs_norm:
        mc = dict(m)
        if median_p > 0 and m["qty"] > 0 and m["amount"] != 0:
            unit_cost = abs(m["amount"]) / m["qty"]
            ratio = median_p / unit_cost if unit_cost > 0 else 0
            if ratio > 50:
                power = round(math.log10(ratio))
                scale = 10 ** max(1, power)
                mc["amount"] = m["amount"] * scale
                mc["correccion"] = f"×{scale} (ratio {ratio:.0f}x vs mediana {median_p:.0f})"
                corrections.append(mc["correccion"])
        movs_corrected.append(mc)

    # Replay con corrección
    steps = []
    qty_acum = cost_acum = 0.0
    for mc in movs_corrected:
        tipo = "COMPRA" if mc["amount"] < 0 else "VENTA"
        if mc["amount"] < 0:
            qty_acum  += mc["qty"]
            cost_acum += abs(mc["amount"])
        elif mc["amount"] > 0 and qty_acum > 0:
            avg_prev  = cost_acum / qty_acum
            qty_acum  = max(0.0, qty_acum - mc["qty"])
            cost_acum = qty_acum * avg_prev
        avg_now = (cost_acum / qty_acum) if qty_acum > 0 else 0
        step = {
            "fecha":       mc["date"],
            "tipo":        tipo,
            "qty":         mc["qty"],
            "price":       mc["price"],
            "amount_orig": m["amount"] if (corr := mc.get("correccion")) else mc["amount"],
            "amount_used": mc["amount"],
            "qty_acum":    round(qty_acum, 4),
            "cost_acum":   round(cost_acum, 2),
            "avg_precio":  round(avg_now, 2),
            "descripcion": mc["desc"],
        }
        if mc.get("correccion"):
            step["correccion_moneda"] = mc["correccion"]
        steps.append(step)

    avg_final = round(cost_acum / qty_acum, 2) if qty_acum > 0 else None
    return {
        "ticker":              ticker.upper(),
        "ventana":             "5 años",
        "total_movimientos":   len(steps),
        "correcciones_moneda": corrections,
        "avg_costo_final":     avg_final,
        "qty_final":           round(qty_acum, 4),
        "mediana_precio":      round(median_p, 2),
        "pasos":               steps,
    }
