<script lang="ts">
  import type { Support } from '$lib/api/types';
  import { m } from '$lib/i18n';

  /** How far Kelvin vouches for a device (Plan 12). Tested hardware needs no badge. */
  let { support }: { support: Support | null | undefined } = $props();
  let shown = $derived(support === 'expected' || support === 'experimental' || support === 'readonly' ? support : null);
</script>

{#if shown}<span class="chip" class:ro={shown === 'readonly'}>{m.support[shown]}</span>{/if}

<style>
  .chip {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--mu);
    white-space: nowrap;
  }
  .ro {
    background: var(--s2);
  }
</style>
