from typing import List
from pydantic import BaseModel, Field


class StressEscenario(BaseModel):
    nombre: str
    descripcion: str
    supuesto: str
    impacto_cartera_pct: float
    tickers_mas_afectados: List[str] = Field(default_factory=list)
    amortiguadores: List[str] = Field(default_factory=list)


class StressTest(BaseModel):
    escenarios: List[StressEscenario]
    ultima_actualizacion: str
