"""Capa de adaptador de broker (BROKER-ABS · contemplado en SEC-2).

MiCartera es **multi-user y multi-broker** desde el día 1 — NO es una app PPI. Esta
capa abstrae al broker detrás de una interfaz (``BrokerClient``) para que el resto del
backend (sync, verificación de credenciales) sea **broker-agnóstico**: habla de
"broker credentials" y "broker client", no de PPI.

Estado actual: el único adaptador implementado es ``PPIBrokerClient``, que **envuelve**
el ``ppi_client`` existente SIN reescribir su lógica. El día que se sumen otros brokers,
se agrega una implementación nueva y se registra en ``get_broker_client`` — el resto del
código no cambia. NO implementamos otros brokers todavía (faltan sus API docs).

Selección por-usuario: cada usuario tiene un campo ``broker_type`` (default ``"ppi"``),
guardado junto a sus credenciales (``/users/{uid}/broker/data``). ``get_broker_client``
lo resuelve al adaptador correspondiente.

Las credenciales viajan como un ``BrokerCredentials`` genérico (dict-like, las 5 claves
que hoy usa PPI). Cada adaptador las traduce al formato que su cliente concreto necesita
(p.ej. ``PPICredentials``). El backend nunca asume el formato interno de un broker.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from app.services.ppi_client import PPICredentials, ppi_client

logger = logging.getLogger(__name__)

# Tipo de broker por defecto cuando el usuario no tiene uno seteado (compatibilidad con
# las cuentas existentes, que se crearon contra PPI).
DEFAULT_BROKER_TYPE = "ppi"


@dataclass(frozen=True)
class BrokerCredentials:
    """Credenciales genéricas del broker (broker-agnósticas).

    Hoy modelan las 5 claves que usa PPI; otros brokers que solo necesiten un subconjunto
    (o nombres distintos) las mapean en su propio adaptador. ``broker_type`` selecciona el
    adaptador. No se loguea ningún valor.
    """

    authorized_client: str = ""
    client_key: str = ""
    api_key: str = ""
    api_secret: str = ""
    account_number: str = ""
    broker_type: str = DEFAULT_BROKER_TYPE

    @classmethod
    def from_dict(cls, data: dict, *, broker_type: str | None = None) -> "BrokerCredentials":
        return cls(
            authorized_client=str(data.get("authorized_client", "")).strip(),
            client_key=str(data.get("client_key", "")).strip(),
            api_key=str(data.get("api_key", "")).strip(),
            api_secret=str(data.get("api_secret", "")).strip(),
            account_number=str(data.get("account_number", "")).strip(),
            broker_type=(broker_type or str(data.get("broker_type", "")).strip() or DEFAULT_BROKER_TYPE),
        )


@runtime_checkable
class BrokerClient(Protocol):
    """Interfaz que todo adaptador de broker debe cumplir.

    Solo expone lo que el backend necesita: traer posiciones (para verificar el login) y
    el cómputo del portfolio se sigue haciendo en ``_build_user_portfolio`` con el cliente
    concreto. Se mantiene chico a propósito; crece cuando se sumen brokers reales.
    """

    broker_type: str

    async def get_account_positions(self) -> list:
        """Posiciones actuales de la cuenta. Lanza si el login del broker falla."""
        ...


class PPIBrokerClient:
    """Adaptador PPI: envuelve el ``ppi_client`` existente (no reescribe su lógica).

    Traduce las ``BrokerCredentials`` genéricas a ``PPICredentials`` y delega. Expone
    además ``ppi_credentials`` para los flujos que todavía pasan ``PPICredentials`` directo
    al núcleo de sync (``_build_user_portfolio``) — así no hay que tocar esa lógica probada.
    """

    broker_type = "ppi"

    def __init__(self, credentials: BrokerCredentials):
        self._creds = credentials
        self.ppi_credentials = PPICredentials(
            authorized_client=credentials.authorized_client,
            client_key=credentials.client_key,
            api_key=credentials.api_key,
            api_secret=credentials.api_secret,
            account_number=credentials.account_number,
        )

    async def get_account_positions(self) -> list:
        return await ppi_client.get_account_positions(credentials=self.ppi_credentials)


# Registro de adaptadores disponibles. Sumar acá cuando haya nuevos brokers.
_BROKER_REGISTRY: dict[str, type] = {
    "ppi": PPIBrokerClient,
}


def get_broker_client(credentials: BrokerCredentials) -> BrokerClient:
    """Resuelve el adaptador para ``credentials.broker_type`` (default ``ppi``).

    Brokers no soportados todavía caen al adaptador PPI con un warning (no rompen el flujo
    de la cuenta existente). Cuando se implementen otros, esto pasa a ser un error explícito.
    """
    broker_type = credentials.broker_type or DEFAULT_BROKER_TYPE
    impl = _BROKER_REGISTRY.get(broker_type)
    if impl is None:
        logger.warning(
            "broker_type '%s' no soportado todavía; usando adaptador PPI por defecto",
            broker_type,
        )
        impl = PPIBrokerClient
    return impl(credentials)
