"""Router de sesión / desbloqueo de la DEK (SEC-1 · F1b).

POST /api/session/unlock   { passphrase }
  - Carga /users/{uid}/keywrap/data (Admin SDK)
  - Desenvuelve la DEK con la passphrase (device_crypto.unwrap_dek_with_passphrase)
  - La cachea en el SessionStore con TTL corto
  - Passphrase incorrecta o sin keywrap → 401 (mismo mensaje, no se filtra estado)

GET  /api/session/status
  - { unlocked: bool } — para que el cliente sepa si necesita re-desbloquear

La passphrase llega por el flujo normal de la app (prompt de AuthGate). El backend
NO la persiste ni la loguea. El uid viene de request.state.uid (FirebaseAuthMiddleware).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from firebase_admin import firestore
from pydantic import BaseModel

from app.services.device_crypto import fernet_decrypt, unwrap_dek_with_passphrase
from app.services.ppi_client import PPICredentials, PPIError, ppi_client
from app.services.session_store import DEFAULT_TTL_SECONDS, session_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/session", tags=["session"])


class UnlockRequest(BaseModel):
    passphrase: str


@router.post("/unlock")
def unlock(request: Request, body: UnlockRequest):
    uid = request.state.uid
    if not body.passphrase:
        raise HTTPException(status_code=400, detail="Passphrase requerida")

    db = firestore.client()
    snap = (
        db.collection("users").document(uid)
        .collection("keywrap").document("data").get()
    )
    if not snap.exists:
        # Sin clave configurada: mismo 401 que passphrase incorrecta (no filtrar estado).
        logger.info("unlock: sin keywrap para uid=%s", uid)
        raise HTTPException(status_code=401, detail="No se pudo desbloquear")

    try:
        dek = unwrap_dek_with_passphrase(snap.to_dict(), body.passphrase)
    except Exception:
        # AES-GCM falla si la passphrase es incorrecta. NO se loguea la passphrase.
        logger.info("unlock: passphrase incorrecta uid=%s", uid)
        raise HTTPException(status_code=401, detail="No se pudo desbloquear")

    session_store.set(uid, dek, DEFAULT_TTL_SECONDS)
    logger.info("unlock OK uid=%s ttl=%ss", uid, DEFAULT_TTL_SECONDS)
    return {"status": "unlocked", "ttl_seconds": DEFAULT_TTL_SECONDS}


@router.get("/status")
def status(request: Request):
    return {"unlocked": session_store.get(request.state.uid) is not None}


@router.post("/verify-broker")
async def verify_broker(request: Request):
    """SEC-1 · F1c — Prueba el modelo backend-managed de punta a punta.

    Con la DEK ya desbloqueada (SessionStore), descifra server-side las credenciales
    del broker (/users/{uid}/broker/data) y hace login PPI. Es diagnóstico y semilla
    de F2 (el sync server-side). No expone credenciales al cliente.
    """
    uid = request.state.uid
    dek = session_store.get(uid)
    if dek is None:
        raise HTTPException(status_code=401, detail="Sesión bloqueada: desbloqueá con tu passphrase")

    db = firestore.client()
    snap = (
        db.collection("users").document(uid)
        .collection("broker").document("data").get()
    )
    if not snap.exists:
        raise HTTPException(status_code=404, detail="No hay credenciales del broker guardadas")

    try:
        creds_dict = fernet_decrypt(snap.to_dict(), dek)
    except Exception:
        logger.info("verify-broker: no se pudieron descifrar las creds uid=%s", uid)
        raise HTTPException(status_code=500, detail="No se pudieron descifrar las credenciales")

    creds = PPICredentials(
        authorized_client=str(creds_dict.get("authorized_client", "")).strip(),
        client_key=str(creds_dict.get("client_key", "")).strip(),
        api_key=str(creds_dict.get("api_key", "")).strip(),
        api_secret=str(creds_dict.get("api_secret", "")).strip(),
        account_number=str(creds_dict.get("account_number", "")).strip(),
    )

    try:
        positions = await ppi_client.get_account_positions(credentials=creds)
    except PPIError as exc:
        logger.warning("verify-broker: PPI rechazó uid=%s: %s", uid, exc)
        return {"ok": False, "login": False, "posiciones": 0, "error": "PPI rechazó las credenciales"}
    except Exception as exc:  # noqa: BLE001 — no propagar detalle del broker al cliente (P0.2)
        logger.warning("verify-broker: error consultando PPI uid=%s: %s", uid, exc)
        return {"ok": False, "login": False, "posiciones": 0, "error": "Error al consultar PPI"}

    return {"ok": True, "login": True, "posiciones": len(positions)}
