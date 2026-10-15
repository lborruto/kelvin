<script lang="ts">
  import Icon from './Icon.svelte';
  import type { ByRadiator } from '$lib/api/types';
  import { SERIES, spanLabel, type Span } from '$lib/energy';
  import { fmtDateLong, fmtEurExact, fmtHours, fmtKwhExact, fmtTemp } from '$lib/format';
  import { m } from '$lib/i18n';
  import { roomEnergy, type Figures } from '$lib/roomEnergy';
  import { house } from '$lib/stores/house.svelte';

  interface Props {
    rows: ByRadiator[];
    /** The days the figures cover: the selected period's elapsed days (up to yesterday, as `by_radiator` counts them). */
    span: Span;
    tariff: boolean;
    /** False under Base: no off-peak split, so no HC / HP columns (the € column stays). */
    split?: boolean;
    class?: string;
  }
  let { rows, span, tariff, split = true, class: cls = '' }: Props = $props();
  let list = $derived(roomEnergy(rows, house.rooms, house.radiators, span));
  let open = $state<Record<string, boolean>>({});
  let subtitle = $derived(spanLabel(span) || m.roomsEnergy.day(fmtDateLong(span.from)));
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
  <td class="r mono">{k(f.shown.kwh)}{#if f.est}<span class="est">{m.roomsEnergy.est}</span>{/if}</td>
  <td class="r mono">
    {share ?? ''}
    {#if fraction != null}<span class="bar" aria-hidden="true"><span style:transform="scaleX({fraction})" style:background={SERIES.radiators}></span></span>{/if}
  </td>
  {#if tariff}
    {#if split}
      <td class="r mono">{k(f.shown.hc)}</td>
      <td class="r mono">{k(f.shown.hp)}</td>
    {/if}
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
      {#if split}
        <div><dt>{m.roomsEnergy.hcShort}</dt><dd class="num">{fmtKwhExact(f.shown.hc)}</dd></div>
        <div><dt>{m.roomsEnergy.hpShort}</dt><dd class="num">{fmtKwhExact(f.shown.hp)}</dd></div>
      {/if}
      <div><dt>{m.roomsEnergy.eurShort}</dt><dd class="num">{fmtEurExact(f.eur)}</dd></div>
    {/if}
    <div><dt>{m.roomsEnergy.temp}</dt><dd class="num">{fmtTemp(f.temp)}</dd></div>
    <div><dt>{m.roomsEnergy.setpointShort}</dt><dd class="num">{fmtTemp(f.setpoint)}</dd></div>
    <div><dt>{m.roomsEnergy.hoursShort}</dt><dd class="num">{fmtHours(f.hours)}</dd></div>
  </dl>
{/snippet}

<section class="panel rooms {cls}" aria-busy={!house.loaded} bind:this={section} {onfocusin} {onfocusout}>
  <h2>{m.roomsEnergy.title}</h2>
  <p class="muted sub num">{subtitle}</p>
  {#if !house.loaded}
    <div class="skeleton inset sk" aria-hidden="true"></div>
  {:else if !list.length}
    <p class="muted note">{m.roomsEnergy.empty}</p>
  {:else}
    <div class="table">
      <table>
        <thead>
          <tr>
            <th scope="col">{m.roomsEnergy.room}</th>
            <th scope="col" class="r">{m.roomsEnergy.kwh}</th>
            <th scope="col" class="r">{m.roomsEnergy.share}</th>
            {#if tariff}
              {#if split}
                <th scope="col" class="r">{m.roomsEnergy.hc}</th>
                <th scope="col" class="r">{m.roomsEnergy.hp}</th>
              {/if}
              <th scope="col" class="r">{m.roomsEnergy.eur}</th>
            {/if}
            <th scope="col" class="r">{m.roomsEnergy.temp}</th>
            <th scope="col" class="r">{m.roomsEnergy.setpoint}</th>
            <th scope="col" class="r">{m.roomsEnergy.hours}</th>
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
                  {r.name}<span class="partial">{m.roomsEnergy.noRadiator}</span>
                {/if}
                {#if r.partial}<span class="partial">{m.roomsEnergy.partial} · {r.partial}</span>{/if}
                {#if r.statsWhy}<span class="partial">{m.roomsEnergy.statsWhy(r.statsWhy)}</span>{/if}
              </th>
              {@render cells(r, r.share, r.fraction)}
            </tr>
            {#if open[r.id]}
              {#each r.radiators as x (x.id)}
                <tr class="rad">
                  <th scope="row">
                    {x.name}{#if x.partial}<span class="partial">{x.partial}</span>{/if}
                    {#if x.statsWhy}<span class="partial">{m.roomsEnergy.statsWhy(x.statsWhy)}</span>{/if}
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
          <div class="head"><span class="name">{r.name}</span> <span class="num muted">{fmtKwhExact(r.shown.kwh)}{#if r.est}{' '}{m.roomsEnergy.est}{/if} · {r.share}</span></div>
          <span class="bar" aria-hidden="true"><span style:transform="scaleX({r.fraction})" style:background={SERIES.radiators}></span></span>
          {#if !r.radiators.length}<p class="partial">{m.roomsEnergy.noRadiator}</p>{/if}
          {#if r.partial}<p class="partial">{m.roomsEnergy.partial} · {r.partial}</p>{/if}
          {#if r.statsWhy}<p class="partial">{m.roomsEnergy.statsWhy(r.statsWhy)}</p>{/if}
          {@render facts(r)}
          {#if r.radiators.length}
            <button type="button" class="btn btn-ghost btn-sm more" data-room={r.id} aria-expanded={!!open[r.id]} onclick={() => toggle(r.id)}>
              <span class="chev" class:on={open[r.id]} aria-hidden="true"><Icon name="chevron" size={14} /></span>{m.roomsEnergy.radiators(r.radiators.length)}
            </button>
            {#if open[r.id]}
              <ul class="rads">
                {#each r.radiators as x (x.id)}
                  <li>
                    <div class="head"><span class="name">{x.name}</span> <span class="num muted">{fmtKwhExact(x.shown.kwh)}{#if x.est}{' '}{m.roomsEnergy.est}{/if}</span></div>
                    {#if x.partial}<p class="partial">{x.partial}</p>{/if}
                    {#if x.statsWhy}<p class="partial">{m.roomsEnergy.statsWhy(x.statsWhy)}</p>{/if}
                    {@render facts(x)}
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    <p class="muted note">{m.roomsEnergy.hoursNote}{#if tariff}{' '}{m.roomsEnergy.eurNote}{/if}{#if anyEst}{' '}{m.roomsEnergy.estNote}{/if}</p>
    <p class="foot">{m.devices.byCurrentPlacement}</p>
  {/if}
</section>

<style>
  .foot {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
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
