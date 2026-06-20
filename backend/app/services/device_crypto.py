"""Port a Python de la cripto device-encrypt del frontend (SEC-1 · F1).

Replica, del lado del BACKEND, las dos operaciones que hoy hace el dispositivo:

1. Desenvolver el keywrap (frontend: ``userKey.js``)
   - ``keywrap blob`` = ``{salt: b64, iterations: int, nonce: b64, wrappedDek: b64}``
   - KEK = PBKDF2-SHA256(secret, salt, iterations) -> clave AES-GCM de 256 bits.
   - ``wrappedDek`` = AES-GCM(KEK, nonce).encrypt(DEK de 32 bytes)  [ciphertext + tag].
   - El secret es la passphrase del usuario (o el recovery code normalizado).

2. Descifrar un documento Fernet (frontend: ``fernet.js``)
   - ``doc`` = ``{_encrypted: true, _enc_alg: 'fernet-v1', payload: <base64url SIN padding>}``
   - Fernet (AES-128-CBC + HMAC-SHA256, key de 32 bytes partida 16/16).
   - La key Fernet es ``base64url(DEK)`` (la DEK de 32 bytes desenvuelta en el paso 1).
   - OJO: ``fernet.js`` aplica ``pkcs7Pad`` MANUAL y, encima, WebCrypto AES-CBC agrega su
     propio PKCS7 -> los tokens quedan DOBLEMENTE padeados (no es Fernet 100% estándar).
     El Fernet de Python quita UNA capa; acá quitamos la segunda (la manual) a mano. No se
     puede "arreglar" el front sin romper el ciphertext ya guardado: el backend debe igualar.

Objetivo SEC-1: que el frontend deje de ver/descifrar credenciales. El backend
desenvuelve la DEK (con la passphrase que llega por ``/unlock``) y descifra las
credenciales del broker server-side. No se persiste passphrase ni DEK en claro.
"""
from __future__ import annotations

import base64
import json
from typing import Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Debe coincidir con el frontend (userKey.js / fernet.js).
_DEFAULT_ITERATIONS = 600_000          # OWASP 2023 para PBKDF2-SHA256
_ENCRYPTED_MARKER = "fernet-v1"


def unwrap_dek(blob: dict, secret: str) -> bytes:
    """Desenvuelve la DEK (32 bytes) de un sub-blob del keywrap.

    ``secret`` es la passphrase del usuario o el recovery code ya normalizado.
    Lanza si el secreto es incorrecto: AES-GCM es autenticado, no devuelve una
    DEK basura silenciosamente.
    """
    salt = base64.b64decode(blob["salt"])
    iterations = int(blob.get("iterations") or _DEFAULT_ITERATIONS)
    nonce = base64.b64decode(blob["nonce"])
    wrapped = base64.b64decode(blob["wrappedDek"])

    kdf = PBKDF2HMAC(algorithm=SHA256(), length=32, salt=salt, iterations=iterations)
    kek = kdf.derive(secret.encode("utf-8"))

    dek = AESGCM(kek).decrypt(nonce, wrapped, None)
    if len(dek) != 32:
        raise ValueError("DEK con tamaño inválido")
    return dek


def unwrap_dek_with_passphrase(keywrap: dict, passphrase: str) -> bytes:
    """Conveniencia: toma el doc completo ``/users/{uid}/keywrap/data`` y
    desenvuelve la DEK con la passphrase (sub-blob ``passphrase``)."""
    if not keywrap or "passphrase" not in keywrap:
        raise ValueError("Keywrap inválido o sin sub-blob 'passphrase'")
    return unwrap_dek(keywrap["passphrase"], passphrase)


def _pkcs7_unpad(data: bytes) -> bytes:
    """Quita una capa de relleno PKCS7 (espejo de ``pkcs7Unpad`` en fernet.js)."""
    if not data:
        raise ValueError("Datos vacíos al des-padear")
    pad = data[-1]
    if pad < 1 or pad > 16 or pad > len(data):
        raise ValueError("Padding PKCS7 inválido")
    if data[-pad:] != bytes([pad]) * pad:
        raise ValueError("Padding PKCS7 inválido")
    return data[:-pad]


def fernet_decrypt(document: dict, dek: bytes) -> Any:
    """Descifra un documento ``{_encrypted, _enc_alg, payload}`` con la DEK.

    Devuelve el objeto JSON descifrado. Si el documento no está cifrado, lo
    devuelve tal cual (espejo de ``decryptPayload`` en el frontend).
    """
    if not document:
        return {}
    if not document.get("_encrypted"):
        return document
    if document.get("_enc_alg") != _ENCRYPTED_MARKER:
        raise ValueError("Algoritmo de cifrado no soportado")

    payload = document.get("payload")
    if not isinstance(payload, str):
        raise ValueError("Documento cifrado sin payload")

    # El front emite base64url SIN padding; Fernet (Python) lo requiere.
    token = (payload + "=" * (-len(payload) % 4)).encode("ascii")
    key = base64.urlsafe_b64encode(dek)  # DEK de 32 bytes -> key Fernet
    # Fernet de Python quita una capa de PKCS7; el front padea dos veces (ver docstring),
    # así que removemos la capa manual restante antes de parsear el JSON.
    raw = _pkcs7_unpad(Fernet(key).decrypt(token))
    return json.loads(raw.decode("utf-8"))
