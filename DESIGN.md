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
    rounded: "{rounded.base}"
    height: "44px"
  segmented:
    backgroundColor: "{colors.in}"
    textColor: "{colors.mu}"
    rounded: "{rounded.base}"
    padding: "2px"
  segmented-on:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    rounded: "{rounded.inner}"
    padding: "0 14px"
    height: "44px"
  mode-switch:
    backgroundColor: "{colors.in}"
    textColor: "{colors.mu}"
    rounded: "{rounded.base}"
    padding: "2px"
  mode-switch-on:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    rounded: "{rounded.inner}"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.tx}"
    textColor: "{colors.bg}"
    rounded: "{rounded.base}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.s2}"
    textColor: "{colors.tx}"
    rounded: "{rounded.base}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    textColor: "{colors.tx}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
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
    height: "44px"
  select:
    backgroundColor: "{colors.in}"
    textColor: "{colors.tx}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "44px"
  field-label:
    textColor: "{colors.mu}"
    typography: "{typography.label}"
  button-icon:
    textColor: "{colors.mu}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "44px"
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

Kelvin is Précision: a crisp, dark-first heating console in the family of Linear, Vercel and Raycast. Every room is a single line of truth: its name, a large tabular temperature coloured by the heat ramp, its mode and setpoint, and a 24 h thermal strip of what actually happened against what was planned. Nothing is decorative; the only colour that carries emotion is heat, and it only ever means heat.

Density is compact and calm. Graphite grounds step up in three quiet tones, 1 px hairlines separate everything, and the corner radius never exceeds 10 px. Depth comes from tone and hairlines, not shadows. The light theme is the same roles re-tuned for daylight; dark is the default world.

The system is honest about delay. A command to a radiator takes seconds, so every control that sends one shows the requested value as a dashed "pending" mark, and that dash draws itself solid only when the radiator reports the matching value. That dashed-to-solid move is the signature interaction and appears identically on the strip, the stepper, the mode switch and the toggle.

**Key Characteristics:**
- Dark graphite grounds (bg → s1 → s2), 1 px hairlines, radius ≤ 10 px, no shadows.
- One heat ramp (cool → neutral → warm, 15 → 20 → 25 °C) and nothing else in those hues.
- Onest for UI, tabular figures for every number, JetBrains Mono only for dense numeric columns.
- The thermal strip repeats on room cards, the inspector and Programme.
- Every chart has a visually hidden data table behind it; a missing value is « — », never a zero.
- Pending is dashed, confirmed is solid; a failure stays plain and says so.
- 44 px touch targets everywhere, WCAG AA in both themes, copy in French (default) and English, each with its own typography.

## Colors

A near-monochrome graphite world where the only saturated colours are the heat ramp, categorical chart series kept out of the heat hues, and the two state colours.

### Primary
- **Heat Ramp: Cool Blue / Neutral Grey / Warm Orange** (cool, neutral, warm; light: cool-light, neutral-light, warm-light): the three stops of the single temperature ramp in `web/src/lib/heat.ts`. Domain 15 °C → 20 °C → 25 °C; between stops the colour is a linear sRGB `color-mix` of the two neighbouring stops; outside the domain it clamps; an unknown reading falls back to faint (fa). Used for the room temperature figure, the thermal strip's temperature line (a vertical gradient through the three stops), and, at low opacity, for heat-related fills: programme comfort bands on the strip (warm at 16 % with a 40 % top edge), comfort blocks in the programme editor (warm at 75 % over the well, 3:1), the boost override badge (warm at 18 %) and the away override badge (cool at 18 %). Every stop passes AA (4.5:1) on both bg and s1 in both themes, enforced by `tokens.test.ts`.

### Secondary
- **Chart Series: Violet, Teal, Ochre, Rose** (series-1 … series-4; light variants): categorical colours for Énergie, assigned by meaning in `SERIES` (`web/src/lib/energy.ts`) and drawn only through it. Violet is off-peak (heures creuses), and also the single whole-home series when no tariff splits the day; teal is peak (heures pleines); ochre is the radiators (the overlay mark on the house chart, the Courbe's step line, Température et chauffe's bars, the radiator-only chart without Linky, the heating-share meter and the per-room share bars). Rose is held in reserve. They are deliberately free of blue and orange so a chart can never be misread as temperature.

### Tertiary
- **State Green** (ok): confirmation only: the "Confirmé" pending tag and a saved form (« Tarif enregistré. »).
- **State Red** (bad): failures and warnings: the failed-command tag, error text, the open-window chip, the disconnection banner (bad at 14 % over s1), the error toast's border (bad at 60 % over line), and the Énergie Linky callout when the token is refused or sync fails. Progress states are never red.

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
**The Heat Means Heat Rule.** Blue, grey-neutral and orange in the cool/neutral/warm hues come only from the heat ramp, and the heat ramp only ever encodes temperature or heating (a reading, a comfort band, a boost or away override). An "on" switch is ink, not blue; a chart series is violet, never orange. If a new element is coloured by a heat token, it must be answering "how warm".

**The One Ramp Rule.** Every heat colour is computed by `heatColor()` from the three theme tokens. Never hard-code a heat hex, never add a second scale, and never interpolate in another space; the ramp then follows the active theme for free.

**The Series Rule.** Categorical data uses series-1 … series-4, each with one fixed meaning: HC is series-1 (violet), HP is series-2 (teal), radiators are series-3 (ochre); an unsplit whole-home series takes series-1. A meaning keeps its colour on every chart, legend and meter (the curve's HC/HP halves match the monthly bars). Radiators are drawn as a line mark, never a stacked part, so a reader can see they are a share of the house rather than added to it. A fifth series may be added only if it stays out of the blue and orange hues and passes AA in both themes.

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
- **Section label** (600, 12 px, uppercase, 0.06em, muted): the heading of an inspector, Énergie or Maison panel (Commande, Historique, Chauffage, Projection, Tarif, Linky) and the Heures creuses fieldset legend. It is the section's only heading, never a kicker above another heading. Énergie's period label is the exception that proves it: « Octobre 2026 » in the navigator is a 15 px 600 sentence-case heading, and it also names the hero below it.
- **Micro** (11 px, tabular): strip and chart axis ticks, tab-bar labels. This is the floor.
- **Mono** (400, 13 px, tabular): the radiator counter columns (Compteurs des radiateurs), the price-history columns (Tarif), the version string in Réglages, and, at 12 px, the figures of Énergie's Par pièce et par radiateur table.

### Named Rules
**The Tabular Rule.** Every number that can change (temperatures, setpoints, times, kWh, percentages) is set with tabular figures (`.num`, or `font-variant-numeric: tabular-nums`) so live updates never shift the layout.

**The Mono-for-Columns Rule.** JetBrains Mono is for dense right-aligned numeric columns: the radiator counter columns on Énergie and its per-room table, and the price-history columns on Maison (in both the table and its phone list). The one other use is the version string (« Kelvin 0.1.0 »). Hero figures, projections, shares and every other single figure stay in Onest with tabular figures.

**The 11 px Floor.** No text is smaller than 11 px, and 11 px is reserved for axis ticks and tab-bar labels.

## Layout

One breakpoint: **1024 px** (`DESKTOP_QUERY` in `media.svelte.ts`, mirrored in CSS).

- **Phone (< 1024 px):** a single column with 16 px page padding and 88 px plus the safe-area inset at the bottom, clearing a fixed bottom tab bar (56 px items). Room cards stack with a 10 px gap; tapping a card expands it in place to the mode switch, a stepper and "Détails". Toasts sit 76 px above the bottom, at most 420 px wide (92 vw).
- **Desktop (≥ 1024 px):** a 232 px sticky sidebar (nav, then Tout éteindre / Absence… pinned to the bottom) and a main column with 24 px × 28 px padding, capped at 1280 px. Pièces becomes two columns: the room list (whatever is left) and a sticky **inspector column** (`clamp(320px, 38 %, 440px)`, 24 px from the top, scrolling internally within the viewport with contained overscroll), so nothing scrolls sideways from 1024 px up. Toasts sit 24 px from the bottom.
- **Énergie grid:** the panels answer to the grid's own width (a container query), not the viewport, because the sidebar takes 232 px of a 1024 px screen. One column below 720 px of grid; from 720 px the hero, Consommation, Courbe, Température et chauffe, Par pièce et par radiateur, Qualité, Compteurs and Exporter span the row while Comparaisons | Projection share one; in Jour and Semaine Puissance and Heures creuses / pleines pair and Chauffage takes the row, and from 960 px the three sit abreast; in Mois and Année (no Puissance) Heures creuses / pleines | Chauffage share a row. Max 1180 px.
- **No sideways scroll** at any width from 320 to 1440 px on any route (`e2e/layout.spec.ts`). Below 1024 px `scroll-padding-bottom` keeps focused fields and anchors clear of the tab bar (and of the Programme send bar when it shows); a visible banner adds `scroll-padding-top`.

- **Below 600 px (fold):** tables give way rather than scroll the page. The radiator counter table keeps only the radiator (with its room folded beneath in 12 px muted) and the lifetime total; the Tarif price history becomes a hairline-separated list of two-column label/value rows; Par pièce et par radiateur is a list below 640 px of panel width (a table above); the Énergie hero's date range takes its own line; the Réglages list's label column shrinks to its content (and below 360 px the label sits above its value).
- **Login:** outside the app shell (no sidebar, no tab bar): one column, at most 360 px wide, centred in the viewport on bg, 14 px between items.

**Spacing rhythm:** small even steps (2, 4, 6, 8, 10, 12, 14, 16, 18, 24, 28 px). Inside cards: 12 × 14 px padding, 8 px gap. Between inspector sections: 18 px, each section opening with a hairline and 14 px of space. Énergie panels: 14 px padding, 14 px apart (a grid gap), max 1180 px; Maison panels the same at 720 px. Form grids: 12 px gaps, fields auto-fit at 170 px (Tarif) or 200 px (Linky).

**The One Line Rule.** A room is readable from one row: name and temperature on the first line, chips and setpoint on the second, the strip beneath. Detail lives one tap away (expanded card on phone, inspector on desktop), never on the list.

## Elevation & Depth

Flat. There are no box-shadows. Depth is tonal: bg → s1 (cards, panels) → s2 (selected, hover, toasts), with the well (in) recessed beneath controls, and every edge drawn by a 1 px hairline. The only translucency is the phone tab bar (bg at 92 % with a 12 px backdrop blur) so content scrolls visibly beneath it.

**The Hairline Rule.** Separate with a 1 px line (line), not a box or a shadow. Panels nested in a panel (radiators in the inspector) are separated by a top hairline, never boxed again.

## Shapes

Compact, gently rounded, never pill-shaped for containers. The base radius is 10 px (cards, panels, stepper, both segmented controls, primary/secondary buttons, toasts, the Login reauth note); segments inside a 10 px well use 7 px so the inset reads concentric, and this pair is shared exactly by Segmented and ModeSwitch. Smaller controls use 8 px (sidebar items, ghost and icon buttons, every form input and select), chips and editor inputs 6 px, programme blocks 4 px, legend swatches and the heating-share meter 3 px, energy bars and the thin per-room share bar 2 px, curve bars 1 px. Full rounding only on the toggle track (11 px), its knob and dots.

Icons are a small hand-drawn set (`Icon.svelte`): 24-unit stroke paths at 1.75 px, round caps and joins, `currentColor`, 18 px by default (12–20 px in context).

**The Ten Pixel Ceiling.** No radius exceeds 10 px except the toggle's pill geometry.

## Components

### Thermal Strip (signature)
The room's day on one line: an SVG sparkline of the measured temperature (2 px, round caps, stroked with the heat-ramp gradient so its colour at any height is the heat at that temperature) drawn only up to now, over the planned setpoint (1 px muted step line). In programme mode the comfort periods appear as warm bands at 10 %. A 1 px ink **now-marker** (70 %) crosses the full height. The y-domain always includes 15–23 °C plus every known value, padded by 0.5 °C. A visually hidden sentence (range, latest reading, plan, pending request) describes it for screen readers. Default height 36 px on room cards; 120 px in the inspector history; 48 px with axis in the Programme preview.
- **Axis** (`axis`, on expanded cards and day views): 00 · 06 · 12 · 18 · 24 in micro faint, with the current Paris time at the now-marker in ink 600. A fixed tick within 9 % of the marker is dropped so labels never collide.
- **Pending path:** a requested manual target draws a dashed ink line (1.25 px, 4/3 dash) from now to the end of the day; a pending comfort setpoint redraws the rest of today's programme dashed, clipped to after now, with eco shifted by the same amount.
- **Confirmation:** when the pending value disappears and the radiator now reports exactly that value, the path is held 250 ms and its dash closes to solid. If the reported value differs, it simply disappears. The same rule (`$lib/settle.svelte.ts`) drives every control below.
- Reused on room cards, the inspector and Programme (previewing a draft programme). Énergie's Température et chauffe draws a room's day with the same heat-ramp line and muted setpoint, at its own scale.

### Stepper
A 44 px × value × 44 px well (in, field-line edge, 10 px) with − and + icon buttons and a 16 px tabular value. Press-and-hold repeats after 400 ms every 120 ms; changes commit after a 600 ms debounce. An underline under the value is the pending signal (PendingEdge): hairline at rest, muted 4/3 dashes while pending, morphing solid in 250 ms on matching confirmation; an unconfirmed optimistic value is released after 10 s. At min/max a button is `aria-disabled` (faint, inert) rather than `disabled`, so keyboard focus stays on it; hover and press fill s2. The value is not a live region: each committed value is announced once (« Confort : 20,5 °C »).

### ModeSwitch
A three-way radiogroup (Arrêt / Manuel / Programme, "Prog." when compact) in a well with 2 px padding and gap. Segments are 44 px tall, 13 px 600 muted (ink on hover); the current segment is s2 with ink text and a muted edge (3:1 against the well). That edge is the signature mark (PendingEdge, an SVG rect): dashed while the mode is requested, closing solid when the radiator reports it. While pending the group is `aria-busy` and the segment is named « Manuel (en attente) ». Keyboard is **manual activation**, because a mode is a device command: roving tabindex (the current mode is the tab stop), arrows only move focus (wrapping), and Enter/Space sends. Choosing the current mode again sends nothing. Transitions 160 ms ease.

### Segmented
The view-only sibling of ModeSwitch for choices that change what is shown, never a device: Énergie's Jour / Semaine / Mois / Année, the inspector's 24 h / 7 j / 30 j, Réglages' Système / Sombre / Clair and Langue (« Français » / “English”, each option named in its own language with its `lang`, never translated). An option may carry `lang` and an `ariaLabel` (its accessible name when the visible label is short, as on Login). Same well (in, hairline, 10 px, 2 px padding and gap) and the same 7 px segments, but inline-width with 14 px side padding; 44 px, 13 px 600 muted (ink on hover), the checked segment s2 with ink and a muted border (3:1 against the well). It also picks the room on Programme, scrolling inside itself when the rooms are wider than the page. A WAI-ARIA radiogroup with roving tabindex, and **automatic activation**: arrows (and Home/End) move focus and select at once. No pending state; nothing waits on a device.

**The Command Keyboard Rule.** If a choice sends a command to a radiator, arrows move focus and only Enter/Space sends (ModeSwitch). If it only changes the view, arrows select (Segmented). Both look the same; the keyboard tells them apart.

### Toggle
A full-width 44 px row: label left, 38 × 22 px track right. Off: faint track. On: ink track, knob slides 16 px (160 ms, no slide under reduced motion). Pending: a 1 px dashed muted outline 2 px around the track (PendingEdge, rx 12.5, `aria-busy`); when the radiator reports the requested state the dashes close solid and the outline fades. Never blue.

### PendingTag
Inline 12 px status after a command: "Envoi…" (muted, with an 8 px dashed spinning dot), "Confirmé" (ok, its check drawing itself in 250 ms), or the error in bad with a ghost "Réessayer" and a 44 px dismiss button. States cross-fade in one cell (160 ms in, 150–200 ms out). The tag is visual: screen readers hear the progress from the app announcer (below).

### RoomCard
s1 card, hairline, 10 px, 12 × 14 px padding. Head grid: name (15/600, wraps anywhere) and heat-coloured reading on top; chips (mode, heating level, "Fenêtre ouverte" in bad, override badge) and the 13 px setpoint ("→ 19,0 °C", or "Arrêté") below. A pending comfort setpoint is underlined with the shared mark and closes solid on confirmation. Then the strip, then a 13 px footer with the next programme change and the PendingTag. Phone: the head is a button (`aria-expanded`, `aria-controls`) with a 14 px chevron that turns; expanded, a hairline, ModeSwitch, Stepper and "Détails ›" slide open (220 ms). Desktop: the head is a link to the room with `aria-current="page"` when it is the room in the inspector (border muted), and keeps focus across the navigation. Hover firms the edge, press deepens the tone. A live reading that changes dips to 45 % and returns (400 ms). Loading: three 132 px skeletons.

### RoomInspector
The desktop right column (s1 panel, 16 px padding) and the phone room page: title (h2 at 20 px in the column; on the phone room page an h1 at 22 px, since it is the page title) and display reading (it arrives from the tapped card in a shared-element view transition), a status line, then hairline-opened sections with section labels: Commande (ModeSwitch, steppers for Confort and Abaissement éco), Forcer temporairement (stepper, duration select, primary "Forcer"), Historique (a Segmented 24 h / 7 j / 30 j over a strip), Radiateurs. Before the house is known it shows its skeleton (title bar and three section blocks), never « Pièce introuvable ».

### RadiatorPanel
One per radiator inside the inspector, separated by hairlines: name with a 44 px edit icon button and its reading, a muted/right-aligned definition list (13 px), toggles, and a ghost « Faire clignoter ».

### ProgramDay
A day row (hairline below): label, a 32 px well bar (field-line edge; 40 px below 600 px) with hour ticks, comfort blocks (warm at 75 % over the well, 4 px) that drag and resize by 10 px edge handles with a wider invisible grip, and a 2 px ink now-marker. Below, editable time slots (44 px inputs and buttons). Blocks are `aria-roledescription="plage"` with a hidden hint (arrows move by 15 min, Suppr removes). The page does not scroll under a finger while a block is dragged. Phone: every day keeps its bar but at most one day shows its slots (today first); the label is a 44 px disclosure button with the day's slots summarised and a chevron that opens or closes its day (closing leaves every day closed), and a tap on a closed day's bar opens it. While pending, blocks become dashed muted outlines and lock.

### EnergyBars
Stacked SVG bars, drawn at the measured width and a fixed 160 px height (so a phone keeps tall bars and true corners); bars grow from the baseline (360 ms, 12 ms stagger capped at 180 ms) on first draw and on each period change, one series colour per part (2 px corners), hairline grid at four ticks, micro faint axis labels thinned so each keeps 44 px. The radiators are an **overlay mark**: a 2.5 px round-capped line across the bar at its value, in series-3, over a 4 px s1 knockout so it reads on any bar; the y-scale includes it. Missing parts are never drawn as zero: an interior bucket with no data (data on both sides) gets a faint 2 px dashed (3/3) baseline tick; leading and trailing empties stay blank. With `details` the bars are inspectable: the whole plot is the hit area and the nearest bar wins; a mouse hover shows its ChartInspector, a click or tap pins it, a second tap unpins; while a bar is pinned, hovering another only gives it a muted outline and the card stays. A horizontal touch swipe of 48 px (at least twice its vertical travel) steps the period instead. Each bar has an invisible full-height button in a roving-tabindex group (« Barres du graphique : … ») whose name carries its values: `←`/`→`/`Home`/`End` move and pin, `Enter` drills down (a month opens Mois, a day its Courbe, another day of Jour its own Jour) or, with nothing to drill, pins the bar, and `Esc` clears; Esc inside the card closes it and puts focus back on its bar. The inspected bar takes a 1 px ink outline, never animated. No SVG `<title>`. Empty: « Pas encore de données. » The legend below uses 10 px swatches (3 px) for stacked series and a 14 × 2 px line for the radiator mark.

### CurveChart
One day of half-hours (46, 48 or 50) at the measured width and a fixed 140 px height, 1 px-rounded bars with 15 % inner padding, split HC (series-1, at the base) under HP (series-2) by their off-peak fraction, or the single home series without a tariff. The radiators are a 2 px series-3 step line over a 4 px s1 knockout, broken where a half-hour is unknown; the subscribed power (kVA × 1000 × 0.5 Wh) is a faint 1 px dashed line when it is within 2× the data, else a muted sentence states it. Axis 00 · 06 · 12 · 18 on the matching half-hours (so DST days stay true), then 24 at the right edge, micro faint. A 1 px ink crosshair marks the scrubbed half-hour (see Scrubber).
- **Readout:** a fixed row above the chart, so nothing covers the bars: « 18:30–19:00 » (the repeated autumn hour says « (heure d’été) » / « (heure d’hiver) »), then Puissance moyenne, Énergie, Tarif, Prix, Coût, Radiateurs, Reste, Température, as the day has them. Its fields are fixed for the day and read « — » with their reason where a half-hour lacks a value. It **never reflows**: every text a field takes over the day (idle included) is stacked in one grid cell and only the current one is visible, so the browser sizes each field to its widest and tallest text in the real font, at any zoom, and scrubbing moves nothing.
- Empty: « Pas de courbe pour ce jour. »

### Chart data tables
Every chart is a `role="img"` SVG with an aria-label, followed by a table inside `<div class="visually-hidden">` with the same caption, one row per bucket or interval and one column per inspector or readout row (in the inspector's order), « est. » kept after an estimate and « — » (with its reason) in any missing cell. The wrapper matters: a table cannot be narrower or shorter than its rows, so a table that is itself visually hidden widened the page at 320 px and left an empty tail under Énergie.

### ChartInspector
The exact values behind a mark. `$lib/inspector.ts` builds the rows, and the card, the sheet, the hidden table and the announcement all read the same rows, so they cannot disagree. Desktop: a 260 px **card**, s2 with a hairline and the 10 px radius, flat (no shadow), placed beside the bar and flipped to its left near the right edge (centred and clamped when neither side fits), never outside the chart; it takes the pointer only when pinned, so its action can be clicked. Phone: a **sheet** docked under its chart (the hero's at the hero's end), so nothing above it moves. A 13 px 600 title, then label / value rows (muted label left, tabular value right, « dont … » rows indented 10 px); a row is omitted when its source does not apply, but a value the reader expects (the radiators in a home that has them, a cost) reads « — » with its reason under it in 12 px muted. A 12 px muted « est. » follows an estimate, then the notes, and a footnote linking « est. » to Qualité des données; an optional `.btn-sm` action (« Voir la courbe du 13/10 »). Esc inside closes it and gives focus back to what opened it.
- **Motion:** the card fades in over `dur(T.state)` (160 ms) and the sheet slides open over `dur(T.enter)` (220 ms), both `|global` transitions: the host mounts the inspector inside its own `{#if}`, and a local transition would not play there. Under reduced motion `dur()` is 0: it appears and leaves at once.

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
- **Qualité des données:** a collapsed disclosure (`#quality`: an `h2` holding its toggle button, never a heading inside `<summary>`, whose button role hides it from heading navigation in some readers; the closed body is `hidden="until-found"`, so find-in-page reaches it and opens the panel) that every « est. » links to: a coverage strip per bucket of the selected period for Linky journalier · Courbe · Radiateurs (ink full, faint partial, dashed missing, blank when nothing was expected yet; in Jour the day's one cell, not the seven bars), then the history dates, the estimated days with their fallback share and method, the mean curve / daily gap and the retroactive prices, all over the selected period (`period.quality`).
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

### Linky status wording
One status, two places (the Énergie callout and the Linky panel on Maison). Progress is neutral and offers no link, because there is nothing to fix: never synced (« première synchronisation en attente »), quota (« historique en cours de récupération, la suite arrive demain ») and throttled (« Enedis limite les requêtes, nouvel essai à 14:30 ») read as plain or muted text. Only `auth` (« MyElectricalData refuse le jeton Linky. » with « Renouveler le jeton ») and `error` (with « Réglages ») use the bad colour and an alert role. Not connected at all is a neutral invitation with a « Réglages » link. In the panel the good state reads « Relié · données jusqu’au 13/10 · synchro il y a 5 min ».

### Form fields
A field is a label wrapping its control: a 12 px muted caption, 4 px, then a 44 px well (in, field-line edge, 8 px, 0 × 10 px padding) set in 15 px body with tabular figures, 16 px below 1024 px so iOS never zooms on focus (`--fs-field`). The base style is global in `app.css`; components add only layout. Selects share the input's exact geometry. Placeholders are muted (never the browser grey) and never carry the only instruction: a hint is a 12 px muted caption under the field, linked with `aria-describedby` (Linky: « Enregistré », then « Laissez vide pour garder le jeton. »). An invalid field is `aria-invalid`, edged in bad, linked to its error and focused. Units live in the caption, never in the field: « Abonnement (€/mois) », « Prix heures creuses (€/kWh) ». Decimal fields accept a comma or a point. Groups of fields auto-fit in a grid; a repeated group (Heures creuses slots) sits in a hairline-topped fieldset whose legend is a section label, with ghost « Retirer » / « Ajouter une plage » buttons. Errors follow in 13 px bad (alert), success in 13 px ok (status), then one primary button, left-aligned.

### Price history (Tarif)
A 13 px table under the form: « Depuis » (long date), then « Abonnement (€/mois) », « HC (€/kWh) », « HP (€/kWh) », the units in the headers so the mono cells are bare figures (« 15,00 », « 0,2068 »). Headers muted 500, hairline rows, cells never wrap, the wrapper scrolls inside the panel rather than the page. Below 600 px it is replaced by a list, one hairline-separated entry per price with the same labels on the left and mono values on the right.

### Login
Outside the shell, one centred 360 px column: the « Kelvin » brand (700), « Connexion » as a headline, a 13 px muted lead « Utilisez le compte Cozytouch de la maison. », two labelled 44 px fields (Email, Mot de passe), the error line when there is one, then a full-width ink primary « Se connecter » (« Connexion… » while busy). With the simulator a 12 px muted line gives the demo account. After a password change the screen adds a neutral note (s1, hairline, 10 px, 13 px, role status) « Reconnectez-vous avec le compte Cozytouch. »: being asked to sign in again is not an error. At the bottom of the column, centred, a compact « FR | EN » Segmented (each option with its `lang`, named « Français » / “English” by `ariaLabel`, the group named by the current language's « Langue » / “Language”) switches the language before signing in, without a reload; the choice is remembered on the device. In English the screen reads “Sign in”, “Use the home’s Cozytouch account.”, “Email”, “Password”.

### Buttons
One system in `app.css`: `.btn` plus a variant; components never restyle a button.
- **`.btn` (secondary):** s2 fill, ink text, 600, 44 px, 10 px, hairline. `.btn-sm` is 13 px with 12 px sides (house actions, inline actions).
- **`.btn-primary`:** ink fill and edge, bg text. One per section at most.
- **`.btn-ghost`:** transparent, ink 13 px 500, hairline, 8 px.
- **`.btn-icon`:** 44 px square, muted, no edge, 8 px.
- **`.btn-danger`:** bad at 25 % over s2 (the « Tout éteindre » confirmation).
- **States:** hover (pointer devices only) firms the edge to faint, lifts ghost and icon to ink on s2, and lightens primary to 88 % ink; press scales to 0.98 (100 ms, not under reduced motion); every change eases over 160 ms. Disabled keeps its fill and turns its text faint (a disabled primary becomes s2 with faint text), never a translucent slab. A button that must keep focus while inert (stepper bounds, curve day at an end, login while busy) uses `aria-disabled` with the same look.

### Banner
A full-width status strip atop the main column when Kelvin reconnects (immediately when the browser goes offline), Cozytouch is unreachable, or the Cozytouch password changed: bad at 14 % over s1, hairline below, 13 px with an alert icon and the data age, 28 px side padding on desktop to align with the page; a rejected password adds an underlined 44 px « Se reconnecter » link at the end. Sticky at the top, it opens and closes by its grid row (0fr → 1fr, 220 ms) instead of jumping. The live region is always mounted. While reconnecting after a failure (the state this banner names), command controls and the house actions are inert (`aria-disabled`, focus kept); a loaded house that is only refreshing its stream (a phone back from the background) keeps them usable, since the new snapshot answers anything sent meanwhile (`house.online`).

### Toasts
Stacked bottom-centre: s2, hairline (red-tinted for errors), 10 px, 13 px, 44 px close button. They rise 12 px into place (220 ms), fade out (150 ms) and the rest reflow (200 ms). Errors stay 10 s, information 6 s, and the timer pauses while the toast is hovered or holds focus. Errors sit in an always-present assertive region, information in a polite one.

### Dialog
« Tout éteindre » asks first: s1, hairline, 10 px, 20 px padding, at most 340 px; an h2 (16/600) « Tout éteindre ? », a 13 px muted line « Les radiateurs passent à l’arrêt. Vous pourrez les remettre en programme depuis Maison. », then « Annuler » (focused) and the danger button. It fades and settles from 8 px below (200 ms, `@starting-style`) and leaves faster (150 ms); the scrim is bg at 72 %, so the light theme is not a black veil.

### Skeleton
Every route shows the shape of what is coming before data, never a word like « Chargement… » and never a value that is not yet known (« 0 pièce », « Pièce introuvable », « Aucun forçage »). A skeleton is s1 (`.skeleton`), or s2 inside a panel (`.skeleton.inset`), at the final height of what it stands for; a compositor-only shimmer (a translated gradient, 1.4 s) runs seven times and stops; reduced motion shows a static block. Where content arrives in parts, it is rendered together (Énergie's report with its Linky line; Maison's Tarif, Linky and Réglages), so nothing already on screen moves; a skeleton section keeps its anchor id (`/home#tariff`, `#linky`), and the page lands on the anchor again once the real panel renders. Before the app itself loads, `app.html` paints a static shell (ground, wordmark, three blocks) as a fixed overlay the layout removes. Pièces: card skeletons, a sub-line bar, the inspector's shape. Programme: room picker, today's strip, seven day rows. Maison: the « En cours » line, Tarif and Linky blocks. Énergie: the navigator row and four panels; a Courbe of another day, a block at the chart's height.

### Focus and announcements
- The focus ring is a 2 px ink outline at 2 px offset on every control; a chip whose native box is hidden shows it via `:has(:focus-visible)`.
- Focus is never dropped to `<body>`: any button that can become inert while it may hold focus (paused commands, a running command, bounds, busy forms) uses `aria-disabled` with a guarded handler instead of `disabled`, desktop room cards keep focus across navigation (`data-sveltekit-keepfocus`, one shared PiecesView for "/" and "/rooms/[id]"), and after any other navigation the new page's h1 takes focus. A skip link « Aller au contenu » comes first.
- Phones keep focused elements clear of the tab bar with `scroll-padding-bottom`.
- One app-level pair of live regions (`$lib/stores/announcer.svelte.ts`) carries announcements: command progress for commands sent from this browser (« … — envoi… », « … — confirmé », the failure assertively) and committed stepper values. Regions inserted with their text are not relied on.

### Sidebar / TabBar
- **Sidebar (desktop):** "Kelvin" wordmark (700), four links (icon + label, 44 px, 8 px radius, muted 500, ink on a faint s1 wash on hover); the current page is s1 with ink text and a hairline edge (a transparent edge at rest, so nothing shifts). House actions pinned at the bottom.
- **TabBar (phone):** four equal items, 20 px icon over an 11 px label, faint 500; current is ink 600 with a 2 × 20 px ink bar at the top. Same four destinations: Pièces, Programme, Énergie, Maison. Opaque under `prefers-reduced-transparency`.
- **Programme send bar:** while there are unsent edits (or a send is on its way) a sticky bar holds « 3 jours modifiés » (or « Envoi en cours… »), Annuler and Envoyer: s2, hairline, 10 px, 8 × 12 px padding, 64 px above the bottom on a phone (clear of the tab bar), 16 px on desktop; it rises in over 220 ms. The copy and « Envoyer aussi à » choices are 44 px chips (8 px, hairline, 13 px 600 muted; checked: s2, muted edge, ink, an ink box).

### Motion
One curve and a few durations, as tokens in `app.css` and as `T`/`easeOut` in `$lib/motion.ts`: `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)` for arrivals, `--ease-in` for exits; `--t-press` 100 ms, `--t-state` 160 ms (colour and state), `--t-enter` 220 ms (things arriving, expanding, page entry), `--t-exit` 150 ms, `--t-morph` 250 ms (the dashed → solid signature, the authored moment), `--t-data` 360 ms (bars and meters).
- **Pages:** View Transitions with named, still chrome (sidebar, tab bar, banner, toasts, progress bar): the page fades out in 150 ms and settles in from 6 px over 220 ms; on the phone the tapped card's figure travels into the room page (`temp-<id>`). A 2 px ink progress bar appears only when a route takes over 150 ms.
- **Feedback:** button press, card hover/press, segment and toggle state (160 ms); PendingTag cross-fade and check draw; the Stepper, ModeSwitch, Toggle, card setpoint and strip morph.
- **Continuity:** card expand (slide 220 ms), Programme day open, banner row, dialog and toasts enter/leave, Énergie keeps the old period dimmed while loading; the Énergie inspector card fades in over `dur(T.state)` (160 ms) and the phone sheet slides open over `dur(T.enter)` (220 ms), `|global` because each is mounted inside its host's own `{#if}` (a Svelte 5 local transition does not play there); the scrubber, crosshair, readout and selection outline never animate.
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
| Both | the true minus `−`, « — » for a missing value, typographic `’`, Paris time | |

Comparison bases are named in both (« sur 12 jours comparables » / “over 12 comparable days”). English never says “HC” or
“HP”: “Off-peak”, “Peak”. A label that would not fit in English is fixed in the layout, never by
shortening the French; the layout guards (no sideways scroll from 320 px) run in both languages.
The language is chosen per device: in Maison › Réglages › Langue or on Login, a stored choice
wins, else the browser's languages; `<html lang>` follows it from the first paint, and a switch
never reloads. URL paths are English in both languages (`/rooms`, `/schedule`, `/energy`,
`/home`). The PWA manifest is static and stays French.

## Do's and Don'ts

### Do:
- **Do** colour temperatures, and only temperatures or heating, through `heatColor()`; unknown readings use faint.
- **Do** colour Énergie data through `SERIES`: HC series-1, HP series-2, radiators series-3, and keep each meaning on the same colour everywhere.
- **Do** put a visually hidden data table behind every chart, with « — » for missing cells.
- **Do** put units in field captions and table headers, not repeated in every cell.
- **Do** say what a comparison compares with and over how many days (« sur 12 jours comparables »).
- **Do** format every Énergie figure through the precision functions in `$lib/format.ts`, and build every inspector, readout, hidden table and announcement from `$lib/inspector.ts`, so a value reads the same everywhere.
- **Do** make shown parts add up to their shown total (`matchParts`), and give every « — » its reason.
- **Do** show every sent command as dashed until the radiator reports the matching value, then morph solid in 250 ms; show a failure plainly with "Réessayer".
- **Do** keep every interactive target at least 44 px (tab-bar items 56 px) and keep text and heat colours at WCAG AA (4.5:1) on bg and s1 in both themes, and component boundaries (fields, the selected segment, programme blocks) at 3:1; extend `tokens.test.ts` for any new token.
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
