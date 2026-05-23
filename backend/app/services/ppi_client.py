"""
Cliente para la API de Portfolio Personal Inversiones (PPI).
Documentación: https://clientapi.portfoliopersonal.com/swagger

Flujo de autenticación:
  POST /api/1.0/Account/LoginApi  → {AccessToken, RefreshToken, ExpiresIn}
  Todas las requests siguientes llevan Authorization: Bearer <AccessToken>

Los endpoints reales pueden variar. Ajustar según respuestas de la API.
"""
from __future__ import annotations

import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

_logger = logging.getLogger(__name__)

from app.core.config import settings


class PPIError(Exception):
    pass


# ---------------------------------------------------------------------------
# Cache en memoria del MEP histórico (bluelytics.com.ar)
# Se carga una sola vez por proceso y se reutiliza en todos los syncs.
# ---------------------------------------------------------------------------
_mep_history_cache: dict[str, float] = {}   # {"2023-11-22": 987.5, ...}
_mep_history_loaded: bool = False


async def _ensure_mep_history() -> dict[str, float]:
    """
    Descarga el historial completo de Dólar MEP (bolsa) desde argentinadatos.com
    y lo guarda en memoria. La próxima llamada devuelve el cache sin re-descargar.

    Fuente: GET https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa
    Formato: [{"casa": "bolsa", "compra": x, "venta": x, "fecha": "YYYY-MM-DD"}, ...]
    Cobertura: desde 2018-10-29 hasta hoy (~2700 registros).

    Formato de retorno: {"YYYY-MM-DD": tasa_venta_mep, ...}
    """
    global _mep_history_cache, _mep_history_loaded
    if _mep_history_loaded:
        return _mep_history_cache

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa"
            )
            if resp.is_success:
                data = resp.json()
                for entry in (data if isinstance(data, list) else []):
                    date_str = str(entry.get("fecha", ""))[:10]
                    sell     = float(entry.get("venta") or entry.get("compra") or 0)
                    if date_str and sell > 0:
                        _mep_history_cache[date_str] = sell
                _mep_history_loaded = True
                print(f"[ARGENTINADATOS] MEP histórico cargado: {len(_mep_history_cache)} fechas")
    except Exception as exc:
        print(f"[ARGENTINADATOS] Error cargando MEP histórico: {exc}")

    return _mep_history_cache


def _get_mep_for_date(date_str: str, mep_history: dict[str, float]) -> float:
    """
    Devuelve el MEP de venta para una fecha dada.
    Si no existe ese día exacto (feriado/fin de semana), busca el día anterior
    más cercano dentro de los 7 días previos.
    """
    for delta in range(8):
        try:
            from datetime import date as _date, timedelta as _td
            target = (_date.fromisoformat(date_str[:10]) - _td(days=delta)).isoformat()
            if target in mep_history:
                return mep_history[target]
        except Exception:
            break
    return 0.0


def _ars_unit_price(
    price: float,
    date_key: str,
    ref_price: float,
    mep_history: dict[str, float],
) -> float:
    """
    Retorna el precio unitario en ARS.
    Si el precio viene en USD (price << ref_price por factor >50x),
    lo convierte usando el MEP histórico exacto del día.
    Fallback: potencia de 10 más cercana al ratio.
    """
    import math as _math
    if price <= 0 or ref_price <= 0:
        return price
    ratio = ref_price / price
    if ratio <= 50:
        return price                        # ya está en ARS
    mep = _get_mep_for_date(date_key, mep_history)
    if mep > 0:
        return price * mep                  # conversión exacta con MEP histórico
    power = round(_math.log10(ratio))
    return price * (10 ** max(1, power))    # fallback ×10^n


class PPIClient:
    def __init__(self) -> None:
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Autenticación
    # ------------------------------------------------------------------

    async def _login(self) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.PPI_BASE_URL}/api/1.0/Account/LoginApi",
                headers={
                    "AuthorizedClient": settings.PPI_AUTHORIZED_CLIENT,
                    "ClientKey":        settings.PPI_CLIENT_KEY,
                    "ApiKey":           settings.PPI_API_KEY,
                    "ApiSecret":        settings.PPI_API_SECRET,
                },
            )
            if resp.status_code != 200:
                _logger.error("PPI login falló: %s %s", resp.status_code, resp.text)
                raise PPIError(f"PPI login falló (HTTP {resp.status_code})")

            data = resp.json()
            self._access_token = data.get("accessToken") or data.get("AccessToken")
            if not self._access_token:
                _logger.error("PPI login: no accessToken en respuesta: %s", data)
                raise PPIError("PPI login: respuesta inesperada del servidor")
            # expirationDate es ISO datetime; si no está, asumimos 1 hora
            exp = data.get("expirationDate") or data.get("ExpiresIn")
            try:
                self._token_expiry = datetime.fromisoformat(exp.replace("Z", "+00:00")) - timedelta(seconds=60)
            except Exception:
                self._token_expiry = datetime.now(timezone.utc) + timedelta(seconds=3540)

    async def _ensure_auth(self) -> str:
        """Retorna un access token válido, renovándolo si expiró."""
        if not self._access_token or datetime.now(timezone.utc) >= self._token_expiry:
            await self._login()
        return self._access_token

    # ------------------------------------------------------------------
    # Request base
    # ------------------------------------------------------------------

    def _auth_headers(self, token: str) -> dict:
        return {
            "Authorization":   f"Bearer {token}",
            "AuthorizedClient": settings.PPI_AUTHORIZED_CLIENT,
            "ClientKey":        settings.PPI_CLIENT_KEY,
            "ApiKey":           settings.PPI_API_KEY,
            "ApiSecret":        settings.PPI_API_SECRET,
        }

    async def _get(self, path: str, params: dict | None = None) -> dict | list:
        token = await self._ensure_auth()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{settings.PPI_BASE_URL}{path}",
                params=params,
                headers=self._auth_headers(token),
            )
            if resp.status_code == 401:
                self._access_token = None
                token = await self._ensure_auth()
                resp = await client.get(
                    f"{settings.PPI_BASE_URL}{path}",
                    params=params,
                    headers=self._auth_headers(token),
                )
            if not resp.is_success:
                _logger.error("PPI GET %s → %s: %s", path, resp.status_code, resp.text)
                raise PPIError(f"PPI GET {path} → HTTP {resp.status_code}")
            return resp.json()

    # ------------------------------------------------------------------
    # Portfolio
    # ------------------------------------------------------------------

    async def get_account_positions(self) -> list:
        """
        Retorna las posiciones actuales de la cuenta.
        PPI devuelve una lista de instrumentos con cantidad, precio y valor de mercado.

        Endpoint esperado: GET /api/1.0/Account/GetCurrentPortfolio
        Query param: accountNumber (número de comitente PPI)

        Estructura típica de cada item:
        {
          "Ticker": "ALUA",
          "Description": "Aluar Aluminio Argentino",
          "Category": "Acciones",       ← se mapea a categoria MiCartera
          "Amount": 1000,               ← cantidad
          "Price": 150.50,              ← precio actual ARS
          "MarketValue": 150500,        ← valor corriente ARS
          "AverageCost": 120.0,         ← precio promedio de compra
          "Currency": "ARS"
        }
        """
        data = await self._get(
            "/api/1.0/Account/BalancesAndPositions",
            params={"accountNumber": settings.PPI_ACCOUNT_NUMBER},
        )
        result = []

        # Aplanar posiciones: [{name, instruments:[...]}]
        for group in data.get("groupedInstruments", []):
            category = group.get("name", "")
            for inst in group.get("instruments", []):
                result.append({**inst, "Category": category})

        # Aplanar liquidez: solo saldo INMEDIATA > 0
        for group in data.get("groupedAvailability", []):
            for avail in group.get("availability", []):
                amt = float(avail.get("amount", 0))
                if avail.get("settlement") == "INMEDIATA" and amt > 0:
                    symbol = avail.get("symbol", "ARS")
                    result.append({
                        "ticker":      symbol,
                        "description": avail.get("name", symbol),
                        "quantity":    amt,
                        "price":       1.0,
                        "amount":      amt,
                        "currency":    "Pesos" if symbol == "ARS" else "Dolares billete",
                        "Category":    "disponibilidades",
                    })

        return result

    # ------------------------------------------------------------------
    # Movimientos y rendimientos
    # ------------------------------------------------------------------

    async def get_movements(self, date_from: str, date_to: str) -> list:
        """
        Trae movimientos de la cuenta en un rango de fechas.
        date_from / date_to: strings "YYYY-MM-DD"
        Cada movimiento incluye: ticker, quantity, price, currency, description, settlementDate
        """
        data = await self._get(
            "/api/1.0/Account/Movements",
            params={
                "accountNumber": settings.PPI_ACCOUNT_NUMBER,
                "dateFrom":      date_from,
                "dateTo":        date_to,
            },
        )
        return data if isinstance(data, list) else data.get("movements", data.get("data", []))

    async def compute_avg_costs(
        self,
        cached_state: dict | None = None,
    ) -> tuple[dict[str, float], dict]:
        """
        Calcula precio promedio ponderado de compra con soporte incremental.

        Primera vez (cached_state=None): fetcha 5 años de movimientos y construye
        el estado completo. Tarda ~10-15 s.

        Syncs siguientes (cached_state presente): fetcha solo desde
        last_processed_date − 5 días (buffer para liquidaciones tardías).
        Tarda ~1-2 s.

        Returns:
            avg_costs  : {ticker: precio_promedio_ars}
            new_state  : documento a persistir en Firestore /users/{uid}/meta/avg_costs
        """
        import math
        import statistics as _stats

        now = datetime.now(timezone.utc)

        # Cargar MEP histórico (en memoria si ya se descargó, sino fetch una vez)
        mep_history = await _ensure_mep_history()

        # Determinar ventana de fetch
        if cached_state and cached_state.get("last_processed_date"):
            raw_last = cached_state["last_processed_date"]
            try:
                last_dt = datetime.fromisoformat(raw_last.replace("Z", "+00:00"))
            except Exception:
                last_dt = now - timedelta(days=1825)
            date_from  = last_dt - timedelta(days=5)  # buffer liquidaciones tardías
            is_full    = False
        else:
            date_from  = now - timedelta(days=1825)   # 5 años
            is_full    = True

        # Fetch de movimientos en chunks
        all_movements: list = []
        chunk_start = date_from
        while chunk_start < now:
            chunk_end = min(now, chunk_start + timedelta(days=179))
            try:
                chunk = await self.get_movements(
                    chunk_start.strftime("%Y-%m-%d"),
                    chunk_end.strftime("%Y-%m-%d"),
                )
                all_movements.extend(chunk)
            except Exception as exc:
                print(f"[PPI] movimientos {chunk_start.date()}/{chunk_end.date()}: {exc}")
            chunk_start = chunk_end + timedelta(days=1)

        # Agrupar por ticker y ordenar cronológicamente
        by_ticker: dict[str, list] = {}
        latest_date = cached_state.get("last_processed_date", "") if cached_state else ""
        for mov in all_movements:
            ticker = mov.get("ticker", "")
            if not ticker or ticker == "Ticker not found":
                continue
            qty    = abs(float(mov.get("quantity", 0)))
            price  = float(mov.get("price", 0))
            amount = float(mov.get("amount", 0))
            if qty == 0 or price == 0:
                continue
            date_key = mov.get("settlementDate") or mov.get("date") or ""
            if date_key > latest_date:
                latest_date = date_key
            by_ticker.setdefault(ticker, []).append(
                {"qty": qty, "price": price, "amount": amount, "date": date_key}
            )
        for movs in by_ticker.values():
            movs.sort(key=lambda m: m["date"])

        if is_full:
            # Calcular mediana de precios por ticker para detectar outliers USD
            medians: dict[str, float] = {}
            for ticker, movs in by_ticker.items():
                prices = [m["price"] for m in movs if m["price"] > 0]
                if len(prices) >= 2:
                    medians[ticker] = _stats.median(prices)

            # Promedio ponderado desde cero usando precio de ejecución (sin comisiones)
            acum: dict[str, dict] = {}
            for ticker, movs in by_ticker.items():
                acum[ticker] = {"qty": 0.0, "total_cost": 0.0}
                ref = medians.get(ticker, 0.0)
                for m in movs:
                    unit_price = _ars_unit_price(m["price"], m["date"], ref, mep_history)
                    if m["amount"] < 0:                          # compra
                        acum[ticker]["qty"]        += m["qty"]
                        acum[ticker]["total_cost"] += m["qty"] * unit_price
                    elif m["amount"] > 0 and acum[ticker]["qty"] > 0:  # venta
                        avg = acum[ticker]["total_cost"] / acum[ticker]["qty"]
                        acum[ticker]["qty"]        = max(0.0, acum[ticker]["qty"] - m["qty"])
                        acum[ticker]["total_cost"] = acum[ticker]["qty"] * avg
        else:
            # Sync incremental: partir desde el estado cacheado
            acum = {}
            for ticker, state in (cached_state.get("tickers") or {}).items():
                acum[ticker] = {
                    "qty":        float(state.get("qty", 0)),
                    "total_cost": float(state.get("total_cost", 0)),
                }

            for ticker, movs in by_ticker.items():
                if ticker not in acum:
                    acum[ticker] = {"qty": 0.0, "total_cost": 0.0}
                cur_avg = (
                    acum[ticker]["total_cost"] / acum[ticker]["qty"]
                    if acum[ticker]["qty"] > 0 else 0.0
                )
                for m in movs:
                    unit_price = _ars_unit_price(m["price"], m["date"], cur_avg, mep_history)
                    if m["amount"] < 0:                          # compra
                        acum[ticker]["qty"]        += m["qty"]
                        acum[ticker]["total_cost"] += m["qty"] * unit_price
                        if acum[ticker]["qty"] > 0:
                            cur_avg = acum[ticker]["total_cost"] / acum[ticker]["qty"]
                    elif m["amount"] > 0 and acum[ticker]["qty"] > 0:  # venta
                        cur_avg = acum[ticker]["total_cost"] / acum[ticker]["qty"]
                        acum[ticker]["qty"]        = max(0.0, acum[ticker]["qty"] - m["qty"])
                        acum[ticker]["total_cost"] = acum[ticker]["qty"] * cur_avg

        avg_costs = {
            ticker: round(pos["total_cost"] / pos["qty"], 6)
            for ticker, pos in acum.items()
            if pos["qty"] > 0 and pos["total_cost"] > 0
        }

        new_state = {
            "full_sync_completed": True,
            "last_processed_date": latest_date,
            "ultima_actualizacion": now.isoformat(),
            "tickers": {
                ticker: {
                    "qty":        round(pos["qty"], 6),
                    "total_cost": round(pos["total_cost"], 2),
                }
                for ticker, pos in acum.items()
                if pos["qty"] > 0 and pos["total_cost"] > 0
            },
        }

        return avg_costs, new_state

    async def get_average_costs(self) -> dict:
        """Versión legacy usada por los endpoints de debug. Delega a compute_avg_costs."""
        avg_costs, _ = await self.compute_avg_costs(cached_state=None)
        return avg_costs

    # ------------------------------------------------------------------
    # Cotizaciones de mercado
    # ------------------------------------------------------------------

    async def get_market_price(
        self,
        ticker: str,
        instrument_type: str = "ACCIONES",
        settlement: str = "A-48HS",
    ) -> float:
        data = await self.get_market_data(ticker, instrument_type, settlement)
        return float(data.get("price") or data.get("last") or data.get("Price") or 0)

    async def get_market_data(
        self,
        ticker: str,
        instrument_type: str,
        settlement: str,
    ) -> dict:
        """
        Retorna datos completos de mercado para un instrumento.
        Campos típicos: price, openingPrice, max, min, volume, date
        """
        try:
            data = await self._get(
                "/api/1.0/MarketData/Current",
                params={
                    "Type":       instrument_type,
                    "Settlement": settlement,
                    "Ticker":     ticker,
                },
            )
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    async def get_dolar_mep(self) -> float:
        """
        Dólar MEP ≈ AL30 en ARS / AL30D en USD (liquidación A-24HS).
        """
        try:
            price_ars = await self.get_market_price("AL30",  "BONOS", "A-24HS")
            price_usd = await self.get_market_price("AL30D", "BONOS", "A-24HS")
            if price_usd > 0:
                return round(price_ars / price_usd, 2)
        except Exception as exc:
            print(f"[PPI] Error calculando MEP: {exc}")
        return 0.0

    async def get_dolar_ccl(self) -> float:
        """
        Dólar CCL ≈ GD30 en ARS / GD30D en USD (liquidación A-48HS).
        """
        try:
            price_ars = await self.get_market_price("GD30",  "BONOS", "A-48HS")
            price_usd = await self.get_market_price("GD30D", "BONOS", "A-48HS")
            if price_usd > 0:
                return round(price_ars / price_usd, 2)
        except Exception as exc:
            print(f"[PPI] Error calculando CCL: {exc}")
        return 0.0


# Instancia singleton — reutiliza el token entre llamadas dentro del mismo proceso
ppi_client = PPIClient()
