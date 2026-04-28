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
                json={
                    "ApiKey":    settings.PPI_API_KEY,
                    "ApiSecret": settings.PPI_API_SECRET,
                },
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                raise PPIError(f"PPI login falló: {resp.status_code} {resp.text}")

            data = resp.json()
            self._access_token = data["AccessToken"]
            expires_in = int(data.get("ExpiresIn", 3600))
            # Restamos 60 s de margen para renovar antes de que venza
            self._token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)

    async def _ensure_auth(self) -> str:
        """Retorna un access token válido, renovándolo si expiró."""
        if not self._access_token or datetime.now(timezone.utc) >= self._token_expiry:
            await self._login()
        return self._access_token

    # ------------------------------------------------------------------
    # Request base
    # ------------------------------------------------------------------

    async def _get(self, path: str, params: dict | None = None) -> dict | list:
        token = await self._ensure_auth()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{settings.PPI_BASE_URL}{path}",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401:
                # Token rechazado → re-login y reintento
                self._access_token = None
                token = await self._ensure_auth()
                resp = await client.get(
                    f"{settings.PPI_BASE_URL}{path}",
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
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
            "/api/1.0/Account/GetCurrentPortfolio",
            params={"accountNumber": settings.PPI_ACCOUNT_NUMBER},
        )
        # PPI puede devolver la lista directa o dentro de un campo "Items"
        return data if isinstance(data, list) else data.get("Items", [])

    # ------------------------------------------------------------------
    # Cotizaciones de mercado
    # ------------------------------------------------------------------

    async def get_market_price(
        self,
        ticker: str,
        instrument_type: str = "Acciones",
        settlement: str = "T2",
    ) -> float:
        """
        Retorna el último precio de un instrumento.
        settlement: "T0" | "T1" | "T2" | "T+1" | "T+2" (según el instrumento)
        """
        data = await self._get(
            "/api/1.0/MarketData/Current",
            params={
                "instrumentType": instrument_type,
                "settlement": settlement,
                "ticker": ticker,
            },
        )
        # PPI puede devolver "price", "last" o "Price"
        return float(
            data.get("price") or data.get("last") or data.get("Price") or 0
        )

    async def get_dolar_mep(self) -> float:
        """
        Dólar MEP ≈ AL30 en ARS / AL30D en USD (liquidación 24hs).
        AL30  = bono soberano en ARS
        AL30D = mismo bono en USD (ticker con "D" = dólar cable)
        """
        try:
            price_ars = await self.get_market_price("AL30",  "Bonos", "T+1")
            price_usd = await self.get_market_price("AL30D", "Bonos", "T+1")
            if price_usd > 0:
                return round(price_ars / price_usd, 2)
        except Exception as exc:
            print(f"[PPI] Error calculando MEP: {exc}")
        return 0.0

    async def get_dolar_ccl(self) -> float:
        """
        Dólar CCL ≈ GD30 en ARS / GD30D en USD (liquidación 48hs).
        """
        try:
            price_ars = await self.get_market_price("GD30",  "Bonos", "T+2")
            price_usd = await self.get_market_price("GD30D", "Bonos", "T+2")
            if price_usd > 0:
                return round(price_ars / price_usd, 2)
        except Exception as exc:
            print(f"[PPI] Error calculando CCL: {exc}")
        return 0.0


# Instancia singleton — reutiliza el token entre llamadas dentro del mismo proceso
ppi_client = PPIClient()
