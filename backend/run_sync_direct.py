r"""
Corre el sync completo directamente (sin backend HTTP) usando el código actual.
Equivale a POST /api/portfolio/sync?force_full=true

TODO: eliminar este script cuando el fix de avg_cost_usd esté estable en producción.
      Fue creado como workaround para bypasear un zombie process durante el debugging.

Uso:
    cd backend
    .venv\Scripts\python.exe run_sync_direct.py
"""
import sys, os, asyncio
sys.stdout.reconfigure(encoding="utf-8")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from datetime import datetime, timezone, timedelta
from app.core.firebase_admin_init import init_firebase
from firebase_admin import firestore
from app.services.ppi_client import ppi_client
from app.services.encryption import encrypt_payload, decrypt_payload, EncryptionNotConfigured
from app.routers.portfolio import (
    _normalize_categoria, _transform_position, _build_categoria,
    _build_liquidez, _fetch_opening_prices, _CATS_CON_MERCADO,
)

UID = "QHvzZ5XPbNcki8fIKRiE7WyG5iE3"

_MARKET_PARAMS = {
    "acciones_ar": ("ACCIONES", "A-48HS"),
    "cedears":     ("CEDEARS",  "A-48HS"),
    "bonos":       ("BONOS",    "A-24HS"),
    "ons":         ("BONOS",    "A-24HS"),
}


async def main():
    print("Inicializando Firebase...")
    init_firebase()
    db = firestore.client()
    user_ref  = db.collection("users").document(UID)
    meta_ref  = user_ref.collection("meta")

    # Borrar caché para forzar full_5y
    print("Borrando caché avg_costs...")
    meta_ref.document("avg_costs").delete()

    # Obtener posiciones y costos promedio en paralelo
    print("Fetchando posiciones y movimientos (5 años)... puede tardar ~15s")
    import time; t0 = time.time()
    items, avg_result = await asyncio.gather(
        ppi_client.get_account_positions(),
        ppi_client.compute_avg_costs(cached_state=None),
    )
    avg_costs, avg_costs_usd, avg_costs_state = avg_result
    print(f"Listo en {time.time()-t0:.1f}s — {len(items)} posiciones, "
          f"{len(avg_costs_usd)} tickers con avg_cost_usd")
    print(f"  NVDA en avg_costs_usd: {avg_costs_usd.get('NVDA')}")

    # MEP
    cotiz_snap = db.collection("market").document("cotizaciones").get()
    cotiz = cotiz_snap.to_dict() if cotiz_snap.exists else {}
    dolar_mep = float(cotiz.get("dolar_mep") or 0)
    if dolar_mep <= 0:
        dolar_mep = await ppi_client.get_dolar_mep()
    print(f"  Dólar MEP: {dolar_mep}")

    # Agrupar por categoría
    grupos_raw = {c: [] for c in ["acciones_ar","cedears","bonos","ons","fci","liquidez"]}
    for item in items:
        cat    = _normalize_categoria(item.get("Category", item.get("category", "")))
        ticker = item.get("ticker", item.get("Ticker", ""))

        ppi_has_cost = bool(item.get("averagePrice") or item.get("AverageCost"))
        if not ppi_has_cost:
            avg_cost_calc = avg_costs.get(ticker) or avg_costs.get(ticker[:10])
            if avg_cost_calc is not None:
                if cat in ("bonos", "ons"):
                    avg_cost_calc = round(avg_cost_calc * 100, 6)
                acum_qty = (avg_costs_state.get("tickers") or {}).get(
                    ticker, (avg_costs_state.get("tickers") or {}).get(ticker[:10], {})
                ).get("qty", 0)
                actual_qty = float(item.get("quantity", item.get("Amount", 0)))
                if acum_qty > 0 and actual_qty > 0 and abs(acum_qty - actual_qty) > 0.5:
                    avg_cost_calc = round(avg_cost_calc * (acum_qty / actual_qty), 6)
                currency_item = item.get("currency", item.get("Currency", "Pesos"))
                if "olar" in currency_item.lower() and dolar_mep > 0:
                    item = {**item, "averagePrice": round(avg_cost_calc / dolar_mep, 6)}
                else:
                    item = {**item, "averagePrice": avg_cost_calc}

        if cat in ("acciones_ar", "cedears", "bonos", "ons"):
            avg_usd = avg_costs_usd.get(ticker) or avg_costs_usd.get(ticker[:10])
            if avg_usd:
                if cat in ("bonos", "ons"):
                    avg_usd = round(avg_usd * 100, 6)
                item = {**item, "averagePriceUSD": avg_usd}
                if ticker == "NVDA":
                    print(f"  [OK] NVDA averagePriceUSD inyectado: {avg_usd}")

        grupos_raw[cat].append(item)

    opening_prices = await _fetch_opening_prices(grupos_raw)

    # Transformar y escribir en Firestore
    now = datetime.now(timezone.utc).isoformat()
    mercado_abierto = bool(opening_prices)

    rend_dia_conocido = {}
    for cat in grupos_raw:
        snap = user_ref.collection("portfolio").document(cat).get()
        if snap.exists:
            old = decrypt_payload(snap.to_dict())
            for pos in old.get("posiciones", []):
                tk = pos.get("ticker","")
                if tk:
                    rend_dia_conocido[tk] = pos.get("rend_dia_pct", 0.0)

    for cat, raw_items in grupos_raw.items():
        posiciones = []
        for item in raw_items:
            ticker = item.get("ticker", item.get("Ticker", ""))
            rend_dia = opening_prices.get(ticker)
            if rend_dia is None and ticker in rend_dia_conocido:
                rend_dia = rend_dia_conocido[ticker]
            posiciones.append(_transform_position(item, dolar_mep, rend_dia, cat))

        data = _build_liquidez(posiciones) if cat == "liquidez" else _build_categoria(posiciones)
        data["ultima_sync"] = now
        data["is_stale"]    = not mercado_abierto
        user_ref.collection("portfolio").document(cat).set(encrypt_payload(data))
        print(f"  Escrito: {cat} ({len(posiciones)} posiciones)")

    meta_ref.document("avg_costs").set(encrypt_payload(avg_costs_state))
    print("\nSync completo. Verificando NVDA en Firestore...")

    snap = user_ref.collection("portfolio").document("cedears").get()
    data = decrypt_payload(snap.to_dict())
    for pos in data.get("posiciones", []):
        if pos.get("ticker") == "NVDA":
            print(f"  precio_compra_usd : {pos.get('precio_compra_usd')}")
            print(f"  rend_usd_pct      : {pos.get('rend_usd_pct')}")
            print(f"  ganancia_usd_mep  : {pos.get('ganancia_usd_mep')}")
            break

asyncio.run(main())
