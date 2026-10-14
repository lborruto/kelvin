<script lang="ts">
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import CurvePanel from '$lib/components/CurvePanel.svelte';
  import EnergyBars from '$lib/components/EnergyBars.svelte';
  import EnergyHero from '$lib/components/EnergyHero.svelte';
  import PeriodNav from '$lib/components/PeriodNav.svelte';
  import RoomTodayStrip from '$lib/components/RoomTodayStrip.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { bucketLabel, bucketSpan, leadingMissing, periodTitle, SERIES, VIEWS, type View } from '$lib/energy';
  import { fmtDateLong, fmtDay, fmtEur, fmtKwh, fmtPct, fmtTime, monthName, parisTodayIso } from '$lib/format';
  import { inspectBucket } from '$lib/inspector';
  import { reducedMotion } from '$lib/motion';
  import { announcer } from '$lib/stores/announcer.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { EnergieData } from './energie.svelte';

  const COPY = {
    page: 'Énergie · Kelvin',
    title: 'Énergie',
    views: 'Période',
    unit: { day: 'jour', week: 'semaine', month: 'mois', year: 'année' } as Record<View, string>,
    houseTitle: 'Consommation de la maison',
    houseChart: (unit: string) => `Consommation de la maison par ${unit}`,
    radTitle: 'Consommation des radiateurs',
    radChart: (unit: string) => `Consommation des radiateurs par ${unit}`,
    hc: 'Heures creuses',
    hp: 'Heures pleines',
    home: 'Maison',
    radiators: 'Radiateurs',
    linkySince: (d: string) => `Historique Linky depuis le ${d}.`,
    drillMonth: (m: string) => `Voir ${m}`,
    drillDay: 'Voir ce jour',
    drillCurve: (d: string) => `Voir la courbe du ${d}`,
    curveShown: (d: string) => `Courbe du ${d}`,
    retry: 'Réessayer',
    failedPeriod: (period: string, error: string) => `${period}\u00a0: ${error}`,
    fresh: (d: string) => `Linky\u00a0: données jusqu’au ${d}`,
    connect: 'Reliez le compteur Linky pour voir la consommation de toute la maison et son coût.',
    settings: 'Réglages',
    renew: 'Renouveler le jeton',
    statusFailed: 'État du Linky indisponible.',
    never: 'Linky relié\u00a0: première synchronisation en attente.',
    quota: 'Historique en cours de récupération\u00a0: la suite arrive demain.',
    throttledAt: (t: string) => `Enedis limite les requêtes\u00a0: nouvel essai à ${t}.`,
    throttled: 'Enedis limite les requêtes\u00a0: nouvel essai plus tard.',
    auth: 'MyElectricalData refuse le jeton Linky.',
    syncFailed: 'Synchronisation Linky en échec.',
    counters: 'Compteurs des radiateurs',
    radiator: 'Radiateur',
    room: 'Pièce',
    lifetime: 'Depuis l’installation (kWh)',
    register1: 'Registre 1 (kWh)',
    register2: 'Registre 2 (kWh)'
  } as const;
  const NO_ROOM = 'sans-piece';

  const data = new EnergieData();
  let linky = $state<LinkyStatus | null>(null);
  let linkyFailed = $state(false);
  /** The scrubbed half-hour, shared by the Courbe and Température et chauffe. */
  let scrub = $state<number | null>(null);
  let selectedBar = $state<number | null>(null);

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
  // The day detail carries the selected room's samples (readout « Température », Task 10's chart).
  $effect(() => {
    if (house.loaded && data.room == null && house.rooms.length) data.setRoom(house.rooms[0].id);
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
  let ready = $derived(!!loaded && (!!linky || linkyFailed));
  let busy = $derived(data.loading || (!!data.error && loaded?.period !== data.period));
  let group = $derived(chart?.group ?? 'day');
  let unitWord = $derived(COPY.unit[group]);

  let split = $derived(!!main?.tariff);
  let names = $derived<Record<string, string>>(split ? { hc: COPY.hc, hp: COPY.hp } : { home: COPY.home });
  let colors = $derived<Record<string, string>>(split ? { hc: SERIES.hc, hp: SERIES.hp } : { home: SERIES.home });
  // The house chart starts at the first bucket with Linky data: earlier ones are not gaps.
  let trimmed = $derived(chart?.linky ? leadingMissing(chart.buckets.map((b) => b.kwh)) : 0);
  let bars = $derived((chart?.buckets ?? []).slice(chart?.linky ? trimmed : 0));
  let groups = $derived(
    bars.map((b) => ({
      label: bucketLabel(b.key, group),
      parts: !chart?.linky
        ? [{ key: 'rad', value: b.radiators?.kwh ?? null }]
        : split
          ? [{ key: 'hc', value: b.hc_kwh }, { key: 'hp', value: b.hp_kwh }]
          : [{ key: 'home', value: b.kwh }]
    }))
  );
  let overlay = $derived(
    chart?.linky ? { label: COPY.radiators, values: bars.map((b) => b.radiators?.kwh ?? null), color: SERIES.radiators } : null
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
            today: parisTodayIso()
          })
        )
      : []
  );

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
      announcer.say(COPY.curveShown(fmtDateLong(b.key)));
      document.getElementById('courbe')?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }
  function drillLabel(i: number): string | null {
    const b = bars[i];
    if (!b || !loaded) return null;
    if (group === 'month') return COPY.drillMonth(monthName(`${b.key}-01`).toLowerCase());
    if (loaded.view === 'day') return b.key === loaded.period.from ? null : COPY.drillDay;
    return COPY.drillCurve(fmtDay(b.key));
  }

  // v1 Par pièce (replaced in Task 9). A room none of whose radiators Kelvin recorded has no figure.
  let rooms = $derived.by(() => {
    const byId = new Map((main?.radiators ?? []).map((r) => [r.radiator_id, r.kwh]));
    const list: { id: string; name: string; kwh: number | null }[] = house.rooms.map((room) => {
      const known = room.radiator_ids.filter((id) => byId.has(id));
      return { id: room.id, name: room.name, kwh: known.length ? known.reduce((a, id) => a + byId.get(id)!, 0) : null };
    });
    const inRoom = new Set(house.rooms.flatMap((r) => r.radiator_ids));
    const loose = [...byId].filter(([id]) => !inRoom.has(id));
    if (loose.length) list.push({ id: NO_ROOM, name: 'Sans pièce', kwh: loose.reduce((a, [, v]) => a + v, 0) });
    const sum = list.reduce((a, r) => a + (r.kwh ?? 0), 0);
    return list.map((r) => ({
      ...r,
      share: sum && r.kwh != null ? r.kwh / sum : 0,
      figure: r.kwh != null ? `${fmtKwh(r.kwh)} · ${Math.round((sum ? r.kwh / sum : 0) * 100)}\u00a0%` : '—'
    }));
  });

  /** The Linky line under the title, by state: progress is neutral and needs no link; only auth
   * and error are problems, with the way to fix them. */
  let linkyNote = $derived.by((): { text: string; link: string | null; bad: boolean } | null => {
    if (linkyFailed) return { text: COPY.statusFailed, link: COPY.settings, bad: true };
    if (!linky || linky.state === 'off' || linky.state === 'ok') return null;
    switch (linky.state) {
      case 'never':
        return { text: COPY.never, link: null, bad: false };
      case 'quota':
        return { text: COPY.quota, link: null, bad: false };
      case 'throttled':
        return { text: linky.retry_at ? COPY.throttledAt(fmtTime(linky.retry_at * 1000)) : COPY.throttled, link: null, bad: false };
      case 'auth':
        return { text: COPY.auth, link: COPY.renew, bad: true };
      default:
        return { text: linky.message ?? COPY.syncFailed, link: COPY.settings, bad: true };
    }
  });
</script>

<svelte:head><title>{COPY.page}</title></svelte:head>

<header class="top">
  <h1>{COPY.title}</h1>
  <Segmented options={VIEWS} value={data.view} label={COPY.views} onchange={(v) => navigate(() => data.setView(v))} />
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
  <p class="callout">{COPY.connect} <a href="/maison#linky">{COPY.settings}</a></p>
{:else if linkyNote}
  <p class="callout" class:bad={linkyNote.bad} role="status">{linkyNote.text}{#if linkyNote.link}&nbsp;<a href="/maison#linky">{linkyNote.link}</a>{/if}</p>
{/if}
{#if ready && main?.last_day}<p class="muted fresh">{COPY.fresh(fmtDay(main.last_day))}</p>{/if}
{#if data.error}<p class="error" role="alert">{data.failed ? COPY.failedPeriod(periodTitle(data.failed.view, data.failed.period), data.error) : data.error} <button type="button" class="btn btn-sm" onclick={() => data.retry()}>{COPY.retry}</button></p>{/if}

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
      <h2>{COPY.houseTitle}</h2>
      <EnergyBars
        {groups}
        {colors}
        {names}
        {overlay}
        {details}
        unit="kWh"
        label={COPY.houseChart(unitWord)}
        bind:selected={selectedBar}
        ondrill={drill}
        {drillLabel}
        onswipe={step} />
      <ul class="legend">
        {#if split}
          <li><span class="swatch" style:background={SERIES.hc}></span>{COPY.hc}</li>
          <li><span class="swatch" style:background={SERIES.hp}></span>{COPY.hp}</li>
        {:else}
          <li><span class="swatch" style:background={SERIES.home}></span>{COPY.home}</li>
        {/if}
        <li><span class="line" style:background={SERIES.radiators}></span>{COPY.radiators}</li>
      </ul>
      {#if trimmed > 0 && chart.linky_since}<p class="muted small">{COPY.linkySince(fmtDateLong(chart.linky_since))}</p>{/if}
    {:else}
      <h2>{COPY.radTitle}</h2>
      <EnergyBars
        {groups}
        colors={{ rad: SERIES.radiators }}
        names={{ rad: COPY.radiators }}
        {details}
        unit="kWh"
        label={COPY.radChart(unitWord)}
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
      error={data.dayError}
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

  {#if main.heating_share != null}
    <section class="panel half">
      <h2>Chauffage</h2>
      <p class="share-line"><strong class="num share">{fmtPct(main.heating_share)}</strong> de la consommation de la maison {main.heating_share_since ? `depuis le ${fmtDay(main.heating_share_since)}` : 'sur la période'} vient des radiateurs.</p>
      <div class="meter" aria-hidden="true"><span style:transform="scaleX({Math.min(1, main.heating_share)})" style:background={SERIES.radiators}></span></div>
    </section>
  {/if}

  {#if main.projection}
    {@const pr = main.projection}
    <section class="panel half">
      <h2>Projection</h2>
      <dl class="proj">
        <dt>{monthName(`${pr.month.key}-01`)}, mois complet</dt>
        <dd class="num">≈&nbsp;{pr.month.eur != null ? fmtEur(pr.month.eur) : fmtKwh(pr.month.kwh)}</dd>
        <dt>12 prochains mois</dt>
        <dd class="num">≈&nbsp;{pr.year.eur != null ? fmtEur(pr.year.eur) : fmtKwh(pr.year.kwh)}</dd>
      </dl>
    </section>
  {/if}

  <section class="panel half" aria-busy={!house.loaded}>
    <h2>Par pièce</h2>
    {#if !house.loaded}
      <div class="skeleton inset rooms-sk" aria-hidden="true"></div>
    {:else}
      <ul class="rooms">
        {#each rooms as r (r.id)}
          <li>
            <span class="name">{r.name}</span>
            <span class="strip">{#if r.id !== NO_ROOM}<RoomTodayStrip roomId={r.id} height={22} />{/if}</span>
            <span class="num muted">{r.figure}</span>
            <span class="meter thin" aria-hidden="true"><span style:transform="scaleX({r.share})" style:background={SERIES.radiators}></span></span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="panel wide" aria-busy={!house.loaded}>
    <h2>{COPY.counters}</h2>
    {#if !house.loaded}
      <div class="skeleton inset counters-sk" aria-hidden="true"></div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{COPY.radiator}</th><th class="room">{COPY.room}</th><th class="r">{COPY.lifetime}</th>
              <th class="r opt">{COPY.register1}</th><th class="r opt">{COPY.register2}</th>
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
  .share-line {
    font-size: 13px;
    margin: 0;
  }
  .share {
    font-size: 20px;
    font-weight: 600;
  }
  .meter {
    height: 6px;
    margin-top: 10px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  .meter span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    transition: transform var(--t-data) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .meter span {
      transition: none;
    }
  }
  .meter.thin {
    display: block;
    height: 4px;
    margin-top: 0;
    border-radius: 2px;
  }
  .proj {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 14px;
    margin: 0;
    font-size: 13px;
  }
  .proj dt {
    color: var(--mu);
  }
  .proj dd {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    text-align: right;
  }
  .rooms-sk {
    height: 120px;
  }
  .counters-sk {
    height: 160px;
  }
  .rooms {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
    font-size: 13px;
    grid-template-columns: fit-content(14rem) minmax(0, 1fr) auto;
    column-gap: 12px;
  }
  .rooms li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    row-gap: 6px;
  }
  .rooms .meter {
    grid-column: 1 / -1;
  }
  .rooms .num {
    justify-self: end;
    text-align: right;
    white-space: nowrap;
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
    .rooms {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .rooms .strip {
      display: none;
    }
  }
</style>
