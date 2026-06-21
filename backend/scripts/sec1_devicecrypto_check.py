"""SEC-1 · F1a — Verificación cross-language JS -> Python (descartable).

Corre el generador Node (sec1_devicecrypto_vector.mjs), que cifra un keywrap + un
documento Fernet con primitivas idénticas al frontend, y comprueba que el port de
Python (app/services/device_crypto.py) los descifra correctamente.

NO usa datos reales del usuario: la passphrase y el payload son de juguete.

Uso (desde backend/):  .venv\\Scripts\\python.exe scripts\\sec1_devicecrypto_check.py
"""
import base64
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.join(HERE, "..")
sys.path.insert(0, BACKEND_ROOT)

from app.services.device_crypto import fernet_decrypt, fernet_encrypt, unwrap_dek  # noqa: E402


def _load_vector() -> dict:
    out = subprocess.run(
        ["node", os.path.join(HERE, "sec1_devicecrypto_vector.mjs")],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


def main() -> int:
    vec = _load_vector()

    # 1. La passphrase correcta desenvuelve la misma DEK que usó el front.
    dek = unwrap_dek(vec["keywrap_blob"], vec["passphrase"])
    dek_b64 = base64.b64encode(dek).decode()
    assert dek_b64 == vec["dek_b64"], f"DEK mismatch:\n  py = {dek_b64}\n  js = {vec['dek_b64']}"
    print("[OK] unwrap_dek -> la DEK coincide con la de JS")

    # 2. La DEK descifra el documento Fernet generado por el front.
    payload = fernet_decrypt(vec["broker_doc"], dek)
    assert payload == vec["expected_payload"], f"payload mismatch:\n  py = {payload}\n  js = {vec['expected_payload']}"
    print("[OK] fernet_decrypt -> el payload coincide con el de JS")

    # 3. Una passphrase incorrecta DEBE fallar (AES-GCM autenticado).
    try:
        unwrap_dek(vec["keywrap_blob"], "passphrase-incorrecta")
    except Exception:
        print("[OK] passphrase incorrecta -> falla (AES-GCM rechaza)")
    else:
        print("[FAIL] passphrase incorrecta NO falló")
        return 1

    # 4. Python ENCRYPT -> JS DECRYPT: el front puede leer lo que cifra el backend.
    sample = {"hola": "mundo", "api_key": "abc=", "n": 3}
    doc = fernet_encrypt(sample, dek)
    out = subprocess.run(
        ["node", os.path.join(HERE, "sec1_devicecrypto_vector.mjs"), "decrypt", vec["dek_b64"], doc["payload"]],
        capture_output=True, text=True, check=True,
    )
    assert json.loads(out.stdout) == sample, f"JS no pudo leer lo que cifró Python: {out.stdout}"
    print("[OK] fernet_encrypt (Python) -> el front (JS) lo descifra")

    print("\nF1a OK: Python y el frontend (JS) cifran/descifran en el mismo formato (ida y vuelta).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
