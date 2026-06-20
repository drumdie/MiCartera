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

from app.services.device_crypto import unwrap_dek_with_passphrase
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
