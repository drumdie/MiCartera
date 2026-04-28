"""
Router de stress test.

GET /api/stress
  Lee el portfolio del usuario desde Firestore y calcula el stress test
  al vuelo. No guarda el resultado en Firestore (es computación pura).

El uid viene de request.state.uid (inyectado por FirebaseAuthMiddleware).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from firebase_admin import firestore

from app.services.stress_calculator import calculate_stress_test
from app.models.stress import StressTest

router = APIRouter(prefix="/api/stress", tags=["stress"])


@router.get("", response_model=StressTest)
async def get_stress_test(request: Request):
    """
    Calcula y devuelve el stress test del portfolio del usuario autenticado.
    Lee las posiciones actuales desde Firestore y aplica los escenarios definidos.
    """
    uid = request.state.uid
    db  = firestore.client()

    # Reconstruir el portfolio desde Firestore (mismo esquema que el frontend)
    categorias = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]
    portfolio: dict = {}

    port_ref = db.collection("users").document(uid).collection("portfolio")
    for cat in categorias:
        snap = port_ref.document(cat).get()
        portfolio[cat] = snap.to_dict() if snap.exists else {"posiciones": [], "subtotal_ars": 0}

    if all(portfolio[c].get("subtotal_ars", 0) == 0 for c in categorias):
        raise HTTPException(
            status_code=404,
            detail="Portfolio vacío o no sincronizado. Ejecutá /api/portfolio/sync primero.",
        )

    return calculate_stress_test(portfolio)
