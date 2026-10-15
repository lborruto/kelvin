<script lang="ts">
  import type { Radiator } from '$lib/api/types';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { fmtKwh, fmtPct, fmtTemp } from '$lib/format';
  import { m, modeLabel } from '$lib/i18n';
  import { heatColor } from '$lib/heat';
  import { house } from '$lib/stores/house.svelte';
  import Icon from './Icon.svelte';
  import LightSlider from './LightSlider.svelte';
  import ModeSwitch from './ModeSwitch.svelte';
  import Stepper from './Stepper.svelte';
  import Toggle from './Toggle.svelte';

  interface Props {
    radiator: Radiator;
    showControls: boolean;
  }
  let { radiator, showControls }: Props = $props();
  let expected = $derived(house.expectedFor(radiator.id));
  let facts = $derived(m.radiator.facts(radiator.model ?? m.radiator.default, radiator.power_w));
  // The device default ("Radiateur", or the model) says nothing; the model and power do.
  let renamed = $derived(!!radiator.name.trim() && radiator.name !== 'Radiateur' && radiator.name !== radiator.model); // i18n-ignore: upstream device default
  let title = $derived(renamed ? radiator.name : facts);
  // The command each toggle sent last: dashed while the radiator has not answered it.
  let sent = $state<Record<string, string>>({});
  const busy = (key: string) => {
    const st = house.pending[sent[key]]?.status;
    return st === 'sending' || st === 'pending';
  };
  async function toggle(key: string, fn: Parameters<typeof run>[0]) {
    const p = await run(fn);
    if (p) sent[key] = p.id;
  }
  let renaming = $state(false);
  let draft = $state('');

  function startRename() {
    draft = radiator.name;
    renaming = true;
  }
  async function submitRename(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    renaming = false;
    if (name && name !== radiator.name) await run(() => api.radiatorFeatures(radiator.id, { name }));
  }
</script>

<section class="rad">
  <header>
    {#if renaming}
      <form onsubmit={submitRename}>
        <input aria-label={m.radiator.nameLabel} maxlength="32" bind:value={draft} />
        <button type="submit" class="btn btn-sm">OK</button>
      </form>
    {:else}
      <h4>{title}</h4>
      <button type="button" class="btn btn-icon" aria-label={m.radiator.rename} onclick={startRename}><Icon name="edit" size={16} /></button>
    {/if}
    <span class="temp num" style:color={heatColor(radiator.temperature)}>{fmtTemp(radiator.temperature)}</span>
  </header>
  {#if renamed}<p class="muted facts">{facts}</p>{/if}
  <dl class="grid">
    <dt>Mode</dt><dd>{modeLabel(radiator.mode)}</dd>
    <dt>{m.radiator.setpointActive}</dt><dd class="num">{fmtTemp(radiator.effective_setpoint)}</dd>
    {#if radiator.energy_wh}<dt>{m.radiator.energyTotal}</dt><dd class="num">{fmtKwh(radiator.energy_wh.total / 1000)}</dd>{/if}
    {#if radiator.rssi != null}<dt>Signal</dt><dd class="num">{fmtPct(radiator.rssi / 100)}</dd>{/if}
  </dl>

  {#if showControls}
    <div class="controls">
      <ModeSwitch label="Mode — {title}" value={radiator.mode} pending={expected.mode ?? null} compact
        disabled={!house.online} onchange={(next) => run(() => api.radiatorMode(radiator.id, next))} />
      {#if (expected.mode ?? radiator.mode) === 'manual'}
        <Stepper label={m.radiator.setpointLabel(title)} announce={false} value={expected.target ?? radiator.target} min={7}
          max={radiator.max_temperature} pending={expected.target !== undefined} disabled={!house.online}
          onchange={(v) => run(() => api.radiatorSetpoint(radiator.id, 'manual', v))} />
      {/if}
    </div>
  {/if}

  <div class="switches">
    <Toggle label={m.radiator.windowDetection} checked={radiator.window_detection} pending={busy('window')} disabled={!house.online}
      onchange={(v) => toggle('window', () => api.radiatorFeatures(radiator.id, { window_detection: v }))} />
    <Toggle label={m.radiator.presenceDetection} checked={radiator.presence_detection} pending={busy('presence')} disabled={!house.online}
      onchange={(v) => toggle('presence', () => api.radiatorFeatures(radiator.id, { presence_detection: v }))} />
    {#if radiator.light}
      <Toggle label={m.radiator.nightLight} checked={radiator.light.on} pending={busy('light')} disabled={!house.online}
        onchange={(v) => toggle('light', () => api.radiatorLight(radiator.id, v))} />
      {#if radiator.light.on && radiator.light.intensity != null}<LightSlider {radiator} />{/if}
    {/if}
  </div>
  <button type="button" class="btn btn-ghost identify" aria-disabled={!house.online}
    onclick={() => house.online && run(() => api.identify(radiator.id))}>{m.radiator.identify}</button>
</section>

<style>
  .rad {
    display: grid;
    gap: 8px;
  }
  /* Panels are separated by a hairline, not boxed: they already sit in the inspector. */
  .rad:not(:first-child) {
    border-top: 1px solid var(--line);
    padding-top: 14px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  header .btn-icon {
    flex: none;
  }
  h4 {
    margin: 0;
    min-width: 0;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .temp {
    margin-left: auto;
    flex: none;
    font-weight: 600;
  }
  .facts {
    margin: 0;
    font-size: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    text-align: right;
  }
  .controls,
  .switches {
    display: grid;
    gap: 8px;
  }
  .identify {
    justify-self: start;
  }
  form {
    display: flex;
    flex: 1;
    min-width: 0;
    gap: 6px;
  }
  input {
    flex: 1;
  }
</style>
