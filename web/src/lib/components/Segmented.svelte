<script lang="ts" generics="T extends string">
  import { flushSync } from 'svelte';
  interface Props {
    /** `hint`: a muted word after the label, part of its name (Programme: « hors ligne »). */
    options: { value: T; label: string; lang?: string; ariaLabel?: string; hint?: string }[];
    value: T;
    label: string;
    onchange: (v: T) => void;
    /** Stretch the segments to the container's width (equal parts). */
    block?: boolean;
  }
  let { options, value, label, onchange, block = false }: Props = $props();
  let buttons: HTMLButtonElement[] = $state([]);

  // A choice, not a device command: arrows move AND select (WAI-ARIA radio group).
  function key(e: KeyboardEvent, i: number) {
    const n = options.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    onchange(options[next].value);
    flushSync();
    // A refused change (Programme asks before dropping edits) keeps focus on the checked choice.
    if (value === options[next].value) buttons[next]?.focus();
  }
</script>

<div class="seg" class:block role="radiogroup" aria-label={label}>
  {#each options as o, i (o.value)}
    <button
      bind:this={buttons[i]}
      type="button"
      class="hit"
      role="radio"
      lang={o.lang}
      aria-label={o.ariaLabel}
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      onclick={() => onchange(o.value)}
      onkeydown={(e) => key(e, i)}>{o.label}{#if o.hint}{' '}<em>{o.hint}</em>{/if}</button>
  {/each}
</div>

<style>
  /* Tableau « Segmented » (spec §3): an s2 track (radius 10, 2 px inset and gap) of 32 px segments (radius 8),
     ink 500 text; the checked one is s3 with a soft shadow and 600 text (not colour alone). Each segment's
     hit area reaches 44 px (.hit). A view choice: arrows select (the Command Keyboard Rule). */
  .seg {
    display: inline-flex;
    gap: 2px;
    max-width: 100%;
    padding: 2px;
    border-radius: var(--r-seg);
    background: var(--s2);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .seg.block {
    display: flex;
    width: 100%;
  }
  .block button {
    flex: 1;
  }
  button {
    --ctl-h: 32px;
    min-height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      box-shadow var(--t-state) ease;
  }
  @media (hover: hover) {
    button[aria-checked='false']:hover {
      background: color-mix(in srgb, var(--s3) 50%, transparent);
    }
  }
  em {
    margin-left: 4px;
    font-style: normal;
    font-size: 12px;
    font-weight: 500;
    color: var(--mu);
  }
  button[aria-checked='true'] {
    background: var(--s3);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-weight: 600;
  }
  button:focus-visible {
    outline-offset: -2px;
  }
</style>
