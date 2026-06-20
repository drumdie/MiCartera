# MiCartera — Sistema de diseño (mobile)

> Rediseño UX/UI · rama `feat/rediseno-ux-mobile` · 2026-06
> **App de teléfono** (PWA + apk Capacitor). Columna única, ancho mobile. No hay layout web/desktop.
> Identidad intacta: **dark** + **Syne** (títulos) / **DM Mono** (texto) / **IBM Plex Mono** (números) + **acento verde** `#00e5a0`.

Tokens en `src/styles/variables.css` · componentes en `src/styles/components.css` · estilos heredados en `src/styles/global.css`.

---

## 1. Color

Paleta sin cambios. Se agregaron **alias** (`--green`, `--text-muted`) para saldar fallbacks dispersos en JS, y **capas alpha** como tokens para reemplazar los `rgba(...)` literales repetidos.

| Token | Uso |
|---|---|
| `--bg` `#080a0d` | Fondo app |
| `--surface` `#0e1117` · `--surface2` `#141920` · `--surface3` `#1a2030` | Elevaciones |
| `--border` `#1c2535` · `--border2` `#243040` | Bordes / hover |
| `--accent` `#00e5a0` | Verde de marca / positivo / CTA |
| `--accent3` `#4a9eff` (hold) · `--warn` `#f7b731` · `--red` `#ff4d6d` (sell) · `--purple` `#c084fc` | Semánticos |
| `--text` `#dde4ed` · `--muted2` `#6a7e94` · `--muted` `#4a5a6e` | Texto / secundario / terciario |
| `--accent-soft/-line/-glow`, `--red-soft/-line`, `--blue-*`, `--amber-*`, `--purple-*` | Fondos/bordes translúcidos |

Regla: **verde = positivo y acción**; rojo = negativo/salir; ámbar = warning/datos de ejemplo; azul = informativo/neutral-hold.

## 2. Tipografía

| Rol | Familia | Tamaño | Peso |
|---|---|---|---|
| Hero (total) | IBM Plex Mono | `clamp(26–32)` | 600 |
| Título de pantalla | Syne | 16–17 | 700 |
| Título de sección / ticker | Syne | 14–15 | 700/800 |
| Eyebrow (`.eyebrow`) | Syne | 11, `letter-spacing .16em`, UPPER | 600 |
| Body | DM Mono | 13 | 400 |
| Label / secundario | DM Mono | 12 | — |
| Caption / **piso** | DM Mono | **11** | — |
| Números (KPI, precios) | IBM Plex Mono | 16 / contexto | 600 |

**Piso de 11px** (antes había 8–9px ilegibles en teléfono).

## 3. Spacing, radios, touch

- Spacing: `--s4 … --s32` (4/8/12/16/20/24/32).
- Radios: `--r-sm 10` · `--r-md 12` · `--r-lg 16` (cards) · `--r-xl 20` (bottom-nav, sheets) · `--r-pill`.
- **Touch target mínimo `--tap` = 44px** (botones, iconbtn, filas, switch).
- `--app-max` 480px · `--nav-h` 86px (reserva para la bottom-nav) · respeta `env(safe-area-inset-*)`.

## 4. Componentes (`components.css`)

- **Botón** `.btn` (+ `-primary` `-ghost` `-danger` `-sm` `-block`) — feedback `scale(.97)` al tocar.
- **Icon-button** `.iconbtn` — 44px, cuadrado.
- **Card** `.card` (+ `.card-tappable`).
- **Field** `.field` — label + input + estado **error** (`.field--error` con borde rojo, `.field-msg`, ojo `.field-eye`).
- **Switch** `.switch` — toggle accesible (`role="switch"`/`aria-checked`); usado por biometría.
- **Badge** `.badge` (+ `-accent -blue -amber -red -purple -neutral`).
- **Bottom-nav** `.bottomnav` — flotante, 4 ítems + acción central (`.bottomnav-center`) de sync.
- **Appbar** `.appbar` + `.screen` — header de ruta empujada (back + título centrado).
- **List-row** `.list-row` — settings, drill-down, contratos colapsados.
- **Sheet** `.sheet` — modal slide-up full-width (cambiar passphrase).
- **Segmented** `.segmented` — toggle moneda / rangos.
- **Estados** `.state` (`-error`), `.skeleton` (loading), `.demo-chip` (datos de ejemplo).
- `.ranknum`, `.weightbar` — ranking top-5 / táctico.

## 5. Navegación y transiciones

- **Bottom-nav** reemplaza los tabs sticky: `Posiciones · Fundamental · (sync) · Catalizadores · Gráficos`. El **nombre del usuario** en el header abre **Perfil**.
- **Rutas** (`react-router-dom`): `/` (dashboard con secciones), `/perfil`, `/perfil/inversion`, `/detalle/mayor-posicion`, `/detalle/gp`. Las pantallas empujadas usan `.screen` (slide-in lateral) + `.appbar` con back.
- Transiciones: tap `scale`, secciones `fade` (`.section-fade`), rutas `screenIn`, sheets `sheetUp`. Sin librerías.

## 6. Estados explícitos (antes implícitos/rotos)

- **Loading**: `.skeleton` en vez de mostrar ceros mientras carga Firestore.
- **Vacío**: `.state` con icono + texto (ej. "sin posiciones", "sin contratos").
- **Error**: `.state-error` / `.field--error` con mensaje claro (ej. "no se pudo sincronizar", passphrase incorrecta) — no más "failed to fetch" crudo.
- **Datos de ejemplo**: `.demo-chip` marca el stress mock / demo para que no se lea como real.

## 7. Reglas heredadas (CLAUDE.md)

Ningún dato real hardcodeado (todo de API/estado). CEDEARs muestran ARS + subyacente USD. Moneda de referencia: USD MEP. No se rompen toggles moneda/privacidad, acordeones, gráficos ni el gate passphrase/onboarding.
