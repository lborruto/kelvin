<!-- « Partir en absence » (Tableau §4 « Absence », mockups 6, DESIGN « AwaySheet »): one sheet, mounted once in
     the layout and opened where the user is (sidebar « Partir… », Maison, phone, /home#away). A bottom sheet on a
     phone with « Partir » under the thumb and « Annuler », a 460 px dialog on desktop (Sheet, --pop). Three stable presets and a precise date, the temperature,
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
  import { desktop } from '$lib/media.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
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
    void tick().then(() => (body?.closest('dialog') ?? body)?.querySelector<HTMLElement>('[aria-pressed="true"], .first')?.focus());
  });

  let until = $derived(preset === 'tomorrow' ? presets.tomorrow : preset === 'sunday' ? presets.sunday : parisLocalMs(picked));

  // An away sets a temperature: it reaches the radiators that take one (backend `_capable(…, boost)`).
  const takes = (r: Radiator) => capsOf(r).boost && !isReadOnly(r);
  let rooms = $derived(house.rooms.filter((r) => house.roomRadiators(r.id).some(takes)));
  let offline = $derived(rooms.filter((r) => house.roomRadiators(r.id).filter(takes).every((x) => x.reachable === false)));
  let consequence = $derived(until === null ? null : rooms.length ? m.away.consequence(rooms.length, fmtTemp(temp), fmtDateTime(until)) : m.away.noRoom);
  let offlineLine = $derived(offline.length && rooms.length ? m.away.offline(offline.map((r) => roomName(r)), offline.length) : null);
  // Another house-wide command on its way (« Tout éteindre », « Tout remettre en programme »): one at a time.
  let houseBusy = $derived(house.houseCommand?.status === 'sending' || house.houseCommand?.status === 'pending');
  let why = $derived(!house.online ? m.away.waiting : houseBusy ? m.away.busy : null);
  let blocked = $derived(sending || !!why || !rooms.length);

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
    const toastsBefore = toasts.items.length;
    try {
      const p = await runHouse(() => api.houseAway(parisLocal(end), temp));
      if (!p) {
        // An error is already a toast; no toast means another house command was still on its way.
        if (toasts.items.length === toastsBefore) error = () => m.away.busy;
        return; // the sheet stays open with the choice
      }
      awaySheet.close();
      undoWanted = false;
      toasts.push(() => m.away.started(fmtDateTime(end)), 'info', undefined, { label: () => m.away.undo, run: undo });
    } finally {
      sending = false;
    }
  }

  // « Annuler l’absence » works at once: the override may not be known yet (it comes with the stream), so the
  // wish is kept and carried out as soon as it arrives (within a minute).
  let undoWanted = $state(false);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  function undo() {
    undoWanted = true;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (undoWanted = false), 60_000);
  }
  $effect(() => {
    const o = house.away;
    if (!undoWanted || !o) return;
    undoWanted = false;
    clearTimeout(undoTimer);
    void run(() => api.cancelOverride(o.id));
  });

  function endNow() {
    const o = house.away;
    if (!o || !house.online) return;
    awaySheet.close();
    void run(() => api.cancelOverride(o.id));
  }
</script>

<Sheet title={active && !extending ? m.away.activeTitle : m.away.title} open={awaySheet.open} trigger={awaySheet.trigger} width={460}
  onclose={() => awaySheet.close()}>
  <div class="away" bind:this={body}>
    {#if !form && active}
      <p class="state"><span class="glyph" aria-hidden="true"><Icon name="away" size={18} /></span><span
          >{m.away.active(fmtDateTime(active.ends_at * 1000), fmtTemp(active.temperature))}</span></p>
      <p class="lead">{active.restoring ? m.home.restoring : m.away.activeLead}</p>
    {:else}
      <p class="lead">{m.away.lead}</p>
      <fieldset>
        <legend>{m.away.until} {m.away.parisTime}</legend>
        <div class="chips">
          <button type="button" class="dchip hit" aria-pressed={preset === 'tomorrow'} onclick={() => choose('tomorrow')}>{m.away.tomorrow(fmtTime(presets.tomorrow))}</button>
          <button type="button" class="dchip hit" aria-pressed={preset === 'sunday'} onclick={() => choose('sunday')}>{m.away.sunday(fmtTime(presets.sunday))}</button>
          <button type="button" class="dchip hit" aria-pressed={preset === 'pick'} onclick={() => choose('pick')}>{m.away.pick}</button>
        </div>
        {#if preset === 'pick'}
          <label class="field"><span>{m.away.pickField}</span><input class="when" type="datetime-local" min={presets.min} bind:value={picked}
              oninput={() => (error = null)} /></label>
        {/if}
      </fieldset>
      <div class="temp">
        <p class="cap">{m.away.temperature}</p>
        <Stepper label={m.away.tempLabel} caption={m.away.during} block value={temp} min={AWAY_TEMP.min} max={AWAY_TEMP.max} debounceMs={0}
          announce={false} onchange={(v) => (temp = v)} />
        <p class="note">{m.away.frost}</p>
      </div>
      <div class="consequence" aria-live="polite">
        {#if consequence}<p>{consequence}</p>{/if}
        {#if offlineLine}<p class="off"><Icon name="plug-off" size={15} /><span>{offlineLine}</span></p>{/if}
      </div>
      {#if error}<p class="error" role="alert">{error()}</p>{/if}
    {/if}
  </div>
  {#snippet footer()}
    <div class="stack">
      {#if !form && active}
        <button type="button" class="btn btn-lg first" onclick={() => (extending = true)}>{m.away.extend}</button>
        <button type="button" class="btn btn-ghost btn-lg" aria-disabled={!house.online} onclick={endNow}>{m.away.endNow}</button>
      {:else}
        <button type="button" class="btn btn-primary btn-lg" aria-disabled={blocked}
          aria-describedby={why ? `${uid}-why` : undefined} onclick={go}><Icon name="away" size={18} />{extending ? m.away.extendGo : m.away.go}</button>
        {#if why}<p class="why" id="{uid}-why">{why}</p>{/if}
        {#if extending || !desktop.matches}
          <button type="button" class="btn btn-lg" onclick={() => (extending ? (extending = false) : awaySheet.close())}>{m.common.cancel}</button>
        {/if}
      {/if}
    </div>
  {/snippet}
</Sheet>

<style>
  .away {
    display: grid;
    gap: 16px;
    margin-top: -4px;
    padding-top: 4px;
  }
  p {
    margin: 0;
  }
  .lead {
    color: var(--mu);
    font-size: 13.5px;
  }
  .state {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
  }
  .glyph {
    display: inline-flex;
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
  .cap {
    padding: 0;
    font-size: 13px;
    color: var(--fa);
  }
  legend {
    margin-bottom: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* The day chips (spec « dchip »): 40 px, radius 12, s2; the chosen one is ink. */
  .dchip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-input);
    background: var(--s2);
    color: var(--tx);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      color var(--t-state) ease;
    --hit-y: -2px;
  }
  @media (hover: hover) {
    .dchip:not([aria-pressed='true']):hover {
      background: var(--s3);
    }
  }
  .dchip[aria-pressed='true'] {
    background: var(--tx);
    color: var(--bg);
  }
  .field {
    display: grid;
    justify-items: start;
    gap: 6px;
    font-size: 13px;
    color: var(--mu);
  }
  /* « 18/10/2026 18:00 » and its picker glyph, never stretched. */
  .when {
    width: min(100%, 14.5rem);
  }
  .temp {
    display: grid;
    gap: 8px;
  }
  .temp .note {
    margin-top: -2px;
  }
  .consequence {
    display: grid;
    gap: 8px;
    padding: 12px 16px;
    border-radius: var(--r-group);
    /* A group one step up from the sheet (--sheet and --s1 are nearly equal on a phone). */
    background: color-mix(in srgb, var(--s2) 70%, transparent);
    font-size: 14.5px;
  }
  .consequence:empty {
    display: none;
  }
  .off {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--mu);
    font-size: 13px;
  }
  .off :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .error {
    color: var(--bad);
    font-size: 13.5px;
  }
  .stack {
    display: grid;
    gap: 8px;
  }
  .stack .btn {
    width: 100%;
  }
  .why {
    font-size: var(--fs-note);
    color: var(--mu);
    text-align: center;
  }
</style>
