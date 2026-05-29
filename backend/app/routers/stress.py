"""
Router de stress test.

GET /api/stress
  Lee el portfolio del usuario desde Firestore y calcula el stress test
  al vuelo. No guarda el resultado en Firestore (es computación pura).

El uid viene de request.state.uid (inyectado por FirebaseAuthMiddleware).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.services.stress_calculator import calculate_stress_test
from app.models.stress import StressTest
from app.routers.portfolio import read_user_portfolio

router = APIRouter(prefix="/api/stress", tags=["stress"])


@router.get("", response_model=StressTest)
async def get_stress_test(request: Request):
    """
    Calcula y devuelve el stress test del portfolio del usuario autenticado.
    Lee las posiciones actuales desde Firestore y aplica los escenarios definidos.
    """
    uid = request.state.uid
    categorias = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]
    portfolio = read_user_portfolio(uid)

    if all(portfolio[c].get("subtotal_ars", 0) == 0 for c in categorias):
        raise HTTPException(
            status_code=404,
            detail="Portfolio vacío o no sincronizado. Ejecutá /api/portfolio/sync primero.",
        )

    return calculate_stress_test(portfolio)
