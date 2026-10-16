<script lang="ts">
  import { untrack } from 'svelte';
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import AlertCallout from '$lib/components/AlertCallout.svelte';
  import ComparePanel from '$lib/components/ComparePanel.svelte';
  import CurvePanel from '$lib/components/CurvePanel.svelte';
  import EnergyBars from '$lib/components/EnergyBars.svelte';
  import EnergyHero from '$lib/components/EnergyHero.svelte';
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
  import SourceLine from '$lib/components/SourceLine.svelte';
  import Swatch from '$lib/components/Swatch.svelte';
  import { addDays, bucketLabel, bucketSpan, dataSpan, firstCounted, periodTitle, SERIES, VIEWS, type View } from '$lib/energy';
  import { exportActions } from '$lib/export';
  import { freshness } from '$lib/freshness';
  import { fmtDateLong, fmtDay, fmtTime, monthYear } from '$lib/format';
  import { apiMessage, m } from '$lib/i18n';
  import { inspectBucket } from '$lib/inspector';
  import { reducedMotion } from '$lib/motion';
  import { ANCHORS, ROUTES } from '$lib/paths';
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
  // Analyse: Puissance (Jour, Semaine), Heures creuses, Comparaisons, Projection; four cards go two by two, three abreast.
  let cards = $derived(!loaded || !loaded.main.linky ? 0 : loaded.view === 'day' || loaded.view === 'week' ? 4 : 3);
  // Puissance in Jour reads the period's own day, never another day still on screen.
  let powerDay = $derived(loaded && (loaded.view !== 'day' || data.day?.date === loaded.period.from) ? data.day : null);
  // A period running into today counts its radiators up to yesterday.
  let running = $derived(!!loaded && loaded.period.to > today.iso);
  // The radiator figures and room stats count elapsed days only, up to yesterday (not up to the last Linky day).
  let elapsed = $derived(loaded ? dataSpan(loaded.period, addDays(today.iso, -1)) : null);

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
      curveOpen = true;
      announcer.say(m.energyPage.curveShown(fmtDateLong(b.key)));
      document.getElementById(ANCHORS.curve)?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
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

<div class="top">
  <div class="title"><PageHeader title={m.nav.energy} /></div>
  <div class="views">
    <Segmented options={VIEWS.map((v) => ({ value: v, label: m.energy.views[v] }))} value={data.view} label={m.energyPage.views} onchange={(v) => navigate(() => data.setView(v))} />
  </div>
  <div class="export">
    {#if canExport}
      <span class="desk"><Menu label={m.energyUi.export} text={m.energyUi.export} icon="download" items={exportItems} footer={m.energyUi.exportFormat} /></span>
      <span class="phone"><Menu label={m.energyUi.export} items={exportItems} footer={m.energyUi.exportFormat} /></span>
    {/if}
  </div>
</div>

<div class="context">
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
  <div class="signals">
    {#if ready && linkyLine}
      <SourceLine source="Linky" text={linkyLine.text} state={linkyLine.state} title={m.energyUi.linkyTitle} rows={linkyLine.rows} provenance={linkyLine.prov} />
    {/if}
    {#if ready}<GridChips />{/if}
  </div>
</div>
{#if data.period}
  <PeriodBar title={periodTitle(data.view, data.period)} view={m.energy.views[data.view]} canPrev={data.canPrev} canNext={data.canNext} onstep={step} anchor={navEl} />
{/if}

{#if data.error}<p class="error" role="alert">{data.failed ? m.energyPage.failedPeriod(periodTitle(data.failed.view, data.failed.period), data.error()) : data.error()} <button type="button" class="btn btn-sm" onclick={() => navigate(() => data.retry())}>{m.energyPage.retry}</button></p>{/if}
{#if ready && linkyProblem}
  <p class="callout bad" role="status">{linkyProblem.text}&nbsp;<a href="{ROUTES.home}#{ANCHORS.linky}">{linkyProblem.link}</a></p>
{/if}
{#if ready}{#each alerts.of(['price_change', 'consent_expiring', 'linky_stalled', 'hc_changed']) as a (a.id)}<AlertCallout alert={a} />{/each}{/if}

{#if !ready}
  {#if !data.error}
    <!-- First load: panels in their final shape (Résumé, chart, Courbe, a long panel). -->
    <div class="cq"><div class="panels" aria-hidden="true">
      <div class="skeleton panel-sk wide hero-sk"></div>
      {#each [262, 236, 300] as h, i (i)}<div class="skeleton panel-sk wide" style:height="{h}px"></div>{/each}
    </div></div>
  {/if}
{:else if loaded && main && chart}
<div class="cq">
{#if linky?.state === 'off'}
  <!-- No Linky: an invitation, then the radiators alone (direction-2 §2 States). -->
  <section class="invite" aria-labelledby="invite-title">
    <span class="glyph" aria-hidden="true"><Icon name="energy" size={18} /></span>
    <div>
      <h2 id="invite-title">{m.energyUi.noLinkyTitle}</h2>
      <p>{m.energyUi.noLinkyBody}</p>
      <a class="btn" href="{ROUTES.home}#{ANCHORS.linky}">{m.energyUi.noLinkyCta}</a>
    </div>
  </section>
{/if}
<!-- Another view has other panels (Puissance, Température et chauffe, a collapsed Courbe): the panels are drawn anew
     for it, so the view's report replaces the previous view's content instead of moving it (no layout shift when a
     slow report lands). Within a view the same panels stay, dimmed while a new period loads. -->
{#key loaded.view}
<!-- Dimmed while a new period loads, and while a failed one leaves the previous period shown. -->
<div class="panels" class:busy aria-busy={data.loading}>
  <EnergyHero report={main} view={loaded.view} last={data.last} latest={data.latest} linkyState={linky?.state ?? null}
    syncAt={linky?.last_ok_at != null ? linky.last_ok_at * 1000 : null} first={data.first} ongofirst={toFirst} />

  <section class="panel wide">
    {#if chart.linky}
      <h2>{m.energyPage.houseTitle}</h2>
      <EnergyBars
        {groups}
        {colors}
        {names}
        {overlay}
        {details}
        unit="kWh"
        label={m.energyPage.houseChart(unitWord)}
        bind:selected={selectedBar}
        ondrill={drill}
        {drillLabel}
        onswipe={step} />
      <ul class="legend">
        {#if anySplit}
          <li><Swatch series="hc" />{m.energyPage.hc}</li>
          <li><Swatch series="hp" />{m.energyPage.hp}</li>
        {/if}
        {#if bars.some((b) => b.kwh != null && !splitOf(b))}
          <li><Swatch series="home" />{homeName}</li>
        {/if}
        <li><Swatch series="radiators" line />{m.energyPage.radiators}</li>
      </ul>
      {#if trimmed > 0 && chart.linky_since}<p class="muted small">{m.energyPage.linkySince(fmtDateLong(chart.linky_since))}</p>{/if}
    {:else}
      <h2>{m.energyPage.radTitle}</h2>
      <EnergyBars
        {groups}
        colors={{ rad: SERIES.radiators }}
        names={{ rad: m.energyPage.radiators }}
        {details}
        unit="kWh"
        label={m.energyPage.radChart(unitWord)}
        bind:selected={selectedBar}
        ondrill={drill}
        {drillLabel}
        onswipe={step} />
    {/if}
  </section>

  {#if main.linky && data.dayIso}
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
      collapsible={loaded.view === 'month' || loaded.view === 'year'}
      bind:open={curveOpen}
      bind:index={scrub} />
  {/if}
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
    onroom={(id) => roomDay && data.setRoom(id)}
    class="wide">
    {#if roomDay && data.dayIso}
      <RoomDayPanel
        day={data.day}
        dayIso={data.dayIso}
        room={data.room}
        onroom={(id) => data.setRoom(id)}
        error={data.dayError?.() ?? null}
        onretry={() => data.retryDay()}
        heading="h3"
        bind:index={scrub}
        class="inner" />
    {/if}
  </EnergyWhere>

  {#if main.linky}
    <!-- Analyse: summary cards, their detail one « Détails » away. -->
    <section class="analysis wide" aria-labelledby="analysis-title">
      <h2 id="analysis-title" class="label">{m.energyUi.analysis}</h2>
      <div class="cards n{cards}">
        {#if loaded.view === 'day' || loaded.view === 'week'}
          <PowerPanel view={loaded.view} day={powerDay} week={main.period.curve} failed={!!data.dayError} />
        {/if}
        <HcHpPanel lens={main.hc_lens} tariff={main.tariff} hpKwh={main.period.hp_kwh} option={main.option} tempo={main.tempo_lens} />
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
{#if exportItems.length}
  <!-- Discoverability: the same menu at the end of the story (direction-2 §2 phone). -->
  <div class="end"><Menu label={m.energyUi.export} text={m.energyUi.exportMore} icon="download" items={exportItems} footer={m.energyUi.exportFormat} /></div>
{/if}
{/key}
</div>
{/if}

<style>
  /* Header: « Énergie », the views, « Exporter » on one row from 1024 px; on a phone the views take their own row
     under the title and its « ⋯ ». */
  .top {
    max-width: 1180px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'title export' 'views views';
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
    .top {
      grid-template-columns: minmax(0, 1fr) auto auto;
      grid-template-areas: 'title views export';
    }
    .views :global(.seg) {
      display: inline-flex;
      width: auto;
    }
    .views :global(.seg button) {
      flex: none;
      padding-inline: 14px;
    }
    .desk {
      display: contents;
    }
    .phone {
      display: none;
    }
  }
  /* Context row: the navigator, then the Linky source line and the grid chips; one row from 1024 px. */
  .context {
    max-width: 1180px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 20px;
    margin-top: 10px;
  }
  .nav-wrap {
    flex: 1 1 100%;
    min-width: 0;
  }
  .nav-wrap :global(.nav) {
    margin-top: 0;
  }
  .signals {
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 16px;
    min-width: 0;
    min-height: 24px;
  }
  .signals :global(.source-line) {
    max-width: 100%;
  }
  @media (min-width: 1024px) {
    .nav-wrap {
      flex: 0 1 auto;
    }
    .nav-wrap :global(.label) {
      flex: 0 1 auto;
      min-width: 9rem;
    }
    .signals {
      flex: 1 1 320px;
      justify-content: flex-end;
    }
  }
  .nav-sk {
    height: 44px;
    max-width: 1180px;
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
  .invite {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
    padding: 14px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .invite .glyph {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--s2);
    color: var(--mu);
  }
  .invite h2 {
    margin: 4px 0 4px;
    font-size: 15px;
    font-weight: 600;
  }
  .invite p {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--mu);
  }
  /* The grid answers to its own width (the sidebar takes 232 px of a 1024 px screen); every section is full width. */
  .cq {
    container-type: inline-size;
    max-width: 1180px;
    margin-top: 14px;
  }
  .panels {
    display: grid;
    gap: 14px;
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
  .panels > :global(.panel) {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
  }
  /* Every panel's heading is a section label (DESIGN.md Typography). */
  .panels > :global(.panel) :global(h2) {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .panel-sk {
    border: 1px solid var(--line);
  }
  /* Analyse: a section label over summary cards; one column, two from 640 px of content, three abreast (three
     cards) from 900 px. */
  .analysis {
    container-type: inline-size;
  }
  .analysis .label {
    margin: 4px 0 8px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
  }
  .cards {
    display: grid;
    gap: 14px;
    grid-template-columns: minmax(0, 1fr);
  }
  .cards > :global(.panel) {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
  }
  .cards > :global(.panel) :global(h3) {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
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
  /* A key figure's link lands its section clear of the condensed period bar. */
  .panels > :global([id]) {
    scroll-margin-top: 60px;
  }
  /* The Résumé's first-load shape: its figure, range, bar and sentence (and the key figures beside or under it). */
  .hero-sk {
    height: 250px;
  }
  @container (min-width: 640px) {
    .hero-sk {
      height: 190px;
    }
  }
  .small {
    font-size: 12px;
    margin: 6px 0 0;
  }
  .legend {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 0;
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .end {
    display: flex;
    justify-content: center;
    margin-top: 14px;
  }
</style>
