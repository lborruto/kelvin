<!-- « Programme d’aujourd’hui » (Tableau §4): one day bar per room with a programme, the now marker and what comes
     next (« → Éco 23:00 »). A room not in Programme shows its day dimmed « en pause »; an offline room its last
     known day, faint, « dernier connu ». Desktop: a widget spanning the room columns; phone: a grouped list. -->
<script lang="ts">
  import type { Room } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { nextLevelText, segsText, todaySegs } from '$lib/dashboard';
  import { ROUTES } from '$lib/paths';
  import { roomName } from '$lib/setup';
  import { isOffline, sharedProgram } from '$lib/status';
  import { house } from '$lib/stores/house.svelte';
  import { parisMinuteOfDay } from '$lib/time';
  import { capsOf } from '$lib/capabilities';
  import DayBar from '../DayBar.svelte';
  import Icon from '../Icon.svelte';

  interface Props {
    now: number;
    phone?: boolean;
  }
  let { now, phone = false }: Props = $props();
  const uid = $props.id();

  let rows = $derived(
    house.rooms
      .map((room) => {
        const rads = house.roomRadiators(room.id);
        if (!rads.some((r) => capsOf(r).program)) return null;
        const program = sharedProgram(rads) ?? rads.find((r) => capsOf(r).program)?.program ?? null;
        const offline = isOffline(rads);
        const mode = house.roomExpected(room.id).mode ?? room.mode;
        const segs = todaySegs(program, now);
        const name = roomName(room);
        const away = house.overrideFor(room.id);
        const running = mode === 'program' && !offline && !away;
        return {
          room,
          name,
          offline,
          segs,
          ghost: !running,
          note: offline ? m.maison.progLastKnown : running ? (nextLevelText(program, now) ?? '') : m.maison.paused,
          label: segs.length ? m.maison.dayBar(name, segsText(segs)) : m.maison.dayBarEmpty(name)
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => Number(a.offline) - Number(b.offline))
  );
  let minute = $derived(parisMinuteOfDay(now));
</script>

{#if rows.length}
  <section class="tp" class:phone aria-labelledby="{uid}-h">
    {#if phone}
      <div class="areah"><h2 id="{uid}-h">{m.maison.todayProgram}</h2><a class="go" href={ROUTES.schedule} aria-label={m.nav.schedule}><Icon name="chevron" size={16} /></a></div>
      <div class="grp list">
        {#each rows as r (r.room.id)}
          <div class="prow">
            <div class="top"><span class:faint={r.offline}>{r.name}</span><span class="note">{r.note}</span></div>
            <DayBar segs={r.segs} label={r.label} ghost={r.ghost} now={r.offline ? null : minute} height={18} />
          </div>
        {/each}
      </div>
    {:else}
      <div class="w">
        <div class="head"><h2 id="{uid}-h">{m.maison.todayProgram}</h2><a class="lnk" href={ROUTES.schedule}>{m.nav.schedule}<Icon name="chevron" size={13} /></a></div>
        {#each rows as r (r.room.id)}
          <div class="drow">
            <span class="n" class:faint={r.offline}>{r.name}</span>
            <DayBar segs={r.segs} label={r.label} ghost={r.ghost} now={r.offline ? null : minute} times height={22} />
            <span class="note">{r.note}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}

<style>
  .w {
    padding: 14px 18px;
    border-radius: var(--r-widget);
    background: var(--s1);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .lnk {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--mu);
    font-size: var(--fs-label);
    font-weight: 600;
    text-decoration: none;
  }
  .lnk::before {
    content: '';
    position: absolute;
    inset: -14px -6px;
  }
  .drow {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr) 110px;
    align-items: center;
    gap: 14px;
    margin: 10px 0;
  }
  .n {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .faint {
    color: var(--fa);
  }
  .go {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 24px;
    margin-right: -12px;
    color: var(--mu);
  }
  .list {
    padding: 6px 14px;
  }
  .prow {
    padding: 8px 0;
  }
  .top {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13.5px;
  }
</style>
