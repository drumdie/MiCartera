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
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.core.config import settings


class PPIError(Exception):
    pass


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
                raise PPIError(f"PPI login falló: {resp.status_code} {resp.text}")

            data = resp.json()
            self._access_token = data.get("accessToken") or data.get("AccessToken")
            if not self._access_token:
                raise PPIError(f"PPI login: no accessToken en respuesta: {data}")
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
                raise PPIError(f"PPI GET {path} → {resp.status_code}: {resp.text}")
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

    async def get_average_costs(self) -> dict:
        """
        Calcula el precio promedio ponderado de compra por ticker
        usando el historial de movimientos de los últimos 2 años.
        Fetchea en chunks de 180 días para evitar el límite de registros de PPI.
        Devuelve {ticker: precio_promedio_en_moneda_original}
        """
        date_to   = datetime.now(timezone.utc)
        date_from = date_to - timedelta(days=1095)  # 3 años para cubrir el historial completo

        # Chunks de 180 días en orden cronológico
        all_movements: list = []
        chunk_start = date_from
        while chunk_start < date_to:
            chunk_end = min(date_to, chunk_start + timedelta(days=179))
            try:
                chunk = await self.get_movements(
                    chunk_start.strftime("%Y-%m-%d"),
                    chunk_end.strftime("%Y-%m-%d"),
                )
                all_movements.extend(chunk)
            except Exception as exc:
                print(f"[PPI] movimientos {chunk_start.date()}/{chunk_end.date()}: {exc}")
            chunk_start = chunk_end + timedelta(days=1)

        # Promedio ponderado móvil:
        # amount < 0 → compra; amount > 0 → venta
        acum: dict = {}  # {ticker: {"qty": float, "cost": float}}

        for mov in all_movements:
            ticker = mov.get("ticker", "")
            if not ticker or ticker == "Ticker not found":
                continue
            qty    = abs(float(mov.get("quantity", 0)))
            price  = float(mov.get("price",    0))
            amount = float(mov.get("amount",   0))
            if qty == 0 or price == 0:
                continue

            if ticker not in acum:
                acum[ticker] = {"qty": 0.0, "cost": 0.0}

            if amount < 0:  # compra — desembolso real incluye comisiones
                acum[ticker]["qty"]  += qty
                acum[ticker]["cost"] += abs(amount)
            elif amount > 0 and acum[ticker]["qty"] > 0:  # venta
                avg = acum[ticker]["cost"] / acum[ticker]["qty"]
                acum[ticker]["qty"]  = max(0.0, acum[ticker]["qty"] - qty)
                acum[ticker]["cost"] = acum[ticker]["qty"] * avg

        return {
            ticker: round(pos["cost"] / pos["qty"], 6)
            for ticker, pos in acum.items()
            if pos["qty"] > 0 and pos["cost"] > 0
        }

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
