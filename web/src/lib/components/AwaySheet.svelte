<!-- « Partir en absence » (direction-2 §3, DESIGN « AwaySheet »): one sheet, mounted once in the layout and
     opened where the user is (sidebar, phone Pièces header, Maison, /home#away). A bottom sheet on a phone,
     the centred dialog on desktop (ChoiceSheet). Three stable presets and a precise date, the temperature,
     and the consequence written out before anything is sent. While an absence runs, the same sheet shows it
     with « Prolonger… » and « Terminer maintenant ». The send goes through the house command path (the
     sidebar's PendingTag shows « Envoi… »); a toast confirms with « Annuler l’absence ». -->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { run, runHouse } from '$lib/actions';
  import { api } from '$lib/api/client';
  import type { Radiator } from '$lib/api/types';
  import { AWAY_TEMP, awayPresets, parisLocal, parisLocalMs, type AwayPreset } from '$lib/away';
  import { capsOf, isReadOnly } from '$lib/capabilities';
  import { fmtDateTime, fmtTemp, fmtTime } from '$lib/format';
  import { apiMessage, m } from '$lib/i18n';
  import { roomName } from '$lib/setup';
  import { awaySheet } from '$lib/stores/away.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import ChoiceSheet from './ChoiceSheet.svelte';
  import Icon from './Icon.svelte';
  import Stepper from './Stepper.svelte';

  interface Props {
    /** The clock (tests inject one): the presets are computed when the sheet opens. */
    clock?: () => number;
  }
  let { clock = Date.now }: Props = $props();
  const uid = $props.id();

  let presets = $state(untrack(() => awayPresets(clock())));
  let preset = $state<AwayPreset>('tomorrow');
  let picked = $state('');
  let temp = $state<number>(AWAY_TEMP.default);
  let extending = $state(false);
  let error = $state<(() => string) | null>(null);
  let sending = $state(false);
  let body = $state<HTMLDivElement>();

  let active = $derived(house.away);
  let form = $derived(!active || extending);

  // Every opening starts from now: the presets, the default, the field's minimum.
  $effect(() => {
    if (!awaySheet.open) return;
    untrack(() => {
      const now = clock();
      const p = awayPresets(now);
      presets = p;
      preset = p.preset;
      picked = parisLocal(p[p.preset]);
      temp = house.away?.temperature ?? AWAY_TEMP.default;
      extending = false;
      error = null;
    });
    // Initial focus: the selected preset (or, active, the first action).
    void tick().then(() => body?.querySelector<HTMLElement>('[aria-pressed="true"], .first')?.focus());
  });

  let until = $derived(preset === 'tomorrow' ? presets.tomorrow : preset === 'sunday' ? presets.sunday : parisLocalMs(picked));

  // An away sets a temperature: it reaches the radiators that take one (backend `_capable(…, boost)`).
  const takes = (r: Radiator) => capsOf(r).boost && !isReadOnly(r);
  let rooms = $derived(house.rooms.filter((r) => house.roomRadiators(r.id).some(takes)));
  let offline = $derived(rooms.filter((r) => house.roomRadiators(r.id).filter(takes).every((x) => x.reachable === false)));
  let consequence = $derived(until === null ? null : rooms.length ? m.away.consequence(rooms.length, fmtTemp(temp), fmtDateTime(until)) : m.away.noRoom);
  let offlineLine = $derived(offline.length && rooms.length ? m.away.offline(offline.map((r) => roomName(r)), offline.length) : null);
  let blocked = $derived(sending || !house.online || !rooms.length);

  function choose(p: AwayPreset) {
    preset = p;
    error = null;
    if (p === 'pick') void tick().then(() => body?.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.focus());
  }

  async function go() {
    if (blocked) return;
    if (until === null || until <= clock()) {
      error = () => apiMessage('end_in_past');
      return;
    }
    error = null;
    sending = true;
    const end = until;
    try {
      const p = await runHouse(() => api.houseAway(parisLocal(end), temp));
      if (!p) return; // the error is already a toast; the sheet stays open with the choice
      awaySheet.close();
      toasts.push(() => m.away.started(fmtDateTime(end)), 'info', undefined, { label: () => m.away.undo, run: undo });
    } finally {
      sending = false;
    }
  }

  function undo() {
    const o = house.away;
    if (o) void run(() => api.cancelOverride(o.id));
  }

  function endNow() {
    const o = house.away;
    if (!o || !house.online) return;
    awaySheet.close();
    void run(() => api.cancelOverride(o.id));
  }
</script>

<ChoiceSheet title={active && !extending ? m.away.activeTitle : m.away.title} open={awaySheet.open} trigger={awaySheet.trigger}
  onclose={() => awaySheet.close()}>
  <div class="away" bind:this={body}>
    {#if !form && active}
      <p class="state"><span class="glyph" aria-hidden="true"><Icon name="away" size={16} /></span><span
          >{m.away.active(fmtDateTime(active.ends_at * 1000), fmtTemp(active.temperature))}</span></p>
      <p class="lead">{active.restoring ? m.home.restoring : m.away.activeLead}</p>
      <div class="stack">
        <button type="button" class="btn btn-lg first" onclick={() => (extending = true)}>{m.away.extend}</button>
        <button type="button" class="btn btn-ghost btn-lg" aria-disabled={!house.online} onclick={endNow}>{m.away.endNow}</button>
      </div>
    {:else}
      <p class="lead">{m.away.lead}</p>
      <fieldset>
        <legend>{m.away.until} <span class="hint">{m.away.parisTime}</span></legend>
        <div class="chips">
          <button type="button" class="chip hit" aria-pressed={preset === 'tomorrow'} onclick={() => choose('tomorrow')}>{m.away.tomorrow(fmtTime(presets.tomorrow))}</button>
          <button type="button" class="chip hit" aria-pressed={preset === 'sunday'} onclick={() => choose('sunday')}>{m.away.sunday(fmtTime(presets.sunday))}</button>
          <button type="button" class="chip hit" aria-pressed={preset === 'pick'} onclick={() => choose('pick')}>{m.away.pick}</button>
        </div>
        {#if preset === 'pick'}
          <label class="field"><span>{m.away.pickField}</span><input class="when" type="datetime-local" min={presets.min} bind:value={picked}
              oninput={() => (error = null)} /></label>
        {/if}
      </fieldset>
      <div class="temp">
        <div class="caption"><span>{m.away.temperature}</span><span class="hint">{m.away.frost}</span></div>
        <Stepper label={m.away.tempLabel} value={temp} min={AWAY_TEMP.min} max={AWAY_TEMP.max} debounceMs={0} announce={false}
          onchange={(v) => (temp = v)} />
      </div>
      <div class="consequence" aria-live="polite">
        {#if consequence}<p>{consequence}</p>{/if}
        {#if offlineLine}<p class="muted">{offlineLine}</p>{/if}
      </div>
      {#if error}<p class="error" role="alert">{error()}</p>{/if}
      <div class="stack">
        <button type="button" class="btn btn-primary btn-lg" aria-disabled={blocked}
          aria-describedby={!house.online ? `${uid}-why` : undefined} onclick={go}>{extending ? m.away.extendGo : m.away.go}</button>
        {#if !house.online}<p class="muted why" id="{uid}-why">{m.away.waiting}</p>{/if}
        <button type="button" class="btn btn-ghost btn-lg" onclick={() => (extending ? (extending = false) : awaySheet.close())}>{m.common.cancel}</button>
      </div>
    {/if}
  </div>
</ChoiceSheet>

<style>
  .away {
    display: grid;
    gap: 14px;
  }
  p {
    margin: 0;
    font-size: 13px;
  }
  .lead,
  .muted,
  .hint {
    color: var(--mu);
  }
  .lead {
    margin-top: -6px;
  }
  .state {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }
  .glyph {
    display: inline-flex;
    padding-top: 1px;
    color: var(--cool);
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  legend,
  .caption {
    padding: 0;
    font-size: 12px;
    color: var(--mu);
  }
  legend {
    margin-bottom: 8px;
  }
  .hint {
    font-weight: 400;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: var(--ctl-h);
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: none;
    color: var(--mu);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      border-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  @media (hover: hover) {
    .chip:hover {
      color: var(--tx);
      border-color: var(--fa);
    }
  }
  .chip[aria-pressed='true'] {
    background: var(--s2);
    border-color: var(--mu);
    color: var(--tx);
  }
  .field {
    display: grid;
    justify-items: start;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  /* « 18/10/2026 18:00 » and its picker glyph, never stretched. */
  .when {
    width: min(100%, 14.5rem);
  }
  .temp {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  .caption {
    display: grid;
    gap: 2px;
  }
  .caption span:first-child {
    color: var(--tx);
    font-size: 13px;
    font-weight: 600;
  }
  .consequence {
    display: grid;
    gap: 4px;
  }
  .consequence p:first-child {
    color: var(--tx);
  }
  .error {
    color: var(--bad);
  }
  .stack {
    display: grid;
    gap: 8px;
  }
  .stack .btn {
    width: 100%;
    justify-content: center;
  }
  .why {
    font-size: 12px;
    text-align: center;
  }
</style>
