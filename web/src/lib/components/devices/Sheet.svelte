<!-- The Tableau dialog (« Tout éteindre » sets the look): --pop, 18 px radius, the pop shadow, at most 340 px;
     fades and settles from 8 px below in 200 ms, leaves in 150 ms; the scrim is black at 60 %. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    dialog?: HTMLDialogElement;
    children: Snippet;
  }
  let { title, description, dialog = $bindable(), children }: Props = $props();
  const uid = $props.id();
</script>

<dialog bind:this={dialog} aria-labelledby="{uid}-title" aria-describedby={description ? `${uid}-body` : undefined}>
  <h2 id="{uid}-title">{title}</h2>
  {#if description}<p id="{uid}-body">{description}</p>{/if}
  {@render children()}
</dialog>

<style>
  dialog {
    background: var(--pop);
    color: var(--tx);
    border: 0;
    border-radius: var(--r-pop);
    box-shadow: var(--shadow-pop);
    padding: 22px;
    width: min(340px, calc(100vw - 32px));
    opacity: 0;
    transform: translateY(8px) scale(0.98);
    transition:
      opacity var(--t-exit) var(--ease-in),
      transform var(--t-exit) var(--ease-in),
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open] {
    opacity: 1;
    transform: none;
    transition-duration: 200ms;
    transition-timing-function: var(--ease-out);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
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
    background: var(--scrim);
  }
  @starting-style {
    dialog[open]::backdrop {
      background: transparent;
    }
  }
  h2 {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0 0 18px;
    font-size: 13px;
    color: var(--mu);
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog[open] {
      transform: none;
    }
  }
</style>
