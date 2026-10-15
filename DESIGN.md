---
name: Kelvin
description: Précision — a dark-first, data-forward heating console where every room reads as one line of state, plan and last 24 h.
colors:
  bg: "#0f1115"
  s1: "#171a21"
  s2: "#1d212a"
  in: "#13161c"
  line: "#262a33"
  field-line: "#666d7c"
  tx: "#e8eaf0"
  mu: "#9aa1ae"
  fa: "#8a91a0"
  cool: "#4c9bf5"
  neutral: "#c8ccd6"
  warm: "#f2793f"
  ok: "#3dd68c"
  bad: "#ff6b6b"
  series-1: "#b48cf2"
  series-2: "#2fc4b2"
  series-3: "#e5c14b"
  series-4: "#e87bb5"
  bg-light: "#f5f6f8"
  s1-light: "#ffffff"
  s2-light: "#eef0f3"
  in-light: "#ffffff"
  line-light: "#dfe2e8"
  field-line-light: "#838a97"
  tx-light: "#14171f"
  mu-light: "#555d6b"
  fa-light: "#5f6775"
  cool-light: "#1f6fd1"
  neutral-light: "#5d6573"
  warm-light: "#b84a16"
  ok-light: "#0f7a47"
  bad-light: "#c62828"
  series-1-light: "#7b4fd0"
  series-2-light: "#0f8577"
  series-3-light: "#8f6d00"
  series-4-light: "#b8327a"
  tempo-blue: "#6c8cff"
  tempo-white: "#e8eaf0"
  tempo-red: "#ff5c7a"
  tempo-blue-light: "#3355cc"
  tempo-white-light: "#ffffff"
  tempo-red-light: "#c2185b"
  hc: "#a6d8ff"
  hp: "#3567d6"
  hc-light: "#2b8ad4"
  hp-light: "#0a2a6e"
typography:
  display:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 600
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  reading:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 700
  value:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    fontFeature: "tnum"
  body:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
  section-label:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
  micro:
    fontFamily: "'Onest Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "tnum"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  base: "10px"
  inner: "7px"
  control: "8px"
  chip: "6px"
  block: "4px"
  swatch: "3px"
  bar: "2px"
  pill: "11px"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "24": "24px"
  "28": "28px"
components:
  room-card:
    backgroundColor: "{colors.s1}"
    textColor: "{colors.tx}"
    rounded: "{rounded.base}"
    padding: "12px 14px"
  inspector-panel:
    backgroundColor: "{colors.s1}"
    rounded: "{rounded.base}"
    padding: "16px"
  stepper:
    backgroundColor: "{colors.in}"
    textColor: "{colors.tx}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    height: "36px"
  segmented:
    backgroundColor: "{colors.in}"
    textColor: "{colors.mu}"
    rounded: "{rounded.control}"
    padding: "1px"
  segmented-on:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    rounded: "{rounded.chip}"
    padding: "0 12px"
    height: "36px"
  mode-switch:
    backgroundColor: "{colors.in}"
    textColor: "{colors.mu}"
    rounded: "{rounded.control}"
    padding: "1px"
  mode-switch-on:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    rounded: "{rounded.chip}"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.tx}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-large:
    backgroundColor: "{colors.tx}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    textColor: "{colors.tx}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  chip:
    textColor: "{colors.mu}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "1px 6px"
  toggle-on:
    backgroundColor: "{colors.tx}"
    rounded: "{rounded.pill}"
    width: "38px"
    height: "22px"
  toggle-off:
    backgroundColor: "{colors.fa}"
    rounded: "{rounded.pill}"
    width: "38px"
    height: "22px"
  input:
    backgroundColor: "{colors.in}"
    textColor: "{colors.tx}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  select:
    backgroundColor: "{colors.in}"
    textColor: "{colors.tx}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  field-label:
    textColor: "{colors.mu}"
    typography: "{typography.label}"
  button-icon:
    textColor: "{colors.mu}"
    rounded: "{rounded.control}"
    width: "36px"
    height: "36px"
  panel:
    backgroundColor: "{colors.s1}"
    rounded: "{rounded.base}"
    padding: "14px"
  login-form:
    width: "360px"
    padding: "24px 16px"
  share-meter:
    backgroundColor: "{colors.in}"
    rounded: "{rounded.swatch}"
    height: "6px"
  share-meter-thin:
    backgroundColor: "{colors.in}"
    rounded: "{rounded.bar}"
    height: "4px"
  toast:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.base}"
    padding: "12px 14px"
  nav-item-active:
    backgroundColor: "{colors.s1}"
    textColor: "{colors.tx}"
    rounded: "{rounded.control}"
    height: "44px"
  tab-bar-item:
    textColor: "{colors.fa}"
    typography: "{typography.micro}"
    height: "56px"
---

# Design System: Kelvin

## Overview

**Creative North Star: "The Thermal Strip"**

Kelvin is Précision: a crisp, dark-first heating console in the family of Linear, Vercel and Raycast. Every room is a single line of truth: its name, a large tabular temperature in ink, one status sentence (« Programme · Confort jusqu’à 23:00 ») with its target in words (« consigne 21,0 °C »), and a 24 h thermal strip of what actually happened against what was planned. Nothing is decorative; the only colour that carries emotion is heat, and warm only ever means heating.

Density is compact and calm. Graphite grounds step up in three quiet tones, 1 px hairlines separate everything, and the corner radius never exceeds 10 px. Depth comes from tone and hairlines, not shadows. The light theme is the same roles re-tuned for daylight; dark is the default world.

The system is honest about delay. A command to a radiator takes seconds, so every control that sends one shows the requested value as a dashed "pending" mark, and that dash draws itself solid only when the radiator reports the matching value. That dashed-to-solid move is the signature interaction and appears identically on the strip, the stepper, the mode switch and the toggle.

**Key Characteristics:**
- Dark graphite grounds (bg → s1 → s2), 1 px hairlines, radius ≤ 10 px, no shadows.
- One heat ramp (cool → neutral → warm, 15 → 20 → 25 °C) for the strip's temperature line only; figures are ink; warm means heating, cool means away.
- Onest for UI, tabular figures for every number, JetBrains Mono only for dense numeric columns.
- The thermal strip repeats on room cards and the inspector. Programme draws the week as its own bar picture.
- Every chart has a visually hidden data table behind it; a missing value is « — », never a zero.
- Pending is dashed, confirmed is solid; a failure stays plain and says so.
- Compact controls (36 px painted) with 44 px touch targets everywhere (the hit area, not the paint), WCAG AA in both themes, copy in French (default) and English, each with its own typography.

## Colors

A near-monochrome graphite world where the only saturated colours are the heat ramp, categorical chart series kept out of the heat hues, and the two state colours.

### Primary
- **Heat Ramp: Cool Blue / Neutral Grey / Warm Orange** (cool, neutral, warm; light: cool-light, neutral-light, warm-light): the three stops of the single temperature ramp in `web/src/lib/heat.ts`. Domain 15 °C → 20 °C → 25 °C; between stops the colour is a linear sRGB `color-mix` of the two neighbouring stops; outside the domain it clamps; an unknown reading falls back to faint (fa). Used for the thermal strip's temperature line only (a vertical gradient through the three stops, where an axis gives it meaning); room and radiator readings are ink (an absolute ramp made a room at its target read « cold » and a stale reading « hot »). The warm and cool stops also carry the two heating states: warm for heating (« ● En chauffe », the « Chauffe temporaire » lead), cool for « Absence »; and, at low opacity, heat-related fills: programme comfort bands on the strip (warm at 16 % with a 40 % top edge), comfort blocks in the programme editor (warm at 75 % over the well, 3:1), the boost override badge (warm at 18 %) and the away override badge (cool at 18 %). Every stop passes AA (4.5:1) on both bg and s1 in both themes, enforced by `tokens.test.ts`.

### Secondary
- **Tariff Blues: Light Blue (HC) / Dark Blue (HP)** (hc, hp; light: hc-light, hp-light; owner ruling 2026-10-15): heures creuses light blue, heures pleines dark blue, app-wide. HC is the lighter of the two in both themes (3.42:1 dark, 3.63:1 light; each ≥ 3:1 on bg, s1 and s2; `tokens.test.ts`), so the pair reads by luminance in greyscale and for every colour-vision deficiency, and HC always carries the **hatch** (`--hc-hatch` in HTML; the SVG pattern `#hc-hatch` from `ChartDefs.svelte`, mounted once in the layout: 1 px lines of the ground at 35 % every 4 px at 45°); HP is solid. Stacks keep HC at the base with a 1 px knockout between the parts. Used by EnergyBars, the Courbe halves, the Heures creuses meter, legends (`Swatch`) and the tariff form's price captions (an 8 px swatch). Legends and readouts always write the words (« Heures creuses », “Off-peak”).
- **Chart Series: Violet, Teal, Ochre, Rose** (series-1 … series-4; light variants): categorical colours for Énergie, assigned by meaning in `SERIES` (`web/src/lib/energy.ts`) and drawn only through it. Violet is the single whole-home series when no tariff splits the day; teal is in reserve; ochre is the radiators (the overlay mark on the house chart, the Courbe's step line, Température et chauffe's bars, the radiator-only chart without Linky, the heating-share meter and the per-room share bars). Rose is held in reserve. They are deliberately free of blue and orange so a chart can never be misread as temperature.

### Tertiary
- **State Green** (ok): confirmation only: the "Confirmé" pending tag and a saved form (« Tarif enregistré. »).
- **State Red** (bad): only what the user must fix: the failed-command tag, error text, an open window (the status lead « Fenêtre ouverte » and its notice), the disconnection banner (bad at 14 % over s1), the error toast's border (bad at 60 % over line), and the Énergie Linky callout when the token is refused or sync fails. Progress states are never red, and neither is an offline radiator: switched off at the mains is a normal state here, so « Hors ligne » is muted everywhere (card, panel, Infos, the `radiator_unreachable` callout).

### Tariff Blues (named exception)
Heures creuses / pleines are a tariff, not heat, yet they are blue by the owner's ruling. They appear only on Énergie, the tariff (Maison › Tarif) and the tariff form, never on a room surface (where blue is `cool`, away). They are never round dots (10 px square swatches with a 3 px radius, 8 px in field captions, or bar fills): round dots belong to Tempo days, and HP vs Tempo Bleu (1.7:1) is told apart by that shape and by the words. `--tempo-*` never colours a bar.

### Tempo Day Chip (named exception)
The Tempo days are named after colours, so their chip carries the colour: an 8 px dot (blue, white with a field-line ring, red) always beside the colour's name. Only `TempoDot` uses the `tempo-*` tokens (`tokens.test.ts` checks, contrast 3:1 in both themes); they never colour a chart, a series or anything else. A day whose colour is not published yet shows a dashed dot. EcoWatt has no colour of its own: orange is neutral text with the alert glyph, red uses State Red.

### Neutral
- **Graphite Ground** (bg): page background, sidebar, the knob of an "on" toggle, text on primary buttons.
- **Raised Graphite** (s1): cards, the desktop inspector panel, Énergie panels, the active sidebar item.
- **Lifted Graphite** (s2): the selected segment, secondary buttons, toasts, hover fill on icon and stepper buttons.
- **Well** (in): recessed control grounds: stepper, segmented controls, selects, inputs, programme day bars.
- **Hairline** (line): every border and divider, the stepper's resting underline, energy grid lines.
- **Field Line** (field-line): the boundary of a field: inputs, selects, the stepper well, the programme day bar and the copy chips' boxes. It reaches 3:1 against in, s1, s2 and bg in both themes (WCAG 1.4.11, `tokens.test.ts`), so a field is identifiable by its edge, not only by its text. Hairlines stay hairlines everywhere else.
- **Ink** (tx): primary text, the primary button fill, the "on" toggle track, pending dashes, the now-marker and focus ring.
- **Muted** (mu): secondary text, chips, section labels, setpoint lines, inactive segments, placeholders, and the edge of the selected segment (3:1 against the well).
- **Faint** (fa): axis ticks, inactive tab-bar items, the "off" toggle track, the text of disabled controls (which keep their fill), unknown temperatures.

### Named Rules
**The Heat Means Heat Rule.** (Two named exceptions: the Tempo day chip, whose colours name a tariff day, and the Tariff blues, whose two blues name the hours of the tariff; neither is ever a temperature.) One meaning per hue. Warm encodes **heating** (« ● En chauffe », comfort periods, « Chauffe temporaire »); cool encodes **away** only; temperature is told by ink figures and by the strip's ramp line against its axis. An "on" switch is ink, not blue; a chart series is violet, never orange. A temperature figure is never coloured.

**The One Ramp Rule.** Every heat colour is computed by `heatColor()` from the three theme tokens. Never hard-code a heat hex, never add a second scale, and never interpolate in another space; the ramp then follows the active theme for free.

**The Series Rule.** Categorical data uses `SERIES`, each key with one fixed meaning: HC is `--hc` (light blue, always hatched: `SERIES_HATCH`), HP is `--hp` (dark blue), radiators are series-3 (ochre); an unsplit whole-home series takes series-1 (violet); series-2 is in reserve. Never series-1/series-2 for HC/HP. A meaning keeps its colour on every chart, legend and meter (the curve's HC/HP halves match the monthly bars). Radiators are drawn as a line mark, never a stacked part, so a reader can see they are a share of the house rather than added to it. A fifth series may be added only if it stays out of the blue and orange hues and passes AA in both themes.

## Typography

**UI Font:** Onest Variable (with system-ui, -apple-system, Segoe UI, sans-serif)
**Mono Font:** JetBrains Mono 400 (with ui-monospace, monospace)

**Character:** A clean, slightly technical grotesque that stays readable at 11 px, paired with a mono face reserved for columns of figures that must align digit for digit.

### Hierarchy
- **Display** (600, 32 px, −0.02em, tabular): the selected room's temperature in the inspector, and the Énergie hero figure (€ or kWh).
- **Reading** (600, 26 px, −0.02em, tabular): each room card's temperature, coloured by the heat ramp.
- **Headline** (700, 22 px, −0.01em): page titles (Pièces, Programme, Énergie, Maison) and « Connexion » on Login.
- **Title** (700, 20 px): the room name heading the inspector. Room names on cards are 600 at 15 px; radiator names 14 px.
- **Value** (600, 16 px, tabular): the stepper's figure and the projection amounts.
- **Body** (400, 15 px, line-height 1.45): base text; the root size; the value inside every input and select.
- **Body small** (13 px): secondary lines, tables, toasts, the banner, segment labels, form rows.
- **Label** (12 px): chips, setpoint arrows, pending tags, notes, field labels (muted, above their input), the « estimation » tag, chart legends, footnotes.
- **Section label** (600, 12 px, uppercase, 0.06em, muted): the heading of an inspector, Énergie or Maison panel (Réglage, Aujourd’hui, Historique, Chauffage, Projection, Tarif, Linky) and the Heures creuses fieldset legend. It is the section's only heading, never a kicker above another heading. Énergie's period label is the exception that proves it: « Octobre 2026 » in the navigator is a 15 px 600 sentence-case heading, and it also names the hero below it.
- **Micro** (11 px, tabular): strip and chart axis ticks, tab-bar labels. This is the floor.
- **Mono** (400, 13 px, tabular): the radiator counter columns (Compteurs des radiateurs), the price-history columns (Tarif), the version string in Réglages, and, at 12 px, the figures of Énergie's Par pièce et par radiateur table.

### Named Rules
**The Tabular Rule.** Every number that can change (temperatures, setpoints, times, kWh, percentages) is set with tabular figures (`.num`, or `font-variant-numeric: tabular-nums`) so live updates never shift the layout.

**The Mono-for-Columns Rule.** JetBrains Mono is for dense right-aligned numeric columns: the radiator counter columns on Énergie and its per-room table, and the price-history columns on Maison (in both the table and its phone list). The one other use is the version string (« Kelvin 0.1.0 »). Hero figures, projections, shares and every other single figure stay in Onest with tabular figures.

**The 11 px Floor.** No text is smaller than 11 px, and 11 px is reserved for axis ticks and tab-bar labels.

## Layout

One breakpoint: **1024 px** (`DESKTOP_QUERY` in `media.svelte.ts`, mirrored in CSS).

- **Phone (< 1024 px):** a single column with 16 px page padding and 88 px plus the safe-area inset at the bottom, clearing a fixed bottom tab bar (56 px items). Room cards stack with a 10 px gap; tapping a card opens its room page (back « ← Pièces »), which starts with the status and Réglage: two taps to change a temperature. Nothing expands in place. Toasts sit 76 px above the bottom, at most 420 px wide (92 vw).
- **Desktop (≥ 1024 px):** a 232 px sticky sidebar (nav, then Tout éteindre / Absence… pinned to the bottom) and a main column with 24 px × 28 px padding, capped at 1280 px. Pièces becomes two columns: the room list (whatever is left) and a sticky **inspector column** (`clamp(320px, 38 %, 440px)`, 24 px from the top, scrolling internally within the viewport with contained overscroll), so nothing scrolls sideways from 1024 px up. Toasts sit 24 px from the bottom.
- **Énergie grid:** the panels answer to the grid's own width (a container query), not the viewport, because the sidebar takes 232 px of a 1024 px screen. One column below 720 px of grid; from 720 px the hero, Consommation, Courbe, Température et chauffe, Par pièce et par radiateur, Qualité, Compteurs and Exporter span the row while Comparaisons | Projection share one; in Jour and Semaine Puissance and Heures creuses / pleines pair and Chauffage takes the row, and from 960 px the three sit abreast; in Mois and Année (no Puissance) Heures creuses / pleines | Chauffage share a row. Max 1180 px.
- **No sideways scroll** at any width from 320 to 1440 px on any route (`e2e/layout.spec.ts`). Below 1024 px `scroll-padding-bottom` keeps focused fields and anchors clear of the tab bar (and of the Programme send bar when it shows); a visible banner adds `scroll-padding-top`.

- **Below 600 px (fold):** tables give way rather than scroll the page. The radiator counter table keeps only the radiator (with its room folded beneath in 12 px muted) and the lifetime total; the Tarif price history becomes a hairline-separated list of two-column label/value rows; Par pièce et par radiateur is a list below 640 px of panel width (a table above); the Énergie hero's date range takes its own line; the Réglages list's label column shrinks to its content (and below 360 px the label sits above its value).
- **Login:** outside the app shell (no sidebar, no tab bar): one column, at most 360 px wide, centred in the viewport on bg, 14 px between items.

**Spacing rhythm:** small even steps (2, 4, 6, 8, 10, 12, 14, 16, 18, 24, 28 px). Inside cards: 12 × 14 px padding, 8 px gap. Between inspector sections: 18 px, each section opening with a hairline and 14 px of space. Énergie panels: 14 px padding, 14 px apart (a grid gap), max 1180 px; Maison panels the same at 720 px. Form grids: 12 px gaps, fields auto-fit at 170 px (Tarif) or 200 px (Linky).

**The One Line Rule.** A room answers now · target · next in one glance: name (and « ● En chauffe ») with the reading on the first line, the status sentence with « consigne 21,0 °C » on the second, the strip beneath. No chips, no footer. Detail lives one tap away (the room page on a phone, the inspector on desktop), never on the list.

## Elevation & Depth

Flat. There are no box-shadows. Depth is tonal: bg → s1 (cards, panels) → s2 (selected, hover, toasts), with the well (in) recessed beneath controls, and every edge drawn by a 1 px hairline. The only translucency is the phone tab bar (bg at 92 % with a 12 px backdrop blur) so content scrolls visibly beneath it.

**The Hairline Rule.** Separate with a 1 px line (line), not a box or a shadow. Panels nested in a panel (radiators in the inspector) are separated by a top hairline, never boxed again.

## Shapes

Compact, gently rounded, never pill-shaped for containers. The base radius is 10 px (cards, panels, stepper, both segmented controls, primary/secondary buttons, toasts, the Login reauth note); segments inside a 10 px well use 7 px so the inset reads concentric, and this pair is shared exactly by Segmented and ModeSwitch. Smaller controls use 8 px (sidebar items, ghost and icon buttons, every form input and select), chips and editor inputs 6 px, programme blocks 4 px, legend swatches and the heating-share meter 3 px, energy bars and the thin per-room share bar 2 px, curve bars 1 px. Full rounding only on the toggle track (11 px), its knob and dots.

Icons are a small hand-drawn set (`Icon.svelte`): 24-unit stroke paths at 1.75 px, round caps and joins, `currentColor`, 18 px by default (12–20 px in context).

**The Ten Pixel Ceiling.** No radius exceeds 10 px except the toggle's pill geometry.

## Components

### Thermal Strip (signature)
The room's day on one line: an SVG sparkline of the measured temperature (2 px, round caps, stroked with the heat-ramp gradient so its colour at any height is the heat at that temperature) drawn only up to now, over the planned setpoint (1 px muted 3/3 dashed step, the legend's « Consigne »; at 70 % on cards). In programme mode the comfort periods appear as warm bands at 16 %. A 1 px ink **now-marker** (70 %) crosses the full height. The y-domain always includes 15–23 °C plus every known value, padded by 0.5 °C. A visually hidden sentence (range, latest reading, plan, pending request) describes it for screen readers. 32 px on room cards; 120 px in the room panel's chart. Window and presence runs (`events`) are drawn only in the panel chart, which has a legend; cards never draw marks without a key. (Programme no longer shows it: its « Aujourd’hui » preview read as a flat line and was removed.)
- **Axis** (`axis`, on the room panel's day view): 00 · 06 · 12 · 18 · 24 in micro faint, with the current Paris time at the now-marker in ink 600. A fixed tick within 9 % of the marker is dropped so labels never collide.
- **Pending path:** a requested manual target draws a dashed ink line (1.25 px, 4/3 dash) from now to the end of the day; a pending comfort setpoint redraws the rest of today's programme dashed, clipped to after now, with eco shifted by the same amount.
- **Confirmation:** when the pending value disappears and the radiator now reports exactly that value, the path is held 250 ms and its dash closes to solid. If the reported value differs, it simply disappears. The same rule (`$lib/settle.svelte.ts`) drives every control below.
- Reused on room cards and the inspector. Énergie's Température et chauffe draws a room's day with the same heat-ramp line and muted setpoint, at its own scale.

### Stepper
A 36 px well (`--ctl-h`; in, field-line edge, 8 px): 36 px − and + icon buttons whose hit area reaches 44 px (`.hit`), around a 64 px value (16 px tabular): 136 px in all (`--w-temp`). The well does not clip, so the hit areas reach past its edge. Press-and-hold repeats after 400 ms every 120 ms; changes commit after a 600 ms debounce. An underline under the value is the pending signal (PendingEdge): hairline at rest, muted 4/3 dashes while pending, morphing solid in 250 ms on matching confirmation; an unconfirmed optimistic value is released after 10 s. At min/max a button is `aria-disabled` (faint, inert) rather than `disabled`, so keyboard focus stays on it; hover and press fill s2. The value is not a live region: each committed value is announced once (« Confort : 20,5 °C »).

### ModeSwitch
A three-way radiogroup (Arrêt / Manuel / Programme, "Prog." when compact) in a 40 px well (8 px radius, 1 px inset, 2 px gap). Segments are 36 px tall (6 px radius, concentric) with a 44 px hit area (`.hit`), 13 px 600 muted (ink on hover); the current segment is s2 with ink text and a muted edge (3:1 against the well). That edge is the signature mark (PendingEdge, an SVG rect): dashed while the mode is requested, closing solid when the radiator reports it. While pending the group is `aria-busy` and the segment is named « Manuel (en attente) ». Keyboard is **manual activation**, because a mode is a device command: roving tabindex (the current mode is the tab stop), arrows only move focus (wrapping), and Enter/Space sends. Choosing the current mode again sends nothing. Transitions 160 ms ease.

### CommandSwitch
The mode switch's look and behaviour for any device command with a few values (Plan 12): a pilot-wire heater's « Allure » (Confort, Confort −1, Confort −2, Éco, Hors-gel, Arrêt; 2 or 3 per row, six as 3 + 3, four as 2 + 2) and a towel dryer's « Normal | Boost | Séchage ». Same well, 36 px segments (44 px hit) and 13 px 600 labels; rows of segments sit 8 px apart so the hit areas never overlap. Manual activation (arrows move focus, Enter/Space sends), the dashed → solid edge (PendingEdge) while the device has not reported the value, nothing checked when the reported value is unknown (the fact reads « — »). Only the values the device allows are offered.

### Support chip
How far Kelvin vouches for a device (Plan 12): 11 px / 600, `--mu` text, 1 px `--line` border, radius 6 px, beside the radiator's or device's name. « Devrait fonctionner », « Expérimental », « Lecture seule » (on `--s2`); none for tested hardware. A read-only radiator shows the chip and one muted line saying Kelvin does not drive it, then its facts; no control. A control a radiator cannot take is absent, never shown disabled.

### Segmented
The view-only sibling of ModeSwitch for choices that change what is shown, never a device: Énergie's Jour / Semaine / Mois / Année, the inspector's 24 h / 7 j / 30 j, Réglages' Système / Sombre / Clair and Langue (« Français » / “English”, each option named in its own language with its `lang`, never translated). An option may carry `lang` and an `ariaLabel` (its accessible name when the visible label is short, as on Login). Same 40 px well (in, hairline, 8 px, 1 px inset, 2 px gap) and the same 6 px segments, but inline-width with 12 px side padding; 36 px painted with a 44 px hit area, 13 px 600 muted (ink on hover), the checked segment s2 with ink and a muted border (3:1 against the well). It also picks the room on Programme, scrolling inside itself when the rooms are wider than the page; an option may carry a `hint`, a muted 12 px 500 word after its label that is part of its name (an offline room: « Chambre 2 hors ligne »). A WAI-ARIA radiogroup with roving tabindex, and **automatic activation**: arrows (and Home/End) move focus and select at once. No pending state; nothing waits on a device.

**The Command Keyboard Rule.** If a choice sends a command to a radiator, arrows move focus and only Enter/Space sends (ModeSwitch). If it only changes the view, arrows select (Segmented). Both look the same; the keyboard tells them apart.

### Toggle
A full-width 44 px row: label left, 38 × 22 px track right. Off: faint track. On: ink track, knob slides 16 px (160 ms, no slide under reduced motion). Pending: a 1 px dashed muted outline 2 px around the track (PendingEdge, rx 12.5, `aria-busy`); when the radiator reports the requested state the dashes close solid and the outline fades. Never blue.

### PendingTag
Inline 12 px status after a command: "Envoi…" (muted, with an 8 px dashed spinning dot), "Confirmé" (ok, its check drawing itself in 250 ms), or the error in bad with a ghost "Réessayer" and a 44 px dismiss button. States cross-fade in one cell (160 ms in, 150–200 ms out). The tag is visual: screen readers hear the progress from the app announcer (below).

### RoomCard
s1 card, hairline, 10 px, 12 × 14 px padding; the whole card is one link (the name's link stretched over it, `aria-label` one sentence: « Salon, 21,4 °C, Programme · Confort jusqu’à 23:00, consigne 21,0 °C, En chauffe »). Grid: name (15/600) with « ● En chauffe » (12 px warm, 6 px warm dot, only while a radiator that answers has a working rate above 0 and the room is not off) and, when some radiators are offline, a muted plug-off glyph and « 1 radiateur sur 2 hors ligne »; the reading (26/600 **ink**, tabular, the mean of the radiators that answer) on the right. Second row: the status sentence (13 px, from `roomStatus()` in `$lib/status.ts`: its lead in its tone — ink, muted for Arrêt/Hors ligne/mixed, warm « Chauffe temporaire », cool « Absence », bad « Fenêtre ouverte » with the window glyph — then « · » and the rest in ink) and « consigne 21,0 °C » (13 px muted, hidden when Off, window open or unknown). A pending request shows the **requested** sentence underlined with the shared dashed mark, closing solid when the radiators report it; the PendingTag takes the target's place while a command is on its way, confirmed or failed (its buttons sit above the link). The status cross-fades (160 ms) when it changes; the reading dips and returns (400 ms). Then the 32 px strip. Heights are fixed whatever the state: the status reserves one 20 px line on a wide card, two below 420 px of list width (a container query), so a new sentence never moves the list (≈ 116 px, ≈ 136 px). Desktop keeps focus and scroll across the navigation, `aria-current="page"` for the room in the inspector (border muted). Hover firms the edge, press deepens the tone. Loading: three skeletons at those heights.
- **Offline card** (every radiator `reachable === false`): compact (≈ 64 px), name at 80 % ink, « Hors ligne depuis 14:32 » (« depuis le 2 oct. » another day, « Hors ligne » when unknown) · « Radiateur hors tension ou hors de portée » (on its own line below 420 px) in muted, a 20 px plug-off glyph. No temperature, no strip, no target, never red; a command still in flight (or failed) keeps its PendingTag under the sentence.
- **Room list:** Cozytouch order, except offline rooms, which move to the end under a section label « Hors ligne · 2 » with a hairline to its right. The page summary reads « 1 pièce en chauffe · 2 hors ligne » (« Aucune pièce en chauffe »; the offline part only when there are some), « · Absence en cours » when relevant; one line, ellipsised, so the header never reflows. On a phone the house actions are two 44 px bordered icon buttons (power, away; their names as labels) on the title row: one row in any language or font.

### RoomInspector (room panel)
The desktop right column (s1 panel, 16 px padding, `clamp(320px, 38 %, 440px)`, internal scroll) and the phone room page; its content cross-fades (160 ms) on a room change. Sections in order, each opening with a hairline and a section label:
1. **Header:** name (h2 at 20 px in the column; h1 at 22 px on the phone page), the status sentence (14 px, `roomStatus()`, dashed while a request is pending) and a 12 px line with « ● En chauffe », « Présence détectée » (only when true: never « Présence : — ») and the partial-offline count; on the right the reading (32/600 ink; it arrives from the tapped card in a view transition) over « consigne 21,0 °C ». **Offline** (every radiator unreachable): no reading; the **OfflineNotice** instead (s2 at 60 % over s1, hairline, plug-off glyph, `role="status"`, never red): « Radiateur hors tension ou hors de portée » (14/600), « Les commandes reprendront quand il sera rallumé. » (muted) and « Dernière mesure : 23,6 °C à 14:31 » (the last history point before the radiators went offline, else their last report with its time; left out when the time is unknown).
2. **Notices:** an open window (bad tint, window glyph, « Fenêtre ouverte, signalée par le radiateur : la pièce perd sa chaleur. »), the PendingTag (Envoi… / Confirmé / failure with Réessayer).
3. **Réglage:** ModeSwitch (or « Arrêt » for pilot-wire rooms); Manuel → « Consigne » stepper; in every mode but Arrêt the « Confort » stepper and the « Éco » stepper, which shows the **absolute** eco (comfort − lowering) with the caption « 3,0 °C sous le confort » and still sends the lowering; in Programme a ghost « Modifier les horaires › » to `/schedule?room=…`. Partial-capability and mixed notes as before. Offline: the controls are `aria-disabled` and a muted « Dernier mode connu : Programme · confort 20,0 °C, éco 17,0 °C. ».
4. **Chauffe temporaire** (rooms with boost, not offline): a 44 px disclosure row (`aria-expanded`, chevron, muted « ex. 21,0 °C pendant 2 h »), sliding open over 220 ms: « Chauffer à [stepper] pendant [1 h · 2 h · 4 h · 8 h] », then the consequence (« Puis retour au programme vers 21:45. », « Puis retour au mode manuel, 19,0 °C. ») and the primary « Lancer ». Active: « 22,0 °C jusqu’à 21:45 » and « Arrêter ».
5. **Aujourd’hui / Historique** (the title follows the range): Segmented 24 h · 7 j · 30 j over a 120 px strip with a 28 px scale gutter (top and bottom whole degrees, 11 px faint), the hour axis on 24 h, window and presence runs, a muted « Mesures depuis 14:05 » inside the chart when recording began over an hour into the range; offline, the curve stops when the radiators went offline. Then the legend as real text, listing only what is drawn: Température (ramp line), Consigne (dashed muted), Confort (warm wash), Fenêtre ouverte (hatch), Présence (neutral fill), « relevé toutes les 5 min » when runs show.
6. **Énergie sur 24 h / 7 j / 30 j** (RoomFigures): a two-column grid of Consommation, Coût (énergie), Heures de chauffe (« équiv. pleine puissance ») and, on 24 h only, « Part du temps en chauffe » (`/rooms/duty`, the old card duty); every value unknown → one sentence, « Pas encore assez de relevés sur 24 h (il faut au moins la moitié de la période). ».
7. **Radiateurs · n:** one RadiatorPanel disclosure row per radiator.
In the desktop column, once the header scrolls out, a compact bar (s1, bottom hairline, name 15/700 and the reading 17/600, or the muted status when offline) fades in at the panel's top: a zero-height sticky layer, so nothing moves. The status sentence's dashed mark (card and panel) is settled on the requested values, not on the sentence's text: a comfort change that reads the same closes solid only when the radiators report it, and a failure never plays the morph.
Before the house is known it shows its skeleton (title bar and three section blocks), never « Pièce introuvable ».

A room control appears when at least one radiator takes it, with « S’applique à n radiateurs sur N » (12 px, muted) when it reaches only some of them; a room Kelvin drives nothing in says so in one muted line (« Kelvin ne pilote aucun appareil de cette pièce. »). A room of pilot-wire heaters only gets a secondary « Arrêt » instead of the mode switch.

### RadiatorPanel
One per radiator in the room panel, separated by hairlines, as a disclosure: the row (an h4 holding a 52 px button, `aria-expanded`) shows the name (14/600; the model and power when it has no name of its own), a 12 px muted line (power when named, « Joignable » or « Hors ligne depuis 14:32 », never red), the reading in ink (« — » muted when offline) and a turning chevron. Open (slide 220 ms): the facts list, the **Infos** section (modèle, puissance, niveau de signal as the raw « RSSI n » with its scale marked unverified, connexion, dernier signal, each « — » when unknown), the level or dryer switch, the mode switch and setpoint when the room has several radiators, the toggles (fenêtre ouverte, présence, veilleuse and its slider), and ghost « Renommer » (pencil) and « Faire clignoter » buttons. An offline radiator's commands are `aria-disabled` (its slider hidden) under « Les commandes reprendront quand il sera rallumé. ».

### Programme page (week + one day)
The week is a picture, the day is the form. Under the h1 and the room picker:
- **Temperatures row:** `[swatch] Confort 21,0 °C · [swatch] Éco 18,0 °C` (14 px, values 600 tabular; the comfort swatch is the block colour, the eco swatch the empty well with its field-line edge) and a muted « Modifier les températures › » link to the room. An offline room says « derniers connus » instead of the link.
- **Plan line** (13 px muted): « Maintenant : Confort · 23:00 → Éco » (`fmtNow` in `$lib/program`: the level now, then the next change, « demain 06:15 » or « lundi 06:15 » when it is not today; « Éco, sans changement cette semaine » when nothing changes; a room not in programme mode says the programme applies in Programme mode), the one-line rule « Hors des plages confort, la pièce est en éco. » and a « Comment modifier ? » inline Disclosure (dotted underline, help glyph, `aria-expanded`, its answer on the next line, sliding over `dur(T.enter)`, findable while closed) holding the gestures and keys. No paragraph, no midnight note, no « Aujourd’hui » chart.
- **Layout:** desktop (≥ 1024 px) is the week (fluid) beside the day editor column (`clamp(320px, 38 %, 440px)`, sticky at 16 px, today selected by default) with the send area under the editor. A phone shows the week; a row opens the day view (`?day=monday`, the day name becomes the h1, « ← Semaine · Salon » goes back, the temperatures sit left-aligned under the day header, above the bar). `?room=` opens a room (the room panel's « Modifier les horaires »). Moving between week and day stays on the page, so unsent edits are kept and nothing asks.

### WeekOverview
A s1 panel (hairline, 10 px) with an hour scale and seven rows. It is a container (`container-type: inline-size`): at 560 px and wider a row is `92 px | bar | 176 px` (day name with « aujourd’hui » under it; a 28 px bar; the times right-aligned, two periods per line at most) and the scale is 00 · 03 · … · 24 with matching gridlines every 3 h; narrower (a phone, a small desktop column) the name and times share the first line, a 24 px bar sits under them and the scale is every 6 h. The bar is the editor's well (in, field-line edge, 6 px) with 35 % field-line gridlines, comfort blocks warm at 75 % (4 px), the 2 px ink now-marker on today. An edited, unsent day carries « ● modifié » (ink, 12 px 600) above its times. A locked day is hatched (its blocks warm at 45 %) with its reason on its own 12 px muted line with the lock glyph; an unrecognised day draws no block. Each row is a button named as a sentence (« Jeudi, aujourd’hui, 06:30–08:00 et 17:00–23:00, 7 h 30 confort, modifié »); beside the editor the selected row is `aria-pressed` (s2, muted inset edge), a roving tab stop, and the arrows (Home/End) move and select; on a phone the arrows move focus and a tap opens the day. An offline room's week is read-only: rows are plain, each with its sentence as hidden text. While a send is pending the blocks are dashed muted outlines.

### DayEditor
The one day being edited: a s1 panel (on a phone, the page itself). Header: 36 px edged « Jour précédent » / « Jour suivant » icon buttons (44 px hit) around the day name (h2, 20 px 700; h1 in the phone day view) and a reserved 12 px muted line « aujourd’hui · modifié ». Then the ProgramDay bar, the periods as rows « [swatch] Plage 1 [06:30] → [08:00] [×] » (36 px time fields as wide as « 22:00 » (`--w-time`, shrinking a little on the narrowest phones), the remove button a 36 px `.btn-icon` with a 44 px hit; one period per line from 320 px; the phone shows the number only), the summary « **Confort 8 h** · éco le reste du temps » (or « Éco toute la journée »), validation errors (bad, `role="alert"`), and « Ajouter une plage » + « Copier vers… » (`.btn-sm`). At three periods « Ajouter une plage » is `aria-disabled` and described by « 3 plages au maximum ». While a send is pending the fields stay focusable but are `readonly` + `aria-disabled` and every handler is guarded. A locked day shows its hatched bar, its periods as text and its reason; no field, no add, no copy.

### ProgramDay
The editor's bar: 48 px well (field-line edge, 10 px) with gridlines and hour labels under it every 3 h (6 h on a phone), comfort blocks (warm at 75 %, 6 px) that drag and resize by edge handles with a wider invisible grip; the grips (3 × 16 px dark marks) show on the hovered, focused or dragged block. A block wide enough (≥ 76 px) writes its times inside in 11 px 600 dark ink, on a halo of the block's fill above the now-marker, so the marker never cuts them. A tap on the empty bar adds a period there. Blocks are `aria-roledescription="plage"` with a hidden hint (arrows move by 15 min, Suppr removes). The page does not scroll under a finger while a block is dragged. While pending, blocks become dashed muted outlines and lock.

### Copy sheet (CopyDays, ChoiceSheet)
« Copier vers… » opens a native modal `<dialog>` (focus stays inside, Esc and the scrim close it, focus returns to the trigger): a centred s1 popover (≤ 400 px, fades in 160 ms) on desktop, a bottom sheet (top corners 10 px, grab bar, rises in 220 ms) below 1024 px; reduced motion drops the travel. Title « Copier jeudi vers… », shortcut chips « Jours de semaine », « Week-end », « Tous les jours » (`aria-pressed` when the choice matches), then 36 px day chips (44 px hit) in four columns (the source day dashed and inert, locked days absent), a full-width large primary (`.btn-lg`, 44 px) « Copier sur 4 jours » (`aria-disabled` « Choisissez des jours » at none) and « Rien n’est envoyé avant « Envoyer ». ». A copy changes only the draft; the copied rows pulse once and the copy is announced. « Aussi pour… » uses the same sheet for the other rooms (offline rooms are not offered).

### Offline room (Programme)
A calm notice, never red: s2 at 60 %, hairline, the plug-off glyph, « Chambre 2 est hors ligne » (14 px 600 ink) and « Le programme affiché est le dernier connu. Il pourra être modifié quand le radiateur sera rallumé. » (13 px muted), `role="status"`. The picker suffixes the room « hors ligne ». The week stays visible read-only; no editor, no Envoyer.

### Alert callout
A calm notice on the screen it concerns: s1, hairline, 10 px, 13 px text, an alert glyph; bad alerts take the bad tint (8 % over s1, 60 % edge) and are an `alert` region, others a `status`. `radiator_unreachable` is always drawn neutral (a `status`), whatever its backend severity: an offline radiator is not a fault here; it shows in Home only (the room panel's offline notice says it there). A 44 px « Masquer » icon button ends the row. Never stacked more than the screen's own kinds (Énergie and the room); Home lists them all (`#alerts`). The callouts and the list hold their space while loading, so they never shift the layout (CLS ≤ 0.0003 measured).

### Night-light slider
Under « Veilleuse » while it is on: « Intensité » and the value on one line, a native range (44 px), 1 % then steps of 5 %, keyboard ±5, PageUp/PageDown ±25, Home/End to 1 % and 100 %; sent 600 ms after the last move; the thumb is dashed until the radiator reports the value. Paused with `aria-disabled` (no pointer events), never `disabled`.

### Strip bands
Window open: a neutral 45° hatch; presence: a 10 % neutral fill; both under the comfort wash, with their exact times in a title and their counts in the text equivalent. They are what the radiators reported, edges ±5 min: reports, not heat, so never a heat hue.

### Locked programme day
A hatched bar (its blocks warm at 45 %) for a day Kelvin cannot edit, with its reason on its own 12 px muted line and the lock glyph, in the week and in the day editor; a midnight end shows its periods as text (« 20:00–24:00 »); an unrecognised day draws no block. No handles, inputs, add or copy; copies never land on it. The day stays exactly as the radiator has it.

### Conflict notice
Shown when a send answers `program_changed_elsewhere` (« Programme modifié ailleurs »): bad tint, the two choices « Recharger » and « Remplacer quand même » (danger).

### Signed-in devices
Rows of 56 px: the device in 600, « dernière activité … » muted; « Déconnecter » per row (none on « cet appareil »); « Déconnecter les autres appareils » asks in the Dialog. The panel lives in Maison › Compte (`/home/account#sessions`).

### Autres appareils
On Maison › Pièces et appareils, after the rooms (Plan 12): an « Autres appareils » panel built like the bridge panel (s1, hairline, 14 px padding, 12 px uppercase muted title) for every device that is neither a radiator's nor a bridge (water heaters, heat pumps, devices that do not heat), with its 12 px muted read-only note and one device row each carrying the support chip. Never hidden; no action. On an experimental server the room and device actions (create, rename, move, tidy) are absent: Kelvin changes the setup on the Cozytouch servers only.

### EnergyBars
Stacked SVG bars, drawn at the measured width and a fixed 160 px height (so a phone keeps tall bars and true corners); bars grow from the baseline (360 ms, 12 ms stagger capped at 180 ms) on first draw and on each period change, one series colour per part (2 px corners; HC hatched over its blue, a 1 px knockout between stacked parts), hairline grid at four ticks, micro faint axis labels thinned so each keeps 44 px. The radiators are an **overlay mark**: a 2.5 px round-capped line across the bar at its value, in series-3, over a 4 px s1 knockout so it reads on any bar; the y-scale includes it. Missing parts are never drawn as zero: an interior bucket with no data (data on both sides) gets a faint 2 px dashed (3/3) baseline tick; leading and trailing empties stay blank. With `details` the bars are inspectable: the whole plot is the hit area and the nearest bar wins; a mouse hover shows its ChartInspector, a click or tap pins it, a second tap unpins; while a bar is pinned, hovering another only gives it a muted outline and the card stays. A horizontal touch swipe of 48 px (at least twice its vertical travel) steps the period instead. Each bar has an invisible full-height button in a roving-tabindex group (« Barres du graphique : … ») whose name carries its values: `←`/`→`/`Home`/`End` move and pin, `Enter` drills down (a month opens Mois, a day its Courbe, another day of Jour its own Jour) or, with nothing to drill, pins the bar, and `Esc` clears; Esc inside the card closes it and puts focus back on its bar. The inspected bar takes a 1 px ink outline, never animated. No SVG `<title>`. Empty: « Pas encore de données. » The legend below uses `Swatch`: 10 px squares (3 px radius, HC hatched) for stacked series and a 14 × 2 px line for the radiator mark.

### CurveChart
One day of half-hours (46, 48 or 50) at the measured width and a fixed 140 px height, 1 px-rounded bars with 15 % inner padding, split HC (`--hc` hatched, at the base) under HP (`--hp`) by their off-peak fraction, a 1 px knockout between them, or the single home series without a tariff. The radiators are a 2 px series-3 step line over a 4 px s1 knockout, broken where a half-hour is unknown; the subscribed power (kVA × 1000 × 0.5 Wh) is a faint 1 px dashed line when it is within 2× the data, else a muted sentence states it. Axis 00 · 06 · 12 · 18 on the matching half-hours (so DST days stay true), then 24 at the right edge, micro faint. A 1 px ink crosshair marks the scrubbed half-hour (see Scrubber).
- **Readout:** a fixed row above the chart, so nothing covers the bars: « 18:30–19:00 » (the repeated autumn hour says « (heure d’été) » / « (heure d’hiver) »), then Puissance moyenne, Énergie, Tarif, Prix, Coût, Radiateurs, Reste, Température, as the day has them. Its fields are fixed for the day and read « — » with their reason where a half-hour lacks a value. It **never reflows**: every text a field takes over the day (idle included) is stacked in one grid cell and only the current one is visible, so the browser sizes each field to its widest and tallest text in the real font, at any zoom, and scrubbing moves nothing.
- Empty: « Pas de courbe pour ce jour. »

### Chart data tables
Every chart is a `role="img"` SVG with an aria-label, followed by a table inside `<div class="visually-hidden">` with the same caption, one row per bucket or interval and one column per inspector or readout row (in the inspector's order), « est. » kept after an estimate and « — » (with its reason) in any missing cell. The wrapper matters: a table cannot be narrower or shorter than its rows, so a table that is itself visually hidden widened the page at 320 px and left an empty tail under Énergie.

### ChartInspector
The exact values behind a mark: the chart placement of the **Fiche** (below), drawn through the same row renderer (`FicheBody`), with an optional Provenance block. `$lib/inspector.ts` builds the rows, and the card, the sheet, the hidden table and the announcement all read the same rows, so they cannot disagree. Desktop: a 260 px **card**, s2 with a hairline and the 10 px radius, flat (no shadow), placed beside the bar and flipped to its left near the right edge (centred and clamped when neither side fits), never outside the chart; it takes the pointer only when pinned, so its action can be clicked. Phone: a **sheet** docked under its chart (the hero's at the hero's end), so nothing above it moves. A 13 px 600 title, then label / value rows (muted label left, tabular value right, « dont … » rows indented 10 px); a row is omitted when its source does not apply, but a value the reader expects (the radiators in a home that has them, a cost) reads « — » with its reason under it in 12 px muted. A 12 px muted « est. » follows an estimate, then the notes, and a footnote linking « est. » to Qualité des données; an optional `.btn-sm` action (« Voir la courbe du 13/10 »). Esc inside closes it and gives focus back to what opened it.
- **Motion:** the card fades in over `dur(T.state)` (160 ms) and the sheet slides open over `dur(T.enter)` (220 ms), both `|global` transitions: the host mounts the inspector inside its own `{#if}`, and a local transition would not play there. Under reduced motion `dur()` is 0: it appears and leaves at once.

### Data on demand: three depths
Every screen answers at a glance and keeps the exact data one step away (direction-2 §1):
- **L0 · Glance:** the answer, rounded (« Hero / sentence » precision), estimates marked « ≈ » / « est. ». Always on screen.
- **L1 · Exact:** the exact value(s), unit, period, **source**, **freshness**, **measured or estimated** and how: a **Fiche** opened from a **Fig** (hover, focus + Enter, tap).
- **L2 · Analysis:** tables, breakdowns, method text, raw states: a **Disclosure** (closed by default, `hidden="until-found"`) or a sub-page.
A value is never L1-only if a reader needs it to decide, never L0 if only an auditor needs it; L0 never shows a method sentence (a footnote stays only when it changes the meaning, as one muted ⓘ line). Every exact figure goes through `Fig` and `$lib/provenance.ts`. The props of every piece below are listed in « Foundation components: API ».

### Fig (exact-value trigger)
A figure with more precision or provenance than it shows is a `<button class="fig">` (`Fig.svelte`): no box, the text's own style, a 1 px dotted underline in faint with a 3 px offset (the only cue, visible on touch too), firmed to muted on hover and to ink while its Fiche is open; its `::before` makes the hit area 44 px tall without changing the line. Accessible name: the L0 value plus « détails » (« 19,5 °C, détails »). Mouse: the Fiche opens after 120 ms of hover and closes 200 ms after the pointer leaves both figure and card. Click, tap or Enter **pins** it. Not every number is a Fig: only those with more to say.

### Fiche
`Fiche.svelte`, generalising ChartInspector. Desktop (≥ 1024 px): a 280 px card (s2, hairline, 10 px, flat, 13 px) placed beside its trigger (right, flipped left near the edge, clamped in the viewport; `fichePlace`), portalled to `<body>` and fixed, a non-modal `role="dialog"` named by its title; pinned, it shows a 36 px close button (44 px hit) and closes on Esc (focus back on the figure), on a press elsewhere, or when keyboard focus leaves it; opened from the keyboard, focus moves to its close button. Phone: the same content in the ChoiceSheet bottom sheet (its title as the sheet's heading). Content (`FicheBody.svelte`, shared with ChartInspector): a 13 px 600 title; label/value rows (muted label left, tabular value right, « dont » rows indented 10 px, a 12 px « est. » after an estimate, the reason under a « — »); notes; then the **Provenance block** under a hairline in 12 px: `Source`, `Relevé`, `Nature` (`$lib/provenance.ts`), its notes, and one optional `.btn-sm` action. Fades in over `dur(T.state)` (`|global`).
- **Provenance vocabulary** (§1.4): `mesuré` (no L0 mark), `estimé · <méthode>` (« est. »), `projection · <méthode>` (« ≈ »), `calculé · <formule>` (« ≈ »), `publié` (a grid signal as RTE/EDF gave it). Sources: « Linky · Enedis via MyElectricalData », « Compteur du radiateur (Salon 1) » / « Compteurs des radiateurs », « Votre tarif », « RTE EcoWatt via MyElectricalData », « Tempo (EDF) via MyElectricalData », « Cozytouch », « Calcul Kelvin ». Relevé: « jusqu’au 14/10 », « courbe jusqu’au 14/10 », « il y a 3 min » within the hour, « 21:11 » today, else date and time; « synchro … ».
- **Room panel:** the header reading (each radiator that answers, their mean, the target; Cozytouch, measured, « moyenne des radiateurs joignables ») and the Énergie figures (Consommation with its HC/HP parts and coverage, from the radiators' meters, estimated when spread between readings; Coût, calculated from your tariff; Heures de chauffe and Part du temps en chauffe, calculated) are Figs.

### Freshness and SourceLine
**Freshness** (`Freshness.svelte`, states from `$lib/freshness.ts`): an 8 px circle, 1.25 px stroke, beside a source's name, `aria-hidden` and always paired with words. Solid muted ring = fresh (within the source's cadence); **dashed** muted ring = waiting or late (first sync, quota, next read pending, stale: the pending signature); solid bad dot = failed (only what is already red: token refused, sync error, Cozytouch down); nothing when there is nothing to say. Cadences: Cozytouch 15 min; Linky (daily and curve) the day before, due by 12:00 the next day; RTE EcoWatt 6 h; Tempo 24 h, and tomorrow's colour due after 11:00.
**SourceLine** (`SourceLine.svelte`): one 12 px muted line `[mark] Source · state`, ellipsised (never reflows), in bad text only when failed; with a Fiche its words are a Fig opening the source's times, quotas and next read. The sidebar's status footer is the Cozytouch SourceLine (`CozytouchStatus`), dashed while Kelvin's own stream is not open. Later: Énergie context row, Maison cards, Sources, radiator rows. Login is exempt.

### Disclosure
`Disclosure.svelte`: a 44 px button row (13 px 600 ink, a chevron turning 90° over 220 ms, an optional right-aligned 12 px muted meta « 3 lignes ») toggling a region that is `hidden="until-found"` when closed (find-in-page reaches it; `beforematch` opens it), sliding by its grid row 0fr → 1fr over `dur(T.enter)`; reduced motion: instant. Under a heading (`heading="h2"`) the heading holds the button and the button takes the heading's type (Qualité des données keeps its section label). `detail` opens it at first render when « Afficher les détails techniques » is on. The `inline` variant is a dotted 13 px muted text button with the help glyph inside a sentence line; its region takes the next line (Programme « Comment modifier ? »). Replaces every ad-hoc toggle (QualityPanel, Programme help, the error page's « Détails »).

### Menu
`Menu.svelte`: a 36 px « ⋯ » icon button (edged, 44 px hit) or a labelled ghost trigger (« Exporter ») opening a popover (s1, hairline, 10 px, 8 px padding, min 220 px, portalled and fixed, under the trigger and right-aligned to it, flipped above near the bottom) on desktop, or the same items in the bottom sheet on phone. Items are 44 px rows (16 px muted icon + 14 px label), a hairline between groups, destructive items in bad text, a 12 px muted non-interactive footer line. `role="menu"` / `menuitem`: focus lands on the first item, arrows/Home/End move, Enter or Space activates and closes, Esc closes and returns focus, Tab closes. A disabled item stays focusable (`aria-disabled`) with its reason as a 12 px muted second line (`aria-describedby`).

### PageHeader
`PageHeader.svelte`: the h1 (22/700) and right-aligned actions on one 44 px row, then one 13 px muted **state line**, ellipsised (never reflows); a sub-page puts its back link (« ‹ Maison », 44 px) above the h1, first in the DOM. Pièces and Programme keep their own equivalents; Énergie, Maison and its sub-pages adopt it with their redesigns.

### Preference « Détails techniques »
Per device, off by default: `localStorage` `kelvin-detail`, applied before first paint as `<html data-detail="on">` by the app.html boot script (like the theme), read through `$lib/stores/detail.svelte.ts`. When on, every `detail` Disclosure starts open (Qualité des données today), and later batches show the SourceLines L0 hides and the live power estimate. It never changes a format or adds a panel. The toggle sits in Maison › Réglages (it moves to Maison › Affichage with the overview).

### Error and 404 pages
`routes/+error.svelte`, centred in main at most 420 px: a 40 px s1 circle with the help glyph (404) or the alert glyph, the h1, one 13 px muted sentence, then the ways out. 404: « Cette page n’existe pas », « L’adresse est peut-être ancienne ou incomplète. », primary « Aller aux pièces », secondary « Énergie », « Maison ». Load error: « Kelvin n’a pas pu afficher cette page », the cause in words (server error, Kelvin unreachable, unexpected), primary « Réessayer » (a full reload), « Aller aux pièces », and a « Détails » Disclosure (code, time, address; never a stack trace or an id). A legacy French path is still sent to its English page first.

### Foundation components: API
Stable props (`web/src/lib/components/` unless noted); every string comes from the dictionaries.
- **`Fig`** `{ value: string; label?: string; title: string; rows?: FicheRow[]; empty?: string | null; notes?: string[]; provenance?: Provenance | null; action?: { label; run } | null; class?: string; children?: Snippet; openDelay?: 120; closeDelay?: 200 }`. `value` is the L0 text (and the name's lead, « value, détails »; `label` overrides the lead); `children` draws the figure when it is more than text.
- **`Fiche`** `{ open; pinned?; anchor?: HTMLElement; id; title; rows?; empty?; notes?; provenance?; action?; focusOnOpen?; onclose; onenter?; onleave? }`: the placement (card ≥ 1024 px, sheet below); hosts other than Fig drive it. `fichePlace(anchorRect, cardSize, viewport)` is exported.
- **`FicheBody`** `{ title?; titleId?; rows?: FicheRow[]; empty?; notes?; provenance?; estLink?; action? }`, `FicheRow = { key?; label; value; est?; note?; sub? }`: the one row renderer (ChartInspector uses it; it also takes `provenance`).
- **`$lib/provenance.ts`** `provenance(kind, data?, now?) → { kind, nature, rows: {label, value}[], notes }`, kinds `linky-day | linky-curve | radiator-meter | tariff | rte-ecowatt | tempo | cozytouch | kelvin-calc`, data `{ day?; at?; syncAt?; name?; nature?; method?; notes? }`; `sourceName`, `natureText`, `when`.
- **`$lib/freshness.ts`** `freshness(source, { at?; day?; failed?; waiting?; tomorrowKnown? }, now) → 'fresh' | 'late' | 'bad' | 'none'`, sources `cozytouch | linky-day | linky-curve | rte-ecowatt | tempo`; `CADENCE_MS`.
- **`Freshness`** `{ state: Fresh }`. **`SourceLine`** `{ source; text; state; title?; rows?; notes?; provenance?; action?; class? }` (a Fiche when `title` is set).
- **`Disclosure`** `{ title; meta?; heading?: 'h2' | 'h3' | 'h4'; detail?; open? (bindable); variant?: 'row' | 'inline'; id?; buttonId?; class?; ontoggle?; children }`.
- **`Menu`** `{ label?; items: (MenuAction | 'separator')[]; text?; icon?; footer?; class? }`, `MenuAction = { label; icon?; onselect; disabled?: string | null; danger? }`.
- **`PageHeader`** `{ title; state?; back?: { href; label }; actions?: Snippet; stateLine?: Snippet }`.
- **`Swatch`** `{ series: 'hc' | 'hp' | 'home' | 'radiators'; size?: 8 | 10; line? }`; **`ChartDefs`** (mounted once: `url(#hc-hatch)`); `SERIES`, `SERIES_HATCH`, `seriesBackground(key)` in `$lib/energy.ts`.
- **`$lib/stores/detail.svelte.ts`** `detail.on`, `detail.set(on)`; **`$lib/navAlerts.ts`** `navAlerts(summary, list)`; **`$lib/portal.ts`** `use:portal`.
- **CSS:** `.fig`, `.hit` (`--hit-y`, `--hit-x`), `.btn-lg`, `.w-time` `.w-price` `.w-date` `.w-kva` `.w-text`; tokens `--ctl-*`, `--w-*`, `--hc`, `--hp`, `--hc-hatch`.
- **e2e:** `e2e/cls.ts` `measureCls(page, route, { fonts: 'normal' | 'blocked' | 'late' })`, `CLS_WIDTHS`, `FONT_MODES`, `settled(page)`; `e2e/cls.spec.ts` holds the matrix.

### Scrubber
An ARIA slider laid over a half-hour chart (`role="slider"`, `aria-valuetext` « 18:30–19:00, 1,47 kW, 734 Wh »), 12 px past the plot's top and bottom. The whole plot is the target and the nearest interval wins (only x counts); a mouse scrubs on hover, a finger by pressing and dragging (`touch-action: pan-y`, so vertical scroll stays with the page). `←`/`→` move 30 min, `PageUp`/`PageDown` 3 h, `Home`/`End` the ends, `Esc` clears. The Courbe and Température et chauffe share one index, so the same half-hour is marked and read in both. The crosshair and the readout follow it without animation.

### PeriodNav
A 44 px row under Énergie's Segmented: the edged icon buttons « Période précédente » and « Période suivante » (the previous chevron mirrored) around the period label (`#period-label`, 15 px 600, centred, balanced wrap), and a ghost « Dernier jour » when the latest period is not shown. `←`/`→` step and `Home` returns to the latest from any of its buttons (focus stays in the row when « Dernier jour » leaves); a horizontal swipe on the bars steps too. The ends are `aria-disabled` and stay visible. Every way of changing the period (views, ‹ ›, « Dernier jour », a drill, a swipe) announces the new period once.

### Énergie
- **Order:** the Segmented (Jour / Semaine / Mois / Année) and the navigator, then the hero, Consommation, Courbe du …, Température et chauffe (Jour, Semaine), Puissance (Jour, Semaine), Heures creuses / pleines, Chauffage, Comparaisons, Projection, Par pièce et par radiateur, Qualité des données (collapsed), Compteurs des radiateurs, Exporter. Without Linky: the hero, Consommation des radiateurs, Par pièce, Compteurs, Exporter.
- **States:** the first load shows the navigator row and four panel skeletons (150, 262, 300 and 92 px), then the report and the Linky line at once (CLS < 0.05, `e2e/layout.spec.ts`). A period switch keeps the previous report on screen at 55 % with `aria-busy`; a failed one leaves it there, names the period that failed and offers « Réessayer ». The Courbe of another day is replaced at once by a skeleton at the chart's height; Température et chauffe keeps the previous room on screen, dimmed, until the new answer, and holds the chart's height while a day loads. Only Par pièce, Température et chauffe's room picker, the counters and the room export wait for the live house (each holds its skeleton, `aria-busy`).
- **Navigator:** see PeriodNav. Jour draws the 7 days ending on the day and the day's Courbe; Semaine the ISO week's days; Mois the month's days; Année its months. The hero, the panels, the tables and the CSV always describe the selected period; a running period is described up to its last day with data (« du 1/10 au 12/10 »), and its radiators and room figures up to yesterday. Midnight with the page open asks the period again.
- **Hero:** the display figure is a button that opens the period's inspector (a card on hover or click, a sheet on phone): € when a tariff priced the period (with the 12 px « estimation » tag), else Linky kWh, else radiator kWh. Then « 412,6 kWh · HC 158,3 kWh · HP 254,3 kWh · du 1/10 au 12/10 » (the parts at the total's decimals, adding up to it; on phone the range takes its own line), « Énergie 96,41 € + abonnement 6,29 € » (adding up to the figure), the comparison on comparable days only (« −4 % de consommation par rapport à septembre 2026, sur 12 jours comparables », plain muted text, omitted when too few days pair), and muted footnotes: missing days and their uncounted energy, an estimated HC/HP split, radiator energy spread over a recording gap, prices applied retroactively, a partial radiator sum, the missing tariff.
- **Consommation de la maison:** EnergyBars of HC + HP (or the home series) with the radiator overlay, the inspector and the legend; leading buckets before Linky history are trimmed, with « Historique Linky depuis le … ». Without Linky, « Consommation des radiateurs » in series-3.
- **Courbe du …:** the day's CurveChart with the Scrubber. Outside Jour, two icon buttons step through the period's complete-curve days (`aria-disabled` at the ends); it opens on the newest complete day of the period. Under it: « Courbe 21,60 kWh · relevé journalier 22,03 kWh (écart 2,0 %) », « HC 8,98 kWh · HP 13,05 kWh, d’après le relevé journalier » (est. when the split is not from the curve), « Courbe incomplète (41/48 demi-heures) », « ≈ » explained when an HC slot edge falls inside a half-hour, and an empty day's reason (« antérieure à l’historique de courbe (depuis le …) », « antérieure au premier jour compté (depuis le …) », « pas encore récupérée (quota) »).
- **Température et chauffe** (Jour, Semaine): one room (Segmented on desktop, a select on phone; the first room of Pièces with a radiator by default, never following the period) on the Courbe's day: its radiators' Wh as light series-3 bars, the temperature as a heat-ramp line, the setpoint as a 1 px muted step line, Wh on the left axis and °C on the right, sharing the Courbe's scrubbed half-hour. A half-hour whose room sum is unknown reads « — (radiateur sans relevé) ».
- **Puissance** (Jour, Semaine): « Pointe moyenne sur 30 min » 20 px with its half-hour (and day in Semaine) and « la pointe instantanée peut être plus élevée », « abonnement 12 kVA », a 6 px meter of the peak against the subscribed power with « kVA ≈ kW, facteur de puissance supposé 1 », « Talon (veille) » with the night minimum and « 10 % des demi-heures sont sous … », « consommation de fond ≈ … » (with € in Jour, per day in Semaine over N complete days). Complete curve days only; else « — » and why.
- **Heures creuses / pleines:** « Part en heures creuses » (20 px) against the slots' share of the day, the mean price paid, « Chaque kWh passé d’HP en HC » and a 0–50 % slider (step 5) with its result « à consommation identique », its formula, and « Calcul sur vos prix et votre consommation, pas une économie garantie. » Without a tariff: « Renseignez le tarif pour voir la répartition. »
- **Chauffage:** the radiators' share over the common days (« (11 jours sur 13) ») 20 px, a 6 px meter (series-3 over the well), the two parts in kWh when they are whole, « Coût du chauffage ≈ … (énergie, hors abonnement) », and the coverage note when the radiator sum is partial or counted up to yesterday. Above 102 %: « — » and « Les radiateurs dépassent le compteur : données incohérentes. »
- **Comparaisons:** three rows (période précédente, même période l’an dernier, moyenne des 4 derniers …), each « +12 % » with « −14,20 kWh · −3,61 € » and « sur N jours comparables », or « — » with its reason (« 9 jours comparables sur 13 : pas de comparaison »). Never red or green. Footnote: only days measured on both sides count; the cost compares energy only.
- **Projection:** always subtitled « Mois en cours et 365 prochains jours » (it follows the latest Linky day, not the period on screen): « Octobre 2026, mois complet ≈ … » with what is measured and the estimated missing days, « 365 prochains jours ≈ … » with its dates, a dashed series-1 sparkline of the 12 projected months from zero, « Estimation, au rythme récent et aux prix d’aujourd’hui. » and a « Comment c’est calculé » disclosure that states the backend's formula. Linky late: « — » and why.
- **Par pièce et par radiateur:** the selected period's elapsed days (subtitle « du 1/10 au 12/10 »), full width: a table (12 px mono figures, units in the headers) from 640 px of panel width, a list below; each room expands to its radiators; « partiel » with « 1 radiateur sur 2 enregistré à partir du 7/10 »; shares by largest remainder; a room's HC and HP add up to its kWh and its radiators' rows to the room (`matchParts`, largest remainder), and the rooms' € add up to Chauffage's cost; °C, consigne and heating hours read « — » with their reason; « Sans pièce » holds unassigned and removed radiators. Rooms carry no colour of their own.
- **Qualité des données:** a collapsed **Disclosure** (`#quality`: an `h2` holding its toggle button, never a heading inside `<summary>`, whose button role hides it from heading navigation in some readers; the closed body is `hidden="until-found"`, so find-in-page reaches it and opens the panel; `detail`: open by default with « Détails techniques ») that every « est. » links to: a coverage strip per bucket of the selected period for Linky journalier · Courbe · Radiateurs (ink full, faint partial, dashed missing, blank when nothing was expected yet; in Jour the day's one cell, not the seven bars), then the history dates, the estimated days with their fallback share and method, the mean curve / daily gap and the retroactive prices, all over the selected period (`period.quality`).
- **Compteurs des radiateurs:** the lifetime counters in mono columns headed « Depuis l’installation (kWh) », « Registre 1 (kWh) », « Registre 2 (kWh) » (the radiator's own registers, not HC/HP); see the fold in Layout.
- **Exporter:** ghost buttons « Exporter la période (CSV) », « Exporter la courbe du 12/10 (CSV) » (when the day has a curve), « Exporter par pièce (CSV) » (`aria-disabled` until the house is known) and the format in one muted line; the contract is in `web/README.md`.

#### Énergie precision
Every figure goes through `$lib/format.ts`:

| Quantity | Hero / sentence | Inspector, table, readout | CSV | Missing |
|---|---|---|---|---|
| kWh | 1 decimal below 1 000, else 0; parts at the total's decimals, adding up (`fmtKwhHero`, `fmtKwhParts`) | 2 decimals (`fmtKwhExact`) | 3 decimals | « — » (CSV: empty) |
| Wh (half-hour) | — | integer (`fmtWh`) | integer | « — » |
| Power | — | integer W below 1 kW, else kW with 2 decimals (`fmtW`) | integer W | « — » |
| € | 2 decimals below 1 000 €, else 0 (`fmtEurHero`) | 2 decimals (`fmtEurExact`); half-hour 3 (`fmtEurHalfHour`) | 2 (half-hour 4) | « — » |
| €/kWh | — | 4 decimals (`fmtPrice`) | 4 | « — » |
| % | integer (`fmtPct`); sets of shares by largest remainder (`fmtShares`) | 1 decimal (`fmtPct1`) | 4-decimal fraction | « — » |
| Change | « +12 % » / « −8 % » (`fmtChangeShare`), muted | with « −14,20 kWh · −3,61 € » (`fmtSigned`) | — | omitted |

The CSV follows the UI language for its numbers: in French a decimal comma with `;` between cells, in English a decimal point with `,`; never grouping. Its headers and file names stay French in both (a machine contract, `web/README.md`).

**Shown parts add up.** Wherever a total and its parts are shown together (hero kWh and HC/HP, an inspector's « dont » rows, a room's HC/HP), the parts go through `matchParts`: rounded to the total's decimals by largest remainder, so the shown parts add up to the shown total. Parts that are not a decomposition (one is missing) are rounded on their own.

**A day reads the same € everywhere.** The backend rounds € once, from running sums anchored on 1 January (`billing/report.py`): a bucket's cents are round(sum to its end) − round(sum to its start), for energy, subscription and the radiators alike. So a day, a week or a month reads the same € in Jour, Semaine, Mois, Année and the CSV, the bars add up to the hero to the cent, and the rooms' € (shared by largest remainder) add up to Chauffage's cost. The web never rounds € by bucket on its own.

An estimate (a fallback HC/HP split, radiator energy spread between readings, a projection, a prorated slot edge) carries a 12 px muted « est. » (or « ≈ » / « estimation ») and leads to Qualité des données.

**« — » always says why.** A figure the API leaves `null` reads « — » with its reason, never 0 and never a partial sum passed off as whole: « jour en cours, compté une fois terminé » (radiators count up to yesterday), « 2 sur 3 radiateurs mesurés » (a half-hour whose radiator sum is unknown), « radiateur sans relevé » (a room's half-hour), « aucun relevé sur la période » (a radiator or room), « antérieure au premier jour compté » (a day before the counted range), « Radiateurs au-dessus du compteur : écart de mesure » (a negative rest); a partial radiator sum says its coverage.

- **Under Tempo** the HC/HP panel lists the six colour rows (dot, name, kWh, €, tabular) and « Jours rouges : N »; the inspector gains « Jours Tempo »; the Courbe readout says « Heures pleines · Rouge ». **Under Base** the panel is one sentence, « Option base : pas d’heures creuses. », the bars draw the whole consumption as one series (legend « Consommation »), and the by-room table drops its HC/HP columns (the € column stays); a bucket mixing Base and split days draws its Base days whole. Days without a Tempo colour keep their kWh and say « énergie de N jours sans couleur Tempo non comptée »; never 0 €.

### Maison overview (`/home`)
An overview, not a form (UX batch 8). PageHeader « Maison » with its state line (« Tout va bien » | « 2 alertes · Absence jusqu’à dim. 18:00 ») and, on desktop, « Partir en absence… » (« Absence · dim. 18:00 » in cool while one runs). Then:
- **En ce moment** (panel, 12 px section label): one row per override, a 16 px glyph (away in cool, flame in warm), « **Absence** · 12,0 °C jusqu’à dim. 18:00 » / « **Chauffe temporaire** · Salon · 22,0 °C jusqu’à 21:45 » with a 12 px muted second line (« toutes les pièces · Chambre 2 hors ligne », « puis retour au réglage d’avant », « Rétablissement en cours… ») and a `.btn-sm` « Terminer » / « Arrêter » (named « Terminer l’absence », « Arrêter la chauffe temporaire : Salon »); none: « Tout suit son réglage habituel. ». Quick actions below (HouseActions): desktop « Tout remettre en programme », « Tout éteindre »; phone full-width rows « Partir en absence… », « Tout remettre en programme », « Tout éteindre ».
- **Alertes** only when there are some (or their load failed); never « Aucune alerte » on the overview.
- **Section cards** (HomeCard) in a grid of two columns from 720 px of container (max 1080 px): Pièces et appareils (« 3 pièces · 4 radiateurs », « 1 hors ligne », « lecture seule sur ce serveur » on an experimental server, the Cozytouch SourceLine), Tarif (« HC/HP · 9 kVA · 15,00 €/mois », the prices with their swatches, a compact HoursBar; « Pas encore de tarif »), Linky (state with its Freshness ring; « Non relié · reliez-le pour la consommation de la maison »), Sources de données (« Tout est à jour » | « 1 source en retard », a ring per source), Compte (email, « Sauter Cozytouch · 2 appareils connectés »), and **Affichage** (not a link: Thème, Langue, « Afficher les détails techniques »). A card whose summary failed says « Indisponible pour le moment ».
- Version footer « Kelvin 0.1.0 » (mono 12 muted, centred).
Below 720 px of container the five cards become one grouped panel of 64 px rows (title 15/600, one ellipsised summary line, chevron), Affichage its own panel. Old anchors: `/home#tariff` → `/home/tariff`, `#linky` → `/home/linky`, `#sessions` → `/home/account#sessions` (replacing the history entry), `#away` opens the Absence sheet on the overview, `#alerts` stays (`homeAnchor` in `paths.ts`).

### HomeCard
s1, hairline, radius 10, 14 px padding, min-height 132 px; title 15/600 + chevron, 13 px lines, the SourceLine at the bottom above the stretched link. The whole card is the title's link (`::after` inset 0); its name is « Tarif, HC/HP · 9 kVA · 15,00 €/mois ». Hover firms the edge to faint, press is s2, focus rings the card. The title carries `view-transition-name: home-<section>` and travels into the sub-page's h1. List form: see Maison overview.

### AwaySheet (« Partir en absence »)
One sheet, mounted in the layout, opened from wherever the user is (`awaySheet.show(trigger)`): the sidebar « Absence… », the phone Pièces header icon, Maison, `/home#away`. ChoiceSheet: a bottom sheet below 1024 px, the centred dialog above; focus starts on the selected preset and returns to the opener. Content: the 13 px muted lead « Toutes les pièces baissent, puis reprennent leur réglage. »; « Jusqu’à (heure de Paris) » with three 36 px chips (44 px hit, `aria-pressed`): « Demain 18:00 », « Dimanche 18:00 » (the coming Sunday; next week's once today's is less than 15 min away), « Date précise… » (reveals a `datetime-local`, `min` now + 15 min). Default « Dimanche » from Thursday 14:00 to Sunday 12:00, else « Demain » (`awayPresets(now)`, Paris time). Température: Stepper 7–19 °C (12 °C) with « hors-gel à partir de 7 °C ». The consequence sentence (`aria-live`): « Les 3 pièces passeront à 12,0 °C jusqu’à dim. 18 oct. 18:00, puis reprendront leur réglage. », the rooms counted from the radiators that take a temperature, and a muted line per offline room « Chambre 2 est hors ligne : elle ne recevra peut-être pas la consigne. ». Then « Partir » (`.btn-lg` primary, full width; paused with « En attente de la connexion à Kelvin. » while Kelvin is not connected) and « Annuler » (ghost). Sent through the house command path (the sidebar PendingTag shows « Envoi… »); the sheet closes and a toast « Absence jusqu’à dim. 18 oct. 18:00. » offers « Annuler l’absence ». While an absence runs the sheet is « Absence en cours »: « Absence jusqu’à … · 12,0 °C », « Prolonger… » (the presets again, primary « Prolonger ») and « Terminer maintenant ». The sidebar button reads « Absence · dim. 18:00 » in cool; the phone header icon gains a 4 px cool dot.

### HoursBar
The off-peak hours on a 24 h bar (tariff, never warm): 16 px (10 px compact, on the Maison card), radius 4, the day a 35 % `--hp` wash with a hairline of the same blue, each off-peak block `--hc` with the hatch (a slot past midnight is two blocks); scale 00 · 06 · 12 · 18 · 24 in 11 px faint below (not in the compact form). An image named by the hours in words (« Heures creuses : 22:00–06:00 »), which are always written beside it.

### Linky status wording
One status, two places (the Énergie callout and the Linky panel on Maison). Progress is neutral and offers no link, because there is nothing to fix: never synced (« première synchronisation en attente »), quota (« historique en cours de récupération, la suite arrive demain ») and throttled (« Enedis limite les requêtes, nouvel essai à 14:30 ») read as plain or muted text. Only `auth` (« MyElectricalData refuse le jeton Linky. » with « Renouveler le jeton ») and `error` (with « Réglages ») use the bad colour and an alert role. Not connected at all is a neutral invitation with a « Réglages » link. In the panel the good state reads « Relié · données jusqu’au 13/10 · synchro il y a 5 min ».

### Form fields
A field is a label wrapping its control: a 12 px muted caption, 4 px, then a 36 px well (`--ctl-h`; in, field-line edge, 8 px, 0 × 10 px padding; owner ruling: fields were « gros ») set in 15 px body with tabular figures, 16 px below 1024 px so iOS never zooms on focus (`--fs-field`). The base style is global in `app.css`; components add only layout. Selects share the input's exact geometry. Placeholders are muted (never the browser grey) and never carry the only instruction: a hint is a 12 px muted caption under the field, linked with `aria-describedby` (Linky: « Enregistré », then « Laissez vide pour garder le jeton. »). An invalid field is `aria-invalid`, edged in bad, linked to its error and focused. Units live in the caption, never in the field: « Abonnement (€/mois) », « Prix heures creuses (€/kWh) ». Decimal fields accept a comma or a point. **Width is intrinsic**, never a stretched column for a short value: time fields `--w-time` (6.5 rem), dates `--w-date` (10 rem), prices `.w-price` (7.5 rem), kVA `.w-kva` (8 rem), text fields `.w-text` (`min(100 %, 22 rem)`), the PDL 14 digits; groups wrap (`flex-wrap`, 12 px × 16 px gaps) instead of grid columns. The caption wraps the field, so the tap area is caption plus field. A repeated group (Heures creuses slots) sits in a hairline-topped fieldset whose legend is a section label, with each slot on one line « [22:00] → [06:00] [Retirer] » (the captions « Début / Fin de la plage n » stay as the fields' hidden names) and a ghost « Ajouter une plage ». Errors follow in 13 px bad (alert), success in 13 px ok (status), then one primary button, left-aligned.

### Grid strip
One 13 px line under the page header on Rooms and Energy, wrapping on a phone: the Tempo pair « Aujourd’hui : ● Bleu · Demain : ● Rouge » (only while the price row in force is Tempo; « Demain : couleur pas encore publiée (vers 11:00) » before publication, « couleur inconnue » when a day has none), then « EcoWatt orange demain, 18:00–20:00 » with the alert glyph (muted; red in State Red; the hours dated by their own timestamps), then the muted source « RTE via MyElectricalData · 11:20 ». Nothing when there is nothing to say (EcoWatt green, no Tempo). It arrives with the snapshot and is updated by the SSE `grid` event. Its height is known only then, so no skeleton can hold it: on Rooms the skeleton columns are replaced as a whole by the loaded ones, strip included, in one frame; on Energy it waits for the report. Either way it never shifts the page (`layout.spec.ts` measures `/` under HC/HP and Tempo).

### Sources
Réglages › Sources: one row per grid source (« à jour, relevé à 11:20 · prochain relevé 17:15 », « indisponible depuis 08:15 » in State Red text, « quota du jour atteint, reprise demain »), then the muted MyElectricalData calls line (« … : 6 sur 10 (dont 2 pour Tempo et EcoWatt) »). The Tempo row appears only with a Tempo tariff.

### Tariff form
The option Segmented (Base · HC/HP · Tempo) heads the form; the fields follow the option at their intrinsic widths: one price, two (each caption starting with its 8 px tariff-blue swatch, HC hatched), or six in a two-column grid (each colour's off-peak then peak; the caption carries the TempoDot for the day colour **and** the swatch for the hour type). HC/HP has its own « Applicable à partir du » and an optional season split: each season is a hairline-topped block with twelve 36 px month chips (copy-chip style, 44 px hit, 8 px apart) and up to three slots. Tempo has its two hour fields and the note on the 06:00 day; « Préremplir avec les prix Tempo publiés » is a ghost button whose result states its source and date (the Paris day) and saves nothing. Enedis' new off-peak hours appear as a calm callout inside the HC section with a date and « Ajouter ces heures creuses à partir du … ». Both time fields stay whole at 320 px.

### Price history (Tarif)
A 13 px table under the form: « Depuis » (long date), « Option », « Abonnement (€/mois) » and « Prix (€/kWh) » (the row's rates, « HC 0,2068 · HP 0,2700 », « Bleu HC … »), the units in the headers so the mono cells are bare figures (« 15,00 »); below, « Heures creuses successives », one line per schedule with its seasons. Headers muted 500, hairline rows, cells never wrap, the wrapper scrolls inside the panel rather than the page. Below 600 px it is replaced by a list, one hairline-separated entry per price with the same labels on the left and mono values on the right.

### Login
Outside the shell, one centred 360 px column: the « Kelvin » brand (700), « Connexion » as a headline, a 13 px muted lead « Utilisez le compte Cozytouch de la maison. », two labelled 36 px fields (Email, Mot de passe), the error line when there is one, then a full-width large ink primary (`.btn-lg`, 44 px) « Se connecter » (« Connexion… » while busy). With the simulator a 12 px muted line gives the demo account. After a password change the screen adds a neutral note (s1, hairline, 10 px, 13 px, role status) « Reconnectez-vous avec le compte Cozytouch. »: being asked to sign in again is not an error. At the bottom of the column, centred, a compact « FR | EN » Segmented (each option with its `lang`, named « Français » / “English” by `ariaLabel`, the group named by the current language's « Langue » / “Language”) switches the language before signing in, without a reload; the choice is remembered on the device. In English the screen reads “Sign in”, “Use the home’s Cozytouch account.”, “Email”, “Password”.

Plan 12: a « Serveur » select comes first (a « Cozytouch » group, then « Expérimental — chauffage seulement »), Sauter preselected; « Se connecter » waits until the list is read, and a failed read shows an alert with « Réessayer ». Choosing an experimental server adds the experimental note in the reauth note's box (linked by `aria-describedby`). Once the home is claimed, one muted line names its server (« Serveur : … ») instead of the field. Server names are product names, never translated.

### Buttons
One system in `app.css`: `.btn` plus a variant; components never restyle a button.
- **Size (owner ruling):** every button is painted at `--ctl-h` (36 px, 8 px radius, 14 px sides) and its `::before` extends the hit area to 44 px (`--ctl-hit`). **`.btn-lg`** (44 px painted, 16 px sides) is the one primary action of a page or sheet on phone: « Se connecter », Programme « Envoyer » below 1024 px, « Copier sur n jours ».
- **`.btn` (secondary):** s2 fill, ink text, 600, hairline. `.btn-sm` is 13 px with 12 px sides (house actions, inline actions).
- **`.btn-primary`:** ink fill and edge, bg text. One per section at most.
- **`.btn-ghost`:** transparent, ink 13 px 500, hairline, 8 px.
- **`.btn-icon`:** 36 px square (44 × 44 hit area), muted, no edge, 8 px.
- **`.btn-danger`:** bad at 25 % over s2 (the « Tout éteindre » confirmation).
- **States:** hover (pointer devices only) firms the edge to faint, lifts ghost and icon to ink on s2, and lightens primary to 88 % ink; press scales to 0.98 (100 ms, not under reduced motion); every change eases over 160 ms. Disabled keeps its fill and turns its text faint (a disabled primary becomes s2 with faint text), never a translucent slab. A button that must keep focus while inert (stepper bounds, curve day at an end, login while busy) uses `aria-disabled` with the same look.

### Banner
A full-width status strip atop the main column, sticky, opening and closing by its grid row (0fr → 1fr, 220 ms) instead of jumping; the live region is always mounted. Every message dates the data it shows (« données de 21:14 », the last time Kelvin sent anything). Tones (direction-2 §6):
- **Browser offline** (the window's `offline` event): **neutral** at once (s2, hairline, a muted wifi-off glyph): « Hors connexion · données de 21:14 ».
- **Kelvin's stream lost:** (unreachable at load, when nothing ever arrived: neutral at once) silent for 60 s (the sidebar footer's ring turns dashed), then **neutral** « Reconnexion à Kelvin… · données de 21:14 », then **bad** after 3 min « Kelvin ne répond pas depuis 3 min · données de 21:14 » with a « Réessayer » `.btn-sm` (a reload). The layout ticks every 5 s while the stream is down.
- **Cozytouch unreachable:** bad (14 % over s1) « Cozytouch injoignable — données de 21:14 ». **Password changed:** bad, with an underlined 44 px « Se reconnecter » link.
13 px with its glyph, 28 px side padding on desktop to align with the page. While reconnecting after a failure, command controls and the house actions are inert (`aria-disabled`, focus kept); a loaded house that is only refreshing its stream keeps them usable (`house.online`).

### Toasts
Stacked bottom-centre: s2, hairline (red-tinted for errors), 10 px, 13 px, a close icon button (36 px, 44 px hit). They rise 12 px into place (220 ms), fade out (150 ms) and the rest reflow (200 ms). Errors stay 10 s, information 6 s, and the timer pauses while the toast is hovered or holds focus. Errors sit in an always-present assertive region, information in a polite one.

### Dialog
« Tout éteindre » asks first: s1, hairline, 10 px, 20 px padding, at most 340 px; an h2 (16/600) « Tout éteindre ? », a 13 px muted line « Les radiateurs passent à l’arrêt. Vous pourrez les remettre en programme depuis Maison. », then « Annuler » (focused) and the danger button. It fades and settles from 8 px below (200 ms, `@starting-style`) and leaves faster (150 ms); the scrim is bg at 72 %, so the light theme is not a black veil.

### Skeleton
Every route shows the shape of what is coming before data, never a word like « Chargement… » and never a value that is not yet known (« 0 pièce », « Pièce introuvable », « Aucun forçage »). A skeleton is s1 (`.skeleton`), or s2 inside a panel (`.skeleton.inset`), at the final height of what it stands for; a compositor-only shimmer (a translated gradient, 1.4 s) runs seven times and stops; reduced motion shows a static block. Where content arrives in parts, it is rendered together (Énergie's report with its Linky line; Maison's « En ce moment », alerts and section cards, once the house and the alerts are known: an alert's height depends on how its text wraps, so on the font, and no estimate holds on every platform), so nothing already on screen moves. A section card's summary arrives inside the card's fixed height (a skeleton line until then). Before the app itself loads, `app.html` paints a static shell (ground, wordmark, three blocks) as a fixed overlay the layout removes; if the app has not started after 8 s, the shell says « Kelvin n’est pas joignable. Vérifiez la connexion à la maison (Wi-Fi ou VPN). » with « Réessayer », in the page's language (the words mirror the dictionaries; `app-shell.test.ts`). Pièces: card skeletons, a sub-line bar, the inspector's shape. Pièces et appareils: block skeletons until both the setup and the home's server (`/auth/me`, which decides the setup actions) are known, then everything at once; if either fails, an error line with « Réessayer » replaces them. Programme: room picker, the temperatures and plan lines, seven day rows and, on desktop, the editor column. Maison: « En ce moment » (96 px) and six cards at 132 px (64 px rows in the list form), replaced together. Énergie: the navigator row and four panels; a Courbe of another day, a block at the chart's height.

### Focus and announcements
- The focus ring is a 2 px ink outline at 2 px offset on every control; a chip whose native box is hidden shows it via `:has(:focus-visible)`.
- Focus is never dropped to `<body>`: any button that can become inert while it may hold focus (paused commands, a running command, bounds, busy forms) uses `aria-disabled` with a guarded handler instead of `disabled`, desktop room cards keep focus across navigation (`data-sveltekit-keepfocus`, one shared PiecesView for "/" and "/rooms/[id]"), and after any other navigation the new page's h1 takes focus. A skip link « Aller au contenu » comes first.
- Phones keep focused elements clear of the tab bar with `scroll-padding-bottom`.
- One app-level pair of live regions (`$lib/stores/announcer.svelte.ts`) carries announcements: command progress for commands sent from this browser (« … — envoi… », « … — confirmé », the failure assertively) and committed stepper values. Regions inserted with their text are not relied on.

### Sidebar / TabBar
- **Sidebar (desktop):** the wordmark (the strip in miniature, 20 × 12, the PWA icon's heat-ramp sparkline and ink now-marker, then « Kelvin » 700), four links (icon + label, 44 px, 8 px radius, muted 500, ink on a faint s1 wash on hover); the current page is s1 with ink text and a hairline edge (a transparent edge at rest, so nothing shifts). House actions pinned at the bottom, then a hairline and the **status footer**: the Cozytouch SourceLine (« ○ Cozytouch · il y a 1 min », its Fiche: state, last reading, last error, provenance). **Alert dot:** a 6 px dot right of « Maison » (absolutely placed: the link never changes width), bad only when an alert the user must fix is active (an offline radiator stays muted, `navAlerts`), muted otherwise; the count lives in the link's name only (« Maison, 2 alertes »).
- **TabBar (phone):** four equal items, 20 px icon over an 11 px label, faint 500; current is ink 600 with a 2 × 20 px ink bar at the top. Maison carries the same 6 px alert dot at the icon's top-right (ringed in the ground) and the same name. Same four destinations: Pièces, Programme, Énergie, Maison. Opaque under `prefers-reduced-transparency`.
- **Programme send bar:** while there are unsent edits (or a send is on its way) a bar holds « 3 jours modifiés » (or « Envoi en cours… », 14 px 600) over a dotted « Aussi pour… » (« Aussi pour : Chambre 1 » once chosen; it opens the room choice sheet), then Annuler and Envoyer (`.btn-sm`), and a « Voir les modifications » disclosure listing each changed day before/after: s2, hairline, 10 px, 8 × 14 px padding. On a phone it is sticky 64 px above the bottom (clear of the tab bar); on desktop it sits under the day editor. It rises in over 220 ms. The conflict notice and the per-room send status sit just above it. An offline room's Envoyer is `aria-disabled` with its reason. Day and room choices are 36 px chips with a 44 px hit area (8 px, hairline, 13 px 600 muted; checked: s2, muted edge, ink, an ink box).

### Motion
One curve and a few durations, as tokens in `app.css` and as `T`/`easeOut` in `$lib/motion.ts`: `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)` for arrivals, `--ease-in` for exits; `--t-press` 100 ms, `--t-state` 160 ms (colour and state), `--t-enter` 220 ms (things arriving, expanding, page entry), `--t-exit` 150 ms, `--t-morph` 250 ms (the dashed → solid signature, the authored moment), `--t-data` 360 ms (bars and meters).
- **Pages:** View Transitions with named, still chrome (sidebar, tab bar, banner, toasts, progress bar): the page fades out in 150 ms and settles in from 6 px over 220 ms; on the phone the tapped card's figure travels into the room page (`temp-<id>`). A 2 px ink progress bar appears only when a route takes over 150 ms.
- **Feedback:** button press, card hover/press, segment and toggle state, the room status sentence cross-fade (160 ms); PendingTag cross-fade and check draw; the Stepper, ModeSwitch, Toggle, card setpoint and strip morph.
- **Continuity:** every Disclosure (Programme « Comment modifier ? », Qualité, « Détails »: grid row 220 ms) and « Voir les modifications » (slide 220 ms), the Fiche card (fade 160 ms) and Menu popover (fade 160 ms), the copy sheet (popover fade 160 ms, phone sheet rise 220 ms), the copied days' bars pulsing once (opacity 1 → .55 → 1 over `--t-data`, none under reduced motion), banner row, dialog and toasts enter/leave, Énergie keeps the old period dimmed while loading; the Énergie inspector card fades in over `dur(T.state)` (160 ms) and the phone sheet slides open over `dur(T.enter)` (220 ms), `|global` because each is mounted inside its host's own `{#if}` (a Svelte 5 local transition does not play there); the scrubber, crosshair, readout and selection outline never animate.
- **Data:** Énergie bars grow from the baseline, meters ease to their fill (`scaleX`, compositor-only), a changed live temperature dips and returns. Strips on the room list have no entrance.
- **Reduced motion** (`prefers-reduced-motion: reduce`): nothing travels, scales, rotates or loops. Svelte transitions take their duration from `dur()`, which returns 0; CSS rules per component remove translation and dash travel; view transitions are skipped. Meaning is kept as opacity: the confirmation becomes a 150 ms fade-in of the solid mark, bars fade in, skeletons are static blocks, the spinner a static dashed ring. There is no global duration clamp (it made loops flicker and erased the morph).

### Raster provenance
`web/static/icon.svg` is hand-authored: a graphite tile with a heat-ramp sparkline and an ink now-marker (the strip in miniature). `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (56 px safe padding) and `apple-touch-icon.png` (180 px) are rendered from it on a bg ground by `web/scripts/icons.mjs` (`npm run icons`). Edit the SVG, then re-render; never edit the PNGs.

### Copy (French and English)
French is the default; English is en-GB and follows `docs/glossary.md`. Every string lives in
`web/src/lib/i18n/{fr,en}.ts`; numbers, dates and units go through `$lib/format`, which follows
the active language. This file quotes the French copy; the English is the same key in `en.ts`.

| | French | English |
|---|---|---|
| Units | no-break space before every unit and `%`: « 20,5 °C », « 2 400 kWh », « 42 % », « 16,20 € » | no-break space before °C, kWh, Wh, W, kVA; none before `%`: “20.5 °C”, “2,400 kWh”, “42%” |
| Money | « 16,20 € », « 0,2068 €/kWh » | “€16.20”, “€0.2068/kWh”, “−€0.1000/kWh” |
| Decimals | comma; inputs accept a comma or a point | point; inputs accept a comma or a point |
| Dates and times | « 13 octobre 2026 », « mar. 13 oct., 18:05 », 24 h | “13 October 2026”, “Tue 13 Oct, 18:05”, 24 h |
| Relative time | « à l’instant », « il y a 5 min » | “just now”, “5 min ago” |
| Punctuation | no-break space before `: ; ? !`, « » with no-break spaces | “ ”, no space before `: ; ? !` |
| Tone | « vous » and imperatives (« Collez le jeton ») | plain imperatives (“Paste your token”), contractions in sentences, sentence case, “Sign in” |
| Tariff terms | « Option tarifaire », « Applicable à partir du », « Heures creuses différentes selon la saison », « Jours Tempo », « Signaux du réseau électrique » | “Tariff option”, “Valid from”, “Off-peak hours differ by season”, “Tempo days”, “Power grid signals” (the full list: `docs/glossary.md`) |
| Both | the true minus `−`, « — » for a missing value, typographic `’`, Paris time | |

Plan 8 adds the pairs Infos / Details, Joignable / Reachable, Hors ligne / Offline (a radiator; « Injoignable » stays for Cozytouch itself), Dernier signal / Last signal, Intensité / Brightness, Appareils connectés / Signed-in devices, Déconnecter / Sign out, Alertes / Alerts, Masquer / Dismiss, Programme modifié ailleurs / Schedule changed elsewhere, Recharger / Reload, Remplacer quand même / Replace anyway (also in `docs/glossary.md`). An alert's text is composed in the web from its kind and params (`alert-text`), never by the backend.

Comparison bases are named in both (« sur 12 jours comparables » / “over 12 comparable days”). English never says “HC” or
“HP”: “Off-peak”, “Peak”. A label that would not fit in English is fixed in the layout, never by
shortening the French; the layout guards (no sideways scroll from 320 px) run in both languages.
The language is chosen per device: in Maison › Réglages › Langue or on Login, a stored choice
wins, else the browser's languages; `<html lang>` follows it from the first paint, and a switch
never reloads. URL paths are English in both languages (`/rooms`, `/schedule`, `/energy`,
`/home`). The PWA manifest is static and stays French.

## Do's and Don'ts

### Do:
- **Do** write temperatures in ink; keep `heatColor()` for the strip's temperature line, warm for heating and cool for away.
- **Do** colour Énergie data through `SERIES`: HC `--hc` (hatched), HP `--hp`, an unsplit home series-1, radiators series-3, and keep each meaning on the same colour everywhere; draw keys with `Swatch`.
- **Do** paint controls at `--ctl-h` (36 px) with a 44 px hit area (`.hit`, or the `.btn` `::before`), size short values with the `--w-*` widths, and keep ≥ 8 px between neighbouring controls.
- **Do** put a visually hidden data table behind every chart, with « — » for missing cells.
- **Do** put units in field captions and table headers, not repeated in every cell.
- **Do** say what a comparison compares with and over how many days (« sur 12 jours comparables »).
- **Do** format every Énergie figure through the precision functions in `$lib/format.ts`, and build every inspector, readout, hidden table and announcement from `$lib/inspector.ts`, so a value reads the same everywhere.
- **Do** make shown parts add up to their shown total (`matchParts`), and give every « — » its reason.
- **Do** show every sent command as dashed until the radiator reports the matching value, then morph solid in 250 ms; show a failure plainly with "Réessayer".
- **Do** keep every interactive hit area at least 44 px (tab-bar items 56 px; the paint may be 36 px) and keep text and heat colours at WCAG AA (4.5:1) on bg and s1 in both themes, and component boundaries (fields, the selected segment, programme blocks) at 3:1; extend `tokens.test.ts` for any new token.
- **Do** put every exact figure behind a `Fig` with its Fiche and a Provenance block from `$lib/provenance.ts`; put L2 content in a `Disclosure`; say freshness with `Freshness` + `SourceLine`, never in ad-hoc words.
- **Do** use `.btn-*` for every button, `.skeleton` for every loading state, `dur()` for every Svelte transition and the shared Settle/PendingEdge for every pending mark.
- **Do** keep the light block and the `prefers-color-scheme: light` block in `app.css` identical.
- **Do** focus with a 2 px ink outline, 2 px offset.
- **Do** format numbers, dates and units through `$lib/format` in the active language, and take every word from the dictionaries (`m.*`), following "Copy (French and English)"; never hard-code copy in a component, and never read a message at module scope.
- **Do** separate with hairlines and tone, and nest without re-boxing.
- **Do** make a view-only choice a Segmented (arrows select) and a device command a ModeSwitch-style manual-activation group (arrows move, Enter/Space sends).

### Don't:
- **Don't** use blue or orange for anything that is not heat: no blue "on" state, no orange chart series, no blue links.
- **Don't** add shadows or radii above 10 px to containers.
- **Don't** set text below 11 px, or use JetBrains Mono for single figures or prose.
- **Don't** show a command as done because the API said so; only device state confirms.
- **Don't** fake confirmation on a timer: a pending mark that is not matched by the reported value disappears without the solid morph.
- **Don't** edit the PNG icons by hand or add raster art without a recorded source.
- **Don't** draw a missing value as zero: no zero-height bar, no « 0 kWh » for a day without data. Trim leading history, mark interior gaps with a faint baseline tick, and write « — ».
- **Don't** colour Linky progress states (first sync, quota, throttled) or a sign-in-again request as errors.
- **Don't** give rooms their own colours on Énergie; a room's share bar is the radiator series.
- **Don't** show « Chargement… », a zero or « introuvable » before the data is known; show its skeleton.
- **Don't** disable a focused button (focus falls to `<body>`); use `aria-disabled`.
