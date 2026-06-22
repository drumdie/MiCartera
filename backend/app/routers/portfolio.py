"""
Router de portfolio.
Endpoint principal: POST /api/portfolio/sync
  - Llama a la API de PPI con las credenciales del backend
  - Transforma la respuesta al formato MiCartera
  - Escribe en Firestore /users/{uid}/portfolio/{categoria}
  - El frontend lee Firestore directamente via onSnapshot (no este endpoint)

El uid viene de request.state.uid, inyectado por FirebaseAuthMiddleware.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Body, HTTPException, Request
from firebase_admin import firestore
from pydantic import BaseModel

from app.services.ppi_client import PPICredentials, ppi_client, PPIError
from app.services.encryption import (
    EncryptionNotConfigured,
    decrypt_payload,
    encrypt_payload,
)
from app.services.device_crypto import fernet_decrypt, fernet_encrypt
from app.services.session_store import session_store
from app.services.broker_client import (
    DEFAULT_BROKER_TYPE,
    BrokerCredentials,
    get_broker_client,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class BrokerCredentialsPayload(BaseModel):
    authorized_client: str = ""
    client_key: str = ""
    api_key: str = ""
    api_secret: str = ""
    account_number: str = ""

    def _values(self) -> list[str]:
        return [
            self.authorized_client.strip(),
            self.client_key.strip(),
            self.api_key.strip(),
            self.api_secret.strip(),
            self.account_number.strip(),
        ]

    def has_any(self) -> bool:
        return any(self._values())

    def is_complete(self) -> bool:
        return all(self._values())

    def to_ppi_credentials(self) -> PPICredentials:
        return PPICredentials(
            authorized_client=self.authorized_client.strip(),
            client_key=self.client_key.strip(),
            api_key=self.api_key.strip(),
            api_secret=self.api_secret.strip(),
            account_number=self.account_number.strip(),
        )


class SyncSourceRequest(BaseModel):
    broker_credentials: BrokerCredentialsPayload | None = None


# SEC-1/SEC-2 re-unlock contract: el cliente detecta este marcador en el detail del 401 y
# re-postea /api/session/unlock con la passphrase en memoria, luego reintenta (transparente).
NEEDS_UNLOCK_DETAIL = "needs_unlock"


class NeedsUnlock(HTTPException):
    """SEC-2: la DEK de sesión no está disponible (locked / TTL vencido / cold-start).

    Responde 401 con ``detail="needs_unlock"`` (string, compatible con el apiClient del
    front, que lo expone como ``error.message``). El cliente re-postea /api/session/unlock
    con la passphrase que tiene en memoria y reintenta.
    """

    def __init__(self, detail: str = NEEDS_UNLOCK_DETAIL):
        super().__init__(status_code=401, detail=detail)


def _require_session_dek(uid: str) -> bytes:
    """Devuelve la DEK de sesión o lanza NeedsUnlock (401). No persiste ni loguea la DEK."""
    dek = session_store.get(uid)
    if dek is None:
        raise NeedsUnlock()
    return dek


def _credentials_from_payload(payload: SyncSourceRequest | None) -> PPICredentials | None:
    broker_credentials = payload.broker_credentials if payload else None
    if not broker_credentials or not broker_credentials.has_any():
        return None
    if not broker_credentials.is_complete():
        raise HTTPException(status_code=400, detail="Credenciales del broker incompletas")
    return broker_credentials.to_ppi_credentials()


def _broker_credentials_from_session(uid: str, db, dek: bytes) -> BrokerCredentials | None:
    """Descifra las credenciales del broker (broker-agnósticas) con la DEK de sesión.

    Devuelve un ``BrokerCredentials`` (con ``broker_type``) o None si no hay creds guardadas
    o están incompletas. El ``broker_type`` se lee del propio doc (default ``ppi``).
    """
    snap = db.collection("users").document(uid).collection("broker").document("data").get()
    if not snap.exists:
        return None
    raw = snap.to_dict()
    # broker_type puede vivir en claro junto al ciphertext (no es secreto) o dentro del
    # payload cifrado. Preferimos el de afuera si existe.
    broker_type_outer = str(raw.get("broker_type", "")).strip() or None
    try:
        creds = fernet_decrypt(raw, dek)
    except Exception:
        logger.info("sync: no se pudo descifrar broker/data con la DEK de sesión uid=%s", uid)
        return None
    bc = BrokerCredentials.from_dict(creds, broker_type=broker_type_outer)
    if not all((bc.authorized_client, bc.client_key, bc.api_key, bc.api_secret, bc.account_number)):
        return None
    return bc


def _credentials_from_session(uid: str, db) -> PPICredentials | None:
    """SEC-1/SEC-2: resuelve las credenciales del broker descifrándolas server-side con la
    DEK desbloqueada (SessionStore). El frontend ya no las manda. Devuelve None si la sesión
    no está desbloqueada o no hay creds guardadas → cae al fallback .env en _build_user_portfolio.

    Pasa por la capa de adaptador (BROKER-ABS): hoy todos los brokers terminan en
    PPICredentials porque el único adaptador es PPI; cuando haya otros, esta función se
    adapta para devolver el cliente concreto.
    """
    dek = session_store.get(uid)
    if dek is None:
        return None
    bc = _broker_credentials_from_session(uid, db, dek)
    if bc is None:
        return None
    broker = get_broker_client(bc)
    # PPIBrokerClient expone ppi_credentials para el núcleo de sync existente.
    return getattr(broker, "ppi_credentials", None)

# ---------------------------------------------------------------------------
# Mapeo de categorías PPI → MiCartera
# ---------------------------------------------------------------------------
_CATEGORIA_MAP: dict[str, str] = {
    "acciones":                 "acciones_ar",
    "cedears":                  "cedears",
    "bonos":                    "bonos",
    "obligaciones negociables": "ons",
    "ons":                      "ons",
    "fondos comunes de inversión": "fci",
    "fci":                      "fci",
    "disponibilidades":         "liquidez",
    "cash":                     "liquidez",
}

# Parámetros para MarketData/Current por categoría
_MARKET_PARAMS: dict[str, tuple[str, str]] = {
    "acciones_ar": ("ACCIONES", "A-48HS"),
    "cedears":     ("CEDEARS",  "A-48HS"),
    "bonos":       ("BONOS",    "A-24HS"),
    "ons":         ("BONOS",    "A-24HS"),
}


def _normalize_categoria(ppi_category: str) -> str:
    return _CATEGORIA_MAP.get(ppi_category.lower().strip(), "acciones_ar")


async def _fetch_opening_prices(
    grupos_raw: dict[str, list[dict]],
    ppi_credentials: PPICredentials | None = None,
) -> dict[str, float]:
    """Consulta MarketData/Current en paralelo y retorna {ticker: openingPrice}."""
    tasks: list[tuple[str, str, str]] = []
    for cat, (inst_type, settlement) in _MARKET_PARAMS.items():
        for item in grupos_raw.get(cat, []):
            ticker = item.get("ticker", item.get("Ticker", ""))
            if ticker:
                tasks.append((ticker, inst_type, settlement))

    if not tasks:
        return {}

    results = await asyncio.gather(
        *(ppi_client.get_market_data(t, it, s, credentials=ppi_credentials) for t, it, s in tasks),
        return_exceptions=True,
    )

    opening: dict[str, float] = {}
    for (ticker, _itype, _sett), data in zip(tasks, results):
        if not isinstance(data, dict):
            continue
        # Preferimos marketChangePercent de PPI (vs cierre anterior, igual que el broker)
        pct_str = data.get("marketChangePercent", "")
        try:
            pct = float(str(pct_str).replace("%", "").strip())
            opening[ticker] = pct
        except (ValueError, TypeError):
            # Fallback: calcular vs previousClose
            prev = float(data.get("previousClose") or 0)
            price = float(data.get("price") or 0)
            if prev > 0 and price > 0:
                opening[ticker] = round((price - prev) / prev * 100, 2)
    return opening


def _transform_position(
    item: dict,
    dolar_mep: float = 0.0,
    rend_dia_ppi: float | None = None,
    categoria: str = "",
) -> dict:
    """Transforma un item de la API PPI al formato MiCartera."""
    ticker      = item.get("ticker",      item.get("Ticker", ""))
    descripcion = item.get("description", item.get("Description", ticker))
    cantidad    = float(item.get("quantity",    item.get("Amount", 0)))
    precio      = float(item.get("price",       item.get("Price", 0)))
    valor       = float(item.get("amount",      item.get("MarketValue", cantidad * precio)))
    costo_prom  = float(item.get("averagePrice", item.get("AverageCost", 0)))

    currency = item.get("currency", item.get("Currency", "Pesos"))
    is_usd   = "olar" in currency.lower()

    # FIX 1: PPI devuelve Price=0 cuando el mercado está cerrado (fin de semana),
    # pero sí devuelve MarketValue correcto. Derivar precio desde valor/cantidad.
    if precio == 0 and valor > 0 and cantidad > 0:
        precio = round(valor / cantidad, 6)

    # Guardar valores pre-conversión para calcular rendimientos en moneda original
    precio_orig     = precio
    costo_prom_orig = costo_prom

    if is_usd and dolar_mep > 0:
        precio     = round(precio     * dolar_mep, 2)
        valor      = round(valor      * dolar_mep, 2)
        costo_prom = round(costo_prom * dolar_mep, 2)

    # Rendimiento histórico vs costo promedio de compra.
    # FIX 3: Para instrumentos USD, el avg_cost calculado desde movimientos puede
    # estar en ARS (PPI registra el monto en pesos). Si costo_prom_orig es mucho
    # mayor que precio_orig, asumimos que está en ARS y lo convertimos a USD.
    rend_ars_pct = 0.0
    rend_usd_pct = 0.0
    if costo_prom_orig > 0 and precio_orig > 0:
        costo_para_rend = costo_prom_orig
        if is_usd and dolar_mep > 0 and costo_prom_orig > precio_orig * 10:
            # costo_prom_orig está en ARS → convertir a USD para comparar con precio_orig
            costo_para_rend = costo_prom_orig / dolar_mep
        rend_orig = round((precio_orig - costo_para_rend) / costo_para_rend * 100, 2)
        if is_usd:
            rend_usd_pct = rend_orig
            rend_ars_pct = rend_orig  # proxy: no incluye variación del MEP durante la tenencia
        else:
            rend_ars_pct = rend_orig
            # CEDEARs: cotizan en ARS en BYMA pero el subyacente es USD.
            # rend_usd_pct real requeriría MEP al momento de compra (no disponible por posición).
            # Proxy: mismo % que ARS (equivale a MEP constante durante la tenencia).
            if categoria == "cedears":
                rend_usd_pct = rend_orig

    # Rendimiento del día: viene directo de PPI (marketChangePercent vs cierre anterior)
    rend_dia_pct = round(rend_dia_ppi, 2) if rend_dia_ppi is not None else 0.0

    # Rendimiento absoluto — costo_prom y valor ya están en ARS (conversión ocurrió arriba)
    costo_total_ars  = round(costo_prom * cantidad, 2) if costo_prom > 0 else 0.0
    ganancia_ars     = round(valor - costo_total_ars, 2) if costo_total_ars > 0 else 0.0
    ganancia_usd_mep = round(ganancia_ars / dolar_mep, 2) if dolar_mep > 0 and costo_total_ars > 0 else 0.0

    # FIX 4: Para acciones_ar con avg_cost_usd histórico, sobreescribir rend_usd_pct y
    # ganancia_usd_mep usando el MEP real al momento de cada compra (en lugar del MEP actual).
    # Esto corrige el sesgo: precio_compra_ars / MEP_hoy ≠ precio_compra_usd_real.
    avg_cost_usd = item.get("averagePriceUSD")
    if avg_cost_usd and not is_usd and dolar_mep > 0 and avg_cost_usd > 0:
        current_price_usd = precio_orig / dolar_mep
        rend_usd_pct      = round((current_price_usd - avg_cost_usd) / avg_cost_usd * 100, 2)
        ganancia_usd_mep  = round((current_price_usd - avg_cost_usd) * cantidad, 2)

    pos = {
        "ticker":              ticker,
        "descripcion":         descripcion,
        "cantidad":            cantidad,
        "precio_actual_ars":   precio,
        "valor_corriente_ars": valor,
        "pct_cartera":         0.0,
        "costo_total_ars":     costo_total_ars,
        "ganancia_ars":        ganancia_ars,
        "ganancia_usd_mep":    ganancia_usd_mep,
        # G/P TOTAL = precio + renta cobrada (cupones + amortizaciones + dividendos).
        # Para bonos/ONs el precio cae al amortizar, pero el inversor cobró esa amortización:
        # el retorno económico real es precio + renta. Por defecto = solo-precio; el bloque de
        # renta (más abajo) lo sobreescribe sumando lo cobrado.
        "ganancia_total_ars":  ganancia_ars,
        "ganancia_total_usd":  ganancia_usd_mep,
        "rend_dia_pct":        rend_dia_pct,
        # rend_usd_pct: para instrumentos USD, CEDEARs, y acciones_ar con USD histórico.
        # Para acciones ARS sin histórico USD → null → el frontend usa rend_ars_pct como proxy.
        "rend_usd_pct":        rend_usd_pct if (is_usd or categoria == "cedears" or avg_cost_usd) else None,
        "rend_ars_pct":        rend_ars_pct,
    }

    if costo_prom > 0:
        pos["precio_compra_ars"] = costo_prom

    # Exponer costo de compra en USD histórico para que AssetRow lo muestre directamente
    # en modo MEP/CCL sin dividir por el MEP de hoy (que sería incorrecto).
    if avg_cost_usd and not is_usd:
        pos["precio_compra_usd"] = round(avg_cost_usd, 4)

    # -----------------------------------------------------------------------
    # Rendimiento TOTAL = rendimiento de precio (ya calculado) + renta cobrada.
    # La renta (cupones + amortizaciones + dividendos) viene agregada por ticker
    # desde compute_avg_costs. NO reemplaza el rendimiento de precio: se agrega
    # como campos nuevos (renta_cobrada_*, rend_total_*).
    #
    # Limitaciones conocidas (v1):
    #   • P&L realizado de trading (arbitraje MEP) NO está incluido: solo cupones,
    #     amortizaciones y dividendos, no la ganancia de comprar/vender nominales.
    #   • En posiciones muy operadas (vendidas parcialmente) la renta cobrada es la
    #     histórica TOTAL del ticker, no prorrateada a los nominales actuales, por
    #     lo que el rend_total puede sobreestimar. Aceptable como aproximación.
    #   • Las retenciones impositivas no se restan (renta bruta) — efecto chico.
    # -----------------------------------------------------------------------
    renta = item.get("rentaCobrada")
    if renta and costo_total_ars > 0:
        renta_ars = round(float(renta.get("renta_ars", 0)) + float(renta.get("amort_ars", 0)), 2)
        renta_usd = round(float(renta.get("renta_usd", 0)) + float(renta.get("amort_usd", 0)), 2)
        if renta_ars != 0 or renta_usd != 0:
            pos["renta_cobrada_ars"] = renta_ars
            pos["renta_cobrada_usd"] = renta_usd
            # Desglose cupón vs amortización (informativo; el rend total los suma).
            pos["cupon_cobrado_ars"] = round(float(renta.get("renta_ars", 0)), 2)
            pos["amort_cobrada_ars"] = round(float(renta.get("amort_ars", 0)), 2)
            pos["cupon_cobrado_usd"] = round(float(renta.get("renta_usd", 0)), 2)
            pos["amort_cobrada_usd"] = round(float(renta.get("amort_usd", 0)), 2)

            # G/P TOTAL absoluto = ganancia de precio + renta cobrada. Esto es lo que el
            # frontend debe mostrar/sumar para que el monto sea coherente con rend_total_*_pct.
            pos["ganancia_total_ars"] = round(ganancia_ars + renta_ars, 2)
            pos["ganancia_total_usd"] = round(ganancia_usd_mep + renta_usd, 2)

            # Rend. total ARS = (valor_actual + renta − costo) / costo
            pos["rend_total_ars_pct"] = round(
                (valor + renta_ars - costo_total_ars) / costo_total_ars * 100, 2
            )
            # Rend. total USD: misma base USD que ganancia_usd_mep, para consistencia.
            if avg_cost_usd and avg_cost_usd > 0:
                costo_usd = avg_cost_usd * cantidad
            elif dolar_mep > 0:
                costo_usd = costo_total_ars / dolar_mep
            else:
                costo_usd = 0.0
            if costo_usd > 0:
                pos["rend_total_usd_pct"] = round(
                    (ganancia_usd_mep + renta_usd) / costo_usd * 100, 2
                )

    subyacente = item.get("UnderlyingTicker", item.get("underlyingTicker", ""))
    if subyacente:
        pos["subyacente_usd"]     = subyacente
        pos["mercado_subyacente"] = item.get("Market", "NYSE")
        pos["ratio_cedear"]       = int(item.get("Ratio", 1))

    return pos


def _build_categoria(posiciones: list[dict]) -> dict:
    subtotal     = sum(p.get("valor_corriente_ars", 0) for p in posiciones)
    costo_total  = sum(p.get("costo_total_ars",    0) for p in posiciones)
    ganancia     = sum(p.get("ganancia_ars",        0) for p in posiciones)
    ganancia_usd = sum(p.get("ganancia_usd_mep",   0) for p in posiciones)
    # G/P TOTAL (precio + renta cobrada). Fallback a solo-precio si la posición no trae el total.
    ganancia_total     = sum(p.get("ganancia_total_ars", p.get("ganancia_ars",     0)) for p in posiciones)
    ganancia_total_usd = sum(p.get("ganancia_total_usd", p.get("ganancia_usd_mep", 0)) for p in posiciones)
    rend_pct       = round(ganancia / costo_total * 100, 2) if costo_total > 0 else 0.0
    rend_total_pct = round(ganancia_total / costo_total * 100, 2) if costo_total > 0 else 0.0
    return {
        "posiciones":           posiciones,
        "subtotal_ars":         round(subtotal, 2),
        "costo_total_ars":      round(costo_total, 2),
        "ganancia_ars":         round(ganancia, 2),
        "ganancia_usd_mep":     round(ganancia_usd, 2),
        "ganancia_total_ars":   round(ganancia_total, 2),
        "ganancia_total_usd":   round(ganancia_total_usd, 2),
        "rend_pct":             rend_pct,
        "rend_total_pct":       rend_total_pct,
        "pct_cartera":          0.0,
    }


def _build_liquidez(posiciones: list[dict]) -> dict:
    detalle = [
        {
            "especie":    p.get("ticker", ""),
            "cantidad":   p.get("cantidad", 0),
            "precio_ars": p.get("precio_actual_ars", 1),
            "valor_ars":  p.get("valor_corriente_ars", 0),
        }
        for p in posiciones
    ]
    subtotal = sum(d["valor_ars"] for d in detalle)
    return {
        "detalle":       detalle,
        "subtotal_ars":  round(subtotal, 2),
        "pct_cartera":   0.0,
        "usd_total_aprox": 0.0,  # el frontend divide por MEP en tiempo real
    }


# Categorías que tienen cotización de mercado en tiempo real
_CATS_CON_MERCADO = set(_MARKET_PARAMS.keys())


def _decrypt_doc(data: dict | None, label: str) -> dict:
    try:
        return decrypt_payload(data)
    except EncryptionNotConfigured:
        logger.error("%s: DATA_ENCRYPTION_KEY no configurada para leer documento cifrado", label)
        raise HTTPException(status_code=500, detail="Cifrado no configurado en el backend")
    except Exception as exc:
        logger.error("%s: error desencriptando documento: %s", label, exc)
        raise HTTPException(status_code=500, detail="No se pudo leer datos cifrados")


def _encrypt_doc(data: dict, label: str) -> dict:
    try:
        return encrypt_payload(data)
    except EncryptionNotConfigured:
        logger.error("%s: DATA_ENCRYPTION_KEY no configurada para escribir datos sensibles", label)
        raise HTTPException(status_code=500, detail="Cifrado no configurado en el backend")


# ---------------------------------------------------------------------------
# SEC-2: cifrado/descifrado con la DEK de sesión (por usuario).
#
# Reemplaza la clave global legacy (_encrypt_doc / DATA_ENCRYPTION_KEY) para portfolio
# y meta. El formato Fernet es el MISMO que escribe/lee el frontend (device_crypto.*),
# así que durante la transición (F3 pendiente) el front sigue pudiendo descifrar lo que
# escribe el backend, y viceversa.
# ---------------------------------------------------------------------------

def _encrypt_doc_dek(data: dict, dek: bytes) -> dict:
    """Cifra un doc con la DEK de sesión, en el formato Fernet del dispositivo."""
    return fernet_encrypt(data, dek)


def _decrypt_doc_dek(data: dict | None, dek: bytes, label: str) -> dict | None:
    """Intenta descifrar con la DEK de sesión. Devuelve None si el doc no es legible con
    esta DEK (p.ej. cifrado con la clave global legacy) — el caller decide el fallback."""
    if not data:
        return {}
    try:
        return fernet_decrypt(data, dek)
    except Exception as exc:
        logger.info("%s: no legible con la DEK de sesión (%s)", label, type(exc).__name__)
        return None


def _decrypt_doc_best_effort(data: dict | None, uid: str, label: str) -> dict | None:
    """Lectura de un doc cifrado priorizando la DEK de sesión (SEC-2) y cayendo a la clave
    global legacy (docs viejos). Devuelve None si no se pudo descifrar con ninguna.

    Coexistencia transicional: portfolio nuevo se cifra con la DEK de sesión; meta vieja
    (avg_costs, history) puede seguir cifrada con la clave global hasta el próximo sync.
    """
    if not data:
        return {}
    dek = session_store.get(uid)
    if dek is not None:
        plain = _decrypt_doc_dek(data, dek, label)
        if plain is not None:
            return plain
    # Fallback legacy: clave global del backend.
    try:
        return decrypt_payload(data)
    except EncryptionNotConfigured:
        return None
    except Exception:
        return None


def read_user_portfolio(uid: str) -> dict[str, dict]:
    """Lee y descifra el portfolio del usuario con la DEK de sesión (SEC-2 · F2).

    Requiere sesión desbloqueada: si la DEK no está disponible, lanza NeedsUnlock (401)
    para que el cliente re-postee /unlock y reintente. Los docs viejos cifrados con la
    clave global legacy también se leen (fallback) durante la transición.
    """
    dek = _require_session_dek(uid)
    db = firestore.client()
    user_ref = db.collection("users").document(uid)
    categorias = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]
    portfolio: dict[str, dict] = {}
    for cat in categorias:
        snap = user_ref.collection("portfolio").document(cat).get()
        fallback = {"posiciones": [], "subtotal_ars": 0}
        if cat == "liquidez":
            fallback = {"detalle": [], "subtotal_ars": 0}
        if not snap.exists:
            portfolio[cat] = fallback
            continue
        plain = _decrypt_doc_dek(snap.to_dict(), dek, f"portfolio/{cat}")
        if plain is None:
            # No legible con la DEK de sesión → intentar la clave global legacy (docs viejos).
            try:
                plain = decrypt_payload(snap.to_dict())
            except Exception:
                plain = fallback
        portfolio[cat] = plain
    return portfolio


def read_user_meta(uid: str, doc_id: str) -> dict:
    db = firestore.client()
    snap = db.collection("users").document(uid).collection("meta").document(doc_id).get()
    if not snap.exists:
        return {}
    plain = _decrypt_doc_best_effort(snap.to_dict(), uid, f"meta/{doc_id}")
    return plain if plain is not None else {}

# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

class _NoFreshData(Exception):
    """
    PPI no devolvió datos frescos (mercado cerrado / PPI caído). Lleva la última sync
    conocida para que el endpoint la reporte sin tocar Firestore, y el detalle del error
    real de PPI (login rechazado, timeout, etc.) para que el cliente pueda diagnosticarlo.
    """
    def __init__(self, ultima_sync: str, detail: str = ""):
        self.ultima_sync = ultima_sync
        self.detail = detail


async def _build_user_portfolio(
    uid: str,
    db,
    *,
    force_full: bool = False,
    write_history: bool = True,
    ppi_credentials: PPICredentials | None = None,
    dek: bytes | None = None,
) -> tuple[dict, bool, str, str, int]:
    """
    Núcleo compartido por POST /sync y POST /sync-source.

    Hace TODO el trabajo costoso una sola vez (cache incremental de avg_cost, ajuste por
    split/acción corporativa, costo USD histórico, renta cobrada, preservación de
    rend_dia_pct) y persiste server-side el cache avg_costs y el snapshot de history.
    NO escribe /users/{uid}/portfolio — eso lo decide cada endpoint.

    SEC-2: si se pasa ``dek`` (DEK de sesión del usuario), TODO el at-rest (portfolio, meta:
    avg_costs e history) se cifra/descifra con esa DEK vía device_crypto (mismo formato que
    el frontend). Si ``dek`` es None se usa la clave global legacy (camino /sync legacy).

    Retorna (portfolio, mercado_abierto, now, modo_sync, total_posiciones).
    Lanza _NoFreshData si PPI no responde (mercado cerrado / PPI caído).
    """
    user_ref = db.collection("users").document(uid)
    meta_ref  = user_ref.collection("meta")

    # Helpers de cifrado/descifrado que respetan la DEK de sesión cuando está presente.
    def _dec(data, label):
        if dek is not None:
            plain = _decrypt_doc_dek(data, dek, label)
            if plain is not None:
                return plain
            # Fallback a la clave global legacy (docs viejos pre-SEC-2).
            try:
                return decrypt_payload(data)
            except Exception:
                return None
        return _decrypt_doc(data, label)

    def _enc(data, label):
        return _encrypt_doc_dek(data, dek) if dek is not None else _encrypt_doc(data, label)

    # Leer en paralelo: portfolio existente + cache de costos promedios
    _CATS = ["acciones_ar", "cedears", "bonos", "ons", "fci", "liquidez"]
    existing: dict[str, dict] = {}
    for cat in _CATS:
        snap = user_ref.collection("portfolio").document(cat).get()
        if snap.exists:
            plain = _dec(snap.to_dict(), f"portfolio/{cat}")
            if plain is not None:
                existing[cat] = plain
            else:
                # No legible (cifrado con otra clave). Solo se pierde la preservación de
                # rend_dia de esa categoría; el sync nuevo igual la sobreescribe. No es fatal.
                logger.info("portfolio/%s no legible para preservar rend_dia — se omite", cat)

    cached_state = None
    if not force_full:
        cache_snap = meta_ref.document("avg_costs").get()
        if cache_snap.exists:
            cached = _dec(cache_snap.to_dict(), "meta/avg_costs") or {}
            if cached.get("full_sync_completed"):
                # Auto-detect: forzar recálculo full cuando el cache es de una versión
                # anterior al fix. Dos señales:
                #  - sin total_cost_usd → no tiene el rendimiento USD histórico (v8+)
                #  - sin processed_sigs → cache previo a la deduplicación: puede tener
                #    cantidades infladas por doble conteo del buffer incremental
                #    (ej. NU 354 vs 21). Un full limpia la corrupción de una.
                tickers_c = cached.get("tickers", {})
                has_usd  = any(v.get("total_cost_usd", 0) > 0 for v in tickers_c.values())
                has_sigs = bool(cached.get("processed_sigs"))
                if tickers_c and (not has_usd or not has_sigs):
                    logger.info("Cache previo al fix (sin total_cost_usd/processed_sigs) → recálculo completo")
                else:
                    cached_state = cached
    else:
        # Eliminar caché para forzar recálculo completo desde 5 años de movimientos
        meta_ref.document("avg_costs").delete()

    # Intentar sync desde PPI. Si falla, Firestore queda intacto.
    async def _attempt_ppi(creds):
        items_, avg_ = await asyncio.gather(
            ppi_client.get_account_positions(credentials=creds),
            ppi_client.compute_avg_costs(cached_state, credentials=creds),
        )
        return items_, avg_

    # Las credenciales del backend (.env / Secret Manager), usadas como FALLBACK cuando las
    # que manda el dispositivo fallan el login de PPI. Para un único dueño, esto destraba el
    # sync sin depender de que el device transmita las creds perfectas. Solo se intenta si
    # están configuradas y son distintas a las que ya fallaron.
    _env_creds = PPICredentials.from_settings()
    _env_usable = all((
        _env_creds.authorized_client, _env_creds.client_key,
        _env_creds.api_key, _env_creds.api_secret, _env_creds.account_number,
    ))

    try:
        items, avg_result = await _attempt_ppi(ppi_credentials)
        avg_costs, avg_costs_usd, avg_costs_state = avg_result
    except Exception as exc:
        logger.error("Sync PPI falló con creds del request para uid=%s: %s", uid, exc)
        # Fallback a las creds del backend si están y son distintas a las que fallaron.
        if _env_usable and (ppi_credentials is None or ppi_credentials.cache_key != _env_creds.cache_key):
            try:
                logger.info("Reintentando sync con credenciales del backend (fallback) para uid=%s", uid)
                items, avg_result = await _attempt_ppi(_env_creds)
                avg_costs, avg_costs_usd, avg_costs_state = avg_result
                ppi_credentials = _env_creds   # usar estas para el resto (MEP, opening prices, etc.)
            except Exception as exc2:
                logger.error("Sync PPI también falló con fallback del backend para uid=%s: %s", uid, exc2)
                ultima_sync = max((d.get("ultima_sync", "") for d in existing.values()), default="")
                raise _NoFreshData(ultima_sync, f"{type(exc2).__name__}: {exc2}")
        else:
            ultima_sync = max((d.get("ultima_sync", "") for d in existing.values()), default="")
            # Detalle accionable para el cliente: tipo de excepción + mensaje (ej.
            # "PPIError: PPI login fallo (HTTP 401)" o "ReadTimeout: ..."). No incluye
            # credenciales: los mensajes de PPIError/httpx no las contienen.
            raise _NoFreshData(ultima_sync, f"{type(exc).__name__}: {exc}")

    # Leer tipo de cambio MEP: Firestore → PPI → dolarapi.com
    cotiz_snap = db.collection("market").document("cotizaciones").get()
    cotiz     = cotiz_snap.to_dict() if cotiz_snap.exists else {}
    dolar_mep = float(cotiz.get("dolar_mep") or 0)

    if dolar_mep <= 0:
        try:
            dolar_mep = await ppi_client.get_dolar_mep(credentials=ppi_credentials)
        except Exception:
            pass

    if dolar_mep <= 0:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get("https://dolarapi.com/v1/dolares/bolsa")
                if resp.is_success:
                    data = resp.json()
                    compra = float(data.get("compra") or 0)
                    venta  = float(data.get("venta")  or 0)
                    if compra > 0 and venta > 0:
                        dolar_mep = round((compra + venta) / 2, 2)
        except Exception:
            pass

    # Renta cobrada por ticker (cupones + amortizaciones + dividendos), calculada en
    # compute_avg_costs. Se atribuye a la posición del mismo ticker para el rend total.
    renta_por_ticker: dict[str, dict] = (avg_costs_state.get("renta") or {})

    # Pre-agrupar items raw por categoría (inyectando avg_cost si disponible)
    grupos_raw: dict[str, list[dict]] = {
        "acciones_ar": [], "cedears": [], "bonos": [],
        "ons": [], "fci": [], "liquidez": [],
    }
    for item in items:
        cat = _normalize_categoria(item.get("Category", item.get("category", "")))
        ticker = item.get("ticker", item.get("Ticker", ""))
        # Usar el AverageCost que PPI provee directamente en posiciones (coincide con el broker).
        # Solo calcular desde movimientos si PPI no lo incluye en la respuesta.
        # FIX 2: movimientos trunca tickers a 10 chars → buscar también con prefijo.
        ppi_has_cost = bool(item.get("averagePrice") or item.get("AverageCost"))
        if not ppi_has_cost:
            avg_cost_calc = avg_costs.get(ticker) or avg_costs.get(ticker[:10])
            if avg_cost_calc is not None:
                # (Eliminado el ×100 para bonos/ONs: en las posiciones de PPI
                #  precio × cantidad = valor ya cierra — no hay escala de 100 VN.
                #  El ×100 inflaba el costo 100× y rompía el rendimiento de bonos/ONs.)

                # Ajuste por acción corporativa (split / cambio de ratio CEDEAR):
                # si la qty acumulada en movimientos difiere de la qty actual en la
                # posición, el costo por unidad se reescala proporcionalmente.
                # Ej: XOM split 4→5: avg_cost × (4/5). Si la qty coincide (sin split),
                # el factor es 1 → sin efecto. Requiere que el cache tenga la qty real
                # (ver dedup en compute_avg_costs: un cache inflado dispararía un
                # "split" falso, ej. NU 354 vs 21).
                actual_qty = float(item.get("quantity", item.get("Amount", 0)))
                acum_qty   = (avg_costs_state.get("tickers") or {}).get(
                    ticker, (avg_costs_state.get("tickers") or {}).get(ticker[:10], {})
                ).get("qty", 0)
                split_factor = 1.0
                if acum_qty > 0 and actual_qty > 0 and abs(acum_qty - actual_qty) > 0.5:
                    split_factor = acum_qty / actual_qty

                currency_item = item.get("currency", item.get("Currency", "Pesos"))
                if "olar" in currency_item.lower():
                    # Instrumento cotizado en USD (bono/ON/FCI dólar): inyectar el costo
                    # USD HISTÓRICO real (avg_costs_usd) — NO el costo en pesos dividido
                    # por el MEP de hoy, que ignoraría que el MEP al momento de compra
                    # era distinto y daría un rendimiento absurdo (ej. MTCGD +2122%).
                    avg_usd_hist = avg_costs_usd.get(ticker) or avg_costs_usd.get(ticker[:10])
                    if avg_usd_hist:
                        item = {**item, "averagePrice": round(avg_usd_hist * split_factor, 6)}
                    elif dolar_mep > 0:
                        item = {**item, "averagePrice": round(avg_cost_calc * split_factor / dolar_mep, 6)}
                else:
                    item = {**item, "averagePrice": round(avg_cost_calc * split_factor, 6)}
        # Para acciones_ar, cedears, bonos y ons: inyectar costo USD histórico (MEP al día de
        # cada compra). Permite calcular rend_usd_pct y ganancia_usd_mep con el tipo de cambio
        # real, no con el MEP de hoy (que subestimaría el costo de compra en USD).
        if cat in ("acciones_ar", "cedears", "bonos", "ons"):
            avg_usd = avg_costs_usd.get(ticker) or avg_costs_usd.get(ticker[:10])
            if avg_usd:
                # (Eliminado el ×100 para bonos/ONs — misma razón que arriba.)
                # Ajuste por acción corporativa (split): igual que para avg_costs ARS.
                _actual_qty = float(item.get("quantity", item.get("Amount", 0)))
                _acum_qty = (avg_costs_state.get("tickers") or {}).get(
                    ticker,
                    (avg_costs_state.get("tickers") or {}).get(ticker[:10], {})
                ).get("qty", 0)
                if _acum_qty > 0 and _actual_qty > 0 and abs(_acum_qty - _actual_qty) > 0.5:
                    avg_usd = round(avg_usd * (_acum_qty / _actual_qty), 6)
                item = {**item, "averagePriceUSD": avg_usd}

        # Inyectar renta cobrada (cupones + amortizaciones + dividendos) para que
        # _transform_position calcule el rendimiento total (precio + renta).
        _renta = renta_por_ticker.get(ticker) or renta_por_ticker.get(ticker[:10])
        if _renta:
            item = {**item, "rentaCobrada": _renta}

        grupos_raw[cat].append(item)

    # Obtener precios de apertura en paralelo para calcular rend_dia_pct
    opening_prices = await _fetch_opening_prices(grupos_raw, ppi_credentials=ppi_credentials)

    # Detectar si el mercado está abierto: hay instrumentos que requieren market data
    # pero opening_prices llegó vacío → mercado cerrado o fuera de horario.
    hay_tickers_con_mercado = any(grupos_raw.get(cat) for cat in _CATS_CON_MERCADO)
    mercado_abierto = not hay_tickers_con_mercado or bool(opening_prices)

    # Construir mapa de último rend_dia_pct conocido por ticker (desde Firestore)
    rend_dia_conocido: dict[str, float] = {}
    for old_data in existing.values():
        for pos in old_data.get("posiciones", []):
            tk = pos.get("ticker", "")
            if tk:
                rend_dia_conocido[tk] = pos.get("rend_dia_pct", 0.0)

    # Transformar al formato MiCartera, preservando rend_dia_pct cuando no hay dato fresco
    grupos: dict[str, list[dict]] = {}
    for cat, raw_items in grupos_raw.items():
        grupos[cat] = []
        for item in raw_items:
            ticker = item.get("ticker", item.get("Ticker", ""))
            rend_dia = opening_prices.get(ticker)
            if rend_dia is None and ticker in rend_dia_conocido:
                rend_dia = rend_dia_conocido[ticker]
            grupos[cat].append(_transform_position(item, dolar_mep, rend_dia, cat))

    # Construir el portfolio (sin escribirlo: cada endpoint decide cómo persistirlo)
    now = datetime.now(timezone.utc).isoformat()
    portfolio: dict[str, dict] = {}
    for cat, posiciones in grupos.items():
        data = (
            _build_liquidez(posiciones)
            if cat == "liquidez"
            else _build_categoria(posiciones)
        )
        data["ultima_sync"] = now
        data["updatedAt"]   = now   # LWW del cache offline-first en el dispositivo
        data["is_stale"]    = not mercado_abierto
        portfolio[cat] = data

    # Persistir cache de costos promedios para syncs incrementales futuros
    meta_ref.document("avg_costs").set(
        _enc(avg_costs_state, "meta/avg_costs")
    )

    # Snapshot diario del valor total para calcular rendimiento mensual.
    # Guarda {YYYY-MM-DD: total_ars} en un único doc que se acumula con merge=True.
    # El frontend lo lee y calcula (valor_hoy - valor_30d_atrás) / valor_30d_atrás × 100.
    if write_history:
        total_snapshot = round(sum(
            p.get("valor_corriente_ars", 0)
            for posiciones in grupos.values()
            for p in posiciones
        ), 2)
        if total_snapshot > 0:
            bue_tz = timezone(timedelta(hours=-3))
            today_bue = datetime.now(bue_tz).strftime("%Y-%m-%d")
            history_ref = meta_ref.document("portfolio_history")
            history_snap = history_ref.get()
            history = (
                (_dec(history_snap.to_dict(), "meta/portfolio_history") or {})
                if history_snap.exists
                else {}
            )
            history[today_bue] = total_snapshot
            history_ref.set(
                _enc(history, "meta/portfolio_history")
            )

    modo_sync = "full_5y" if force_full or cached_state is None else "incremental"
    total_posiciones = sum(len(v) for v in grupos.values())
    return portfolio, mercado_abierto, now, modo_sync, total_posiciones


@router.post("/sync")
async def sync_portfolio(request: Request, force_full: bool = False):
    """
    Sincroniza el portfolio del usuario desde PPI a Firestore (modelo legacy: el backend
    cifra con la clave global y escribe /users/{uid}/portfolio).
    No requiere body — usa el uid del Firebase token verificado por middleware.

    Params:
      force_full=true  Ignora el caché incremental y recalcula desde 5 años de movimientos.

    Si PPI no responde (mercado cerrado / caído), retorna "sin_datos_frescos" sin tocar
    Firestore — el frontend sigue mostrando los últimos datos conocidos.
    """
    uid = request.state.uid
    db = firestore.client()
    user_ref = db.collection("users").document(uid)
    try:
        portfolio, mercado_abierto, now, modo_sync, total_posiciones = await _build_user_portfolio(
            uid, db, force_full=force_full
        )
    except _NoFreshData as exc:
        return {
            "status": "sin_datos_frescos",
            "stale": True,
            "ultima_sync_exitosa": exc.ultima_sync,
            "error_detail": exc.detail,
        }

    for cat, data in portfolio.items():
        user_ref.collection("portfolio").document(cat).set(
            _encrypt_doc(data, f"portfolio/{cat}")
        )

    return {
        "status": "ok",
        "uid": uid,
        "stale": not mercado_abierto,
        "modo_sync": modo_sync,
        "categorias_sincronizadas": list(portfolio.keys()),
        "total_posiciones": total_posiciones,
        "timestamp": now,
    }


@router.post("/sync-source")
async def sync_portfolio_source(
    request: Request,
    payload: SyncSourceRequest | None = Body(default=None),
):
    """SEC-2 · F1 — Escritura server-side con la DEK de sesión.

    El BACKEND descifra las credenciales del broker (server-side, con la DEK desbloqueada),
    llama al broker, construye el portfolio, lo **cifra con la DEK de sesión** (mismo formato
    Fernet que el dispositivo) y lo **escribe en Firestore** con el Admin SDK. También cifra
    la meta (avg_costs, portfolio_history) con la DEK. Reemplaza el cifrado que hacía el
    frontend y la clave global legacy.

    Requiere sesión desbloqueada: si la DEK no está disponible, responde 401 needs_unlock
    (el cliente re-postea /api/session/unlock y reintenta). Devuelve además el portfolio en
    claro en la respuesta autenticada para que el front lo use directo (read F2 / cache offline
    durante la transición — F3 elimina el Fernet JS del front).

    El body ``broker_credentials`` queda legacy (se quita en F3); si llega, se respeta.
    """
    uid = request.state.uid
    db = firestore.client()
    # SEC-2 F1: la DEK de sesión es obligatoria para escribir at-rest con la clave del usuario.
    dek = _require_session_dek(uid)
    # Credenciales del broker: del body (legacy) o descifradas server-side con la DEK de sesión.
    ppi_credentials = _credentials_from_payload(payload) or _credentials_from_session(uid, db)
    try:
        portfolio, mercado_abierto, now, modo_sync, total_posiciones = await _build_user_portfolio(
            uid, db, force_full=False, ppi_credentials=ppi_credentials, dek=dek
        )
    except _NoFreshData as exc:
        return {
            "status": "sin_datos_frescos",
            "stale": True,
            "ultima_sync_exitosa": exc.ultima_sync,
            "error_detail": exc.detail,
        }

    # F1: escribir el portfolio cifrado con la DEK de sesión (server-side, Admin SDK).
    user_ref = db.collection("users").document(uid)
    for cat, data in portfolio.items():
        user_ref.collection("portfolio").document(cat).set(
            _encrypt_doc_dek(data, dek)
        )

    return {
        "status": "ok",
        "uid": uid,
        "stale": not mercado_abierto,
        "modo_sync": modo_sync,
        # portfolio en claro: durante la transición el front lo consume directo (F2) y/o lo
        # cachea offline. F3 elimina la persistencia/cifrado del lado del front.
        "portfolio": portfolio,
        "categorias_sincronizadas": list(portfolio.keys()),
        "total_posiciones": total_posiciones,
        "timestamp": now,
    }


@router.get("")
async def get_portfolio(request: Request):
    """SEC-2 · F2 — Devuelve el portfolio en claro, descifrado server-side con la DEK de
    sesión. Si la sesión está bloqueada responde 401 needs_unlock (re-unlock + retry)."""
    return read_user_portfolio(request.state.uid)


@router.get("/history")
async def get_portfolio_history(request: Request):
    """Devuelve el historial diario desencriptado del usuario autenticado."""
    return read_user_meta(request.state.uid, "portfolio_history")


@router.get("/debug-costs")
async def debug_costs(request: Request):
    """
    Endpoint de diagnóstico. Muestra:
    - Todos los campos crudos que PPI devuelve por posición (para ver si incluye AverageCost)
    - Comparación entre avg_cost de PPI vs el calculado desde movimientos
    NO escribe en Firestore.
    """
    try:
        items = await ppi_client.get_account_positions()
    except Exception as exc:
        logger.error("debug-costs: error obteniendo posiciones: %s", exc)
        return {"error": "No se pudo obtener datos del broker"}

    try:
        avg_costs_calc = await ppi_client.get_average_costs()
    except Exception:
        avg_costs_calc = {}

    comparacion = []
    for item in items:
        ticker = item.get("ticker", item.get("Ticker", ""))
        if not ticker:
            continue

        ppi_avg  = item.get("averagePrice", item.get("AverageCost", item.get("averageCost", None)))
        calc_avg = avg_costs_calc.get(ticker) or avg_costs_calc.get(ticker[:10])

        comparacion.append({
            "ticker":              ticker,
            "category":            item.get("Category", ""),
            "currency":            item.get("currency", item.get("Currency", "")),
            # ¿PPI devuelve el precio promedio directamente?
            "ppi_average_cost":    ppi_avg,
            # Nuestro cálculo desde movimientos
            "calc_average_cost":   round(calc_avg, 2) if calc_avg else None,
            # Todos los campos del item crudo (para detectar el nombre real del campo)
            "raw_fields":          list(item.keys()),
            # Valores numéricos relevantes del item
            "raw_price_fields": {
                k: item[k] for k in item
                if any(s in k.lower() for s in ["price", "cost", "avg", "average", "prom"])
            },
        })

    return {
        "total_posiciones": len(comparacion),
        "posiciones":       comparacion,
    }


@router.get("/debug-movements/{ticker}")
async def debug_movements(ticker: str, request: Request):
    """
    Muestra todos los movimientos de un ticker en los últimos 5 años y el cálculo
    paso a paso que coincide EXACTAMENTE con compute_avg_costs (price × qty, MEP real).

    Campos por paso:
      price_raw      → precio tal cual viene de PPI
      price_usado     → precio en ARS después de corrección MEP si aplica
      cost_compra     → qty × price_usado (lo que suma al costo, sin comisiones)
      avg_precio      → precio promedio acumulado hasta ese movimiento
    """
    import statistics as _stats
    from datetime import timedelta
    from app.services.ppi_client import _ensure_mep_history, _ars_unit_price

    date_to   = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=1825)

    # Cargar MEP histórico (mismo caché que usa compute_avg_costs)
    mep_history = await _ensure_mep_history()

    raw_movs: list = []
    chunk_start = date_from
    while chunk_start < date_to:
        chunk_end = min(date_to, chunk_start + timedelta(days=179))
        try:
            chunk = await ppi_client.get_movements(
                chunk_start.strftime("%Y-%m-%d"),
                chunk_end.strftime("%Y-%m-%d"),
            )
            for mov in chunk:
                t = mov.get("ticker", "")
                if t.upper() == ticker.upper() or ticker.upper().startswith(t.upper()):
                    raw_movs.append(mov)
        except Exception as exc:
            logger.warning("debug-movements %s: error en chunk %s→%s: %s",
                           ticker, chunk_start.date(), chunk_end.date(), exc)
            raw_movs.append({"error": str(exc)})
        chunk_start = chunk_end + timedelta(days=1)

    # Normalizar y ordenar
    movs_norm = []
    for mov in raw_movs:
        if "error" in mov:
            continue
        qty    = abs(float(mov.get("quantity", 0)))
        price  = float(mov.get("price",    0))
        amount = float(mov.get("amount",   0))
        if qty == 0 or price == 0:
            continue
        date_key = mov.get("settlementDate") or mov.get("date") or ""
        movs_norm.append({
            "qty": qty, "price": price, "amount": amount,
            "date": date_key, "desc": mov.get("description", ""),
            "currency": mov.get("currency", ""),
        })
    movs_norm.sort(key=lambda m: m["date"])

    # Mediana de PRECIOS (igual que compute_avg_costs full sync)
    prices_raw = [m["price"] for m in movs_norm if m["price"] > 0]
    median_price = _stats.median(prices_raw) if len(prices_raw) >= 2 else 0.0

    # Replay idéntico a compute_avg_costs (price × qty, con corrección MEP)
    steps = []
    qty_acum = cost_acum = 0.0
    corrections = []

    for m in movs_norm:
        tipo = "COMPRA" if m["amount"] < 0 else "VENTA"

        # Corrección USD → ARS igual que _ars_unit_price en compute_avg_costs
        unit_price = _ars_unit_price(m["price"], m["date"], median_price, mep_history, m.get("currency", ""))
        correccion = None
        if unit_price != m["price"]:
            factor = round(unit_price / m["price"], 1)
            correccion = f"×{factor} MEP ({m['date']}): {m['price']:.4f} USD → {unit_price:.2f} ARS"
            corrections.append(correccion)

        cost_compra = m["qty"] * unit_price  # sin comisiones

        if m["amount"] < 0:                          # compra
            qty_acum  += m["qty"]
            cost_acum += cost_compra
        elif m["amount"] > 0 and qty_acum > 0:       # venta FIFO
            avg_prev  = cost_acum / qty_acum
            qty_acum  = max(0.0, qty_acum - m["qty"])
            cost_acum = qty_acum * avg_prev

        avg_now = (cost_acum / qty_acum) if qty_acum > 0 else 0.0

        step: dict = {
            "fecha":        m["date"],
            "tipo":         tipo,
            "qty":          m["qty"],
            "price_raw":    m["price"],
            "price_usado":  round(unit_price, 4),
            "cost_compra":  round(cost_compra, 2) if tipo == "COMPRA" else None,
            "amount_ppi":   m["amount"],   # referencia: lo que PPI registró (incluye comisión)
            "qty_acum":     round(qty_acum, 4),
            "cost_acum":    round(cost_acum, 2),
            "avg_precio":   round(avg_now, 2),
            "descripcion":  m["desc"],
        }
        if correccion:
            step["correccion_mep"] = correccion
        steps.append(step)

    avg_final = round(cost_acum / qty_acum, 2) if qty_acum > 0 else None
    return {
        "ticker":              ticker.upper(),
        "ventana":             "5 años",
        "metodo":              "price × qty (sin comisiones) + MEP histórico exacto",
        "total_movimientos":   len(steps),
        "correcciones_mep":    corrections,
        "avg_costo_final_ars": avg_final,
        "qty_final":           round(qty_acum, 4),
        "mediana_price_raw":   round(median_price, 4),
        "mep_history_cargado": len(mep_history) > 0,
        "pasos":               steps,
    }
