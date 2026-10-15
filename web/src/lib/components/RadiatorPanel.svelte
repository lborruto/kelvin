<script lang="ts">
  import { untrack } from 'svelte';
  import { radiatorTitle } from '$lib/setup';
  import type { DryerAction, DryerState, PilotLevel, Radiator } from '$lib/api/types';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { canEditSetup, capsOf, isReadOnly, LEVEL_ORDER } from '$lib/capabilities';
  import { fmtKwh, fmtTemp } from '$lib/format';
  import { m, modeLabel } from '$lib/i18n';
  import { slide } from 'svelte/transition';
  import { dur, easeOut, T } from '$lib/motion';
  import { reachText } from '$lib/roomfacts';
  import { auth } from '$lib/stores/auth.svelte';
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
    /** Open from the start (tests; the room panel opens rows on demand). */
    expanded?: boolean;
  }
  let { radiator, showControls, expanded = false }: Props = $props();
  const uid = $props.id();
  // A disclosure row: name, power and reachability, the reading; everything else one tap away.
  let open = $state(untrack(() => expanded));
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  let offline = $derived(radiator.reachable === false);
  // An offline radiator answers nothing: its commands pause (aria-disabled), as when Kelvin is disconnected.
  let paused = $derived(!house.online || offline);
  let reach = $derived(reachText(radiator, now).text);
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
  let title = $derived(radiatorTitle(radiator));
  let sub = $derived([renamed && radiator.power_w ? m.roomInfo.watts(radiator.power_w) : null, reach === '—' ? null : reach].filter(Boolean).join(' · '));
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
  <h4 class="row-h">
    <button type="button" class="row" aria-expanded={open} aria-controls="{uid}-body" onclick={() => (open = !open)}>
      <span class="who"><span class="title">{title}</span>{#if sub}<span class="sub muted">{sub}</span>{/if}</span>
      <SupportChip support={radiator.support} />
      <span class="temp num" class:muted={offline}>{offline ? '—' : fmtTemp(radiator.temperature)}</span>
      <span class="chev" class:open aria-hidden="true"><Icon name="chevron" size={14} /></span>
    </button>
  </h4>
  {#if open}
  <div class="body" id="{uid}-body" transition:slide={{ duration: dur(T.enter), easing: easeOut }}>
  {#if renaming}
    <form onsubmit={submitRename}>
      <input aria-label={m.radiator.nameLabel} maxlength="32" bind:value={draft} />
      <button type="submit" class="btn btn-sm">OK</button>
    </form>
  {/if}
  {#if renamed}<p class="muted facts">{facts}</p>{/if}
  <dl class="grid">
    {#if caps.levels.length}
      <dt>{m.pilot.label}</dt><dd>{level ? levelName(level) : '—'}</dd>
    {:else}
      <dt>Mode</dt><dd>{modeLabel(radiator.mode)}</dd>
    {/if}
    {#if caps.manual}<dt>{m.radiator.setpointActive}</dt><dd class="num">{fmtTemp(radiator.effective_setpoint)}</dd>{/if}
    {#if radiator.energy_wh}<dt>{m.radiator.energyTotal}</dt><dd class="num">{fmtKwh(radiator.energy_wh.total / 1000)}</dd>{/if}
  </dl>
  <RadiatorInfo {radiator} />

  {#if readOnly}
    <p class="note">{m.support.readonlyHint}</p>
  {:else}
    {#if offline}<p class="note">{m.room.offlineBody}</p>{/if}
    {#if caps.levels.length}
      <CommandSwitch label={m.pilot.label} options={levelOptions} value={level}
        pending={(expected.level as PilotLevel | undefined) ?? null} disabled={paused}
        onchange={(v) => run(() => api.radiatorLevel(radiator.id, v))} />
    {/if}
    {#if caps.dryer.length}
      <CommandSwitch label={m.dryer.label} options={dryerOptions} value={radiator.dryer ?? 'normal'}
        pending={dryerPending} disabled={paused}
        onchange={(v) => run(() => api.radiatorDryer(radiator.id, dryerAction(v)))} />
    {/if}
    {#if showControls}
      <div class="controls">
        {#if caps.modes.length}
          <ModeSwitch label="Mode — {title}" value={radiator.mode} pending={expected.mode ?? null} compact modes={caps.modes}
            disabled={paused} onchange={(next) => run(() => api.radiatorMode(radiator.id, next))} />
        {/if}
        {#if (expected.mode ?? radiator.mode) === 'manual' && caps.manual}
          <Stepper label={m.radiator.setpointLabel(title)} announce={false} value={expected.target ?? radiator.target} min={caps.manual[0]}
            max={caps.manual[1]} pending={expected.target !== undefined} disabled={paused}
            onchange={(v) => run(() => api.radiatorSetpoint(radiator.id, 'manual', v))} />
        {/if}
      </div>
    {/if}

    <div class="switches">
      {#if caps.window_detection}
        <Toggle label={m.radiator.windowDetection} checked={radiator.window_detection} pending={busy('window')} disabled={paused}
          onchange={(v) => toggle('window', () => api.radiatorFeatures(radiator.id, { window_detection: v }))} />
      {/if}
      {#if caps.presence_detection}
        <Toggle label={m.radiator.presenceDetection} checked={radiator.presence_detection} pending={busy('presence')} disabled={paused}
          onchange={(v) => toggle('presence', () => api.radiatorFeatures(radiator.id, { presence_detection: v }))} />
      {/if}
      {#if radiator.light && caps.night_light}
        <Toggle label={m.radiator.nightLight} checked={radiator.light.on} pending={busy('light')} disabled={paused}
          onchange={(v) => toggle('light', () => api.radiatorLight(radiator.id, v))} />
        {#if radiator.light.on && radiator.light.intensity != null && caps.night_light_intensity && !paused}<LightSlider {radiator} />{/if}
      {/if}
    </div>
    <div class="acts">
      {#if caps.rename && canEditSetup(auth.server) && !renaming}<button type="button" class="btn btn-ghost" onclick={startRename}><Icon
            name="edit" size={16} />{m.radiator.rename}</button>{/if}
      {#if caps.identify}
        <button type="button" class="btn btn-ghost identify" aria-disabled={paused}
          onclick={() => !paused && run(() => api.identify(radiator.id))}>{m.radiator.identify}</button>
      {/if}
    </div>
  {/if}
  </div>
  {/if}
</section>

<style>
  .rad:not(:first-child) {
    border-top: 1px solid var(--line);
  }
  .row-h {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
  }
  /* The disclosure row: 52 px, the whole width; name and state on the left, reading and chevron on the right. */
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 6px 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }
  .who {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .title {
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sub {
    font-size: 12px;
  }
  .temp {
    flex: none;
    font-size: 14px;
    font-weight: 600;
  }
  .temp.muted {
    font-weight: 400;
  }
  .chev {
    display: inline-flex;
    color: var(--mu);
    transform: rotate(90deg);
    transition: transform var(--t-state) var(--ease-out);
  }
  .chev.open {
    transform: rotate(-90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .body {
    display: grid;
    gap: 8px;
    padding-bottom: 14px;
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
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .acts .btn {
    gap: 6px;
  }
  form {
    display: flex;
    min-width: 0;
    gap: 6px;
  }
  input {
    flex: 1;
    min-width: 0;
  }
</style>
