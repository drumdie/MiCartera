"""
Router de precios y cotizaciones.

GET /api/prices/cotizaciones
  Lee el documento /market/cotizaciones de Firestore y lo devuelve.
  Si no existe (primera vez), hace polling manual a PPI y BCRA.

GET /api/prices/refresh
  Fuerza un polling inmediato de cotizaciones (sin esperar el scheduler de 60s).
  Útil para pruebas o cuando el usuario quiere datos frescos manualmente.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone, date, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request
from firebase_admin import firestore

from app.models.market import Cotizaciones

router = APIRouter(prefix="/api/prices", tags=["prices"])

# URL pública de la API del BCRA (sin auth)
_BCRA_BASE = "https://api.bcra.gob.ar/estadisticas/v2.0"

# Códigos de variables BCRA
_VAR_DOLAR_BNA    = 1   # Tipo de cambio de referencia (BNA)
_VAR_DOLAR_OFICIAL = 4  # Tipo de cambio mayorista
_VAR_RIESGO_PAIS  = 5   # EMBI+


async def _fetch_bcra_variable(var_id: int) -> float:
    """
    Obtiene el valor más reciente de una variable BCRA.
    Consulta los últimos 7 días para cubrir fines de semana y feriados.
    """
    until = date.today()
    since = until - timedelta(days=7)
    url = f"{_BCRA_BASE}/datosvariable/{var_id}/{since}/{until}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url)
            if resp.is_success:
                results = resp.json().get("results", [])
                if results:
                    return float(results[-1].get("valor", 0))
    except Exception as exc:
        print(f"[BCRA] Error var {var_id}: {exc}")
    return 0.0


async def _fetch_dolarapi(slug: str) -> float:
    """
    Obtiene el promedio compra/venta de dolarapi.com.
    slug: "bolsa" (MEP) | "contadoconliqui" (CCL)
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"https://dolarapi.com/v1/dolares/{slug}")
            if resp.is_success:
                data = resp.json()
                compra = float(data.get("compra") or 0)
                venta  = float(data.get("venta")  or 0)
                if compra > 0 and venta > 0:
                    return round((compra + venta) / 2, 2)
    except Exception as exc:
        print(f"[DOLARAPI] Error {slug}: {exc}")
    return 0.0


async def _build_cotizaciones() -> dict:
    """Obtiene todas las cotizaciones y construye el documento para Firestore."""
    # dolarapi.com → MEP y CCL (promedio compra/venta)
    mep, ccl = await asyncio.gather(
        _fetch_dolarapi("bolsa"),
        _fetch_dolarapi("contadoconliqui"),
    )

    # BCRA → BNA, Oficial y Riesgo País (APIs públicas, sin credenciales)
    bna        = await _fetch_bcra_variable(_VAR_DOLAR_BNA)
    oficial    = await _fetch_bcra_variable(_VAR_DOLAR_OFICIAL)
    riesgo_raw = await _fetch_bcra_variable(_VAR_RIESGO_PAIS)

    return {
        "dolar_mep":            mep,
        "dolar_ccl":            ccl,
        "dolar_bna":            bna,
        "dolar_oficial":        oficial,
        "riesgo_pais_pb":       int(riesgo_raw),
        "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/cotizaciones", response_model=Cotizaciones)
async def get_cotizaciones(request: Request):
    """
    Devuelve las cotizaciones actuales desde Firestore.
    El scheduler de Cloud Functions las actualiza cada 60s automáticamente.
    """
    db  = firestore.client()
    doc = db.collection("market").document("cotizaciones").get()

    if not doc.exists:
        raise HTTPException(
            status_code=503,
            detail="Cotizaciones no disponibles aún. El scheduler aún no ha corrido.",
        )

    return doc.to_dict()


@router.post("/refresh")
async def refresh_cotizaciones(request: Request):
    """
    Fuerza un polling inmediato de cotizaciones (solo admin o usuarios autenticados).
    Escribe en /market/cotizaciones y devuelve los valores frescos.
    """
    data = await _build_cotizaciones()

    db = firestore.client()
    db.collection("market").document("cotizaciones").set(data)

    return {"status": "ok", "cotizaciones": data}
