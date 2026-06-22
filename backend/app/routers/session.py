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
from app.services.ppi_client import PPIError
from app.services.broker_client import BrokerCredentials, get_broker_client
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


@router.post("/lock")
def lock(request: Request):
    """Descarta la DEK de la sesión. La llama el front al bloquearse por inactividad (3 min),
    para no esperar al TTL. Idempotente."""
    session_store.clear(request.state.uid)
    return {"status": "locked"}


@router.post("/verify-broker")
async def verify_broker(request: Request):
    """SEC-1 · F1c / BROKER-ABS — Prueba el modelo backend-managed de punta a punta.

    Con la DEK ya desbloqueada (SessionStore), descifra server-side las credenciales
    del broker (/users/{uid}/broker/data), resuelve el adaptador por ``broker_type``
    (default ``ppi``) y hace login. Es diagnóstico y semilla de F2 (el sync server-side).
    No expone credenciales al cliente.
    """
    uid = request.state.uid
    dek = session_store.get(uid)
    if dek is None:
        raise HTTPException(status_code=401, detail="needs_unlock")

    db = firestore.client()
    snap = (
        db.collection("users").document(uid)
        .collection("broker").document("data").get()
    )
    if not snap.exists:
        raise HTTPException(status_code=404, detail="No hay credenciales del broker guardadas")

    raw = snap.to_dict()
    broker_type_outer = str(raw.get("broker_type", "")).strip() or None
    try:
        creds_dict = fernet_decrypt(raw, dek)
    except Exception:
        logger.info("verify-broker: no se pudieron descifrar las creds uid=%s", uid)
        raise HTTPException(status_code=500, detail="No se pudieron descifrar las credenciales")

    broker = get_broker_client(
        BrokerCredentials.from_dict(creds_dict, broker_type=broker_type_outer)
    )

    try:
        positions = await broker.get_account_positions()
    except PPIError as exc:
        logger.warning("verify-broker: broker rechazó uid=%s: %s", uid, exc)
        return {"ok": False, "login": False, "posiciones": 0, "error": "El broker rechazó las credenciales"}
    except Exception as exc:  # noqa: BLE001 — no propagar detalle del broker al cliente (P0.2)
        logger.warning("verify-broker: error consultando broker uid=%s: %s", uid, exc)
        return {"ok": False, "login": False, "posiciones": 0, "error": "Error al consultar el broker"}

    return {"ok": True, "login": True, "posiciones": len(positions)}
