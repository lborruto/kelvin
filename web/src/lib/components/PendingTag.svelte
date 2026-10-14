<script lang="ts">
  import type { Pending } from '$lib/api/types';
  import Icon from './Icon.svelte';

  interface Props {
    pending?: Pending;
    onretry: (id: string) => void;
    ondismiss: (id: string) => void;
  }
  let { pending, onretry, ondismiss }: Props = $props();
</script>

{#if pending}
  {#if pending.status === 'sending' || pending.status === 'pending'}
    <span class="tag sending" role="status"><span class="dot"></span>Envoi…</span>
  {:else if pending.status === 'confirmed'}
    <span class="tag ok" role="status"><Icon name="check" size={14} />Confirmé</span>
  {:else if pending.status === 'failed'}
    <span class="tag bad" role="alert">
      <Icon name="alert" size={14} />
      <span>{pending.error ?? 'Échec de la commande.'}</span>
      <button type="button" onclick={() => onretry(pending.id)}>Réessayer</button>
      <button type="button" class="x" aria-label="Ignorer" onclick={() => ondismiss(pending.id)}><Icon name="x" size={16} /></button>
    </span>
  {/if}
{/if}

<style>
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
  button {
    min-height: 44px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--s2);
    color: var(--tx);
    font-size: 12px;
    cursor: pointer;
  }
  .x {
    display: inline-grid;
    place-items: center;
    min-width: 44px;
    padding: 0 8px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
