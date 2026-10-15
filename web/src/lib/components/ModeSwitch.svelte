<script lang="ts">
  import type { Mode, RoomMode, SettableMode } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { Settle } from '$lib/settle.svelte';
  import PendingEdge from './PendingEdge.svelte';

  interface Props {
    value: RoomMode | null;
    pending?: Mode | null;
    disabled?: boolean;
    compact?: boolean;
    modes?: SettableMode[];
    label?: string;
    onchange: (m: SettableMode) => void;
  }
  let { value, pending = null, disabled = false, compact = false, modes = ['off', 'manual', 'program'], label = 'Mode', onchange }: Props = $props();
  let options = $derived([
    { v: 'off' as const, l: m.mode.off },
    { v: 'manual' as const, l: m.mode.manual },
    { v: 'program' as const, l: compact ? m.modeSwitch.programShort : m.mode.program }
  ].filter((o) => modes.includes(o.v)));
  let current = $derived(pending ?? value);
  let waiting = $derived(pending !== null && pending !== value);
  // Dashed while the radiator has not reported the requested mode; closes solid when it does.
  const settle = new Settle<Mode>(() => (waiting ? pending : null), () => value as Mode | null);
  let tabStop = $derived(options.some((o) => o.v === current) ? current : options[0].v);
  let buttons: HTMLButtonElement[] = [];

  function key(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    // Manual activation: a mode change is a real device command, so arrows only move focus;
    // Enter/Space (the button's native click) sends.
    buttons[(i + d + options.length) % options.length]?.focus();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label} aria-busy={waiting} style:--cols={options.length}>
  {#each options as o, i (o.v)}
    {@const on = current === o.v}
    {@const isPending = waiting && pending === o.v}
    <button type="button" role="radio" aria-checked={on}
      aria-label={isPending ? m.modeSwitch.pending(o.v === 'program' ? m.mode.program : o.l) : o.v === 'program' ? m.mode.program : o.l}
      bind:this={buttons[i]} tabindex={tabStop === o.v ? 0 : -1} onkeydown={(e) => key(e, i)}
      class:on class:pending={isPending} aria-disabled={disabled}
      onclick={() => !disabled && current !== o.v && onchange(o.v)}>{o.l}{#if on}<PendingEdge shape="rect" rx={6.5} pending={isPending}
          confirmed={settle.confirmed && settle.held?.v === o.v} />{/if}</button>
  {/each}
</div>

<style>
  .seg {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), 1fr);
    gap: 2px;
    padding: 2px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  button {
    position: relative;
    min-height: 44px;
    border: 0;
    border-radius: calc(var(--radius) - 3px);
    background: transparent;
    color: var(--mu);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    touch-action: manipulation;
    transition: background-color var(--t-state) ease, color var(--t-state) ease;
  }
  @media (hover: hover) {
    button:not(.on, [aria-disabled='true']):hover {
      color: var(--tx);
    }
  }
  /* The selected segment: s2 with ink, edged in muted (3:1 against the well, WCAG 1.4.11). The edge
     is the signature mark: dashed while the mode is requested, closing solid when confirmed. */
  button.on {
    background: var(--s2);
    color: var(--tx);
    --edge-rest: var(--mu);
  }
  /* aria-disabled, never disabled: a focused segment keeps focus when commands pause. */
  button[aria-disabled='true'] {
    cursor: default;
    color: var(--fa);
  }
  button.on[aria-disabled='true'] {
    color: var(--mu);
  }
</style>
