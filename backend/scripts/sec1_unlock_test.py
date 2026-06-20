"""SEC-1 · F1b — Test del SessionStore + lógica de unlock (sin HTTP/Firestore).

- Verifica InProcessSessionStore: set/get/clear y expiración por TTL.
- Verifica el flujo de unlock end-to-end a nivel lógica: keywrap (vector descartable)
  + passphrase -> DEK -> guardada en el store -> recuperable. Y que una passphrase
  incorrecta lanza (el router lo mapea a 401).

NO levanta el server ni toca Firestore: eso se valida en F1c corriendo la app real.

Uso (desde backend/):  .venv\\Scripts\\python.exe scripts\\sec1_unlock_test.py
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from app.services.device_crypto import unwrap_dek_with_passphrase  # noqa: E402
from app.services.session_store import InProcessSessionStore  # noqa: E402


def _load_vector() -> dict:
    out = subprocess.run(
        ["node", os.path.join(HERE, "sec1_devicecrypto_vector.mjs")],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def main() -> int:
    # 1. SessionStore: set/get/clear + expiración.
    store = InProcessSessionStore()
    dek_a = b"\x01" * 32
    store.set("u1", dek_a, ttl=300)
    assert store.get("u1") == dek_a, "get debería devolver la DEK recién guardada"
    store.set("u2", b"\x02" * 32, ttl=0)  # expira de inmediato
    assert store.get("u2") is None, "una entrada con ttl=0 debe expirar"
    store.clear("u1")
    assert store.get("u1") is None, "clear debe borrar la entrada"
    print("[OK] SessionStore set/get/clear/expiry")

    # 2. Flujo unlock (lógica): keywrap + passphrase -> DEK -> store.
    vec = _load_vector()
    keywrap = {"passphrase": vec["keywrap_blob"]}  # forma del doc /keywrap/data
    dek = unwrap_dek_with_passphrase(keywrap, vec["passphrase"])
    store.set("user", dek, ttl=300)
    assert store.get("user") == dek, "la DEK desbloqueada debe quedar en el store"
    print("[OK] unlock: keywrap + passphrase -> DEK en SessionStore")

    # 3. Passphrase incorrecta -> excepción (=> el router responde 401).
    try:
        unwrap_dek_with_passphrase(keywrap, "passphrase-incorrecta")
    except Exception:
        print("[OK] passphrase incorrecta -> excepción (=> 401)")
    else:
        print("[FAIL] passphrase incorrecta NO lanzó")
        return 1

    print("\nF1b OK: SessionStore + lógica de unlock verificados (falta el e2e por la app en F1c).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
