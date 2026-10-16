<!-- Maison › Sources de données (direction-2 §3, DESIGN « Sources »): one 64 px row per source (Cozytouch,
     Linky, RTE EcoWatt, Tempo under a Tempo price): the Freshness mark, the name (14/600) and its state sentence
     (13 muted) on the left, the last time on the right. Each row opens its exact rows (L2: last success, error,
     next read, calls); « Détails techniques » opens them all. Replaces SourcesPanel and the Cozytouch row of the
     old Réglages. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fmtTime, fmtWeekdayTime, parisTodayIso } from '$lib/format';
  import { m } from '$lib/i18n';
  import { dur, T } from '$lib/motion';
  import type { SourceRow } from '$lib/sources';
  import { detail } from '$lib/stores/detail.svelte';
  import FicheBody from './FicheBody.svelte';
  import Freshness from './Freshness.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    rows: SourceRow[];
    now: number;
  }
  let { rows, now }: Props = $props();
  const uid = $props.id();
  // Once, before first paint: the preference opens every row; afterwards each row is the user's.
  let open = $state<Record<string, boolean>>(untrack(() => (detail.on ? Object.fromEntries(rows.map((r) => [r.key, true])) : {})));
  const time = (ms: number) => (parisTodayIso(ms) === parisTodayIso(now) ? fmtTime(ms) : fmtWeekdayTime(ms));
</script>

<ul class="sources" style:--slide="{dur(T.enter)}ms">
  {#each rows as r (r.key)}
    {@const isOpen = !!open[r.key]}
    <li>
      <button type="button" class="row" aria-expanded={isOpen} aria-controls="{uid}-{r.key}" onclick={() => (open[r.key] = !isOpen)}>
        <span class="mark"><Freshness state={r.state} /></span>
        <span class="who">
          <span class="name">{r.name}</span>
          <span class="text" class:bad={r.bad}>{r.text}</span>
        </span>
        <span class="at num">{r.at ? time(r.at) : '—'}</span>
        <span class="chev" class:open={isOpen} aria-hidden="true"><Icon name="chevron" size={16} /></span>
      </button>
      <div id="{uid}-{r.key}" class="region" hidden={isOpen ? undefined : 'until-found'} onbeforematch={() => (open[r.key] = true)}>
        <FicheBody rows={r.rows} />
      </div>
    </li>
  {/each}
</ul>

<style>
  .sources {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    border-bottom: 1px solid var(--line);
  }
  li:last-child {
    border-bottom: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 8px 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .mark {
    display: inline-flex;
  }
  .who {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-size: 14px;
    font-weight: 600;
  }
  .text {
    font-size: 13px;
    color: var(--mu);
    overflow-wrap: anywhere;
  }
  .text.bad {
    color: var(--bad);
  }
  .at {
    font-size: 13px;
    color: var(--mu);
  }
  .chev {
    display: inline-flex;
    color: var(--fa);
    transition: transform var(--slide) var(--ease-out);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .region {
    padding: 0 0 12px 20px;
    font-size: 13px;
  }
</style>
