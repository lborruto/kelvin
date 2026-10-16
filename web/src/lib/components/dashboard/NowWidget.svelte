<!-- What runs now (Tableau §4, « En ce moment » moved from Réglages to Maison): an absence — « Absence · 12,0 °C
     jusqu’à dim. 18:00 », which rooms (offline ones named), « Terminer » — and each chauffe temporaire — its rooms,
     temperature and end, « Arrêter ». « Absence » is cool; a running boost's glyph is heat. A boost whose
     radiators are all offline cannot be stopped (nothing would answer): its button pauses, like the room's. -->
<script lang="ts">
  import type { Override } from '$lib/api/types';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { fmtTemp, fmtTime, fmtWeekdayTime, parisTodayIso } from '$lib/format';
  import { m } from '$lib/i18n';
  import { roomName } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    overrides: Override[];
    offline: string[];
    now: number;
  }
  let { overrides, offline, now }: Props = $props();
  const end = (o: Override) => (parisTodayIso(o.ends_at * 1000) === parisTodayIso(now) ? fmtTime(o.ends_at * 1000) : fmtWeekdayTime(o.ends_at * 1000));
  const roomsOf = (ids: string[]) =>
    house.rooms.filter((r) => r.radiator_ids.some((i) => ids.includes(i))).map((r) => roomName(r)).join(', ') || m.maison.wholeHome;
  const paused = (o: Override) =>
    !house.online || o.restoring || (o.kind === 'boost' && o.radiator_ids.length > 0 && o.radiator_ids.every((id) => house.radiators[id]?.reachable === false));
</script>

<ul class="w">
  {#each overrides as o (o.id)}
    <li>
      <span class="pm {o.kind}" aria-hidden="true"><Icon name={o.kind === 'away' ? 'away' : 'flame'} size={18} /></span>
      <div class="tx">
        {#if o.kind === 'away'}
          <b><span class="cool">{m.maison.away}</span> · {m.maison.awayLine(fmtTemp(o.temperature), end(o))}</b>
          <span>{o.restoring ? m.maison.awayRestoring : offline.length ? m.maison.awayEveryBut(offline) : m.maison.awayEvery}</span>
        {:else}
          <b><span class="heat">{m.boost.title}</span> · {m.maison.boostLine(roomsOf(o.radiator_ids), fmtTemp(o.temperature), end(o))}</b>
          <span>{o.restoring ? m.maison.awayRestoring : m.maison.boostThen}</span>
        {/if}
      </div>
      <button type="button" class="btn btn-sm" aria-label={o.kind === 'away' ? m.maison.awayEndLabel : m.maison.boostStopLabel(roomsOf(o.radiator_ids))}
        aria-disabled={paused(o)} onclick={() => !paused(o) && run(() => api.cancelOverride(o.id))}>{o.kind === 'away' ? m.maison.awayEnd : m.maison.boostStop}</button>
    </li>
  {/each}
</ul>

<style>
  .w {
    display: grid;
    margin: 0;
    padding: 4px 16px;
    list-style: none;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  .pm {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--cool);
  }
  .pm.boost {
    background: var(--heat);
    color: var(--heat-ink);
  }
  .tx {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  b {
    font-weight: 600;
  }
  .cool {
    color: var(--cool);
  }
  .heat {
    color: var(--heat);
  }
  .tx > span {
    color: var(--mu);
    font-size: 13px;
  }
</style>
