<script lang="ts">
  import { api } from '$lib/api/client';
  import { fmtEurExact, fmtHours, fmtKwhExact, fmtPct } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ANCHORS, ROUTES } from '$lib/paths';
  import { roomEnergy } from '$lib/stores/roomdata.svelte';

  interface Props {
    roomId: string;
    /** The chart's range as whole local days (1, 7, 30), today included: the API's `days`. */
    days: number;
    /** The parent's clock: the figures are asked again at most once per half-hour. */
    now: number;
    rangeLabel: string;
  }
  let { roomId, days, now, rangeLabel }: Props = $props();
  // Half-hour figures cannot change faster than their half-hours: one key per half-hour of now.
  let key = $derived(`${roomId}|${days}|${Math.floor(now / 1_800_000)}`);
  $effect(() => {
    const [id, d] = [roomId, days];
    roomEnergy.load(key, () => api.roomEnergy(id, d));
  });
  let entry = $derived(roomEnergy.data[key]);
  let v = $derived(entry?.value ?? null);
  let est = $derived(!!v && (v.interpolated || v.apportioned));
</script>

<div class="energy" aria-busy={!entry}>
  <h4>{m.roomFigures.title(rangeLabel)}</h4>
  {#if !entry}
    <div class="skeleton inset" style:height="52px" aria-hidden="true"></div>
  {:else}
    <dl class="tiles">
      <div>
        <dt>{m.roomFigures.kwh}</dt>
        <dd class="num">{fmtKwhExact(v?.kwh)}{#if est && v?.kwh != null}<span class="est" title={m.roomFigures.estHint}>{m.roomFigures.est}</span>{/if}</dd>
      </div>
      <div>
        <dt>{m.roomFigures.eur}</dt>
        <dd class="num">
          {#if v && !v.priced}<a href="{ROUTES.home}#{ANCHORS.tariff}">{m.roomFigures.noTariff}</a>{:else}<span
              title={m.roomFigures.eurHint}>{fmtEurExact(v?.eur)}</span>{#if est && v?.eur != null}<span class="est"
                title={m.roomFigures.estHint}>{m.roomFigures.est}</span>{/if}{/if}
        </dd>
      </div>
      <div>
        <dt>{m.roomFigures.hours}</dt>
        <dd class="num" title={m.roomFigures.hoursHint}>{fmtHours(v?.heating_hours)}</dd>
      </div>
    </dl>
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
  h4 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--mu);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
    gap: 8px;
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
