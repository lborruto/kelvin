<script lang="ts">
  import type { Override } from '$lib/api/types';
  import { fmtTemp, fmtTime } from '$lib/format';

  interface Props {
    override?: Override;
  }
  let { override }: Props = $props();
</script>

{#if override}
  <span class="badge" class:away={override.kind === 'away'}>
    {#if override.restoring}
      Rétablissement…
    {:else if override.kind === 'boost'}
      Forcé {fmtTemp(override.temperature)} → {fmtTime(override.ends_at * 1000)}
    {:else}
      Absence {fmtTemp(override.temperature)}
    {/if}
  </span>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    background: color-mix(in srgb, var(--warm) 18%, transparent);
    color: var(--tx);
  }
  .away {
    background: color-mix(in srgb, var(--cool) 18%, transparent);
  }
</style>
