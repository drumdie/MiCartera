"""
Script de utilidad: limpia el caché de avg_costs en Firestore para todos
los usuarios, forzando que el próximo sync desde la app sea full_5y.

Uso desde PowerShell:
    cd backend
    .venv\Scripts\python.exe force_full_sync.py

Después abrís la app y hacés sync normalmente — va a tardar ~15s (full_5y).
"""
import sys
import os

# Resolver rutas desde el directorio del script
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from app.core.firebase_admin_init import init_firebase
from firebase_admin import firestore, auth

def main():
    print("Inicializando Firebase Admin SDK...")
    init_firebase()

    db  = firestore.client()

    # Listar todos los usuarios de Firebase Auth
    print("Buscando usuarios...")
    page = auth.list_users()
    users = []
    while page:
        for u in page.users:
            users.append(u)
        page = page.get_next_page()

    if not users:
        print("No se encontraron usuarios.")
        return

    # Mostrar usuarios y dejar elegir si hay más de uno
    if len(users) == 1:
        uid = users[0].uid
        print(f"Usuario: {users[0].email} ({uid})")
    else:
        for i, u in enumerate(users):
            print(f"  [{i}] {u.email} ({u.uid})")
        idx = int(input("Elegí el número de usuario: "))
        uid = users[idx].uid

    # Borrar el documento avg_costs de Firestore
    ref = db.collection("users").document(uid).collection("meta").document("avg_costs")
    snap = ref.get()
    if snap.exists:
        ref.delete()
        print(f"\n✅ Caché avg_costs eliminado para {uid}")
        print("   El próximo sync desde la app va a recalcular todo desde 5 años (full_5y).")
    else:
        print(f"\n⚠️  No existía caché avg_costs para {uid} — ya era full sync.")

if __name__ == "__main__":
    main()
