<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import AlertCallout from '$lib/components/AlertCallout.svelte';
  import ComparePanel from '$lib/components/ComparePanel.svelte';
  import CurveMini from '$lib/components/CurveMini.svelte';
  import CurvePanel from '$lib/components/CurvePanel.svelte';
  import EnergyBars from '$lib/components/EnergyBars.svelte';
  import EnergyHero from '$lib/components/EnergyHero.svelte';
  import EnergyMonths from '$lib/components/EnergyMonths.svelte';
  import EnergyWhere from '$lib/components/EnergyWhere.svelte';
  import type { FicheRow } from '$lib/components/FicheBody.svelte';
  import GridChips from '$lib/components/GridChips.svelte';
  import HcHpPanel from '$lib/components/HcHpPanel.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Menu, { type MenuItem } from '$lib/components/Menu.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PeriodBar from '$lib/components/PeriodBar.svelte';
  import PeriodNav from '$lib/components/PeriodNav.svelte';
  import PowerPanel from '$lib/components/PowerPanel.svelte';
  import ProjectionPanel from '$lib/components/ProjectionPanel.svelte';
  import QualityPanel from '$lib/components/QualityPanel.svelte';
  import RoomDayPanel from '$lib/components/RoomDayPanel.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import SourceLine from '$lib/components/SourceLine.svelte';
  import Swatch from '$lib/components/Swatch.svelte';
  import TempoRows from '$lib/components/TempoRows.svelte';
  import WhereTop from '$lib/components/WhereTop.svelte';
  import type { TempoColour, TempoCounts } from '$lib/api/types';
  import { addDays, bucketLabel, spanLabel, bucketSpan, dataSpan, firstCounted, periodTitle, SERIES, VIEWS, type View } from '$lib/energy';
  import { exportActions } from '$lib/export';
  import { freshness } from '$lib/freshness';
  import { fmtDateLong, fmtDay, fmtEurHero, fmtKwhHero, fmtTime, monthName, monthYear } from '$lib/format';
  import { apiMessage, m } from '$lib/i18n';
  import { inspectBucket } from '$lib/inspector';
  import { desktop } from '$lib/media.svelte';
  import { reducedMotion } from '$lib/motion';
  import { ANCHORS, ENERGY_ANCHORS, ROUTES } from '$lib/paths';
  import { provenance, when } from '$lib/provenance';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { announcer } from '$lib/stores/announcer.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { today } from '$lib/today.svelte';
  import { EnergieData } from './energie.svelte';

  const data = new EnergieData();
  let linky = $state<LinkyStatus | null>(null);
  let linkyFailed = $state(false);
  /** The scrubbed half-hour, shared by the Courbe and Température et chauffe. */
  let scrub = $state<number | null>(null);
  let selectedBar = $state<number | null>(null);
  /** Mois and Année: the Courbe is collapsed to its summary line until opened (or a bar drills into it). */
  let curveOpen = $state(false);
  /** « Où part l’énergie », the full per-room section: collapsed (findable) until « Tout voir › » or a link opens it. */
  let whereOpen = $state(false);
  let navEl = $state<HTMLElement>();
  // The clock the source line and its Fiche read (« il y a 3 min »), ticking once a minute.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (auth.loggedIn !== false && alerts.due) void alerts.load(); // not while signing out (a 401 would re-ask the login)
  });
  $effect(() => {
    api
      .linkyStatus()
      .then((s) => {
        linky = s;
        data.start(s.last_day);
      })
      .catch(() => {
        linkyFailed = true;
        data.start(null);
      });
  });
  // The day detail carries the selected room's samples (the Courbe's « Température », Température et chauffe).
  // The default room is the first one Pièces lists (the house's own order, the order of every room picker) that has a
  // radiator, chosen once: it never follows the period, so the panel does not jump from room to room.
  $effect(() => {
    const first = house.rooms.find((r) => r.radiator_ids.length > 0);
    if (house.loaded && data.room == null && first) data.setRoom(first.id);
  });
  // Midnight with the page open: today moved, so the period on screen is asked again (see EnergieData.newDay).
  let shownToday = untrack(() => today.iso);
  $effect(() => {
    const d = today.iso;
    if (d === shownToday) return;
    shownToday = d;
    untrack(() => data.newDay());
  });
  // A new period or a new day: nothing stays selected from the previous one.
  $effect.pre(() => {
    void data.data;
    selectedBar = null;
  });
  $effect.pre(() => {
    void data.day?.date;
    scrub = null;
  });

  let loaded = $derived(data.data);
  let main = $derived(loaded?.main ?? null);
  // Another view: Mois and Année start with the Courbe collapsed (a drill opens it again).
  let curveView: View | null = null;
  $effect.pre(() => {
    const v = loaded?.view ?? null;
    if (v === curveView) return;
    curveView = v;
    curveOpen = false;
    whereOpen = false;
  });
  let chart = $derived(loaded?.chart ?? null);
  // The report renders with the Linky line as soon as both answers are in, so nothing above it
  // moves (no CLS). It never waits on the live stream.
  // The alerts answer with the rest: their callouts then come in the same frame as the panels they sit
  // above, replacing the skeleton instead of pushing drawn panels down (CLS).
  let ready = $derived(!!loaded && (!!linky || linkyFailed) && alerts.answered);
  let busy = $derived(data.loading || (!!data.error && loaded?.period !== data.period));
  let group = $derived(chart?.group ?? 'day');
  let unitWord = $derived(m.energyPage.unit[group]);

  let split = $derived(!!main?.tariff);
  // A bucket with no off-peak split (Base, or a Base day inside a longer bucket) draws its whole consumption as one series.
  const splitOf = (b: { hc_kwh: number | null }) => split && b.hc_kwh != null;
  // The house chart starts at the first counted bucket (Linky data, or a counted day without it, which pays its
  // subscription): earlier ones are not gaps.
  let trimmed = $derived(chart?.linky ? firstCounted(chart.buckets) : 0);
  let bars = $derived((chart?.buckets ?? []).slice(chart?.linky ? trimmed : 0));
  // « Non réparti » only beside split bars; alone (Base) the one series is the consumption.
  let anySplit = $derived(bars.some(splitOf));
  let homeName = $derived(anySplit ? m.energyUi.notSplit : m.energyPage.consumption);
  let names = $derived<Record<string, string>>({ hc: m.energyPage.hc, hp: m.energyPage.hp, home: homeName });
  let colors = $derived<Record<string, string>>({ hc: SERIES.hc, hp: SERIES.hp, home: SERIES.home });
  let groups = $derived(
    bars.map((b) => ({
      label: bucketLabel(b.key, group),
      parts: !chart?.linky
        ? [{ key: 'rad', value: b.radiators?.kwh ?? null }]
        : splitOf(b)
          ? [{ key: 'hc', value: b.hc_kwh }, { key: 'hp', value: b.hp_kwh }]
          : [{ key: 'home', value: b.kwh }]
    }))
  );
  let overlay = $derived(
    chart?.linky ? { label: m.energyPage.radiators, values: bars.map((b) => b.radiators?.kwh ?? null), color: SERIES.radiators } : null
  );
  let details = $derived(
    loaded
      ? bars.map((b) =>
          inspectBucket(b, {
            group,
            span: bucketSpan(b.key, group),
            period: { span: loaded.period, kwh: loaded.main.period.kwh },
            linky: loaded.main.linky,
            // A null radiator sum reads « — » with its reason (today counts once it is over).
            radiators: loaded.main.quality.radiators_since != null,
            today: today.iso
          })
        )
      : []
  );
  // The Courbe's day as its bar reads it (day bars only), so the readout at rest says the bar's own figures.
  let dayBar = $derived.by(() => {
    if (group !== 'day' || !data.dayIso) return null;
    const i = bars.findIndex((b) => b.key === data.dayIso);
    return i >= 0 ? details[i] : null;
  });

  // Qualité describes the selected period: in Jour the bars are the 7 days ending on it, so only its own bucket.
  let periodBars = $derived(loaded?.view === 'day' ? bars.filter((b) => b.key === loaded.period.from) : bars);

  // Température et chauffe is for Jour and Semaine (one day at a time, the Courbe's day): inside « Où part
  // l'énergie », under the rooms, sharing the Courbe's scrubber. It holds its place (a skeleton) until the house is
  // known, so nothing below moves.
  let roomDay = $derived(!!loaded && loaded.main.linky && (loaded.view === 'day' || loaded.view === 'week'));
  // Puissance in Jour reads the period's own day, never another day still on screen.
  let powerDay = $derived(loaded && (loaded.view !== 'day' || data.day?.date === loaded.period.from) ? data.day : null);
  // A period running into today counts its radiators up to yesterday.
  let running = $derived(!!loaded && loaded.period.to > today.iso);
  // The radiator figures and room stats count elapsed days only, up to yesterday (not up to the last Linky day).
  let elapsed = $derived(loaded ? dataSpan(loaded.period, addDays(today.iso, -1)) : null);

  // ---- Tableau board (spec §4 Énergie): which widgets sit where. Presentation only: every figure below is one the
  // components already show (the report's, through $lib/format and $lib/inspector). ----
  /** Jour and Semaine lead with the Courbe; Mois and Année with the bars. */
  let dayish = $derived(!!loaded && (loaded.view === 'day' || loaded.view === 'week'));
  /** The six Tempo rows replace the HC/HP card only when the price row in force is Tempo (`tempo_lens` is null else). */
  let tempoLens = $derived(main?.option === 'tempo' ? (main.tempo_lens ?? null) : null);
  const colourOf = (t: TempoCounts): TempoColour | null => (t.red > 0 ? 'red' : t.white > 0 ? 'white' : t.blue > 0 ? 'blue' : null);
  // A dot under each day bar, Tempo in force only; a day whose colour is unknown gets the unknown (dashed) dot.
  let tempoDots = $derived(
    main?.option === 'tempo' && chart?.linky && group === 'day' ? bars.map((b) => (b.tempo ? colourOf(b.tempo) : undefined)) : null
  );
  // Année, the year holding the last day: the running month drawn dashed to its full-month projection (an estimate,
  // said in the note under the chart).
  let ghost = $derived.by(() => {
    const pm = main?.projection?.month;
    if (!loaded || loaded.view !== 'year' || !data.latest || !pm || group !== 'month') return null;
    const index = bars.findIndex((b) => b.key === pm.key);
    return index >= 0 ? { index, value: pm.kwh, key: pm.key, label: m.projection.approx(pm.eur != null ? fmtEurHero(pm.eur) : fmtKwhHero(pm.kwh)) } : null;
  });
  /** The house chart's title: the kWh of the period beside it in Mois and Année; Jour's bars are the 7 days to the day. */
  let barsTitle = $derived(
    loaded?.view === 'day' && chart?.linky ? m.energyBoard.sevenDays(fmtDay(loaded.period.from)) : chart?.linky ? m.energyPage.houseTitle : m.energyPage.radTitle
  );
  let barsAside = $derived(loaded && !dayish && main ? (chart?.linky ? fmtKwhHero(main.period.kwh) : fmtKwhHero(main.period.radiators?.kwh)) : null);
  let barsHeight = $derived(dayish ? 140 : desktop.matches ? 300 : 160);
  let whereAside = $derived(elapsed ? spanLabel(elapsed) || m.roomsEnergy.day(fmtDateLong(elapsed.from)) : null);
  /** Mois: the Courbe opens in a sheet over the board (« par demi-heure › », a day bar's drill). */
  let curveTrigger = $state<HTMLElement | null>(null);
  function openCurve(e?: Event) {
    curveTrigger = (e?.currentTarget as HTMLElement | null) ?? null;
    curveOpen = true;
  }
  function openWhere() {
    whereOpen = true;
  }
  /** A key figure's link: its section opens first (the rooms; the Courbe's sheet in Mois). */
  function reveal(id: string) {
    if (id === ENERGY_ANCHORS.where) whereOpen = true;
    else if (id === ANCHORS.curve && loaded?.view === 'month') curveOpen = true;
  }

  // Arriving with a section's hash (the room sheet's « Énergie de la pièce » → #energy-where, Maison's month-end
  // estimate → #projection): once the first report is drawn, the section opens, then the page scrolls to it.
  const LANDING: string[] = [ENERGY_ANCHORS.where, ENERGY_ANCHORS.offpeak, ENERGY_ANCHORS.projection, ANCHORS.curve];
  let landed = false;
  $effect(() => {
    if (landed || !loaded) return;
    landed = true;
    const id = location.hash.slice(1);
    if (!LANDING.includes(id)) return;
    untrack(() => reveal(id));
    void tick().then(() => document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: 'auto' }));
  });

  // Analyse: Comparaisons and Projection (and Heures creuses / pleines when the Tempo rows took its place in the board).
  let cards = $derived(!loaded || !loaded.main.linky ? 0 : tempoLens ? 3 : 2);

  /** Runs a navigation and, when it changes the view or the period, says the new period once (all four ways in:
   * the views, ‹ ›, « Dernier jour », a bar drill). A failure is said by the error line (role alert). */
  function navigate(run: () => void) {
    const key = () => (data.period ? `${data.view} ${data.period.from} ${data.period.to}` : '');
    const before = key();
    run();
    if (data.period && key() !== before) announcer.say(periodTitle(data.view, data.period));
  }
  const step = (d: -1 | 1) => navigate(() => data.step(d));
  const toLatest = () => navigate(() => data.toLatest());
  const toFirst = () => navigate(() => data.toFirst());
  function drill(i: number) {
    const b = bars[i];
    if (!b || !loaded) return;
    const opensCurve = group === 'day' && loaded.view !== 'day';
    navigate(() => data.drill(b.key));
    if (opensCurve) {
      curveTrigger = document.activeElement as HTMLElement | null;
      curveOpen = true;
      announcer.say(m.energyPage.curveShown(fmtDateLong(b.key)));
      if (loaded.view !== 'month') document.getElementById(ANCHORS.curve)?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }
  function drillLabel(i: number): string | null {
    const b = bars[i];
    if (!b || !loaded) return null;
    if (group === 'month') return m.energyPage.drillMonth(monthYear(`${b.key}-01`));
    if (loaded.view === 'day') return b.key === loaded.period.from ? null : m.energyPage.drillDay;
    return m.energyPage.drillCurve(fmtDay(b.key));
  }

  /** Linky problems the user must fix: a red callout above the Résumé, with the way to fix them. Progress (first sync,
   * quota, throttled) is the source line's words and dashed ring, never a callout. */
  let linkyProblem = $derived.by((): { text: string; link: string } | null => {
    if (linkyFailed) return { text: m.energyPage.statusFailed, link: m.energyPage.settings };
    if (linky?.state === 'auth') return { text: m.energyPage.auth, link: m.energyPage.renew };
    if (linky?.state === 'error') {
      // The state's own code first (it follows the language), the server's French message as the fallback.
      return { text: apiMessage(`linky_status_${linky.state}`, {}, linky.message ?? m.energyPage.syncFailed), link: m.energyPage.settings };
    }
    return null;
  });
  /** The Linky source line (direction-2 §1.2): « ○ Linky · données jusqu’au 14/10 », dashed while waiting. */
  let linkyLine = $derived.by(() => {
    if (!linky && !linkyFailed) return null;
    if (linky?.state === 'off') return null;
    const day = main?.last_day ?? linky?.last_day ?? null;
    const waiting = linky?.state === 'never' || linky?.state === 'quota' || linky?.state === 'throttled';
    const state = freshness('linky-day', { day, waiting, failed: !!linkyProblem }, now);
    let text: string;
    if (linky?.state === 'never') text = m.energyUi.linkyNever;
    else if (linky?.state === 'quota') text = m.energyUi.linkyQuota;
    else if (linky?.state === 'throttled') text = linky.retry_at ? m.energyUi.linkyThrottledAt(fmtTime(linky.retry_at * 1000)) : m.energyUi.linkyThrottled;
    else if (day) text = m.energyUi.linkyUntil(fmtDay(day));
    else text = m.energyUi.linkyUnknown;
    const syncAt = linky?.last_ok_at != null ? linky.last_ok_at * 1000 : null;
    const rows: FicheRow[] = [{ label: m.energyUi.linkyDaily, value: day ? fmtDateLong(day) : '—' }];
    if (syncAt != null) rows.push({ label: m.energyUi.linkySync, value: when(syncAt, now) });
    if (linky) rows.push({ label: m.energyUi.linkyCalls, value: m.energyUi.linkyCallsValue(linky.calls_today, linky.budget) });
    if (linky?.retry_at) rows.push({ label: m.energyUi.linkyRetry, value: fmtTime(linky.retry_at * 1000) });
    if (main?.linky_since) rows.push({ label: m.energyUi.linkySince, value: fmtDateLong(main.linky_since) });
    return { text, state, rows, prov: provenance('linky-day', { day, syncAt }, now) };
  });

  // The three CSV files, in the header menu (desktop « Exporter », phone « ⋯ ») and the ghost button at the end.
  let exportItems = $derived.by((): MenuItem[] => {
    if (!loaded || !main || !chart) return [];
    return exportActions({
      chart,
      main,
      period: loaded.period,
      roomSpan: elapsed ?? loaded.period,
      day: data.day,
      today: today.iso,
      house: { loaded: house.loaded, rooms: house.rooms, radiators: house.radiators }
    }).map((a) => ({ label: a.label, icon: 'download', disabled: a.disabled, onselect: a.run }));
  });
  let canExport = $derived(ready && exportItems.length > 0);
</script>

<svelte:head><title>{m.page.title(m.nav.energy)}</title></svelte:head>

<!-- Header (spec §4 Énergie): « Énergie », the views, ‹ period ›, Exporter on one row from 1280 px, two rows (title and
     Exporter, then the views and the period) from 1024 px; on a phone the title and its « ⋯ », the views, the period. -->
<div class="top">
  <div class="title"><PageHeader title={m.nav.energy} /></div>
  <div class="views">
    <Segmented options={VIEWS.map((v) => ({ value: v, label: m.energy.views[v] }))} value={data.view} label={m.energyPage.views} onchange={(v) => navigate(() => data.setView(v))} />
  </div>
  <div class="nav-wrap" bind:this={navEl}>
    {#if data.period}
      <PeriodNav
        title={periodTitle(data.view, data.period)}
        canPrev={data.canPrev}
        canNext={data.canNext}
        latest={data.latest}
        onstep={step}
        onlatest={toLatest} />
    {:else}
      <div class="skeleton nav-sk" aria-hidden="true"></div>
    {/if}
  </div>
  <div class="export">
    {#if canExport}
      <span class="desk"><Menu label={m.energyUi.export} text={m.energyUi.export} icon="download" items={exportItems} footer={m.energyUi.exportFormat} /></span>
      <span class="phone"><Menu label={m.energyUi.export} items={exportItems} footer={m.energyUi.exportFormat} /></span>
    {/if}
  </div>
</div>

<!-- Context row: the Linky source line, the Tempo chips (Tempo only) and the EcoWatt chip. -->
<div class="context">
  {#if ready && linkyLine}
    <SourceLine source="Linky" text={linkyLine.text} state={linkyLine.state} title={m.energyUi.linkyTitle} rows={linkyLine.rows} provenance={linkyLine.prov} />
  {/if}
  {#if ready}<GridChips />{/if}
</div>
{#if data.period}
  <PeriodBar title={periodTitle(data.view, data.period)} view={m.energy.views[data.view]} canPrev={data.canPrev} canNext={data.canNext} onstep={step} anchor={navEl} />
{/if}

{#if data.error}<p class="error" role="alert">{data.failed ? m.energyPage.failedPeriod(periodTitle(data.failed.view, data.failed.period), data.error()) : data.error()} <button type="button" class="btn btn-sm" onclick={() => navigate(() => data.retry())}>{m.energyPage.retry}</button></p>{/if}
{#if ready && linkyProblem}
  <p class="callout bad" role="status">{linkyProblem.text}&nbsp;<a href="{ROUTES.linky}">{linkyProblem.link}</a></p>
{/if}
{#if ready}{#each alerts.of(['price_change', 'consent_expiring', 'linky_stalled', 'hc_changed']) as a (a.id)}<AlertCallout alert={a} />{/each}{/if}

{#snippet barsPanel()}
  <section class="panel bars-w" class:span2={!dayish} aria-labelledby="bars-title">
    <div class="whead">
      <div class="wtitle"><h2 id="bars-title">{barsTitle}</h2>{#if barsAside}<span class="aside num">{' · '}{barsAside}</span>{/if}</div>
      {#if chart?.linky}
      <ul class="legend">
        {#if anySplit}
          <li><Swatch series="hc" />{m.energyPage.hc}</li>
          <li><Swatch series="hp" />{m.energyPage.hp}</li>
        {/if}
        {#if bars.some((b) => b.kwh != null && !splitOf(b))}
          <li><Swatch series="home" />{homeName}</li>
        {/if}
        <li><Swatch series="radiators" line />{m.energyPage.radiators}</li>
        {#if tempoDots}<li>{m.energyBoard.tempoTitle}</li>{/if}
      </ul>
      {/if}
    </div>
    {#if chart?.linky}
      <EnergyBars
        {groups}
        {colors}
        {names}
        {overlay}
        {details}
        unit="kWh"
        label={m.energyPage.houseChart(unitWord)}
        height={barsHeight}
        tempo={tempoDots}
        ghost={ghost ? { index: ghost.index, value: ghost.value } : null}
        bind:selected={selectedBar}
        ondrill={drill}
        {drillLabel}
        onswipe={step} />
      {#if ghost}<p class="muted small">{m.energyBoard.yearGhost(monthName(`${ghost.key}-01`), ghost.label)}</p>{/if}
      {#if trimmed > 0 && chart.linky_since}<p class="muted small">{m.energyPage.linkySince(fmtDateLong(chart.linky_since))}</p>{/if}
    {:else}
      <EnergyBars
        {groups}
        colors={{ rad: SERIES.radiators }}
        names={{ rad: m.energyPage.radiators }}
        {details}
        unit="kWh"
        label={m.energyPage.radChart(unitWord)}
        height={barsHeight}
        bind:selected={selectedBar}
        ondrill={drill}
        {drillLabel}
        onswipe={step} />
    {/if}
  </section>
{/snippet}

{#snippet tempoPanel()}
  {#if tempoLens}
    <section class="panel tempo-w" aria-labelledby="tempo-title">
      <h3 id="tempo-title">{m.energyBoard.tempoTitle}</h3>
      <TempoRows lens={tempoLens} />
      <p class="muted small">{m.energyBoard.tempoNote}</p>
    </section>
  {/if}
{/snippet}

{#if !ready}
  {#if !data.error}
    <!-- First load: the board in its final shape (bars and Résumé, then a row of three, then a long panel). -->
    <div class="cq"><div class="panels sk-board" aria-hidden="true">
      <div class="skeleton panel-sk span2" style:height="330px"></div>
      <div class="skeleton panel-sk hero-sk"></div>
      {#each [236, 236, 236] as h, i (i)}<div class="skeleton panel-sk" style:height="{h}px"></div>{/each}
    </div></div>
  {/if}
{:else if loaded && main && chart}
<div class="cq">
{#if linky?.state === 'off'}
  <!-- No Linky: an invitation, then the radiators alone (spec §4 « Sans Linky »). -->
  <section class="invite" aria-labelledby="invite-title">
    <span class="glyph" aria-hidden="true"><Icon name="energy" size={24} /></span>
    <div class="itext">
      <h2 id="invite-title">{m.energyUi.noLinkyTitle}</h2>
      <p>{m.energyUi.noLinkyBody}</p>
    </div>
    <a class="btn btn-primary" href="{ROUTES.linky}">{m.energyUi.noLinkyCta}</a>
  </section>
{/if}
<!-- Another view has other widgets: the board is drawn anew for it, so the view's report replaces the previous view's
     content instead of moving it (no layout shift when a slow report lands). Within a view the same widgets stay,
     dimmed while a new period loads. -->
{#key loaded.view}
<div class="panels" class:dayish class:year={loaded.view === 'year'} class:busy aria-busy={data.loading}>
  {#if !dayish}{@render barsPanel()}{/if}

  {#if dayish && main.linky && data.dayIso}
    <CurvePanel
      dayIso={data.dayIso}
      day={data.day}
      error={data.dayError?.() ?? null}
      view={loaded.view}
      split={main.tariff}
      canPrev={data.canPrevDay}
      canNext={data.canNextDay}
      onstep={(d) => data.stepDay(d)}
      onretry={() => data.retryDay()}
      curveSince={main.quality.curve_since}
      quota={linky?.state === 'quota'}
      bar={dayBar}
      chartHeight={desktop.matches ? 320 : 170}
      bind:index={scrub} />
  {/if}

  <EnergyHero report={main} view={loaded.view} last={data.last} latest={data.latest} linkyState={linky?.state ?? null}
    syncAt={linky?.last_ok_at != null ? linky.last_ok_at * 1000 : null} first={data.first} ongofirst={toFirst} onreveal={reveal} />

  {#if dayish}{@render barsPanel()}{/if}

  {#if main.linky}
    <!-- Row 2: Jour and Semaine: Puissance, the split, the rooms; Mois: the split, the Courbe's day, the rooms; Année:
         the months, then the split. -->
    {#if loaded.view === 'year'}
      <EnergyMonths class="span2" keys={bars.map((b) => b.key)} {details} last={data.last} onopen={drill} />
    {/if}
    {#if dayish}
      <PowerPanel view={loaded.view} day={powerDay} week={main.period.curve} failed={!!data.dayError} />
    {/if}
    {#if tempoLens}{@render tempoPanel()}{:else}
      <HcHpPanel lens={main.hc_lens} tariff={main.tariff} hpKwh={main.period.hp_kwh} kwh={main.period.kwh} hcKwh={main.period.hc_kwh} option={main.option} tempo={null} />
    {/if}
    {#if loaded.view === 'month' && data.dayIso}
      <CurveMini dayIso={data.dayIso} day={data.day} split={main.tariff} bar={dayBar} onopen={openCurve} />
    {/if}
    <WhereTop heating={main.heating} linky={main.linky} rows={main.by_radiator} span={elapsed ?? loaded.period}
      tariff={main.tariff} aside={whereAside} onmore={openWhere} />
  {/if}

  {#if roomDay && data.dayIso}
    <!-- Température et chauffe (Jour, Semaine): its own widget under the board, sharing the Courbe's scrubber. -->
    <RoomDayPanel
      day={data.day}
      dayIso={data.dayIso}
      room={data.room}
      onroom={(id) => data.setRoom(id)}
      error={data.dayError?.() ?? null}
      onretry={() => data.retryDay()}
      heading="h2"
      bind:index={scrub}
      class="inner wide" />
  {/if}
  {#if !main.linky}
    <!-- Without Linky the rooms are the evidence: the full section, open. -->
    <EnergyWhere heating={main.heating} radiators={main.period.radiators} restKwh={main.period.rest_kwh} {running} linky={false}
      rows={main.by_radiator} span={elapsed ?? loaded.period} tariff={main.tariff} split={main.option !== 'base'} class="wide" />
  {:else}
    <!-- The full per-room table (footnotes, rooms that open, lifetime counters): collapsed and findable until « Tout voir › »
         or a link to #energy-where (fragment navigation reveals it) opens it; the board's widget is its summary. -->
    <div class="where-wrap" hidden={whereOpen ? undefined : 'until-found'} onbeforematch={openWhere}>
      <EnergyWhere
        heating={main.heating}
        radiators={main.period.radiators}
        restKwh={main.period.rest_kwh}
        {running}
        linky={main.linky}
        rows={main.by_radiator}
        span={elapsed ?? loaded.period}
        tariff={main.tariff}
        split={main.option !== 'base'}
        onroom={(id) => roomDay && data.setRoom(id)} />
      {#if whereOpen}<button type="button" class="btn btn-ghost btn-sm fold" onclick={() => (whereOpen = false)}>{m.energyBoard.whereClose}</button>{/if}
    </div>
  {/if}

  {#if main.linky}
    <!-- Analyse: summary cards, their detail one « Détails » away. -->
    <section class="analysis wide" aria-labelledby="analysis-title">
      <h2 id="analysis-title" class="label">{m.energyUi.analysis}</h2>
      <div class="cards n{cards}">
        {#if tempoLens}
          <HcHpPanel lens={main.hc_lens} tariff={main.tariff} hpKwh={main.period.hp_kwh} kwh={main.period.kwh} hcKwh={main.period.hc_kwh} option={main.option} tempo={null} />
        {/if}
        <ComparePanel comparison={main.comparison} view={loaded.view} tariff={main.tariff} />
        <ProjectionPanel projection={main.projection} last={main.last_day} today={today.iso} />
      </div>
    </section>
  {/if}

  <!-- Collapsed: where every estimate comes from, opened by the « est. » links (#quality). -->
  {#if main.linky}
    <QualityPanel buckets={periodBars} group={chart.group} quality={main.period.quality} class="wide" />
  {/if}
</div>
{#if loaded.view === 'month' && main.linky && data.dayIso}
  <!-- Mois: the full Courbe (scrubber, readout, notes) in a sheet over the board, opened by « par demi-heure › » or a day bar. -->
  <Sheet open={curveOpen} title={m.curvePanel.heading(fmtDateLong(data.dayIso))} hideTitle tone="modal" width={920} trigger={curveTrigger}
    onclose={() => (curveOpen = false)} class="curve-sheet">
    <CurvePanel
      dayIso={data.dayIso}
      day={data.day}
      error={data.dayError?.() ?? null}
      view={loaded.view}
      split={main.tariff}
      canPrev={data.canPrevDay}
      canNext={data.canNextDay}
      onstep={(d) => data.stepDay(d)}
      onretry={() => data.retryDay()}
      curveSince={main.quality.curve_since}
      quota={linky?.state === 'quota'}
      bar={dayBar}
      chartHeight={desktop.matches ? 260 : 170}
      bind:index={scrub} />
  </Sheet>
{/if}
{/key}
</div>
{/if}

<style>
  /* Header (spec §4 Énergie): phone: title + « ⋯ », the views, the period; one row from 1024 px. */
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'title export' 'views views' 'nav nav';
    align-items: center;
    gap: 8px 12px;
  }
  .title {
    grid-area: title;
    min-width: 0;
  }
  .title :global(.page-header) {
    margin: 0;
  }
  .title :global(h1) {
    font-size: var(--fs-title);
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  .views {
    grid-area: views;
    min-width: 0;
  }
  .views :global(.seg) {
    display: flex;
    width: 100%;
  }
  .views :global(.seg button) {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 4px;
  }
  .nav-wrap {
    grid-area: nav;
    min-width: 0;
  }
  .nav-wrap :global(.nav) {
    margin-top: 0;
  }
  .export {
    grid-area: export;
    display: flex;
    justify-content: flex-end;
    min-width: 36px;
    min-height: 36px;
  }
  .desk {
    display: none;
  }
  @media (min-width: 1024px) {
    /* Two rows while the content column is narrow (title and « Exporter », then the views and the period)… */
    .top {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: 'title export' 'views nav';
      gap: 8px 16px;
    }
    /* « Exporter » arrives with the report: its place is held so nothing beside it moves. */
    .export {
      min-width: 128px;
    }
    .views :global(.seg) {
      display: inline-flex;
      width: 340px;
    }
    .views :global(.seg button) {
      flex: 1 1 0;
    }
    .nav-wrap :global(.label) {
      flex: 0 1 auto;
      min-width: 10.5rem;
    }
    .desk {
      display: contents;
    }
    .phone {
      display: none;
    }
  }
  /* …one row once it has room for all four. */
  @media (min-width: 1280px) {
    .top {
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      grid-template-areas: 'title views nav export';
    }
  }
  .nav-sk {
    height: 44px;
    border-radius: var(--r-pill);
  }
  /* Context row: Linky, Tempo (Tempo only), EcoWatt, as pills on one wrapping row. */
  .context {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    min-height: 24px;
    margin-top: 12px;
  }
  .context :global(.source-line) {
    max-width: 100%;
  }
  .callout {
    font-size: 13px;
    margin: 10px 0 0;
  }
  .callout.bad {
    color: var(--bad);
  }
  .callout a {
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .error {
    color: var(--bad);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    font-size: 13px;
  }
  .error .btn {
    color: var(--tx);
  }
  /* « Reliez votre compteur Linky »: the glyph disc, the words, the primary; stacked on a phone. */
  .invite {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px 18px;
    margin-bottom: var(--gap-w);
    padding: 18px;
    background: var(--s1);
    border-radius: var(--r-widget);
  }
  .invite .glyph {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--tx);
  }
  .invite h2 {
    margin: 0 0 4px;
    font-size: 17px;
    font-weight: 600;
  }
  .invite p {
    margin: 0;
    font-size: 14px;
    color: var(--mu);
  }
  .invite .btn {
    grid-column: 1 / -1;
    justify-self: start;
  }
  @container (min-width: 640px) {
    .invite {
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: 20px 22px;
    }
    .invite .btn {
      grid-column: auto;
    }
  }
  /* The board answers to its own width (the sidebar takes 220 px). One column, then from 900 px of content the
     Tableau grid: two flexible columns and the 330 px Résumé column. */
  .cq {
    container-type: inline-size;
    margin-top: 16px;
  }
  .panels {
    display: grid;
    gap: var(--gap-w);
    grid-template-columns: minmax(0, 1fr);
  }
  .panels > :global(*) {
    min-width: 0;
    transition: opacity var(--t-state) ease;
  }
  /* A new period is on its way: the old one stays, dimmed, instead of a blank « Chargement… ». */
  .panels.busy > :global(*) {
    opacity: 0.55;
  }
  /* Every board cell is a Tableau widget: --s1, radius 22, flat. */
  .panels > :global(.panel) {
    padding: 16px 18px;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  .panels > :global(.panel) :global(h2) {
    font-size: 15px;
    font-weight: 600;
    color: var(--tx);
    margin: 0 0 10px;
  }
  /* Small widgets: the label is 12.5/600 muted (spec §1 « Widget label »). */
  .panels > :global(.panel) > :global(h3) {
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
    margin: 0 0 8px;
  }
  /* The Résumé first on a phone (the answer, then the evidence), its skeleton too. */
  .panels > :global(.hero),
  .panels > .hero-sk {
    order: -1;
  }
  /* The bars' header answers to the widget's width, never to its text: the legend sits under the title below
     700 px of widget and beside it from there, so the web font arriving never re-wraps it (CLS « fonts late »). */
  .bars-w {
    container-type: inline-size;
  }
  .whead {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px 14px;
    margin-bottom: 10px;
  }
  @container (min-width: 700px) {
    .whead {
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
    }
  }
  .wtitle {
    font-size: 15px;
    font-weight: 600;
  }
  .panels > .bars-w .wtitle h2 {
    display: inline;
    margin: 0;
  }
  .aside {
    font-weight: 600;
  }
  .panel-sk {
    border-radius: var(--r-widget);
  }
  .hero-sk {
    height: 330px;
  }
  @container (min-width: 900px) {
    .panels {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 330px;
      gap: 16px;
    }
    .panels > :global(.hero),
    .panels > .hero-sk {
      order: 0;
    }
    .panels > :global(.span2) {
      grid-column: span 2;
    }
    .panels > :global(.wide),
    .panels > .where-wrap,
    .panels > :global(.analysis) {
      grid-column: 1 / -1;
    }
    /* Année: the months span two rows, the split and the rooms beside them. */
    .panels.year > :global(.months) {
      grid-row: span 2;
    }
    .where-wrap[hidden] {
      margin-top: -16px;
    }
    .panels > :global(.panel) {
      padding: 18px 20px;
    }
    /* Jour, Semaine: the Courbe spans two columns and two rows, the Résumé and the 7 bars beside it. */
    .panels.dayish > :global(#curve) {
      grid-column: span 2;
      grid-row: span 2;
      align-self: stretch;
    }
  }
  /* Analyse: a label over summary cards; two (or three) abreast from 640 px of content. */
  .analysis {
    container-type: inline-size;
  }
  .analysis .label {
    margin: 6px 0 8px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--mu);
  }
  .cards {
    display: grid;
    gap: var(--gap-w);
    grid-template-columns: minmax(0, 1fr);
  }
  .cards > :global(.panel) {
    min-width: 0;
    padding: 16px 18px;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  .cards > :global(.panel) :global(h3) {
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
    margin: 0 0 8px;
  }
  @container (min-width: 640px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .cards.n3 > :global(:last-child) {
      grid-column: span 2;
    }
  }
  @container (min-width: 900px) {
    .cards.n3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .cards.n3 > :global(:last-child) {
      grid-column: auto;
    }
  }
  /* A key figure's link lands its section clear of the condensed period bar (nested cards included). */
  .cq :global([id]) {
    scroll-margin-top: 60px;
  }
  .small {
    font-size: 12px;
    margin: 6px 0 0;
  }
  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 0;
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--mu);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  /* Collapsed, the section takes no room and no gap. */
  .where-wrap {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .where-wrap[hidden] {
    margin-top: calc(-1 * var(--gap-w));
  }
  .where-wrap > :global(.panel) {
    padding: 18px 20px;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  .where-wrap :global(.panel h2) {
    font-size: 15px;
    font-weight: 600;
    color: var(--tx);
  }
  .fold {
    justify-self: center;
  }
  :global(.curve-sheet) :global(#curve) {
    padding: 4px 4px 8px;
  }
  :global(.curve-sheet) :global(#curve h2) {
    margin: 0;
    font-size: var(--fs-area);
    font-weight: 600;
  }
</style>
