<script lang="ts">
  import { api } from '$lib/api/client';
  import { addDays, spanLabel } from '$lib/energy';
  import { fmtEurExact, fmtHours, fmtKwhExact, fmtPct, fmtPct1, matchParts } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import { provenance } from '$lib/provenance';
  import { roomEnergy } from '$lib/stores/roomdata.svelte';
  import Fig from './Fig.svelte';
  import type { FicheRow } from './FicheBody.svelte';

  interface Props {
    roomId: string;
    /** The chart's range as whole local days (1, 7, 30), today included: the API's `days`. */
    days: number;
    /** The parent's clock: the figures are asked again at most once per half-hour. */
    now: number;
    rangeLabel: string;
    /** Today's share of time heating since midnight (`/rooms/duty?since=`), the window of the other figures:
     * absent on 7 j / 30 j, 'loading' until it answers. */
    duty?: number | null | 'loading';
  }
  let { roomId, days, now, rangeLabel, duty }: Props = $props();
  // Half-hour figures cannot change faster than their half-hours: one key per half-hour of now.
  let key = $derived(`${roomId}|${days}|${Math.floor(now / 1_800_000)}`);
  $effect(() => {
    const [id, d] = [roomId, days];
    roomEnergy.load(key, () => api.roomEnergy(id, d));
  });
  let entry = $derived(roomEnergy.data[key]);
  let v = $derived(entry?.value ?? null);
  let est = $derived(!!v && (v.interpolated || v.apportioned));
  // L1 (direction-2 §1): each figure opens its Fiche: exact value, parts, period, where it comes from.
  // days = 1 is today since midnight (the API's window), so it says « aujourd’hui », not « 24 h ».
  let today = $derived(days === 1);
  let title = $derived(today ? m.roomFigures.today : m.roomFigures.title(rangeLabel));
  // Heating hours are energy ÷ power: with no meter reading they are unknown, never a measured-looking 0.
  let hours = $derived(v?.kwh == null ? null : v.heating_hours);
  let period = $derived(v ? spanLabel({ from: v.from, to: addDays(v.to, 1) }) || null : null);
  let common = $derived.by((): FicheRow[] => {
    const out: FicheRow[] = [];
    if (period) out.push({ label: m.roomFigures.period, value: period });
    if (v?.coverage != null) out.push({ label: m.roomFigures.coverage, value: fmtPct1(v.coverage) });
    return out;
  });
  let kwhRows = $derived.by((): FicheRow[] => {
    if (!v) return [];
    const split = matchParts(v.kwh, [v.hc_kwh, v.hp_kwh], 2);
    const rows: FicheRow[] = [{ label: m.roomFigures.kwh, value: fmtKwhExact(v.kwh), est }];
    if (v.hc_kwh != null && v.hp_kwh != null) {
      rows.push({ label: m.roomFigures.hc, value: fmtKwhExact(split.parts[0]), sub: true });
      rows.push({ label: m.roomFigures.hp, value: fmtKwhExact(split.parts[1]), sub: true });
    }
    return [...rows, ...common];
  });
  let meters = $derived(
    provenance('radiator-meter', est ? { nature: 'estimated', method: m.roomFigures.estMethod } : {}, now)
  );
  // Every figure unknown (too few readings): one sentence with its reason instead of a row of « — ».
  let notEnough = $derived(!!v && v.kwh == null && v.eur == null && (duty === undefined || duty === null));
</script>

<div class="energy" aria-busy={!entry}>
  <h3>{title}</h3>
  {#if !entry || duty === 'loading'}
    <div class="skeleton inset" style:height="88px" aria-hidden="true"></div>
  {:else if notEnough}
    <p class="note">{today ? m.roomFigures.notEnoughToday : m.roomFigures.notEnough(rangeLabel)}</p>
  {:else}
    <dl class="tiles">
      <div>
        <dt>{m.roomFigures.kwh}</dt>
        <dd class="num">
          {#if v?.kwh != null}<Fig value={fmtKwhExact(v.kwh)} label={est ? `${fmtKwhExact(v.kwh)} ${m.roomFigures.est}` : undefined}
              {title} rows={kwhRows} provenance={meters} />{#if est}<span class="est">{m.roomFigures.est}</span>{/if}
          {:else}{fmtKwhExact(null)}{/if}
        </dd>
      </div>
      <div>
        <dt>{m.roomFigures.eur}</dt>
        <dd class="num">
          {#if v && !v.priced}<a href="{ROUTES.tariff}">{m.roomFigures.noTariff}</a>
          {:else if v?.eur != null}<Fig value={fmtEurExact(v.eur)} {title}
              rows={[{ label: m.roomFigures.eur, value: fmtEurExact(v.eur), est }, ...common]}
              notes={[m.roomFigures.eurHint]}
              provenance={provenance('tariff', { method: m.roomFigures.eurMethod }, now)} />{#if est}<span class="est">{m.roomFigures.est}</span>{/if}
          {:else}{fmtEurExact(null)}{/if}
        </dd>
      </div>
      <div>
        <dt>{m.roomFigures.hours}</dt>
        <dd class="num">
          {#if hours != null}<Fig value={fmtHours(hours)} {title}
              rows={[{ label: m.roomFigures.hours, value: fmtHours(hours) }, ...common]}
              provenance={provenance('kelvin-calc', { method: m.roomFigures.hoursMethod }, now)} /><small>{m.roomFigures.hoursNote}</small>
          {:else}{fmtHours(null)}{/if}
        </dd>
      </div>
      {#if duty !== undefined}
        <div>
          <dt>{m.roomFigures.duty}</dt>
          <dd class="num">
            {#if duty != null}<Fig value={fmtPct(duty)} {title}
                rows={[{ label: m.roomFigures.duty, value: fmtPct1(duty) }]}
                notes={[today ? m.roomFigures.dutyHintToday : m.roomFigures.dutyHint]}
                provenance={provenance('cozytouch', { nature: 'computed', method: m.roomFigures.dutyMethod }, now)} />
            {:else}{fmtPct(null)}{/if}
          </dd>
        </div>
      {/if}
    </dl>
    {#if v && v.kwh == null}<p class="note">{today ? m.roomFigures.noKwhToday : m.roomFigures.noKwh}</p>{/if}
    {#if v && v.kwh != null && v.coverage != null && v.coverage < 0.999}<p class="note">{m.roomFigures.partial(fmtPct(v.coverage))}</p>{/if}
    <!-- As Énergie's radiator block: the € are the priced days', and the days they leave out are said. -->
    {#if v && v.priced && v.missing_colour_days}<p class="note">{m.energyTariff.notCounted(v.missing_colour_days)}</p>{/if}
  {/if}
</div>

<style>
  .energy {
    display: grid;
    gap: 6px;
  }
  /* The room panel's section label. */
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 12px;
    margin: 0;
  }
  .tiles > div {
    min-width: 0;
  }
  dt {
    font-size: 12px;
    color: var(--mu);
  }
  dd {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  dd a {
    font-size: 13px;
    font-weight: 500;
    display: inline-flex;
    min-height: 44px;
    align-items: center;
  }
  dd small {
    margin-left: 6px;
    font-size: 12px;
    font-weight: 400;
    color: var(--mu);
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    font-weight: 400;
    color: var(--mu);
  }
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--mu);
  }
</style>
