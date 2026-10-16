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
    /** `chips`: separate pills, the checked one ink (Programme's room chips); a `hint` there reads « · hors ligne »,
     *  and `hideHints` keeps it for assistive tech only (a phone). Same radio-group behaviour. */
    variant?: 'track' | 'chips';
    hideHints?: boolean;
  }
  let { options, value, label, onchange, block = false, variant = 'track', hideHints = false }: Props = $props();
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

<div class="seg" data-kit="segmented" class:block class:chips={variant === 'chips'} role="radiogroup" aria-label={label}>
  {#each options as o, i (o.value)}
    <button
      bind:this={buttons[i]}
      type="button"
      class="hit"
      class:offhint={!!o.hint}
      role="radio"
      lang={o.lang}
      aria-label={o.ariaLabel}
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      onclick={() => onchange(o.value)}
      onkeydown={(e) => key(e, i)}>{o.label}{#if o.hint}{#if variant === 'chips'}<span class="sep" class:visually-hidden={hideHints} aria-hidden="true">&nbsp;·</span>{/if}{' '}<em
          class:visually-hidden={hideHints}>{o.hint}</em>{/if}</button>
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
  /* Chips (Programme's rooms, Tableau §4): separate 32 px pills on s2, 8 px apart; the checked one is ink on
     bg (not colour alone: 600 weight); a room with a hint (offline) reads faint. */
  .chips {
    gap: 8px;
    padding: 0;
    background: none;
    border-radius: 0;
  }
  .chips button {
    padding: 0 12px;
    border-radius: var(--r-pill);
    background: var(--s2);
  }
  /* Faint text needs s1 under it (≥ 4.5:1; on s2 it reads 4.1:1). */
  .chips button.offhint[aria-checked='false'] {
    background: var(--s1);
    color: var(--fa);
  }
  .chips .sep,
  .chips em {
    margin: 0;
    font-size: inherit;
    color: inherit;
  }
  @media (hover: hover) {
    .chips button[aria-checked='false']:hover {
      background: var(--s3);
    }
  }
  .chips button[aria-checked='true'] {
    background: var(--tx);
    color: var(--bg);
    box-shadow: none;
  }
  .chips button:focus-visible {
    outline-offset: 2px;
  }
</style>
