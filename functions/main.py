"""
Firebase Cloud Functions — MiCartera

Funciones:
  polling_cotizaciones  — scheduler cada 60s → consulta PPI + BCRA → escribe /market/cotizaciones
  on_security_event     — trigger Firestore → envía email de alerta al usuario
"""
import os
import smtplib
from datetime import datetime, timezone, date, timedelta
from email.mime.text import MIMEText
from typing import Optional

import httpx
import firebase_admin
from firebase_admin import auth as fb_auth, firestore
from firebase_functions import scheduler_fn, firestore_fn

firebase_admin.initialize_app()

# ---------------------------------------------------------------------------
# PPI credentials (configurar en Firebase Console → Functions → Variables de entorno)
# ---------------------------------------------------------------------------
_PPI_BASE_URL    = os.environ.get("PPI_BASE_URL", "https://clientapi.portfoliopersonal.com")
_PPI_API_KEY     = os.environ.get("PPI_API_KEY", "")
_PPI_API_SECRET  = os.environ.get("PPI_API_SECRET", "")

# BCRA API (pública, sin credenciales)
_BCRA_BASE = "https://api.bcra.gob.ar/estadisticas/v2.0"
_VAR_DOLAR_BNA     = 1
_VAR_DOLAR_OFICIAL = 4
_VAR_RIESGO_PAIS   = 5

# ---------------------------------------------------------------------------
# PPI — autenticación y cotizaciones
# ---------------------------------------------------------------------------

_ppi_token: Optional[str]            = None
_ppi_token_expiry: Optional[datetime] = None


def _ppi_login() -> Optional[str]:
    """Obtiene un access token de PPI. Retorna None si falla."""
    global _ppi_token, _ppi_token_expiry

    if not _PPI_API_KEY or not _PPI_API_SECRET:
        print("[PPI] Credenciales no configuradas. Salteando polling de MEP/CCL.")
        return None

    try:
        resp = httpx.post(
            f"{_PPI_BASE_URL}/api/1.0/Account/LoginApi",
            json={"ApiKey": _PPI_API_KEY, "ApiSecret": _PPI_API_SECRET},
            timeout=10,
        )
        if resp.is_success:
            data = resp.json()
            _ppi_token = data.get("AccessToken")
            expires_in = int(data.get("ExpiresIn", 3600))
            _ppi_token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
            return _ppi_token
    except Exception as exc:
        print(f"[PPI] Login falló: {exc}")
    return None


def _ppi_get_token() -> Optional[str]:
    global _ppi_token, _ppi_token_expiry
    if not _ppi_token or datetime.now(timezone.utc) >= (_ppi_token_expiry or datetime.min.replace(tzinfo=timezone.utc)):
        return _ppi_login()
    return _ppi_token


def _ppi_market_price(ticker: str, instrument_type: str, settlement: str) -> float:
    token = _ppi_get_token()
    if not token:
        return 0.0
    try:
        resp = httpx.get(
            f"{_PPI_BASE_URL}/api/1.0/MarketData/Current",
            params={"instrumentType": instrument_type, "settlement": settlement, "ticker": ticker},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.is_success:
            d = resp.json()
            return float(d.get("price") or d.get("last") or d.get("Price") or 0)
    except Exception as exc:
        print(f"[PPI] MarketData {ticker}: {exc}")
    return 0.0


def _calc_dolar_mep() -> float:
    """MEP ≈ AL30 ARS / AL30D USD (liquidación T+1)."""
    ars = _ppi_market_price("AL30",  "Bonos", "T+1")
    usd = _ppi_market_price("AL30D", "Bonos", "T+1")
    return round(ars / usd, 2) if usd > 0 else 0.0


def _calc_dolar_ccl() -> float:
    """CCL ≈ GD30 ARS / GD30D USD (liquidación T+2)."""
    ars = _ppi_market_price("GD30",  "Bonos", "T+2")
    usd = _ppi_market_price("GD30D", "Bonos", "T+2")
    return round(ars / usd, 2) if usd > 0 else 0.0


# ---------------------------------------------------------------------------
# BCRA — BNA, Oficial, Riesgo País
# ---------------------------------------------------------------------------

def _bcra_variable(var_id: int) -> float:
    """Últimos 7 días para cubrir fines de semana y feriados."""
    until = date.today()
    since = until - timedelta(days=7)
    url   = f"{_BCRA_BASE}/datosvariable/{var_id}/{since}/{until}"
    try:
        resp = httpx.get(url, timeout=8)
        if resp.is_success:
            results = resp.json().get("results", [])
            if results:
                return float(results[-1].get("valor", 0))
    except Exception as exc:
        print(f"[BCRA] var {var_id}: {exc}")
    return 0.0


# ---------------------------------------------------------------------------
# Scheduler: polling de cotizaciones
# ---------------------------------------------------------------------------

@scheduler_fn.on_schedule(schedule="every 60 seconds")
def polling_cotizaciones(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Se ejecuta cada 60 segundos.
    1. Obtiene MEP y CCL desde PPI (via bonos AL30/GD30)
    2. Obtiene BNA, Oficial y Riesgo País desde BCRA (API pública)
    3. Escribe en /market/cotizaciones
    """
    mep    = _calc_dolar_mep()
    ccl    = _calc_dolar_ccl()
    bna    = _bcra_variable(_VAR_DOLAR_BNA)
    oficial = _bcra_variable(_VAR_DOLAR_OFICIAL)
    riesgo = int(_bcra_variable(_VAR_RIESGO_PAIS))

    data = {
        "dolar_mep":            mep,
        "dolar_ccl":            ccl,
        "dolar_bna":            bna,
        "dolar_oficial":        oficial,
        "riesgo_pais_pb":       riesgo,
        "ultima_actualizacion": datetime.now(timezone.utc).isoformat(),
    }

    db = firestore.client()
    db.collection("market").document("cotizaciones").set(data)
    print(f"[polling] MEP={mep} CCL={ccl} BNA={bna} RP={riesgo} pb")


# ---------------------------------------------------------------------------
# Trigger Firestore: alerta de seguridad por email
# ---------------------------------------------------------------------------

@firestore_fn.on_document_created(document="users/{uid}/securityEvents/{eventId}")
def on_security_event(
    event: firestore_fn.Event[firestore_fn.DocumentSnapshot],
) -> None:
    """
    Se dispara cuando el backend escribe un evento de seguridad para un usuario.
    Obtiene el email del usuario desde Firebase Auth y envía la alerta.

    Para activar el envío de emails, configurar en Firebase Console → Functions → Variables:
      SMTP_HOST      ej: smtp.gmail.com
      SMTP_PORT      ej: 587
      SMTP_USER      ej: alerts@micartera.app
      SMTP_PASSWORD  App Password de Gmail (no la contraseña de Google)
    """
    uid        = event.params["uid"]
    data       = event.data.to_dict() if event.data else {}
    event_type = data.get("type", "actividad_desconocida")
    details    = {k: v for k, v in data.items() if k not in ("type", "timestamp")}

    try:
        user_record = fb_auth.get_user(uid)
        user_email  = user_record.email or ""
    except Exception as exc:
        print(f"[SECURITY] No se pudo obtener email para uid={uid}: {exc}")
        return

    if not user_email:
        print(f"[SECURITY] uid={uid} sin email. Evento: {event_type}")
        return

    _send_security_email(user_email, event_type, details)


def _send_security_email(to_email: str, event_type: str, details: dict) -> None:
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", "")

    if not all([smtp_host, smtp_user, smtp_pass]):
        print(
            f"[SECURITY ALERT] SMTP no configurado. "
            f"Evento: {event_type} | Para: {to_email} | Detalles: {details}"
        )
        return

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = (
        f"MiCartera — Alerta de Seguridad\n\n"
        f"Se detectó actividad inusual en tu cuenta:\n\n"
        f"  Tipo de evento : {event_type}\n"
        f"  Detalles       : {details}\n"
        f"  Fecha/hora     : {timestamp}\n\n"
        f"Si reconocés esta actividad, ignorá este mensaje.\n"
        f"Si NO la reconocés, cerrá sesión en todos los dispositivos "
        f"y revisá tu cuenta de Google.\n\n"
        f"Este mensaje fue generado automáticamente. No respondas."
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"[MiCartera] Alerta de seguridad: {event_type}"
    msg["From"]    = smtp_user
    msg["To"]      = to_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        print(f"[SECURITY] Email enviado a {to_email} — {event_type}")
    except Exception as exc:
        print(f"[SECURITY] Error enviando email a {to_email}: {exc}")
