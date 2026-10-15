<!-- A small modal choice (Programme: « Copier vers… », « Aussi pour… »): a bottom sheet on a phone
     that rises in 220 ms, a centred popover on desktop that fades in 160 ms. A native modal
     <dialog>: focus stays inside, Esc and the scrim close it, focus returns to its trigger. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { m } from '$lib/i18n';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    open: boolean;
    /** Focus goes back here when the sheet closes. */
    trigger?: HTMLElement | null;
    onclose: () => void;
    children: Snippet;
  }
  let { title, open, trigger = null, onclose, children }: Props = $props();
  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close?.();
  });

  function closed() {
    onclose();
    trigger?.focus();
  }
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" onclose={closed}
  onclick={(e) => e.target === dialog && dialog?.close?.()}>
  {#if open}
    <div class="grab" aria-hidden="true"></div>
    <div class="head">
      <h2 id="{uid}-title">{title}</h2>
      <button type="button" class="btn btn-icon" aria-label={m.common.close} onclick={() => dialog?.close?.()}><Icon name="x" size={18} /></button>
    </div>
    {@render children()}
  {/if}
</dialog>

<style>
  dialog {
    width: min(400px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow: auto;
    padding: 12px 16px 16px;
    background: var(--s1);
    color: var(--tx);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    opacity: 0;
    transition:
      opacity var(--t-exit) var(--ease-in),
      transform var(--t-exit) var(--ease-in),
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open] {
    opacity: 1;
    transition-duration: var(--t-state);
    transition-timing-function: var(--ease-out);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
    }
  }
  dialog::backdrop {
    background: transparent;
    transition:
      background-color var(--t-exit) ease,
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open]::backdrop {
    background: color-mix(in srgb, var(--bg) 72%, transparent);
  }
  @starting-style {
    dialog[open]::backdrop {
      background: transparent;
    }
  }
  .grab {
    display: none;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 -8px 8px 0;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  /* Phone: a bottom sheet over the tab bar, rising from below. */
  @media (max-width: 1023px) {
    dialog {
      width: 100%;
      max-width: 100%;
      margin: auto 0 0;
      padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
      border-width: 1px 0 0;
      border-radius: var(--radius) var(--radius) 0 0;
      transform: translateY(100%);
    }
    dialog[open] {
      transform: none;
      transition-duration: var(--t-enter);
    }
    @starting-style {
      dialog[open] {
        transform: translateY(100%);
      }
    }
    .grab {
      display: block;
      width: 36px;
      height: 4px;
      margin: 0 auto 4px;
      border-radius: 2px;
      background: var(--field-line);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog[open] {
      transform: none;
    }
  }
</style>
