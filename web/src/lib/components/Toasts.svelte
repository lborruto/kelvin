<script lang="ts">
  import { toasts } from '$lib/stores/toasts.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="assertive">
  {#each toasts.items as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>
      <span>{t.message}</span>
      <button type="button" aria-label="Fermer" onclick={() => toasts.remove(t.id)}><Icon name="x" size={18} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(76px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: grid;
    gap: 8px;
    z-index: 30;
    width: min(92vw, 420px);
  }
  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--s2);
    border: 1px solid var(--line);
    font-size: 13px;
  }
  .error {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--line));
  }
  button {
    display: inline-grid;
    place-items: center;
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: 0;
    cursor: pointer;
  }
  @media (min-width: 1024px) {
    .toasts {
      bottom: 24px;
    }
  }
</style>
