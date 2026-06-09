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

from app.core.config import settings
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
    Fuente primaria: api.argentinadatos.com (coincide con infobae/ámbito; ~1-2 días
    hábiles de rezago). Es la MISMA serie que usamos para el mínimo histórico, así que
    el valor mostrado y el "mín desde" quedan consistentes.
    Fallback: BCRA variable 5 (suele estar más desfasada del valor de mercado).
    """
    # Intento 1: argentinadatos.com (último punto de la serie)
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais")
            if resp.is_success:
                data = resp.json()
                # Devuelve lista [{fecha, valor}] ordenada por fecha ASC
                if isinstance(data, list) and data:
                    valor = int(data[-1].get("valor", 0) or 0)
                    if valor > 0:
                        return valor
    except Exception as exc:
        print(f"[ARGENTINADATOS] Error riesgo país: {exc}")

    # Intento 2 (fallback): BCRA variable 5
    valor = await _fetch_bcra_variable(_VAR_RIESGO_PAIS)
    if valor > 0:
        return int(valor)
    return 0


# Nombres de meses en español para formatear la fecha del mínimo
_MESES_ES = {
    1: "ene", 2: "feb", 3: "mar", 4: "abr",
    5: "may", 6: "jun", 7: "jul", 8: "ago",
    9: "sep", 10: "oct", 11: "nov", 12: "dic",
}


def _calcular_minimo_riesgo_pais(serie: list[dict], valor_actual: int) -> tuple[int | None, str | None]:
    """
    Dada la serie histórica [{fecha: str, valor: number}, ...] ordenada ASC
    y el valor actual, calcula:
      - riesgo_pais_min: el mínimo del período reciente (= el valor actual, que
        es el más bajo del tramo en que no estuvo más bajo)
      - riesgo_pais_min_desde: mes/año desde el cual el valor no había sido tan
        bajo (ej: "feb 2026"). Se determina buscando el tramo más reciente en que
        el valor se mantuvo >= al actual; "desde" = el primer mes de ese tramo.

    Retorna (None, None) si la serie está vacía o tiene menos de 2 puntos.
    """
    if not serie or len(serie) < 2:
        return None, None

    # Filtrar entradas válidas
    puntos = []
    for entrada in serie:
        try:
            fecha_str = entrada.get("fecha", "")
            valor = int(entrada.get("valor", 0) or 0)
            if fecha_str and valor > 0:
                puntos.append((fecha_str, valor))
        except (ValueError, TypeError):
            continue

    if not puntos:
        return None, None

    # Tramo más reciente en que el valor se mantuvo SIEMPRE >= al actual (sin haber
    # estado más bajo). El "desde" = fecha del primer punto de ese tramo; el mínimo
    # del tramo es, por construcción, el propio valor_actual.
    fecha_desde_str = puntos[-1][0]
    for fecha_str, valor in reversed(puntos[:-1]):  # excluir el último (= valor actual)
        if valor < valor_actual:
            break
        fecha_desde_str = fecha_str

    # Formatear como "feb 2026" usando la fecha real del inicio del tramo
    # (sin aritmética de meses → nunca cae en un mes futuro).
    try:
        anio_f, mes_f = int(fecha_desde_str[:4]), int(fecha_desde_str[5:7])
        min_desde = f"{_MESES_ES.get(mes_f, str(mes_f))} {anio_f}"
    except Exception:
        min_desde = fecha_desde_str

    return valor_actual, min_desde


async def _fetch_riesgo_pais_historico() -> tuple[int | None, str | None]:
    """
    Descarga la serie histórica de riesgo país desde argentinadatos.com
    y calcula riesgo_pais_min y riesgo_pais_min_desde.
    Retorna (None, None) si falla o no hay datos suficientes.
    """
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(
                "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais"
            )
            if not resp.is_success:
                print(f"[ARGENTINADATOS] Serie histórica HTTP {resp.status_code}")
                return None, None

            serie = resp.json()
            if not isinstance(serie, list) or len(serie) < 2:
                print("[ARGENTINADATOS] Serie histórica vacía o insuficiente")
                return None, None

            # Valor actual = último punto de la serie (ordenada ASC)
            try:
                valor_actual = int(serie[-1].get("valor", 0) or 0)
            except (ValueError, TypeError):
                return None, None

            if valor_actual <= 0:
                return None, None

            return _calcular_minimo_riesgo_pais(serie, valor_actual)

    except Exception as exc:
        print(f"[ARGENTINADATOS] Error descargando serie histórica: {exc}")
        return None, None


async def _build_cotizaciones() -> dict:
    """
    Obtiene todas las cotizaciones y construye el documento para Firestore.

    Fuentes por tipo de cambio:
      MEP:     PPI (AL30÷AL30D)     → más preciso para el usuario de PPI
      CCL:     PPI (GD30÷GD30D)     → ídem
      BNA:     BCRA variable 1      → fuente oficial
      Oficial: BCRA variable 4      → fuente oficial
      RP:      BCRA var 5 / argentinadatos.com (actual)
      RP hist: argentinadatos.com (serie completa → min + min_desde)

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

    # BNA, Oficial, Riesgo país actual y serie histórica en paralelo
    bna, oficial, riesgo, (rp_min, rp_min_desde) = await asyncio.gather(
        _fetch_bcra_variable(_VAR_DOLAR_BNA),
        _fetch_bcra_variable(_VAR_DOLAR_OFICIAL),
        _fetch_riesgo_pais(),
        _fetch_riesgo_pais_historico(),
    )

    doc: dict = {
        "dolar_mep":            mep,
        "dolar_ccl":            ccl,
        "dolar_bna":            bna,
        "dolar_oficial":        oficial,
        "riesgo_pais_pb":       riesgo,
        "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
    }

    # Campos históricos: solo se escriben si el cálculo tuvo éxito
    if rp_min is not None:
        doc["riesgo_pais_min"] = rp_min
    if rp_min_desde is not None:
        doc["riesgo_pais_min_desde"] = rp_min_desde

    return doc


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
    Fuerza un polling inmediato de cotizaciones.
    Solo el administrador (ADMIN_UID en .env) puede invocar este endpoint.
    Cooldown de 30s entre refreshes para evitar abuso de las APIs externas.
    Escribe en /market/cotizaciones y devuelve los valores frescos.

    Si alguna fuente no responde (ej: mercado cerrado en fin de semana),
    preserva el último valor conocido de Firestore en lugar de escribir 0.
    Así el MEP del viernes permanece hasta que vuelva a abrirse el mercado.
    """
    if settings.ADMIN_UID and request.state.uid != settings.ADMIN_UID:
        raise HTTPException(status_code=403, detail="No autorizado")

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

    # Campos históricos: si el cálculo falló esta vez, preservar el valor previo de Firestore
    for field in ["riesgo_pais_min", "riesgo_pais_min_desde"]:
        if data.get(field) is None and existing.get(field) is not None:
            data[field] = existing[field]

    ref.set(data)
    return {"status": "ok", "cotizaciones": data}
