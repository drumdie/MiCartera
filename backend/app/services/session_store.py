"""Cache de DEKs desbloqueadas por usuario (SEC-1 · F1b).

Cuando un usuario hace ``POST /api/session/unlock`` con su passphrase, el backend
desenvuelve la DEK y la guarda ACÁ, en RAM, con un TTL corto. Las llamadas
siguientes (sync, holdings, …) la recuperan para descifrar las credenciales del
broker server-side, sin que el frontend vea nada en claro.

Decisión de arquitectura (ver ``ROADMAP.md`` → SEC-1 → "Decisiones tomadas"):
hoy se usa la **implementación A** (en proceso, ``max-instances=1``). La interfaz
``SessionStore`` es **swappable**: el día que haya carga multi-user real se cambia
por una impl B (Memorystore/Redis cifrado) **sin tocar el flujo /unlock**. La DEK
nunca se persiste ni se loguea; en cache-miss el cliente re-desbloquea (transparente).
"""
from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod

# Ventana de INACTIVIDAD del desbloqueo (segundos): 3 min, modelo bank-like. Es *sliding* —
# cada uso autenticado la renueva (ver get()), así un usuario activo no se corta a mitad de
# acción, pero 3 min sin actividad → la DEK se descarta y hay que re-ingresar la passphrase.
# Alineado con el lock de inactividad del front (useSessionSecurity, 3 min).
DEFAULT_TTL_SECONDS = 180


class SessionStore(ABC):
    """Interfaz swappable A→B. Guarda la DEK desbloqueada por uid con expiración."""

    @abstractmethod
    def set(self, uid: str, dek: bytes, ttl: int = DEFAULT_TTL_SECONDS) -> None: ...

    @abstractmethod
    def get(self, uid: str) -> bytes | None:
        """DEK si está desbloqueada y no expiró; si no, ``None`` (→ re-unlock)."""

    @abstractmethod
    def clear(self, uid: str) -> None: ...


class InProcessSessionStore(SessionStore):
    """Impl A: dict en memoria del proceso, thread-safe, con expiración perezosa."""

    def __init__(self) -> None:
        # uid -> (dek, expires_at, ttl). Guardamos el ttl para renovar (sliding) en cada get.
        self._data: dict[str, tuple[bytes, float, int]] = {}
        self._lock = threading.Lock()

    def set(self, uid: str, dek: bytes, ttl: int = DEFAULT_TTL_SECONDS) -> None:
        with self._lock:
            self._data[uid] = (dek, time.monotonic() + ttl, ttl)

    def get(self, uid: str) -> bytes | None:
        with self._lock:
            entry = self._data.get(uid)
            if entry is None:
                return None
            dek, expires_at, ttl = entry
            if time.monotonic() >= expires_at:
                del self._data[uid]
                return None
            # Sliding: cada uso renueva la ventana de inactividad.
            self._data[uid] = (dek, time.monotonic() + ttl, ttl)
            return dek

    def clear(self, uid: str) -> None:
        with self._lock:
            self._data.pop(uid, None)


# Singleton del proceso. Esta línea es la pieza swappable: para escalar, reemplazar
# InProcessSessionStore() por la impl B (Memorystore) — el resto del código no cambia.
session_store: SessionStore = InProcessSessionStore()
