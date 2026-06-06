r"""
Carga inicial de catalizadores desde fundamental_catalizadores_v7.txt a Firestore.
Script de migración de una sola vez — después usar el workflow copy/paste en la app.

TODO: eliminar este script una vez cargados los datos (verificar en el tab Catalizadores).

Uso:
    cd backend
    .venv\Scripts\python.exe cargar_catalysts_v7.py
"""
import sys, os
sys.stdout.reconfigure(encoding="utf-8")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from app.core.firebase_admin_init import init_firebase
from firebase_admin import firestore

UID = "QHvzZ5XPbNcki8fIKRiE7WyG5iE3"

# Catalizadores extraídos de fundamental_catalizadores_v7.txt (25/05/2026)
# Schema: { fecha, evento, tickers, estado, descripcion?, resultado? }
# estado: "done" | "near" | "structural" | "far"
CATALYSTS = [
    # ── COMPLETADOS ─────────────────────────────────────────────────────────
    {
        "fecha":    "2026-04-29",
        "evento":   "Earnings Q1 — Bloque internacional",
        "tickers":  ["GOOGL", "VIST", "BBD"],
        "estado":   "done",
        "resultado": (
            "GOOGL: Revenue $109,9B (+22%), EPS $5,11 (+82%) — beat fuerte. "
            "VIST: $865M (+97%), EBITDA $451M (+64%), guia alzada. "
            "BBD: net income R$6,8B (+16%), ROE 15,8%."
        ),
    },
    {
        "fecha":    "2026-05-06",
        "evento":   "Earnings Q1 — Energia AR",
        "tickers":  ["YPFD", "PAMP", "TGSU2"],
        "estado":   "done",
        "resultado": (
            "YPF: EBITDA $1.594M record (+28%). "
            "PAMP: resultado op. $325M (+48%). "
            "TGS: utilidad +12,5%, liquidos +51%."
        ),
    },
    {
        "fecha":    "2026-05-20",
        "evento":   "Earnings Q1 FY27 — NVIDIA",
        "tickers":  ["NVDA"],
        "estado":   "done",
        "resultado": (
            "Revenue $81,6B (+85%), EPS $1,87, Data Center $75B (+92%). "
            "Q2 guide >$87B. 22 beat en 24 trimestres."
        ),
    },

    # ── PROXIMOS (near: ~3 meses) ────────────────────────────────────────────
    {
        "fecha":       "Est. Jun-Jul 2026",
        "evento":      "Earnings Q1 — TGNO4 y TRAN",
        "tickers":     ["TGNO4", "TRAN"],
        "estado":      "near",
        "descripcion": "El mercado sigue el RTI mas que los resultados trimestrales.",
    },
    {
        "fecha":       "Est. Jul 2026",
        "evento":      "Earnings Q2 2026 — Alphabet",
        "tickers":     ["GOOGL"],
        "estado":      "near",
        "descripcion": "Ver si Cloud mantiene +60% o desacelera. Guia capex $175-185B clave.",
    },
    {
        "fecha":       "Est. Jul-Ago 2026",
        "evento":      "Earnings Q2 — Bloque AR",
        "tickers":     ["YPFD", "PAMP", "VIST", "TGSU2"],
        "estado":      "near",
        "descripcion": "Brent $85-90 favorece exportadoras.",
    },
    {
        "fecha":       "2026-08-26",
        "evento":      "Earnings Q2 FY27 — NVIDIA",
        "tickers":     ["NVDA"],
        "estado":      "near",
        "descripcion": "Q2 guide >$87B. Ciclo Blackwell. Bar muy alto.",
    },

    # ── ESTRUCTURALES ────────────────────────────────────────────────────────
    {
        "fecha":       "Q2-Q3 2026",
        "evento":      "RTI Gas Argentina — Definicion tarifaria",
        "tickers":     ["TGSU2", "TGNO4", "TRAN", "PAMP"],
        "estado":      "structural",
        "descripcion": "Mayor catalizador del bloque energetico AR en 2026.",
    },
    {
        "fecha":       "TBD 2026",
        "evento":      "Cierre adquisicion Equinor -> VIST",
        "tickers":     ["VIST"],
        "estado":      "structural",
        "descripcion": "EBITDA sube de $2,6B a $3,0B. Catalizador de rerating.",
    },
    {
        "fecha":       "TBD 2026",
        "evento":      "Venta 50% Citelec (PAMP -> TRAN)",
        "tickers":     ["PAMP", "TRAN"],
        "estado":      "structural",
        "descripcion": "Citelec cotizo $4.190 al 31/03/26. Inyeccion de capital.",
    },

    # ── LARGO PLAZO (far: 2027+) ─────────────────────────────────────────────
    {
        "fecha":       "2027-2028",
        "evento":      "Inicio produccion Pastos Grandes — LAR",
        "tickers":     ["LAR"],
        "estado":      "far",
        "descripcion": "4,8M t LCE. RIGI aprobado.",
    },
    {
        "fecha":       "2027-2030",
        "evento":      "VMOS + Argentina LNG — YPF",
        "tickers":     ["YPFD"],
        "estado":      "far",
        "descripcion": "VMOS 62% construccion. Primer exportador GNL LATAM proyectado.",
    },
]


def main():
    print("Inicializando Firebase...")
    init_firebase()
    db = firestore.client()

    ref = db.collection("users").document(UID).collection("catalysts").document("data")

    # Verificar estado previo
    snap = ref.get()
    if snap.exists:
        prev = snap.to_dict().get("proximos", [])
        print(f"Habia {len(prev)} catalizadores. Se reemplazan por {len(CATALYSTS)}.")
    else:
        print(f"Documento vacio. Se cargan {len(CATALYSTS)} catalizadores.")

    ref.set({"proximos": CATALYSTS})

    print("\nCargados:")
    for c in CATALYSTS:
        tickers = ", ".join(c.get("tickers", []))
        print(f"  [{c['estado']:10}] {c['fecha']:20} {c['evento'][:45]} ({tickers})")

    print(f"\nListo. Abre la app -> tab Catalizadores para verificar.")


if __name__ == "__main__":
    main()
