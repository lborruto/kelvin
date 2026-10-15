<script lang="ts">
  import { fmtTime, parisTodayIso } from '$lib/format';
  import { stripLines } from '$lib/grid';
  import { m } from '$lib/i18n';
  import { grid } from '$lib/stores/grid.svelte';
  import Icon from './Icon.svelte';
  import TempoDot from './TempoDot.svelte';

  let lines = $derived(stripLines(grid.view, parisTodayIso()));
</script>

{#if lines}
  <section class="strip" aria-label={m.grid.label}>
    {#if lines.tempo}
      {@const t = lines.tempo}
      <p class="tempo">
        <span class="day"><TempoDot colour={t.today} />{t.today ? m.grid.tempoDay(m.grid.today, m.grid.colour[t.today]) : m.grid.tempoUnknown(m.grid.today)}</span>
        <span class="sep" aria-hidden="true">·</span>
        <span class="day">
          <TempoDot colour={t.tomorrow} />{#if t.tomorrow}{m.grid.tempoDay(m.grid.tomorrow, m.grid.colour[t.tomorrow])}{:else}{m.grid.tempoPending(t.expectedAt ?? '11:00')}{/if}
        </span>
      </p>
    {/if}
    {#each lines.ecowatt as e (e.date)}
      <p class="eco" class:bad={e.level === 3}>
        <Icon name="alert" size={14} />{m.grid.ecowatt(e.level, e.when === 'today' ? m.grid.whenToday : m.grid.whenTomorrow, e.hours)}
      </p>
    {/each}
    {#if lines.updatedAt}<p class="src">{m.grid.source(fmtTime(lines.updatedAt * 1000))}</p>{/if}
  </section>
{/if}

<style>
  .strip {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 14px;
    margin: 0 0 12px;
    font-size: 13px;
  }
  p {
    margin: 0;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .day {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sep,
  .src {
    color: var(--mu);
  }
  .src {
    font-size: 12px;
  }
  .eco :global(svg) {
    color: var(--mu);
  }
  .eco.bad {
    color: var(--bad);
  }
  .eco.bad :global(svg) {
    color: var(--bad);
  }
</style>
