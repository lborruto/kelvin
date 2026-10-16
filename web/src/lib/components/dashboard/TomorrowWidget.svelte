<!-- « Demain » (Tableau §4 energy column): tomorrow's EcoWatt signal (every household) and, only when Tempo is the
     price row in force, tomorrow's Tempo colour. A signal not published yet says so, never a guess. -->
<script lang="ts">
  import type { GridView } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { ecowattTomorrow } from '$lib/dashboard';
  import Icon from '../Icon.svelte';
  import TempoDot from '../TempoDot.svelte';
  import Widget from '../Widget.svelte';

  interface Props {
    grid: GridView | null;
    todayIso: string;
    compact?: boolean;
  }
  let { grid, todayIso, compact = false }: Props = $props();
  let eco = $derived(ecowattTomorrow(grid, todayIso));
  let tempo = $derived(grid?.tempo ? grid.tempo.tomorrow.colour : undefined);
</script>

<Widget title={m.maison.tomorrow} pad={compact ? 'sm' : 'md'}>
  {#if tempo !== undefined}
    <p class="line"><TempoDot colour={tempo} /><b>{tempo ? m.maison.tempo(m.grid.colour[tempo]) : m.maison.tempo('—')}</b></p>
  {/if}
  {#if eco}
    <p class="line" class:bad={eco.level >= 3}><Icon name="alert" size={15} /><b>{m.maison.ecowatt(eco.level)}</b></p>
    <p class="sub">{m.maison.ecowattTense(eco.hours, eco.level)}</p>
  {:else}
    <p class="line"><Icon name="alert" size={15} /><b>EcoWatt</b></p><!-- i18n-ignore: brand name -->
    <p class="sub">{m.maison.ecowattUnknown}</p>
  {/if}
</Widget>

<style>
  p {
    margin: 0;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    font-size: 15px;
  }
  .line + .line {
    margin-top: 4px;
  }
  .line :global(svg) {
    flex: none;
    color: var(--mu);
  }
  .line.bad,
  .line.bad :global(svg) {
    color: var(--bad);
  }
  b {
    font-weight: 600;
  }
  .sub {
    margin-top: 2px;
    color: var(--mu);
    font-size: 13px;
  }
</style>
