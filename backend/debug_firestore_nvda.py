r"""
Lee el documento cedears de Firestore y muestra los campos de NVDA.
Corre DESPUÉS de hacer sync desde la app.

TODO: eliminar este script cuando el fix de avg_cost_usd esté estable en producción.

Uso:
    cd backend
    .venv\Scripts\python.exe debug_firestore_nvda.py
"""
import sys, os
sys.stdout.reconfigure(encoding="utf-8")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from app.core.firebase_admin_init import init_firebase
from firebase_admin import firestore
from app.services.encryption import decrypt_payload

UID = "QHvzZ5XPbNcki8fIKRiE7WyG5iE3"

init_firebase()
db = firestore.client()

snap = db.collection("users").document(UID).collection("portfolio").document("cedears").get()
if not snap.exists:
    print("No existe el doc cedears en Firestore")
    sys.exit(1)

data = decrypt_payload(snap.to_dict())
posiciones = data.get("posiciones", [])

for pos in posiciones:
    if pos.get("ticker") == "NVDA":
        print("=== NVDA en Firestore ===")
        campos = [
            "ticker", "cantidad", "precio_actual_ars", "valor_corriente_ars",
            "costo_total_ars", "precio_compra_ars", "precio_compra_usd",
            "ganancia_ars", "ganancia_usd_mep", "rend_usd_pct", "rend_ars_pct",
            "rend_dia_pct", "ultima_sync",
        ]
        for c in campos:
            print(f"  {c}: {pos.get(c)}")
        break
else:
    print("NVDA no encontrado en posiciones")
    print("Tickers presentes:", [p.get("ticker") for p in posiciones])
