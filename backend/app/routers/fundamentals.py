"""
Router de fundamentales.

POST /api/fundamentals/refresh
  Lee el portfolio del usuario desde Firestore, obtiene métricas de yfinance
  para cada ticker y las persiste en /users/{uid}/fundamentals/{ticker}.

  - CEDEARs  → usa el subyacente USD (campo subyacente_usd de la posición: MELI, AAPL, XOM, etc.)
  - Acciones AR → usa {ticker}.BA (ALUA.BA, YPFD.BA, GGAL.BA, etc.)
  - Bonos / ONs / FCI → se omiten (no aplica análisis fundamental de equity)

  merge=True en Firestore: preserva los campos Claude (tesis, escenarios, accion_tactica)
  que el usuario haya cargado previamente via PasteResultArea.

POST /api/fundamentals/{ticker}/analysis
  Guarda el análisis generado por Claude (tesis, escenarios, accion_tactica)
  en Firestore, fusionándolo con las métricas de yfinance ya existentes.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from firebase_admin import firestore

from app.routers.portfolio import read_user_portfolio
from app.services.ppi_client import ppi_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/fundamentals", tags=["fundamentals"])


# ---------------------------------------------------------------------------
# Helpers de formato y calidad
# ---------------------------------------------------------------------------

def _fmt_usd(val: float | None) -> str | None:
    if val is None:
        return None
    if abs(val) >= 1e12:
        return f"US$ {val/1e12:.1f}T"
    if abs(val) >= 1e9:
        return f"US$ {val/1e9:.1f}B"
    if abs(val) >= 1e6:
        return f"US$ {val/1e6:.0f}M"
    return f"US$ {val:,.0f}"


def _fmt_pct(val: float | None) -> str | None:
    if val is None:
        return None
    return f"{val*100:.1f}%"


def _fmt_x(val: float | None) -> str | None:
    if val is None:
        return None
    return f"{val:.1f}x"


def _q_ev_ebitda(v: float | None) -> str:
    if v is None or v > 100:   # >100x: casi seguro dato corrupto / mezcla de monedas
        return "neutral"
    return "good" if v < 8 else "warn" if v < 20 else "danger"


def _to_usd(valor: float | None, moneda: str | None, dolar_mep: float) -> float | None:
    """Convierte un importe absoluto a USD según su moneda de origen.
    - moneda == "USD" (o vacía): se asume ya en USD, se devuelve igual.
    - moneda == "ARS" (u otra local): se divide por el MEP.
    Si no se puede convertir con confianza (MEP no disponible), devuelve None.
    """
    if valor is None:
        return None
    if not moneda or moneda.upper() == "USD":
        return valor
    if dolar_mep <= 0:
        return None
    return valor / dolar_mep


def _q_pe(v: float | None) -> str:
    if v is None: return "neutral"
    return "good" if v < 15 else "warn" if v < 30 else "danger"


def _q_roe(v: float | None) -> str:
    if v is None: return "neutral"
    p = v * 100
    return "good" if p > 15 else "warn" if p > 5 else "danger"


def _q_growth(v: float | None) -> str:
    if v is None: return "neutral"
    return "good" if v * 100 > 10 else "warn" if v > 0 else "danger"


def _q_debt_ebitda(v: float | None) -> str:
    if v is None: return "neutral"
    return "good" if v < 2 else "warn" if v < 4 else "danger"


# ---------------------------------------------------------------------------
# Mapeo exchange yfinance → prefijo TradingView
# ---------------------------------------------------------------------------

_YF_TO_TV: dict[str, str] = {
    # NASDAQ (distintas sub-bolsas)
    "NMS": "NASDAQ", "NGM": "NASDAQ", "NCM": "NASDAQ",
    # NYSE
    "NYQ": "NYSE", "NYS": "NYSE",
    # NYSE Arca (ETFs)
    "PCX": "NYSE",
    # AMEX / NYSE American
    "ASE": "AMEX",
    # Buenos Aires (stocks .BA en yfinance)
    "BUE": "BCBA",
}


# CEDEARs cuyo ticker en PPI difiere del símbolo en Yahoo Finance.
# PPI no expone el subyacente, así que por defecto se usa el propio ticker del
# CEDEAR (que coincide con el símbolo US en la mayoría: GOOGL, DIA, BBD, AAPL...).
# Solo agregar acá las excepciones que el log "sin datos de Yahoo" vaya revelando.
# Ej: "BRKB": "BRK-B"
_CEDEAR_OVERRIDE: dict[str, str] = {}


def _tv_symbol(info: dict, ticker: str, categoria: str, subyacente: str | None) -> str:
    """Devuelve el símbolo en formato TradingView (p.ej. NASDAQ:MELI, BCBA:ALUA)."""
    if categoria == "accion_ar":
        return f"BCBA:{ticker}"
    exch   = info.get("exchange", "")
    prefix = _YF_TO_TV.get(exch, "")
    sym    = subyacente or ticker
    return f"{prefix}:{sym}" if prefix else sym


# ---------------------------------------------------------------------------
# yfinance (sync, corre en thread pool)
# ---------------------------------------------------------------------------

def _fetch_yf_sync(yf_ticker: str) -> dict:
    try:
        import yfinance as yf
        info = yf.Ticker(yf_ticker).info
        # Si no hay datos reales (solo metadatos vacíos), descartar
        if not info or (info.get("marketCap") is None and info.get("trailingPE") is None):
            return {}
        return info
    except Exception as exc:
        logger.warning("[yfinance] error %s: %s", yf_ticker, exc)
        return {}


def _build_fundamental(info: dict, ticker: str, descripcion: str, categoria: str,
                        subyacente: str | None, yf_ticker: str, dolar_mep: float = 0.0) -> dict:
    """Transforma el info dict de yfinance al schema de Firestore.

    Manejo de monedas (clave para tickers .BA): yfinance expone DOS monedas que
    pueden NO coincidir:
      - info["currency"]          → moneda de cotización (marketCap, enterpriseValue)
      - info["financialCurrency"] → moneda de los estados (ebitda, totalDebt, ingresos)
    Para empresas argentinas 'currency' suele ser ARS y 'financialCurrency' puede
    ser ARS o USD (ej: PAMP reporta en USD). _fmt_usd() asume USD, así que se
    convierte cada importe con SU moneda antes de formatear y se recalcula EV/EBITDA
    con ambos ya en USD (el enterpriseToEbitda de Yahoo mezcla monedas → 8564x).
    """
    moneda_mkt  = info.get("currency")           # cotización → marketCap, enterpriseValue
    moneda_fin  = info.get("financialCurrency")  # estados    → ebitda, deuda, ingresos
    sector      = info.get("sector")

    ebitda_raw  = info.get("ebitda")
    mg_ebitda   = info.get("ebitdaMargins")
    pe_trail    = info.get("trailingPE")
    pe_fwd      = info.get("forwardPE")
    roe         = info.get("returnOnEquity")
    rev_growth  = info.get("revenueGrowth")
    gross_mg    = info.get("grossMargins")

    # Convertir importes absolutos a USD, cada uno con su moneda de origen
    market_cap  = _to_usd(info.get("marketCap"),       moneda_mkt, dolar_mep)
    ent_value   = _to_usd(info.get("enterpriseValue"), moneda_mkt, dolar_mep)
    ebitda      = _to_usd(ebitda_raw,                  moneda_fin, dolar_mep)
    total_debt  = _to_usd(info.get("totalDebt"),       moneda_fin, dolar_mep)

    # EBITDA / margen: para FINANCIERAS (bancos) EBITDA no es métrica estándar → "no aplica".
    # Para el resto: mostrar el EBITDA si yfinance lo trae (incluso negativo, ej. mineras
    # pre-ganancia como LAR); si falta queda None y la card lo oculta. yfinance devuelve
    # ebitdaMargins=0.0 como sentinela de "sin dato" → 0.0 se trata como None (no "0.0%").
    es_financiero = (sector == "Financial Services")
    if es_financiero:
        ebitda_str = "N/A — no aplica"
        mg_str     = "N/A — no aplica"
    else:
        ebitda_str = _fmt_usd(ebitda)
        mg_str     = _fmt_pct(mg_ebitda) if mg_ebitda else None

    # EV/EBITDA recalculado con ambos ya en USD. Si falta dato → None.
    ev_ebitda: float | None = None
    if ent_value and ebitda and ebitda > 0:
        ev_ebitda = round(ent_value / ebitda, 1)
        if ev_ebitda > 100:           # red de seguridad ante datos inconsistentes
            ev_ebitda = None

    # Deuda/EBITDA: ambos en la misma moneda (moneda_fin) → ratio válido
    debt_ebitda: float | None = None
    if total_debt and ebitda and ebitda > 0:
        debt_ebitda = round(total_debt / ebitda, 1)

    ratios = []
    if pe_trail is not None:
        ratios.append({"label": "P/E trailing", "value": f"{pe_trail:.1f}x", "quality": _q_pe(pe_trail)})
    if pe_fwd is not None:
        ratios.append({"label": "P/E forward",  "value": f"{pe_fwd:.1f}x",  "quality": _q_pe(pe_fwd)})
    if roe is not None:
        ratios.append({"label": "ROE",           "value": _fmt_pct(roe),      "quality": _q_roe(roe)})
    if rev_growth is not None:
        ratios.append({"label": "Crec. ingresos","value": _fmt_pct(rev_growth),"quality": _q_growth(rev_growth)})
    if gross_mg is not None:
        ratios.append({"label": "Mg. Bruto",     "value": _fmt_pct(gross_mg), "quality": "good" if gross_mg > 0.4 else "warn"})
    if debt_ebitda is not None:
        ratios.append({"label": "Deuda/EBITDA",  "value": f"{debt_ebitda:.1f}x", "quality": _q_debt_ebitda(debt_ebitda)})

    return {
        "ticker":        ticker,
        "descripcion":   info.get("longName") or descripcion,
        "sector":        info.get("sector"),
        "industry":      info.get("industryDisp") or info.get("industry"),
        "categoria":     categoria,
        "subyacente_usd": subyacente,
        "yf_ticker":     yf_ticker,
        "tv_symbol":     _tv_symbol(info, ticker, categoria, subyacente),
        "market_cap":    _fmt_usd(market_cap),
        # Métricas clave
        "ebitda_ttm":        ebitda_str,
        "ev_ebitda":         _fmt_x(ev_ebitda),
        "ev_ebitda_quality": _q_ev_ebitda(ev_ebitda),
        "mg_ebitda":         mg_str,
        "ratios":            ratios,
        # Campos Claude — null por defecto; se llenan via /analysis
        "accion_tactica": None,
        "sentimiento":    "neutral",
        "tesis":          None,
        "escenarios":     {"bear": None, "base": None, "bull": None},
        # Metadata
        "data_source":            "yfinance",
        "ultima_actualizacion":   datetime.now(timezone.utc).isoformat(),
    }


async def _fetch_one(yf_ticker: str, ticker: str, descripcion: str,
                     categoria: str, subyacente: str | None,
                     dolar_mep: float = 0.0) -> dict | None:
    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(None, _fetch_yf_sync, yf_ticker)
    if not info:
        return None
    return _build_fundamental(info, ticker, descripcion, categoria, subyacente, yf_ticker, dolar_mep)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

# Campos del análisis de Claude (los escribe save_analysis). refresh_fundamentals
# NO debe pisarlos con los placeholders vacíos que emite _build_fundamental.
_ANALYSIS_KEYS = (
    "accion_tactica", "sentimiento", "tesis", "escenarios",
    "q1_2026", "q1_fuente", "kpis", "comparable_ev_ebitda",
    "analisis_extendido", "fuentes",
    # Output táctico del Contrato de Inversión (anidado bajo "tactico" para no
    # chocar con el accion_tactica fundamental): salud_tesis, accion_tactica,
    # justificacion, urgencia, condicion_espera, mejor_argumento_en_contra.
    "tactico",
)


@router.post("/refresh")
async def refresh_fundamentals(request: Request):
    """
    Obtiene métricas de yfinance para todos los tickers del portfolio y las
    persiste en /users/{uid}/fundamentals/{ticker}.
    merge=True preserva campos Claude (tesis, escenarios, accion_tactica) existentes.
    """
    uid = request.state.uid
    db  = firestore.client()
    ref = db.collection("users").document(uid)

    portfolio = read_user_portfolio(uid)

    # MEP spot para convertir a USD las métricas de empresas .BA reportadas en ARS.
    # Mismo patrón que sync_portfolio: Firestore /market/cotizaciones → PPI.
    cotiz_snap = db.collection("market").document("cotizaciones").get()
    cotiz      = cotiz_snap.to_dict() if cotiz_snap.exists else {}
    dolar_mep  = float(cotiz.get("dolar_mep") or 0)
    if dolar_mep <= 0:
        try:
            dolar_mep = await ppi_client.get_dolar_mep()
        except Exception:
            dolar_mep = 0.0

    # (yf_ticker, ticker, descripcion, categoria, subyacente)
    tasks: list[tuple] = []

    for pos in (portfolio.get("cedears", {}).get("posiciones") or []):
        ticker = pos.get("ticker", "")
        # PPI no expone el subyacente del CEDEAR. El ticker que da PPI ya ES el
        # símbolo de Yahoo en la mayoría de los casos (GOOGL, DIA, BBD...). Preferencia:
        #   1) subyacente_usd si alguna vez viniera poblado
        #   2) override estático para los pocos tickers que difieren del símbolo US
        #   3) el propio ticker como default
        sub = pos.get("subyacente_usd") or _CEDEAR_OVERRIDE.get(ticker) or ticker
        if sub:
            tasks.append((sub, ticker or sub, pos.get("descripcion", ""), "cedear", sub))

    for pos in (portfolio.get("acciones_ar", {}).get("posiciones") or []):
        t = pos.get("ticker", "")
        if t:
            tasks.append((f"{t}.BA", t, pos.get("descripcion", ""), "accion_ar", None))

    if not tasks:
        return {"status": "ok", "mensaje": "No hay tickers para actualizar"}

    # Fetch en lotes de 5 simultáneos para no saturar Yahoo Finance
    BATCH = 5
    results: list[dict] = []
    sin_datos_tickers: list[str] = []
    for i in range(0, len(tasks), BATCH):
        batch = tasks[i:i + BATCH]
        batch_res = await asyncio.gather(
            *[_fetch_one(*t, dolar_mep=dolar_mep) for t in batch],
            return_exceptions=True,
        )
        for t, res in zip(batch, batch_res):
            if isinstance(res, dict):
                results.append(res)
            else:
                # t = (yf_ticker, ticker, descripcion, categoria, subyacente)
                sin_datos_tickers.append(t[1])
                logger.warning(
                    "Fundamentales: sin datos de Yahoo para %s (cat=%s, símbolo=%s)%s",
                    t[1], t[3], t[0],
                    f" — {res!r}" if isinstance(res, Exception) else "",
                )

    fund_col = ref.collection("fundamentals")
    ok = 0
    for fund in results:
        t = fund.get("ticker")
        if not t:
            continue
        try:
            # Preservar el análisis de Claude: _build_fundamental emite placeholders
            # vacíos (accion_tactica=None, escenarios={bear:None,...}) que con merge=True
            # PISARÍAN el análisis ya cargado. Leemos el doc y conservamos sus valores
            # de análisis antes de escribir las métricas de mercado.
            snap = fund_col.document(t).get()
            if snap.exists:
                ex = snap.to_dict() or {}
                for k in _ANALYSIS_KEYS:
                    if k in ex:
                        fund[k] = ex[k]
            fund_col.document(t).set(fund, merge=True)
            ok += 1
        except Exception as exc:
            logger.error("Error guardando fundamental %s: %s", t, exc)

    return {
        "status":               "ok",
        "tickers_actualizados": ok,
        "tickers_sin_datos":    len(sin_datos_tickers),
        "sin_datos_detalle":    sin_datos_tickers,
        "detalle":              [r.get("ticker") for r in results],
    }


@router.post("/{ticker}/analysis")
async def save_analysis(ticker: str, request: Request):
    """
    Guarda el análisis generado por Claude para un ticker:
    accion_tactica, sentimiento, tesis, escenarios.
    Se fusiona (merge) con las métricas de yfinance ya guardadas.
    """
    uid  = request.state.uid
    body = await request.json()

    # Todos los campos que el esquema del prompt fundamental le pide a Claude
    # (contextBuilder.buildFundamentalContext) y que FundCard sabe renderizar.
    # Misma lista que preserva refresh_fundamentals (_ANALYSIS_KEYS).
    data = {k: v for k, v in body.items() if k in _ANALYSIS_KEYS}
    if not data:
        return {"status": "ok", "mensaje": "Sin campos para guardar"}

    data["ultima_analisis"] = datetime.now(timezone.utc).isoformat()

    db = firestore.client()
    db.collection("users").document(uid) \
      .collection("fundamentals").document(ticker) \
      .set(data, merge=True)

    return {"status": "ok", "ticker": ticker}
