// Datos ficticios para desarrollo y demostración.
// TODOS los valores son inventados — safe para repositorio público.
// En producción estos datos vienen de la API de PPI via Firestore.

export const MOCK_COTIZACIONES = {
  dolar_mep: 1400,
  dolar_ccl: 1453,
  dolar_bna: 1050,
  dolar_oficial: 1050,
  riesgo_pais_pb: 500,
  ultima_actualizacion: new Date().toISOString(),
}

export const MOCK_RESUMEN = {
  valor_total_ars: 7_280_000,
  composicion_pct: {
    acciones_ar: 35,
    cedears: 30,
    liquidez: 12,
    ons: 10,
    fci: 8,
    bonos: 5,
  },
  rend_30d_usd_mep_pct: 8.5,
  rend_30d_ars_pct: 6.2,
}

export const MOCK_ACCIONES_AR = {
  subtotal_ars: 2_548_000,
  pct_cartera: 35,
  posiciones: [
    {
      ticker: 'TKRA', descripcion: 'Empresa Ejemplo A',
      cantidad: 20, precio_actual_ars: 54_250, valor_corriente_ars: 1_085_000,
      pct_cartera: 18, precio_compra_usd: 25, precio_compra_ars: 35_000,
      rend_usd_pct: 55, rend_ars_pct: 85, accion_tactica: 'tomar_parcial',
      tesis_corta: 'Posición dominante. Buena ganancia real USD. Considerar tomar 15–20% en este nivel.',
      evento_proximo: null,
    },
    {
      ticker: 'TKRB', descripcion: 'Empresa Ejemplo B',
      cantidad: 500, precio_actual_ars: 459, valor_corriente_ars: 229_500,
      pct_cartera: 3.2, precio_compra_usd: 0.40, precio_compra_ars: 560,
      rend_usd_pct: -18, rend_ars_pct: -5, accion_tactica: 'compra_tactica',
      tesis_corta: 'Apuesta sectorial. Confirmar soporte antes de reforzar.',
      evento_proximo: null,
    },
    {
      ticker: 'TKRC', descripcion: 'Empresa Ejemplo C',
      cantidad: 40, precio_actual_ars: 5_100, valor_corriente_ars: 204_000,
      pct_cartera: 2.8, precio_compra_usd: 3.20, precio_compra_ars: 4_480,
      rend_usd_pct: 14, rend_ars_pct: 33, accion_tactica: 'mantener',
      tesis_corta: 'Regulado con upside a revisión tarifaria. Catalizador estructural.',
      evento_proximo: 'Earnings Q1 · próximo mes',
    },
    {
      ticker: 'TKRD', descripcion: 'Empresa Ejemplo D',
      cantidad: 200, precio_actual_ars: 1_630, valor_corriente_ars: 326_000,
      pct_cartera: 4.5, precio_compra_usd: 1.10, precio_compra_ars: 1_540,
      rend_usd_pct: -8, rend_ars_pct: 6, accion_tactica: 'compra_en_correccion',
      tesis_corta: 'Infraestructura estratégica. Comprar en correcciones.',
      evento_proximo: null,
    },
    {
      ticker: 'TKRE', descripcion: 'Empresa Ejemplo E',
      cantidad: 80, precio_actual_ars: 8_800, valor_corriente_ars: 704_000,
      pct_cartera: 9.7, precio_compra_usd: 7.50, precio_compra_ars: 10_500,
      rend_usd_pct: -20, rend_ars_pct: -16, accion_tactica: 'compra_escalonada',
      tesis_corta: 'Value puro en USD. Descuento masivo vs pares.',
      evento_proximo: null,
    },
  ],
}

export const MOCK_CEDEARS = {
  subtotal_ars: 2_184_000,
  pct_cartera: 30,
  posiciones: [
    {
      ticker: 'CEDR1', descripcion: 'CEDEAR Ejemplo 1',
      subyacente_usd: 'SUBY1', mercado_subyacente: 'NYSE', ratio_cedear: 10,
      cantidad: 150, precio_actual_ars: 2_800, precio_subyacente_usd: 42,
      valor_corriente_ars: 420_000, pct_cartera: 5.8,
      precio_compra_usd: 19, rend_usd_pct: 120, rend_ars_pct: 165,
      accion_tactica: 'tomar_parcial',
      tesis_corta: 'Minera estratégica. Ganancia extraordinaria. Tomar parcial.',
      evento_proximo: 'Earnings · próximas semanas',
    },
    {
      ticker: 'CEDR2', descripcion: 'CEDEAR Tech',
      subyacente_usd: 'SUBY2', mercado_subyacente: 'NASDAQ', ratio_cedear: 100,
      cantidad: 25, precio_actual_ars: 21_280, precio_subyacente_usd: 213,
      valor_corriente_ars: 532_000, pct_cartera: 7.3,
      precio_compra_usd: 152, rend_usd_pct: 40, rend_ars_pct: 70,
      accion_tactica: 'tomar_parcial',
      tesis_corta: 'Infraestructura tecnológica dominante. Múltiplos elevados — tomar parcial.',
      evento_proximo: 'Earnings · próximas semanas',
    },
    {
      ticker: 'CEDR3', descripcion: 'CEDEAR ETF',
      subyacente_usd: 'SUBY3', mercado_subyacente: 'NYSE', ratio_cedear: 4,
      cantidad: 60, precio_actual_ars: 20_533, precio_subyacente_usd: 512,
      valor_corriente_ars: 1_232_000, pct_cartera: 16.9,
      precio_compra_usd: 410, rend_usd_pct: 25, rend_ars_pct: 48,
      accion_tactica: 'mantener',
      tesis_corta: 'Core del portafolio. Diversificación internacional. Mantener posición.',
      evento_proximo: null,
    },
  ],
}

export const MOCK_BONOS = {
  subtotal_ars: 364_000,
  pct_cartera: 5,
  posiciones: [
    {
      ticker: 'BON1', descripcion: 'Bono Ejemplo USD 2030',
      tipo: 'soberano_usd', cantidad: 1000,
      precio_actual: 72, valor_corriente_ars: 364_000, pct_cartera: 5,
      rend_usd_pct: 12, tir_pct: 9.5, vencimiento: '2030-07-09',
    },
  ],
}

export const MOCK_ONS = {
  subtotal_ars: 728_000,
  pct_cartera: 10,
  posiciones: [
    {
      ticker: 'ON01', descripcion: 'ON Ejemplo Corp. 2027',
      emisor: 'Empresa Ejemplo Corp.', tasa_pct: 8.75, vencimiento: '2027-04-17',
      cantidad: 2000, precio_actual: 98.5, valor_corriente_ars: 728_000,
      pct_cartera: 10, rend_usd_pct: 9.2, tir_pct: 8.9,
    },
  ],
}

export const MOCK_FCI = {
  subtotal_ars: 582_400,
  pct_cartera: 8,
  posiciones: [
    {
      ticker: 'FCI1', descripcion: 'FCI Renta Fija USD Ejemplo',
      tipo_fci: 'renta_fija_usd', cantidad: 5840,
      precio_cuotaparte: 99.726, valor_corriente_ars: 582_400,
      pct_cartera: 8, rend_usd_pct: 6.8,
    },
  ],
}

export const MOCK_LIQUIDEZ = {
  subtotal_ars: 873_600,
  pct_cartera: 12,
  usd_total_aprox: 624,
  detalle: [
    { especie: 'Pesos ARS', cantidad: 523_600, precio_ars: 1, valor_ars: 523_600 },
    { especie: 'Dólar MEP', cantidad: 250,     precio_ars: 1_400, valor_ars: 350_000 },
  ],
}

export const MOCK_CATALIZADORES = [
  // ── COMPLETADOS ─────────────────────────────────────────────
  {
    fecha: '2026-04-29', tipo: 'earnings', estado: 'done',
    evento: 'Earnings Q1 2026 — Bloque internacional',
    tickers: ['CEDR2', 'CEDR3'],
    resultado: 'CEDR2: Revenue +22%, EPS +82% — beat fuerte. CEDR3: ETF en línea con mercado.',
  },
  {
    fecha: '2026-05-07', tipo: 'earnings', estado: 'done',
    evento: 'Earnings Q1 2026 — Energía AR',
    tickers: ['TKRA', 'TKRC'],
    resultado: 'TKRA: EBITDA récord (+28% a/a). TKRC: utilidades +12%, márgenes sostenidos.',
  },
  // ── PRÓXIMOS ─────────────────────────────────────────────────
  {
    fecha: '2026-07-15', tipo: 'earnings', estado: 'near',
    evento: 'Earnings Q2 2026 — Bloque AR',
    descripcion: 'Brent en zona favorable. Posiciones energéticas pueden seguir superando expectativas.',
    tickers: ['TKRA', 'TKRC', 'TKRD'],
  },
  {
    fecha: '2026-08-26', tipo: 'earnings', estado: 'near',
    evento: 'Earnings Q2 FY27 — CEDEAR Tech principal',
    descripcion: 'Guidance fue muy alto. El ciclo de inversión en IA sigue en rampa. Bar elevado.',
    tickers: ['CEDR2'],
  },
  // ── ESTRUCTURALES ────────────────────────────────────────────
  {
    fecha: 'Q2–Q3 2026', tipo: 'rti_tarifario', estado: 'structural',
    evento: 'RTI — Definición tarifaria regulada',
    descripcion: 'El ajuste tarifario puede ser el mayor catalizador del bloque regulado en 2026.',
    tickers: ['TKRC', 'TKRD'],
  },
  {
    fecha: 'TBD 2026', tipo: 'corporativo', estado: 'structural',
    evento: 'Adquisición estratégica — CEDEAR 1',
    descripcion: 'Transformacional. Potencial rerating de múltiplos si se confirma.',
    tickers: ['CEDR1'],
  },
  // ── LARGO PLAZO ───────────────────────────────────────────────
  {
    fecha: '2027-2028', tipo: 'operacional', estado: 'far',
    evento: 'Inicio de producción — Proyecto estratégico',
    descripcion: 'Principal catalizador de largo plazo. Déficit de materia prima proyectado 2026–2028.',
    tickers: ['CEDR1'],
  },
]

export const MOCK_STRESS_TEST = [
  {
    nombre: 'MERVAL cae 30%', tipo: 'danger',
    supuesto: 'Shock de confianza: MERVAL cede 30% en ARS',
    descripcion: 'Corrección bursátil local del 30%. Impacto directo en acciones argentinas; CEDEARs y bonos amortiguan.',
    impacto_cartera_pct: -12.0,
    tickers_mas_afectados: ['TKRA', 'TKRC'],
    amortiguadores: ['Bonos', 'ONs', 'Liquidez'],
  },
  {
    nombre: 'Shock externo (S&P −20%)', tipo: 'warn',
    supuesto: 'Recesión en EEUU: S&P500 cae 20% en USD',
    descripcion: 'Corrección global del 20%. CEDEARs impacto directo; acciones locales con correlación menor.',
    impacto_cartera_pct: -7.2,
    tickers_mas_afectados: ['CEDR1', 'CEDR2'],
    amortiguadores: ['Liquidez', 'Bonos soberanos AR'],
  },
  {
    nombre: 'Brecha cambiaria +20%', tipo: 'warn',
    supuesto: 'Brecha cambiaria sube 20 pp respecto al nivel actual',
    descripcion: 'MEP y CCL suben 20%. Posiciones en ARS valen menos en USD; activos dolarizados se protegen.',
    impacto_cartera_pct: -4.8,
    tickers_mas_afectados: ['TKRA', 'TKRD'],
    amortiguadores: ['CEDEARs', 'ONs USD', 'Bonos Hard-Dollar'],
  },
  {
    nombre: 'Riesgo País +500 pb', tipo: 'danger',
    supuesto: 'Crisis de confianza soberana; EMBI+ Argentina sube 500 pb',
    descripcion: 'El riesgo país sube 500 puntos básicos. Impacta directamente en la paridad de bonos soberanos.',
    impacto_cartera_pct: -9.1,
    tickers_mas_afectados: ['TKRB', 'CEDR3'],
    amortiguadores: ['Liquidez', 'CEDEARs'],
  },
]

export const MOCK_FUNDAMENTAL = [
  {
    sector: 'Energía — Ejemplo AR',
    posiciones: [
      {
        ticker: 'TKRA', descripcion: 'Empresa A · 20 acc. · +55% USD · 18% cartera',
        accion_tactica: 'tomar_parcial', sentimiento: 'bull',
        q1_2026: 'EBITDA $1.500M (+28% a/a) · Récord histórico · FCF positivo',
        kpis: {
          ebitda_ttm:    'USD 4,5B',
          ev_ebitda:     '4,2x',
          margen_ebitda: '36%',
          leverage:      '1,6x',
          fcf_q1:        '$870M',
        },
        comparable_ev_ebitda: { nombre: 'Par regional', valor: '5,2x' },
        tesis: 'Integrado con proyecto Vaca Muerta en construcción. Descuento masivo vs pares regionales. Catalizador regulatorio pendiente.',
        escenarios: { bear: '$25–30', base: '$45–55', bull: '$75–90' },
      },
      {
        ticker: 'TKRE', descripcion: 'Empresa E · 80 acc. · –20% USD',
        accion_tactica: 'compra_escalonada', sentimiento: 'neutral',
        q1_2026: null,
        kpis: {
          ebitda:        'ARS 160B',
          ev_ebitda:     '2,8x',
          margen_ebitda: '24%',
          p_book:        '0,6x',
          vs_comparable: '–40% descuento',
        },
        comparable_ev_ebitda: { nombre: 'Par regional', valor: '5,0x' },
        tesis: 'Value puro en USD. Descuento masivo vs pares. Riesgo sectorial presente. Compra escalonada en correcciones.',
        escenarios: { bear: '$600', base: '$950–1.100', bull: '$1.400+' },
      },
    ],
  },
  {
    sector: 'CEDEARs Internacionales',
    posiciones: [
      {
        ticker: 'CEDR2', descripcion: 'CEDEAR Tech · 25 cert. · +40% USD',
        accion_tactica: 'tomar_parcial', sentimiento: 'bull',
        q1_2026: 'Revenue +22% · EPS +82% · Cloud +63% · Beat generalizado',
        kpis: {
          ebitda_ttm:    'USD 120B',
          ev_ebitda:     '42x',
          margen_ebitda: '60%',
          p_e_fwd:       '28x',
        },
        comparable_ev_ebitda: null,
        tesis: 'Infraestructura tecnológica dominante. Q1 excelente. Múltiplos elevados — tomar parcial para reducir concentración.',
        escenarios: { bear: '$130', base: '$190–220', bull: '$350' },
      },
      {
        ticker: 'CEDR1', descripcion: 'CEDEAR Minera · 72 cert. · +164% USD',
        accion_tactica: 'mantener', sentimiento: 'bull',
        q1_2026: null,
        kpis: {
          ebitda:           'Pre-producción',
          ev_ebitda:        'N/A',
          reservas:         '4,8M t LCE',
          prod_estimada:    '2027–2028',
          rigi:             'Aprobado',
        },
        comparable_ev_ebitda: null,
        tesis: 'Tesis de largo plazo. RIGI aprobado. Alta volatilidad. Posición concentrada — no agregar.',
        escenarios: { bear: '$5–7', base: '$15–20', bull: '$30–40' },
      },
    ],
  },
]

// Mapeo de tickers ficticios a símbolos de TradingView (demo)
export const TICKERS_TV = {
  TKRA:  'BCBA-YPFD',
  TKRB:  'BCBA-BHIP',
  TKRC:  'BCBA-TGNO4',
  TKRD:  'BCBA-TRAN',
  TKRE:  'BCBA-TXAR',
  CEDR1: 'BCBA-LAR',
  CEDR2: 'BCBA-NVDA',
  CEDR3: 'BCBA-SPY',
}
