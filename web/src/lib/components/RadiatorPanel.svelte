<script lang="ts">
  import type { DryerAction, DryerState, PilotLevel, Radiator } from '$lib/api/types';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { capsOf, isReadOnly, LEVEL_ORDER } from '$lib/capabilities';
  import { fmtKwh, fmtTemp } from '$lib/format';
  import { m, modeLabel } from '$lib/i18n';
  import { heatColor } from '$lib/heat';
  import { house } from '$lib/stores/house.svelte';
  import CommandSwitch from './CommandSwitch.svelte';
  import Icon from './Icon.svelte';
  import LightSlider from './LightSlider.svelte';
  import RadiatorInfo from './RadiatorInfo.svelte';
  import ModeSwitch from './ModeSwitch.svelte';
  import Stepper from './Stepper.svelte';
  import SupportChip from './SupportChip.svelte';
  import Toggle from './Toggle.svelte';

  interface Props {
    radiator: Radiator;
    showControls: boolean;
  }
  let { radiator, showControls }: Props = $props();
  let expected = $derived(house.expectedFor(radiator.id));
  // Plan 12: only what this device supports is shown; a device Kelvin does not drive says so.
  let caps = $derived(capsOf(radiator));
  let readOnly = $derived(isReadOnly(radiator));
  const LEVEL_KEY = {
    comfort: 'comfort',
    'comfort-1': 'comfort1',
    'comfort-2': 'comfort2',
    eco: 'eco',
    frostprotection: 'frostprotection',
    off: 'off'
  } as const;
  const levelName = (l: PilotLevel) => m.pilot[LEVEL_KEY[l]];
  let levelOptions = $derived(LEVEL_ORDER.filter((l) => caps.levels.includes(l)).map((l) => ({ value: l, label: levelName(l) })));
  let level = $derived(
    (LEVEL_ORDER as string[]).includes(radiator.heating_level ?? '') ? (radiator.heating_level as PilotLevel) : null
  );
  type DryerChoice = 'normal' | DryerState;
  let dryerOptions = $derived<{ value: DryerChoice, label: string }[]>([
    { value: 'normal', label: m.dryer.normal },
    ...caps.dryer.map((d) => ({ value: d, label: m.dryer[d] }))
  ]);
  // `expected.dryer` is null while « back to normal » is pending, undefined when nothing is.
  let dryerPending = $derived<DryerChoice | null>(expected.dryer === undefined ? null : (expected.dryer ?? 'normal'));
  const dryerAction = (v: DryerChoice): DryerAction => (v === 'normal' ? 'stop' : v);
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
      {#if caps.rename && !readOnly}<button type="button" class="btn btn-icon" aria-label={m.radiator.rename} onclick={startRename}><Icon name="edit" size={16} /></button>{/if}
    {/if}
    <SupportChip support={radiator.support} />
    <span class="temp num" style:color={heatColor(radiator.temperature)}>{fmtTemp(radiator.temperature)}</span>
  </header>
  {#if renamed}<p class="muted facts">{facts}</p>{/if}
  <dl class="grid">
    {#if caps.levels.length}
      <dt>{m.pilot.label}</dt><dd>{level ? levelName(level) : '—'}</dd>
    {:else}
      <dt>Mode</dt><dd>{modeLabel(radiator.mode)}</dd>
    {/if}
    <dt>{m.radiator.setpointActive}</dt><dd class="num">{fmtTemp(radiator.effective_setpoint)}</dd>
    {#if radiator.energy_wh}<dt>{m.radiator.energyTotal}</dt><dd class="num">{fmtKwh(radiator.energy_wh.total / 1000)}</dd>{/if}
  </dl>
  <RadiatorInfo {radiator} />

  {#if readOnly}
    <p class="note">{m.support.readonlyHint}</p>
  {:else}
    {#if caps.levels.length}
      <CommandSwitch label={m.pilot.label} options={levelOptions} value={level}
        pending={(expected.level as PilotLevel | undefined) ?? null} disabled={!house.online}
        onchange={(v) => run(() => api.radiatorLevel(radiator.id, v))} />
    {/if}
    {#if caps.dryer.length}
      <CommandSwitch label={m.dryer.label} options={dryerOptions} value={radiator.dryer ?? 'normal'}
        pending={dryerPending} disabled={!house.online}
        onchange={(v) => run(() => api.radiatorDryer(radiator.id, dryerAction(v)))} />
    {/if}
    {#if showControls}
      <div class="controls">
        {#if caps.modes.length}
          <ModeSwitch label="Mode — {title}" value={radiator.mode} pending={expected.mode ?? null} compact modes={caps.modes}
            disabled={!house.online} onchange={(next) => run(() => api.radiatorMode(radiator.id, next))} />
        {/if}
        {#if (expected.mode ?? radiator.mode) === 'manual' && caps.manual}
          <Stepper label={m.radiator.setpointLabel(title)} announce={false} value={expected.target ?? radiator.target} min={caps.manual[0]}
            max={caps.manual[1]} pending={expected.target !== undefined} disabled={!house.online}
            onchange={(v) => run(() => api.radiatorSetpoint(radiator.id, 'manual', v))} />
        {/if}
      </div>
    {/if}

    <div class="switches">
      {#if caps.window_detection}
        <Toggle label={m.radiator.windowDetection} checked={radiator.window_detection} pending={busy('window')} disabled={!house.online}
          onchange={(v) => toggle('window', () => api.radiatorFeatures(radiator.id, { window_detection: v }))} />
      {/if}
      {#if caps.presence_detection}
        <Toggle label={m.radiator.presenceDetection} checked={radiator.presence_detection} pending={busy('presence')} disabled={!house.online}
          onchange={(v) => toggle('presence', () => api.radiatorFeatures(radiator.id, { presence_detection: v }))} />
      {/if}
      {#if radiator.light && caps.night_light}
        <Toggle label={m.radiator.nightLight} checked={radiator.light.on} pending={busy('light')} disabled={!house.online}
          onchange={(v) => toggle('light', () => api.radiatorLight(radiator.id, v))} />
        {#if radiator.light.on && radiator.light.intensity != null && caps.night_light_intensity}<LightSlider {radiator} />{/if}
      {/if}
    </div>
    {#if caps.identify}
      <button type="button" class="btn btn-ghost identify" aria-disabled={!house.online}
        onclick={() => house.online && run(() => api.identify(radiator.id))}>{m.radiator.identify}</button>
    {/if}
  {/if}
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
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--mu);
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
