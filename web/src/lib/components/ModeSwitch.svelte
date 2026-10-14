<script lang="ts">
  import type { Mode, RoomMode, SettableMode } from '$lib/api/types';

  interface Props {
    value: RoomMode | null;
    pending?: Mode | null;
    disabled?: boolean;
    compact?: boolean;
    label?: string;
    onchange: (m: SettableMode) => void;
  }
  let { value, pending = null, disabled = false, compact = false, label = 'Mode', onchange }: Props = $props();
  let options = $derived([
    { v: 'off' as const, l: 'Arrêt' },
    { v: 'manual' as const, l: 'Manuel' },
    { v: 'program' as const, l: compact ? 'Prog.' : 'Programme' }
  ]);
  let current = $derived(pending ?? value);
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

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o, i (o.v)}
    <button type="button" role="radio" aria-checked={current === o.v} aria-label={o.v === 'program' ? 'Programme' : o.l}
      bind:this={buttons[i]} tabindex={tabStop === o.v ? 0 : -1} onkeydown={(e) => key(e, i)}
      class:on={current === o.v} class:pending={pending === o.v && pending !== value} {disabled}
      onclick={() => current !== o.v && onchange(o.v)}>{o.l}</button>
  {/each}
</div>

<style>
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 2px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  button {
    min-height: 44px;
    border: 1px solid transparent;
    border-radius: calc(var(--radius) - 3px);
    background: transparent;
    color: var(--mu);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  }
  button.on {
    background: var(--s2);
    color: var(--tx);
    border-color: var(--line);
  }
  button.pending {
    border-style: dashed;
    border-color: var(--mu);
  }
  button:disabled {
    cursor: default;
    opacity: 0.6;
  }
</style>
