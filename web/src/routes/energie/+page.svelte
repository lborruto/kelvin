<script lang="ts">
  import { api, ApiError } from '$lib/api/client';
  import type { CurveDay, EnergyReport, LinkyStatus } from '$lib/api/types';
  import CurveChart from '$lib/components/CurveChart.svelte';
  import EnergyBars from '$lib/components/EnergyBars.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import RoomTodayStrip from '$lib/components/RoomTodayStrip.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import { PERIODS, SERIES, bucketLabel, compareLabel, heroTitle, leadingMissing, periodWindow, spanLabel, type Period } from '$lib/energy';
  import { fmtChange, fmtDateLong, fmtDay, fmtEur, fmtKwh, fmtPct, fmtTime, monthName } from '$lib/format';
  import { plural } from '$lib/plural';
  import { house } from '$lib/stores/house.svelte';

  const UNIT_WORD: Record<Period, string> = { day: 'jour', month: 'mois', year: 'année' };
  const NO_ROOM = 'sans-piece';
  // ApiError carries the backend's French detail when it sent one; anything else gets the generic copy.
  const errorText = (e: unknown, generic: string) =>
    e instanceof ApiError && e.message && e.message !== 'Erreur inattendue.' ? e.message : generic;

  let period = $state<Period>('month');
  // The period the report belongs to, so labels never come from a period it was not fetched for.
  let data = $state<{ period: Period; report: EnergyReport } | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let seq = 0;
  let linky = $state<LinkyStatus | null>(null);
  let linkyFailed = $state(false);
  let curveDate = $state<string | null>(null);
  let curve = $state<CurveDay | null>(null);
  let curveError = $state<string | null>(null);
  // The days with a complete curve, kept from the last answer so stepping still works after a failure.
  let curveDays = $state<string[]>([]);
  let curveSeq = 0;
  // Bumped by « Réessayer » to fetch the same period again.
  let attempt = $state(0);
  let curveAttempt = $state(0);

  $effect(() => {
    api
      .linkyStatus()
      .then((s) => (linky = s))
      .catch(() => (linkyFailed = true));
  });

  $effect(() => {
    const p = period;
    void attempt;
    const w = periodWindow(p);
    const mine = ++seq;
    // The previous report stays on screen, dimmed (aria-busy), until the new one arrives.
    error = null;
    loading = true;
    api
      .energyReport(w.from, w.to, w.group)
      .then((r) => {
        if (mine !== seq) return;
        data = { period: p, report: r };
        loading = false;
        if (curveDate === null && r.linky && r.last_day) curveDate = r.last_day;
      })
      .catch((e) => {
        if (mine !== seq) return;
        error = errorText(e, 'Impossible de charger la consommation.');
        loading = false;
      });
  });

  $effect(() => {
    const d = curveDate;
    void curveAttempt;
    if (!d) return;
    const mine = ++curveSeq;
    // Clear the previous day at once: the heading must never sit over another day's bars.
    curve = null;
    curveError = null;
    api
      .linkyCurve(d)
      .then((c) => {
        if (mine !== curveSeq) return;
        curve = c;
        curveDays = c.available;
      })
      .catch((e) => {
        if (mine === curveSeq) curveError = errorText(e, 'Impossible de charger la courbe.');
      });
  });

  let report = $derived(data?.report ?? null);
  // The report renders with the Linky line as soon as both answers are in, so nothing above it
  // moves (no CLS). It never waits on the live stream: only the parts built from the rooms and
  // radiators (Par pièce, the counters) hold their own skeleton until the snapshot arrives.
  let ready = $derived(!!report && (!!linky || linkyFailed));
  let shown = $derived(data?.period ?? period);
  let cur = $derived(report?.hero.current ?? null);
  let prev = $derived(report?.hero.previous ?? null);
  // The hero compares euros when both sides have them, else Linky kWh, else (no Linky) radiator kWh.
  // A null `eur` means no Linky day in the span: never rebuild it from the subscription alone.
  let change = $derived.by(() => {
    if (!report || !cur || !prev) return null;
    if (report.tariff && cur.eur != null && prev.eur != null) return fmtChange(cur.eur, prev.eur);
    if (report.linky) return fmtChange(cur.kwh, prev.kwh);
    return fmtChange(cur.radiators_kwh, prev.radiators_kwh);
  });
  let noData = $derived(!!report?.linky && cur?.kwh == null);
  let span = $derived(cur ? spanLabel(cur) : '');
  // Built as one string: Svelte trims the leading space of a block, which glued "kWh·" together.
  // The date range is rendered apart so a phone can put it on its own line.
  let heroFigures = $derived.by(() => {
    if (!cur) return '';
    const parts =
      cur.kwh != null
        ? [fmtKwh(cur.kwh), ...(cur.hc_kwh != null && cur.hp_kwh != null ? [`HC ${fmtKwh(cur.hc_kwh)}`, `HP ${fmtKwh(cur.hp_kwh)}`] : [])]
        : [`Radiateurs ${fmtKwh(cur.radiators_kwh)}`];
    return parts.join(' · ');
  });

  let split = $derived(!!report?.tariff);
  let names = $derived<Record<string, string>>(split ? { hc: 'Heures creuses', hp: 'Heures pleines' } : { home: 'Maison' });
  let colors = $derived<Record<string, string>>(split ? { hc: SERIES.hc, hp: SERIES.hp } : { home: SERIES.home });
  // The house chart starts at the first bucket with Linky data: earlier ones are not gaps.
  let trimmed = $derived(report?.linky ? leadingMissing(report.buckets.map((b) => b.kwh)) : 0);
  let houseBuckets = $derived((report?.buckets ?? []).slice(trimmed));
  let groups = $derived(
    houseBuckets.map((b) => ({
      label: bucketLabel(b.key, report!.group),
      parts: split
        ? [{ key: 'hc', value: b.hc_kwh }, { key: 'hp', value: b.hp_kwh }]
        : [{ key: 'home', value: b.kwh }]
    }))
  );
  let radiatorGroups = $derived(
    (report?.buckets ?? []).map((b) => ({ label: bucketLabel(b.key, report!.group), parts: [{ key: 'rad', value: b.radiators_kwh }] }))
  );
  let overlay = $derived(
    report ? { label: 'Radiateurs', values: houseBuckets.map((b) => b.radiators_kwh), color: SERIES.radiators } : null
  );

  // A room none of whose radiators Kelvin recorded has no figure (« — »), never 0 kWh.
  let rooms = $derived.by(() => {
    const byId = new Map((report?.radiators ?? []).map((r) => [r.radiator_id, r.kwh]));
    const list: { id: string; name: string; kwh: number | null }[] = house.rooms.map((room) => {
      const known = room.radiator_ids.filter((id) => byId.has(id));
      return { id: room.id, name: room.name, kwh: known.length ? known.reduce((a, id) => a + byId.get(id)!, 0) : null };
    });
    const inRoom = new Set(house.rooms.flatMap((r) => r.radiator_ids));
    const loose = [...byId].filter(([id]) => !inRoom.has(id));
    if (loose.length) {
      list.push({ id: NO_ROOM, name: 'Sans pièce', kwh: loose.reduce((a, [, v]) => a + v, 0) });
    }
    const sum = list.reduce((a, r) => a + (r.kwh ?? 0), 0);
    return list.map((r) => ({
      ...r,
      share: sum && r.kwh != null ? r.kwh / sum : 0,
      figure: r.kwh != null ? `${fmtKwh(r.kwh)} · ${Math.round((sum ? r.kwh / sum : 0) * 100)}\u00a0%` : '—'
    }));
  });

  let dayIndex = $derived(curveDate ? curveDays.indexOf(curveDate) : -1);
  let canPrev = $derived(dayIndex > 0 || (dayIndex < 0 && curveDays.length > 0));
  let canNext = $derived(dayIndex >= 0 && dayIndex < curveDays.length - 1);
  function stepDay(d: -1 | 1) {
    if (d < 0 ? !canPrev : !canNext) return;
    const i = curveDays.indexOf(curveDate ?? '');
    const next = i < 0 ? (d < 0 ? curveDays.at(-1) : undefined) : curveDays[i + d];
    if (next) curveDate = next;
  }

  /** The Linky line under the title, by state: progress is neutral and needs no link (nothing to
   * fix in Réglages); only auth and error are problems, with the way to fix them. */
  let linkyNote = $derived.by((): { text: string; link: string | null; bad: boolean } | null => {
    if (linkyFailed) return { text: 'État du Linky indisponible.', link: 'Réglages', bad: true };
    if (!linky || linky.state === 'off' || linky.state === 'ok') return null;
    switch (linky.state) {
      case 'never':
        return { text: 'Linky relié : première synchronisation en attente.', link: null, bad: false };
      case 'quota':
        return { text: 'Historique en cours de récupération : la suite arrive demain.', link: null, bad: false };
      case 'throttled':
        return {
          text: linky.retry_at
            ? `Enedis limite les requêtes : nouvel essai à ${fmtTime(linky.retry_at * 1000)}.`
            : 'Enedis limite les requêtes : nouvel essai plus tard.',
          link: null,
          bad: false
        };
      case 'auth':
        return { text: 'MyElectricalData refuse le jeton Linky.', link: 'Renouveler le jeton', bad: true };
      default:
        return { text: linky.message ?? 'Synchronisation Linky en échec.', link: 'Réglages', bad: true };
    }
  });
</script>

<svelte:head><title>Énergie · Kelvin</title></svelte:head>

<header class="top">
  <h1>Énergie</h1>
  <Segmented options={PERIODS} value={period} label="Période" onchange={(v) => (period = v)} />
</header>

{#if !ready}{:else if linky?.state === 'off'}
  <p class="callout">Reliez le compteur Linky pour voir la consommation de toute la maison et son coût. <a href="/maison#linky">Réglages</a></p>
{:else if linkyNote}
  <p class="callout" class:bad={linkyNote.bad} role="status">{linkyNote.text}{#if linkyNote.link}&nbsp;<a href="/maison#linky">{linkyNote.link}</a>{/if}</p>
{/if}
{#if ready && report?.last_day}<p class="muted fresh">Linky&nbsp;: données jusqu’au {fmtDay(report.last_day)}</p>{/if}
{#if error}<p class="error" role="alert">{error} <button type="button" class="btn btn-sm" onclick={() => attempt++}>Réessayer</button></p>{/if}

{#if !ready}
  {#if !error}
    <!-- First load: panels in their final shape (hero, chart, two short panels). -->
    <div class="panels" aria-hidden="true">
      {#each [150, 262, 92, 92] as h, i (i)}<div class="skeleton panel-sk" class:wide={i < 2} style:height="{h}px"></div>{/each}
    </div>
  {/if}
{:else}
<!-- Dimmed while a new period loads, and while a failed one leaves the previous period shown. -->
<div class="panels" class:busy={loading || (!!error && data?.period !== period)} aria-busy={loading}>
{#if report && cur && prev}
  <section class="panel hero wide" aria-labelledby="hero-title">
    <h2 id="hero-title" class="hero-title">{heroTitle(shown, cur)}</h2>
    {#if report.tariff && cur.eur != null}
      <p class="big num">{fmtEur(cur.eur)}<span class="tag">estimation</span></p>
    {:else if report.linky}
      <p class="big num">{fmtKwh(cur.kwh)}</p>
    {:else}
      <p class="big num">{fmtKwh(cur.radiators_kwh)}</p>
    {/if}
    <p class="sub num"><span class="figs">{heroFigures}</span>{#if span}<span class="range"><span class="sep">{' · '}</span>{span}</span>{/if}</p>
    {#if change}<p class="muted delta"><span class="num">{change}</span> {compareLabel(shown, prev)}</p>{/if}
    {#if noData}<p class="muted small">Données manquantes pour cette période.</p>
    {:else if cur.missing_days}<p class="muted small">Données partielles&nbsp;: {plural(cur.missing_days, 'jour manquant', 'jours manquants')}.</p>{/if}
    {#if cur.estimated_split}<p class="muted small">Répartition heures creuses / pleines estimée pour les jours sans courbe.</p>{/if}
    {#if report.linky && !report.tariff}<p class="muted small"><a href="/maison#tarif">Renseignez le tarif</a> pour voir le coût.</p>{/if}
  </section>

  <section class="panel wide">
    {#if report.linky}
      <h2>Consommation de la maison</h2>
      <EnergyBars {groups} {colors} {names} {overlay} unit="kWh" label="Consommation de la maison par {UNIT_WORD[shown]}" />
      <ul class="legend">
        {#if split}
          <li><span class="swatch" style:background={SERIES.hc}></span>Heures creuses</li>
          <li><span class="swatch" style:background={SERIES.hp}></span>Heures pleines</li>
        {:else}
          <li><span class="swatch" style:background={SERIES.home}></span>Maison</li>
        {/if}
        <li><span class="line" style:background={SERIES.radiators}></span>Radiateurs</li>
      </ul>
      {#if trimmed > 0 && report.linky_since}<p class="muted small">Historique Linky depuis le {fmtDateLong(report.linky_since)}.</p>{/if}
    {:else}
      <h2>Consommation des radiateurs</h2>
      <EnergyBars
        groups={radiatorGroups}
        colors={{ rad: SERIES.radiators }}
        names={{ rad: 'Radiateurs' }}
        unit="kWh"
        label="Consommation des radiateurs par {UNIT_WORD[shown]}" />
    {/if}
  </section>

  {#if report.heating_share != null}
    <section class="panel">
      <h2>Chauffage</h2>
      <p class="share-line"><strong class="num share">{fmtPct(report.heating_share)}</strong> de la consommation de la maison {report.heating_share_since ? `depuis le ${fmtDay(report.heating_share_since)}` : 'sur la période'} vient des radiateurs.</p>
      <div class="meter" aria-hidden="true"><span style:transform="scaleX({Math.min(1, report.heating_share)})" style:background={SERIES.radiators}></span></div>
    </section>
  {/if}

  {#if report.projection}
    {@const pr = report.projection}
    <section class="panel">
      <h2>Projection</h2>
      <dl class="proj">
        <dt>{monthName(`${pr.month.key}-01`)}, mois complet</dt>
        <dd class="num">≈&nbsp;{pr.month.eur != null ? fmtEur(pr.month.eur) : fmtKwh(pr.month.kwh)}</dd>
        <dt>12 prochains mois</dt>
        <dd class="num">≈&nbsp;{pr.year.eur != null ? fmtEur(pr.year.eur) : fmtKwh(pr.year.kwh)}</dd>
      </dl>
      <p class="muted small">
        {pr.year.method === 'linear'
          ? 'D’après les 30 derniers jours (pas encore un an d’historique).'
          : 'D’après les 30 derniers jours, ajusté selon les mêmes mois de l’an dernier.'} Estimation.
      </p>
    </section>
  {/if}

  {#if report.linky && curveDate}
    <section class="panel wide">
      <div class="curve-head">
        <h2>Courbe du {fmtDateLong(curveDate)}</h2>
        <!-- aria-disabled at the ends: the focused button stays focused. -->
        <div class="nav">
          <button type="button" class="btn btn-icon edged" aria-label="Jour précédent" aria-disabled={!canPrev} onclick={() => stepDay(-1)}>
            <span class="flip"><Icon name="chevron" /></span>
          </button>
          <button type="button" class="btn btn-icon edged" aria-label="Jour suivant" aria-disabled={!canNext} onclick={() => stepDay(1)}>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
      <div class="curve-body">
        {#if curveError}
          <p class="error small" role="status">{curveError} <button type="button" class="btn btn-sm" onclick={() => curveAttempt++}>Réessayer</button></p>
        {:else if curve && curve.date === curveDate}
          <CurveChart points={curve.points} split={report.tariff} label="Consommation par demi-heure le {fmtDateLong(curve.date)}" />
          {#if curve.hc_kwh != null && curve.hp_kwh != null}
            <p class="muted small num">HC {fmtKwh(curve.hc_kwh)} · HP {fmtKwh(curve.hp_kwh)}</p>
          {/if}
        {:else}
          <div class="skeleton inset curve-sk" aria-hidden="true"></div>
        {/if}
      </div>
    </section>
  {/if}

  <section class="panel" aria-busy={!house.loaded}>
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
{/if}

<section class="panel" aria-busy={!house.loaded}>
  <h2>Compteurs des radiateurs</h2>
  {#if !house.loaded}
    <div class="skeleton inset counters-sk" aria-hidden="true"></div>
  {:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Radiateur</th><th class="room">Pièce</th><th class="r">Depuis l’installation (kWh)</th><th class="r opt">Tarif 1 (kWh)</th><th class="r opt">Tarif 2 (kWh)</th></tr>
      </thead>
      <tbody>
        {#each Object.values(house.radiators) as r (r.id)}
          {#if r.energy_wh}
            <tr>
              <td>{r.model ?? r.name}<span class="sub-room muted">{house.room(r.room_id)?.name ?? '—'}</span></td>
              <td class="room">{house.room(r.room_id)?.name ?? '—'}</td>
              <td class="r mono">{fmtKwh(r.energy_wh.total / 1000, false)}</td>
              <td class="r mono opt">{fmtKwh(r.energy_wh.t1 == null ? null : r.energy_wh.t1 / 1000, false)}</td>
              <td class="r mono opt">{fmtKwh(r.energy_wh.t2 == null ? null : r.energy_wh.t2 / 1000, false)}</td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
</section>
</div>
{/if}

<style>
  .top {
    max-width: 900px;
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
  h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .callout,
  .fresh {
    font-size: 13px;
    margin: 10px 0 0;
  }
  .callout.bad {
    color: var(--bad);
  }
  .callout a,
  .hero a {
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
  /* One column up to 1280 px, then two: the hero, the charts and the curve span both. */
  .panels {
    display: grid;
    gap: 14px;
    margin-top: 14px;
    max-width: 900px;
  }
  .panels > :global(*) {
    min-width: 0;
    transition: opacity var(--t-state) ease;
  }
  /* A new period is on its way: the old one stays, dimmed, instead of a blank « Chargement… ». */
  .panels.busy > :global(*) {
    opacity: 0.55;
  }
  @media (min-width: 1280px) {
    .top {
      max-width: 1180px;
    }
    .panels {
      max-width: 1180px;
      grid-template-columns: 1fr 1fr;
    }
    .panels > :global(.wide) {
      grid-column: 1 / -1;
    }
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
  }
  .panel-sk {
    border: 1px solid var(--line);
  }
  .curve-body {
    min-height: 184px;
  }
  .curve-sk {
    height: 140px;
    margin-bottom: 20px;
  }
  .hero-title {
    text-transform: none;
    letter-spacing: 0;
    font-size: 13px;
  }
  .big {
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .tag {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--mu);
  }
  .sub,
  .delta {
    font-size: 13px;
    margin: 6px 0 0;
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
  /* The fill is scaled, not sized: a compositor-only move, and none under reduced motion. */
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
  .rooms-sk {
    height: 120px;
  }
  .counters-sk {
    height: 160px;
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
  .curve-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .nav {
    display: flex;
    gap: 4px;
  }
  .edged {
    border-color: var(--line);
  }
  .flip {
    display: grid;
    transform: scaleX(-1);
  }
  .rooms {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
    font-size: 13px;
  }
  /* One set of columns for every room (subgrid): names fit up to 14rem, strips line up and fill. */
  .rooms {
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
  .rooms .name {
    text-wrap: balance;
    overflow-wrap: anywhere;
  }
  .rooms .meter {
    grid-column: 1 / -1;
  }
  .rooms .num {
    justify-self: end;
    min-width: 9.5rem;
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
    .rooms .num {
      min-width: 0;
    }
    .rooms .strip {
      display: none;
    }
    /* The range gets its own line, apart from the kWh figures. */
    .sub .range {
      display: block;
    }
    .sub .sep {
      display: none;
    }
  }
</style>
