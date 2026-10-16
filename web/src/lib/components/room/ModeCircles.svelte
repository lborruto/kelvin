<!-- The room's modes as round buttons (Tableau §3 « ModeCircles », the room sheet): Arrêt, Manuel, Programme in a
     radiogroup (the shared radio keyboard model: arrows move, Enter/Space sends, since a mode is a real device
     command), the selected one an ink disc; then « Chauffe temp. » as its own button that opens the launch form
     (aria-expanded), a heat disc while one runs. A pending mode is drawn dashed until the radiators report it.
     `dim` pauses them (offline, reconnecting): aria-disabled, focus kept. A mode a room cannot take is absent. -->
<script lang="ts">
  import type { Mode, RoomMode, SettableMode } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { Settle } from '$lib/settle.svelte';
  import Icon, { type IconName } from '../Icon.svelte';
  import PendingEdge from '../PendingEdge.svelte';

  interface Props {
    value: RoomMode | null;
    pending?: Mode | null;
    modes: SettableMode[];
    label: string;
    dim?: boolean;
    /** Show « Chauffe temp. » (the room can boost). */
    boost?: boolean;
    boostOn?: boolean;
    boostOpen?: boolean;
    boostControls?: string;
    size?: number;
    onchange: (mode: SettableMode) => void;
    onboost?: () => void;
  }
  let {
    value, pending = null, modes, label, dim = false, boost = false, boostOn = false, boostOpen = false, boostControls, size = 60, onchange,
    onboost
  }: Props = $props();
  const ICON: Record<SettableMode, IconName> = { off: 'power', manual: 'edit', program: 'cal' };
  let options = $derived((['off', 'manual', 'program'] as const).filter((v) => modes.includes(v)));
  let current = $derived(boostOn ? null : (pending ?? value));
  let waiting = $derived(pending !== null && pending !== value);
  const settle = new Settle<Mode>(() => (waiting ? pending : null), () => value as Mode | null);
  let tabStop = $derived(options.find((o) => o === current) ?? options[0]);
  let buttons: HTMLButtonElement[] = [];
  function key(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    buttons[(i + d + options.length) % options.length]?.focus();
  }
</script>

<div class="modes" class:dim style:--d="{size}px">
  <div class="group" role="radiogroup" aria-label={label} aria-busy={waiting} style:flex={options.length}>
    {#each options as o, i (o)}
      {@const on = current === o}
      {@const isPending = waiting && pending === o}
      <button type="button" role="radio" class="mode" aria-checked={on} bind:this={buttons[i]} tabindex={tabStop === o ? 0 : -1}
        aria-label={isPending ? m.modeSwitch.pending(m.mode[o]) : m.mode[o]} aria-disabled={dim} onkeydown={(e) => key(e, i)}
        onclick={() => !dim && current !== o && onchange(o)}>
        <span class="disc" class:on>{#if on}<PendingEdge shape="rect" rx={size / 2} pending={isPending} confirmed={settle.confirmed && settle.held?.v === o} />{/if}<Icon
            name={ICON[o]} size={24} /></span>
        <span class="lab">{m.mode[o]}</span>
      </button>
    {/each}
  </div>
  {#if boost}
    <button type="button" class="mode" aria-expanded={boostOn ? undefined : boostOpen} aria-pressed={boostOn ? true : undefined}
      aria-controls={boostControls} aria-disabled={dim} onclick={() => !dim && onboost?.()}>
      <span class="disc" class:heat={boostOn}><Icon name="flame" size={24} /></span>
      <span class="lab">{m.kit.boostShort}</span>
    </button>
  {/if}
</div>

<style>
  .modes {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    transition: opacity var(--t-state) ease;
  }
  .group {
    display: flex;
    gap: 4px;
    min-width: 0;
  }
  .modes.dim {
    opacity: 0.45;
  }
  .mode {
    display: grid;
    justify-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
    padding: 0;
    border: 0;
    background: none;
    color: var(--mu);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .mode[aria-disabled='true'] {
    cursor: default;
  }
  .disc {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--d);
    height: var(--d);
    border-radius: 50%;
    background: var(--s2);
    color: var(--tx);
    transition:
      background-color var(--t-state) ease,
      color var(--t-state) ease,
      transform var(--t-press) ease;
    --edge-rest: transparent;
  }
  .disc.on {
    background: var(--tx);
    color: var(--bg);
    --edge-rest: transparent;
  }
  .disc.heat {
    background: var(--heat);
    color: var(--heat-ink);
  }
  .mode:active:not([aria-disabled='true']) .disc {
    transform: scale(0.95);
  }
  @media (hover: hover) {
    .mode:not([aria-disabled='true']):hover .disc:not(.on, .heat) {
      background: var(--s3);
    }
  }
  .mode:has(.on),
  .mode[aria-pressed='true'] {
    color: var(--tx);
  }
  .lab {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mode:focus-visible {
    outline: none;
  }
  .mode:focus-visible .disc {
    outline: 2px solid var(--tx);
    outline-offset: 3px;
  }
  @media (prefers-reduced-motion: reduce) {
    .mode:active:not([aria-disabled='true']) .disc {
      transform: none;
    }
  }
</style>
