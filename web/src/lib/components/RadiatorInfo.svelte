<script lang="ts">
  import type { Radiator } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { infoRows } from '$lib/roomfacts';

  interface Props {
    radiator: Radiator;
  }
  let { radiator }: Props = $props();
  // « Dernier signal il y a 3 min » ages while the panel is open.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  let rows = $derived(infoRows(radiator, now));
</script>

<div class="info">
  <h5>{m.roomInfo.title}</h5>
  <dl>
    {#each rows as row (row.key)}
      <dt>{row.label}</dt>
      <dd class:num={row.key !== 'reach'} class:bad={row.bad}
        title={row.key === 'signal' && row.value !== '—' ? m.roomInfo.rssiHint : undefined}>{row.value}</dd>
    {/each}
  </dl>
</div>

<style>
  .info {
    display: grid;
    gap: 4px;
  }
  h5 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 2px 12px;
    margin: 0;
    font-size: 12px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .bad {
    color: var(--bad);
  }
</style>
