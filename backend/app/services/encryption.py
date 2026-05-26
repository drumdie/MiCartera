from __future__ import annotations

import base64
import hashlib
import json
from functools import lru_cache
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_ENCRYPTED_MARKER = "fernet-v1"


class EncryptionNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _build_fernet() -> Fernet:
    """
    Construye (y cachea) la instancia Fernet desde DATA_ENCRYPTION_KEY.
    Se evalúa una sola vez por proceso — evita recalcular SHA-256 en cada
    lectura/escritura de Firestore durante un sync.
    Acepta tanto una Fernet key válida (44 chars base64) como cualquier string
    arbitrario (se deriva vía SHA-256).
    """
    raw_key = settings.DATA_ENCRYPTION_KEY.strip()
    if not raw_key:
        raise EncryptionNotConfigured("DATA_ENCRYPTION_KEY no configurada")

    try:
        return Fernet(raw_key.encode("utf-8"))
    except Exception:
        digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
        derived = base64.urlsafe_b64encode(digest)
        return Fernet(derived)


def encrypt_payload(payload: dict[str, Any]) -> dict[str, Any]:
    fernet = _build_fernet()
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    token = fernet.encrypt(raw.encode("utf-8")).decode("utf-8")
    return {
        "_encrypted": True,
        "_enc_alg": _ENCRYPTED_MARKER,
        "payload": token,
    }


def decrypt_payload(document: dict[str, Any] | None) -> dict[str, Any]:
    if not document:
        return {}
    if not document.get("_encrypted"):
        return document

    if document.get("_enc_alg") != _ENCRYPTED_MARKER:
        raise ValueError("Algoritmo de cifrado no soportado")

    token = document.get("payload")
    if not isinstance(token, str) or not token:
        raise ValueError("Documento cifrado sin payload")

    try:
        raw = _build_fernet().decrypt(token.encode("utf-8"))
    except InvalidToken as exc:
        raise ValueError("No se pudo desencriptar el documento") from exc
    return json.loads(raw.decode("utf-8"))


def is_encrypted_document(document: dict[str, Any] | None) -> bool:
    return bool(document and document.get("_encrypted") is True)
