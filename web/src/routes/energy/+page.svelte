<script lang="ts">
  import { untrack } from 'svelte';
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import AlertCallout from '$lib/components/AlertCallout.svelte';
  import ComparePanel from '$lib/components/ComparePanel.svelte';
  import CurvePanel from '$lib/components/CurvePanel.svelte';
  import EnergyBars from '$lib/components/EnergyBars.svelte';
  import EnergyHero from '$lib/components/EnergyHero.svelte';
  import GridStrip from '$lib/components/GridStrip.svelte';
  import ExportPanel from '$lib/components/ExportPanel.svelte';
  import HcHpPanel from '$lib/components/HcHpPanel.svelte';
  import HeatingPanel from '$lib/components/HeatingPanel.svelte';
  import PeriodNav from '$lib/components/PeriodNav.svelte';
  import PowerPanel from '$lib/components/PowerPanel.svelte';
  import ProjectionPanel from '$lib/components/ProjectionPanel.svelte';
  import QualityPanel from '$lib/components/QualityPanel.svelte';
  import RoomDayPanel from '$lib/components/RoomDayPanel.svelte';
  import RoomsEnergy from '$lib/components/RoomsEnergy.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { addDays, bucketLabel, bucketSpan, dataSpan, firstCounted, periodTitle, SERIES, VIEWS, type View } from '$lib/energy';
  import { fmtDateLong, fmtDay, fmtKwh, fmtTime, monthYear } from '$lib/format';
  import { apiMessage, m } from '$lib/i18n';
  import { inspectBucket } from '$lib/inspector';
  import { reducedMotion } from '$lib/motion';
  import { ANCHORS, ROUTES } from '$lib/paths';
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
  let names = $derived<Record<string, string>>({ hc: m.energyPage.hc, hp: m.energyPage.hp, home: m.energyPage.consumption });
  let colors = $derived<Record<string, string>>({ hc: SERIES.hc, hp: SERIES.hp, home: SERIES.home });
  // The house chart starts at the first counted bucket (Linky data, or a counted day without it, which pays its
  // subscription): earlier ones are not gaps.
  let trimmed = $derived(chart?.linky ? firstCounted(chart.buckets) : 0);
  let bars = $derived((chart?.buckets ?? []).slice(chart?.linky ? trimmed : 0));
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

  // Qualité describes the selected period: in Jour the bars are the 7 days ending on it, so only its own bucket.
  let periodBars = $derived(loaded?.view === 'day' ? bars.filter((b) => b.key === loaded.period.from) : bars);

  // Température et chauffe is for Jour and Semaine (one day at a time, the Courbe's day): full width, under the Courbe
  // whose scrubber it shares. It holds its place (a skeleton) until the house is known, so nothing below moves.
  let roomDay = $derived(!!loaded && loaded.main.linky && (loaded.view === 'day' || loaded.view === 'week'));
  // Puissance (Jour, Semaine), HC/HP and Chauffage sit three abreast; with fewer, they share the row.
  let trio = $derived.by(() => {
    if (!loaded || !loaded.main.linky) return { power: '', hchp: '', heating: '' };
    const power = loaded.view === 'day' || loaded.view === 'week';
    if (power) return { power: 'third', hchp: 'third', heating: 'third last' };
    return { power: '', hchp: 'half', heating: 'half' };
  });
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
  function drill(i: number) {
    const b = bars[i];
    if (!b || !loaded) return;
    const opensCurve = group === 'day' && loaded.view !== 'day';
    navigate(() => data.drill(b.key));
    if (opensCurve) {
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

  /** The Linky line under the title, by state: progress is neutral and needs no link; only auth
   * and error are problems, with the way to fix them. */
  let linkyNote = $derived.by((): { text: string; link: string | null; bad: boolean } | null => {
    if (linkyFailed) return { text: m.energyPage.statusFailed, link: m.energyPage.settings, bad: true };
    if (!linky || linky.state === 'off' || linky.state === 'ok') return null;
    switch (linky.state) {
      case 'never':
        return { text: m.energyPage.never, link: null, bad: false };
      case 'quota':
        return { text: m.energyPage.quota, link: null, bad: false };
      case 'throttled':
        return { text: linky.retry_at ? m.energyPage.throttledAt(fmtTime(linky.retry_at * 1000)) : m.energyPage.throttled, link: null, bad: false };
      case 'auth':
        return { text: m.energyPage.auth, link: m.energyPage.renew, bad: true };
      default:
        // The state's own code first (it follows the language), the server's French message as the fallback.
        return { text: apiMessage(`linky_status_${linky.state}`, {}, linky.message ?? m.energyPage.syncFailed), link: m.energyPage.settings, bad: true };
    }
  });
</script>

<svelte:head><title>{m.page.title(m.nav.energy)}</title></svelte:head>

<header class="top">
  <h1>{m.nav.energy}</h1>
  <Segmented options={VIEWS.map((v) => ({ value: v, label: m.energy.views[v] }))} value={data.view} label={m.energyPage.views} onchange={(v) => navigate(() => data.setView(v))} />
</header>
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

{#if !ready}{:else if linky?.state === 'off'}
  <p class="callout">{m.energyPage.connect} <a href="{ROUTES.home}#{ANCHORS.linky}">{m.energyPage.settings}</a></p>
{:else if linkyNote}
  <p class="callout" class:bad={linkyNote.bad} role="status">{linkyNote.text}{#if linkyNote.link}&nbsp;<a href="{ROUTES.home}#{ANCHORS.linky}">{linkyNote.link}</a>{/if}</p>
{/if}
{#if ready}{#each alerts.of(['price_change', 'consent_expiring', 'linky_stalled', 'hc_changed']) as a (a.id)}<AlertCallout alert={a} />{/each}{/if}
{#if ready}<GridStrip />{/if}
{#if ready && main?.last_day}<p class="muted fresh">{m.energyPage.fresh(fmtDay(main.last_day))}</p>{/if}
{#if data.error}<p class="error" role="alert">{data.failed ? m.energyPage.failedPeriod(periodTitle(data.failed.view, data.failed.period), data.error()) : data.error()} <button type="button" class="btn btn-sm" onclick={() => navigate(() => data.retry())}>{m.energyPage.retry}</button></p>{/if}

{#if !ready}
  {#if !data.error}
    <!-- First load: panels in their final shape (hero, chart, curve, a short panel). -->
    <div class="cq"><div class="panels" aria-hidden="true">
      {#each [150, 262, 300, 92] as h, i (i)}<div class="skeleton panel-sk wide" style:height="{h}px"></div>{/each}
    </div></div>
  {/if}
{:else if loaded && main && chart}
<div class="cq">
<!-- Dimmed while a new period loads, and while a failed one leaves the previous period shown. -->
<div class="panels" class:busy aria-busy={data.loading}>
  <EnergyHero report={main} view={loaded.view} last={data.last} />

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
        {#if bars.some(splitOf)}
          <li><span class="swatch" style:background={SERIES.hc}></span>{m.energyPage.hc}</li>
          <li><span class="swatch" style:background={SERIES.hp}></span>{m.energyPage.hp}</li>
        {/if}
        {#if bars.some((b) => !splitOf(b))}
          <li><span class="swatch" style:background={SERIES.home}></span>{m.energyPage.consumption}</li>
        {/if}
        <li><span class="line" style:background={SERIES.radiators}></span>{m.energyPage.radiators}</li>
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
      bind:index={scrub} />
  {/if}
  {#if roomDay && data.dayIso}
    <RoomDayPanel
      day={data.day}
      dayIso={data.dayIso}
      room={data.room}
      onroom={(id) => data.setRoom(id)}
      error={data.dayError?.() ?? null}
      onretry={() => data.retryDay()}
      bind:index={scrub}
      class="wide" />
  {/if}

  {#if main.linky}
    {#if loaded.view === 'day' || loaded.view === 'week'}
      <PowerPanel view={loaded.view} day={powerDay} week={main.period.curve} failed={!!data.dayError} class={trio.power} />
    {/if}
    <HcHpPanel lens={main.hc_lens} tariff={main.tariff} hpKwh={main.period.hp_kwh} option={main.option} tempo={main.tempo_lens} class={trio.hchp} />
    <HeatingPanel heating={main.heating} radiators={main.period.radiators} restKwh={main.period.rest_kwh} {running} class={trio.heating} />
  {/if}

  {#if main.linky}
    <!-- A pair in every view, so neither sits alone beside an empty half. -->
    <ComparePanel comparison={main.comparison} view={loaded.view} tariff={main.tariff} class="half" />
    <ProjectionPanel projection={main.projection} last={main.last_day} today={today.iso} class="half" />
  {/if}

  <RoomsEnergy rows={main.by_radiator} span={elapsed ?? loaded.period} tariff={main.tariff} split={main.option !== 'base'} class="wide" />

  <!-- Collapsed: where every estimate comes from, opened by the « est. » links (#quality). -->
  {#if main.linky}
    <QualityPanel buckets={periodBars} group={chart.group} quality={main.period.quality} class="wide" />
  {/if}

  <section class="panel wide" aria-busy={!house.loaded}>
    <h2>{m.energyPage.counters}</h2>
    {#if !house.loaded}
      <div class="skeleton inset counters-sk" aria-hidden="true"></div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{m.energyPage.radiator}</th><th class="room">{m.energyPage.room}</th><th class="r">{m.energyPage.lifetime}</th>
              <th class="r opt">{m.energyPage.register1}</th><th class="r opt">{m.energyPage.register2}</th>
            </tr>
          </thead>
          <tbody>
            {#each Object.values(house.radiators) as r (r.id)}
              {#if r.energy_wh}
                <tr>
                  <td>{r.model ?? r.name}<span class="sub-room muted">{house.room(r.room_id)?.name ?? '—'}</span></td>
                  <td class="room">{house.room(r.room_id)?.name ?? '—'}</td>
                  <td class="r mono">{fmtKwh(r.energy_wh.total / 1000, false)}</td>
                  <td class="r mono opt">{fmtKwh(r.energy_wh.t1 != null ? r.energy_wh.t1 / 1000 : null, false)}</td>
                  <td class="r mono opt">{fmtKwh(r.energy_wh.t2 != null ? r.energy_wh.t2 / 1000 : null, false)}</td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <ExportPanel {chart} {main} period={loaded.period} roomSpan={elapsed ?? loaded.period} day={data.day} class="wide" />
</div>
</div>
{/if}

<style>
  .top {
    max-width: 1180px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  h1 {
    font-size: 22px;
    margin: 0;
  }
  .nav-sk {
    height: 44px;
    margin-top: 12px;
    max-width: 1180px;
  }
  .callout,
  .fresh {
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
  /* The grid answers to its own width (the sidebar takes 232 px of a 1024 px screen): one column,
     then pairs from 720 px, then the Puissance · HC/HP · Chauffage trio from 960 px. */
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
  @container (min-width: 720px) {
    .panels {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .panels > :global(*) {
      grid-column: span 6;
    }
    .panels > :global(.half),
    .panels > :global(.third) {
      grid-column: span 3;
    }
    .panels > :global(.third.last) {
      grid-column: span 6;
    }
  }
  @container (min-width: 960px) {
    .panels > :global(.third),
    .panels > :global(.third.last) {
      grid-column: span 2;
    }
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
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .line {
    width: 14px;
    height: 2px;
    border-radius: 1px;
  }
  .counters-sk {
    height: 160px;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    padding: 8px 6px;
    border-bottom: 1px solid var(--line);
    text-align: left;
  }
  th {
    color: var(--mu);
    font-weight: 500;
  }
  .r {
    text-align: right;
  }
  th.r {
    white-space: nowrap;
  }
  .sub-room {
    display: none;
  }
  /* Phone: the room folds under the name, and only the lifetime total stays. */
  @media (max-width: 599px) {
    .room,
    .opt {
      display: none;
    }
    .sub-room {
      display: block;
      font-size: 12px;
    }
  }
</style>
