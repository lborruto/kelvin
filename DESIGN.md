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
- The thermal strip repeats on room cards, the inspector, Programme and Énergie.
- Every chart has a visually hidden data table behind it; a missing value is « — », never a zero.
- Pending is dashed, confirmed is solid; a failure stays plain and says so.
- 44 px touch targets everywhere, WCAG AA in both themes, French copy with NBSP before units.

## Colors

A near-monochrome graphite world where the only saturated colours are the heat ramp, categorical chart series kept out of the heat hues, and the two state colours.

### Primary
- **Heat Ramp: Cool Blue / Neutral Grey / Warm Orange** (cool, neutral, warm; light: cool-light, neutral-light, warm-light): the three stops of the single temperature ramp in `web/src/lib/heat.ts`. Domain 15 °C → 20 °C → 25 °C; between stops the colour is a linear sRGB `color-mix` of the two neighbouring stops; outside the domain it clamps; an unknown reading falls back to faint (fa). Used for the room temperature figure, the thermal strip's temperature line (a vertical gradient through the three stops), and, at low opacity, for heat-related fills: programme comfort bands on the strip (warm at 16 % with a 40 % top edge), comfort blocks in the programme editor (warm at 75 % over the well, 3:1), the boost override badge (warm at 18 %) and the away override badge (cool at 18 %). Every stop passes AA (4.5:1) on both bg and s1 in both themes, enforced by `tokens.test.ts`.

### Secondary
- **Chart Series: Violet, Teal, Ochre, Rose** (series-1 … series-4; light variants): categorical colours for Énergie, assigned by meaning in `SERIES` (`web/src/lib/energy.ts`) and drawn only through it. Violet is off-peak (heures creuses), and also the single whole-home series when no tariff splits the day; teal is peak (heures pleines); ochre is the radiators (the overlay mark on the house chart, the radiator-only chart without Linky, the heating-share meter and the per-room share bars). Rose is held in reserve. They are deliberately free of blue and orange so a chart can never be misread as temperature.

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
- **Section label** (600, 12 px, uppercase, 0.06em, muted): the heading of an inspector, Énergie or Maison panel (Commande, Historique, Chauffage, Projection, Tarif, Linky) and the Heures creuses fieldset legend. It is the section's only heading, never a kicker above another heading. The Énergie hero is the exception that proves it: its period title (« Octobre 2026 ») is a 13 px sentence-case heading, not a section label.
- **Micro** (11 px, tabular): strip and chart axis ticks, tab-bar labels. This is the floor.
- **Mono** (400, 13 px, tabular): the radiator counter columns (Compteurs des radiateurs), the price-history columns (Tarif), and the version string in Réglages.

### Named Rules
**The Tabular Rule.** Every number that can change (temperatures, setpoints, times, kWh, percentages) is set with tabular figures (`.num`, or `font-variant-numeric: tabular-nums`) so live updates never shift the layout.

**The Mono-for-Columns Rule.** JetBrains Mono is for dense right-aligned numeric columns: the radiator counter columns on Énergie and the price-history columns on Maison (in both the table and its phone list). The one other use is the version string (« Kelvin 0.1.0 »). Hero figures, projections, shares and every other single figure stay in Onest with tabular figures.

**The 11 px Floor.** No text is smaller than 11 px, and 11 px is reserved for axis ticks and tab-bar labels.

## Layout

One breakpoint: **1024 px** (`DESKTOP_QUERY` in `media.svelte.ts`, mirrored in CSS).

- **Phone (< 1024 px):** a single column with 16 px page padding and 88 px plus the safe-area inset at the bottom, clearing a fixed bottom tab bar (56 px items). Room cards stack with a 10 px gap; tapping a card expands it in place to the mode switch, a stepper and "Détails". Toasts sit 76 px above the bottom, at most 420 px wide (92 vw).
- **Desktop (≥ 1024 px):** a 232 px sticky sidebar (nav, then Tout éteindre / Absence… pinned to the bottom) and a main column with 24 px × 28 px padding, capped at 1280 px. Pièces becomes two columns: the room list (whatever is left) and a sticky **inspector column** (`clamp(320px, 38 %, 440px)`, 24 px from the top, scrolling internally within the viewport with contained overscroll), so nothing scrolls sideways from 1024 px up. Toasts sit 24 px from the bottom.
- **Wide (≥ 1280 px):** Énergie pairs its panels in two columns (max 1180 px): the hero, the house chart and the curve span both; Chauffage | Projection and Par pièce | Compteurs share a row and its height.
- **No sideways scroll** at any width from 320 to 1440 px on any route (`e2e/layout.spec.ts`). Below 1024 px `scroll-padding-bottom` keeps focused fields and anchors clear of the tab bar (and of the Programme send bar when it shows); a visible banner adds `scroll-padding-top`.

- **Below 600 px (fold):** tables give way rather than scroll the page. The radiator counter table keeps only the radiator (with its room folded beneath in 12 px muted) and the lifetime total; the Tarif price history becomes a hairline-separated list of two-column label/value rows; per-room rows drop their strip; the Énergie hero's date range takes its own line; the Réglages list's label column shrinks to its content (and below 360 px the label sits above its value).
- **Login:** outside the app shell (no sidebar, no tab bar): one column, at most 360 px wide, centred in the viewport on bg, 14 px between items.

**Spacing rhythm:** small even steps (2, 4, 6, 8, 10, 12, 14, 16, 18, 24, 28 px). Inside cards: 12 × 14 px padding, 8 px gap. Between inspector sections: 18 px, each section opening with a hairline and 14 px of space. Énergie panels: 14 px padding, 14 px apart (a grid gap), max 900 px wide (1180 px in two columns from 1280 px); Maison panels the same at 720 px. Form grids: 12 px gaps, fields auto-fit at 170 px (Tarif) or 200 px (Linky).

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
The room's day on one line: an SVG sparkline of the measured temperature (2 px, round caps, stroked with the heat-ramp gradient so its colour at any height is the heat at that temperature) drawn only up to now, over the planned setpoint (1 px muted step line). In programme mode the comfort periods appear as warm bands at 10 %. A 1 px ink **now-marker** (70 %) crosses the full height. The y-domain always includes 15–23 °C plus every known value, padded by 0.5 °C. A visually hidden sentence (range, latest reading, plan, pending request) describes it for screen readers. Default height 36 px on room cards; 120 px in the inspector history; 48 px with axis in the Programme preview; 22 px in the Énergie legend.
- **Axis** (`axis`, on expanded cards and day views): 00 · 06 · 12 · 18 · 24 in micro faint, with the current Paris time at the now-marker in ink 600. A fixed tick within 9 % of the marker is dropped so labels never collide.
- **Pending path:** a requested manual target draws a dashed ink line (1.25 px, 4/3 dash) from now to the end of the day; a pending comfort setpoint redraws the rest of today's programme dashed, clipped to after now, with eco shifted by the same amount.
- **Confirmation:** when the pending value disappears and the radiator now reports exactly that value, the path is held 250 ms and its dash closes to solid. If the reported value differs, it simply disappears. The same rule (`$lib/settle.svelte.ts`) drives every control below.
- Reused on room cards, the inspector, Programme (previewing a draft programme) and the Énergie legend.

### Stepper
A 44 px × value × 44 px well (in, field-line edge, 10 px) with − and + icon buttons and a 16 px tabular value. Press-and-hold repeats after 400 ms every 120 ms; changes commit after a 600 ms debounce. An underline under the value is the pending signal (PendingEdge): hairline at rest, muted 4/3 dashes while pending, morphing solid in 250 ms on matching confirmation; an unconfirmed optimistic value is released after 10 s. At min/max a button is `aria-disabled` (faint, inert) rather than `disabled`, so keyboard focus stays on it; hover and press fill s2. The value is not a live region: each committed value is announced once (« Confort : 20,5 °C »).

### ModeSwitch
A three-way radiogroup (Arrêt / Manuel / Programme, "Prog." when compact) in a well with 2 px padding and gap. Segments are 44 px tall, 13 px 600 muted (ink on hover); the current segment is s2 with ink text and a muted edge (3:1 against the well). That edge is the signature mark (PendingEdge, an SVG rect): dashed while the mode is requested, closing solid when the radiator reports it. While pending the group is `aria-busy` and the segment is named « Manuel (en attente) ». Keyboard is **manual activation**, because a mode is a device command: roving tabindex (the current mode is the tab stop), arrows only move focus (wrapping), and Enter/Space sends. Choosing the current mode again sends nothing. Transitions 160 ms ease.

### Segmented
The view-only sibling of ModeSwitch for choices that change what is shown, never a device: Énergie's Jour / Mois / Année, the inspector's 24 h / 7 j / 30 j, Réglages' Système / Sombre / Clair. Same well (in, hairline, 10 px, 2 px padding and gap) and the same 7 px segments, but inline-width with 14 px side padding; 44 px, 13 px 600 muted (ink on hover), the checked segment s2 with ink and a muted border (3:1 against the well). It also picks the room on Programme, scrolling inside itself when the rooms are wider than the page. A WAI-ARIA radiogroup with roving tabindex, and **automatic activation**: arrows (and Home/End) move focus and select at once. No pending state; nothing waits on a device.

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
Stacked SVG bars, drawn at the measured width and a fixed 160 px height (so a phone keeps tall bars and true corners); bars grow from the baseline (360 ms, 12 ms stagger capped at 180 ms) on first draw and on each period change, one series colour per part (2 px corners), hairline grid at four ticks, micro faint axis labels thinned so each keeps 44 px. An optional **overlay mark** (the radiators) is a 2.5 px round-capped horizontal line across the bar's width at its value, in series-3, over a 4 px s1 knockout so it reads on any bar; the y-scale includes it. Missing parts are never drawn as zero: an interior bucket with no data (data on both sides) gets a faint 2 px dashed (3/3) baseline tick titled « donnée manquante »; leading and trailing empties stay blank. Empty: « Pas encore de données. » The legend below uses 10 px swatches (3 px) for stacked series and a 14 × 2 px line for the radiator mark.

### CurveChart
One day of Linky half-hours at the measured width and a fixed 140 px height, 1 px-rounded bars with 15 % inner padding. With a tariff each bar is split by its off-peak fraction, HC (series-1) at the base and HP (series-2) above; without one, every bar is the single home series. Axis 00 · 06 · 12 · 18 placed on the matching half hours (so DST days stay true), then 24 at the right edge, micro faint. A muted « HC … · HP … » total sits beneath. Empty: « Pas de courbe pour ce jour. »

### Chart data tables
Every chart (EnergyBars, CurveChart) is an `role="img"` SVG with an aria-label, followed by a table inside `<div class="visually-hidden">` carrying the same caption, one row per bucket or half hour, a column per series (and the overlay), and « — » in any missing cell. The wrapper matters: a table cannot be narrower or shorter than its rows, so a table that is itself visually hidden widened the page at 320 px and left an empty tail under Énergie.

### Énergie
- **States:** the first load shows four panel skeletons (hero, chart, two short panels) and then the report and the Linky line at once, so nothing on screen moves (CLS < 0.05, `e2e/layout.spec.ts`). The report never waits on the live stream: only Par pièce and the counters, built from the rooms and radiators, hold their own skeleton (`aria-busy`) until the snapshot arrives. A period switch keeps the previous report on screen at 55 % with `aria-busy` until the new one arrives. A failed report or curve says so with a « Réessayer » secondary.
- **Header:** the page title with a Segmented (Jour / Mois / Année) on the right, wrapping beneath on phone. Below it, one 13 px line at most: the Linky callout or nothing, then the muted freshness line « Linky : données jusqu’au 13/10 ».
- **Hero panel:** the period title (13 px, sentence case: « 13 octobre 2026 », « Octobre 2026 », « 2026 »); the display figure, in € when a tariff covers both periods and followed by a 12 px muted « estimation » tag on its baseline, else kWh (Linky), else radiator kWh; a 13 px line « 200 kWh · HC 42,2 kWh · HP 158 kWh » then « · du 1/10 au 13/10 », the range joined by no-break spaces so it never wraps (on phone it drops its separator and takes its own line); then a muted comparison that names its basis (« +35 % par rapport à septembre 2026, mêmes jours », « par rapport à la veille », « par rapport à 2025, même période »). The comparison is plain muted text in every direction, never red or green. Muted footnotes cover missing or partial data, an estimated HC/HP split, and the missing tariff.
- **Consommation de la maison:** EnergyBars of HC + HP (or the home series) with the radiator overlay mark and its legend. Leading buckets before Linky history began are trimmed, so the chart starts at its first real bucket, and a muted footnote says « Historique Linky depuis le … ». Without Linky the panel shows « Consommation des radiateurs » in series-3 instead.
- **Chauffage:** a 20 px 600 share figure inside the sentence « … de la consommation de la maison depuis le 7/10 vient des radiateurs » (the « depuis le … » span names the day the share is counted from; « sur la période » when there is none), above a 6 px meter: well track, hairline, 3 px, filled in series-3.
- **Projection:** a two-column list, muted labels left (« Octobre 2026, mois complet », « 12 prochains mois »), value-style figures right prefixed « ≈ », then a muted footnote naming the method and ending « Estimation. »
- **Courbe du …:** a section label with the date, two 44 px icon buttons (previous is the chevron mirrored) that step through days with a complete curve and are `aria-disabled` at either end, then CurveChart. The previous day's chart is replaced at once by a 140 px skeleton, at the same height, so the heading never sits over another day's bars.
- **Par pièce:** one row per room (plus « Sans pièce » for unassigned radiators), all rows on one subgrid: name (fits up to 14rem, balanced wrap), the room's 22 px thermal strip filling the middle (desktop only), then « 152 kWh · 100 % » right-aligned in muted tabular text, and under the whole row a thin 4 px share bar (well track, 2 px) filled in series-3. Rooms carry no colour swatch of their own: colour belongs to the series, not the room.
- **Compteurs des radiateurs:** the radiator lifetime counters in mono right-aligned columns headed « Depuis l’installation (kWh) », « Tarif 1 (kWh) », « Tarif 2 (kWh) », the cells bare figures; see the fold in Layout.

### Linky status wording
One status, two places (the Énergie callout and the Linky panel on Maison). Progress is neutral and offers no link, because there is nothing to fix: never synced (« première synchronisation en attente »), quota (« historique en cours de récupération, la suite arrive demain ») and throttled (« Enedis limite les requêtes, nouvel essai à 14:30 ») read as plain or muted text. Only `auth` (« MyElectricalData refuse le jeton Linky. » with « Renouveler le jeton ») and `error` (with « Réglages ») use the bad colour and an alert role. Not connected at all is a neutral invitation with a « Réglages » link. In the panel the good state reads « Relié · données jusqu’au 13/10 · synchro il y a 5 min ».

### Form fields
A field is a label wrapping its control: a 12 px muted caption, 4 px, then a 44 px well (in, field-line edge, 8 px, 0 × 10 px padding) set in 15 px body with tabular figures, 16 px below 1024 px so iOS never zooms on focus (`--fs-field`). The base style is global in `app.css`; components add only layout. Selects share the input's exact geometry. Placeholders are muted (never the browser grey) and never carry the only instruction: a hint is a 12 px muted caption under the field, linked with `aria-describedby` (Linky: « Enregistré », then « Laissez vide pour garder le jeton. »). An invalid field is `aria-invalid`, edged in bad, linked to its error and focused. Units live in the caption, never in the field: « Abonnement (€/mois) », « Prix heures creuses (€/kWh) ». Decimal fields accept a comma or a point. Groups of fields auto-fit in a grid; a repeated group (Heures creuses slots) sits in a hairline-topped fieldset whose legend is a section label, with ghost « Retirer » / « Ajouter une plage » buttons. Errors follow in 13 px bad (alert), success in 13 px ok (status), then one primary button, left-aligned.

### Price history (Tarif)
A 13 px table under the form: « Depuis » (long date), then « Abonnement (€/mois) », « HC (€/kWh) », « HP (€/kWh) », the units in the headers so the mono cells are bare figures (« 15,00 », « 0,2068 »). Headers muted 500, hairline rows, cells never wrap, the wrapper scrolls inside the panel rather than the page. Below 600 px it is replaced by a list, one hairline-separated entry per price with the same labels on the left and mono values on the right.

### Login
Outside the shell, one centred 360 px column: the « Kelvin » brand (700), « Connexion » as a headline, a 13 px muted lead « Utilisez le compte Cozytouch de la maison. », two labelled 44 px fields (Email, Mot de passe), the error line when there is one, then a full-width ink primary « Se connecter » (« Connexion… » while busy). With the simulator a 12 px muted line gives the demo account. After a password change the screen adds a neutral note (s1, hairline, 10 px, 13 px, role status) « Reconnectez-vous avec le compte Cozytouch. »: being asked to sign in again is not an error.

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
Every route shows the shape of what is coming before data, never a word like « Chargement… » and never a value that is not yet known (« 0 pièce », « Pièce introuvable », « Aucun forçage »). A skeleton is s1 (`.skeleton`), or s2 inside a panel (`.skeleton.inset`), at the final height of what it stands for; a compositor-only shimmer (a translated gradient, 1.4 s) runs seven times and stops; reduced motion shows a static block. Where content arrives in parts, it is rendered together (Énergie's report with its Linky line; Maison's Tarif, Linky and Réglages), so nothing already on screen moves; a skeleton section keeps its anchor id (`/maison#tarif`, `#linky`), and the page lands on the anchor again once the real panel renders. Before the app itself loads, `app.html` paints a static shell (ground, wordmark, three blocks) as a fixed overlay the layout removes. Pièces: card skeletons, a sub-line bar, the inspector's shape. Programme: room picker, today's strip, seven day rows. Maison: the « En cours » line, Tarif and Linky blocks. Énergie: four panels, and a 140 px curve block.

### Focus and announcements
- The focus ring is a 2 px ink outline at 2 px offset on every control; a chip whose native box is hidden shows it via `:has(:focus-visible)`.
- Focus is never dropped to `<body>`: any button that can become inert while it may hold focus (paused commands, a running command, bounds, busy forms) uses `aria-disabled` with a guarded handler instead of `disabled`, desktop room cards keep focus across navigation (`data-sveltekit-keepfocus`, one shared PiecesView for "/" and "/pieces/[id]"), and after any other navigation the new page's h1 takes focus. A skip link « Aller au contenu » comes first.
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
- **Continuity:** card expand (slide 220 ms), Programme day open, banner row, dialog and toasts enter/leave, Énergie keeps the old period dimmed while loading.
- **Data:** Énergie bars grow from the baseline, meters ease to their fill (`scaleX`, compositor-only), a changed live temperature dips and returns. Strips on the room list have no entrance.
- **Reduced motion** (`prefers-reduced-motion: reduce`): nothing travels, scales, rotates or loops. Svelte transitions take their duration from `dur()`, which returns 0; CSS rules per component remove translation and dash travel; view transitions are skipped. Meaning is kept as opacity: the confirmation becomes a 150 ms fade-in of the solid mark, bars fade in, skeletons are static blocks, the spinner a static dashed ring. There is no global duration clamp (it made loops flicker and erased the morph).

### Raster provenance
`web/static/icon.svg` is hand-authored: a graphite tile with a heat-ramp sparkline and an ink now-marker (the strip in miniature). `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (56 px safe padding) and `apple-touch-icon.png` (180 px) are rendered from it on a bg ground by `web/scripts/icons.mjs` (`npm run icons`). Edit the SVG, then re-render; never edit the PNGs.

## Do's and Don'ts

### Do:
- **Do** colour temperatures, and only temperatures or heating, through `heatColor()`; unknown readings use faint.
- **Do** colour Énergie data through `SERIES`: HC series-1, HP series-2, radiators series-3, and keep each meaning on the same colour everywhere.
- **Do** put a visually hidden data table behind every chart, with « — » for missing cells.
- **Do** put units in field captions and table headers, not repeated in every cell.
- **Do** say what a comparison compares with (« mêmes jours », « même période »).
- **Do** show every sent command as dashed until the radiator reports the matching value, then morph solid in 250 ms; show a failure plainly with "Réessayer".
- **Do** keep every interactive target at least 44 px (tab-bar items 56 px) and keep text and heat colours at WCAG AA (4.5:1) on bg and s1 in both themes, and component boundaries (fields, the selected segment, programme blocks) at 3:1; extend `tokens.test.ts` for any new token.
- **Do** use `.btn-*` for every button, `.skeleton` for every loading state, `dur()` for every Svelte transition and the shared Settle/PendingEdge for every pending mark.
- **Do** keep the light block and the `prefers-color-scheme: light` block in `app.css` identical.
- **Do** focus with a 2 px ink outline, 2 px offset.
- **Do** format numbers in fr-FR with a no-break space (U+00A0) before units: "20,1 °C", "2 400 kWh", "100 %"; use the true minus "−" for negative deltas; use "—" for a missing value. Times are Europe/Paris, 24 h ("06:15"); relative times read "à l’instant", "il y a 5 min". All UI copy is French with typographic apostrophes (’).
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
