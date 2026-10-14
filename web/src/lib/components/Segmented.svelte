<script lang="ts" generics="T extends string">
  interface Props {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    onchange: (v: T) => void;
  }
  let { options, value, label, onchange }: Props = $props();
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
    buttons[next]?.focus();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o, i (o.value)}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      onclick={() => onchange(o.value)}
      onkeydown={(e) => key(e, i)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  button {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: none;
    color: var(--mu);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }
  button[aria-checked='true'] {
    background: var(--s2);
    border-color: var(--line);
    color: var(--tx);
  }
</style>
