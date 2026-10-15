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
    /** The 24 h share of time heating (`/rooms/duty`): absent on 7 j / 30 j, 'loading' until it answers. */
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
  // Every figure unknown (too few readings): one sentence with its reason instead of a row of « — ».
  let notEnough = $derived(!!v && v.kwh == null && v.eur == null && v.heating_hours == null && (duty === undefined || duty === null));
</script>

<div class="energy" aria-busy={!entry}>
  <h3>{m.roomFigures.title(rangeLabel)}</h3>
  {#if !entry || duty === 'loading'}
    <div class="skeleton inset" style:height="88px" aria-hidden="true"></div>
  {:else if notEnough}
    <p class="note">{m.roomFigures.notEnough(rangeLabel)}</p>
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
        <dd class="num" title={m.roomFigures.hoursHint}>{fmtHours(v?.heating_hours)}{#if v?.heating_hours != null}<small>{m.roomFigures.hoursNote}</small>{/if}</dd>
      </div>
      {#if duty !== undefined}
        <div>
          <dt>{m.roomFigures.duty}</dt>
          <dd class="num" title={m.roomFigures.dutyHint}>{fmtPct(duty)}</dd>
        </div>
      {/if}
    </dl>
    {#if v && v.kwh != null && v.coverage != null && v.coverage < 0.999}<p class="note">{m.roomFigures.partial(fmtPct(v.coverage))}</p>{/if}
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
