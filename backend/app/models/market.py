from pydantic import BaseModel


class Cotizaciones(BaseModel):
    dolar_mep: float = 0.0
    dolar_ccl: float = 0.0
    dolar_bna: float = 0.0
    dolar_oficial: float = 0.0
    riesgo_pais_pb: int = 0
    ultima_actualizacion: str = ""
