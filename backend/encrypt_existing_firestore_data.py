"""
Migra datos sensibles existentes a documentos cifrados en Firestore.

Uso:
    cd backend
    .venv\\Scripts\\python.exe encrypt_existing_firestore_data.py

Requiere DATA_ENCRYPTION_KEY configurada en backend/.env.
No llama a PPI: solo cifra documentos existentes de portfolio y meta sensibles.
"""
from __future__ import annotations

import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from app.core.firebase_admin_init import init_firebase
from app.services.encryption import encrypt_payload, is_encrypted_document
from firebase_admin import auth, firestore

PORTFOLIO_CATS = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]
SENSITIVE_META_DOCS = ["avg_costs", "portfolio_history"]


def _encrypt_doc_if_needed(ref, label: str) -> bool:
    snap = ref.get()
    if not snap.exists:
        print(f"- {label}: no existe")
        return False

    data = snap.to_dict() or {}
    if is_encrypted_document(data):
        print(f"- {label}: ya cifrado")
        return False

    ref.set(encrypt_payload(data))
    print(f"- {label}: cifrado")
    return True


def main() -> None:
    init_firebase()
    db = firestore.client()

    users = []
    page = auth.list_users()
    while page:
        users.extend(page.users)
        page = page.get_next_page()

    if not users:
        print("No se encontraron usuarios.")
        return

    total = 0
    for user in users:
        uid = user.uid
        label = user.email or uid
        print(f"\nUsuario: {label}")
        user_ref = db.collection("users").document(uid)

        for cat in PORTFOLIO_CATS:
            changed = _encrypt_doc_if_needed(
                user_ref.collection("portfolio").document(cat),
                f"portfolio/{cat}",
            )
            total += int(changed)

        for doc_id in SENSITIVE_META_DOCS:
            changed = _encrypt_doc_if_needed(
                user_ref.collection("meta").document(doc_id),
                f"meta/{doc_id}",
            )
            total += int(changed)

    print(f"\nDocumentos cifrados en esta corrida: {total}")


if __name__ == "__main__":
    main()
