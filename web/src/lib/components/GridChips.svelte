<!-- The grid signals on Énergie's context row (direction-2 §2 « GridChips », from GridStrip): the Tempo pair as two
     chips « Aujourd’hui ● Bleu » « Demain ● Rouge » (only under a Tempo tariff), an EcoWatt chip with the alert glyph
     (bad text at level 3). Each chip is a Fig: its Fiche holds every signal with RTE's fetch time (the time no longer
     sits on the page). Pièces keeps GridStrip. -->
<script lang="ts">
  import { fmtTime, parisTodayIso } from '$lib/format';
  import { stripLines } from '$lib/grid';
  import { m } from '$lib/i18n';
  import { provenance } from '$lib/provenance';
  import { grid } from '$lib/stores/grid.svelte';
  import Fig from './Fig.svelte';
  import type { FicheRow } from './FicheBody.svelte';
  import Icon from './Icon.svelte';
  import TempoDot from './TempoDot.svelte';

  // A tab left open past midnight: « demain » becomes « aujourd’hui » without waiting for the next fetch.
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  let lines = $derived(stripLines(grid.view, parisTodayIso(now)));

  let tempoText = $derived.by(() => {
    const t = lines?.tempo;
    if (!t) return null;
    return {
      today: t.today ? m.grid.colour[t.today] : m.energyUi.unknownColour,
      tomorrow: t.tomorrow ? m.grid.colour[t.tomorrow] : m.energyUi.notYet(t.expectedAt ?? '11:00')
    };
  });
  let ecoText = (e: { level: 2 | 3; when: 'today' | 'tomorrow'; hours: string | null }) =>
    m.grid.ecowatt(e.level, e.when === 'today' ? m.grid.whenToday : m.grid.whenTomorrow, e.hours);

  // One Fiche for every chip: what the grid says today and tomorrow, then where it comes from.
  let rows = $derived.by((): FicheRow[] => {
    if (!lines) return [];
    const out: FicheRow[] = [];
    if (tempoText) {
      out.push({ label: m.energyUi.tempoToday, value: tempoText.today }, { label: m.energyUi.tempoTomorrow, value: tempoText.tomorrow });
    }
    for (const e of lines.ecowatt) out.push({ label: m.energyUi.ecowatt, value: ecoText(e) });
    if (lines.updatedAt != null) out.push({ label: m.energyUi.fetched, value: fmtTime(lines.updatedAt * 1000) });
    return out;
  });
  let prov = $derived(
    lines ? provenance(lines.tempo ? 'tempo' : 'rte-ecowatt', { at: lines.updatedAt != null ? lines.updatedAt * 1000 : null }, now) : null
  );
</script>

{#if lines}
  <ul class="chips" aria-label={m.grid.label}>
    {#if lines.tempo && tempoText}
      <li>
        <Fig value={`${m.grid.today} ${tempoText.today}`} title={m.grid.label} {rows} provenance={prov} class="chip">
          <span class="when">{m.grid.today}</span><TempoDot colour={lines.tempo.today} /><span>{tempoText.today}</span>
        </Fig>
      </li>
      <li>
        <Fig value={`${m.grid.tomorrow} ${tempoText.tomorrow}`} title={m.grid.label} {rows} provenance={prov} class="chip">
          <span class="when">{m.grid.tomorrow}</span><TempoDot colour={lines.tempo.tomorrow} /><span>{tempoText.tomorrow}</span>
        </Fig>
      </li>
    {/if}
    {#each lines.ecowatt as e (e.date)}
      <li class="eco" class:bad={e.level === 3}>
        <Icon name="alert" size={14} />
        <Fig value={ecoText(e)} title={m.grid.label} {rows} provenance={prov} class="chip" />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 14px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--tx);
    min-width: 0;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    min-height: 24px;
  }
  li :global(.fig.chip) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    white-space: nowrap;
  }
  .when {
    color: var(--mu);
  }
  .eco :global(svg) {
    flex: none;
    color: var(--mu);
  }
  .eco.bad {
    color: var(--bad);
  }
  .eco.bad :global(svg) {
    color: var(--bad);
  }
</style>
