<script lang="ts">
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import type { Radiator } from '$lib/api/types';
  import { fmtPct } from '$lib/format';
  import { m, pendingError } from '$lib/i18n';
  import { snapIntensity, stepIntensity } from '$lib/light';
  import { Settle } from '$lib/settle.svelte';
  import { house } from '$lib/stores/house.svelte';
  import PendingEdge from './PendingEdge.svelte';

  interface Props {
    radiator: Radiator;
    /** Spec QW2: the change is sent 600 ms after the last move. */
    commitMs?: number;
  }
  let { radiator, commitMs = 600 }: Props = $props();
  const uid = $props.id();

  // The value under the thumb while the user moves it, before it is sent.
  let draft = $state<number | null>(null);
  let sentId = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent = $derived(sentId ? house.pending[sentId] : undefined);
  let busy = $derived(sent?.status === 'sending' || sent?.status === 'pending');
  let failed = $derived(sent?.status === 'failed' ? sent : undefined);
  let expected = $derived(house.expectedFor(radiator.id).light_intensity);
  let reported = $derived(radiator.light?.intensity ?? null);
  // Dashed until the radiator reports the value; solid for a moment when it does (never on a timer).
  const settle = new Settle<number>(() => (busy ? (expected ?? null) : null), () => reported);
  let value = $derived(draft ?? expected ?? reported ?? 1);
  let blocked = $derived(!house.online);

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(commit, commitMs);
  }
  async function commit() {
    const v = draft;
    if (v === null || blocked) return;
    if (v === reported && !busy) {
      draft = null;
      return;
    }
    const p = await run(() => api.radiatorLight(radiator.id, true, v));
    draft = null;
    if (p) sentId = p.id;
  }
  function oninput(e: Event) {
    if (blocked) {
      // Paused: the native thumb must not stay where a drag left it.
      (e.currentTarget as HTMLInputElement).value = String(value);
      return;
    }
    clearTimeout(timer); // a drag is still going: wait for the release
    draft = snapIntensity(Number((e.currentTarget as HTMLInputElement).value));
  }
  function onchange() {
    if (!blocked && draft !== null) schedule();
  }
  function onkeydown(e: KeyboardEvent) {
    const next = stepIntensity(value, e.key);
    if (next === null) return;
    e.preventDefault();
    if (blocked) return;
    draft = next;
    schedule();
  }
  $effect(() => () => clearTimeout(timer));
</script>

<div class="light" class:pending={busy}>
  <div class="head">
    <label for="{uid}-range" class="muted">{m.radiator.brightness}</label>
    <output for="{uid}-range" class="num value">{fmtPct(value / 100)}{#if busy || settle.confirmed}<PendingEdge
        pending={busy} confirmed={settle.confirmed} />{/if}</output>
  </div>
  <input id="{uid}-range" type="range" min="1" max="100" step="1" value={value}
    aria-label={m.radiator.brightnessLabel} aria-valuetext={fmtPct(value / 100)} aria-disabled={blocked}
    aria-busy={busy} {oninput} {onchange} {onkeydown} />
  {#if failed}<p class="error" role="alert">{pendingError(failed)}</p>{/if}
</div>

<style>
  .light {
    display: grid;
    gap: 4px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 13px;
  }
  .value {
    position: relative;
    font-weight: 600;
  }
  input[type='range'] {
    width: 100%;
    min-height: 44px;
    accent-color: var(--tx);
    margin: 0;
  }
  /* The thumb is dashed while the radiator has not reported the value (the shared signature). */
  .pending input[type='range']::-webkit-slider-thumb {
    outline: 1.5px dashed var(--mu);
    outline-offset: 2px;
  }
  .pending input[type='range']::-moz-range-thumb {
    outline: 1.5px dashed var(--mu);
    outline-offset: 2px;
  }
  input[aria-disabled='true'] {
    opacity: 0.5;
    pointer-events: none;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--bad);
  }
</style>
