<!-- « Où part l’énergie » as a Tableau widget (spec §4 Énergie, row 2): the heating share, then the top rooms ranked
     by kWh with their share bar, kWh and €; « Tout voir › » goes to the full section (#energy-where), which keeps
     every room, its radiators, their lifetime counters and the footnotes. The figures are `roomEnergy`'s, the very
     rows the full section shows (same shares, same matched kWh), never recomputed here. Partial rows carry the
     same « partiel » mark, explained in the full section. -->
<script lang="ts">
  import type { ByRadiator, Heating } from '$lib/api/types';
  import { SERIES, type Span } from '$lib/energy';
  import { fmtEurExact, fmtKwhExact, fmtPct } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ENERGY_ANCHORS } from '$lib/paths';
  import { NO_ROOM, roomEnergy, type RoomRow } from '$lib/roomEnergy';
  import { goToSection } from '$lib/sections';
  import { house } from '$lib/stores/house.svelte';

  interface Props {
    heating: Heating;
    linky: boolean;
    rows: ByRadiator[];
    span: Span;
    tariff: boolean;
    /** How many rooms (the widget is a summary). */
    top?: number;
    /** The muted words right of the title (« octobre, jusqu’au 15 », « le 15 »). */
    aside?: string | null;
    /** « Tout voir › » opens the full section (collapsed until then); the link still lands on it. */
    onmore?: () => void;
    class?: string;
  }
  let { heating, linky, rows, span, tariff, top = 3, aside = null, onmore, class: cls = '' }: Props = $props();

  const uid = $props.id();

  let value = $derived(heating.inconsistent ? null : heating.value);
  let list = $derived.by(() => {
    const rank = (r: RoomRow) => (r.kwh == null ? -1 : r.kwh);
    return roomEnergy(rows, house.rooms, house.radiators, span)
      .filter((r) => r.id !== NO_ROOM)
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, top);
  });
</script>

<section class="panel w-where {cls}" aria-labelledby="{uid}-t" aria-busy={!house.loaded}>
  <div class="head">
    <h3 id="{uid}-t">{m.energyUi.where}</h3>
    <a class="more" href="#{ENERGY_ANCHORS.where}" onclick={(e) => goToSection(e, ENERGY_ANCHORS.where, onmore ? () => onmore() : null)}>{m.energyBoard.whereMore}</a>
  </div>
  {#if aside}<p class="aside num">{aside}</p>{/if}
  {#if linky}
    <p class="share"><strong class="num">{fmtPct(value)}</strong>{#if value != null}{' '}<span>{m.energyBoard.whereShare}</span>{/if}</p>
  {/if}
  {#if !house.loaded}
    <div class="skeleton inset sk" aria-hidden="true"></div>
  {:else if !list.length}
    <p class="note">{m.roomsEnergy.empty}</p>
  {:else}
    <ul class="rooms">
      {#each list as r (r.id)}
        <li>
          <div class="line">
            <span class="n">{r.name}{#if r.partial}<span class="mark">{' '}{m.energyUi.partialShort}</span>{/if}</span>
            <span class="num"><b>{fmtKwhExact(r.shown.kwh)}</b>{#if r.est}<span class="est">{m.roomsEnergy.est}</span>{/if}{#if tariff}<span class="eur">{' · '}{fmtEurExact(r.eur)}</span>{/if}</span>
          </div>
          <div class="barline" aria-hidden="true">
            <span class="bar"><span style:transform="scaleX({r.fraction})" style:background={SERIES.radiators}></span></span>
            <span class="pct num">{r.share}</span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
  }
  .more {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin: -12px 0;
    font-size: var(--fs-label);
    font-weight: 600;
    color: var(--mu);
    text-decoration: none;
  }
  .more::after {
    content: ' ›';
    white-space: pre;
  }
  @media (hover: hover) {
    .more:hover {
      color: var(--tx);
    }
  }
  .aside {
    margin: 2px 0 0;
    font-size: var(--fs-label);
    color: var(--mu);
  }
  .share {
    margin: 8px 0 4px;
    font-size: 13px;
    color: var(--mu);
  }
  .share strong {
    margin-right: 4px;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--tx);
  }
  .sk {
    height: 150px;
    margin-top: 8px;
  }
  .note {
    font-size: 13px;
    color: var(--mu);
  }
  .rooms {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .rooms li {
    padding: 9px 0;
  }
  .rooms li + li {
    border-top: 1px solid var(--line);
  }
  .line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 14px;
  }
  .n {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .mark,
  .est,
  .eur {
    color: var(--mu);
    font-size: 13px;
  }
  .est {
    margin-left: 4px;
  }
  b {
    font-weight: 600;
  }
  .barline {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
  }
  .bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: var(--in);
    overflow: hidden;
  }
  .bar span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    transition: transform var(--t-data) var(--ease-out);
  }
  .pct {
    width: 52px;
    text-align: right;
    font-size: 12.5px;
    color: var(--mu);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar span {
      transition: none;
    }
  }
</style>
