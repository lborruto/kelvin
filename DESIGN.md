---
name: Kelvin
description: Tableau — a dark, Apple-Home-like dashboard of the house: rooms as tiles with their −/+, the energy and the tariff of the moment beside them.
colors:
  ground: "#050506"
  bg: "#0b0b0d"
  s1: "#1b1b1f"
  s2: "#2a2a2f"
  s3: "#35353b"
  in: "#08080a"
  line: "#26262b"
  field: "#4a4a52"
  side: "#111113"
  sheet: "#1c1c1f"
  modal: "#151518"
  pop: "#232328"
  tx: "#f5f5f7"
  mu: "#a1a1a8"
  fa: "#8a8a92"
  fa-mark: "#6c6c74"
  heat: "#ff9346"
  heat-ink: "#231200"
  cool: "#7ab8ff"
  hc: "#a9d3ff"
  hp: "#3f6fd4"
  bad: "#ff6961"
  ok: "#4cd28a"
  s3c: "#c9c9d1"
  tempo-bleu: "#4f7dff"
  tempo-blanc: "#f5f5f7"
  tempo-rouge: "#ff5a5a"
typography:
  display: { fontFamily: "'Geist Variable', system-ui, sans-serif", fontSize: "56px / 64px desktop", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }
  hero: { fontFamily: "'Geist Variable'", fontSize: "32px / 40px desktop", fontWeight: 600, letterSpacing: "-0.03em" }
  page-title: { fontFamily: "'Geist Variable'", fontSize: "32px / 30px desktop", fontWeight: 700, letterSpacing: "-0.025em" }
  reading: { fontFamily: "'Geist Variable'", fontSize: "26px / 32px desktop", fontWeight: 600, letterSpacing: "-0.03em" }
  area: { fontFamily: "'Geist Variable'", fontSize: "18px", fontWeight: 600 }
  body: { fontFamily: "'Geist Variable'", fontSize: "15px", fontWeight: 400, lineHeight: 1.45 }
  secondary: { fontFamily: "'Geist Variable'", fontSize: "13px" }
  widget-label: { fontFamily: "'Geist Variable'", fontSize: "12.5px", fontWeight: 600 }
  group-label: { fontFamily: "'Geist Variable'", fontSize: "13px", textTransform: uppercase, letterSpacing: "0.04em" }
  axis: { fontFamily: "'Geist Variable'", fontSize: "11px" }
  mono: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: "13px" }
rounded:
  pill: "99px"
  sheet: "28px"
  widget: "22px"
  tile: "20px"
  pop: "18px"
  group: "16px"
  menu: "14px"
  input: "12px"
  seg: "10px"
  chip: "6px"
spacing:
  base: "4px"
  gutter: "16px"
  page: "28px 32px"
  widget-gap: "10px phone / 16px desktop"
  widget-pad: "14–18px"
---

# Design System: Kelvin « Tableau »

The design reference for the web app. It describes the system as built by the Tableau foundation batch
(spec `.superpowers/sdd/tableau/spec.md`, owner decisions in `progress.md`); the screen batches extend it.
Tokens live in `web/src/app.css` (pinned by `tokens.test.ts`); components in `web/src/lib/components/`; their
props and examples for screen work in `.superpowers/sdd/tableau/kit-api.md`. Every component in its states is
on the development-only gallery `/kit` (`npm run dev`, then `/kit`; a production build answers 404).

## Overview

**North Star: the house at a glance, Apple Home–like.** Maison (`/`) is a fixed tableau: summary chips on top,
one tile per room with its reading, its status and its −/+, then the energy and the tariff of the moment. A tap
opens the room sheet; −/+ act in place. Rounded, flat surfaces step up in tone on a near-black ground; ink is the
only accent for actions; colour carries meaning only (heat, away, tariff, errors).

**Owner decisions (2026-10-16), binding:**
1. **Nav:** « Maison » is the dashboard at `/`; « Réglages » is `/home` and its sub-pages. URLs, `paths.ts`, the
   legacy table and `homeAnchor` are unchanged.
2. **Orange only for heating:** a heating radiator, the comfort blocks of a programme, a running chauffe
   temporaire. Action buttons are ink, never orange.
3. **Tempo colours only when the price row in force is Tempo.**
4. **−/+ in Programme changes the level running now** (Confort or Éco) through the existing setpoint API.
5. **Dark only.** No light theme, no « Thème » preference, no `prefers-color-scheme` path. « Détails techniques »
   stays.

**Key characteristics:** one dark theme; surfaces `bg → s1 → s2 → s3`; radius by role (pills 99, sheets 28,
widgets 22, tiles 20); flat except what floats (`--pop` + one shadow); Geist with tabular figures everywhere;
pending is dashed, confirmed is solid; 44 px hit areas; everything in French and English.

## Tokens

### Colour (dark only)

| Token | Value | Use |
|---|---|---|
| `--ground` | `#050506` | page behind the app (`html`, browser chrome `theme-color`, the manifest) |
| `--bg` | `#0b0b0d` | app background (`body`) |
| `--s1` | `#1b1b1f` | widgets, tiles, grouped lists, chips |
| `--s2` | `#2a2a2f` | buttons, fields, steppers, segmented track, glyph discs |
| `--s3` | `#35353b` | stepper discs inside s2, the checked segment, hover on s2 |
| `--in` | `#08080a` | programme well (empty day bar) |
| `--line` | `#26262b` | hairlines, list separators |
| `--field` | `#4a4a52` | field and well edges, grab bar, Éco swatch edge |
| `--side` | `#111113` | sidebar, tab bar |
| `--sheet` | `#1c1c1f` | phone bottom sheet |
| `--modal` | `#151518` | desktop room sheet (Sheet `tone="modal"`) |
| `--pop` | `#232328` | popovers, menus, the Fiche, dialogs, the desktop Sheet |
| `--tx` | `#f5f5f7` | ink; the primary button fill |
| `--mu` | `#a1a1a8` | secondary text |
| `--fa` | `#8a8a92` | faint **text** (notes, axes, offline names) |
| `--fa-mark` | `#6c6c74` | faint **marks** (dashed rings, ghost outlines, unknown Tempo dot): the spec's faint, which reads 3.3:1 as text |
| `--heat` / `--heat-ink` | `#ff9346` / `#231200` | **only** heating, comfort blocks, a running chauffe temporaire; ink on a heat fill |
| `--cool` | `#7ab8ff` | Absence |
| `--hc` | `#a9d3ff`, always hatched (`--hc-hatch`, 45°, 1 px every 4 px) | heures creuses |
| `--hp` | `#3f6fd4` | heures pleines |
| `--bad` / `--bad-tint` / `--bad-edge` | `#ff6961` / 12 % / 35 % | errors and must-fix alerts only |
| `--ok` | `#4cd28a` | confirmations (« Tarif enregistré. », « Confirmé ») |
| `--s3c` | `#c9c9d1` | radiator-only series (Où part, no-Linky bars); `--series-3` is it |
| `--tempo-bleu/blanc/rouge` | `#4f7dff` / `#f5f5f7` / `#ff5a5a` | `TempoDot` only (`tokens.test.ts`) |
| `--neutral`, `--series-1/2/4` | | the strip's heat-ramp middle stop; Énergie's other series by meaning (`SERIES`) |

Legacy aliases kept for components the screen batches have not restyled: `--warm` = `--heat`, `--field-line` =
`--field`, `--radius` = 16 px. New code uses the names above.

**Named rules.**
- **Heat means heating.** Text and controls are never orange; a temperature figure is ink.
- **Tariff, not heat:** HC/HP swatches are 9–10 px squares with a 2–3 px radius, never round dots (round dots are
  Tempo days). HC is always hatched.
- **An offline room is never red.** Hors ligne is faint/muted everywhere.
- **Contrast:** ink, muted and faint text pass 4.5:1 on every surface they sit on (faint never sits on s2/s3:
  placeholders use muted); heat, cool, bad, ok pass as text on bg, s1 and s2. The field edge (`--field`) is a
  spec value below 3:1: a field is recognised by its s2 fill, its label and the 2 px ink focus ring.

### Type

Geist Variable (Fontsource, latin subset preloaded), weights 400–700, **tabular figures on `body`**
(`font-feature-settings: 'tnum'`); JetBrains Mono 400 only for dense numeric columns and the version string.

| Role | Size / weight | Class / token |
|---|---|---|
| Display (room sheet setpoint) | 56 phone / 64 desktop · 600 · −0.03em · lh 1 | `.t-display`, `--fs-display`; Stepper `size="lg"` |
| Hero (Énergie €) | 32 / 40 · 600 · −0.03em | `.t-hero` |
| Page title | 32 phone / 30 desktop · 700 · −0.025em | `.t-page` (the h1) |
| Tile reading | 26 phone / 32 desktop · 600 | `.t-reading`; RoomTile |
| Section header | 18 · 600 (aside 14 muted) | `.areah` |
| Body | 15 · 400–500 | |
| Secondary | 13–13.5 · muted | |
| Widget label | 12.5 · 600 · muted | Widget title |
| Group label | 13 · uppercase · 0.04em · muted | `.grph` |
| Note / axis | 12.5 / 11 · faint | `.note` |

### Spacing, radii, elevation

- **Spacing:** 4 px base (`--sp-1…8`); widget gap `--gap-w` 10 phone / 16 desktop; widget padding 14–18
  (`--pad-w`); page padding 28 × 32 desktop (`--page-pad-y/x`); phone gutter 16 (`--gutter`); sidebar 220
  (`--side-w`); tab bar 64 + safe area (`--tabbar-h`).
- **Radii:** `--r-pill` 99 (buttons, pills, steppers, chips), `--r-sheet` 28 (sheets, desktop room modal),
  `--r-widget` 22, `--r-tile` 20, `--r-pop` 18 (dialogs), `--r-group` 16 (grouped lists, notices, the Fiche),
  `--r-menu` 14, `--r-input` 12 (fields, day chips), `--r-seg` 10 (segmented, sidebar rows), `--r-chip` 6.
- **Elevation:** flat; surfaces step up in tone. Only floating things (popover, menu, Fiche, dialog, desktop
  Sheet) take `--pop` and `--shadow-pop` (`0 18px 40px rgba(0,0,0,.6)`). Behind a sheet or dialog: `--scrim`
  (black 60 %).

### Motion

Tokens in `app.css`, the same numbers in `$lib/motion` (`T`, `dur()` returns 0 under reduced motion; pass it to
every Svelte transition, `|global` inside a parent's `{#if}`).

| Token | Value | Use |
|---|---|---|
| `--t-press` | 100 ms | button press scale (0.97) |
| `--t-value` | 120 ms | stepper value cross-fade |
| `--t-state` | 160 ms | colour/state changes |
| `--t-modal` | 180 ms | desktop modal fades + scales from 0.98 |
| `--t-sheet-in` / `--t-sheet-out` | 280 / 200 ms, `--ease-sheet` `cubic-bezier(.2,.8,.2,1)` | phone sheet rises / falls |
| `--t-enter` / `--t-exit` | 220 / 150 ms | arrivals, banners (grid row), disclosures |
| `--t-morph` | 250 ms | the dashed → solid signature |
| `--t-data` | 360 ms | bars and meters |
| `--t-dip` | 400 ms | a tile reading dips and returns on a new measurement (`flash`) |
| `--t-snap` | 60 ms | the slider snaps to 0,5 °C on release |

Skeleton shimmer 1.4 s × 7, then stops. Reduced motion: nothing travels or scales; meaning stays as opacity.

## Shell

- **Desktop (≥ 1024 px):** `Sidebar` (220 px on `--side`, sticky): the mark (ink disc « K » + « Kelvin »),
  **Maison**, **Programme**, **Énergie**; the « PIÈCES » section (`sidebarRooms` in `$lib/nav`: one row per room in
  Cozytouch order, a heat flame while heating, the reading `fmtTempShort` on the right; offline rooms last, faint,
  plug glyph, no temperature; each opens `/rooms/[id]` and is `aria-current` there, Maison then is not); then
  **Partir…** (opens the Absence sheet; « Absence · dim. 18:00 » in cool while one runs), **Réglages**, and the
  Cozytouch `SourceLine` footer (dashed ring while reconnecting). Rows 40 px painted, 44 px hit, current = s2.
- **Phone:** `TabBar` — Maison · Programme · Énergie · Réglages (24 px glyphs over 11 px labels, current ink
  600), on `--side`, fixed, safe-area padded.
- **Alert dot:** a 7 px bad dot on Maison (sidebar and tab) **only** for a must-fix alert (`navAlerts`); the count
  is in the link's accessible name whenever alerts are active.
- **Nav model:** `NAV` (paths.ts, unchanged) + `NAV_ICON`, `NAV_TOP`, `NAV_BOTTOM`, `ALERT_KEY`, `sidebarRooms`
  (`$lib/nav.ts`); labels `m.nav.*` (`rooms` = « Maison », `home` = « Réglages »).
- **Banner** (`Banner.svelte`, logic unchanged): a 44 px strip atop main. Neutral (s2, muted glyph): browser
  offline at once, « Reconnexion à Kelvin… » after 60 s; bad (dark red ground, light-red text, bad hairline) after
  3 min with « Réessayer », Cozytouch unreachable, password changed. While reconnecting, command controls and house
  actions are inert (`aria-disabled`).
- **404 / error** (`+error.svelte`): centred ≤ 420 px; a 56 px s1 disc with the help (or alert) glyph; h1 26/700;
  one muted line; the large primary « Aller au tableau Maison », then « Énergie » and « Réglages » (a load error:
  « Réessayer » first, then « Aller au tableau Maison », and the « Détails » Disclosure).
- **First paint:** `app.html` paints the ground, the word and three tile-shaped blocks; after 8 s it says Kelvin
  is unreachable (both languages).

## Kit components

Props and examples for each: `.superpowers/sdd/tableau/kit-api.md`. All strings come from the dictionaries
(`m.*`); a component writes only its own words (`m.kit`, `m.now`, `m.common`, `m.stepper`).

### Buttons (`.btn` in app.css)
Pills on s2: `.btn` 40 px (500, 14 px), `.btn-sm` 34, `.btn-lg` 52 (600, 16 px), `.btn-block` full width;
`.btn-primary` ink fill with bg text (decision 2: never orange), `.btn-ghost` transparent with a field ring,
`.btn-danger` bad text, `.btn-icon` a 36 px round s2 button (`.btn-icon-lg` 40) named by `aria-label`. Hit areas
reach 44 px (`::before`). Hover lifts to s3, press scales 0.97. **Inert** = `aria-disabled="true"` (a guarded
handler, focus kept) and dims to 40 %; never native `disabled` on a focusable control.

### Stepper (primary setpoint control, amendment 2)
`Stepper.svelte`, logic unchanged (600 ms debounce, hold to repeat, 10 s release, one announcement per settled
value, `Settle` dashed → solid). Look: an s2 pill (4 px inset) with two s3 discs (36 px; `size="sm"` 32 px;
`size="lg"` 56 px s2 discs flanking a display figure) around the value, an optional `caption` above it
(« Confort », « Manuel »). Pending: the value's underline dashed until the radiator reports it. At a bound the
disc is `aria-disabled` (35 %). `disabled` = inert: the pill dims to 40 %. `block` stretches it (tiles).

### What −/+ changes (`$lib/setpoint`)
`primarySetpoint(status, rads, override, expected)` → `{ kind, value, min, max, pending, endsAt? } | null`:
Manuel → `manual`; Programme → `comfort` or `eco` (the level running now; eco shown absolute, sent as the
lowering); Chauffe temporaire → `boost` (sent again with the minutes left); Arrêt, window open, away, offline,
read-only, restoring, other modes → `null` (no stepper: a command that cannot work is absent).
`primaryLabel(kind)` gives the caption; `sendPrimary(roomId, p, v, comfort, now)` sends one result.

### RoomTile
`RoomTile.svelte`, `layout="tile"` (phone, 2 columns: 36 px glyph disc + 26 px reading, the name, one status line,
the compact stepper) or `layout="widget"` (desktop column: 40 px disc, name, 32 px reading, status, stepper,
`MiniSpark`). The body is one link to the room sheet (stretched); the control and tags sit above it and act in
place. The disc is heat only while heating. Variants: `off` (no stepper; a note), `absence` (cool glyph, no
stepper), `readonly` (a chip, no control), `offline` (transparent, hairline, plug, faint, « Hors ligne depuis … ·
hint », full width, never red, no temperature). `pending` dashes the status line; `dipKey` makes the reading dip.

### IconTile, SummaryChip, Widget
- **IconTile** (`.tl`): s1, radius 20, ≥ 68 px, a 40 px disc (heat with `tone="heat"`), a 15/600 title over a
  13 px muted line; `layout="stack"` (the two small tiles) or `row`; `off` = outlined faint; link, button or
  plain; `inert`.
- **SummaryChip** (`.cat`): a 46 px s1 pill, a 30 px s2 disc, label 14/600 over value 12.5 muted (label and value
  are separate strings); `tone="cool"` for a running absence; `skeleton` keeps its size. A row of them: `.chip-row`
  (wraps on desktop, scrolls inside the page on a phone, edge to edge).
- **Widget** (`.w`): s1, radius 22, 16 × 18; a heading label (12.5/600 muted; `strong` for list widgets) with an
  aside, a « … › » link or a `meta` snippet; `tone="heat"` (heat hairline) or `"bad"` (bad tint); `span={2}`.

### MaintenantCard and TariffBand (decision 3)
`$lib/maintenant` derives the period in force from the price row in force and Paris time: `none` · `base` (one
price) · `hchp` / `tempo` (`period`, `price`, `next` {period, at, price}, `blocks` of the civil day, Tempo colour
of the Tempo day in force — before 06:00 that is yesterday's, unknown to `/api/grid`, so its price is `null` with
its reason — and tomorrow's colour with its two prices). `MaintenantCard` renders it: header « Maintenant » with
« heures creuses / pleines · 9 kVA » or « ● Jour Tempo Bleu »; the period with its swatch; « jusqu’à 22:00, puis
creuses à 0,2000 € »; the price as a Fig (« par kWh », Provenance « Votre tarif »); the `TariffBand` (HC hatched
light blue, HP solid dark blue, a 3 px ink now marker with the time above, 00–24 ticks; an image named
« Heures creuses 22:00–06:00 »); Tempo: « Demain ● Blanc · pleines … · creuses … ». Base: « Prix unique … »
with no band. No tariff: one line and « Renseigner le tarif ».

### Charts in tiles
- **MiniBars:** one bar per value; HC hatched base + HP above with `parts`, else one series (`home`, or
  `radiators` grey); a missing value is a 3 px stub, never a zero bar; `estimate` dashes the last bar's expected
  height; `highlight` dims the others; Tempo dots only with `tempo`; a visually hidden table from `rows`.
- **MiniSpark:** today's temperature as a 2 px ink line up to now with an end dot, the setpoint dashed muted, the
  comfort periods as 9 % heat bands, a now line; decorative (`aria-hidden`) beside the tile's reading.

### VSlider (secondary, amendment 2)
`VSlider.svelte`: room sheet only. An s2 track (120–140 × 200–320, radius 28 % of its width), ink fill from 10 °C,
ticks every 0,5, the measured temperature as a 2 px heat line with its value on a dark chip. `role="slider"`
(vertical, `aria-valuetext` « 20,0 °C »); the drag follows the finger with no easing and snaps to 0,5 on release
(60 ms), then sends once; keys ±0,5 (Page ±1, Home/End) send after 600 ms. `dim` = faded and inert. `pending`
dashes the fill's top edge. `snapTo`, `valueAtY` are exported.

### Sheet (dialogs, bottom sheets)
`Sheet.svelte`: a native modal `<dialog>` (focus trapped, page inert, Esc closes, focus returns to `trigger` or
whatever had it). Phone (`variant="auto"` below 1024, or `"sheet"`): bottom sheet on `--sheet`, top radius 28,
grab bar; rises 280 ms, falls 200 ms; dragging follows the finger and dismisses past 30 % of its height or on a fast
flick; `tall` = full height from 56 px. Desktop: centred modal (`width`, default 460) on `--pop` (or `--modal`
with `tone="modal"`), radius 28, fade + scale from 0.98 in 180 ms. `header`, `footer` snippets; `noClose` for an
action sheet. `ChoiceSheet` (same API as before) wraps it; the phone `Menu` is an action sheet with « Annuler ».
The « Tout éteindre » dialog and the setup dialogs use `--pop`, radius 18, the pop shadow and the scrim.

### Lists, notices, small pieces
- **GroupedList / ListRow** (`.grph` + `.grp` + `.li`): s1, radius 16, rows ≥ 52 px (64 with a second line)
  split by hairlines; a row is a link (chevron), a button (`expanded` for a disclosure), or facts (`value`);
  `disc` puts its glyph in a 34 px s2 disc; `danger` writes the label in bad.
- **Notice** (`.notice`): neutral (s2 60 %, hairline, muted glyph) or bad (tint and edge); 14/600 title, 13 px
  muted body; `role="status"` by default.
- **Segmented:** s2 track radius 10, 32 px segments radius 8, the checked one s3 + shadow + 600 (arrows select:
  the Command Keyboard Rule). **Toggle:** 46 × 28, off s3 with a muted knob, on ink. **Fiche:** `--pop` card,
  radius 16, 300 px, the pop shadow (sheet on a phone). **Menu:** `--pop` popover radius 14, 6 px padding, 44 px
  rows; phone action sheet. **`.chip`**, **`.pill`**, **`.areah`**, **`.note`**, **`.faint`**, **`.heat`**,
  **`.cool`** utilities.
- **Skeleton:** `Skeleton.svelte` / `.skeleton` with a shape (`widget` 22, `tile` 20, `pill`, `line` 6, `block`
  16) at the final size; `inset` inside a surface. Never a value or « Chargement… »; content that arrives in parts
  is rendered together.

## Rules that still hold (carried over)

These behaviours are unchanged by Tableau; where a sentence below names an old look (s2 cards, 10 px radii, a light theme), the tokens and kit above win.

### Data on demand: three depths
Every screen answers at a glance and keeps the exact data one step away (direction-2 §1):
- **L0 · Glance:** the answer, rounded (« Hero / sentence » precision), estimates marked « ≈ » / « est. ». Always on screen.
- **L1 · Exact:** the exact value(s), unit, period, **source**, **freshness**, **measured or estimated** and how: a **Fiche** opened from a **Fig** (hover, focus + Enter, tap).
- **L2 · Analysis:** tables, breakdowns, method text, raw states: a **Disclosure** (closed by default, `hidden="until-found"`) or a sub-page.
A value is never L1-only if a reader needs it to decide, never L0 if only an auditor needs it; L0 never shows a method sentence (a footnote stays only when it changes the meaning, as one muted ⓘ line). Every exact figure goes through `Fig` and `$lib/provenance.ts`. The props of every piece below are listed in « Foundation components: API ».

### Fig (exact-value trigger)
A figure with more precision or provenance than it shows is a `<button class="fig">` (`Fig.svelte`): no box, the text's own style, a 1 px dotted underline in faint with a 3 px offset (the only cue, visible on touch too), firmed to muted on hover and to ink while its Fiche is open; its `::before` makes the hit area 44 px tall without changing the line. Accessible name: the L0 value plus « détails » (« 19,5 °C, détails »). Mouse: the Fiche opens after 120 ms of hover and closes 200 ms after the pointer leaves both figure and card. Click, tap or Enter **pins** it. Not every number is a Fig: only those with more to say.

### Fiche
`Fiche.svelte`, generalising ChartInspector. Desktop (≥ 1024 px): a 300 px card (`--pop`, radius 16, the pop shadow, 13 px) placed beside its trigger (right of it; else below, right-aligned to it; else above; else left; else clamped in the viewport; placed again when its content changes; `fichePlace`), portalled to `<body>` and fixed, a non-modal `role="dialog"` named by its title; pinned, it shows a 36 px close button (44 px hit) and closes on Esc (focus back on the figure), on a press elsewhere, or when focus leaves it (to another control or to nowhere); opened from the keyboard, focus moves to the card itself (`tabindex=-1`). Phone: the same content in the ChoiceSheet bottom sheet (its title as the sheet's heading). Content (`FicheBody.svelte`, shared with ChartInspector): a 13 px 600 title; label/value rows (muted label left, tabular value right, « dont » rows indented 10 px, a 12 px « est. » after an estimate, the reason under a « — »); notes; then the **Provenance block** under a hairline in 12 px: `Source`, `Relevé`, `Nature` (`$lib/provenance.ts`), its notes, and one optional `.btn-sm` action. Fades in over `dur(T.state)` (`|global`).
- **Provenance vocabulary** (§1.4): `mesuré` (no L0 mark), `estimé · <méthode>` (« est. »), `projection · <méthode>` (« ≈ »), `calculé · <formule>` (« ≈ »), `publié` (a grid signal as RTE/EDF gave it). Sources: « Linky · Enedis via MyElectricalData », « Compteur du radiateur (Salon 1) » / « Compteurs des radiateurs », « Votre tarif », « RTE EcoWatt via MyElectricalData », « Tempo (EDF) via MyElectricalData », « Cozytouch », « Calcul Kelvin ». Relevé: « jusqu’au 14/10 », « courbe jusqu’au 14/10 », « il y a 3 min » within the hour, « 21:11 » today, else date and time; « synchro … ».
- **Room panel:** the header reading (each radiator that answers, their mean, the target; Cozytouch, measured, « moyenne des radiateurs en ligne ») and the Énergie figures (Consommation with its HC/HP parts and coverage, from the radiators' meters, estimated when spread between readings; Coût, calculated from your tariff; Heures de chauffe and Part du temps en chauffe, calculated) are Figs.

### Freshness and SourceLine
**Freshness** (`Freshness.svelte`, states from `$lib/freshness.ts`): an 8 px circle, 1.25 px stroke, beside a source's name, `aria-hidden` and always paired with words. Solid muted ring = fresh (within the source's cadence); **dashed** muted ring = waiting or late (first sync, quota, next read pending, stale: the pending signature); solid bad dot = failed (only what is already red: token refused, sync error, Cozytouch down); nothing when there is nothing to say. Cadences: Cozytouch 15 min; Linky (daily and curve) the day before, due by 12:00 the next day; RTE EcoWatt 6 h; Tempo 24 h, and tomorrow's colour due after 11:00.
**SourceLine** (`SourceLine.svelte`): one 12 px muted line `[mark] Source · state`, ellipsised (never reflows), in bad text only when failed; with a Fiche its words are a Fig opening the source's times, quotas and next read. The sidebar's status footer is the Cozytouch SourceLine (`CozytouchStatus`), dashed while Kelvin's own stream is not open. Later: Énergie context row, Maison cards, Sources, radiator rows. Login is exempt.

### Disclosure
`Disclosure.svelte`: a 44 px button row (13 px 600 ink, a chevron turning 90° over 220 ms, an optional right-aligned 12 px muted meta « 3 lignes ») toggling a region that is `hidden="until-found"` when closed (find-in-page reaches it; `beforematch` opens it), sliding by its grid row 0fr → 1fr over `dur(T.enter)`; reduced motion: instant. Under a heading (`heading="h2"`) the heading holds the button and the button takes the heading's type (Qualité des données keeps its section label). `detail` opens it at first render when « Afficher les détails techniques » is on. The `inline` variant is a dotted 13 px muted text button with the help glyph inside a sentence line; its region takes the next line (Programme « Comment modifier ? »). Replaces every ad-hoc toggle (QualityPanel, Programme help, the error page's « Détails »).

### Menu
`Menu.svelte`: a 36 px « ⋯ » icon button (edged, 44 px hit) or a labelled ghost trigger (« Exporter ») opening a popover (s1, hairline, 10 px, 8 px padding, min 220 px, portalled and fixed, under the trigger and right-aligned to it, flipped above near the bottom) on desktop, or the same items in the bottom sheet on phone. Items are 44 px rows (16 px muted icon + 14 px label), a hairline between groups, destructive items in bad text, a 12 px muted non-interactive footer line. `role="menu"` / `menuitem`: focus lands on the first item, arrows/Home/End move, Enter or Space activates and closes, Esc closes and returns focus, Tab closes with focus back on the trigger and moves on from there (menu-button pattern). A disabled item stays focusable (`aria-disabled`) with its reason as a 12 px muted second line (`aria-describedby`).

### PageHeader
`PageHeader.svelte`: the h1 (22/700) and right-aligned actions on one 44 px row, then one 13 px muted **state line**, ellipsised (never reflows); a sub-page puts its back link (« ‹ Maison », 44 px) above the h1, first in the DOM. Pièces and Programme keep their own equivalents; Énergie, Maison and its sub-pages adopt it with their redesigns.

### Preference « Détails techniques »
Per device, off by default: `localStorage` `kelvin-detail`, applied before first paint as `<html data-detail="on">` by the app.html boot script (like the theme), read through `$lib/stores/detail.svelte.ts`. When on: every `detail` Disclosure starts open (Énergie's Détails, Qualité des données, the Tarif price history, a device's raw states); the room panel shows the live power « ≈ 1,70 kW » after « En chauffe » as a `Fig` (Fiche « Puissance de chauffe »: each heating radiator « 80 % de 1 500 W », the total, Nature « calculé · taux de chauffe Cozytouch × puissance du radiateur »; `livePower` in `$lib/roomfacts.ts`, none when a heating radiator's power is unknown: never a partial sum), the room card the same words as plain text (the card is a link), and each radiator row its raw signal and last event inline (`detailFacts`). It moves L1/L2 content up one depth: it never changes a format, adds a panel or shifts the page (`e2e/cls.spec.ts` « details on »). The toggle « Afficher les détails techniques » sits in Maison › Affichage.

### Error and 404 pages
`routes/+error.svelte`, centred in main at most 420 px: a 40 px s1 circle with the help glyph (404) or the alert glyph, the h1, one 13 px muted sentence, then the ways out. 404: « Cette page n’existe pas », « L’adresse est peut-être ancienne ou incomplète. », primary « Aller aux pièces », secondary « Énergie », « Maison ». Load error: « Kelvin n’a pas pu afficher cette page », the cause in words (server error, Kelvin unreachable, unexpected), primary « Réessayer » (a full reload), « Aller aux pièces », and a « Détails » Disclosure (code, time, address; never a stack trace or an id). A legacy French path is still sent to its English page first.

### Foundation components: API
Stable props (`web/src/lib/components/` unless noted); every string comes from the dictionaries.
- **`Fig`** `{ value: string; label?: string; title: string; rows?: FicheRow[]; empty?: string | null; notes?: string[]; provenance?: Provenance | null; action?: { label; run } | null; class?: string; children?: Snippet; openDelay?: 120; closeDelay?: 200 }`. `value` is the L0 text (and the name's lead, « value, détails »; `label` overrides the lead); `children` draws the figure when it is more than text.
- **`Fiche`** `{ open; pinned?; anchor?: HTMLElement; id; title; rows?; empty?; notes?; provenance?; action?; focusOnOpen?; onclose; onenter?; onleave? }`: the placement (card ≥ 1024 px, sheet below); hosts other than Fig drive it. `fichePlace(anchorRect, cardSize, viewport)` is exported.
- **`FicheBody`** `{ title?; titleId?; rows?: FicheRow[]; empty?; notes?; provenance?; estLink?; action? }`, `FicheRow = { key?; label; value; est?; note?; sub? }`: the one row renderer (ChartInspector uses it; it also takes `provenance`).
- **`$lib/provenance.ts`** `provenance(kind, data?, now?) → { kind, nature, rows: {label, value}[], notes }`, kinds `linky-day | linky-curve | radiator-meter | tariff | rte-ecowatt | tempo | cozytouch | kelvin-calc`, data `{ day?; at?; syncAt?; name?; nature?; method?; notes? }`; `sourceName`, `natureText`, `when`, `stamp`.
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
- **Order (answer, then evidence):** PageHeader « Énergie » with the views Segmented and « Exporter » (one row from 1024 px; on a phone a « ⋯ » icon beside the title and the Segmented full width under it), the **context row**, then Résumé, Consommation, Courbe du …, **Où part l’énergie** (with Température et chauffe inside in Jour and Semaine), **Analyse** (Puissance in Jour and Semaine, Heures creuses / pleines, Comparaisons, Projection), Qualité des données (collapsed), and a quiet ghost « Exporter (CSV) » at the end. Mois on a 1 440 px desktop is about 1 650 px tall with every disclosure closed (was 2 591). No « Compteurs des radiateurs » or « Exporter » panel (critique 2 §7). Without Linky: an invitation card (energy glyph, « Reliez votre compteur Linky », what it brings, « Relier le Linky ») above a radiator-only Résumé (« 48,2 kWh · des radiateurs, du 1/10 au 14/10 »), the radiator bars and Où part l’énergie (rooms only); no Analyse.
- **Context row:** PeriodNav, then on the same line from 1024 px (wrapping under it on a phone) the Linky **SourceLine** (« ○ Linky · données jusqu’au 14/10 »; dashed while waiting: « première synchronisation en attente », « historique en cours, la suite demain », « Enedis limite les requêtes, nouvel essai à 14:30 »; its Fiche: last daily day, last sync, MyElectricalData calls « 2 sur 10 aujourd’hui », next try, history since) and the **GridChips** (« Aujourd’hui ● Bleu », « Demain ● Rouge » under Tempo; « ⚠ EcoWatt orange demain, 18:00–20:00 », bad text at level 3; every chip a Fig whose Fiche lists the signals with RTE's fetch time and the « publié » nature). Only Linky problems the user must fix (token refused, sync error, status unavailable) are a red callout above the Résumé, with « Renouveler le jeton » / « Ouvrir Linky ». Pièces keeps the one-line Grid strip.
- **Condensed period bar** (`PeriodBar`): once PeriodNav has scrolled above the screen (IntersectionObserver), a fixed 44 px bar fades in (160 ms, opacity only) at the top of the content column: « ‹ Octobre 2026 · Mois › », s1 at 92 % with a 12 px blur and a hairline. Fixed and never in flow, so it moves nothing; `aria-hidden` always (PeriodNav stays the one control for assistive technology), its buttons out of the tab order, `inert` while hidden; its buttons run PeriodNav's handlers. Sections linked from the Résumé keep a 60 px `scroll-margin-top` clear of it.
- **Export menu:** a `Menu` (« Exporter » ghost with the download glyph on desktop, the « ⋯ » icon on a phone, the same menu again as the closing ghost « Exporter (CSV) »): « Exporter la période (CSV) », « Exporter la courbe du 12/10 (CSV) » (when the Courbe's day has points), « Exporter par pièce (CSV) » (`aria-disabled` with « Disponible une fois les pièces chargées » until the house is known), and the format as the menu's muted footer (« CSV : « ; » entre les colonnes, virgule décimale, dates ISO. »). The actions are `$lib/export.ts` (`exportActions`); the files are `$lib/csv` (contract in `web/README.md`).
- **States:** the first load shows the header, the navigator row and four panel skeletons (the Résumé at 250 px below 640 px of panel and 190 px above it, then 262, 236 and 300 px), then the report, the source line and the chips at once (CLS < 0.05, `e2e/layout.spec.ts` « Énergie layout matrix », four views × 320–1440 px × fonts normal / blocked / late). A period switch keeps the previous report on screen at 55 % with `aria-busy`; a failed one leaves it there, names the period that failed and offers « Réessayer ». A **view** switch redraws the panels for the new view (`{#key}`), so a slow report replaces the previous view's content instead of moving it. The Courbe of another day is replaced at once by a skeleton at the chart's height; Température et chauffe keeps the previous room on screen, dimmed, until the new answer. Only Où part l’énergie's rooms, Température et chauffe's room picker and the room export wait for the live house. Linky first sync: the dashed source line and « Première synchronisation : l’historique Linky arrive dans quelques minutes. » in the Résumé. A period before the history: « Pas de données pour septembre 2025 : l’historique commence le 1 novembre 2025. » with a ghost « Aller au 1/11 ». No tariff: the Résumé's figure is the kWh, « Ajoutez votre tarif pour voir les coûts. » with « Renseigner le tarif », and no € anywhere in it.
- **Navigator:** see PeriodNav. Jour draws the 7 days ending on the day and the day's Courbe; Semaine the ISO week's days; Mois the month's days; Année its months. The Résumé, the panels, the tables and the CSV always describe the selected period; a running period is described up to its last day with data (« du 1/10 au 12/10 »), and its radiators and room figures up to yesterday. Midnight with the page open asks the period again.
- **Résumé** (`EnergyHero`): the figure in the **Hero** type (40/600, −0.02em, tabular; 32 px below 420 px of panel) is a `Fig` (« 91,00 €, estimation, détails ») whose Fiche is the period's inspection (`inspectBucket`: Maison, HC/HP, radiators, Coût estimé with « dont énergie » / « dont abonnement », prices, per day), every method note, and the Provenance (Linky + « estimé · kWh Linky × votre tarif »; « mesuré » for kWh; the radiators' meters without Linky). € when a tariff priced the period (12 px « est. » after it), else Linky kWh, else radiator kWh. Then the range with the kWh (« du 1/10 au 14/10 · 330,0 kWh »), the **SplitBar** (8 px, `--hc` hatched then `--hp`, 1 px knockout, radius 3, growing over `--t-data`; each part's words under its end with an 8 px swatch, « Heures creuses 55,6 kWh » / « Heures pleines 274,4 kWh », matched to the kWh by `fmtKwhParts`; `role="img"` named by the same words; one series-1 bar without a split), the comparison on comparable days only (« +63 % de consommation par rapport à septembre 2026, sur 14 jours comparables », muted, never coloured). Only notes that change the figure's meaning stay on screen, one muted line each with the ⓘ glyph: missing days and their uncounted energy, prices applied to earlier days, days without a Tempo colour, a partial or absent radiator sum without Linky. The estimated HC/HP split and radiator interpolation live in the Fiche.
- **Key figures** (beside the answer from 640 px of panel, a hairline-separated list under it below): three fixed 52 px slots, each a link with a chevron (nudges 2 px on hover) to its section, named « Chauffage, 63 % de la maison »: « Mois complet ≈ 190,34 € » (`#projection`, only when the period holds the last day with data), « Chauffage 64 % de la maison » (`#energy-where`), « Heures creuses 17 % · 33 % du temps » (`#offpeak`, not under Base or without a tariff). A figure the period lacks leaves its slot empty, so stepping periods never moves the rows (`ENERGY_ANCHORS` in `$lib/paths`).
- **Consommation de la maison:** EnergyBars of HC + HP (or the home series) with the radiator overlay, the inspector and the legend (« Non réparti » in series-1 for a day without a split beside split days, « Consommation » when nothing is split; a series is listed only when a bar draws it, never for days still to come); leading buckets before Linky history are trimmed, with « Historique Linky depuis le … ». Without Linky, « Consommation des radiateurs » in series-3.
- **Courbe du …:** the day's CurveChart with the Scrubber. **At rest the readout is the whole day**: its lead cell reads « Journée » and its fields the day bar's own figures (`readDay` in `$lib/inspector.ts`: Énergie and Coût and Radiateurs and Reste from the bar's inspection, so the day reads the same in the readout, the bar and the CSV; Puissance « pointe 5,53 kW à 06:30 »; Température « moy. 17,2 °C »); Tarif and Prix, with no whole-day value, keep their box unseen. Scrubbing puts the half-hour in the same stacked cells (no reflow), and a muted 12 px line under the axis says « Survolez, touchez ou utilisez ← → pour lire chaque demi-heure ». In **Mois and Année** the panel is collapsed to its summary row, a `Disclosure` (`h2` holding its button, `detail`): « › Courbe du 14 octobre 2026 · 29,07 kWh · 8,17 € · pointe 5,53 kW à 06:30 »; a bar's Enter or « Voir la courbe du … » opens it on that day. Outside Jour, two icon buttons step through the period's complete-curve days (`aria-disabled` at the ends); it opens on the newest complete day of the period. Under it: « Courbe 21,60 kWh · relevé journalier 22,03 kWh (écart 2,0 %) », « HC 8,98 kWh · HP 13,05 kWh, d’après le relevé journalier » (est. when the split is not from the curve), « Courbe incomplète (41/48 demi-heures) », « ≈ » explained when an HC slot edge falls inside a half-hour, and an empty day's reason (« antérieure à l’historique de courbe (depuis le …) », « antérieure au premier jour compté (depuis le …) », « pas encore récupérée (quota) »).
- **Où part l’énergie** (`EnergyWhere`, `#energy-where`, full width; the section label with the period as right-aligned meta): the heating share (« 64 % de la consommation de la maison vient des radiateurs (6 jours sur 15). », 20/600 figure, a 6 px series-3 meter), then one 12 px muted line « Coût du chauffage ≈ 32,53 € est. · énergie seule · partiel³ » whose amount is a Fig (radiators, rest, cost, days measured; Provenance « Compteurs des radiateurs », estimated when spread between readings). Above 102 %: « — » and « Les radiateurs dépassent le compteur : données incohérentes. » Then the **rooms ranked by kWh** (an unknown sum last, « Sans pièce » always last): from 640 px of panel a row « [›] Salon¹ · share bar (4 px series-3 over the well) · 78,49 kWh est. · 20,82 € · 64,0 % » with right-aligned tabular columns; below, name and % on line 1, the bar, then kWh and €. The kWh is a Fig (HC/HP, € energy only, how it was measured, the partial sentence). Each row's chevron button opens a findable region (`hidden="until-found"`, `beforematch` opens it): HC/HP, Moy. °C, Consigne moy., Heures de chauffe (« — » with its reason), then the room's radiators (name, model, kWh Fig, partial and stats reasons, and « depuis l’installation 2 400 kWh » as a Fig whose Fiche gives the radiator's « Compteur interne 1 / 2 » — the radiator's own registers, never HC/HP; « — » for an absent one), and the heating-hours note. A partial row carries a superscript mark (¹ ², one per distinct sentence, the heating line's coverage after them); the sentences are written once under the list (« ¹ partiel : 2 radiateurs sur 2 enregistrés à partir du 9/10 »), then « est. : énergie répartie entre deux relevés des radiateurs. » and « Pièces selon la répartition actuelle des radiateurs. ». Shares by largest remainder (`fmtShares`), a room's HC/HP and its radiators' rows matched to it (`matchParts`), the rooms' € adding up to the heating cost: `roomEnergy` unchanged. Share bars are `role="img"` named « Salon : 64,0 % de l’énergie des radiateurs ». Rooms carry no colour of their own.
- **Température et chauffe** (Jour, Semaine; an `h3` inside Où part l’énergie, under the rooms): one room (Segmented on desktop, a select on phone; the first room of Pièces with a radiator by default, never following the period; **opening a room row selects it**) on the Courbe's day: its radiators' Wh as light series-3 bars, the temperature as a heat-ramp line, the setpoint as a 1 px muted step line, Wh on the left axis and °C on the right, sharing the Courbe's scrubbed half-hour. A half-hour whose room sum is unknown reads « — (radiateur sans relevé) ».
- **Analyse:** a section label (`h2`) over summary cards (`h3` section labels): two by two with four cards (Jour, Semaine), three abreast with three (Mois, Année) from 900 px of content, two then one below. Each card keeps its headline figure, one sentence and its meter in L0; the rest sits in one `Disclosure` « Détails » (`detail`: open with « Détails techniques »; a muted meta says what is inside).
- **Puissance** (Jour, Semaine): « Pointe moyenne sur 30 min » 20 px with its half-hour (and day in Semaine), « abonnement 12 kVA », a 6 px meter of the peak against the subscribed power and « 61 % de la puissance souscrite ». Détails (« consommation de fond, minimum de nuit »): « la pointe instantanée peut être plus élevée », « Hypothèse : 1 kVA ≈ 1 kW. », « Consommation de fond » with the night minimum and « 10 % des demi-heures sont sous … », « consommation de fond ≈ … » (with € in Jour, per day in Semaine over N complete days). Complete curve days only; else « — » and why. While the day loads, a skeleton of the L0 lines and the Détails row.
- **Heures creuses / pleines** (`#offpeak`): « 16,3 % de l’énergie, pour 33,3 % des heures » and the 6 px HC/HP meter. Détails (« prix moyen, simulation »): the mean price paid, « Chaque kWh passé d’HP en HC », the 0–50 % slider (step 5) with its result « à consommation identique », its formula and « Calcul sur vos prix et votre consommation, pas une économie garantie. », and under Tempo the six colour rows. Without a tariff: « Renseignez le tarif pour voir la répartition. »
- **Comparaisons:** three rows (période précédente, même période l’an dernier, moyenne des 4 derniers …), each « +12 % » with « −14,20 kWh · −3,61 € » and « sur N jours comparables », or « — » with its reason. Never red or green. They are the answer, so they stay; Détails holds the rule (only days measured on both sides count; the cost compares energy only).
- **Projection** (`#projection`): « Mois en cours et 365 prochains jours » (it follows the latest Linky day, not the period on screen), « Octobre 2026, mois complet ≈ … » with what is measured and the estimated missing days, « 365 prochains jours ≈ … » with its dates, a 32 px dashed series-1 sparkline of the 12 projected months from zero with the current month as a dot. « Comment c’est calculé » (Disclosure, « méthode et prix ») holds « Estimation, au rythme récent et aux prix d’aujourd’hui. » and the backend's formula. Linky late: « — » and why.
- **Qualité des données:** a collapsed **Disclosure** (`#quality`: an `h2` holding its toggle button, with the meta « 7 estimations » (days whose HC/HP split is estimated plus buckets whose radiator energy was spread between readings) or « tout est mesuré », never a heading inside `<summary>`, whose button role hides it from heading navigation in some readers; the closed body is `hidden="until-found"`, so find-in-page reaches it and opens the panel; `detail`: open by default with « Détails techniques ») that every « est. » links to: a coverage strip per bucket of the selected period for Linky journalier · Courbe · Radiateurs (ink full, faint partial, dashed missing, blank when nothing was expected yet; in Jour the day's one cell, not the seven bars), then the history dates, the estimated days with their fallback share and method, the mean curve / daily gap and the retroactive prices, all over the selected period (`period.quality`).

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

### Toasts
Stacked bottom-centre: s2, hairline (red-tinted for errors), 10 px, 13 px, a close icon button (36 px, 44 px hit). They rise 12 px into place (220 ms), fade out (150 ms) and the rest reflow (200 ms). Errors stay 10 s, information 6 s, and the timer pauses while the toast is hovered or holds focus. Errors sit in an always-present assertive region, information in a polite one.

### Dialog
« Tout éteindre » asks first: `--pop`, radius 18, the pop shadow, 22 px padding, at most 340 px; an h2 (16/600) « Tout éteindre ? », a 13 px muted line « Les radiateurs passent à l’arrêt. Vous pourrez les remettre en programme depuis Maison. », then « Annuler » (focused) and the danger button. It fades and settles from 8 px below (200 ms, `@starting-style`) and leaves faster (150 ms); the scrim is `--scrim` (black 60 %).

### Focus and announcements
- The focus ring is a 2 px ink outline at 2 px offset on every control; a chip whose native box is hidden shows it via `:has(:focus-visible)`.
- Focus is never dropped to `<body>`: any button that can become inert while it may hold focus (paused commands, a running command, bounds, busy forms) uses `aria-disabled` with a guarded handler instead of `disabled`, desktop room cards keep focus across navigation (`data-sveltekit-keepfocus`, one shared PiecesView for "/" and "/rooms/[id]"), and after any other navigation the new page's h1 takes focus. A skip link « Aller au contenu » comes first.
- Phones keep focused elements clear of the tab bar with `scroll-padding-bottom`.
- One app-level pair of live regions (`$lib/stores/announcer.svelte.ts`) carries announcements: command progress for commands sent from this browser (« … — envoi… », « … — confirmé », the failure assertively) and committed stepper values. Regions inserted with their text are not relied on.

### Raster provenance
`web/static/icon.svg` is hand-authored: a graphite tile with a heat-ramp sparkline and an ink now-marker (the strip in miniature). `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (56 px safe padding) and `apple-touch-icon.png` (180 px) are rendered from it on a bg ground by `web/scripts/icons.mjs` (`npm run icons`). Edit the SVG, then re-render; never edit the PNGs.

### Copy (French and English)
Rules for every string (the UX copy pass, both languages):
1. **Short and plain.** One idea per sentence; a hint ≤ 12 words, a label ≤ 6, a button ≤ 3. Verbs first on actions (« Partir », « Nouveau prix… », « Synchroniser »); buttons and links are infinitives in French (« Renseigner le tarif », « Ouvrir Linky »).
2. **Household words before device words.** No Overkiz internals in the glance (« Repos », « IOStack », « RSSI », « forçage », « dérogation »); they may appear in a Fiche or a Détails disclosure next to their plain name (« Signal (RSSI) »).
3. **Say what happens.** « Toutes les pièces passent à l’arrêt » over « Commande envoyée »; consequences after actions (« puis reprendront leur réglage »). An error says what happened, then what to do (« Cozytouch injoignable. Réessayez dans un instant. », « Connexion perdue : résultat inconnu. Vérifiez la pièce. »).
4. **One term per concept**, from `docs/glossary.md` (« Chauffe temporaire », « Hors ligne » / « En ligne », « Consommation de fond », Confort / Éco, heures creuses / pleines); a term never changes between a button, its sheet and its toast.
5. **Numbers through `$lib/format`**, units in captions and headers, « — » always with its reason.
6. **No instruction paragraphs** on screen: a gesture or keyboard hint is one muted line or a « Comment… ? » disclosure.
7. **English is not a translation of the French sentence shape**: en-GB, sentence case, contractions in sentences, “Off-peak” / “Peak”, never HC/HP.
Safety copy keeps its meaning through any rewrite: locked programme days, offline rooms, the Absence consequence, estimated vs measured. Backend error texts (`errors.py`) and the web French are kept equal (`codes.test.ts`); pending labels (`labels.py`) are also the Overkiz execution label pinned by the Sauter golden fixture, so the web rewords four of them from `label_code` instead.

French is the default; English is en-GB and follows `docs/glossary.md`. Every string lives in
`web/src/lib/i18n/{fr,en}.ts`; numbers, dates and units go through `$lib/format`, which follows
the active language. This file quotes the French copy; the English is the same key in `en.ts`.
French dates write the first of the month « 1er » (« le 1er janvier 2026 », « dim. 1er nov., 18:00 »: `premier()` in `$lib/format`); English stays “1 January 2026”.

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

The UI pairs include Infos / Details, En ligne / Online and Hors ligne / Offline (a radiator or a box device; « Injoignable » stays for Cozytouch itself), Dernier signal / Last signal, Intensité / Brightness, Appareils connectés / Signed-in devices, Déconnecter / Sign out, Alertes / Alerts, Masquer / Dismiss, Programme modifié ailleurs / Schedule changed elsewhere, Recharger / Reload, Remplacer quand même / Replace anyway (also in `docs/glossary.md`). An alert's text is composed in the web from its kind and params (`alert-text`), never by the backend.

Comparison bases are named in both (« sur 12 jours comparables » / “over 12 comparable days”). English never says “HC” or
“HP”: “Off-peak”, “Peak”. A label that would not fit in English is fixed in the layout, never by
shortening the French; the layout guards (no sideways scroll from 320 px) run in both languages.
The language is chosen per device: in Maison › Affichage › Langue or on Login, a stored choice
wins, else the browser's languages; `<html lang>` follows it from the first paint, and a switch
never reloads. URL paths are English in both languages (`/rooms`, `/schedule`, `/energy`,
`/home`). The PWA manifest is static and stays French.


## Do's and Don'ts

### Do
- **Do** use the tokens (`--s1`, `--r-widget`, `--t-state`…) and the kit; a new token joins `tokens.test.ts`.
- **Do** keep orange for heating only (decision 2); ink for actions; cool for Absence; bad for what must be fixed.
- **Do** show Tempo colours only when the price row in force is Tempo (decision 3), and only through `TempoDot`.
- **Do** make −/+ the primary setpoint control, from `primarySetpoint` (decision 4); the VSlider stays secondary.
- **Do** show every sent command dashed until the radiator reports it, then solid (`Settle`, `PendingEdge`); a
  failure plainly with « Réessayer ».
- **Do** keep 44 px hit areas, `aria-disabled` (never native `disabled` on a focusable control), skeletons at final
  heights, no sideways scroll from 320 px, CLS < 0.05, axe clean (`a11y.spec.ts`, `cls.spec.ts`, `layout.spec.ts`).
- **Do** put every exact figure behind a `Fig` with Provenance; « — » always with its reason; numbers through
  `$lib/format` (`fmtTempShort` for tile readings, `fmtKwhPrice` for the price per kWh).
- **Do** take every word from `fr.ts` and `en.ts` (glossary first); a chip's label and value are separate keys.

### Don't
- **Don't** add a light theme, a theme choice or a `prefers-color-scheme` rule.
- **Don't** colour text, a control or a chart series orange; don't draw HC/HP as round dots.
- **Don't** make an offline room red, or show a command as done because the API said so.
- **Don't** draw a missing value as zero; don't show « Chargement… » or an invented value before data.
- **Don't** use native `disabled` on a button that may hold focus; don't restyle `.btn` inside a component.
- **Don't** put `--fa` text on s2/s3 (it reads under 4.5:1 there); use `--mu`.

## Appendix: pre-Tableau screen components

The screens (Maison tableau, room sheet, Programme, Énergie, Réglages) are rebuilt by the Tableau screen batches.
Until each lands, its current components keep the behaviour described below (written before Tableau); their look
already follows the tokens above. Each screen batch replaces the entries it rebuilds.

#### Thermal Strip (signature)
The room's day on one line: an SVG sparkline of the measured temperature (2 px, round caps, stroked with the heat-ramp gradient so its colour at any height is the heat at that temperature) drawn only up to now, over the planned setpoint (1 px muted 3/3 dashed step, the legend's « Consigne »; at 70 % on cards). In programme mode the comfort periods appear as warm bands at 16 %. A 1 px ink **now-marker** (70 %) crosses the full height. The y-domain always includes 15–23 °C plus every known value, padded by 0.5 °C. A visually hidden sentence (range, latest reading, plan, pending request) describes it for screen readers. 32 px on room cards; 120 px in the room panel's chart. Window and presence runs (`events`) are drawn only in the panel chart, which has a legend; cards never draw marks without a key. (Programme no longer shows it: its « Aujourd’hui » preview read as a flat line and was removed.)
- **Axis** (`axis`, on the room panel's day view): 00 · 06 · 12 · 18 · 24 in micro faint, with the current Paris time at the now-marker in ink 600. A fixed tick within 9 % of the marker is dropped so labels never collide.
- **Pending path:** a requested manual target draws a dashed ink line (1.25 px, 4/3 dash) from now to the end of the day; a pending comfort setpoint redraws the rest of today's programme dashed, clipped to after now, with eco shifted by the same amount.
- **Confirmation:** when the pending value disappears and the radiator now reports exactly that value, the path is held 250 ms and its dash closes to solid. If the reported value differs, it simply disappears. The same rule (`$lib/settle.svelte.ts`) drives every control below.
- Reused on room cards and the inspector. Énergie's Température et chauffe draws a room's day with the same heat-ramp line and muted setpoint, at its own scale.

#### ModeSwitch
A three-way radiogroup (Arrêt / Manuel / Programme, "Prog." when compact) in a 40 px well (8 px radius, 1 px inset, 2 px gap). Segments are 36 px tall (6 px radius, concentric) with a 44 px hit area (`.hit`), 13 px 600 muted (ink on hover); the current segment is s2 with ink text and a muted edge (3:1 against the well). That edge is the signature mark (PendingEdge, an SVG rect): dashed while the mode is requested, closing solid when the radiator reports it. While pending the group is `aria-busy` and the segment is named « Manuel (en attente) ». Keyboard is **manual activation**, because a mode is a device command: roving tabindex (the current mode is the tab stop), arrows only move focus (wrapping), and Enter/Space sends. Choosing the current mode again sends nothing. Transitions 160 ms ease.

#### CommandSwitch
The mode switch's look and behaviour for any device command with a few values (Plan 12): a pilot-wire heater's « Allure » (Confort, Confort −1, Confort −2, Éco, Hors-gel, Arrêt; 2 or 3 per row, six as 3 + 3, four as 2 + 2) and a towel dryer's « Normal | Boost | Séchage ». Same well, 36 px segments (44 px hit) and 13 px 600 labels; rows of segments sit 8 px apart so the hit areas never overlap. Manual activation (arrows move focus, Enter/Space sends), the dashed → solid edge (PendingEdge) while the device has not reported the value, nothing checked when the reported value is unknown (the fact reads « — »). Only the values the device allows are offered.

#### Support chip
How far Kelvin vouches for a device (Plan 12): 11 px / 600, `--mu` text, 1 px `--line` border, radius 6 px, beside the radiator's or device's name. « Devrait fonctionner », « Expérimental », « Lecture seule » (on `--s2`); none for tested hardware. A read-only radiator shows the chip and one muted line saying Kelvin does not drive it, then its facts; no control. A control a radiator cannot take is absent, never shown disabled.

#### PendingTag
Inline 12 px status after a command: "Envoi…" (muted, with an 8 px dashed spinning dot), "Confirmé" (ok, its check drawing itself in 250 ms), or the error in bad with a ghost "Réessayer" and a 44 px dismiss button. States cross-fade in one cell (160 ms in, 150–200 ms out). The tag is visual: screen readers hear the progress from the app announcer (below).

#### RoomCard
s1 card, hairline, 10 px, 12 × 14 px padding; the whole card is one link (the name's link stretched over it, `aria-label` one sentence: « Salon, 21,4 °C, Programme · Confort jusqu’à 23:00, consigne 21,0 °C, En chauffe »). Grid: name (15/600) with « ● En chauffe » (12 px warm, 6 px warm dot, only while a radiator that answers has a working rate above 0 and the room is not off) and, when some radiators are offline, a muted plug-off glyph and « 1 radiateur sur 2 hors ligne »; the reading (26/600 **ink**, tabular, the mean of the radiators that answer) on the right. Second row: the status sentence (13 px, from `roomStatus()` in `$lib/status.ts`: its lead in its tone — ink, muted for Arrêt/Hors ligne/mixed, warm « Chauffe temporaire », cool « Absence », bad « Fenêtre ouverte » with the window glyph — then « · » and the rest in ink) and « consigne 21,0 °C » (13 px muted, hidden when Off, window open or unknown). A pending request shows the **requested** sentence underlined with the shared dashed mark, closing solid when the radiators report it; the PendingTag takes the target's place while a command is on its way, confirmed or failed (its buttons sit above the link). The status cross-fades (160 ms) when it changes; the reading dips and returns (400 ms). Then the 32 px strip. Heights are fixed whatever the state: the status reserves one 20 px line on a wide card, two below 420 px of list width (a container query), so a new sentence never moves the list (≈ 116 px, ≈ 136 px). Desktop keeps focus and scroll across the navigation, `aria-current="page"` for the room in the inspector (border muted). Hover firms the edge, press deepens the tone. Loading: three skeletons at those heights.
- **Offline card** (every radiator `reachable === false`): compact (≈ 64 px), name at 80 % ink, « Hors ligne depuis 14:32 » (« depuis le 2 oct. » another day, « Hors ligne » when unknown) · « Radiateur hors tension ou hors de portée » (on its own line below 420 px) in muted, a 20 px plug-off glyph. No temperature, no strip, no target, never red; a command still in flight (or failed) keeps its PendingTag under the sentence.
- **Room list:** Cozytouch order, except offline rooms, which move to the end under a section label « Hors ligne · 2 » with a hairline to its right. The page summary reads « 1 pièce en chauffe · 2 hors ligne » (« Aucune pièce en chauffe »; the offline part only when there are some), « · Absence en cours » when relevant; one line, ellipsised, so the header never reflows. On a phone the house actions are two 44 px bordered icon buttons (power, away; their names as labels) on the title row: one row in any language or font.

#### RoomInspector (room panel)
The desktop right column (s1 panel, 16 px padding, `clamp(320px, 38 %, 440px)`, internal scroll) and the phone room page; its content cross-fades (160 ms) on a room change. Sections in order, each opening with a hairline and a section label:
1. **Header:** name (h2 at 20 px in the column; h1 at 22 px on the phone page), the status sentence (14 px, `roomStatus()`, dashed while a request is pending) and a 12 px line with « ● En chauffe », « Présence détectée » (only when true: never « Présence : — ») and the partial-offline count; on the right the reading (32/600 ink; it arrives from the tapped card in a view transition) over « consigne 21,0 °C ». **Offline** (every radiator unreachable): no reading; the **OfflineNotice** instead (s2 at 60 % over s1, hairline, plug-off glyph, `role="status"`, never red): « Radiateur hors tension ou hors de portée » (14/600), « Les commandes reprendront quand il sera rallumé. » (muted) and « Dernière mesure : 23,6 °C à 14:31 » (the last history point before the radiators went offline, else their last report with its time; left out when the time is unknown).
2. **Notices:** an open window (bad tint, window glyph, « Fenêtre ouverte, signalée par le radiateur : la pièce perd sa chaleur. »), the PendingTag (Envoi… / Confirmé / failure with Réessayer).
3. **Réglage:** ModeSwitch (or « Arrêt » for pilot-wire rooms); Manuel → « Consigne » stepper; in every mode but Arrêt the « Confort » stepper and the « Éco » stepper, which shows the **absolute** eco (comfort − lowering) with the caption « 3,0 °C sous le confort » and still sends the lowering; in Programme a ghost « Modifier les horaires › » to `/schedule?room=…`. Partial-capability and mixed notes as before. Offline: the controls are `aria-disabled` and a muted « Dernier mode connu : Programme · confort 20,0 °C, éco 17,0 °C. ».
4. **Chauffe temporaire** (rooms with boost, not offline): a 44 px disclosure row (`aria-expanded`, chevron, muted « ex. 21,0 °C pendant 2 h »), sliding open over 220 ms: « Chauffer à [stepper] pendant [1 h · 2 h · 4 h · 8 h] », then the consequence (« Puis retour au programme vers 21:45. », « Puis retour au mode manuel, 19,0 °C. ») and the primary « Lancer ». Active: « 22,0 °C jusqu’à 21:45 » and « Arrêter ».
5. **Aujourd’hui / Historique** (the title follows the range): Segmented 24 h · 7 j · 30 j over a 120 px strip with a 28 px scale gutter (top and bottom whole degrees, 11 px faint), the hour axis on 24 h, window and presence runs, a muted « Mesures depuis 14:05 » inside the chart when recording began over an hour into the range; offline, the curve stops when the radiators went offline. Then the legend as real text, listing only what is drawn: Température (ramp line), Consigne (dashed muted), Confort (warm wash), Fenêtre ouverte (hatch), Présence (neutral fill), « relevé toutes les 5 min » when runs show.
6. **Énergie aujourd’hui / sur 7 j / sur 30 j** (RoomFigures): a two-column grid of Consommation, Coût (énergie), Heures de chauffe (« à pleine puissance ») and, on the 24 h range only, « Part du temps en chauffe ». The 24 h range is **today since midnight** for every figure: kWh, € and hours from `/rooms/{id}/energy?days=1`, the share from `/rooms/duty?since=<midnight>`, so one block never mixes two windows. Heating hours are unknown (« — ») while the meters have no reading, with one line saying so (« Consommation et heures de chauffe : pas encore de relevé de compteur aujourd’hui. »), never a measured-looking « 0,0 h »; every value unknown → one sentence (« Pas encore assez de relevés depuis minuit. »).
7. **Radiateurs · n:** one RadiatorPanel disclosure row per radiator.
In the desktop column, once the header scrolls out, a compact bar (s1, bottom hairline, name 15/700 and the reading 17/600, or the muted status when offline) fades in at the panel's top: a zero-height sticky layer, so nothing moves. The status sentence's dashed mark (card and panel) is settled on the requested values, not on the sentence's text: a comfort change that reads the same closes solid only when the radiators report it, and a failure never plays the morph.
Before the house is known it shows its skeleton (title bar and three section blocks), never « Pièce introuvable ».

A room control appears when at least one radiator takes it, with « S’applique à n radiateurs sur N » (12 px, muted) when it reaches only some of them; a room Kelvin drives nothing in says so in one muted line (« Kelvin ne pilote aucun appareil de cette pièce. »). A room of pilot-wire heaters only gets a secondary « Arrêt » instead of the mode switch.

#### RadiatorPanel
One per radiator in the room panel, separated by hairlines, as a disclosure: the row (an h4 holding a 52 px button, `aria-expanded`) shows the name (14/600; the model and power when it has no name of its own), a 12 px muted line (power when named, « En ligne » or « Hors ligne depuis 14:32 », never red; with « Détails techniques » also the raw « RSSI n » and « dernier signal il y a 3 min » inline), the reading in ink (« — » muted when offline) and a turning chevron. Open (slide 220 ms): the facts list, the **Infos** section (modèle, puissance, niveau de signal as the raw « RSSI n » with its scale marked unverified, connexion, dernier signal, each « — » when unknown), the level or dryer switch, the mode switch and setpoint when the room has several radiators, the toggles (fenêtre ouverte, présence, veilleuse and its slider), and ghost « Renommer » (pencil) and « Faire clignoter » buttons. An offline radiator's commands are `aria-disabled` (its slider hidden) under « Les commandes reprendront quand il sera rallumé. ».

#### Programme page (week + one day)
The week is a picture, the day is the form. Under the h1 and the room picker:
- **Temperatures row:** `[swatch] Confort 21,0 °C · [swatch] Éco 18,0 °C` (14 px, values 600 tabular; the comfort swatch is the block colour, the eco swatch the empty well with its field-line edge) and a muted « Modifier les températures › » link to the room. An offline room says « derniers connus » instead of the link.
- **Plan line** (13 px muted): « Maintenant : Confort · 23:00 → Éco » (`fmtNow` in `$lib/program`: the level now, then the next change, « demain 06:15 » or « lundi 06:15 » when it is not today; « Éco, sans changement cette semaine » when nothing changes; a room not in programme mode says the programme applies in Programme mode), the one-line rule « Hors des plages confort, la pièce est en éco. » and a « Comment modifier ? » inline Disclosure (dotted underline, help glyph, `aria-expanded`, its answer on the next line, sliding over `dur(T.enter)`, findable while closed) holding the gestures and keys. No paragraph, no midnight note, no « Aujourd’hui » chart.
- **Layout:** desktop (≥ 1024 px) is the week (fluid) beside the day editor column (`clamp(320px, 38 %, 440px)`, sticky at 16 px, today selected by default) with the send area under the editor. A phone shows the week; a row opens the day view (`?day=monday`, the day name becomes the h1, « ← Semaine · Salon » goes back, the temperatures sit left-aligned under the day header, above the bar). `?room=` opens a room (the room panel's « Modifier les horaires »). Moving between week and day stays on the page, so unsent edits are kept and nothing asks.

#### WeekOverview
A s1 panel (hairline, 10 px) with an hour scale and seven rows. It is a container (`container-type: inline-size`): at 560 px and wider a row is `92 px | bar | 176 px` (day name with « aujourd’hui » under it; a 28 px bar; the times right-aligned, two periods per line at most) and the scale is 00 · 03 · … · 24 with matching gridlines every 3 h; narrower (a phone, a small desktop column) the name and times share the first line, a 24 px bar sits under them and the scale is every 6 h. The bar is the editor's well (in, field-line edge, 6 px) with 35 % field-line gridlines, comfort blocks warm at 75 % (4 px), the 2 px ink now-marker on today. An edited, unsent day carries « ● modifié » (ink, 12 px 600) above its times. A locked day is hatched (its blocks warm at 45 %) with its reason on its own 12 px muted line with the lock glyph; an unrecognised day draws no block. Each row is a button named as a sentence (« Jeudi, aujourd’hui, 06:30–08:00 et 17:00–23:00, 7 h 30 confort, modifié »); beside the editor the selected row is `aria-pressed` (s2, muted inset edge), a roving tab stop, and the arrows (Home/End) move and select; on a phone the arrows move focus and a tap opens the day. An offline room's week is read-only: rows are plain, each with its sentence as hidden text. While a send is pending the blocks are dashed muted outlines.

#### DayEditor
The one day being edited: a s1 panel (on a phone, the page itself). Header: 36 px edged « Jour précédent » / « Jour suivant » icon buttons (44 px hit) around the day name (h2, 20 px 700; h1 in the phone day view) and a reserved 12 px muted line « aujourd’hui · modifié ». Then the ProgramDay bar, the periods as rows « [swatch] Plage 1 [06:30] → [08:00] [×] » (36 px time fields as wide as « 22:00 » (`--w-time`, shrinking a little on the narrowest phones), the remove button a 36 px `.btn-icon` with a 44 px hit; one period per line from 320 px; the phone shows the number only), the summary « **Confort 8 h** · éco le reste du temps » (or « Éco toute la journée »), validation errors (bad, `role="alert"`), and « Ajouter une plage » + « Copier vers… » (`.btn-sm`). At three periods « Ajouter une plage » is `aria-disabled` and described by « 3 plages au maximum ». While a send is pending the fields stay focusable but are `readonly` + `aria-disabled` and every handler is guarded. A locked day shows its hatched bar, its periods as text and its reason; no field, no add, no copy.

#### ProgramDay
The editor's bar: 48 px well (field-line edge, 10 px) with gridlines and hour labels under it every 3 h (6 h on a phone), comfort blocks (warm at 75 %, 6 px) that drag and resize by edge handles with a wider invisible grip; the grips (3 × 16 px dark marks) show on the hovered, focused or dragged block. A block wide enough (≥ 76 px) writes its times inside in 11 px 600 dark ink, on a halo of the block's fill above the now-marker, so the marker never cuts them. A tap on the empty bar adds a period there. Blocks are `aria-roledescription="plage"` with a hidden hint (arrows move by 15 min, Suppr removes). The page does not scroll under a finger while a block is dragged. While pending, blocks become dashed muted outlines and lock.

#### Offline room (Programme)
A calm notice, never red: s2 at 60 %, hairline, the plug-off glyph, « Chambre 2 est hors ligne » (14 px 600 ink) and « Le programme affiché est le dernier connu. Il pourra être modifié quand le radiateur sera rallumé. » (13 px muted), `role="status"`. The picker suffixes the room « hors ligne ». The week stays visible read-only; no editor, no Envoyer.

#### Alert callout
A calm notice on the screen it concerns: s1, hairline, 10 px, 13 px text, an alert glyph; bad alerts take the bad tint (8 % over s1, 60 % edge) and are an `alert` region, others a `status`. `radiator_unreachable` is always drawn neutral (a `status`), whatever its backend severity: an offline radiator is not a fault here; it shows in Home only (the room panel's offline notice says it there). A 44 px « Masquer » icon button ends the row. Never stacked more than the screen's own kinds (Énergie and the room); Home lists them all (`#alerts`). The callouts and the list hold their space while loading, so they never shift the layout (CLS ≤ 0.0003 measured).

#### Night-light slider
Under « Veilleuse » while it is on: « Intensité » and the value on one line, a native range (44 px), 1 % then steps of 5 %, keyboard ±5, PageUp/PageDown ±25, Home/End to 1 % and 100 %; sent 600 ms after the last move; the thumb is dashed until the radiator reports the value. Paused with `aria-disabled` (no pointer events), never `disabled`.

#### Strip bands
Window open: a neutral 45° hatch; presence: a 10 % neutral fill; both under the comfort wash, with their exact times in a title and their counts in the text equivalent. They are what the radiators reported, edges ±5 min: reports, not heat, so never a heat hue.

#### Locked programme day
A hatched bar (its blocks warm at 45 %) for a day Kelvin cannot edit, with its reason on its own 12 px muted line and the lock glyph, in the week and in the day editor; a midnight end shows its periods as text (« 20:00–24:00 »); an unrecognised day draws no block. No handles, inputs, add or copy; copies never land on it. The day stays exactly as the radiator has it.

#### Conflict notice
Shown when a send answers `program_changed_elsewhere` (« Programme modifié ailleurs »): bad tint, the two choices « Recharger » and « Remplacer quand même » (danger).

#### Signed-in devices
Rows of 56 px: the device in 600, « dernière activité … » muted; « Déconnecter » per row (none on « cet appareil »); « Déconnecter les autres appareils » asks in the Dialog. The panel lives in Maison › Compte (`/home/account#sessions`).

#### MCP access
Maison › Compte, after the signed-in devices (`/home/account#mcp`, `McpPanel`): a 13 px muted lead (« Un assistant IA … peut lire les données de Kelvin avec un jeton. Il ne peut rien modifier. »), token rows of 56 px (name 600 with its last four characters in 12 px muted tabular figures, « créé le … · dernier appel il y a 2 min » muted; a revoked token stays 90 days, muted, without actions), each with a « ⋯ » Menu « Actions pour Claude » holding « Révoquer » (danger), which asks in the Dialog (« Révoquer « Claude » ? », Annuler focused). Under them « Nom du jeton » (`.w-text`, placeholder « Claude ») and « Créer un jeton ». The secret is shown once, in a wider Dialog (at most 560 px): the token, then the Claude Code command and the Claude Desktop JSON, each in an s2 hairline block (12 px tabular, wrapping, never scrolling sideways) with its « Copier » (`.btn-sm`, « Copié » once done), closed by the primary « J’ai copié le jeton »; closing it drops the secret from the page. « Derniers appels » is a Disclosure (L2, `detail`). With `KELVIN_MCP=false` the panel says « L’accès MCP est désactivé sur ce serveur. » and offers nothing. The section appears once the devices are known and « Se déconnecter » once the tokens are, so neither list moves what is below it (CLS).

#### Pièces et appareils (`/home/devices`)
UX batch 10. Back « ‹ Maison », h1, the 13 px muted lead « Vos pièces telles que Cozytouch les connaît : un changement ici s’applique aussi dans l’application Cozytouch. » (on an experimental server « Lu dans votre installation … » and « lecture seule sur ce serveur » under it). « Nouvelle pièce » (`.btn` with plus) sits in the PageHeader on desktop and full width under the lead on a phone; it opens the name form above the rooms. **Sync line** (`SyncLine`): Freshness + « Synchronisé avec Cozytouch il y a 1 min » as a Fig (Fiche: « Dernière synchronisation »; notes: « Synchronisations : 1 sur 3 en 24 h », the daily time, the spent reason, what a sync does) and a ghost « Synchroniser » (sync glyph spinning while it runs; `aria-disabled` with « possible à 14:30 » beside it when the budget is spent); a change made in the Cozytouch app and not read yet is said under it. **Room blocks** (s1 panels, 4 × 14 px padding, hairline rows): a 52 px header, name 15/600 + « 2 radiateurs » 12 muted, and the room's « ⋯ » Menu named « Actions pour Salon » (Renommer la pièce; Supprimer la pièce in bad, `aria-disabled` with « Videz d’abord la pièce » / « Pièce protégée par Cozytouch » / « Une modification est en cours »); none for the house root or on an experimental server. Two radiators sharing a shown name: a 12 px muted line with the help glyph « Deux radiateurs portent le même nom : renommez-les pour les distinguer. » and a ghost « Renommer » (the only text button inside a room block). **Radiator rows** (56 px): name 14/600 (via `radiatorName`, support chip when not tested) over « HEKLA P · 1 500 W · En ligne » (« Hors ligne depuis 14:32 »), and a « ⋯ » Menu « Actions pour Radiateur (HEKLA P) »: Renommer, Déplacer vers… (reason « Aucune autre pièce »), Faire clignoter (only when the radiator can identify; reasons offline / Kelvin not connected), then « Voir les appareils (6) » / « Masquer les appareils », which shows the sub-devices (DeviceRow unchanged, its raw states in its own details) under the row, indented by a hairline; a radiator with a misplaced device starts open. Rename forms and PendingTags sit under their row; the dialogs (MoveDialog, DeleteRoomDialog) are unchanged and opened from the menus. **Box et pont Cozytouch** and **Autres appareils** (read-only note) use `BridgeRow`: the household name (« Box Cozytouch », « Pont radio (io-homecontrol) », « Wi-Fi de la box », `bridgeName`; an appliance its label with its role) over the state in words (« En ligne », « Hors ligne » in bad, « — non signalé par la box »), the row a button opening the raw device below it (`hidden="until-found"`, open with « Détails techniques »). Loading: a 44 px sync-line skeleton and three room skeletons; on an error « Réessayer ».

#### EnergyBars
Stacked SVG bars, drawn at the measured width and a fixed 160 px height (so a phone keeps tall bars and true corners); bars grow from the baseline (360 ms, 12 ms stagger capped at 180 ms) on first draw and on each period change, one series colour per part (2 px corners; HC hatched over its blue, a 1 px knockout between stacked parts), hairline grid at four ticks, micro faint axis labels thinned so each keeps 44 px. The radiators are an **overlay mark**: a 2.5 px round-capped line across the bar at its value, in series-3, over a 4 px s1 knockout so it reads on any bar; the y-scale includes it. Missing parts are never drawn as zero: an interior bucket with no data (data on both sides) gets a faint 2 px dashed (3/3) baseline tick; leading and trailing empties stay blank. With `details` the bars are inspectable: the whole plot is the hit area and the nearest bar wins; a mouse hover shows its ChartInspector, a click or tap pins it, a second tap unpins; while a bar is pinned, hovering another only gives it a muted outline and the card stays. A horizontal touch swipe of 48 px (at least twice its vertical travel) steps the period instead. Each bar has an invisible full-height button in a roving-tabindex group (« Barres du graphique : … ») whose name carries its values: `←`/`→`/`Home`/`End` move and pin, `Enter` drills down (a month opens Mois, a day its Courbe, another day of Jour its own Jour) or, with nothing to drill, pins the bar, and `Esc` clears; Esc inside the card closes it and puts focus back on its bar. The inspected bar takes a 1 px ink outline, never animated. No SVG `<title>`. Empty: « Pas encore de données. » The legend below uses `Swatch`: 10 px squares (3 px radius, HC hatched) for stacked series and a 14 × 2 px line for the radiator mark.

#### CurveChart
One day of half-hours (46, 48 or 50) at the measured width and a fixed 140 px height, 1 px-rounded bars with 15 % inner padding, split HC (`--hc` hatched, at the base) under HP (`--hp`) by their off-peak fraction, a 1 px knockout between them, or the single home series without a tariff. The radiators are a 2 px series-3 step line over a 4 px s1 knockout, broken where a half-hour is unknown; the subscribed power (kVA × 1000 × 0.5 Wh) is a faint 1 px dashed line when it is within 2× the data, else a muted sentence states it. Axis 00 · 06 · 12 · 18 on the matching half-hours (so DST days stay true), then 24 at the right edge, micro faint. A 1 px ink crosshair marks the scrubbed half-hour (see Scrubber).
- **Readout:** a fixed row above the chart, so nothing covers the bars: « 18:30–19:00 » (the repeated autumn hour says « (heure d’été) » / « (heure d’hiver) »), then Puissance moyenne, Énergie, Tarif, Prix, Coût, Radiateurs, Reste, Température, as the day has them. Its fields are fixed for the day and read « — » with their reason where a half-hour lacks a value. It **never reflows**: every text a field takes over the day (idle included) is stacked in one grid cell and only the current one is visible, so the browser sizes each field to its widest and tallest text in the real font, at any zoom, and scrubbing moves nothing.
- Empty: « Pas de courbe pour ce jour. »

#### Chart data tables
Every chart is a `role="img"` SVG with an aria-label, followed by a table inside `<div class="visually-hidden">` with the same caption, one row per bucket or interval and one column per inspector or readout row (in the inspector's order), « est. » kept after an estimate and « — » (with its reason) in any missing cell. The wrapper matters: a table cannot be narrower or shorter than its rows, so a table that is itself visually hidden widened the page at 320 px and left an empty tail under Énergie.

#### ChartInspector
The exact values behind a mark: the chart placement of the **Fiche** (below), drawn through the same row renderer (`FicheBody`), with an optional Provenance block. `$lib/inspector.ts` builds the rows, and the card, the sheet, the hidden table and the announcement all read the same rows, so they cannot disagree. Desktop: a 260 px **card**, s2 with a hairline and the 10 px radius, flat (no shadow), placed beside the bar and flipped to its left near the right edge (centred and clamped when neither side fits), never outside the chart; it takes the pointer only when pinned, so its action can be clicked. Phone: a **sheet** docked under its chart (the hero's at the hero's end), so nothing above it moves. A 13 px 600 title, then label / value rows (muted label left, tabular value right, « dont … » rows indented 10 px); a row is omitted when its source does not apply, but a value the reader expects (the radiators in a home that has them, a cost) reads « — » with its reason under it in 12 px muted. A 12 px muted « est. » follows an estimate, then the notes, and a footnote linking « est. » to Qualité des données; an optional `.btn-sm` action (« Voir la courbe du 13/10 »). Esc inside closes it and gives focus back to what opened it.
- **Motion:** the card fades in over `dur(T.state)` (160 ms) and the sheet slides open over `dur(T.enter)` (220 ms), both `|global` transitions: the host mounts the inspector inside its own `{#if}`, and a local transition would not play there. Under reduced motion `dur()` is 0: it appears and leaves at once.

#### Maison overview (`/home`)
An overview, not a form (UX batch 8). PageHeader « Maison » with its state line (« Tout va bien » | « 2 alertes · Absence jusqu’à dim. 18:00 ») and, on desktop, « Partir en absence… » (« Absence · dim. 18:00 » in cool while one runs). Then:
- **En ce moment** (panel, 12 px section label): one row per override, a 16 px glyph (away in cool, flame in warm), « **Absence** · 12,0 °C jusqu’à dim. 18:00 » / « **Chauffe temporaire** · Salon · 22,0 °C jusqu’à 21:45 » with a 12 px muted second line (« toutes les pièces · Chambre 2 hors ligne », « puis retour au réglage d’avant », « Rétablissement en cours… ») and a `.btn-sm` « Terminer » / « Arrêter » (named « Terminer l’absence », « Arrêter la chauffe temporaire : Salon »); none: « Tout suit son réglage habituel. ». Quick actions below (HouseActions): desktop « Tout remettre en programme », « Tout éteindre »; phone full-width rows « Partir en absence… », « Tout remettre en programme », « Tout éteindre ».
- **Alertes** only when there are some (or their load failed); never « Aucune alerte » on the overview.
- **Section cards** (HomeCard) in a grid of two columns from 720 px of container (max 1080 px): Pièces et appareils (« 3 pièces · 4 radiateurs », « 1 hors ligne », « lecture seule sur ce serveur » on an experimental server, the Cozytouch SourceLine), Tarif (« HC/HP · 9 kVA · 15,00 €/mois », the prices with their swatches, a compact HoursBar; « Pas encore de tarif »), Linky (state with its Freshness ring; « Non relié · reliez-le pour la consommation de la maison »), Sources de données (« Tout est à jour » | « 1 source en retard », a ring per source), Compte (email, « Sauter Cozytouch · 2 appareils connectés »), and **Affichage** (not a link: Langue, « Afficher les détails techniques »; no Thème since Tableau). A card whose summary failed says « Indisponible pour le moment ».
- Version footer « Kelvin 0.1.0 » (mono 12 muted, centred).
Below 720 px of container the five cards become one grouped panel of 64 px rows (title 15/600, one ellipsised summary line, chevron), Affichage its own panel. Old anchors: `/home#tariff` → `/home/tariff`, `#linky` → `/home/linky`, `#sessions` → `/home/account#sessions` (replacing the history entry), `#away` opens the Absence sheet on the overview, `#alerts` stays (`homeAnchor` in `paths.ts`).

#### HomeCard
s1, hairline, radius 10, 14 px padding, min-height 132 px; title 15/600 + chevron, 13 px lines, the SourceLine at the bottom above the stretched link. The whole card is the title's link (`::after` inset 0); its name is « Tarif, HC/HP · 9 kVA · 15,00 €/mois ». Hover firms the edge to faint, press is s2, focus rings the card. The title carries `view-transition-name: home-<section>` and travels into the sub-page's h1. List form: see Maison overview.

#### AwaySheet (« Partir en absence »)
One sheet, mounted in the layout, opened from wherever the user is (`awaySheet.show(trigger)`): the sidebar « Absence… », the phone Pièces header icon, Maison, `/home#away`. ChoiceSheet: a bottom sheet below 1024 px, the centred dialog above; focus starts on the selected preset and returns to the opener. Content: the 13 px muted lead « Toutes les pièces baissent, puis reprennent leur réglage. »; « Jusqu’à (heure de Paris) » with three 36 px chips (44 px hit, `aria-pressed`): « Demain 18:00 », « Dimanche 18:00 » (the coming Sunday; next week's once today's is less than 15 min away), « Date précise… » (reveals a `datetime-local`, `min` now + 15 min). Default « Dimanche » from Thursday 14:00 to Sunday 12:00, else « Demain » (`awayPresets(now)`, Paris time). Température: Stepper 7–19 °C (12 °C) with « hors-gel à partir de 7 °C ». The consequence sentence (`aria-live`): « Les 3 pièces passeront à 12,0 °C jusqu’à dim. 18 oct. 18:00, puis reprendront leur réglage. », the rooms counted from the radiators that take a temperature, and a muted line per offline room « Chambre 2 est hors ligne : elle ne recevra peut-être pas la consigne. ». Then « Partir » (`.btn-lg` primary, full width; paused with « En attente de la connexion à Kelvin. » while Kelvin is not connected) and « Annuler » (ghost). Sent through the house command path (the sidebar PendingTag shows « Envoi… »); the sheet closes and a toast « Absence jusqu’à dim. 18 oct. 18:00. » offers « Annuler l’absence ». While an absence runs the sheet is « Absence en cours »: « Absence jusqu’à … · 12,0 °C », « Prolonger… » (the presets again, primary « Prolonger ») and « Terminer maintenant ». The sidebar button reads « Absence · dim. 18:00 » in cool; the phone header icon gains a 4 px cool dot.

#### HoursBar
The off-peak hours on a 24 h bar (tariff, never warm): 16 px (10 px compact, on the Maison card), radius 4, the rest of the day solid `--hp` (dark blue), each off-peak block `--hc` with the hatch (a slot past midnight is two blocks); scale 00 · 06 · 12 · 18 · 24 in 11 px faint below (not in the compact form). An image named by the hours in words (« Heures creuses : 22:00–06:00 »), which are always written beside it.

#### Tarif page (`/home/tariff`, TariffSummary)
Back « ‹ Maison », h1 « Tarif », state line « Option Heures creuses / pleines depuis le 15 janvier 2025 ». Enedis notices (a price change, new off-peak hours) sit above as AlertCallouts; their link opens the editor. **Tarif en vigueur** (panel) reads the tariff with no input on screen: label / value rows of 40 px (13 px muted label, 600 tabular value, hairlines) — Option, Puissance souscrite, Abonnement « 15,00 €/mois », the prices (Base: « Prix du kWh »; HC/HP: « Heures creuses » and « Heures pleines », each label led by its 8 px tariff swatch; Tempo: a 3 × 2 table, the colour's TempoDot and name per row, the HC / HP swatches in the header, « €/kWh » under it), then « Heures creuses 22:00–06:00 » over a HoursBar (one per season, its months after the label; Tempo: its hours). Under it, primary « Nouveau prix… » and ghost « Corriger le tarif en vigueur ». Either opens the TariffForm in place of the panel body (title « Nouveau prix » / « Corriger le tarif en vigueur », « Enregistrer le tarif » and « Annuler »). Saved: the editor closes, the changed rows pulse once (opacity 1 → .55 → 1, 700 ms; none under reduced motion) and « Tarif enregistré. » (ok) shows beside the panel title for 6 s. No tariff yet: the editor is the page (no « Annuler »), the state line « Pas encore de tarif : … ».

#### Linky page (`/home/linky`)
State line: the Freshness mark and « Relié · données jusqu’au 14/10 · synchro il y a 5 min ». **Connexion** (panel, only once connected): PDL shown masked « •••• •••• ••12 34 » with a text button « Afficher » / « Masquer » (named « Afficher le PDL »): the full PDL is never in the page before it, the form included; Jeton « Enregistré » / « Non enregistré »; « Appels MyElectricalData » as a Fig « 10 appels sur 14 aujourd’hui » (Fiche: today, daily limit, reset at midnight Paris, provenance Linky); the consent date; the simulator note. A token problem is a bad line at the top. **Modifier la connexion** (Disclosure, open when Linky is not connected) holds LinkyPanel's form, rendered only while open.

#### Compte page (`/home/account`)
No state line (the email is the first row). **Compte Cozytouch**: Email, Serveur (« Sauter Cozytouch », the support chip when experimental, and 12 px muted « Fixé à la première connexion. »: one line at 320 px in any font), Connexion (the Cozytouch SourceLine with its Fiche, and the last error in words). **Appareils connectés** (`#sessions`, SessionsPanel). « Se déconnecter » (`.btn`) last, on its own, rendered once the devices list (or its error) is known so the list's height never moves it; every line above it fits one line at 320 px whatever the font (CLS with late fonts). The future « Accès MCP » panel goes between « Appareils connectés » and « Se déconnecter ».

#### Linky status wording
One status, three places (Énergie's source line and callout, the Maison card and the Linky page), from `$lib/linky.ts`. On Énergie progress is the source line's words and dashed ring, never a callout. Progress is neutral and offers no link, because there is nothing to fix: never synced (« première synchronisation en attente »), quota (« historique en cours, la suite demain ») and throttled (« Enedis limite les requêtes, nouvel essai à 14:30 ») read as plain or muted text. Only `auth` (« MyElectricalData refuse le jeton Linky. » with « Renouveler le jeton ») and `error` (with « Ouvrir Linky ») use the bad colour and an alert role. Not connected at all is a neutral invitation (« Reliez votre compteur Linky », « Relier le Linky »). In the panel the good state reads « Relié · données jusqu’au 13/10 · synchro il y a 5 min ».

#### Form fields
A field is a label wrapping its control: a 12 px muted caption, 4 px, then a 36 px well (`--ctl-h`; in, field-line edge, 8 px, 0 × 10 px padding; owner ruling: fields were « gros ») set in 15 px body with tabular figures, 16 px below 1024 px so iOS never zooms on focus (`--fs-field`). The base style is global in `app.css`; components add only layout. Selects share the input's exact geometry. Placeholders are muted (never the browser grey) and never carry the only instruction: a hint is a 12 px muted caption under the field, linked with `aria-describedby` (Linky: « Enregistré », then « Laissez vide pour garder le jeton. »). An invalid field is `aria-invalid`, edged in bad, linked to its error and focused. Units live in the caption, never in the field: « Abonnement (€/mois) », « Prix heures creuses (€/kWh) ». Decimal fields accept a comma or a point. **Width is intrinsic**, never a stretched column for a short value: time fields `--w-time` (6.5 rem), dates `--w-date` (10 rem), prices `.w-price` (7.5 rem), kVA `.w-kva` (8 rem), text fields `.w-text` (`min(100 %, 22 rem)`), the PDL 14 digits; groups wrap (`flex-wrap`, 12 px × 16 px gaps) instead of grid columns. The caption wraps the field, so the tap area is caption plus field. A repeated group (Heures creuses slots) sits in a hairline-topped fieldset whose legend is a section label, with each slot on one line « [22:00] → [06:00] [Retirer] » (the captions « Début / Fin de la plage n » stay as the fields' hidden names) and a ghost « Ajouter une plage ». Errors follow in 13 px bad (alert), success in 13 px ok (status), then one primary button, left-aligned.

#### Grid strip
One 13 px line under the page header on Rooms (Énergie uses the GridChips of its context row, see Énergie), wrapping on a phone: the Tempo pair « Aujourd’hui : ● Bleu · Demain : ● Rouge » (only while the price row in force is Tempo; « Demain : couleur pas encore publiée (vers 11:00) » before publication, « couleur inconnue » when a day has none), then « EcoWatt orange demain, 18:00–20:00 » with the alert glyph (muted; red in State Red; the hours dated by their own timestamps), then the muted source « RTE via MyElectricalData · 11:20 ». Nothing when there is nothing to say (EcoWatt green, no Tempo). It arrives with the snapshot and is updated by the SSE `grid` event. Its height is known only then, so no skeleton can hold it: on Rooms the skeleton columns are replaced as a whole by the loaded ones, strip included, in one frame; on Energy it waits for the report. Either way it never shifts the page (`layout.spec.ts` measures `/` under HC/HP and Tempo).

#### Sources
Maison › Sources de données (`/home/sources`, `SourcesList`, built by `$lib/sources.ts`): one panel, one 64 px row per source — Cozytouch, Linky, RTE EcoWatt, and Tempo only while a Tempo price is in force — each a button: the Freshness mark, the name (14/600) over its state sentence (13 muted; « Connecté · dernier relevé il y a 1 min », « à jour, relevé à 11:20 », « indisponible depuis 08:15 » in bad text, « quota du jour atteint, reprise demain », « pas encore interrogé »), the last time right (tabular; « dim. 18:00 » another day) and a chevron. A row opens its exact rows (FicheBody: last successful read, failing since, next read, the Linky calls) in a region `hidden="until-found"`; « Détails techniques » opens them all. The panel ends with the muted MyElectricalData calls line and its source note. The state line counts the late ones (« Tout est à jour » | « 1 source en retard »), as the Maison card does.

#### Tariff form
« Applicable à partir du » heads the form (focused when the editor opens; in a correction, read-only at the row's own date with « Corrige les coûts passés depuis le … » as its description, and the off-peak hours' date read-only at the schedule's own date, described the same way), then the option Segmented (Base · HC/HP · Tempo); the fields follow the option at their intrinsic widths: one price, two (each caption starting with its 8 px tariff-blue swatch, HC hatched), or six in a two-column grid (each colour's off-peak then peak; the caption carries the TempoDot for the day colour **and** the swatch for the hour type). HC/HP has its own « Applicable à partir du » and an optional season split: each season is a hairline-topped block with twelve 36 px month chips (copy-chip style, 44 px hit, 8 px apart) and up to three slots. Tempo has its two hour fields and the note on the 06:00 day; « Préremplir avec les prix Tempo publiés » is a ghost button whose result states its source and date (the Paris day) and saves nothing. Enedis' new off-peak hours appear as a calm callout inside the HC section with a date and « Ajouter ces heures creuses à partir du … ». Both time fields stay whole at 320 px.

#### Price history (Tarif)
Inside « Historique des prix » (a `detail` Disclosure under the summary, its meta « 2 lignes »): a 13 px table « Depuis » (long date), « Option », « Abonnement (€/mois) » and « Prix (€/kWh) » (the row's rates, « HC 0,2068 · HP 0,2700 », « Bleu HC … »), the units in the headers so the mono cells are bare figures (« 15,00 »); below, « Heures creuses successives », one line per schedule with its seasons. Headers muted 500, hairline rows, cells never wrap, the wrapper scrolls inside the panel rather than the page. Below 600 px it is replaced by a list, one hairline-separated entry per price with the same labels on the left and mono values on the right.

#### Login
Outside the shell, one centred 360 px column: the « Kelvin » brand (700), « Connexion » as a headline, a 13 px muted lead « Utilisez le compte Cozytouch de la maison. », two labelled 36 px fields (Email, Mot de passe), the error line when there is one, then a full-width large ink primary (`.btn-lg`, 44 px) « Se connecter » (« Connexion… » while busy). With the simulator a 12 px muted line gives the demo account. After a password change the screen adds a neutral note (s1, hairline, 10 px, 13 px, role status) « Reconnectez-vous avec le compte Cozytouch. »: being asked to sign in again is not an error. At the bottom of the column, centred, a compact « FR | EN » Segmented (each option with its `lang`, named « Français » / “English” by `ariaLabel`, the group named by the current language's « Langue » / “Language”) switches the language before signing in, without a reload; the choice is remembered on the device. In English the screen reads “Sign in”, “Use the home’s Cozytouch account.”, “Email”, “Password”.

Batch 11 (direction-2 §5), top to bottom: the mark (`Wordmark size="lg"`: the PWA icon's sparkline at 48 × 20 beside an 18 px « Kelvin »), the headline and lead, then **one server line** (13 px, one 20 px line held from the first paint by a skeleton): « Serveur : Sauter Cozytouch · Changer ». « Changer » is a dotted text button (`aria-expanded`, `aria-controls`, 44 px hit area) that slides open the grouped select (« Cozytouch », then « Expérimental — chauffage seulement »; labelled « Serveur », visually hidden) and, for an experimental server, its note (s1 box, linked by `aria-describedby`); a long name ellipsises, « Changer » never wraps. Once the home is claimed the line is « Serveur : … » alone (no choice), and a fine-print line says « Pour changer de serveur, repartez d’une installation neuve (voir le README). ». « Se connecter » waits until the list is read; a failed read puts an alert with « Réessayer » in the line's place. The password field carries a 36 px eye button at its right edge (`.btn-icon`, `type="button"`, `aria-pressed`, `aria-controls`, named « Afficher le mot de passe » by hidden text so a lookup by the field's label finds the field alone, a constant name: the state is `aria-pressed`, the glyph turns to eye-off); only the input's `type` changes (its `name` and `autocomplete="current-password"` stay for password managers) and every submit hides the password again. Below the primary, 12 px muted fine print: « Première connexion : ce compte devient celui de la maison. » while no home is claimed (or the claimed home's server line above), « Mot de passe oublié ? Changez-le dans l’application Cozytouch. » (the server's name for an experimental one, as in the lead), and the simulator line. Keyboard order: « Changer » → email → password → eye → submit → language. Server names are product names, never translated. CLS < 0.05 from 320 to 1440 px with fonts normal, blocked and late, and with the server list 2 s late (`e2e/login.spec.ts`, `e2e/brands.spec.ts` on a fresh install).

