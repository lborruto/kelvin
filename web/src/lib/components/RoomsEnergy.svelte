<script lang="ts">
  import Icon from './Icon.svelte';
  import type { ByRadiator } from '$lib/api/types';
  import { SERIES, spanLabel, type Span } from '$lib/energy';
  import { fmtDateLong, fmtEurExact, fmtHours, fmtKwhExact, fmtTemp } from '$lib/format';
  import { roomEnergy, type Figures } from '$lib/roomEnergy';
  import { house } from '$lib/stores/house.svelte';

  const COPY = {
    title: 'Par pièce et par radiateur',
    day: (d: string) => `le ${d}`,
    room: 'Pièce',
    kwh: 'kWh',
    share: 'Part',
    hc: 'HC (kWh)',
    hp: 'HP (kWh)',
    eur: '€',
    temp: 'Moy. °C',
    setpoint: 'Consigne moy. (°C)',
    hours: 'Heures de chauffe (h)',
    hcShort: 'HC',
    hpShort: 'HP',
    eurShort: 'Coût (énergie)',
    setpointShort: 'Consigne moy.',
    hoursShort: 'Heures de chauffe',
    radiators: (n: number) => `Radiateurs (${n})`,
    partial: 'partiel',
    noRadiator: 'aucun radiateur enregistré',
    statsWhy: (why: string) => `°C, consigne et chauffe\u00a0: ${why}`,
    est: 'est.',
    hoursNote: 'Heures de chauffe : équivalent pleine puissance, par radiateur (moyenne des radiateurs pour une pièce).',
    eurNote: 'Coût : énergie seule, hors abonnement.',
    estNote: 'est. : énergie répartie entre deux relevés des radiateurs.',
    empty: 'Aucun radiateur enregistré sur la période.'
  } as const;

  interface Props {
    rows: ByRadiator[];
    /** The days the figures cover: the selected period's elapsed days (up to yesterday, as `by_radiator` counts them). */
    span: Span;
    tariff: boolean;
    class?: string;
  }
  let { rows, span, tariff, class: cls = '' }: Props = $props();
  let list = $derived(roomEnergy(rows, house.rooms, house.radiators, span));
  let open = $state<Record<string, boolean>>({});
  let subtitle = $derived(spanLabel(span) || COPY.day(fmtDateLong(span.from)));
  let anyEst = $derived(list.some((r) => r.est || r.radiators.some((x) => x.est)));
  const k = (v: number | null) => fmtKwhExact(v, false);
  const toggle = (id: string) => (open[id] = !open[id]);

  // The table and the list are both in the page, one hidden by the panel's width. When a resize
  // hides the room toggle that holds the focus, the focus moves to the same room's toggle in the
  // other layout instead of dropping to <body>.
  let section = $state<HTMLElement>();
  let held: HTMLElement | null = null;
  const shown = (el: Element) => (el as HTMLElement).offsetParent !== null;
  function onfocusin(e: FocusEvent) {
    const el = e.target as HTMLElement;
    held = el.dataset?.room != null ? el : null;
  }
  function onfocusout(e: FocusEvent) {
    const el = e.target as HTMLElement;
    // Focus moved on by the user: forget it. A toggle hidden by the resize keeps its claim.
    requestAnimationFrame(() => {
      if (held === el && shown(el) && document.activeElement !== el) held = null;
    });
    if (e.relatedTarget && held === el) held = null;
  }
  function restore() {
    if (!held || !section || shown(held)) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== held) {
      held = null; // the user has moved on
      return;
    }
    const twin = [...section.querySelectorAll<HTMLElement>(`[data-room="${CSS.escape(held.dataset.room!)}"]`)].find(shown);
    if (twin) twin.focus();
  }
  $effect(() => {
    if (!section || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => requestAnimationFrame(restore));
    ro.observe(section);
    return () => ro.disconnect();
  });
</script>

{#snippet cells(f: Figures, share: string | null, fraction: number | null)}
  <td class="r mono">{k(f.shown.kwh)}{#if f.est}<span class="est">{COPY.est}</span>{/if}</td>
  <td class="r mono">
    {share ?? ''}
    {#if fraction != null}<span class="bar" aria-hidden="true"><span style:transform="scaleX({fraction})" style:background={SERIES.radiators}></span></span>{/if}
  </td>
  {#if tariff}
    <td class="r mono">{k(f.shown.hc)}</td>
    <td class="r mono">{k(f.shown.hp)}</td>
    <td class="r mono">{fmtEurExact(f.eur, false)}</td>
  {/if}
  {@render stat(fmtTemp(f.temp, false), f)}
  {@render stat(fmtTemp(f.setpoint, false), f)}
  {@render stat(fmtHours(f.hours, false), f)}
{/snippet}

<!-- A « — » stat cell carries its reason for screen readers; the row header shows it. -->
{#snippet stat(value: string, f: Figures)}
  <td class="r mono">{value}{#if value === '—' && f.statsWhy}<span class="visually-hidden">{` (${f.statsWhy})`}</span>{/if}</td>
{/snippet}

{#snippet facts(f: Figures)}
  <dl class="facts">
    {#if tariff}
      <div><dt>{COPY.hcShort}</dt><dd class="num">{fmtKwhExact(f.shown.hc)}</dd></div>
      <div><dt>{COPY.hpShort}</dt><dd class="num">{fmtKwhExact(f.shown.hp)}</dd></div>
      <div><dt>{COPY.eurShort}</dt><dd class="num">{fmtEurExact(f.eur)}</dd></div>
    {/if}
    <div><dt>{COPY.temp}</dt><dd class="num">{fmtTemp(f.temp)}</dd></div>
    <div><dt>{COPY.setpointShort}</dt><dd class="num">{fmtTemp(f.setpoint)}</dd></div>
    <div><dt>{COPY.hoursShort}</dt><dd class="num">{fmtHours(f.hours)}</dd></div>
  </dl>
{/snippet}

<section class="panel rooms {cls}" aria-busy={!house.loaded} bind:this={section} {onfocusin} {onfocusout}>
  <h2>{COPY.title}</h2>
  <p class="muted sub num">{subtitle}</p>
  {#if !house.loaded}
    <div class="skeleton inset sk" aria-hidden="true"></div>
  {:else if !list.length}
    <p class="muted note">{COPY.empty}</p>
  {:else}
    <div class="table">
      <table>
        <thead>
          <tr>
            <th scope="col">{COPY.room}</th>
            <th scope="col" class="r">{COPY.kwh}</th>
            <th scope="col" class="r">{COPY.share}</th>
            {#if tariff}
              <th scope="col" class="r">{COPY.hc}</th>
              <th scope="col" class="r">{COPY.hp}</th>
              <th scope="col" class="r">{COPY.eur}</th>
            {/if}
            <th scope="col" class="r">{COPY.temp}</th>
            <th scope="col" class="r">{COPY.setpoint}</th>
            <th scope="col" class="r">{COPY.hours}</th>
          </tr>
        </thead>
        <tbody>
          {#each list as r (r.id)}
            <tr class="room">
              <th scope="row">
                {#if r.radiators.length}
                  <button type="button" class="disclose" data-room={r.id} aria-expanded={!!open[r.id]} onclick={() => toggle(r.id)}>
                    <span class="chev" class:on={open[r.id]} aria-hidden="true"><Icon name="chevron" size={14} /></span>{r.name}
                  </button>
                {:else}
                  {r.name}<span class="partial">{COPY.noRadiator}</span>
                {/if}
                {#if r.partial}<span class="partial">{COPY.partial} · {r.partial}</span>{/if}
                {#if r.statsWhy}<span class="partial">{COPY.statsWhy(r.statsWhy)}</span>{/if}
              </th>
              {@render cells(r, r.share, r.fraction)}
            </tr>
            {#if open[r.id]}
              {#each r.radiators as x (x.id)}
                <tr class="rad">
                  <th scope="row">
                    {x.name}{#if x.partial}<span class="partial">{x.partial}</span>{/if}
                    {#if x.statsWhy}<span class="partial">{COPY.statsWhy(x.statsWhy)}</span>{/if}
                  </th>
                  {@render cells(x, null, null)}
                </tr>
              {/each}
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    <ul class="list">
      {#each list as r (r.id)}
        <li>
          <div class="head"><span class="name">{r.name}</span> <span class="num muted">{fmtKwhExact(r.shown.kwh)}{#if r.est}{' '}{COPY.est}{/if} · {r.share}</span></div>
          <span class="bar" aria-hidden="true"><span style:transform="scaleX({r.fraction})" style:background={SERIES.radiators}></span></span>
          {#if !r.radiators.length}<p class="partial">{COPY.noRadiator}</p>{/if}
          {#if r.partial}<p class="partial">{COPY.partial} · {r.partial}</p>{/if}
          {#if r.statsWhy}<p class="partial">{COPY.statsWhy(r.statsWhy)}</p>{/if}
          {@render facts(r)}
          {#if r.radiators.length}
            <button type="button" class="btn btn-ghost btn-sm more" data-room={r.id} aria-expanded={!!open[r.id]} onclick={() => toggle(r.id)}>
              <span class="chev" class:on={open[r.id]} aria-hidden="true"><Icon name="chevron" size={14} /></span>{COPY.radiators(r.radiators.length)}
            </button>
            {#if open[r.id]}
              <ul class="rads">
                {#each r.radiators as x (x.id)}
                  <li>
                    <div class="head"><span class="name">{x.name}</span> <span class="num muted">{fmtKwhExact(x.shown.kwh)}{#if x.est}{' '}{COPY.est}{/if}</span></div>
                    {#if x.partial}<p class="partial">{x.partial}</p>{/if}
                    {#if x.statsWhy}<p class="partial">{COPY.statsWhy(x.statsWhy)}</p>{/if}
                    {@render facts(x)}
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    <p class="muted note">{COPY.hoursNote}{#if tariff}{' '}{COPY.eurNote}{/if}{#if anyEst}{' '}{COPY.estNote}{/if}</p>
  {/if}
</section>

<style>
  /* The panel answers to its own width: a table from 640 px (nine columns need it; a half-width panel
     on a wide screen is about 540 px), a list below. The query sits at the end so it wins over the base rules. */
  .rooms {
    container-type: inline-size;
  }
  .sub {
    font-size: 12px;
    margin: -4px 0 10px;
  }
  .sk {
    height: 160px;
  }
  .table {
    display: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    padding: 7px 4px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }
  thead th {
    color: var(--mu);
    font-weight: 500;
    vertical-align: bottom;
  }
  .r {
    text-align: right;
  }
  tbody th {
    font-weight: 500;
  }
  .rad th {
    padding-left: 22px;
    font-weight: 400;
  }
  .disclose {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    margin: -12px 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .chev {
    display: grid;
    flex: none;
    color: var(--mu);
    transition: transform var(--t-state) var(--ease-out);
  }
  .chev.on {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .partial {
    display: block;
    font-size: 12px;
    font-weight: 400;
    color: var(--mu);
  }
  .est {
    margin-left: 4px;
    font-family: var(--font);
    color: var(--mu);
  }
  .bar {
    display: block;
    height: 4px;
    margin-top: 4px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    transition: transform var(--t-data) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar span {
      transition: none;
    }
  }
  .list,
  .rads {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 14px;
    font-size: 13px;
  }
  .list > li + li {
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  .rads {
    margin-top: 8px;
    padding-left: 12px;
    border-left: 1px solid var(--line);
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .name {
    overflow-wrap: anywhere;
  }
  .head .num {
    white-space: nowrap;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 2px 12px;
    margin: 6px 0;
    font-size: 12px;
  }
  .facts div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .facts dt {
    color: var(--mu);
  }
  .facts dd {
    margin: 0;
  }
  .note {
    font-size: 12px;
    margin: 10px 0 0;
  }
  p.partial {
    margin: 4px 0 0;
  }
  .more {
    margin-top: 4px;
  }
  .more .chev {
    color: inherit;
  }
  @container (min-width: 640px) {
    .table {
      display: block;
    }
    .list {
      display: none;
    }
  }
</style>
