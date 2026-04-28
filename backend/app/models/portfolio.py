from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field


class PosicionBase(BaseModel):
    ticker: str
    descripcion: str
    cantidad: float
    valor_corriente_ars: float
    pct_cartera: float = 0.0
    rend_usd_pct: float = 0.0
    rend_ars_pct: float = 0.0


class PosicionAccionAR(PosicionBase):
    precio_actual_ars: float
    precio_compra_usd: float = 0.0
    precio_compra_ars: float = 0.0
    accion_tactica: str = "mantener"
    tesis_corta: str = ""
    evento_proximo: Optional[str] = None
    earnings_fecha: Optional[str] = None


class PosicionCedear(PosicionBase):
    precio_actual_ars: float
    subyacente_usd: str
    mercado_subyacente: str  # NYSE | NASDAQ | AMEX
    ratio_cedear: int = 1
    precio_subyacente_usd: float = 0.0
    precio_compra_usd: float = 0.0
    accion_tactica: str = "mantener"
    tesis_corta: str = ""
    evento_proximo: Optional[str] = None
    earnings_fecha: Optional[str] = None


class PosicionBono(PosicionBase):
    tipo: str  # soberano_usd | soberano_ars | corporativo_usd | corporativo_ars
    precio_actual: float
    tir_pct: float = 0.0
    vencimiento: str = ""


class PosicionON(PosicionBase):
    emisor: str
    tasa_pct: float = 0.0
    vencimiento: str = ""
    precio_actual: float
    tir_pct: float = 0.0


class PosicionFCI(PosicionBase):
    tipo_fci: str  # money_market | renta_fija_usd | renta_fija_ars | renta_variable | mixto
    precio_cuotaparte: float


class LiquidezItem(BaseModel):
    especie: str
    cantidad: float
    precio_ars: float
    valor_ars: float


class CategoriaPortfolio(BaseModel):
    subtotal_ars: float = 0.0
    pct_cartera: float = 0.0
    posiciones: list = Field(default_factory=list)


class LiquidezCategoria(BaseModel):
    subtotal_ars: float = 0.0
    pct_cartera: float = 0.0
    usd_total_aprox: float = 0.0
    detalle: List[LiquidezItem] = Field(default_factory=list)


class Portfolio(BaseModel):
    acciones_ar: CategoriaPortfolio = Field(default_factory=CategoriaPortfolio)
    cedears: CategoriaPortfolio = Field(default_factory=CategoriaPortfolio)
    bonos: CategoriaPortfolio = Field(default_factory=CategoriaPortfolio)
    ons: CategoriaPortfolio = Field(default_factory=CategoriaPortfolio)
    fci: CategoriaPortfolio = Field(default_factory=CategoriaPortfolio)
    liquidez: LiquidezCategoria = Field(default_factory=LiquidezCategoria)
    valor_total_ars: float = 0.0


class ResumenPortfolio(BaseModel):
    valor_total_ars: float
    valor_total_usd_mep: float
    valor_total_usd_ccl: float
    composicion_pct: dict
    rend_30d_usd_mep_pct: float = 0.0
    rend_30d_ars_pct: float = 0.0
