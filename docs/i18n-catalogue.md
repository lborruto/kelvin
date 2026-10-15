# Kelvin i18n catalogue (design snapshot, 2026-10-14)

The design Plan 7 implements, kept for its inventory, codes and reasoning. The live catalogue is
`web/src/lib/i18n/fr.ts` and `en.ts` (web) and `backend/kelvin/errors.py`, `labels.py` (backend
codes, exported to `web/src/lib/i18n/api-codes.json`). Counts and line references below are the
2026-10-14 snapshot.

Status: was a design, now implemented by Plan 7 (2026-10-14). Written against branch `feat/polish` on 2026-10-14, read-only. A UI polish batch
is landing at the same time, so every count and line below is a snapshot. The plan (§10) re-extracts strings
with a script instead of trusting this list.

Goals: the UI is available in French and English, French stays the default, and URL paths are English whatever
the UI language. Nothing about device behaviour changes.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Library | **A hand-rolled, fully typed dictionary** (`web/src/lib/i18n/`): zero new dependencies, with `Intl.PluralRules` for plurals. Call sites read `m.area.key(…)`, the same shape as Paraglide JS, so moving to Paraglide later is a mechanical change. |
| English variant | **en-GB** (24 h clock, day/month order, `13 October 2026`), with metric units and € kept. |
| Default locale | **French, always**, unless the user picks English. A first visit with `navigator.language` not starting with `fr` gets English, and that is only a starting value until the user chooses. |
| Switch | Maison › Réglages, under « Langue » next to « Thème »; also a small FR / EN switch on the login screen. Stored in `localStorage['kelvin-locale']`; an inline script in `app.html` sets `<html lang>` before the app boots. |
| Backend messages | **(b) Codes plus parameters, translated by the web app.** The backend keeps its French `detail` as a fallback for curl, logs and older clients. Accept-Language is not used. |
| URL paths | English: `/rooms/[id]`, `/schedule`, `/energy`, `/home`, `/login`. Old French paths redirect on the client, keeping query and hash. This is phase 1 of the plan. |
| Tests | vitest runs in both locales where copy matters. Type checking guarantees no missing keys; a script finds unused keys and leftover hard-coded French; Playwright runs a smoke test per locale. |

---

## 1. Library choice

Context: SvelteKit 2.70 with `adapter-static` (SPA, `ssr = false`), Svelte 5.57 runes, Vite 8, a PWA through
`@vite-pwa/sveltekit` (Workbox precache, works offline), only two locales, about 330 messages, no localised URLs
(paths are English, see §4b), and a project that keeps its runtime dependencies to four packages.

| | Paraglide JS (inlang) | svelte-i18n | typesafe-i18n | Hand-rolled typed dictionary |
|---|---|---|---|---|
| Version (≥ 2 weeks old on 2026-10-14) | `@inlang/paraglide-js` **2.25.4** (2026-09-17; 2.26.0 and 2.27.0 are newer than 2 weeks). Plugin `@inlang/plugin-message-format` **4.4.4** (2026-08-31). | **4.0.1** (last release 2024-10; stale) | **5.27.1** (2026-02-11, after a 2023–2026 gap; maintenance uncertain) | none |
| Runtime size | Very small. Messages compile to plain functions, but every locale's string is in each function (no per-locale split by default). | About 15–20 kB gz (`intl-messageformat` ICU parser at runtime) | About 1 kB runtime plus the dictionaries | About 0.3 kB of helpers plus both dictionaries (about 6 kB gz for 330 × 2 messages) |
| Type safety | Good: generated typed functions and typed params | Weak: string keys, `$_('key')`, no param types | Good: generated types | **Complete**: `en` is typed `Messages = typeof fr`, so a missing key or wrong param signature is a `svelte-check` error |
| Svelte 5 runes | Messages are not reactive. By default `setLocale()` reloads the page; without the reload you have to force a re-render. | Svelte 4 stores (`$_`), which work but are not runes-native | Svelte stores adapter | A `$state` locale read through a getter, so every template and `$derived` re-renders on switch with no reload |
| SSR | Not needed (it supports it) | Not needed | Not needed | Not needed |
| Build step | Compiler plus Vite plugin, a generated `src/lib/paraglide/`, and `project.inlang/settings.json`. The default setup **loads plugins from a CDN URL at compile time**: network inside the Docker build, plus a supply-chain surface. | None | Generator watcher | None |
| Plurals | Variants with `Intl.PluralRules` | ICU at runtime | Own syntax | `Intl.PluralRules` in a 10-line helper |
| ICU vs simple | Variants (ICU-like) | Full ICU | Own | Plain TS functions: interpolation is a template literal and branching is code |
| PWA offline | Fine | Fine (dictionaries bundled) | Fine | Fine (bundled, precached) |
| Tooling | Sherlock lint, Fink editor, machine translation | none | none | Our own scripts (§7) |

**Recommendation: the hand-rolled typed dictionary.** Reasons:

1. With two locales and about 330 messages, a library's real benefits (lazy-loaded locales, translator tooling,
   ICU for many languages) do not pay for themselves. Paraglide's per-message tree-shaking saves almost nothing
   here, because every message is used and each one carries both locales anyway.
2. Type safety is complete with no code generation: `const en: Messages = {…}` fails `npm run check` when a key
   is missing or extra, or when a function's parameters differ from French.
3. Switching at runtime needs no reload. That matters on the login screen and in Réglages, where a reload during
   PWA standalone use feels broken.
4. No new dependency, no CDN fetch during `npm run build` or the Docker build, and no entry in
   `THIRD_PARTY_NOTICES.md`. This fits the repo's dependency hygiene and the rule that pins SvelteKit 2.x for
   `@vite-pwa/sveltekit`, since there is one less plugin to keep compatible with Vite 8.
5. Leaving later is easy: call sites already look like Paraglide (`m.rooms_count({ n })` and `m.rooms.count(n)`
   differ only by a codemod).

Revisit this if a third locale arrives or a non-developer translator joins. Then move to Paraglide JS 2.x, pinned
exactly, with the plugin vendored or pinned by exact URL version.

### 1.1 Shape of `web/src/lib/i18n/`

```
lib/i18n/
  fr.ts          // source of truth: `export const fr = { … } as const satisfies Dict`
  en.ts          // `export const en: Messages = { … }` (Messages = typeof fr, widened to string)
  index.svelte.ts// locale state, `m` proxy, setLocale/initLocale, plural(), list(), capFirst()
  format.ts      // locale-aware formatters (moved from lib/format.ts, see §3)
  codes.ts       // backend code → message mapping (§5)
```

```ts
// index.svelte.ts (sketch)
export type Locale = 'fr' | 'en';
const DICTS = { fr, en } satisfies Record<Locale, Messages>;
const state = $state({ locale: 'fr' as Locale });
/** Reactive: reading m.x inside a template or $derived re-runs on setLocale. */
export const m: Messages = new Proxy({} as Messages, { get: (_, k) => DICTS[state.locale][k as keyof Messages] });
export const locale = { get current() { return state.locale; } };
export function setLocale(l: Locale) { /* state, localStorage, <html lang>, document.title refresh */ }
export function plural(n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) {
  return forms[new Intl.PluralRules(INTL[state.locale]).select(n)] ?? forms.other;
}
```

Messages are values (`'Pièces'`) or functions (`(n: number) => …`). Grouped objects give `m.nav.rooms`,
`m.rooms.count(3)`. Using `as const` in `fr.ts` and a `Widen<>` type for `Messages` keeps literal types out of
`en`.

**One rule the code depends on:** never resolve a message at module scope or in a plain `const`. Arrays such as
`links`, `THEMES`, `PERIODS`, `RANGES`, `MODE_LABEL` and `DAY_LABEL` hold **keys or getters**, resolved in the
template or in a `$derived`. Otherwise they would freeze in the boot locale. A vitest test switches the locale
and checks that the tab bar, the period Segmented and the mode chips re-render (§7).

---

## 2. String inventory

Extraction was a heuristic script over every non-test `.svelte`/`.ts` file under `web/src`, plus a manual pass
(script: `scratchpad/i18n/extract.py`; raw output `scratchpad/i18n/raw.txt`). The counts are **unique messages
after merging duplicates and folding concatenated fragments into one parameterised message**.

### 2.1 Count per file (web)

| File | Messages | Notes |
|---|---:|---|
| `routes/energie/+page.svelte` | 56 | Hero, Linky notes, projection, curve, tables. The heaviest file. |
| `routes/maison/+page.svelte` | 36 | Absence, En cours, Actions, Tarif/Linky shells, Réglages (+ Langue, new) |
| `routes/programme/+page.svelte` | 25 | Legend with `<strong>`, copy tools, Modifications, statuses |
| `lib/components/TariffForm.svelte` | 23 | Includes the prefill sentence with a list |
| `lib/components/RoomInspector.svelte` | 21 | |
| `lib/components/LinkyPanel.svelte` | 19 | Includes the help text with a link |
| `lib/program.ts` | 20 | 7 + 7 day names, next change ×3, validation ×3 |
| `lib/format.ts` | 14 | Relative time ×4, MODE_LABEL ×5, LEVEL_LABEL ×5 |
| `lib/components/RadiatorPanel.svelte` | 13 | |
| `routes/login/+page.svelte` | 11 | (+2 new: language switch) |
| `lib/components/RoomCard.svelte` | 7 | |
| `lib/components/CurveChart.svelte` | 6 | |
| `lib/components/ProgramDay.svelte` | 6 | |
| `lib/energy.ts` | 7 | Periods ×3, comparisons ×3, span « du … au … » |
| `lib/components/HouseActions.svelte` | 5 | |
| `lib/components/Banner.svelte` | 5 | |
| `lib/components/PendingTag.svelte` | 5 | |
| `lib/components/Sidebar.svelte` + `TabBar.svelte` | 5 | Shared `nav.*` |
| `lib/components/ModeSwitch.svelte` | 2 | « Mode », « Prog. »; the rest reuse `mode.*` |
| `lib/components/PiecesView.svelte` | 4 | |
| `lib/components/OverrideBadge.svelte` | 3 | |
| `lib/components/EnergyBars.svelte` | 3 | |
| `lib/api/client.ts` | 3 | |
| `lib/stores/house.svelte.ts` | 3 | |
| `lib/components/Stepper.svelte` | 2 | |
| `lib/actions.ts` | 1 | |
| `lib/components/Toasts.svelte` | 1 | |
| `routes/+page.svelte`, `pieces/[id]`, page titles | 2 | `« {page} · Kelvin »` and the « Pièce » fallback |
| `app.html` / `vite.config.ts` manifest | 2 | `description`, `<title>`, both static (§4) |
| **Web total** | **≈ 330** | 312 extracted plus about 18 new (language switch, mapping of backend codes that were raw text, aria labels found while folding) |

The backend has **69 user-facing messages** (§5.3): 53 error messages, 4 Linky status messages and 12
pending-action labels. All of them become codes the web translates, plus 4 `last_error_code` values, for **73
backend codes** in total. The simulator-data startup error is operator-facing and becomes English, not a code.

**Grand total for translation: about 330 web messages plus 73 backend codes mapped in `codes.ts`, about 400
catalogue entries per locale.**

### 2.2 Key naming

- Groups follow the UI area, in camelCase: `common`, `nav`, `page` (titles), `mode`, `level`, `pending`,
  `banner`, `rooms`, `room`, `radiator`, `boost`, `program` (code name; the copy says Programme/Schedule), `copy`,
  `energy`, `curve`, `linky`, `tariff`, `away`, `home` (the Maison page), `settings`, `login`, `ago`,
  `days`, `daysShort`, `error` (client-side), `api` (backend codes, §5).
- Keys name the **role**, not the French words: `room.windowOpen`, not `room.fenetreOuverte`.
- Aria-only strings end in `Label` (`radiator.renameLabel`), and placeholders end in `Placeholder`.
- One message per sentence. Never stitch fragments together: word order differs (« Consommation de la maison par
  mois » vs “Home consumption by month”).
- Shared words live in `common.*` only when they mean the same in every context (`common.cancel`,
  `common.loading`, `common.close`, `common.dismiss`, `common.retry`). « Annuler » as “Cancel” (dialog) and
  « Annuler » as “Undo changes” (Programme) are **different keys**.

### 2.3 Plurals and interpolation

- `lib/plural.ts` (`plural(n, one, many)`, using the French rule `n < 2`) becomes the locale-aware `plural(n, forms)`
  backed by `Intl.PluralRules`. French gives 0 → `one` (« 0 pièce »), English gives 0 → `other` (“0 rooms”),
  matching each language's grammar. Its current call sites are rooms, calls, missing days, plus the hand-rolled
  `radiateur{s}` in RoomInspector.
  ```ts
  rooms: { count: (n: number) => `${n} ${plural(n, { one: 'pièce', other: 'pièces' })}` }      // fr
  rooms: { count: (n: number) => `${n} ${plural(n, { one: 'room', other: 'rooms' })}` }        // en
  ```
  The number inside a counted message goes through the locale's integer formatter (`fmtInt`), so 1000 shows as
  “1,000” in English.
- **Relative time** (`fmtAgo`): « à l’instant » / “just now”, « il y a 5 min » / “5 min ago”, « il y a 3 h » /
  “3 h ago”, « le mar. 13 oct., 18:05 » / “on Tue 13 Oct, 18:05”. These stay as messages with parameters, not
  `Intl.RelativeTimeFormat`, because its short style gives « il y a 5 min » but “5 min. ago” in en-US, and the
  hours wording is inconsistent across engines. Tests pin the exact text.
- **Units and figures**: the message receives already-formatted figures (`fmtTemp`, `fmtKwh`, `fmtEur`,
  `fmtPct`), so messages never format numbers. Example: `boost.active: (temp, time) => \`Forcé à ${temp}
  jusqu’à ${time}.\`` / `` `Boosted to ${temp} until ${time}.` ``.
- **Lists**: the tariff prefill (« 22:00–06:00 et 12:00–14:00 ») uses `Intl.ListFormat(locale, { type:
  'conjunction' })`. Room lists on Maison (« Salon, Chambre 1 ») use `type: 'unit'` or a plain comma.
- **Rich text** (link or `<strong>` inside a sentence) is split into a message with **named slots** rendered by a
  tiny `<T>` snippet component: `energy.linkyCallout: { before, link, after }` or a function returning parts.
  Affected: Énergie callout (link Réglages), « Renseignez le tarif pour voir le coût » (link at the start),
  heating share (`<strong>` figure), Programme legend (`<strong>` ×2), LinkyPanel help (link in the middle),
  Banner (« Se reconnecter » link). Six messages.
- **Capitalisation**: never `toLowerCase()` a translated word. Month and day names come from `Intl` with the
  correct casing per locale (fr lowercase, en capitalised); `capFirst()` is used only at the start of a sentence.

### 2.4 Places that build sentences by concatenation (must change)

| Where | Today | Change |
|---|---|---|
| `PiecesView.svelte` | `{plural(n,'pièce')} · {heatingCount} en chauffe{#if away} · Absence en cours` | `rooms.summary(n, heating)` plus a separate `rooms.awayActive`, joined with ` · ` (the separator is not language-specific) |
| `RoomInspector.svelte` | `{n} radiateur{n > 1 ? 's' : ''}` | `room.radiatorCount(n)` with plurals |
| `RoomInspector.svelte` | `label="{room.name}, température sur {RANGES[range].label}"` | `room.historyLabel(name, rangeKey)`. The range label « 7 j » becomes “7 d”. |
| `RoomCard`/`RoomTodayStrip` | `` `${room.name}, température d’aujourd’hui` `` | `room.todayLabel(name)` |
| `programme/+page.svelte` | `"{roomName}, température d’aujourd’hui et plages de ce programme"` | `program.previewLabel(name)` |
| `program.ts fmtNextChange` | `` `${when}${time} → ${label}` `` with `DAY_LABEL[…].toLowerCase()` and `'demain '` | `program.nextToday(time, level)`, `program.nextTomorrow(time, level)`, `program.nextOn(weekday, time, level)`; weekday from `Intl` (fr « lundi », en “Monday”) |
| `energy.ts compareLabel` | `` `par rapport à ${monthName().toLowerCase()}, mêmes jours` `` | `energy.compareDay()`, `energy.compareMonth(month)`, `energy.compareYear(year)`; `month` from Intl in the right case |
| `energy.ts spanLabel` | `['du', a, 'au', b].join(NB)` | `energy.span(a, b)`: fr `du {a} au {b}`, en `{a} – {b}` (NBSP so it never wraps) |
| `energie/+page.svelte` `UNIT_WORD` | `"Consommation de la maison par {UNIT_WORD[shown]}"` | `energy.houseChartLabel(period)` and `energy.radiatorChartLabel(period)` as whole sentences (3 periods each, via a switch inside the function) |
| `energie/+page.svelte heroFigures` | `` `HC ${kwh}` ``, `` `Radiateurs ${kwh}` `` | `energy.hcFigure(kwh)`, `energy.hpFigure(kwh)`, `energy.radiatorsFigure(kwh)`. The short HC/HP tags become “Off-peak”/“Peak” in English (§6), so they are messages too. |
| `energie/+page.svelte` heating share | `<strong>{pct}</strong> de la consommation… {since ? \`depuis le ${d}\` : 'sur la période'} vient des radiateurs.` | `energy.heatingShare({ since })` returning parts around the figure slot |
| `energie/+page.svelte` projection | `{monthName}, mois complet` and `{method text} Estimation.` | `energy.projMonth(month)`, `energy.projMethodLinear` / `projMethodSeasonal` (« Estimation. » included) |
| `energie/+page.svelte` rooms | `` `${fmtKwh} · ${Math.round(…)} %` `` | Use `fmtPct(share)`, not a hand-built ` %` |
| `energie/+page.svelte` | `` `Courbe du ${date}` ``, `` `Consommation par demi-heure le ${date}` `` | `curve.title(date)`, `curve.label(date)` |
| `energie/+page.svelte errorText` | Compares `e.message !== 'Erreur inattendue.'` | Compare `e.code`, never translated text (§5) |
| `LinkyPanel.svelte line` | `` `Relié${data} · historique…` `` and `` `à ${time}` `` / `'plus tard'` | `linky.lineOk(day?)`, `linky.lineQuota(day?)`, `linky.lineThrottledAt(day?, time)`, `linky.lineThrottledLater(day?)` |
| `LinkyPanel.svelte` | `{plural(calls,'appel')} sur {budget} aujourd’hui` | `linky.calls(n, budget)` |
| `Banner.svelte` | `` `Cozytouch injoignable${age}` `` with `` ` — données ${ago}` `` | `banner.unreachable()` / `banner.unreachableSince(ago)` |
| `OverrideBadge.svelte` | `Forcé {temp} → {time}` / `Absence {temp}` | `override.boost(temp, time)`, `override.away(temp)` |
| `maison/+page.svelte` | `` `jusqu’au ${dateTime}` ``, `· dernière synchro {ago}`, `aria-label="Annuler {kind} — {rooms}"` | `away.until(dt)`, `settings.lastSync(ago)`, `away.cancelLabel(kind, rooms)` |
| `programme/+page.svelte` | `<strong>{day}</strong> : {segs} (avant : {segs})`, `{error} Modifiez puis Envoyer.` | `program.changeLine(day, after, before)`; `program.staleHint` as its own sentence |
| `ProgramDay.svelte` | `"Supprimer la plage {n} du {label}"`, `"Ajouter une plage le {label}"`, `"{label}, plage {n}, début"` | `program.removeSlotLabel(n, day)`, `program.addSlotLabel(day)`, `program.slotStartLabel(day, n)`. French « du Lundi » / « le Lundi » and English “from Monday”/“on Monday” both live inside the message. |
| `ProgramDay.svelte` | `data-testid="bar-{label}"` (« bar-Lundi ») | `data-testid="bar-{day}"` with the **day key** (`bar-monday`), so tests do not depend on the locale |
| `RadiatorPanel.svelte` | `` `${model ?? 'Radiateur'}${power ? ` · ${power} W` : ''}` ``, `"Mode — {title}"`, `"Consigne {title}"` | `radiator.facts(model?, watts?)`, `radiator.modeLabel(title)`, `radiator.setpointLabel(title)`. **The comparison `radiator.name !== 'Radiateur'` stays literal**: it is the upstream device default, not UI copy. |
| `Stepper.svelte` | `"Diminuer {label}"` | `stepper.decrease(label)` / `stepper.increase(label)` |
| `TariffForm.svelte` prefill | `({kva}&nbsp;kVA, heures creuses {slots.join(' et ')})` | `tariff.prefilled(kva, slotsList)` with `Intl.ListFormat` |
| `house.svelte.ts` | `` `${p.label} : résultat inconnu — vérifiez.` `` | `pending.unknownToast(actionText)`, where the action text comes from the code (§5) |
| Page titles | `"Pièces · Kelvin"`, `"{name} · Kelvin"` | `page.title(name)`; titles become reactive (`<svelte:head>` re-renders) |
| `RoomInspector` RANGES | Labels `'24 h'`, `'7 j'`, `'30 j'` at module scope | Keys with labels resolved in `$derived` (`range.day`/`week`/`month` → « 24 h », « 7 j », « 30 j » / “24 h”, “7 d”, “30 d”) |

---

## 3. Formatting per locale

**Recommendation: `en-GB`.** It gives a 24 h clock, day/month order (« 13/10 » stays “13/10”), and
`13 October 2026`, a short, unambiguous form for a European product. Paris time and metric units stay. `en-US`
would give `06:05 PM`, `10/1` and `Oct 13`; for a product about French radiators and Enedis that is worse, and it
would break the 24 h and `HH:MM` rules everywhere (schedule inputs, axis ticks).

Measured on Node 26 (V8 Intl):

| | fr-FR | en-GB |
|---|---|---|
| Integer 2400 | `2 400` (group separator **U+202F**) | `2,400` |
| 20.5, 1 decimal | `20,5` | `20.5` |
| Long date | `13 octobre 2026` | `13 October 2026` |
| Day + time | `mar. 13 oct., 18:05` | `Tue 13 Oct, 18:05` |
| Clock | `18:05` | `18:05` (h23) |
| Month and year | `octobre 2026` → capFirst `Octobre 2026` | `October 2026` |
| Weekday | `lundi` | `Monday` |
| List | `A et B` | `A and B` |
| `PluralRules(0)` | `one` | `other` |

Rules:

1. **One locale-aware formatter module**, `lib/i18n/format.ts`. `Intl.NumberFormat` and `DateTimeFormat`
   instances are cached per locale (`Map<Locale, …>`), and every `fmt*` reads `locale.current`, so a template
   that calls `fmtTemp(x)` re-renders on switch. Time zone stays `Europe/Paris` and `hourCycle: 'h23'` is forced
   explicitly for both locales (do not rely on the locale default).
2. **Units stay metric**: °C, kWh, Wh, W, kVA, €, € /kWh, € /month. `Intl` has no `kilowatt-hour` unit (it
   throws `RangeError`), so units stay as suffixes.
3. **Spacing before units**:
   - French: **NBSP (U+00A0)** before every unit and %: `20,5 °C`, `2 400 kWh`, `42 %`, `16,20 €`.
   - English: a **NBSP before °C, kWh, Wh, W, kVA** (SI style, so no line break); **no space before %**
     (`42%`); **€ before the number with no space** (`€16.20`, `€0.2068/kWh`). Use
     `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' })` for the hero and projections, and the
     bare figure plus header unit for table columns as today.
   - Implement this as one `unit(value, unit)` helper with a per-locale table, not as string literals at call
     sites.
4. **Decimal mark**: comma in French, point in English. `parseDecimal` keeps accepting **both** in both locales
   (users paste prices from bills). In English, a comma that is a thousands separator (`1,234.5`) is stripped
   when a point is also present; the field rule stays “a comma or a point”.
5. **True minus `−` (U+2212)** for negative deltas in both locales. `fmtDelta` already uses it and keeps it
   (English typography accepts it, and it matches tabular figures).
6. **Missing value `—`** (em dash) in both locales, unchanged; it is not text, so it is not a message. In
   English it reads naturally too.
7. **Apostrophes**: French messages use `’` (U+2019). English messages use `’` too (“Kelvin can’t reach…”), so
   the typographic rule is the same and is checked by the same test (§7).
8. **Quotes**: French « … » with NBSP inside, English “…”. Only a few messages (backend command names in
   `api.unsupportedCommand`) use them.
9. **Dates in charts**: `bucketLabel` keeps numeric `d/m` and `mm/yy` (already en-GB order). `fmtDay` stays
   `13/10` in both.
10. **Relative time**: messages, see §2.3. The fallback beyond 24 h uses `fmtDateTime` in the active locale.
11. **Schedule inputs**: `<input type="time">` renders with the browser's locale, not ours. Kelvin values stay
    `HH:MM`, and the browser may show AM/PM on an en-US OS. That is acceptable and out of our control; document
    it.
12. **Heat ramp and axis ticks**: `00 · 06 · 12 · 18 · 24` stay the same in both locales.

---

## 4. Locale selection, persistence, `lang`, manifest, login

### 4.1 Which locale

**Recommendation: French by default, with a one-time hint from the browser and an explicit choice that always
wins.**

```
stored = localStorage['kelvin-locale']            // 'fr' | 'en' | absent
locale = stored ?? (navigator.languages?.some(l => /^fr\b/i.test(l)) ? 'fr'
                 : navigator.language ? 'en' : 'fr')
```

- “French stays the default” means: no stored choice, no usable `navigator` (tests, privacy modes) → `fr`. A
  French-speaking household never sees English unless someone switches. Checking every entry in
  `navigator.languages`, not only the first, keeps an `en-US` phone that also lists French on French.
- An English-only browser starts in English. This is a convenience for guests and non-French members of the
  household, not a commitment: the switch is one tap away and is remembered.
- No system option (unlike the theme). There are two languages and an explicit choice; a third « Système »
  option only adds confusion.
- The choice is per device and browser (localStorage), like the theme. Kelvin has one shared household account,
  so a server-side preference would force one language on everyone.

### 4.2 Where to switch

- **Maison › Réglages**: a row « Langue » / “Language” with a `Segmented` of **« Français » | « English »**. Each
  label is written in its own language and never translated, so someone who does not read the current language
  can still find theirs. Set `lang="fr"` / `lang="en"` on each option for screen readers. It sits directly under
  « Thème », with the same geometry.
- **Login screen** (before login, outside the shell): a compact two-option `Segmented` « FR | EN » (with aria
  labels « Français » / “English”) at the bottom of the box, under the simulator hint. A guest must be able to
  read the login screen before signing in.
- Switching never reloads, never touches the session, and keeps unsent Programme edits.

### 4.3 Persistence and `lang`

- Key `kelvin-locale` (same `kelvin-` prefix as `kelvin-theme`), wrapped in `try/catch` like `theme.ts` (private
  mode does not persist).
- **`app.html`**: change `<html lang="fr">` to keep `fr` as the static default, and extend the existing inline
  theme script so it also reads `kelvin-locale` (and the `navigator` hint) and sets
  `document.documentElement.lang` before first paint. This avoids a flash of wrongly hyphenated or pronounced
  content for screen readers. `setLocale()` updates `lang` at runtime too.
- `<title>Kelvin</title>` in `app.html` is the brand and is not translated.
- `stores/locale.ts` mirrors `stores/theme.ts` (get/set/apply), with tests in the style of `theme.test.ts`.

### 4.4 PWA manifest

The manifest is generated once at build time by `@vite-pwa/sveltekit` (`vite.config.ts`). A web app manifest
**cannot vary by user language** (one file, one `lang`; `name`/`description` localisation in the manifest spec is
not implemented by browsers). So:

- `name` / `short_name` stay **« Kelvin »** in both languages: it is the brand, so nothing to translate.
- `description` (shown only by some install dialogs and stores) becomes bilingual and neutral:
  `'Le chauffage de la maison · Home heating'`, or stays French with `lang: 'fr'`. Recommendation: **keep
  `lang: 'fr'` and the French description**, since French is the product's default. Document the limit in
  web/README.
- `start_url` stays `/` (the Rooms page, already English-neutral). There are **no `shortcuts`** today. If
  shortcuts are added later, their `name`s are static too, so prefer English paths and the French names, or skip
  them.
- `<meta name="theme-color">` is unchanged.

### 4.5 The login screen before login

The login page and the `Toasts` are outside the shell but inside the same SvelteKit app, so `m.*` works there.
The language comes from localStorage or `navigator` before any API call. Backend errors at login (bad
credentials, throttling, unreachable) arrive as **codes** (§5) and are therefore shown in the chosen language
too, even though the server does not know it.

---

## 4b. English URL paths (owner requirement)

Paths are English whatever the UI language (the API is already English).

| Old (French) | New | Notes |
|---|---|---|
| `/` | `/` | Rooms list (unchanged) |
| `/pieces/[id]` | `/rooms/[id]` | |
| `/programme` | `/schedule` | |
| `/energie` | `/energy` | |
| `/maison` | `/home` | The Maison page. `/` stays the Rooms list, so `/home` is **not** the start page. That is the owner's choice; the nav label stays « Maison » / “Home”. |
| `/maison#absence` | `/home#away` | Anchor renamed for consistency (assumed; the owner listed only tarif and linky) |
| `/maison#tarif` | `/home#tariff` | |
| `/maison#linky` | `/home#linky` | Anchor unchanged |
| `/login` | `/login` | Unchanged |

### 4b.1 How to redirect in an adapter-static SPA

Constraints: there is no server-side routing (FastAPI serves `index.html` for any non-file path,
`backend/kelvin/api/web.py`; Workbox `navigateFallback: '/index.html'` does the same offline). Universal `load`
functions **cannot read `url.hash`** in SvelteKit, so a `+page.ts` redirect would drop `#tariff`.

**Recommendation: a pre-boot rewrite in `app.html` plus a single canonicalisation function in the app.**

1. `web/src/lib/paths.ts` (source of truth):
   ```ts
   export const ROUTES = { rooms: '/', room: (id: string) => `/rooms/${encodeURIComponent(id)}`,
     schedule: '/schedule', energy: '/energy', home: '/home', login: '/login' } as const;
   export const ANCHORS = { away: 'away', tariff: 'tariff', linky: 'linky' } as const;
   /** Old French path → English path. Used by app.html (mirrored) and safeNext(). */
   export const LEGACY: [RegExp, string][] = [
     [/^\/pieces(\/.*)?$/, '/rooms$1'], [/^\/programme\/?$/, '/schedule'],
     [/^\/energie\/?$/, '/energy'], [/^\/maison\/?$/, '/home'] ];
   export const LEGACY_HASH: Record<string, string> = { '#tarif': '#tariff', '#absence': '#away' };
   export function canonical(pathname: string, hash = ''): { pathname: string; hash: string } | null;
   ```
2. **`app.html` inline script** (next to the theme script, before `%sveltekit.head%`): if `location.pathname`
   matches the legacy table, call `history.replaceState(null, '', newPath + location.search + newHash)`.
   This happens **before the SvelteKit router reads the URL**, so the app boots on `/home#tariff` directly: no
   double render, the hash is kept and mapped, the query is kept, and there is no history entry for the old path.
   It works the same:
   - from a **bookmark** or typed URL (the backend serves `index.html` for `/maison`);
   - **offline** in the installed PWA (the Workbox `navigateFallback` serves the precached `index.html` for
     `/maison`, and the script rewrites);
   - for an **installed PWA whose start URL** was a French path. Today it is `/`, so this is only a safeguard.
3. **`safeNext()` / `loginHref()`** apply `canonical()`. A stale `/login?next=%2Fmaison%23tarif` (from a
   bookmark or an old tab) lands on `/home#tariff` after login. This matters because the app.html script runs
   only on full page loads, not on `goto()`.
4. **A safety net for client navigation**: a `src/hooks.client.ts` `reroute` is **not** used, because it would
   render the page under the French URL. Instead, the root `+error.svelte` (404) calls `canonical()` and
   `goto(…, { replaceState: true })` when the missing path is a legacy one. That covers a stale `<a href="/maison">`
   from an older bundle in an open tab after deploy.
5. **No service worker change.** The `navigateFallback` already covers every path except `/api/`. The precache
   version changes with the build, so an old SW hands over to the new `index.html` as `registerType: 'autoUpdate'`
   does today.
6. **Parity test**: `paths.test.ts` reads `web/src/app.html`, extracts the inline legacy table (marked by
   `/* legacy-paths:start */ … /* legacy-paths:end */`), and checks it equals `LEGACY`/`LEGACY_HASH`. Unit tests
   cover `canonical()` for each row: query and hash are kept, `/pieces/p-salon?x=1#y` → `/rooms/p-salon?x=1#y`,
   and `/piecesX` is not matched.

Keep the redirects for at least one minor release (say until 1.0), then decide. The table is tiny and costs
nothing, so the default is to keep it.

### 4b.2 Every place that references the old paths (snapshot)

Web source:
- `lib/components/Sidebar.svelte`, `TabBar.svelte`: `links`/`tabs` hrefs and `active()`'s
  `startsWith('/pieces')`. Use `ROUTES.*` and `startsWith('/rooms')`, and share one `NAV` list between the two
  components (today it is duplicated).
- `lib/components/RoomCard.svelte`: `href="/pieces/{room.id}"`.
- `lib/components/RoomList.svelte`: ``goto(`/pieces/${id}`)``.
- `lib/components/HouseActions.svelte`: `href="/maison#absence"`.
- `routes/energie/+page.svelte`: `href="/maison#linky"` ×2 and `href="/maison#tarif"`.
- `routes/maison/+page.svelte`: `id="absence"`, `id="tarif"`, `id="linky"` become `away`, `tariff`, `linky`.
- Route directories: `routes/pieces/[id]` → `routes/rooms/[id]`, `routes/programme` → `routes/schedule`,
  `routes/energie` → `routes/energy`, `routes/maison` → `routes/home` (with their colocated tests:
  `energie.test.ts`, `maison.test.ts`, `programme.test.ts` → renamed, `describe('/programme')` → `'/schedule'`).
- `lib/auth.ts`: `safeNext` and `loginHref` canonicalise (above). The `/login` exclusion is unchanged.
- `vite.config.ts`: the comment “deep links like /pieces/x”. The manifest `start_url: '/'` and `scope: '/'` are
  unchanged; there are no shortcuts.
- `app.html`: the new legacy script.

Tests:
- `lib/auth.test.ts`: lines 6–8 and 27–29 use `/programme`, `/pieces/p-salon`, `/energie`. Switch them to English
  paths and **add** legacy cases (`safeNext('/maison#tarif') === '/home#tariff'`).
- `routes/login/login.test.ts:48,85`: `goto('/programme')` → `'/schedule'`.
- `routes/energie/energie.test.ts:155,304,313`: `'/maison#linky'` → `'/home#linky'`.
- `lib/components/ProgramDay.test.ts`: `bar-Lundi` → `bar-monday` (from the i18n change, same phase as the path
  work is fine).
- `e2e/kelvin.spec.ts`: `goto('/pieces/p-ch1')` ×2, `'/pieces/p-salon'` ×2, `'/programme'` ×2, `'/maison'` ×3,
  `'/energie'` ×2, the `['/maison','/energie']` loop, `#tarif` locator. **Add** an e2e test that `/maison#tarif`
  lands on `/home#tariff` with the Tarif panel in view, and that `/pieces/p-salon` lands on `/rooms/p-salon`.
- `e2e/login.spec.ts`: `/programme` ×2, `/maison`, `/energie`, and the URL regexes `next=%2Fprogramme`.
- `e2e/screens.spec.ts`: the path list. Screenshot file names derive from paths (`light_phone_maison.png` →
  `light_phone_home.png`). Re-render `docs/screenshots` and update any README image references.
- `backend/tests/test_web.py:33,59,129`: `/pieces/p-salon` is just an SPA deep-link sample. Switch to
  `/rooms/p-salon` (behaviour unchanged).

Docs: README (screenshots, if referenced), DESIGN.md (it mentions screen names, not paths: no change), CONTRIBUTING
(no path references), `web/README.md` (check), the historical plans (private, untracked: leave as they are).

Backend: **no links to SPA paths** (grep found none outside tests). Linky and tariff messages say « Réglages »
in words, not as a URL.

### 4b.3 Test: no French path linked outside the redirect table

`web/scripts/check-paths.mjs` (run in vitest via `paths.test.ts`, so it runs with `npx vitest run`):
- scans `web/src/**/*.{svelte,ts}` (excluding `lib/paths.ts`, `paths.test.ts`, `app.html`'s marked block),
  `web/e2e/**`, `backend/kelvin/**`, `README.md`, `CONTRIBUTING.md`, `DESIGN.md`, `web/README.md`;
- fails on `/(pieces|programme|energie|maison)\b` in a string, href or goto, and on `#(tarif|absence)\b`;
- allows only the marked legacy blocks, plus tests that explicitly assert redirects (marked
  `// legacy-path-test`).

---

## 5. Backend messages

### 5.1 Options

**(a) Accept-Language and server-side French/English text.** Rejected:
- Pending commands are created once (`commands.submit(label, …)`) and **broadcast over SSE to every session**. Two
  household members with different languages would both see the language of whoever pressed the button. Linky
  status, `last_error` and override labels have the same problem.
- The domain vocabulary would live in two places (Python and TS) and drift apart.
- An `EventSource` cannot send custom headers. The SSE stream would carry the browser's `Accept-Language`, not
  the in-app choice, so we would need a `?lang=` parameter.

**(b) Stable codes plus parameters, translated by the web app.** Recommended, with this shape:
- Error responses: `{"detail": "<French text, unchanged>", "code": "<snake_case>", "params": {…}}`. `detail`
  stays French: it is the fallback for older clients and curl, and it keeps today's API and README contract
  (backend/README says `422 {"detail": "<French message>"}`, to be updated to mention `code`).
- `Pending`: adds `label_code` + `label_params` (keeps `label`), and `error_code` + `error_params` (keeps
  `error`).
- `/settings/linky`: `state` already is the code. The web stops displaying `message` (the Énergie page already
  derives its text from `state`; LinkyPanel shows `status.message` only for `auth`/`error`), and adds
  `retry_at` formatting (already there).
- `status.last_error` (a raw `GatewayError` string, English or technical, shown on Maison): adds
  `last_error_code ∈ {quota, auth, network, unknown}`. The web shows a translated sentence and keeps the raw
  text only in `title=` as a technical detail.
- **Web mapping**: `ApiError` gains `params`. A single `apiMessage(code, params, fallbackDetail)` in
  `lib/i18n/codes.ts` returns `m.api[code]` called with `params` when known, else `detail` (French), else
  `m.error.unexpected`. Every `err.message` use (login, TariffForm, LinkyPanel, actions toasts, Énergie
  `errorText`) goes through it.
- Implementation detail on the Python side: a small `UserError(code, params, detail)` base class in
  `kelvin/errors.py`. `CommandError`, `SlotError`, `LoginRefused`, the tariff/price `ValueError`s and route
  `HTTPException`s raise or convert to it, and one exception handler in `api/app.py` writes
  `{detail, code, params}`. `detail` comes from a French template table in that module, so the French text stays
  in **one** place in Python.
- **Pending action labels** are also used as the Overkiz execution label (`gateway.execute(…, label)`). Keep the
  French `label` there; it never reaches our UI once the web uses `label_code`.

### 5.2 Keeping tests meaningful

- pytest asserts `code` and `params` (stable contract). Existing `detail ==` assertions stay as they are, since
  French `detail` is unchanged; add `code` to each. Example: `r.json() == {"detail": "Période invalide.", "code":
  "period_invalid", "params": {}}`.
- A pytest **catalogue test** walks every `UserError` code in `kelvin/errors.py` and asserts it is listed in a
  shared `web/src/lib/i18n/api-codes.json` (generated by a script from the Python table, committed). A vitest test
  asserts every code in that JSON has an `m.api.*` entry in **both** locales. This is the cross-stack “no missing
  translation” check.
- Web tests for error display stub `{ detail, code, params }` and assert the **English** text in the en run and
  the French text in the fr run, which proves the code path rather than an echo of `detail`.

### 5.3 Every backend message and its code

Params in `{}`. FR = current `detail` (unchanged); EN = the web's English.

**Auth / platform**
| Code | Where | FR (detail) | EN |
|---|---|---|---|
| `login_required` (exists) | `api/guards.py` | Connexion requise. | Please sign in. |
| `header_missing` | `api/guards.py` | En-tête X-Kelvin manquant. | Missing X-Kelvin header. |
| `bad_credentials` | `auth/service.py` BAD_CREDENTIALS | Email ou mot de passe Cozytouch incorrect. | Wrong Cozytouch email or password. |
| `wrong_account` | `auth/service.py` WRONG_ACCOUNT | Ce compte Cozytouch n’est pas celui de cette maison. | This Cozytouch account isn’t the one for this home. |
| `cozytouch_unreachable` | `auth/service.py` UNREACHABLE | Cozytouch injoignable, réessayez dans un instant. | Can’t reach Cozytouch. Try again in a moment. |
| `too_many_attempts` {minutes} | `auth/throttle.py retry_message` | Trop de tentatives. Réessayez dans {n} min. | Too many attempts. Try again in {n} min. |
| `not_found` | `api/web.py` | Introuvable. | Not found. |
| `method_not_allowed` | `api/web.py` | Méthode non autorisée. | Method not allowed. |
| `invalid_request` {field?} | `api/app.py` validation handler | Requête invalide[ : {field} — {pydantic msg}]. | Invalid request[: {field}]. (the pydantic msg is English; keep it only in `detail`) |
| *(operator)* | `api/runtime.py` simulator data in KELVIN_DATA | KELVIN_DATA contient des données du simulateur ; … | Not a UI message: it is a startup error. Make it **English** like other logs (`test_simhistory.py` matches « simulateur »: update). |

**Rooms, radiators, overrides (routes)**
| Code | Where | FR | EN |
|---|---|---|---|
| `radiator_unknown` | routes `_radiator` | Radiateur inconnu. | Unknown radiator. |
| `room_unknown` | routes `_room_radiators` | Pièce inconnue. | Unknown room. |
| `nothing_to_change` | routes features | Rien à modifier. | Nothing to change. |
| `override_not_found` | routes cancel | Forçage ou absence introuvable. | Boost or away period not found. |
| `no_radiator` | `overrides._start` | Aucun radiateur. | No radiators. |
| `radiator_unknown_id` {id} | `overrides._start` | Radiateur inconnu : {id}. | Unknown radiator: {id}. |
| `end_in_past` | `overrides._start` | La fin doit être dans le futur. | The end must be in the future. (the same text is the web's Maison check: reuse `m.api.end_in_past`) |

**Command validation (`commands/translate.py`)**
| Code | FR | EN |
|---|---|---|
| `unsupported_command` {command} | Ce radiateur ne prend pas en charge « {command} ». | This radiator doesn’t support “{command}”. |
| `temp_range` {kind: manual\|comfort\|eco, min, max} | {La consigne\|La température confort\|L'abaissement éco} doit être comprise entre {min} et {max} °C. | {The setpoint\|Comfort temperature\|Eco setback} must be between {min} and {max} °C. |
| `temp_step` {kind} | {…} se règle par pas de 0,5 °C. | {…} goes in steps of 0.5 °C. |
| `mode_unknown` {mode} | Mode inconnu : {mode}. | Unknown mode: {mode}. |
| `setpoint_kind_unknown` {kind} | Type de consigne inconnu : {kind}. | Unknown setpoint type: {kind}. |
| `program_time_invalid` {day, value} | {jour} : heure invalide « {hhmm} » (format HH:MM). | {Day}: invalid time “{hhmm}” (HH:MM). |
| `day_unknown` {day} | Jour inconnu : {day}. | Unknown day: {day}. |
| `program_too_many` {day} | {jour} : 3 plages confort au maximum. | {Day}: 3 comfort periods at most. |
| `program_slot_invalid` {day, start, end} | {jour} : la plage {start}–{end} est invalide. | {Day}: the period {start}–{end} isn’t valid. |
| `program_overlap` {day} | {jour} : des plages se chevauchent. | {Day}: periods overlap. |
| `feature_unknown` {feature} | Fonction inconnue : {feature}. | Unknown feature: {feature}. |
| `no_night_light` | Ce radiateur n'a pas de veilleuse. | This radiator has no night light. |
| `intensity_light_off` | L'intensité ne peut être réglée que veilleuse allumée. | Brightness can only be set with the night light on. |
| `intensity_range` | L'intensité doit être comprise entre 1 et 100 %. | Brightness must be between 1 and 100%. |
| `name_length` | Le nom doit faire entre 1 et 32 caractères. | The name must be 1 to 32 characters. |

The `day` param is the **key** (`monday`), translated on the web. The backend `DAY_LABELS` stay for `detail`.
Also fix the straight apostrophes (`L'abaissement`, `n'a`, `L'intensité`) to `’` in French `detail`, per the
copy rule.

**Tariff (`billing/slots.py`, `billing/tariff.py`, `api/schemas.py`)**
| Code | FR | EN |
|---|---|---|
| `slot_time_invalid` {value} | Heure invalide : {hhmm} (format HH:MM). | Invalid time: {hhmm} (HH:MM). |
| `slots_none` | Indiquez au moins une plage d’heures creuses. | Add at least one off-peak period. (the web has the same check: reuse) |
| `slots_too_many` | Trois plages d’heures creuses au maximum. | Three off-peak periods at most. |
| `slot_empty` | Une plage d’heures creuses ne peut pas être vide. | An off-peak period can’t be empty. |
| `slots_overlap` | Les plages d’heures creuses se chevauchent. | Off-peak periods overlap. |
| `tariff_option_unsupported` | Seule l’option heures pleines / heures creuses est disponible. | Only the peak / off-peak option is available. |
| `kva_unknown` | Puissance souscrite inconnue. | Unknown subscribed power. |
| `price_subscription_invalid` | Prix de l’abonnement invalide. | Invalid subscription price. |
| `price_hc_invalid` | Prix du kWh en heures creuses invalide. | Invalid off-peak price per kWh. |
| `price_hp_invalid` | Prix du kWh en heures pleines invalide. | Invalid peak price per kWh. |

**Énergie / Linky (routes, `linky/sync.py`)**
| Code | FR | EN |
|---|---|---|
| `linky_unavailable` | Linky indisponible. | Linky isn’t available. |
| `period_invalid` | Période invalide. | Invalid period. |
| `pdl_invalid` | Le PDL compte 14 chiffres. | The PDL has 14 digits. (web check: reuse) |
| `token_missing` | Collez le jeton MyElectricalData. | Paste your MyElectricalData token. (web check: reuse) |
| `linky_quota` | Quota Linky du jour atteint : réessayez demain. | Today’s Linky quota is used up: try again tomorrow. |
| `linky_refused` | MyElectricalData refuse ce PDL ou ce jeton. | MyElectricalData rejected this PDL or token. |
| `linky_throttled` | Enedis limite les requêtes : réessayez plus tard. | Enedis is limiting requests: try again later. |
| `med_unreachable` | MyElectricalData injoignable, réessayez plus tard. | Can’t reach MyElectricalData. Try again later. |
| status `message` for `auth` | MyElectricalData refuse le jeton : renouvelez-le dans Réglages. | MyElectricalData rejected the token: renew it in Settings. |
| status `message` for `quota` | Quota Linky du jour atteint : reprise demain. | Today’s Linky quota is used up: resuming tomorrow. |
| status `message` for `error` | Synchronisation Linky en échec. | Linky sync failed. |
| status `message` for `throttled` {retry_at} | Enedis limite les requêtes : nouvel essai à {HH:MM}. | Enedis is limiting requests: next try at {HH:MM}. |

(For status, `state` is the code; the web uses `m.linky.status[state]` and formats `retry_at` itself.)

**Pending errors (`commands/service.py`)**
| Code | FR | EN |
|---|---|---|
| `send_failed` {reason} | Envoi impossible : {e} | Couldn’t send: {reason}. (`reason` is a raw gateway string; also add `reason_code` quota/auth/network so the web can say “Cozytouch rate limit” and so on) |
| `send_internal` | Envoi impossible : erreur interne. | Couldn’t send: internal error. |
| `radiator_refused` | Le radiateur a refusé la commande. | The radiator rejected the command. |
| `no_confirmation` | Pas de confirmation du radiateur. | No confirmation from the radiator. |

**Pending action labels (`api/routes.py`, `commands/overrides.py`)**: `label_code` + params, French `label` kept
for Overkiz.
| Code | Params | FR (label) | EN |
|---|---|---|---|
| `mode` | target, name, mode | {name} : {Arrêt\|Manuel\|Programme} | {name}: {Off\|Manual\|Schedule} |
| `setpoint` | target, name, kind, value | {name} : {consigne\|confort\|abaissement éco} {v} °C | {name}: {setpoint\|comfort\|eco setback} {v} °C |
| `program` | name | {name} : programme | {name}: schedule |
| `settings` | name | {name} : réglages | {name}: settings |
| `night_light` | name, on | {name} : veilleuse allumée/éteinte | {name}: night light on/off |
| `identify` | name | {name} : identification | {name}: identify |
| `boost` | name, temperature | {name} : forcé à {t} °C | {name}: boost to {t} °C |
| `away` | temperature | Absence à {t} °C | Away at {t} °C |
| `all_off` | | Tout éteindre | Turn everything off |
| `all_program` | | Tout en programme | Everything back on schedule |
| `boost_end` | | Fin du forçage | Boost ended |
| `away_end` | | Fin de l'absence | Away ended |

Totals: 53 error codes (9 auth/platform, 7 routes/overrides, 15 command validation, 10 tariff, 8 Énergie/Linky,
4 pending errors), plus 4 Linky status messages, 12 action labels and 4 `last_error_code` values. That is **73
codes** in `api-codes.json`.

### 5.4 Client-side messages that look like backend ones

`lib/api/client.ts`: « Kelvin est injoignable. » (`error.unreachable`), « Erreur inattendue. »
(`error.unexpected`), « Le serveur Kelvin a rencontré une erreur. » (`error.server`). These are already
client-side and become messages. Today `ApiError.message` carries the French text; it should carry a **code**
(`network`, `unexpected`, `server`), and the components translate it at display time, so a toast shown before a
language switch is not stuck in the wrong language. Toasts should store `{ code, params }` or a `() => string`,
not a frozen string.

---

## 6. Domain glossary FR ↔ EN

The aim is natural British-leaning product English, as in Nest, tado° or Hive, not literal translation.

| French (UI) | English | Notes |
|---|---|---|
| Pièces | Rooms | Nav, page title |
| Pièce | Room | |
| Sans pièce | No room | Énergie, unassigned radiators |
| Programme (nav, page) | Schedule | “Programme” is British for TV programmes. Heating apps say *schedule*. |
| Programme (mode) | Schedule | Mode switch: Off / Manual / Schedule; compact « Prog. » → “Sched.” |
| Arrêt (mode) | Off | |
| Arrêté (status) | Off | « Arrêté » setpoint text → “Off” |
| Manuel | Manual | |
| Autre / Mixte | Other / Mixed | |
| Mixte (moyenne) | Mixed (average) | |
| Confort | Comfort | Heating level and setpoint |
| Éco | Eco | |
| Abaissement éco | Eco setback | The eco offset below comfort; “setback” is the HVAC term |
| Hors-gel | Frost protection | |
| Repos (level off) | Idle | The heater is not calling for heat |
| Consigne | Setpoint | Users know it as “target”, but the app is data-forward; *Setpoint* is clear and short. Use “Target temperature” in aria labels if testing shows confusion. |
| Consigne active | Current setpoint | |
| Température forcée / Forcer / Forcé | Boost temperature / Boost / Boosted | « Forcer temporairement » → “Temporary boost”. « Forçage » → “Boost”. |
| Annuler le forçage | Cancel boost | |
| Absence | Away | « Absence… » → “Away…”; « Activer l’absence » → “Start away mode” |
| Rétablissement… | Restoring… | |
| En cours | Active | Maison section heading |
| Tout éteindre | Turn everything off | |
| Tout remettre en programme | Put everything back on schedule | |
| Heures creuses / HC | Off-peak / **Off-peak** | Avoid “HC” in English; use “Off-peak” even in compact places (« HC 42 kWh » → “Off-peak 42 kWh”) |
| Heures pleines / HP | Peak / **Peak** | |
| Plage (confort / HC) | Period | « Plage » → “Period” (“Comfort period”, “Off-peak period”). The ProgramDay button « Plage » → “Period”. |
| Tarif | Tariff | Tariff 1 / Tariff 2 for the radiator counters |
| Abonnement (€/mois) | Standing charge (€/month) | UK term; “Subscription” reads like software |
| Puissance souscrite | Subscribed power | kVA |
| Prix heures creuses (€/kWh) | Off-peak price (€/kWh) | |
| Applicable à partir du | Valid from | |
| Estimation | Estimate | « estimation » tag → “estimate” |
| Projection | Forecast | |
| Consommation | Consumption | “Usage” is also fine; pick **Consumption** for charts and keep it |
| Chauffage | Heating | |
| Énergie | Energy | |
| Courbe du … | Load curve, … | “Half-hourly use on 13 October 2026” for the aria label |
| Compteurs des radiateurs | Radiator meters | |
| Depuis l’installation | Since installation | |
| Maison (nav, page) | Home | Also the page at `/home` |
| Toute la maison | Whole home | |
| Réglages | Settings | |
| Thème: Système / Sombre / Clair | Theme: System / Dark / Light | |
| Langue | Language | Options are never translated: « Français », “English” |
| Compte | Account | |
| Se connecter / Connexion / Se déconnecter / Se reconnecter | Sign in / Sign in / Sign out / Sign in again | Avoid “log in”; one verb everywhere |
| Mot de passe | Password | |
| Simulateur | Simulator | |
| Envoi… / Confirmé / Réessayer / Échec de la commande | Sending… / Confirmed / Retry / Command failed | |
| Fenêtre ouverte | Window open | |
| Détection de fenêtre ouverte / de présence | Open-window detection / Presence detection | |
| Veilleuse | Night light | |
| Faire clignoter | Identify (blink) | Button text “Blink” |
| Radiateur(s) | Radiator(s) | Upstream default name stays « Radiateur » (device data) |
| Détails | Details | |
| Historique | History | |
| Commande | Controls | Inspector section |
| Linky, Enedis, MyElectricalData, Cozytouch, PDL | same | Proper nouns; “PDL (delivery point)” on first use |
| Jeton MyElectricalData | MyElectricalData token | |
| Relié / Non relié | Connected / Not connected | |
| Synchro | Sync | |
| Injoignable / Connecté | Unreachable / Connected | |
| à l’instant / il y a 5 min | just now / 5 min ago | |
| Aujourd’hui / demain / la veille | Today / tomorrow / the previous day | |
| Jour / Mois / Année | Day / Month / Year | |
| 24 h / 7 j / 30 j | 24 h / 7 d / 30 d | |

Tone: French uses « vous » and imperatives (« Collez le jeton »). English uses plain imperatives (“Paste your
token”) and contractions (“can’t”, “isn’t”) in sentences, but not in labels.

---

## 7. Test strategy

1. **Type-level coverage (free)**: `en: Messages` makes `npm run check` fail on a missing or extra key or a
   signature mismatch.
2. **Unused keys**: `web/scripts/i18n-check.mjs` (also called from `src/lib/i18n/i18n.test.ts`) flattens
   `fr.ts` keys and fails if a key path never appears as `m.<path>` in `web/src` (excluding the i18n dir). Keys
   reached dynamically (`m.mode[mode]`, `m.api[code]`, `m.linky.status[state]`) are declared in an `DYNAMIC`
   allowlist of **parent** paths.
3. **No hard-coded French in components**: the same script scans `web/src/**/*.{svelte,ts}` (not tests, not
   `lib/i18n/`), removes `<style>`, comments, `class=`/`data-testid` values and imports, then fails on:
   - any string literal or text node with French letters `[éèêàùçôîûœÉÈÀÇ’«»]`;
   - a word list of accent-free French UI words (`\b(Pièce|Maison|Programme|Chargement|Envoyer|Annuler|Réglages|
     Consigne|Confort|jusqu|depuis|plage|aujourd)\b`, kept in the script);
   - the allowlist: `'Radiateur'` in RadiatorPanel (the upstream default name), proper nouns.
   This is the guard that makes the plan resilient to the polish batch: any newly added French string fails CI.
4. **Typography lint over the dictionaries**: for each `fr` message, no straight `'` (use `’`), no plain space
   before `°C`, `kWh`, `Wh`, `€`, `%`, `:` and no space-before-`?`/`!` without NBSP (use ` ` or the narrow
   variant). For `en`: no space before `%`, NBSP before `°C`/`kWh`, no « ». It runs the message functions with
   sample params.
5. **Locale parity snapshot**: for every message, render with sample params in both locales and assert that
   neither output is empty and that `en !== fr` (except an allowlist of words that are the same: Linky, Version,
   Email, Kelvin, Mode, Signal, Projection, Confort/Comfort differ…). This catches copy-pasted French in `en.ts`.
6. **vitest in both locales where copy matters**: a `describe.each(['fr','en'])` wrapper (`forEachLocale()`
   helper in `test-setup.ts` that calls `setLocale` before each test and resets it after) for:
   `format.test.ts` (fr and en expectations side by side), `plural.test.ts`, `energy.test.ts`, `program.test.ts`
   (next change), `Banner`, `PendingTag`, `PiecesView`, `LinkyPanel`, `TariffForm` (decimal parsing in both),
   `login.test.ts`, `energie.test.ts` (hero, comparison and heating sentence). The remaining component tests stay
   French-only. They should query by **message** (`m.pending.sending`) rather than literal text, so they survive
   copy changes, except for a handful of “golden” literal assertions per locale that pin the copy rules.
7. **Reactivity test**: mount the layout and Maison, `setLocale('en')`, and assert that the nav, the Segmented
   labels, the mode chips and `document.title` change without remounting.
8. **Backend codes**: the pytest and vitest catalogue tests in §5.2.
9. **Playwright**: the existing suite stays French (the default) and becomes locale-agnostic where it is cheap,
   by using English path constants and `data-testid` for day bars. Add **one `english.spec.ts`**: set
   `localStorage['kelvin-locale']='en'` via `addInitScript`, then check the login screen, the Rooms heading, a
   mode change showing “Sending…” → “Confirmed”, the Énergie hero with `€` before the figure, and Maison ›
   Settings showing “Language”. Add a `locale` dimension to `screens.spec.ts` (`SCREENS_LOCALE=en`) for review
   screenshots.
10. **Paths** (§4b.3): the legacy table parity test and the “no French path” scan.

---

## 8. Documentation changes

- **CLAUDE.md**: under Rules, “**Language:** user-facing strings (errors, labels, UI) exist in French and English
  and live only in `web/src/lib/i18n/{fr,en}.ts`; French is the default. Backend errors carry a stable `code`
  (plus `params`) and a French `detail`; the web translates by code. Follow DESIGN.md copy rules for both
  languages. Code, logs and docs are English.” Also add “**Paths:** URL paths are English (`/rooms`, `/schedule`,
  `/energy`, `/home`); old French paths are redirected only through `lib/paths.ts`.” Add `node
  scripts/i18n-check.mjs` to Checks if it is not already part of vitest.
- **DESIGN.md**: rename “French copy” to **“Copy (French and English)”**. Keep the French rules and add the
  English column: NBSP before °C/kWh/Wh/W/kVA, no space before %, € before the figure, decimal point, en-GB
  dates (`13 October 2026`, `Tue 13 Oct, 18:05`), 24 h clock, `−` and `—` the same, curly ’ and “ ”, sentence
  case, “Sign in”, glossary pointer. In Do's: “Do format numbers through `lib/i18n/format.ts` in the active
  locale”. Update the Segmented section (Réglages: Thème **and Langue**) and the Login section (language switch).
  Component copy examples stay in French with the English equivalent in parentheses where they define a rule
  (for example the comparison basis wording). Mention the `/home` etc. anchors where DESIGN names screens.
- **PRODUCT.md**: “The UI is in French” → “The UI is in French (default) and English.” Same under Brand
  Commitments and Accessibility.
- **CONTRIBUTING.md**: “French UI copy” → **“UI copy (French and English)”**: add a string in both dictionaries
  (the type check forces it), check the glossary (link to a new `docs/glossary.md` holding §6), run the i18n
  check, and never hard-code text in a component.
- **README.md**: “a fast, clear web app in French” → “in French and English”; Project status “The UI is French
  only” → “The UI is in French and English (French by default; switch in Maison › Réglages).” Update screenshot
  references if file names change with paths.
- **web/README.md**: the i18n folder, how to add a message, the `kelvin-locale` key, the manifest limitation,
  and the paths table.
- **backend/README.md**: the error contract `{"detail": "<French message>", "code": "<code>", "params": {…}}`,
  pending `label_code`/`error_code`, and status `last_error_code`.
- **docs/glossary.md** (new): §6, kept as the source for translators.

---

## 9. Risks and edge cases

- **Strings frozen at module scope** (§1.1). Mitigated by the reactivity test and code review; consider a lint
  regex for `label: '` in `.ts` modules.
- **Toasts and pending errors stored as text** (`house.svelte.ts` `LOST_ERROR`, `UNKNOWN_ERROR`, toasts) freeze
  the language at creation. Store codes and translate at render.
- **`aria-label` used as a test selector** (e2e `getByRole('group', { name: 'Consigne' })`, `radiogroup 'Mode de
  la pièce'`). The French suite keeps working; the English smoke test uses English names.
- **The `Radiateur` default name** from Overkiz must not be translated in the comparison; display it as
  `m.radiator.default` only when falling back.
- **Backend `detail` stays French**, so an English user on an **old cached web bundle** sees French errors until
  the SW updates. That is acceptable.
- **Linky `consent_expires`, `last_day`** are ISO dates, formatted on the web, so no issue.
- **Number input parsing** accepts both separators in both locales, so no data-entry trap.
- **`<input type="date|time|datetime-local">`** follow the browser's UI locale, not Kelvin's.
- **en-GB vs en-US**: users on en-US devices get en-GB formatting. That is a deliberate choice; document it.

---

## 10. Implementation plan (after the UI polish batch lands)

Each phase is one PR, with the full checks green (`cd web && npx vitest run && npm run check && npx playwright
test`; `cd backend && uv run pytest -q && uv run ruff check . && uv run ruff format --check .`). Phases 1–2 do not
depend on the polish batch's copy; phases 3–4 re-extract strings with the script, so they absorb any copy the
polish batch changed.

### Phase 0: rebase and re-inventory (half a day, no product change)
- Rebase on the merged polish batch. Run `scratchpad/i18n/extract.py` (moved to `web/scripts/i18n-extract.py` or
  ported to `.mjs`) to regenerate the inventory, and diff it against §2.1.
- Commit `web/scripts/i18n-check.mjs` in **report-only mode** (it prints hard-coded French but does not fail
  yet).

### Phase 1: English URL paths with legacy redirects
Files: `web/src/lib/paths.ts` (+`paths.test.ts`); `web/src/app.html` (legacy script with markers); move
`routes/pieces/[id]` → `routes/rooms/[id]`, `programme` → `schedule`, `energie` → `energy`, `maison` → `home`
(with colocated tests renamed); `routes/+error.svelte` (legacy safety net); `lib/auth.ts` (`canonical()` in
`safeNext`/`loginHref`); `Sidebar.svelte`/`TabBar.svelte` (shared `NAV` from `paths.ts`, `active()` with
`/rooms`); `RoomCard.svelte`, `RoomList.svelte`, `HouseActions.svelte` (`ROUTES.home + '#' + ANCHORS.away`),
Énergie links (`#linky`, `#tariff`); Maison section ids `away`, `tariff`, `linky`; `vite.config.ts` comment;
`backend/tests/test_web.py` sample paths.
Tests: `auth.test.ts` (English paths plus legacy cases), `login.test.ts`, `energy.test.ts` hrefs; e2e
`kelvin.spec.ts`, `login.spec.ts`, `screens.spec.ts` paths; new e2e `legacy-paths.spec.ts` (`/maison#tarif` →
`/home#tariff` with the panel visible; `/pieces/p-salon?x=1` → `/rooms/p-salon?x=1`; offline: after SW install,
`context.setOffline(true)` then `/energie` → `/energy` renders from the precache). The “no French path” scan
(§4b.3). Re-render `docs/screenshots` if they are referenced.
Docs: README/CONTRIBUTING/DESIGN/web README path mentions; CLAUDE.md “Paths” rule.

### Phase 2: backend error codes (backend plus a thin web mapping, French output unchanged)
Files: `backend/kelvin/errors.py` (`UserError`, French templates, `CODES`); `api/app.py` (handler for
`UserError` and `RequestValidationError` → `invalid_request`); `api/guards.py` (`header_missing`;
`LOGIN_REQUIRED_BODY` gains `params`); `api/web.py`; `api/routes.py` (all `HTTPException(…, "…")` → `UserError`;
pending `label_code`/`label_params`); `auth/service.py`, `auth/throttle.py` (`too_many_attempts` {minutes});
`commands/translate.py` (codes with `day`/`kind` keys; `’` apostrophes); `commands/service.py` (`error_code`,
`reason_code`); `commands/overrides.py` (`boost_end`/`away_end`, errors); `billing/slots.py`, `billing/tariff.py`,
`api/schemas.py`; `overkiz/poller.py` (`last_error_code`); `api/runtime.py` (simulator-data message to English,
operator-facing); `scripts/export_codes.py` → `web/src/lib/i18n/api-codes.json`.
Web: `lib/api/client.ts` (`ApiError.params`; network/unexpected/server as codes); `lib/api/types.ts` (Pending
`label_code`…, Status `last_error_code`).
Tests: add `code`/`params` to every `detail` assertion (`test_api.py`, `test_auth_api.py`, `test_energy_api.py`,
`test_auth_service.py`, `test_throttle.py`, `test_translate.py` (match on `.code`), `test_command_service.py`,
`test_billing.py`, `test_linky_sync.py`, `test_simhistory.py`); new `test_error_codes.py` (every code has a
French template and is in `api-codes.json`; JSON up to date).
Docs: `backend/README.md` error contract.

### Phase 3: i18n core and formatting (no visible change in French)
Files: `lib/i18n/{fr.ts,en.ts,index.svelte.ts,format.ts,codes.ts}`; `lib/format.ts` becomes a re-export shim
from `lib/i18n/format.ts`, then is removed in phase 4; `lib/plural.ts` → `plural(n, forms)` with
`Intl.PluralRules`; `stores/locale.ts` (get/set, localStorage, `<html lang>`); `app.html` (locale bootstrap next
to the theme); `test-setup.ts` (`forEachLocale`, reset to `fr`).
`en.ts` can start as a **typed copy of `fr.ts`** so the build stays green, then be translated within the same
phase from the glossary.
Tests: `format.test.ts` in both locales (NBSP rules, `−`, `—`, en-GB dates, decimal parsing of both separators),
`plural.test.ts` (fr 0 → singular, en 0 → plural), `locale.test.ts` (default fr; `navigator` en-US → en;
`['en-US','fr-FR']` → fr; stored wins; storage throwing → fr), dictionary typography and parity tests (§7.4–5),
`api-codes.json` coverage.

### Phase 4: extract strings, file by file (scripted and verified)
Order (each step: replace literals with `m.*`, add fr and en, run `i18n-check`, which must report zero for the
files done): shared pieces first (`nav`, `common`, `mode`, `level`, `pending`, `banner`: Sidebar, TabBar,
ModeSwitch, PendingTag, Banner, Toasts, Stepper, OverrideBadge, actions.ts, house.svelte.ts with codes),
then Rooms (PiecesView, RoomList, RoomCard, RoomInspector, RadiatorPanel, RoomTodayStrip, `rooms/[id]`), then
Schedule (program.ts, ProgramDay with `bar-{dayKey}`, `schedule/+page`), then Energy (energy.ts, EnergyBars,
CurveChart, `energy/+page`), then Home (TariffForm, LinkyPanel, `home/+page`), then Login.
Every concatenation in §2.4 becomes one message; module-level label arrays become keys.
Tests per file: update selectors to `m.*` where cheap; add `forEachLocale` to the copy-heavy tests listed in
§7.6; `ProgramDay.test.ts` uses `bar-monday`.
Finish: switch `i18n-check` to **failing mode** (hard-coded French and unused keys), and wire it into vitest.

### Phase 5: language switch and English polish
Files: `home/+page.svelte` (Réglages › Langue Segmented with `lang` attributes), `login/+page.svelte` (FR | EN
switch), `<svelte:head>` titles reactive, `vite.config.ts` manifest (keep `lang: 'fr'`, decide on the
description), `lib/i18n/codes.ts` wired into every error display, `Status.last_error` shown via code.
Tests: reactivity test (§7.7); `maison`/`home` test for the switch persisting and setting `<html lang>`; login
test for switching before login and showing a backend `bad_credentials` error in English; Playwright
`english.spec.ts`; `screens.spec.ts` `SCREENS_LOCALE`.
English copy review against the glossary on real screens (phone and desktop, both themes): check wrapping of
longer English labels in the 44 px segments (“Schedule” vs « Programme », “Sched.” in compact).

### Phase 6: documentation
CLAUDE.md, DESIGN.md (copy rules for both languages, Segmented and Login sections), PRODUCT.md, CONTRIBUTING.md,
README.md, web/README.md, backend/README.md, new `docs/glossary.md` (§6). The docs-only PR can land with
phase 5.

Rough effort: P1 1 day, P2 1.5 days, P3 1 day, P4 2–3 days, P5 1 day, P6 half a day.
