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
    if v is None: return "neutral"
    return "good" if v < 8 else "warn" if v < 20 else "danger"


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
                        subyacente: str | None, yf_ticker: str) -> dict:
    """Transforma el info dict de yfinance al schema de Firestore."""
    ebitda      = info.get("ebitda")
    ev_ebitda   = info.get("enterpriseToEbitda")
    mg_ebitda   = info.get("ebitdaMargins")
    pe_trail    = info.get("trailingPE")
    pe_fwd      = info.get("forwardPE")
    roe         = info.get("returnOnEquity")
    rev_growth  = info.get("revenueGrowth")
    gross_mg    = info.get("grossMargins")
    total_debt  = info.get("totalDebt")

    # Deuda/EBITDA derivado
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
        "market_cap":    _fmt_usd(info.get("marketCap")),
        # Métricas clave
        "ebitda_ttm":        _fmt_usd(ebitda),
        "ev_ebitda":         _fmt_x(ev_ebitda),
        "ev_ebitda_quality": _q_ev_ebitda(ev_ebitda),
        "mg_ebitda":         _fmt_pct(mg_ebitda),
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
                     categoria: str, subyacente: str | None) -> dict | None:
    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(None, _fetch_yf_sync, yf_ticker)
    if not info:
        return None
    return _build_fundamental(info, ticker, descripcion, categoria, subyacente, yf_ticker)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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

    cedears_snap  = ref.collection("portfolio").document("cedears").get()
    acciones_snap = ref.collection("portfolio").document("acciones_ar").get()

    # (yf_ticker, ticker, descripcion, categoria, subyacente)
    tasks: list[tuple] = []

    if cedears_snap.exists:
        for pos in (cedears_snap.to_dict().get("posiciones") or []):
            sub = pos.get("subyacente_usd") or pos.get("subyacente")
            if sub:
                tasks.append((sub, pos.get("ticker", sub), pos.get("descripcion", ""), "cedear", sub))

    if acciones_snap.exists:
        for pos in (acciones_snap.to_dict().get("posiciones") or []):
            t = pos.get("ticker", "")
            if t:
                tasks.append((f"{t}.BA", t, pos.get("descripcion", ""), "accion_ar", None))

    if not tasks:
        return {"status": "ok", "mensaje": "No hay tickers para actualizar"}

    # Fetch en lotes de 5 simultáneos para no saturar Yahoo Finance
    BATCH = 5
    results: list[dict] = []
    for i in range(0, len(tasks), BATCH):
        batch = tasks[i:i + BATCH]
        batch_res = await asyncio.gather(
            *[_fetch_one(*t) for t in batch],
            return_exceptions=True,
        )
        for res in batch_res:
            if isinstance(res, dict):
                results.append(res)

    fund_col = ref.collection("fundamentals")
    ok, sin_datos = 0, len(tasks) - len(results)
    for fund in results:
        t = fund.get("ticker")
        if not t:
            continue
        try:
            # merge=True: preserva tesis/escenarios/accion_tactica existentes
            fund_col.document(t).set(fund, merge=True)
            ok += 1
        except Exception as exc:
            logger.error("Error guardando fundamental %s: %s", t, exc)

    return {
        "status":               "ok",
        "tickers_actualizados": ok,
        "tickers_sin_datos":    sin_datos,
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

    allowed = {"accion_tactica", "sentimiento", "tesis", "escenarios"}
    data = {k: v for k, v in body.items() if k in allowed}
    if not data:
        return {"status": "ok", "mensaje": "Sin campos para guardar"}

    data["ultima_analisis"] = datetime.now(timezone.utc).isoformat()

    db = firestore.client()
    db.collection("users").document(uid) \
      .collection("fundamentals").document(ticker) \
      .set(data, merge=True)

    return {"status": "ok", "ticker": ticker}
