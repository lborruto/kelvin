<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Pending } from '$lib/api/types';
  import { dur, T } from '$lib/motion';
  import Icon from './Icon.svelte';

  interface Props {
    pending?: Pending;
    onretry: (id: string) => void;
    ondismiss: (id: string) => void;
  }
  let { pending, onretry, ondismiss }: Props = $props();
  // Sending and pending read the same: one state, so the tag does not blink between them.
  let phase = $derived(
    !pending ? null : pending.status === 'sending' || pending.status === 'pending' ? 'sending' : pending.status
  );
</script>

<!-- Screen readers hear the progress from the app's announcer (house store); the tag is visual.
     The failure stays readable because it carries its own controls. -->
<span class="slot">
  {#key phase}
    {#if pending && phase === 'sending'}
      <span class="tag" aria-hidden="true" in:fade={{ duration: dur(T.state) }} out:fade={{ duration: dur(T.exit) }}><span
          class="dot"></span>Envoi…</span>
    {:else if pending && phase === 'confirmed'}
      <span class="tag ok" aria-hidden="true" in:fade={{ duration: dur(T.state) }} out:fade={{ duration: dur(T.move) }}><svg
          class="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" /></svg>Confirmé</span>
    {:else if pending && phase === 'failed'}
      {@const p = pending}
      <span class="tag bad" in:fade={{ duration: dur(T.state) }}>
        <Icon name="alert" size={14} />
        <span>{p.error ?? 'Échec de la commande.'}</span>
        <button type="button" class="btn btn-ghost" onclick={() => onretry(p.id)}>Réessayer</button>
        <button type="button" class="btn btn-icon x" aria-label="Ignorer" onclick={() => ondismiss(p.id)}><Icon name="x" size={16} /></button>
      </span>
    {/if}
  {/key}
</span>

<style>
  /* States cross-fade in place: the leaving one and the arriving one share a cell. */
  .slot {
    display: inline-grid;
    align-items: center;
  }
  .slot > :global(*) {
    grid-area: 1 / 1;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--mu);
  }
  .ok {
    color: var(--ok);
  }
  .bad {
    color: var(--bad);
    flex-wrap: wrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px dashed var(--mu);
    animation: spin 1.2s linear infinite;
  }
  /* Confirmé: the check draws itself, the same gesture as the dash closing. */
  .check path {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw var(--t-morph) var(--ease-out) 60ms forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .bad .btn {
    color: var(--tx);
    font-size: 12px;
  }
  .x {
    color: var(--tx);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
    .check path {
      animation: none;
      stroke-dashoffset: 0;
    }
  }
</style>
