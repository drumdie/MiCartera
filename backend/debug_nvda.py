r"""
Diagnóstico: verifica qué ticker tienen los movimientos de NVDA en PPI
y si avg_costs_usd lo incluye.

TODO: eliminar este script cuando el fix de avg_cost_usd esté estable en producción.

Uso:
    cd backend
    .venv\Scripts\python.exe debug_nvda.py
"""
import sys, os, asyncio
sys.stdout.reconfigure(encoding="utf-8")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from datetime import datetime, timezone, timedelta
from app.services.ppi_client import ppi_client, _ensure_mep_history

async def main():
    now = datetime.now(timezone.utc)
    date_from = (now - timedelta(days=365)).strftime("%Y-%m-%d")
    date_to   = now.strftime("%Y-%m-%d")

    print(f"Fetchando movimientos {date_from} → {date_to} ...")
    movs = await ppi_client.get_movements(date_from, date_to)
    print(f"Total movimientos en el periodo: {len(movs)}")

    # Mostrar los tickers únicos en los movimientos
    tickers = set(m.get("ticker", "<vacío>") for m in movs)
    print(f"\nTickers únicos en movimientos: {sorted(tickers)}\n")

    # Filtrar los de NVDA (por ticker o descripción)
    nvda_movs = [m for m in movs if
                 "NVDA" in str(m.get("ticker","")).upper() or
                 "NVDA" in str(m.get("description","")).upper()]
    print(f"Movimientos que mencionan NVDA: {len(nvda_movs)}")
    for m in nvda_movs[:5]:
        print(f"  ticker={m.get('ticker')!r:20} desc={m.get('description','')[:40]!r}  qty={m.get('quantity')}  price={m.get('price')}")

    # Verificar MEP histórico
    print("\nCargando MEP histórico...")
    mep = await _ensure_mep_history()
    for fecha in ["2024-12-05", "2024-12-09", "2025-04-15", "2025-04-16"]:
        print(f"  MEP {fecha}: {mep.get(fecha, 'NO ENCONTRADO')}")

    # Calcular avg_costs_usd
    print("\nCalculando avg_costs (full 5y)...")
    avg_costs, avg_costs_usd, state = await ppi_client.compute_avg_costs(cached_state=None)
    print(f"Tickers en avg_costs:     {sorted(avg_costs.keys())}")
    print(f"Tickers en avg_costs_usd: {sorted(avg_costs_usd.keys())}")
    print(f"\nNVDA en avg_costs:     {avg_costs.get('NVDA')}")
    print(f"NVDA en avg_costs_usd: {avg_costs_usd.get('NVDA')}")

asyncio.run(main())
