<script lang="ts">
  import { Settle, SETTLE_MS } from '$lib/settle.svelte';
  import PendingEdge from './PendingEdge.svelte';

  interface Props {
    checked: boolean;
    label: string;
    pending?: boolean;
    disabled?: boolean;
    onchange: (v: boolean) => void;
  }
  let { checked, label, pending = false, disabled = false, onchange }: Props = $props();

  // The state this toggle asked for: dashed around the track until the radiator reports it.
  let sent = $state<boolean | null>(null);
  // Held a little longer than the morph, so the solid outline is seen before it fades.
  const settle = new Settle<boolean>(() => (pending ? sent : null), () => checked, SETTLE_MS + 150);

  function click() {
    sent = !checked;
    onchange(!checked);
  }
</script>

<button type="button" role="switch" aria-checked={checked} aria-busy={pending} class="toggle" class:pending {disabled}
  onclick={click}>
  <span class="label">{label}</span>
  <span class="track" aria-hidden="true">
    <span class="knob"></span>
    {#if pending || settle.confirmed}
      <span class="ring" class:settled={settle.confirmed}><PendingEdge shape="rect" rx={12.5} {pending} confirmed={settle.confirmed} /></span>
    {/if}
  </span>
</button>

<style>
  .toggle {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    text-align: left;
    touch-action: manipulation;
  }
  .track {
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--fa);
    position: relative;
    transition: background-color var(--t-state) ease;
    flex: none;
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--bg);
    transition: transform var(--t-state) var(--ease-out);
  }
  /* Heat colours only mean heat: "on" is the foreground, not blue. */
  [aria-checked='true'] .track {
    background: var(--tx);
  }
  [aria-checked='true'] .knob {
    transform: translateX(16px);
  }
  /* The pending outline sits 2 px around the track (a 42 × 26 box): the shared dashed → solid mark. */
  .ring {
    position: absolute;
    inset: -2px;
  }
  .ring.settled {
    animation: ring-out var(--t-exit) ease var(--t-morph) forwards;
  }
  @keyframes ring-out {
    to {
      opacity: 0;
    }
  }
  .toggle:disabled {
    cursor: default;
    color: var(--fa);
  }
  .toggle:disabled .track {
    opacity: 0.6;
  }
  @media (prefers-reduced-motion: reduce) {
    .knob {
      transition: none;
    }
  }
</style>
