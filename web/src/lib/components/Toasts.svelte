<script lang="ts">
  import { fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { dur, easeOut, rise, T } from '$lib/motion';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Icon from './Icon.svelte';

  // Two regions that are always present: errors interrupt, information waits its turn.
  let errors = $derived(toasts.items.filter((t) => t.kind === 'error'));
  let infos = $derived(toasts.items.filter((t) => t.kind === 'info'));
</script>

<div class="toasts">
  {#each [errors, infos] as list, r (r)}
    <div class="stack" aria-live={r === 0 ? 'assertive' : 'polite'}>
      {#each list as t (t.id)}
        <!-- Pausing on hover is a reading aid, not an interaction: the close button is the control. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="toast" class:error={t.kind === 'error'} in:rise={{ y: 12 }} out:fade={{ duration: dur(T.exit) }}
          animate:flip={{ duration: dur(200), easing: easeOut }}
          onpointerenter={() => toasts.pause(t.id)} onpointerleave={() => toasts.resume(t.id)}
          onfocusin={() => toasts.pause(t.id)} onfocusout={() => toasts.resume(t.id)}>
          <span>{t.message}</span>
          <button type="button" class="btn btn-icon" aria-label="Fermer" onclick={() => toasts.remove(t.id)}><Icon name="x" size={18} /></button>
        </div>
      {/each}
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
    pointer-events: none;
    view-transition-name: toasts;
  }
  .stack {
    display: grid;
    gap: 8px;
  }
  .stack:empty {
    display: none;
  }
  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 6px 6px 14px;
    min-height: 56px;
    border-radius: var(--radius);
    background: var(--s2);
    border: 1px solid var(--line);
    font-size: 13px;
    pointer-events: auto;
  }
  .error {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--line));
  }
  .toast .btn-icon {
    flex: none;
    color: var(--tx);
  }
  @media (min-width: 1024px) {
    .toasts {
      bottom: 24px;
    }
  }
</style>
