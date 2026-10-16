<!-- A room's day in one bar (Tableau §4 « Programme d’aujourd’hui », the room sheet's day bar): the --in well
     with a hairline edge and a faint mark every 3 h, the programme's comfort periods as heat blocks (decision 2:
     comfort blocks are orange), Éco the empty well. `ghost` (paused: Arrêt, Manuel, offline « dernier connu »)
     dims the blocks; `now` draws the ink marker; `times` writes a wide block's hours inside it; `ticks` adds the
     00 · 06 · 12 · 18 · 24 row. An image named by its comfort periods in words. -->
<script lang="ts">
  import type { Seg } from '$lib/program';
  import { fromMin } from '$lib/program';

  interface Props {
    segs: Seg[];
    /** The image's name (« Salon : confort 17:00–23:00 »). */
    label: string;
    /** Minute of the day for the now marker; none when null. */
    now?: number | null;
    ghost?: boolean;
    times?: boolean;
    ticks?: boolean;
    height?: number;
  }
  let { segs, label, now = null, ghost = false, times = false, ticks = false, height = 22 }: Props = $props();
  const TICKS = ['00', '06', '12', '18', '24'];
  const pct = (min: number) => `${(min / 1440) * 100}%`;
</script>

<div class="daybar">
  <div class="well" class:ghost role="img" aria-label={label} style:height="{height}px">
    {#each [180, 360, 540, 720, 900, 1080, 1260] as t (t)}<i style:left={pct(t)}></i>{/each}
    {#each segs as s, i (i)}
      <span class="blk" style:left={pct(s.start)} style:width={pct(s.end - s.start)}>{#if times && !ghost && s.end - s.start >= 240}<span
            class="tm num" aria-hidden="true">{fromMin(s.start)}–{fromMin(s.end)}</span>{/if}</span>
    {/each}
    {#if now != null}<span class="now" style:left={pct(now)}></span>{/if}
  </div>
  {#if ticks}<div class="ticks num" aria-hidden="true">{#each TICKS as t (t)}<span>{t}</span>{/each}</div>{/if}
</div>

<style>
  .daybar {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .well {
    position: relative;
    overflow: hidden;
    border-radius: 6px;
    background: var(--in);
    box-shadow: inset 0 0 0 1px var(--field);
  }
  i {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }
  .blk {
    position: absolute;
    top: 3px;
    bottom: 3px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 4px;
    background: var(--heat);
  }
  .ghost .blk {
    background: color-mix(in srgb, var(--heat) 38%, var(--in));
  }
  .tm {
    color: var(--heat-ink);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .now {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--tx);
  }
  .ticks {
    display: flex;
    justify-content: space-between;
    color: var(--fa);
    font-size: var(--fs-axis);
  }
</style>
