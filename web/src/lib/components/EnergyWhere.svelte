<!-- « Où part l'énergie » (direction-2 §2, critique 2 §6): the heating share of the home (share, meter, cost) then the
     rooms ranked by kWh, each a row with its share bar, kWh (a Fig: HC/HP, €, how it was measured), € and %; the row
     opens (a disclosure, findable while closed) on HC/HP, °C, setpoint, heating hours and the room's radiators with
     their lifetime counters (a Fig on the radiator's internal meters). « Sans pièce » last. A partial row carries a
     footnote mark (¹ ²) whose sentence is written once under the list. Jour and Semaine: Température et chauffe sits
     under the rooms (`children`), and opening a room selects it there. Figures are `roomEnergy`'s, unchanged. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ByRadiator, Heating, RadiatorSum } from '$lib/api/types';
  import { SERIES, spanLabel, type Span } from '$lib/energy';
  import { fmtDateLong, fmtEurExact, fmtHours, fmtKwh, fmtKwhExact, fmtPct, fmtPct1, fmtTemp } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ENERGY_ANCHORS } from '$lib/paths';
  import { provenance } from '$lib/provenance';
  import { NO_ROOM, roomEnergy, type Figures, type RoomRow } from '$lib/roomEnergy';
  import { house } from '$lib/stores/house.svelte';
  import Fig from './Fig.svelte';
  import type { FicheRow } from './FicheBody.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    heating: Heating;
    /** The period's radiator figures (kWh, €), for the cost line. */
    radiators: RadiatorSum | null;
    restKwh: number | null;
    /** The period runs into today: its radiator figures stop at yesterday. */
    running?: boolean;
    /** Linky is connected: the heating share means something (without it the rooms alone). */
    linky?: boolean;
    rows: ByRadiator[];
    /** The days the room figures cover: the period's elapsed days (up to yesterday, as `by_radiator` counts them). */
    span: Span;
    tariff: boolean;
    /** False under Base: no off-peak split (the € stays). */
    split?: boolean;
    /** A room was opened (Jour, Semaine: Température et chauffe follows it). */
    onroom?: (id: string) => void;
    /** Température et chauffe, under the rooms. */
    children?: Snippet;
    class?: string;
  }
  let {
    heating, radiators, restKwh, running = false, linky = true, rows, span, tariff, split = true, onroom, children, class: cls = ''
  }: Props = $props();
  const uid = $props.id();

  // L7: never clamped; above 102 % it is a data error and reads « — ».
  let value = $derived(heating.inconsistent ? null : heating.value);
  let subtitle = $derived(spanLabel(span) || m.roomsEnergy.day(fmtDateLong(span.from)));

  // Ranked by kWh (an unknown sum last), « Sans pièce » always at the end.
  let list = $derived.by(() => {
    const all = roomEnergy(rows, house.rooms, house.radiators, span);
    const rank = (r: RoomRow) => (r.kwh == null ? -1 : r.kwh);
    const rooms = all.filter((r) => r.id !== NO_ROOM).sort((a, b) => rank(b) - rank(a));
    return [...rooms, ...all.filter((r) => r.id === NO_ROOM)];
  });
  const SUP = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  // One mark per distinct partial sentence, in row order: the sentence is written once under the list.
  let marks = $derived.by(() => {
    const out = new Map<string, string>();
    for (const r of list) if (r.partial && !out.has(r.partial)) out.set(r.partial, SUP[out.size] ?? `(${out.size + 1})`);
    return out;
  });
  let anyEst = $derived(list.some((r) => r.est || r.radiators.some((x) => x.est)));
  let heatingMark = $derived(radiators?.coverage != null && radiators.coverage < 1 ? (SUP[marks.size] ?? '*') : null);

  let open = $state<Record<string, boolean>>({});
  function toggle(id: string) {
    open[id] = !open[id];
    if (open[id] && id !== NO_ROOM) onroom?.(id);
  }

  /** A room's or radiator's kWh Fiche: the exact parts and how they were measured. */
  function ficheRows(f: Figures): FicheRow[] {
    const out: FicheRow[] = [{ label: m.energyUi.whereKwh, value: fmtKwhExact(f.shown.kwh), est: f.est }];
    if (tariff && split) {
      out.push({ label: m.roomsEnergy.hcShort, value: fmtKwhExact(f.shown.hc), sub: true }, { label: m.roomsEnergy.hpShort, value: fmtKwhExact(f.shown.hp), sub: true });
    }
    if (tariff) out.push({ label: m.roomsEnergy.eurShort, value: fmtEurExact(f.eur), est: f.est });
    return out;
  }
  const prov = (f: Figures, name: string | null = null) =>
    provenance('radiator-meter', { name, nature: f.est ? 'estimated' : 'measured', method: f.est ? m.energyUi.apportioned : null });
  function lifetime(id: string) {
    return house.radiators[id]?.energy_wh ?? null;
  }
</script>

{#snippet facts(f: Figures)}
  <dl class="facts">
    {#if tariff && split}
      <div><dt>{m.roomsEnergy.hcShort}</dt><dd class="num">{fmtKwhExact(f.shown.hc)}</dd></div>
      <div><dt>{m.roomsEnergy.hpShort}</dt><dd class="num">{fmtKwhExact(f.shown.hp)}</dd></div>
    {/if}
    <div><dt>{m.roomsEnergy.temp}</dt><dd class="num">{fmtTemp(f.temp)}</dd></div>
    <div><dt>{m.roomsEnergy.setpointShort}</dt><dd class="num">{fmtTemp(f.setpoint)}</dd></div>
    <div><dt>{m.roomsEnergy.hoursShort}</dt><dd class="num">{fmtHours(f.hours)}</dd></div>
  </dl>
  {#if f.statsWhy}<p class="why">{m.roomsEnergy.statsWhy(f.statsWhy)}</p>{/if}
{/snippet}

<section class="panel where {cls}" id={ENERGY_ANCHORS.where} aria-labelledby="{uid}-title" aria-busy={!house.loaded}>
  <div class="head">
    <h2 id="{uid}-title">{m.energyUi.where}</h2>
    <p class="meta num">{subtitle}</p>
  </div>

  {#if linky}
    <div class="heating">
      <!-- {' '}: Svelte trims a block's leading space. -->
      <p class="share-line">
        <strong class="num share">{fmtPct(value)}</strong>{#if value != null}{' '}{m.heatingPanel.sentence}{heating.days < heating.of_days
            ? m.heatingPanel.days(heating.days, heating.of_days)
            : ''}.{/if}
      </p>
      {#if heating.inconsistent}
        <p class="muted note">{m.heatingPanel.inconsistent}</p>
      {:else if value == null}
        <p class="muted note">{m.heatingPanel.none}</p>
      {:else}
        <div class="meter" aria-hidden="true"><span style:transform="scaleX({Math.min(1, value)})" style:background={SERIES.radiators}></span></div>
      {/if}
      <p class="muted cost num">
        {#if !radiators}{m.heatingPanel.noCost}
        {:else if radiators.eur == null}{m.heatingPanel.noTariff}
        {:else}{m.energyUi.heatingCost}{' '}<Fig
            value={m.projection.approx(fmtEurExact(radiators.eur))}
            label={m.energyUi.heatingCostName(fmtEurExact(radiators.eur))}
            title={m.heatingPanel.title}
            rows={[
              { label: m.inspector.radiators, value: fmtKwhExact(radiators.kwh), est: radiators.interpolated || radiators.apportioned },
              ...(restKwh != null ? [{ label: m.inspector.rest, value: fmtKwhExact(restKwh) }] : []),
              { label: m.roomsEnergy.eurShort, value: fmtEurExact(radiators.eur), est: radiators.interpolated || radiators.apportioned },
              ...(radiators.coverage != null ? [{ label: m.energyUi.coverage, value: fmtPct1(radiators.coverage) }] : [])
            ]}
            notes={[m.roomsEnergy.eurNote]}
            provenance={provenance('radiator-meter', { nature: radiators.interpolated || radiators.apportioned ? 'estimated' : 'measured', method: radiators.interpolated || radiators.apportioned ? m.energyUi.apportioned : null })} />{#if radiators.interpolated || radiators.apportioned}<span class="est">{m.heatingPanel.est}</span>{/if}{' · '}{m.energyUi.energyOnly}{#if heatingMark}{' · '}{m.energyUi.partialShort}<sup>{heatingMark}</sup>{/if}
        {/if}
      </p>
    </div>
  {/if}

  {#if !house.loaded}
    <div class="skeleton inset sk" aria-hidden="true"></div>
  {:else if !list.length}
    <p class="muted note">{m.roomsEnergy.empty}</p>
  {:else}
    <ul class="rooms" aria-label={m.roomsEnergy.title}>
      {#each list as r (r.id)}
        {@const mark = r.partial ? marks.get(r.partial) : null}
        {@const region = `${uid}-${r.id}`}
        <li class="room" class:open={open[r.id]}>
          <div class="row">
            <button type="button" class="name" aria-expanded={!!open[r.id]} aria-controls={region} data-room={r.id} onclick={() => toggle(r.id)}>
              <span class="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>
              <span class="n">{r.name}</span>{#if mark}<sup class="mark" aria-label={m.energyUi.partialMark(mark)}>{mark}</sup>{/if}
            </button>
            <span class="bar" role="img" aria-label={m.energyUi.shareBar(r.name, r.share)}><span style:transform="scaleX({r.fraction})" style:background={SERIES.radiators}></span></span>
            <span class="nums">
            <span class="kwh num">
              {#if r.shown.kwh != null}
                <Fig value={fmtKwhExact(r.shown.kwh)} label={m.energyUi.roomKwhName(r.name, fmtKwhExact(r.shown.kwh))} title={r.name} rows={ficheRows(r)}
                  notes={r.partial ? [m.energyUi.partialNote(r.partial)] : []} provenance={prov(r)} />{#if r.est}<span class="est">{m.roomsEnergy.est}</span>{/if}
              {:else}—{/if}
            </span>
            {#if tariff}<span class="eur num">{fmtEurExact(r.eur)}</span>{/if}
            </span>
            <span class="pct num">{r.share}</span>
          </div>
          <div id={region} class="detail" hidden={open[r.id] ? undefined : 'until-found'} onbeforematch={() => toggle(r.id)}>
            {#if !r.radiators.length}<p class="why">{m.roomsEnergy.noRadiator}</p>{/if}
            {@render facts(r)}
            {#if r.radiators.length}
              <ul class="rads">
                {#each r.radiators as x (x.id)}
                  {@const life = lifetime(x.id)}
                  {@const model = house.radiators[x.id]?.model}
                  <li>
                    <div class="rhead">
                      <span class="rname">{x.name}{#if model}<span class="model">{model}</span>{/if}</span>
                      <span class="num">
                        {#if x.shown.kwh != null}
                          <Fig value={fmtKwhExact(x.shown.kwh)} label={m.energyUi.roomKwhName(x.name, fmtKwhExact(x.shown.kwh))} title={x.name}
                            rows={ficheRows(x)} notes={x.partial ? [m.energyUi.partialNote(x.partial)] : []} provenance={prov(x, x.name)} />{#if x.est}<span class="est">{m.roomsEnergy.est}</span>{/if}
                        {:else}—{/if}
                      </span>
                    </div>
                    {#if x.partial}<p class="why">{x.partial}</p>{/if}
                    {#if x.statsWhy}<p class="why">{m.roomsEnergy.statsWhy(x.statsWhy)}</p>{/if}
                    {#if life}
                      <p class="life">
                        <Fig value={m.energyUi.lifetime(fmtKwh(life.total / 1000))} title={m.energyUi.lifetimeTitle(x.name)}
                          rows={[
                            { label: m.energyUi.lifetimeTotal, value: fmtKwh(life.total / 1000) },
                            { label: m.energyUi.register1, value: fmtKwh(life.t1 != null ? life.t1 / 1000 : null), sub: true },
                            { label: m.energyUi.register2, value: fmtKwh(life.t2 != null ? life.t2 / 1000 : null), sub: true }
                          ]}
                          notes={[m.energyUi.registersNote]}
                          provenance={provenance('radiator-meter', { name: x.name })} />
                      </p>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
            <p class="why">{m.roomsEnergy.hoursNote}</p>
          </div>
        </li>
      {/each}
    </ul>
    {#if marks.size || heatingMark || anyEst || (radiators && running && linky)}
      <ul class="foot">
        {#each [...marks] as [text, mk] (mk)}<li><sup>{mk}</sup>{' '}{m.energyUi.partialNote(text)}</li>{/each}
        {#if heatingMark && radiators?.coverage != null}
          <li><sup>{heatingMark}</sup>{' '}{radiators.coverage > 0 ? m.heatingPanel.partial(fmtPct1(radiators.coverage), running) : m.heatingPanel.unmeasured(running)}</li>
        {:else if radiators && running && linky}
          <li>{m.heatingPanel.running}</li>
        {/if}
        {#if anyEst}<li>{m.roomsEnergy.estNote}</li>{/if}
      </ul>
    {/if}
    <p class="foot placement">{m.devices.byCurrentPlacement}</p>
  {/if}

  {#if children}<div class="day">{@render children()}</div>{/if}
</section>

<style>
  .where {
    container-type: inline-size;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .head h2 {
    margin-bottom: 8px;
  }
  .meta {
    margin: 0;
    font-size: 12px;
    color: var(--mu);
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
  .meter span,
  .bar span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    transition: transform var(--t-data) var(--ease-out);
  }
  .cost {
    font-size: 12px;
    margin: 8px 0 0;
  }
  .note {
    font-size: 12px;
    margin: 6px 0 0;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  .sk {
    height: 160px;
    margin-top: 14px;
  }
  .rooms {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    font-size: 13px;
  }
  .room {
    border-top: 1px solid var(--line);
  }
  .room:last-child {
    border-bottom: 1px solid var(--line);
  }
  /* Phone: name and % on the first line, the bar, then kWh · € (grid areas); a table-like row from 640 px. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'name pct' 'bar bar' 'nums nums';
    align-items: center;
    gap: 2px 12px;
    padding: 4px 0 10px;
  }
  .name {
    grid-area: name;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .n {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .mark {
    color: var(--mu);
    font-weight: 400;
  }
  .chev {
    display: grid;
    flex: none;
    color: var(--mu);
    transition: transform var(--t-state) var(--ease-out);
  }
  .open .chev {
    transform: rotate(90deg);
  }
  .bar {
    grid-area: bar;
    display: block;
    height: 4px;
    background: var(--in);
    border-radius: 2px;
    overflow: hidden;
  }
  .nums {
    grid-area: nums;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 14px;
  }
  .kwh {
    font-size: 12px;
  }
  .eur {
    font-size: 12px;
    color: var(--mu);
  }
  .pct {
    grid-area: pct;
    justify-self: end;
    font-weight: 600;
  }
  @container (min-width: 640px) {
    .row {
      grid-template-columns: minmax(8rem, 1.2fr) minmax(0, 2fr) 7.5rem 5.5rem 4rem;
      grid-template-areas: 'name bar kwh eur pct';
      padding: 0;
    }
    .nums {
      display: contents;
    }
    .kwh {
      grid-area: kwh;
    }
    .eur {
      grid-area: eur;
    }
    .kwh,
    .eur {
      justify-self: end;
      font-size: 13px;
    }
    .eur {
      color: var(--tx);
    }
  }
  .detail {
    padding: 0 0 12px 18px;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 2px 16px;
    margin: 0 0 6px;
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
  .why {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .rads {
    list-style: none;
    display: grid;
    gap: 10px;
    margin: 10px 0 0;
    padding: 0 0 0 12px;
    border-left: 1px solid var(--line);
    font-size: 12px;
  }
  .rhead {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .rname {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .model {
    margin-left: 6px;
    color: var(--mu);
  }
  .life {
    margin: 2px 0 0;
    color: var(--mu);
  }
  .foot {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    font-size: 12px;
    color: var(--mu);
  }
  .foot li + li {
    margin-top: 2px;
  }
  .placement {
    margin-top: 6px;
  }
  .day {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  /* Mois, Année: no Température et chauffe, no slot. */
  .day:not(:has(*)) {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .meter span,
    .bar span,
    .chev {
      transition: none;
    }
  }
</style>
