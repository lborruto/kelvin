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
  field: "#76767e"
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

The design reference for the web app: one design system, « Tableau », as built (Maison and the room sheet,
Programme, Énergie, Réglages with Absence and Login). Tokens, shell and kit come first, then each screen, then the
rules carried over from before Tableau.
Tokens live in `web/src/app.css` (pinned by `tokens.test.ts`); components in `web/src/lib/components/`; their
props below, examples in the component headers and in `src/routes/kit/Gallery.svelte`. Every component in its states is
on the development-only gallery `/kit` (`npm run dev`, then `/kit`; a production build answers 404).

## Overview

**North Star: the house at a glance, Apple Home–like.** Maison (`/`) is a fixed tableau: summary chips on top,
one tile per room with its reading, its status and its −/+, then the energy and the tariff of the moment. A tap
opens the room sheet; −/+ act in place. Rounded, flat surfaces step up in tone on a near-black ground; ink is the
only accent for actions; colour carries meaning only (heat, away, tariff, errors).

**Binding rules:**
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
| `--field` | `#76767e` | field and well edges, grab bar, Éco swatch edge; ≥ 3:1 on every surface (WCAG 1.4.11; owner ruling over the spec's `#4a4a52`) |
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

Legacy aliases kept for components not restyled for Tableau yet: `--warm` = `--heat`, `--field-line` =
`--field`, `--radius` = 16 px. New code uses the names above.

**Named rules.**
- **Heat means heating.** Text and controls are never orange; a temperature figure is ink.
- **Tariff, not heat:** HC/HP swatches are 9–10 px squares with a 2–3 px radius, never round dots (round dots are
  Tempo days). HC is always hatched.
- **An offline room is never red.** Hors ligne is faint/muted everywhere.
- **Contrast:** ink, muted and faint text pass 4.5:1 on every surface they sit on (faint never sits on s2/s3:
  placeholders use muted); heat, cool, bad, ok pass as text on bg, s1 and s2. Control boundaries (`--field`) reach
  3:1 on every surface (WCAG 1.4.11, `tokens.test.ts`). HC vs HP is 3:1 and HC is always hatched.

### Type

Geist Variable (Fontsource, latin subset preloaded), weights 400–700, **tabular figures on `body`**
(`font-feature-settings: 'tnum'`); JetBrains Mono 400 only for dense numeric columns and the version string.
Until Geist arrives the text is set in a metric-matched local fallback (`app.css`: « Geist Fallback », Arial or
Liberation Sans, then « Geist Fallback DejaVu », each with `size-adjust` and ascent/descent overrides computed from
Geist's metrics), so the swap reflows nothing; a header whose two parts could wrap answers to its container's
width, never to its text (Énergie's bars header).

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

- **Spacing:** 4 px base (written in px); widget gap `--gap-w` 10 phone / 16 desktop; widget padding 14–18; page padding 28 × 32 desktop (`--page-pad-y/x`); phone gutter 16 (`--gutter`); sidebar 220
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
| `--t-state` | 160 ms | colour/state changes |
| `--t-modal` | 180 ms | desktop modal fades + scales from 0.98 |
| `--t-sheet-in` / `--t-sheet-out` | 280 / 200 ms, `--ease-sheet` `cubic-bezier(.2,.8,.2,1)` | phone sheet rises / falls |
| `--t-enter` / `--t-exit` | 220 / 150 ms | arrivals, banners (grid row), disclosures |
| `--t-morph` | 250 ms | the dashed → solid signature |
| `--t-data` | 360 ms | bars and meters |
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

Each component's props are typed and commented in its file. All strings come from the dictionaries
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
disc is `aria-disabled` (35 %). `disabled` = inert: the pill dims to 40 %. `block` stretches it (tiles; a `sm`
block lets its value column shrink so a 320 px phone tile never overflows). `lg` takes two snippets for the room
sheet: `below` (the caption under the figure, outside the live `output`) and `between` (the phone layout: the
figure and its caption on top, the slider between the two discs).

### What −/+ changes (`$lib/setpoint`)
`primarySetpoint(status, rads, override, expected, inFlight?)` → `{ kind, value, min, max, pending, endsAt?, comfort? } | null`:
Manuel → `manual`; Programme → `comfort` or `eco` (the level running now; eco shown absolute, sent as the
lowering); Chauffe temporaire → `boost` (sent again with the minutes left); Arrêt, window open, away, offline,
read-only, restoring, other modes → `null` (no stepper: a command that cannot work is absent).
`primaryLabel(kind)` gives the caption; `sendPrimary(roomId, p, v, comfort, now)` sends one result, clamped to the
bounds; eco uses the comfort carried in `p` (never an aggregate or a missing one); a boost resend in flight is dashed.

### RoomTile
`RoomTile.svelte`, `layout="tile"` (phone, 2 columns: 36 px glyph disc + 26 px reading, the name, one status line,
the compact stepper) or `layout="widget"` (desktop column: 40 px disc, name, 32 px reading, status, stepper,
`MiniSpark`). The body is one link to the room sheet (stretched); the control and tags sit above it and act in
place. The disc is heat only while heating. Variants (a control renders only for `normal`): `off` (no stepper; a note), `absence` (cool glyph, no
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

### DayBar (`DayBar.svelte`, the one day bar)
A day of programme on one line, the same component everywhere: the `--in` well with its field edge (radius 10 at
40 px, less on a shorter bar), gridlines every 3 h, comfort periods as heat blocks at 80 % (decision 2; Éco is the
empty well), the 2 px ink now marker. **Read-only** (Maison's « Programme d’aujourd’hui » 18–22 px, the room sheet
14–26 px): one `role="img"` named by `label` (« Salon : confort 17:00–23:00 »); `ghost` dims the blocks to 38 %
(programme paused, offline « dernier connu »), `times` writes a wide block's hours inside it in heat ink, `ticks`
adds 00 · 06 · 12 · 18 · 24. **Editable** (`day` + `onchange`, Programme's DayEditor, 40 / 44 px): see « Programme ».

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
The « Tout éteindre » dialog and the setup dialogs (`devices/SetupDialog`: MoveDialog, DeleteRoomDialog) use `--pop`, radius 18, the pop shadow and the scrim; they stay centred on a phone too (the kit `Sheet` is the bottom sheet).
A floating card portalled out of its place (`$lib/portal`: a Fiche, a Menu popover) goes to the end of the open
modal dialog it was opened from (the room sheet), never behind it on `<body>`.

### Lists, notices, small pieces
- **GroupedList / ListRow** (`.grph` + `.grp` + `.li`): s1, radius 16, rows ≥ 52 px (64 with a second line)
  split by hairlines; a row is a link (chevron), a button (`expanded` for a disclosure), or facts (`value`);
  `disc` puts its glyph in a 34 px s2 disc; `danger` writes the label in bad. Every grouped list on a screen is a
  `GroupedList` (its label a real heading, or `level="p"`; `id` when the page points at it; `tag="ul"` / `"dl"` keeps
  list or facts semantics). Its rows are `ListRow` where a row is a link, a button or one label with one value
  (`tag="li"` inside a `ul`), and the caller's own `.li` where the row is richer (a `dt`/`dd` facts row, a slot
  editor row, a BridgeRow, a panel), styled by the caller. `.grp` alone is also the plain s1 group surface for
  content that is not a list (the room sheet's chart box and boost form, Affichage, Today's programme on a phone).
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

## Screens

One section per screen, in nav order (Maison, its room sheet, Programme, Énergie, Réglages), then the Absence
sheet and Login. Each uses only the tokens, shell and kit above; where a screen needed more, the kit component
was extended (optional props) rather than copied.

### Maison (`/`, `lib/components/dashboard/`)
The fixed tableau. `Tableau.svelte` draws it; the room sheet opens over it (`/rooms/[id]`), so the
tableau stays mounted (links keep scroll and focus: `data-sveltekit-noscroll`, `-keepfocus`).
- **Header:** h1 « Maison » (`.t-page`) and « vendredi 16 octobre · 18:42 » (`fmtWeekdayDate`, Paris). Desktop:
  `HouseActions maison` (40 px pills in the mockup's order: Partir…, Tout éteindre, Tout remettre en programme;
  « Tout éteindre » absent while everything is off). Phone: `HouseActions menu` on a row above the title (the away
  icon, a ⋯ action sheet with the two house commands).
- **Summary chips** (`.chip-row`, a group « Résumés »): Climat (range of the rooms that answer · « n en chauffe »
  or « tout éteint »; the range only on the phone), the month's € (kWh without a tariff; absent without Linky),
  Réseau (the next signal: EcoWatt orange/red today or tomorrow, else tomorrow's Tempo colour when Tempo is in
  force, else « Rien à signaler »), Absence (« Partir… » opens the sheet; while one runs, « jusqu’à dim. 18:00 »
  in cool).
- **Notices** (stacked, 14 px apart): `AlertsWidget` (« Alertes · n », « Masquer tout », a glyph per kind, the
  words and link from `alertText`, × per row; an offline radiator is never red), `AllOffBanner` (« Tout est
  éteint », the offline rooms named calmly, primary « Tout remettre en programme »; no time: Kelvin does not know
  when the house went off), `NowWidget` (« En ce moment », moved here from Réglages: « Absence · 12,0 °C jusqu’à dim. 18:00 », the rooms, « Terminer »; each chauffe temporaire with its rooms and end, « Arrêter »).
- **Desktop board:** room columns (2 × 254, rows of two; Cozytouch order), the offline column (200, « Hors ligne ·
  n », the RoomTile `offline` widget), « Énergie et réseau » (the rest, ≥ 320: BillWidget and MaintenantCard span
  2, then Demain and Hier), « Programme d’aujourd’hui » under the rooms. Below 1100 px of content the energy
  column goes under the rooms. A room column (`MaisonColumn`): its name and radiator count, `MaisonRoom` (RoomTile
  `widget` with −/+ and today's MiniSpark), the IconTiles Chauffe temp. (« Lancer… » opens the sheet with the
  form unfolded, `?boost=1`; its end in heat while one runs) and Programme (« → Éco 23:00 » or « en pause »), then
  Fenêtre (one radiator that reports windows: Fermée / Ouverte) or Radiateurs (« 2 en chauffe · baie 19,7° ·
  entrée 19,5° », heat disc while one heats). A tile a room cannot use is absent.
- **Phone:** chips scrolling edge to edge, the notices, « Pièces » + « 1 en chauffe · 1 hors ligne », RoomTiles in
  two columns (offline full width, last), « Énergie » (MaintenantCard, then the month and Demain side by side),
  « Programme d’aujourd’hui » as a grouped list.
- **Tiles' words** (`$lib/dashboard` `tileLine`): desktop « En chauffe · Confort jusqu’à 23:00 » / « Confort
  jusqu’à 23:30 »; phone « En chauffe · → 23:00 » / « Confort → 23:30 »; absence cool with its temperature and
  « jusqu’à … » as the note; Arrêt « La pièce ne chauffe pas. » (phone « Ne chauffe pas »); a boost warm with its
  end. The −/+ is `primarySetpoint` (decision 4), « 20,0° » on the phone tile, « 20,0 °C » in the widget.
- **BillWidget:** « Octobre, jusqu’au 15 » (the last Linky day), « abonnement inclus », the € (a Fig: energy,
  subscription, total, kWh), « ≈ 194,80 € fin du mois est. » (the report's projection, a link to Énergie `#projection`), a 10 px ink bar for the days
  gone, « 16 / 31 jours » and last month. **Demain:** tomorrow's EcoWatt (« EcoWatt orange », « 18:00–20:00 ·
  réseau tendu »; « pas encore publié ») and, only under Tempo, « Tempo Blanc ». **Hier:** kWh (a Fig), the 48
  half-hour MiniBars (off-peak hatched under peak), « ≈ 10,22 € »; « Pas encore de relevé Linky pour hier. ».
  Data: `$lib/stores/dashboardEnergy` (`/api/settings`, `/api/energy` month and day, `/api/energy/day`).
- **Programme d’aujourd’hui:** one `DayBar` per room with a programme (the `--in` well, comfort blocks in heat,
  the hours inside a wide block on desktop, the ink now marker; dimmed « en pause » outside Programme or during an
  absence; an offline room's last known day, faint, « dernier connu »), « → Éco 23:00 » beside it.
- **Loading:** the skeleton of this layout (chips, columns, energy column, programme) until the house, the alerts
  (when there are some) and the energy answers are in; then everything in one frame.

### Room sheet (`/rooms/[id]`, `lib/components/room/`)
`RoomSheet` is a `Sheet` (`tone="modal"`, 920 px, ≤ 820 px tall; phone: full height from 56 px); closing it (×,
Esc, backdrop, drag) goes back to `/` and gives focus back to the tile. `RoomPanel` is its content:
- **Desktop left** (320 px, sticky): × and ⋯ (Modifier les horaires, Énergie de la pièce, Pièces et appareils);
  the name; its state (« En chauffe » in heat, « Fenêtre ouverte » in bad, else the mode) · the reading (a Fig);
  the large figure flanked by 56 px −/+ (`Stepper lg`, « Consigne Confort »), « Confort · actuellement 19,6 °C »;
  the VSlider (140 × 320, 10–26 °C, the measured heat line) and « −/+ par 0,5 °C · on peut aussi glisser le
  curseur ».
- **Desktop right:** the notices (offline, read-only, window), `ModeCircles` (60 px discs: Arrêt / Manuel /
  Programme in a radiogroup with the manual-activation keyboard model, the dashed edge while pending; « Chauffe
  temp. » a separate button that unfolds the form, a heat disc while one runs), the status sentence (dashed until
  confirmed; « puis Éco 17,0 °C » after a comfort period), the PendingTag; Chauffe temporaire (a grouped
  disclosure row « ex. 21,0 °C pendant 2 h » → « Chauffer à [−/+] pendant [durée] », the consequence, Lancer; or,
  running, the heat-edged card « Chauffe temporaire · 22,0 °C jusqu’à 20:42 », its consequence, Arrêter);
  « Remettre en programme » (primary) when off; « Aujourd’hui » with the 24 h · 7 j · 30 j segments (the
  ThermalStrip chart, the day bar, the legend, then RoomFigures); « Températures du programme » (Confort and Éco
  rows with their −/+, « Modifier les horaires › »); « Radiateurs · n » (RadiatorPanel rows; with two or more radiators each row keeps its own ModeSwitch, the room's modes being the ModeCircles above); « Ce mois-ci,
  jusqu’au 15 · 141,2 kWh · ≈ 34,81 € » (`/api/rooms/{id}/energy?days=` the day of the month).
- **Phone:** ⋯ · name and state · ×; the notices (and the running boost card); the large figure with its caption;
  −/+ flanking the slider (`Stepper` `between`); the mode circles (56 px); the status; the day bar with ticks and
  the now marker; then « Programme, températures, radiateurs » (`aria-expanded`) unfolds the rest below.
- **States:** Arrêt (« Arrêt » in muted at display size, « actuellement 19,1 °C », a dim slider, « Pas de consigne
  à l’arrêt », Remettre en programme); window open (the bad notice; no −/+, the kept setpoint dimmed with
  « Confort · en pause · actuellement … »; never a heat colour); offline (calm notice with the last reading and
  its time, a plug glyph and « Pas de température : le radiateur ne répond plus depuis 04:07. », dim modes, « Dernier
  mode connu … », the ghost « Programme, dernier connu » day, the radiators, the chart stopped when they went
  offline); read-only (the reading measured by the device, « Expérimental » on an experimental server and
  « Lecture seule » chips, the notice, « Appareils de la pièce » facts, today's chart; no control at all).

### Programme (`/schedule`)
The week as an agenda, the day as a form; nothing is sent before « Envoyer ».
- **Header:** the h1 and, on desktop, the one-line rule « Hors des plages Confort, la pièce est en Éco. »; « Comment modifier ? »
  (help glyph + dotted underline on desktop, a 36 px round s2 « ? » on a phone, `aria-expanded`) opens the gestures and keys
  in an s1 panel (on a phone it also holds the rule).
- **Room chips:** `Segmented variant="chips"` (32 px pills on s2, the checked one ink on bg, radio-group keys); an offline room
  reads « Chambre 2 · hors ligne » in faint on s1 (the phone keeps the hint for assistive tech only, `hideHints`). Desktop: a
  hairline, then the temperatures (`[■] Confort 19,0 °C [□] Éco 16,5 °C`, heat swatch / empty well) and « Modifier les
  températures › » (desktop only); the phone puts the temperatures under the chips. Then the plan line (13 px faint,
  `fmtNow`, or « La pièce est en mode … » outside Programme mode).
- **WeekCalendar** (s1 widget, 22 px): days are columns (« lun. » 12/600; letters on a phone), hours run down (600 px desktop
  body, 300 px phone; labels every 3 h / 6 h, solid gridlines every 6 h, dashed at 3 h). Comfort blocks are heat at 78 % on
  s1 (8 px; 5 px compact) with « Confort » and the times in heat ink when tall enough; the selected block is full heat with a 2 px
  ink edge and two 28 × 5 ink handles. Today: ink header and a dot (or « ● modifié » for an unsent edited day), the 2 px ink now
  line with its dot. Locked days: a faint 45° hatch, a lock and « non reconnu » / « fin à minuit » (a midnight day keeps its
  periods at heat 45 %); no drag ever reaches them. Pending: dashed muted outlines. Each day's header is a button named as a
  sentence (periods, comfort total, today, edited, lock reason); beside the editor it is `aria-pressed`, a roving tab stop, and
  arrows/Home/End move and select. Desktop drag (pointer only; the header and the editor are the keyboard path): a block moves,
  its top or bottom edge resizes, in the room's programme step through `$lib/program` (30 min on Sauter; one step before
  midnight at the latest, 23:30, never over a neighbour), with
  an ink time bubble (« fin 23:30 »); a drag on an empty area of a day under 3 periods draws out a 1 h period; any drag selects
  the day in the editor. The phone agenda is a picture: a tap on a day opens `?day=`. Under it on a phone: « Touchez un jour
  pour l’éditer. » and each locked day's reason (`data-lock`). An offline room's agenda is read-only (no buttons, sentences
  as hidden text) beside a neutral Notice (plug-off).
- **DayEditor** (desktop: s1 widget beside the agenda, `1fr | clamp(340px, 32 %, 410px)`, sticky): round s2 « ‹ › » around the
  day (h2 20/700), then a reserved 13 px line « Chambre 1 · aujourd’hui · ● modifié ». The editable DayBar (40 px; 44 on a phone;
  --in well, field edge, 10 px; heat 80 % blocks with times in heat ink; the block being adjusted keeps two 5 × 18 ink handles
  and an ink edge; a drag shows the time bubble above, leaning inwards near the ends; labels 00 · 06 · 12 · 18 · 24, gridlines
  every 3 h). « PLAGES CONFORT · N SUR 3 » over a grouped list of rows « ■ Plage 1 [06:00] › [07:30] (×) » (36 px s2 time pills,
  600 text, no clock glyph; the phone shows the number only). Desktop: « + Ajouter une plage » and « Copier vers… » (.btn-sm),
  « 3 plages au maximum · pas de 30 min » (the room's step); the phone has « Glissez une plage ou ses bords · pas de 30 min » under the bar and
  Ajouter / Copier vers… as list rows (the add row says « 3 plages au maximum » when full). Then « **Confort 8 h 30** · éco le
  reste du temps ». A locked day: the hatched bar, the lock line with its reason, and a neutral Notice « Ce jour reste tel que
  le radiateur l’a. » (Kelvin sends it back unchanged; no copy lands on it); the phone header says « 🔒 verrouillé » and the
  page lists the room's temperatures in a grouped list. Phone day view: « ‹ Semaine · Salon » left, ‹ › right, the day as h1.
- **CopySheet** (« Copier mardi vers… », ChoiceSheet: 400 px dialog / bottom sheet): shortcut chips, then the days as 40 px
  chips in 4 columns (picked: ink with ✓; the source day dashed, not a choice; locked days absent with « Dimanche est
  verrouillé : il n’est pas proposé. »), the large primary « Copier sur N jours » and « Rien n’est envoyé avant « Envoyer ». ».
- **SendBar:** an s2 card (16 px, hairline): « 1 jour modifié » (14/600; « Envoi arrêté » after a 409, « Envoi en cours… »
  while sending) over « Aussi pour… », then Annuler (s3) and Envoyer (ink), both .btn-sm. Desktop adds « Rien n’est envoyé
  avant « Envoyer ». Voir les modifications ». The conflict Notice (bad, `role="alert"`, Recharger / Remplacer quand même
  in danger) sits above the bar; on a phone both ride a dock sticky above the tab bar. « Aussi pour… » picks rooms as ink
  pills in a sheet. The send logic (base + 409, stop at the first 409 and resend only the rooms not written, locked days
  kept, offline rooms read-only) is unchanged.

### Énergie (`/energy`)
- **Tableau board:** header « Énergie » (`--fs-title`), the views Segmented (340 px), PeriodNav and « Exporter » on one row from 1280 px, two rows from 1024 px (title and « Exporter », then the views and PeriodNav; « Exporter »'s place held so nothing moves when it arrives) (phone: title + « ⋯ », Segmented full width, PeriodNav), then the context row (Linky SourceLine, Tempo chips only under Tempo, EcoWatt). The board is one grid answering to its own width: one column below 900 px of content, then `1fr 1fr 330px` (16 px gaps); every cell is a widget (`--s1`, radius 22, 18 × 20 padding; main titles 15/600 ink, small widget labels 12.5/600 muted). **Mois:** Consommation (span 2, 300 px bars, the period kWh beside the title, legend right) · Résumé; then Heures creuses / pleines (ring + matched HC/HP kWh) or, Tempo in force, « Jours Tempo » (the six rows, « Un jour Tempo va de 06:00 à 06:00. », dots under the day bars, unknown colours dashed) · « Courbe du … » (`CurveMini`: the Courbe's day as mini bars, its `readDay` kWh and €, « par demi-heure › » opens the full Courbe) · « Où part l’énergie » (`WhereTop`: heating share and the top three rooms from `roomEnergy`, « Tout voir › » to `#energy-where`). **Jour / Semaine:** the Courbe (span 2 × 2 rows, 320 px chart) · Résumé · the bars (« Les 7 jours jusqu’au 12/10 » in Jour); then Puissance · Heures creuses / pleines (or Tempo) · Où part. **Année:** month bars (span 2; the running month dashed to its full-month projection, « Octobre 2026 en pointillés : le mois complet estimé (≈ 193,93 €). ») · Résumé; « Mois par mois » (`EnergyMonths`, span 2: each bar's own inspection kWh and €, « au 15/10 » on the running month, a row opens the month) · Heures creuses / pleines. Année also carries the Où part widget beside the months. Jour and Semaine add « Température et chauffe » as its own full-width widget under the board. Then, full width: Analyse (Comparaisons, Projection; plus Heures creuses / pleines under Tempo) and Qualité des données. **Nothing twice:** in Mois the full Courbe (scrubber, readout, notes) opens in a `Sheet` (desktop modal 920, phone bottom sheet) from « par demi-heure › » or a day bar's drill, and Année has no Courbe; the full « Où part l’énergie » (`#energy-where`: every room, its radiators and lifetime counters, the footnotes) is collapsed `hidden="until-found"` until « Tout voir › », the Chauffage key figure or find-in-page reveals it (in-page links go through `$lib/sections` `goToSection`: the section opens, then the page scrolls to it; never SvelteKit's same-hash jump), with « Replier la liste » to fold it again; arriving with `#energy-where`, `#offpeak`, `#projection` or `#curve` in the URL (the room sheet's « Énergie de la pièce », Maison's month-end estimate) opens that section once the first report is drawn, then scrolls to it; without Linky it is shown open (the rooms are the evidence). One export: the header menu (« Exporter » / « ⋯ »), no closing ghost button. On a phone the Résumé comes first, then the same widgets in one column. The Résumé adds « énergie 92,39 € · abonnement 7,26 € » (matched to the total at its own decimals: whole euros from 1 000 €) under its range; without Linky « ≈ 30,42 € est. · énergie seule » for the radiators. Mois on a 1 440 px desktop is under 1 800 px with every disclosure closed. No figure is computed by the board: every number is the report's, through `$lib/format` and `$lib/inspector`.
- **Order (answer, then evidence), pre-board notes still true for the parts:** Résumé, Consommation, Courbe du … (Jour, Semaine; a sheet in Mois), **Où part l’énergie** (collapsed until « Tout voir › »), Température et chauffe (Jour, Semaine), **Analyse**, Qualité des données (collapsed). No « Compteurs des radiateurs » or « Exporter » panel (critique 2 §7). Without Linky: an invitation card (52 px glyph disc, « Reliez votre compteur Linky », what it brings, primary « Relier le Linky » at the right from 640 px) above the radiator bars (`--s3c`) beside a radiator-only Résumé, and Où part l’énergie (rooms only); no Analyse.
- **Context row:** PeriodNav, then on the same line from 1024 px (wrapping under it on a phone) the Linky **SourceLine** (« ○ Linky · données jusqu’au 14/10 »; dashed while waiting: « première synchronisation en attente », « historique en cours, la suite demain », « Enedis limite les requêtes, nouvel essai à 14:30 »; its Fiche: last daily day, last sync, MyElectricalData calls « 2 sur 10 aujourd’hui », next try, history since) and the **GridChips** (« Aujourd’hui ● Bleu », « Demain ● Rouge » under Tempo; « ⚠ EcoWatt orange demain, 18:00–20:00 », bad text at level 3; every chip a Fig whose Fiche lists the signals with RTE's fetch time and the « publié » nature). Only Linky problems the user must fix (token refused, sync error, status unavailable) are a red callout above the Résumé, with « Renouveler le jeton » / « Ouvrir Linky ».
- **Condensed period bar** (`PeriodBar`): once PeriodNav has scrolled above the screen (IntersectionObserver), a fixed 44 px bar fades in (160 ms, opacity only) at the top of the content column: « ‹ Octobre 2026 · Mois › », s1 at 92 % with a 12 px blur and a hairline. Fixed and never in flow, so it moves nothing; `aria-hidden` always (PeriodNav stays the one control for assistive technology), its buttons out of the tab order, `inert` while hidden; its buttons run PeriodNav's handlers. Sections linked from the Résumé keep a 60 px `scroll-margin-top` clear of it.
- **Export menu:** a `Menu` (« Exporter » ghost with the download glyph on desktop, the « ⋯ » icon on a phone; the only export entry): « Exporter la période (CSV) », « Exporter la courbe du 12/10 (CSV) » (when the Courbe's day has points), « Exporter par pièce (CSV) » (`aria-disabled` with « Disponible une fois les pièces chargées » until the house is known), and the format as the menu's muted footer (« CSV : « ; » entre les colonnes, virgule décimale, dates ISO. »). The actions are `$lib/export.ts` (`exportActions`); the files are `$lib/csv` (contract in `web/README.md`).
- **States:** the first load shows the header, the navigator row and the board's skeletons (bars 330 px spanning two columns, the Résumé 330 px, then a row of three at 236 px), then the report, the source line and the chips at once (CLS < 0.05, `e2e/layout.spec.ts` « Énergie layout matrix », four views × 320–1440 px × fonts normal / blocked / late). A period switch keeps the previous report on screen at 55 % with `aria-busy`; a failed one leaves it there, names the period that failed and offers « Réessayer ». A **view** switch redraws the panels for the new view (`{#key}`), so a slow report replaces the previous view's content instead of moving it. The Courbe of another day is replaced at once by a skeleton at the chart's height; Température et chauffe keeps the previous room on screen, dimmed, until the new answer. Only Où part l’énergie's rooms, Température et chauffe's room picker and the room export wait for the live house. Linky first sync: the dashed source line and « Première synchronisation : l’historique Linky arrive dans quelques minutes. » in the Résumé. A period before the history: « Pas de données pour septembre 2025 : l’historique commence le 1 novembre 2025. » with a ghost « Aller au 1/11 ». No tariff: the Résumé's figure is the kWh, « Ajoutez votre tarif pour voir les coûts. » with « Renseigner le tarif », and no € anywhere in it.
- **Navigator:** see PeriodNav. Jour draws the 7 days ending on the day and the day's Courbe; Semaine the ISO week's days; Mois the month's days; Année its months. The Résumé, the panels, the tables and the CSV always describe the selected period; a running period is described up to its last day with data (« du 1/10 au 12/10 »), and its radiators and room figures up to yesterday. Midnight with the page open asks the period again.
- **Résumé** (`EnergyHero`): the figure in the **Hero** type (40/600, −0.02em, tabular; 32 px below 420 px of panel) is a `Fig` (« 91,00 €, estimation, détails ») whose Fiche is the period's inspection (`inspectBucket`: Maison, HC/HP, radiators, Coût estimé with « dont énergie » / « dont abonnement », prices, per day), every method note, and the Provenance (Linky + « estimé · kWh Linky × votre tarif »; « mesuré » for kWh; the radiators' meters without Linky). € when a tariff priced the period (12 px « est. » after it), else Linky kWh, else radiator kWh. Then the range with the kWh (« du 1/10 au 14/10 · 330,0 kWh »), the **SplitBar** (8 px, `--hc` hatched then `--hp`, 1 px knockout, radius 3, growing over `--t-data`; each part's words under its end with an 8 px swatch, « Heures creuses 55,6 kWh » / « Heures pleines 274,4 kWh », matched to the kWh by `fmtKwhParts`; `role="img"` named by the same words; one series-1 bar without a split), the comparison on comparable days only (« +63 % de consommation par rapport à septembre 2026, sur 14 jours comparables », muted, never coloured). Only notes that change the figure's meaning stay on screen, one muted line each with the ⓘ glyph: missing days and their uncounted energy, prices applied to earlier days, days without a Tempo colour, a partial or absent radiator sum without Linky. The estimated HC/HP split and radiator interpolation live in the Fiche.
- **Key figures** (beside the answer from 640 px of panel, a hairline-separated list under it below): three fixed 52 px slots, each a link with a chevron (nudges 2 px on hover) to its section, named « Chauffage, 63 % de la maison »: « Mois complet ≈ 190,34 € » (`#projection`, only when the period holds the last day with data), « Chauffage 64 % de la maison » (`#energy-where`), « Heures creuses 17 % · 33 % du temps » (`#offpeak`, not under Base or without a tariff). A figure the period lacks leaves its slot empty, so stepping periods never moves the rows (`ENERGY_ANCHORS` in `$lib/paths`).
- **Consommation de la maison:** EnergyBars of HC + HP (or the home series) with the radiator overlay, the inspector and the legend (« Non réparti » in series-1 for a day without a split beside split days, « Consommation » when nothing is split; a series is listed only when a bar draws it, never for days still to come); leading buckets before Linky history are trimmed, with « Historique Linky depuis le … ». Without Linky, « Consommation des radiateurs » in series-3.
- **Courbe du …:** the day's CurveChart with the Scrubber. **At rest the readout is the whole day**: its lead cell reads « Journée » and its fields the day bar's own figures (`readDay` in `$lib/inspector.ts`: Énergie and Coût and Radiateurs and Reste from the bar's inspection, so the day reads the same in the readout, the bar and the CSV; Puissance « pointe 5,53 kW à 06:30 »; Température « moy. 17,2 °C »); Tarif and Prix, with no whole-day value, keep their box unseen. Scrubbing puts the half-hour in the same stacked cells (no reflow), and a muted 12 px line under the axis says « Survolez, touchez ou utilisez ← → pour lire chaque demi-heure ». In **Mois** it opens in a `Sheet` (see « Nothing twice »); Année has no Courbe; a bar's Enter or « Voir la courbe du … » opens it on that day. Outside Jour, two icon buttons step through the period's complete-curve days (`aria-disabled` at the ends); it opens on the newest complete day of the period. Under it: « Courbe 21,60 kWh · relevé journalier 22,03 kWh (écart 2,0 %) », « HC 8,98 kWh · HP 13,05 kWh, d’après le relevé journalier » (est. when the split is not from the curve), « Courbe incomplète (41/48 demi-heures) », « ≈ » explained when an HC slot edge falls inside a half-hour, and an empty day's reason (« antérieure à l’historique de courbe (depuis le …) », « antérieure au premier jour compté (depuis le …) », « pas encore récupérée (quota) »).
- **Où part l’énergie** (`EnergyWhere`, `#energy-where`, full width; the section label with the period as right-aligned meta): the heating share (« 64 % de la consommation de la maison vient des radiateurs (6 jours sur 15). », 20/600 figure, a 6 px series-3 meter), then one 12 px muted line « Coût du chauffage ≈ 32,53 € est. · énergie seule · partiel³ » whose amount is a Fig (radiators, rest, cost, days measured; Provenance « Compteurs des radiateurs », estimated when spread between readings). Above 102 %: « — » and « Les radiateurs dépassent le compteur : données incohérentes. » Then the **rooms ranked by kWh** (an unknown sum last, « Sans pièce » always last): from 640 px of panel a row « [›] Salon¹ · share bar (4 px series-3 over the well) · 78,49 kWh est. · 20,82 € · 64,0 % » with right-aligned tabular columns; below, name and % on line 1, the bar, then kWh and €. The kWh is a Fig (HC/HP, € energy only, how it was measured, the partial sentence). Each row's chevron button opens a findable region (`hidden="until-found"`, `beforematch` opens it): HC/HP, Moy. °C, Consigne moy., Heures de chauffe (« — » with its reason), then the room's radiators (name, model, kWh Fig, partial and stats reasons, and « depuis l’installation 2 400 kWh » as a Fig whose Fiche gives the radiator's « Compteur interne 1 / 2 » — the radiator's own registers, never HC/HP; « — » for an absent one), and the heating-hours note. A partial row carries a superscript mark (¹ ², one per distinct sentence, the heating line's coverage after them); the sentences are written once under the list (« ¹ partiel : 2 radiateurs sur 2 enregistrés à partir du 9/10 »), then « est. : énergie répartie entre deux relevés des radiateurs. » and « Pièces selon la répartition actuelle des radiateurs. ». Shares by largest remainder (`fmtShares`), a room's HC/HP and its radiators' rows matched to it (`matchParts`), the rooms' € adding up to the heating cost: `roomEnergy` unchanged. Share bars are `role="img"` named « Salon : 64,0 % de l’énergie des radiateurs ». Rooms carry no colour of their own.
- **Température et chauffe** (Jour, Semaine; its own full-width widget under the board): one room (Segmented on desktop, a select on phone; the first room with a radiator by default, never following the period; **opening a room row selects it**) on the Courbe's day: its radiators' Wh as light series-3 bars, the temperature as a heat-ramp line, the setpoint as a 1 px muted step line, Wh on the left axis and °C on the right, sharing the Courbe's scrubbed half-hour. A half-hour whose room sum is unknown reads « — (radiateur sans relevé) ».
- **Analyse:** a section label (`h2`) over summary cards (`h3` widget labels): Comparaisons and Projection two abreast from 640 px of content (Puissance and Heures creuses / pleines sit on the board's second row; under Tempo Heures creuses / pleines joins Analyse, three abreast from 900 px). Each card keeps its headline figure, one sentence and its meter in L0; the rest sits in one `Disclosure` « Détails » (`detail`: open with « Détails techniques »; a muted meta says what is inside).
- **Puissance** (Jour, Semaine): « Pointe moyenne sur 30 min » 20 px with its half-hour (and day in Semaine), « abonnement 12 kVA », a 6 px meter of the peak against the subscribed power and « 61 % de la puissance souscrite ». Détails (« consommation de fond, minimum de nuit »): « la pointe instantanée peut être plus élevée », « Hypothèse : 1 kVA ≈ 1 kW. », « Consommation de fond » with the night minimum and « 10 % des demi-heures sont sous … », « consommation de fond ≈ … » (with € in Jour, per day in Semaine over N complete days). Complete curve days only; else « — » and why. While the day loads, a skeleton of the L0 lines and the Détails row.
- **Heures creuses / pleines** (`#offpeak`): « 16,3 % de l’énergie, pour 33,3 % des heures » and the 116 px HC/HP ring (heures creuses hatched from 12 o’clock, decorative) with the period's HC and HP kWh beside it, matched to the total. Détails (« prix moyen, simulation »): the mean price paid, « Chaque kWh passé d’HP en HC », the 0–50 % slider (step 5) with its result « à consommation identique », its formula and « Calcul sur vos prix et votre consommation, pas une économie garantie. » (under Tempo the six colour rows are the board’s « Jours Tempo » widget instead). Without a tariff: « Renseignez le tarif pour voir la répartition. »
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

### Réglages (`/home` and its sub-pages, `lib/components/settings/`)

URLs unchanged (`/home/*`); the nav says « Réglages ».

#### Réglages header (`settings/SettingsHeader`)
A sub-page starts with « ‹ Réglages » (15 px muted, 44 px hit), then the h1 (`.t-page`) and one 15 px muted line
(13.5 on a phone) that holds its height from the first paint (an `sk-line` skeleton, then the state or a
Freshness + words line). Actions (« Nouvelle pièce ») sit right of the h1 on desktop. The h1 carries
`view-transition-name: home-<section>`, the overview card's title travels into it.

#### Overview (`/home`)
h1 « Réglages » and its state line (« Tout va bien » | « 2 alertes · Absence jusqu’à dim. 18:00 »). The alerts
(`#alerts`, an `.areah` « Alertes » + AlertList) only while there are some. Then the **cards** (`HomeCard`):
3 columns from 960 px of container, 2 from 720, a grouped list below. A card is a 22 px-radius s1 surface,
min-height 150, padding 18 × 20: a 36 px s2 glyph disc (grid · tag · meter · sync · user), the title 16/600 and a
chevron; the summary in 14 px ink, detail lines 13 muted, the SourceLine or the tariff band (`TariffBand`, 8 px, no
ticks) at the bottom. Pièces et appareils (« 3 pièces · 4 radiateurs », « 1 hors ligne », « lecture seule sur ce
serveur »), Tarif (« HC/HP · 9 kVA · 23,48 €/mois », the prices with 10 px swatches; under Tempo the three TempoDots with their colour names and « Heures creuses Tempo : 22:00–06:00 · le jour va de 06:00 à 06:00 » in place of the band, never the HC/HP blues), Linky (state, « synchro il y a
12 min », Linky SourceLine), Sources de données (« Tout est à jour », the source names), Compte (email, « Sauter
Cozytouch · 3 appareils connectés · 1 jeton MCP »: active tokens counted, never a secret). The whole card is the
title's link, named « Tarif, HC/HP · 9 kVA · 15,00 €/mois ». **Affichage** is the sixth cell (not a link): Langue
(Segmented) and « Afficher les détails techniques » (Toggle), the note « … Kelvin est en thème sombre. »; no Thème.
List form (phone): one s1 grouped list of 64 px rows (34 px disc, title 15/600 over one ellipsised summary line,
chevron), then Affichage as `.grph` + `.grp`. « Kelvin 0.2.0 » (mono 12 muted) closes the page. What happens now
(absence, chauffe temporaire) and the house actions live on Maison, not here. Old anchors: `homeAnchor` unchanged;
`/home#away` goes to `/` and opens the Absence sheet over the Maison tableau. Skeleton: five card shapes and Affichage at their heights.

#### Tarif (`/home/tariff`)
State line « Option Heures creuses / pleines depuis le 1 février 2025 ». Enedis notices above. Desktop: a 400 px
column (**Tarif en vigueur** widget: TariffSummary rows of 40 px with hairlines, 14 px muted labels and 600 values,
10 px swatches, « Heures creuses 22:00–06:00 » over a 14 px TariffBand with ticks, one per season; then primary
« Nouveau prix… » and « Corriger le tarif en vigueur »; **Historique des prix** widget: « 2 lignes » aside, one 48 px
row per dated price, newest first, « Depuis le 1 février 2025 » over « HC/HP · 15,00 €/mois » (faint), the rates in
mono 12/600 right, then « Heures creuses successives ») and, while editing, the form widget beside it (« Nouveau
prix » / « Corriger… », « brouillon » aside, edged by `--field`). Phone: the same, stacked. Saving closes the form,
pulses the changed rows and says « Tarif enregistré. » (ok) for 6 s. **Inline check**: a price field that cannot be
right (`priceProblem`: not a number, more than 4 decimals, 0, above 5 €/kWh) is flagged when it is left
(aria-invalid, bad edge, « Indiquez le prix en €/kWh, avec 4 décimales au plus, ex. 0,2780. » under the fields,
linked by aria-describedby) and the save refuses it. Form captions are 13 px muted, legends 13/600 ink.

#### Linky (`/home/linky`)
State line: Freshness + « Relié · données jusqu’au 15/10 · synchro il y a 12 min ». A token problem is a bad
Notice. « CONNEXION » grouped list: PDL masked (« Afficher » dotted text button, named « Afficher le PDL »; the full
PDL never in the page before it), Jeton MyElectricalData (« Enregistré », never shown), Appels MyElectricalData (a Fig),
Consentement Enedis. « Modifier la connexion » is its own grouped row (Disclosure; the form only while open). The
J+1 note closes the page. No « Historique » row: the API gives no history start (never invented).

#### Sources (`/home/sources`)
State line « Tout est à jour » | « 1 source en retard ». One s1 grouped list (`SourcesList`): 64 px rows, ring, name
15/600 over its sentence, time right (14 muted), chevron; a row opens its exact rows (`hidden="until-found"`). Two
notes: the day's MyElectricalData calls, and where Tempo/EcoWatt come from.

#### Compte (`/home/account`)
No state line. Desktop: two columns (Compte Cozytouch, Appareils connectés, « Se déconnecter » left; Accès MCP
right); phone: one column in that order with « Se déconnecter » last. **Compte Cozytouch** (`.grph` + `.grp`): Email,
Serveur (support chip when experimental), Connexion (Cozytouch SourceLine, last error in words), note « Fixé à la
première connexion. ». **Appareils connectés** (`#sessions`, SessionsPanel): 56 px rows, name 600, « cet appareil » /
« dernière activité … » (13 muted), « connecté le … » (12 faint), `.btn-sm` « Déconnecter » except on this device; the
last row « Déconnecter les autres appareils » in bad asks first in a Sheet (Annuler focused). **Accès MCP** (`#mcp`,
McpPanel): the lead, token rows (34 px key disc, name 600 + last four in mono faint, « créé le … · dernier appel … »;
revoked rows faint, no actions), « ⋯ » → Révoquer (danger) asks in a Sheet; « Nom du jeton : Claude » field + primary
« Créer un jeton »; « Derniers appels » Disclosure (refusals are counted rows, « 300 fois »). The secret is shown once
in a Sheet (560 px dialog / phone bottom sheet) titled « Jeton « Claude » créé »: the token and the Claude Code /
Claude Desktop snippets in s2 blocks (mono 12, wrapping) with « Copier » (copy glyph; « Copié » with check), closed by
primary « J’ai copié le jeton »; any close drops the secret from the page. MCP appears once the devices are known
and « Se déconnecter » once the tokens are (CLS).

#### Pièces et appareils (`/home/devices`)
The lead (13.5 muted), « Nouvelle pièce » (header on desktop, `.btn-lg` full width on a phone), the SyncLine with
ghost « Synchroniser », then one s1 grouped list per room (radius 16): a 52 px header (name 15/600 + « 2 radiateurs »
faint) with its « ⋯ » (Renommer la pièce, Supprimer la pièce with its reason), radiator rows of 56 px (rad glyph, or
plug-off faint when offline; name 14/600 over « Sauter · 1 500 W · En ligne » 12.5 muted; « ⋯ »: Renommer, Déplacer
vers…, Faire clignoter when capable, Voir les appareils (n)). « BOX ET PONT COZYTOUCH » and « AUTRES APPAREILS » are
grouped lists of BridgeRows (glyph box / sync, name 15, state right 14 muted, the row opening the raw device). Menus
are popovers on desktop and action sheets with « Annuler » on a phone. Experimental server: no action, « lecture
seule sur ce serveur ». The page renders once the setup and `/auth/me` are known (skeleton), error + « Réessayer ».

### Absence sheet (`AwaySheet`)
One Sheet (460 px `--pop` dialog with « Partir en absence » and ×; phone bottom sheet), mounted in the layout and
opened from the sidebar « Partir… », Maison, the phone and `/home#away`; focus starts on the chosen chip. Lead 13.5
muted; « Jusqu’à (heure de Paris) » (13 faint) over day chips (40 px, radius 12, s2; the chosen one ink,
`aria-pressed`): « Demain 18:00 », « Dimanche 18:00 », « Date précise… » (a `datetime-local`); « Température » over a
block Stepper captioned « pendant l’absence » (7–19, 12,0 °C) and « hors-gel à partir de 7 °C »; the consequence in an
s1 group (14.5 px, `aria-live`), each offline room on its own line with the plug-off glyph (« Chambre 2 est hors
ligne : elle ne recevra peut-être pas la consigne. »). Footer: « Partir » (`.btn-lg` primary, away glyph, full width;
paused with its reason while Kelvin is not connected or another house command is on its way), and « Annuler » on a
phone. Running: « Absence en cours », the state in cool glyph, « Prolonger… » and « Terminer maintenant ».

### Login
Outside the shell, one 360 px column (full width with 16 px gutters on a phone): `Wordmark size="lg"` (ink K disc),
« Connexion » 30/700, the 14 px lead, the server line « Serveur : Sauter Cozytouch · Changer » (13.5; skeleton until
the list is read; « Changer » only before a home is claimed), Email and Mot de passe as 44 px fields under 13 px
captions, the eye as a 34 px s3 disc inside the field (`aria-pressed`, constant name, reset to hidden on every
submit; only `type` changes, for password managers), the error in 13.5 px bad with the alert glyph, « Se connecter »
(`.btn-lg` primary), the 12 px fine print, then FR | EN. Behaviour, order and CLS rules unchanged (`login.spec.ts`,
`brands.spec.ts`).

## Rules that still hold (carried over)

These behaviours are unchanged by Tableau; where a sentence below names an old look (s2 cards, 10 px radii, a light theme), the tokens and kit above win.

### Data on demand: three depths
Every screen answers at a glance and keeps the exact data one step away:
- **L0 · Glance:** the answer, rounded (« Hero / sentence » precision), estimates marked « ≈ » / « est. ». Always on screen.
- **L1 · Exact:** the exact value(s), unit, period, **source**, **freshness**, **measured or estimated** and how: a **Fiche** opened from a **Fig** (hover, focus + Enter, tap).
- **L2 · Analysis:** tables, breakdowns, method text, raw states: a **Disclosure** (closed by default, `hidden="until-found"`) or a sub-page.
A value is never L1-only if a reader needs it to decide, never L0 if only an auditor needs it; L0 never shows a method sentence (a footnote stays only when it changes the meaning, as one muted ⓘ line). Every exact figure goes through `Fig` and `$lib/provenance.ts`. The props of every piece below are listed in « Foundation components: API ».

### Fig (exact-value trigger)
A figure with more precision or provenance than it shows is a `<button class="fig">` (`Fig.svelte`): no box, the text's own style, a 1 px dotted underline in faint with a 3 px offset (the only cue, visible on touch too), firmed to muted on hover and to ink while its Fiche is open; its `::before` makes the hit area 44 px tall without changing the line. Accessible name: the L0 value plus « détails » (« 19,5 °C, détails »). Mouse: the Fiche opens after 120 ms of hover and closes 200 ms after the pointer leaves both figure and card. Click, tap or Enter **pins** it. Not every number is a Fig: only those with more to say.

### Fiche
`Fiche.svelte`, generalising ChartInspector. Desktop (≥ 1024 px): a 300 px card (`--pop`, radius 16, the pop shadow, 13 px) placed beside its trigger (right of it; else below, right-aligned to it; else above; else left; else clamped in the viewport; placed again when its content changes; `fichePlace`), portalled to `<body>` and fixed, a non-modal `role="dialog"` named by its title; pinned, it shows a 36 px close button (44 px hit) and closes on Esc (focus back on the figure), on a press elsewhere, or when focus leaves it (to another control or to nowhere); opened from the keyboard, focus moves to the card itself (`tabindex=-1`). Phone: the same content in the ChoiceSheet bottom sheet (its title as the sheet's heading). Content (`FicheBody.svelte`, shared with ChartInspector): a 13 px 600 title; label/value rows (muted label left, tabular value right, « dont » rows indented 10 px, a 12 px « est. » after an estimate, the reason under a « — »); notes; then the **Provenance block** under a hairline in 12 px: `Source`, `Relevé`, `Nature` (`$lib/provenance.ts`), its notes, and one optional `.btn-sm` action. Fades in over `dur(T.state)` (`|global`).
- **Provenance vocabulary:** `mesuré` (no L0 mark), `estimé · <méthode>` (« est. »), `projection · <méthode>` (« ≈ »), `calculé · <formule>` (« ≈ »), `publié` (a grid signal as RTE/EDF gave it). Sources: « Linky · Enedis via MyElectricalData », « Compteur du radiateur (Salon 1) » / « Compteurs des radiateurs », « Votre tarif », « RTE EcoWatt via MyElectricalData », « Tempo (EDF) via MyElectricalData », « Cozytouch », « Calcul Kelvin ». Relevé: « jusqu’au 14/10 », « courbe jusqu’au 14/10 », « il y a 3 min » within the hour, « 21:11 » today, else date and time; « synchro … ».
- **Room panel:** the header reading (each radiator that answers, their mean, the target; Cozytouch, measured, « moyenne des radiateurs en ligne ») and the Énergie figures (Consommation with its HC/HP parts and coverage, from the radiators' meters, estimated when spread between readings; Coût, calculated from your tariff; Heures de chauffe and Part du temps en chauffe, calculated) are Figs.

### Freshness and SourceLine
**Freshness** (`Freshness.svelte`, states from `$lib/freshness.ts`): an 8 px circle, 1.25 px stroke, beside a source's name, `aria-hidden` and always paired with words. Solid muted ring = fresh (within the source's cadence); **dashed** muted ring = waiting or late (first sync, quota, next read pending, stale: the pending signature); solid bad dot = failed (only what is already red: token refused, sync error, Cozytouch down); nothing when there is nothing to say. Cadences: Cozytouch 15 min; Linky (daily and curve) the day before, due by 12:00 the next day; RTE EcoWatt 6 h; Tempo 24 h, and tomorrow's colour due after 11:00.
**SourceLine** (`SourceLine.svelte`): one 12 px muted line `[mark] Source · state`, ellipsised (never reflows), in bad text only when failed; with a Fiche its words are a Fig opening the source's times, quotas and next read. The sidebar's status footer is the Cozytouch SourceLine (`CozytouchStatus`), dashed while Kelvin's own stream is not open. Later: Énergie context row, Réglages cards, Sources, radiator rows. Login is exempt.

### Disclosure
`Disclosure.svelte`: a 44 px button row (13 px 600 ink, a chevron turning 90° over 220 ms, an optional right-aligned 12 px muted meta « 3 lignes ») toggling a region that is `hidden="until-found"` when closed (find-in-page reaches it; `beforematch` opens it), sliding by its grid row 0fr → 1fr over `dur(T.enter)`; reduced motion: instant. Under a heading (`heading="h2"`) the heading holds the button and the button takes the heading's type (Qualité des données keeps its section label). `detail` opens it at first render when « Afficher les détails techniques » is on. The `inline` variant is a dotted 13 px muted text button with the help glyph inside a sentence line; its region takes the next line (Programme « Comment modifier ? »). Replaces every ad-hoc toggle (QualityPanel, Programme help, the error page's « Détails »).

### Menu
`Menu.svelte`: a 36 px « ⋯ » icon button (edged, 44 px hit) or a labelled ghost trigger (« Exporter ») opening a popover (s1, hairline, 10 px, 8 px padding, min 220 px, portalled and fixed, under the trigger and right-aligned to it, flipped above near the bottom) on desktop, or the same items in the bottom sheet on phone. Items are 44 px rows (16 px muted icon + 14 px label), a hairline between groups, destructive items in bad text, a 12 px muted non-interactive footer line. `role="menu"` / `menuitem`: focus lands on the first item, arrows/Home/End move, Enter or Space activates and closes, Esc closes and returns focus, Tab closes with focus back on the trigger and moves on from there (menu-button pattern). A disabled item stays focusable (`aria-disabled`) with its reason as a 12 px muted second line (`aria-describedby`).

### PageHeader
`PageHeader.svelte`: the h1 (22/700) and right-aligned actions on one 44 px row, then one 13 px muted **state line**, ellipsised (never reflows); a sub-page puts its back link (« ‹ Maison », 44 px) above the h1, first in the DOM. Pièces and Programme keep their own equivalents; Énergie, Maison and its sub-pages adopt it with their redesigns.

### Preference « Détails techniques »
Per device, off by default: `localStorage` `kelvin-detail`, applied before first paint as `<html data-detail="on">` by the app.html boot script, read through `$lib/stores/detail.svelte.ts`. When on: every `detail` Disclosure starts open (Énergie's Détails, Qualité des données, the Tarif price history, a device's raw states); the room panel shows the live power « ≈ 1,70 kW » after « En chauffe » as a `Fig` (Fiche « Puissance de chauffe »: each heating radiator « 80 % de 1 500 W », the total, Nature « calculé · taux de chauffe Cozytouch × puissance du radiateur »; `livePower` in `$lib/roomfacts.ts`, none when a heating radiator's power is unknown: never a partial sum), the room card the same words as plain text (the card is a link), and each radiator row its raw signal and last event inline (`detailFacts`). It moves L1/L2 content up one depth: it never changes a format, adds a panel or shifts the page (`e2e/cls.spec.ts` « details on »). The toggle « Afficher les détails techniques » sits in Réglages › Affichage.

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

### Toasts
Stacked bottom-centre: s2, hairline (red-tinted for errors), 10 px, 13 px, a close icon button (36 px, 44 px hit). They rise 12 px into place (220 ms), fade out (150 ms) and the rest reflow (200 ms). Errors stay 10 s, information 6 s, and the timer pauses while the toast is hovered or holds focus. Errors sit in an always-present assertive region, information in a polite one.

### Dialog
« Tout éteindre » asks first: `--pop`, radius 18, the pop shadow, 22 px padding, at most 340 px; an h2 (16/600) « Tout éteindre ? », a 13 px muted line « Les radiateurs passent à l’arrêt. Vous pourrez les remettre en programme depuis Maison. », then « Annuler » (focused) and the danger button. It fades and settles from 8 px below (200 ms, `@starting-style`) and leaves faster (150 ms); the scrim is `--scrim` (black 60 %).

### Focus and announcements
- The focus ring is a 2 px ink outline at 2 px offset on every control; a chip whose native box is hidden shows it via `:has(:focus-visible)`.
- Focus is never dropped to `<body>`: any button that can become inert while it may hold focus (paused commands, a running command, bounds, busy forms) uses `aria-disabled` with a guarded handler instead of `disabled`, a room opens as a sheet over the tableau (the tableau stays mounted, focus returns to the tile on close), and after any other navigation the new page's h1 takes focus. A skip link « Aller au contenu » comes first.
- Phones keep focused elements clear of the tab bar with `scroll-padding-bottom`.
- One app-level pair of live regions (`$lib/stores/announcer.svelte.ts`) carries announcements: command progress for commands sent from this browser (« … — envoi… », « … — confirmé », the failure assertively) and committed stepper values. Regions inserted with their text are not relied on.

### Raster provenance
`web/static/icon.svg` is hand-authored: the Tableau mark, an ink disc with a stroked « K » on a `--bg` tile (the Wordmark's glyph). `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (56 px safe padding) and `apple-touch-icon.png` (180 px) are rendered from it on the `--ground` colour by `web/scripts/icons.mjs` (`npm run icons`). Edit the SVG, then re-render; never edit the PNGs.

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
The language is chosen per device: in Réglages › Affichage › Langue or on Login, a stored choice
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

Every screen is now built in the Tableau look (« Screens » above). The components below were written before Tableau
and are still used inside those screens with the behaviour described here; their look follows the tokens and kit
above, and where a sentence names an older place or look, the « Screens » section wins.

#### Thermal Strip (signature)
The room's day on one line: an SVG sparkline of the measured temperature (2 px, round caps, stroked with the heat-ramp gradient so its colour at any height is the heat at that temperature) drawn only up to now, over the planned setpoint (1 px muted 3/3 dashed step, the legend's « Consigne »; at 70 % on cards). In programme mode the comfort periods appear as warm bands at 16 %. A 1 px ink **now-marker** (70 %) crosses the full height. On cards the y-domain includes 15–23 °C plus every known value, padded by 0.5 °C. In the room sheet (`yAxis`) the scale **fits the data** (`yRange` in `$lib/roomchart`): the temperatures read so far (the room's and each radiator's) and the setpoints drawn (never the recorded ones: a radiator off may report 0 °C), padded by 1 °C, widened to ticks every 1 or 2 °C (5 only past five intervals), never forced to 0 or to a fixed band; every tick is labelled in the 28 px gutter over a hairline grid line, and the scale moves only with the data, never with the inspected moment. A visually hidden sentence (range, latest reading, plan, pending request) describes it for screen readers. 96 px in the room sheet's « Aujourd’hui » chart, with window runs (a full-height hatch) and presence runs as a **4 px muted lane along the bottom** (55 %; its legend swatch the same thin bar), so presence never washes over the Confort band (`events`), and its legend. Maison's tiles use the kit MiniSpark instead. (Programme no longer shows it: its « Aujourd’hui » preview read as a flat line and was removed.)
- **Axis** (`axis`, on the room panel's day view): 00 · 06 · 12 · 18 · 24 in micro faint, with the current Paris time at the now-marker in ink 600. A fixed tick within 9 % of the marker is dropped so labels never collide.
- **Inspector** (`inspect`, the room sheet; not on read-only rooms nor Maison's tiles, which stay links): the chart reads any moment of the range, one `/api/history` bucket each (15 min on 24 h, 1 h on 7 j, 6 h on 30 j). The Scrubber covers the plot: a mouse hovers (leaving clears), a finger taps or drags inside the chart only (`touch-action: pan-y`; the sheet's drag-to-dismiss stays on its grab zone; a second tap on the same moment closes), and the slider takes focus with `←`/`→` (starting at now), `PageUp`/`PageDown`, `Home`/`End`, `Esc` (clears the moment without closing the sheet). A 1 px ink guide and an 8 px ink dot on the line mark it. Desktop: the ChartInspector card right of the guide, else left of it, else under the plot and its time row, clamped (`guideCard`): it never covers the point read and stays in the sheet. Phone: the docked sheet under the chart. Rows (`inspectMoment` in `$lib/roomchart`, the same for the card, the slider's `aria-valuetext`, the announcement on a tap and the hidden table): the time (« 14:00–14:15 »; « 14 oct., 13:00–14:00 » on 7 j and 30 j), Température (the mean of the radiators that read one; « Température moyenne », Minimum and Maximum over a 7 j / 30 j bucket), each radiator by name (indented) when the room has several, Consigne and Niveau (Confort, Éco, Manuel, Arrêt, Hors-gel from the recorded modes and levels; « Chauffe temporaire » / « Absence » over the running override's span), Chauffe (the working rate: « oui, 64 % de la puissance », « non », or its mean over a bucket), Présence and Fenêtre where a radiator detects them (« détectée », « par moments », « non détectée »). Later today reads « Consigne prévue » and the planned level (« — (à venir) » for the rest, nature « projection · d’après le programme »). A gap reads « — (pas de relevé à ce moment) », a radiator off « — (radiateur à l’arrêt) », never 0. Provenance: Cozytouch, the bucket's end, « mesuré · moyenne des radiateurs en ligne sur 15 min ». The guide and the card follow without animation (the card fades in, as every ChartInspector).
- **Outdoor line** (`outdoor`, the room sheet with a weather place, Plan 14): the published hourly outdoor temperature (`GET /api/weather/hourly` for the chart's window, cached per window) as a 1.25 px `--outdoor` (#8ec5b8) 4/3 dashed line under the room's line, drawn up to now only (never a forecast), broken over a gap above 2 h. It shares the room's °C scale (one axis, an honest inside/outside gap, never a hidden second axis) but joins the fitted range only within **5 °C of the room's own values** (`outdoorDomain`, `OUTDOOR_REACH` in `$lib/roomchart`; up to 6 tick intervals so the 2 °C step holds): on a 96 px chart a 0 °C morning would otherwise squeeze the room's 19–21 °C flat. Colder or warmer hours run off the plot's edge (clipped); the hidden sentence (« Dehors de −3,0 °C à 4,2 °C ») and the inspector keep the real values. The inspector adds « Dehors » (« Dehors moy. » on 30 j, the bucket's mean; « — (pas de météo pour ce moment) », « — (à venir) ») after the room's temperatures, with a note that it is published by a weather model. The legend adds « Dehors » (a dashed swatch) and ends with « · Open-Meteo » linking to https://open-meteo.com/ only when the line is drawn; without a place nothing is asked or shown.
- **Pending path:** a requested manual target draws a dashed ink line (1.25 px, 4/3 dash) from now to the end of the day; a pending comfort setpoint redraws the rest of today's programme dashed, clipped to after now, with eco shifted by the same amount.
- **Confirmation:** when the pending value disappears and the radiator now reports exactly that value, the path is held 250 ms and its dash closes to solid. If the reported value differs, it simply disappears. The same rule (`$lib/settle.svelte.ts`) drives every control below.
- Énergie's Température et chauffe draws a room's day with the same heat-ramp line and muted setpoint, at its own scale.

#### ModeSwitch
A three-way radiogroup (Arrêt / Manuel / Programme, "Prog." when compact) in a 40 px well (8 px radius, 1 px inset, 2 px gap). Segments are 36 px tall (6 px radius, concentric) with a 44 px hit area (`.hit`), 13 px 600 muted (ink on hover); the current segment is s2 with ink text and a muted edge (3:1 against the well). That edge is the signature mark (PendingEdge, an SVG rect): dashed while the mode is requested, closing solid when the radiator reports it. While pending the group is `aria-busy` and the segment is named « Manuel (en attente) ». Keyboard is **manual activation**, because a mode is a device command: roving tabindex (the current mode is the tab stop), arrows only move focus (wrapping), and Enter/Space sends. Choosing the current mode again sends nothing. Transitions 160 ms ease.

#### CommandSwitch
The mode switch's look and behaviour for any device command with a few values: a pilot-wire heater's « Allure » (Confort, Confort −1, Confort −2, Éco, Hors-gel, Arrêt; 2 or 3 per row, six as 3 + 3, four as 2 + 2) and a towel dryer's « Normal | Boost | Séchage ». Same well, 36 px segments (44 px hit) and 13 px 600 labels; rows of segments sit 8 px apart so the hit areas never overlap. Manual activation (arrows move focus, Enter/Space sends), the dashed → solid edge (PendingEdge) while the device has not reported the value, nothing checked when the reported value is unknown (the fact reads « — »). Only the values the device allows are offered.

#### Support chip
How far Kelvin vouches for a device: 11 px / 600, `--mu` text, 1 px `--line` border, radius 6 px, beside the radiator's or device's name. « Devrait fonctionner », « Expérimental », « Lecture seule » (on `--s2`); none for tested hardware. A read-only radiator shows the chip and one muted line saying Kelvin does not drive it, then its facts; no control. A control a radiator cannot take is absent, never shown disabled.

#### PendingTag
Inline 12 px status after a command: "Envoi…" (muted, with an 8 px dashed spinning dot), "Confirmé" (ok, its check drawing itself in 250 ms), or the error in bad with a ghost "Réessayer" and a 44 px dismiss button. States cross-fade in one cell (160 ms in, 150–200 ms out). The tag is visual: screen readers hear the progress from the app announcer (below).

#### RadiatorPanel
One per radiator in the room sheet's « Radiateurs · n » group, separated by hairlines, as a disclosure: the row (an h4 holding a 52 px button, `aria-expanded`) shows a radiator glyph (heat while it draws power, plug-off when offline), the name (14/600; the model and power when it has no name of its own), a 12 px muted line (power when named, « En ligne » or « Hors ligne depuis 14:32 », never red; with « Détails techniques » also the raw « RSSI n » and « dernier signal il y a 3 min » inline), the reading in ink (« — » muted when offline) and a turning chevron. Open (slide 220 ms): the facts list, the **Infos** section (modèle, puissance, niveau de signal as the raw « RSSI n » with its scale marked unverified, connexion, dernier signal, each « — » when unknown), the level or dryer switch, the mode switch and setpoint when the room has several radiators, the toggles (fenêtre ouverte, présence, veilleuse and its slider), and ghost « Renommer » (pencil) and « Faire clignoter » buttons. An offline radiator's commands are `aria-disabled` (its slider hidden) under « Les commandes reprendront quand il sera rallumé. ».

#### Alert callout
A calm notice on the screen it concerns: s1, hairline, 10 px, 13 px text, an alert glyph; bad alerts take the bad tint (8 % over s1, 60 % edge) and are an `alert` region, others a `status`. `radiator_unreachable` is always drawn neutral (a `status`), whatever its backend severity: an offline radiator is not a fault here; it shows in Home only (the room panel's offline notice says it there). A 44 px « Masquer » icon button ends the row. Never stacked more than the screen's own kinds (Énergie and the room); Home lists them all (`#alerts`). The callouts and the list hold their space while loading, so they never shift the layout (CLS ≤ 0.0003 measured).

#### Night-light slider
Under « Veilleuse » while it is on: « Intensité » and the value on one line, a native range (44 px), 1 % then steps of 5 %, keyboard ±5, PageUp/PageDown ±25, Home/End to 1 % and 100 %; sent 600 ms after the last move; the thumb is dashed until the radiator reports the value. Paused with `aria-disabled` (no pointer events), never `disabled`.

#### Strip bands
Window open: a neutral 45° hatch; presence: a 10 % neutral fill; both under the comfort wash, with their exact times in a title and their counts in the text equivalent. They are what the radiators reported, edges ±5 min: reports, not heat, so never a heat hue.


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

#### Linky status wording
One status, three places (Énergie's source line and callout, the Réglages Linky card and the Linky page), from `$lib/linky.ts`. On Énergie progress is the source line's words and dashed ring, never a callout. Progress is neutral and offers no link, because there is nothing to fix: never synced (« première synchronisation en attente »), quota (« historique en cours, la suite demain ») and throttled (« Enedis limite les requêtes, nouvel essai à 14:30 ») read as plain or muted text. Only `auth` (« MyElectricalData refuse le jeton Linky. » with « Renouveler le jeton ») and `error` (with « Ouvrir Linky ») use the bad colour and an alert role. Not connected at all is a neutral invitation (« Reliez votre compteur Linky », « Relier le Linky »). In the panel the good state reads « Relié · données jusqu’au 13/10 · synchro il y a 5 min ».

#### Form fields
A field is a label wrapping its control: a 12 px muted caption, 4 px, then a 36 px well (`--ctl-h`; in, field-line edge, 8 px, 0 × 10 px padding; owner ruling: fields were « gros ») set in 15 px body with tabular figures, 16 px below 1024 px so iOS never zooms on focus (`--fs-field`). The base style is global in `app.css`; components add only layout. Selects share the input's exact geometry. Placeholders are muted (never the browser grey) and never carry the only instruction: a hint is a 12 px muted caption under the field, linked with `aria-describedby` (Linky: « Enregistré », then « Laissez vide pour garder le jeton. »). An invalid field is `aria-invalid`, edged in bad, linked to its error and focused. Units live in the caption, never in the field: « Abonnement (€/mois) », « Prix heures creuses (€/kWh) ». Decimal fields accept a comma or a point. **Width is intrinsic**, never a stretched column for a short value: time fields `--w-time` (6.5 rem), dates `--w-date` (10 rem), prices `.w-price` (7.5 rem), kVA `.w-kva` (8 rem), text fields `.w-text` (`min(100 %, 22 rem)`), the PDL 14 digits; groups wrap (`flex-wrap`, 12 px × 16 px gaps) instead of grid columns. The caption wraps the field, so the tap area is caption plus field. A repeated group (Heures creuses slots) sits in a hairline-topped fieldset whose legend is a section label, with each slot on one line « [22:00] → [06:00] [Retirer] » (the captions « Début / Fin de la plage n » stay as the fields' hidden names) and a ghost « Ajouter une plage ». Errors follow in 13 px bad (alert), success in 13 px ok (status), then one primary button, left-aligned.


#### Tariff form
« Applicable à partir du » heads the form (focused when the editor opens; in a correction, read-only at the row's own date with « Corrige les coûts passés depuis le … » as its description, and the off-peak hours' date read-only at the schedule's own date, described the same way), then the option Segmented (Base · HC/HP · Tempo); the fields follow the option at their intrinsic widths: one price, two (each caption starting with its 8 px tariff-blue swatch, HC hatched), or six in a two-column grid (each colour's off-peak then peak; the caption carries the TempoDot for the day colour **and** the swatch for the hour type). HC/HP has its own « Applicable à partir du » and an optional season split: each season is a hairline-topped block with twelve 36 px month chips (copy-chip style, 44 px hit, 8 px apart) and up to three slots. Tempo has its two hour fields and the note on the 06:00 day; « Préremplir avec les prix Tempo publiés » is a ghost button whose result states its source and date (the Paris day) and saves nothing. Enedis' new off-peak hours appear as a calm callout inside the HC section with a date and « Ajouter ces heures creuses à partir du … ». Both time fields stay whole at 320 px.

