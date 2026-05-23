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
from fastapi import APIRouter, HTTPException, Request, status
from firebase_admin import firestore

from app.models.market import Cotizaciones
from app.services.ppi_client import ppi_client

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


async def _fetch_riesgo_pais() -> int:
    """
    Riesgo país (EMBI+ Argentina) en puntos básicos.
    Fuente primaria: BCRA variable 5.
    Fallback: api.argentinadatos.com (actualizado diariamente).
    """
    # Intento 1: BCRA
    valor = await _fetch_bcra_variable(_VAR_RIESGO_PAIS)
    if valor > 0:
        return int(valor)

    # Intento 2: argentinadatos.com
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais")
            if resp.is_success:
                data = resp.json()
                # Devuelve lista [{fecha, valor}] ordenada por fecha ASC
                if isinstance(data, list) and data:
                    return int(data[-1].get("valor", 0))
    except Exception as exc:
        print(f"[ARGENTINADATOS] Error riesgo país: {exc}")
    return 0


async def _build_cotizaciones() -> dict:
    """
    Obtiene todas las cotizaciones y construye el documento para Firestore.

    Fuentes por tipo de cambio:
      MEP:     PPI (AL30÷AL30D)     → más preciso para el usuario de PPI
      CCL:     PPI (GD30÷GD30D)     → ídem
      BNA:     BCRA variable 1      → fuente oficial
      Oficial: BCRA variable 4      → fuente oficial
      RP:      BCRA var 5 / argentinadatos.com

    Cuando el mercado está cerrado (fin de semana), PPI devuelve 0 y
    el endpoint /refresh preserva el último valor conocido de Firestore.
    """
    # MEP y CCL desde PPI (tipo de cambio implícito de bonos, coincide con el broker)
    mep, ccl = await asyncio.gather(
        _safe_ppi_dolar(ppi_client.get_dolar_mep),
        _safe_ppi_dolar(ppi_client.get_dolar_ccl),
    )

    # Fallback dolarapi.com para cuando el mercado está cerrado
    if mep <= 0:
        mep = await _fetch_dolarapi("bolsa")
    if ccl <= 0:
        ccl = await _fetch_dolarapi("contadoconliqui")

    # BNA y Oficial: solo BCRA los publica (PPI no los expone)
    bna, oficial, riesgo = await asyncio.gather(
        _fetch_bcra_variable(_VAR_DOLAR_BNA),
        _fetch_bcra_variable(_VAR_DOLAR_OFICIAL),
        _fetch_riesgo_pais(),
    )

    return {
        "dolar_mep":            mep,
        "dolar_ccl":            ccl,
        "dolar_bna":            bna,
        "dolar_oficial":        oficial,
        "riesgo_pais_pb":       riesgo,
        "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
    }


async def _safe_ppi_dolar(fn) -> float:
    """Llama a una función de ppi_client y retorna 0.0 si falla."""
    try:
        return await fn()
    except Exception:
        return 0.0


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


_REFRESH_COOLDOWN_SEC = 30   # segundos mínimos entre refreshes manuales


@router.post("/refresh")
async def refresh_cotizaciones(request: Request):
    """
    Fuerza un polling inmediato de cotizaciones (usuarios autenticados).
    Cooldown de 30s entre refreshes para evitar abuso de las APIs externas.
    Escribe en /market/cotizaciones y devuelve los valores frescos.

    Si alguna fuente no responde (ej: mercado cerrado en fin de semana),
    preserva el último valor conocido de Firestore en lugar de escribir 0.
    Así el MEP del viernes permanece hasta que vuelva a abrirse el mercado.
    """
    db = firestore.client()
    ref = db.collection("market").document("cotizaciones")

    # Leer valores previos como fallback antes de actualizar
    existing_snap = ref.get()
    existing = existing_snap.to_dict() if existing_snap.exists else {}

    # Rate limiting: evitar que cualquier usuario autenticado martille las APIs externas.
    # Si la última actualización fue hace menos de 30s, devolver el dato cacheado.
    last_update = existing.get("ultima_actualizacion", "")
    if last_update:
        try:
            last_dt = datetime.fromisoformat(last_update.replace("Z", "+00:00"))
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            if elapsed < _REFRESH_COOLDOWN_SEC:
                return {"status": "ok", "cotizaciones": existing, "cached": True}
        except Exception:
            pass  # Si el timestamp es inválido, proceder con el refresh

    data = await _build_cotizaciones()

    # Para cada campo numérico: si la fuente devolvió 0, preservar el último valor conocido
    _NUMERIC_FIELDS = ["dolar_mep", "dolar_ccl", "dolar_bna", "dolar_oficial", "riesgo_pais_pb"]
    for field in _NUMERIC_FIELDS:
        if not data.get(field) and existing.get(field):
            data[field] = existing[field]

    ref.set(data)
    return {"status": "ok", "cotizaciones": data}
