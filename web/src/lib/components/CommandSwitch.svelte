<script lang="ts" generics="T extends string">
  import { m } from '$lib/i18n';
  import { Settle } from '$lib/settle.svelte';
  import PendingEdge from './PendingEdge.svelte';

  /** A device command as a radio group (a pilot-wire level, a towel dryer's boost): manual
   *  activation and the shared dashed → solid edge, exactly like ModeSwitch. */
  interface Props {
    options: { value: T; label: string }[];
    value: T | null;
    pending?: T | null;
    disabled?: boolean;
    label: string;
    onchange: (v: T) => void;
  }
  let { options, value, pending = null, disabled = false, label, onchange }: Props = $props();
  let current = $derived(pending ?? value);
  let waiting = $derived(pending !== null && pending !== value);
  const settle = new Settle<T>(() => (waiting ? pending : null), () => value);
  let tabStop = $derived(options.some((o) => o.value === current) ? current : options[0]?.value);
  // 2 or 3 per row: six levels wrap as 3 + 3, four as 2 + 2.
  let cols = $derived(options.length <= 3 ? options.length : options.length % 3 === 0 ? 3 : 2);
  let buttons: HTMLButtonElement[] = [];

  function key(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    // A device command: arrows only move focus; Enter/Space (the button's click) sends.
    buttons[(i + d + options.length) % options.length]?.focus();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label} aria-busy={waiting} style:--cols={cols}>
  {#each options as o, i (o.value)}
    {@const on = current === o.value}
    {@const isPending = waiting && pending === o.value}
    <button type="button" class="hit" role="radio" aria-checked={on} aria-label={isPending ? m.modeSwitch.pending(o.label) : o.label}
      bind:this={buttons[i]} tabindex={tabStop === o.value ? 0 : -1} onkeydown={(e) => key(e, i)}
      class:on class:pending={isPending} aria-disabled={disabled}
      onclick={() => !disabled && current !== o.value && onchange(o.value)}>{o.label}{#if on}<PendingEdge shape="rect" rx={5.5}
          pending={isPending} confirmed={settle.confirmed && settle.held?.v === o.value} />{/if}</button>
  {/each}
</div>

<style>
  /* Compact scale: 36 px segments in a 40 px well, each with a 44 px hit area (.hit). Rows of
     segments (CommandSwitch) are 8 px apart so the hit areas never overlap. */
  .seg {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), 1fr);
    gap: 8px 2px;
    padding: 1px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: var(--ctl-radius);
  }
  button {
    position: relative;
    min-height: var(--ctl-h);
    border: 0;
    border-radius: calc(var(--ctl-radius) - 2px);
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
  button.on {
    background: var(--s2);
    color: var(--tx);
    --edge-rest: var(--mu);
  }
  button[aria-disabled='true'] {
    cursor: default;
    color: var(--fa);
  }
  button.on[aria-disabled='true'] {
    color: var(--mu);
  }
</style>
