from pydantic import BaseModel
from typing import Optional


class Cotizaciones(BaseModel):
    dolar_mep: float = 0.0
    dolar_ccl: float = 0.0
    dolar_bna: float = 0.0
    dolar_oficial: float = 0.0
    riesgo_pais_pb: int = 0
    # Mínimo histórico de riesgo país y el período desde el cual no había un valor más bajo
    riesgo_pais_min: Optional[int] = None
    riesgo_pais_min_desde: Optional[str] = None
    ultima_actualizacion: str = ""
