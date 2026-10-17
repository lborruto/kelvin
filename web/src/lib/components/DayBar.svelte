<!-- The one day bar (DESIGN « DayBar »): the --in well with its field edge, gridlines every 3 h, the comfort
     periods as heat blocks (decision 2), Éco the empty well, the ink now marker.
     Editable (`day` + `onchange`: Programme's day editor): blocks are focusable, draggable and resizable in
     the room's steps, a tap on the well adds a period, the block being adjusted keeps two ink handles and a drag
     shows the time it lands on; `pending` / `locked` make it inert (locked: hatched, an unrecognised day a
     labelled picture).
     Read-only (no `onchange`: Maison's « Programme d’aujourd’hui », the room sheet): one picture named by `label`;
     `ghost` dims the blocks (paused: Arrêt, Manuel, absence, offline « dernier connu »), `times` writes a wide
     block's hours inside it, `ticks` adds the 00 · 06 · 12 · 18 · 24 row. -->
<script lang="ts">
  import type { Day, DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { addSlot, DEFAULT_STEP, fromMin, moveSlot, removeSlot, resizeSlot, type Seg } from '$lib/program';

  interface Props {
    segs: Seg[];
    /** The day being edited; with `onchange` the bar is the editor's. */
    day?: Day;
    onchange?: (segs: Seg[]) => void;
    /** Minute of the day for the now marker; none when null. */
    now?: number | null;
    pending?: boolean;
    /** Hour gridlines and the labels under the bar (3 h on desktop, 6 h on a phone). */
    step?: 3 | 6;
    /** The room's programme step in minutes (drag, tap and arrow keys move by it). */
    slotStep?: number;
    /** QW8: shown, never edited (re-sent as read). */
    locked?: DayLock | null;
    /** The well's height (40 beside the agenda, 44 in the phone day view; 14–26 read-only). */
    height?: number;
    /** Read-only: the picture's name (« Salon : confort 17:00–23:00 »). */
    label?: string;
    /** Read-only: the programme is not running (blocks dimmed). */
    ghost?: boolean;
    /** Read-only: write a block's hours inside it when they fit. */
    times?: boolean;
    /** Read-only: the 00 · 06 · 12 · 18 · 24 row under the bar. */
    ticks?: boolean;
  }
  let {
    segs,
    day,
    onchange,
    now = null,
    pending = false,
    step,
    slotStep = DEFAULT_STEP,
    locked = null,
    height = 40,
    label: name = '',
    ghost = false,
    times = false,
    ticks = false
  }: Props = $props();
  const uid = $props.id();
  let editable = $derived(!!onchange && !!day);
  let label = $derived(day ? m.days[day] : '');
  // A pending send, a locked day or a read-only bar: nothing here edits it.
  let inert = $derived(pending || !!locked || !editable);
  let hourStep = $derived(step ?? (editable ? 3 : 6));
  let showHours = $derived(editable || ticks);
  let dragging = $state(false);
  let active = $state<number | null>(null);
  let width = $state(0);

  let bar = $state<HTMLDivElement>();
  let drag: { i: number; kind: 'move' | 'start' | 'end'; origin: number; base: Seg[] } | null = null;
  let moved = false;
  let hours = $derived(Array.from({ length: 24 / hourStep + 1 }, (_, i) => i * hourStep));
  // Gridlines every 3 h whatever the labels' step.
  const TICKS = [3, 6, 9, 12, 15, 18, 21];
  // While a block or an edge is dragged: the time it lands on, over the bar (« fin 23:30 »).
  let bubble = $state<{ at: number; text: string } | null>(null);

  const minuteAt = (clientX: number) => {
    const r = bar!.getBoundingClientRect();
    return r.width ? ((clientX - r.left) / r.width) * 1440 : 0;
  };
  const pct = (min: number) => `${(min / 1440) * 100}%`;
  // A block's times are written inside it when they fit (DESIGN « DayBar »).
  const fits = (s: Seg) => (editable || (times && !ghost)) && ((s.end - s.start) / 1440) * width >= 76;

  function down(e: PointerEvent, i: number, kind: 'move' | 'start' | 'end') {
    e.stopPropagation();
    if (inert) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = { i, kind, origin: minuteAt(e.clientX), base: segs };
    dragging = true;
    active = i;
    moved = false;
  }
  function move(e: PointerEvent) {
    if (!drag || inert) return;
    const at = minuteAt(e.clientX);
    moved = true;
    const next =
      drag.kind === 'move'
        ? moveSlot(drag.base, drag.i, at - drag.origin, slotStep)
        : resizeSlot(drag.base, drag.i, drag.kind, at, slotStep);
    const s = next[drag.i];
    if (s)
      bubble =
        drag.kind === 'start'
          ? { at: s.start, text: m.program.bubbleStart(fromMin(s.start)) }
          : drag.kind === 'end'
            ? { at: s.end, text: m.program.bubbleEnd(fromMin(s.end)) }
            : { at: (s.start + s.end) / 2, text: `${fromMin(s.start)}–${fromMin(s.end)}` };
    onchange?.(next);
  }
  $effect(() => {
    if (active != null && active >= segs.length) active = null;
  });
  // The last block touched keeps its handles (the one being adjusted), until another is.
  function up() {
    drag = null;
    dragging = false;
    bubble = null;
  }
  function barDown() {
    moved = false;
  }
  function addAt(e: MouseEvent) {
    if (inert) return;
    if (moved) {
      moved = false;
      return;
    }
    const next = addSlot(segs, minuteAt(e.clientX), 120, slotStep);
    if (next) onchange?.(next);
  }
  function key(e: KeyboardEvent, i: number) {
    if (inert) return;
    const delta = e.key === 'ArrowRight' ? slotStep : e.key === 'ArrowLeft' ? -slotStep : 0;
    if (delta) {
      e.preventDefault();
      onchange?.(moveSlot(segs, i, delta, slotStep));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onchange?.(removeSlot(segs, i));
    }
  }
</script>

<div class="day" style:--bar-h="{height}px">
  {#if editable}
    <span class="visually-hidden" id="{uid}-hint">{m.program.blockHint}</span>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="bar" class:pending class:dragging class:locked={!!locked} class:unknown={locked === 'unrecognised'}
      role={locked === 'unrecognised' ? 'img' : undefined}
      aria-label={locked === 'unrecognised' ? m.program.unknownDayLabel(label) : undefined} data-testid="bar-{day}" bind:this={bar}
      bind:clientWidth={width} onclick={addAt} onpointerdown={barDown} onpointermove={move} onpointerup={up} onpointercancel={up}>
      {#each TICKS as h (h)}<span class="tick" style:left={pct(h * 60)}></span>{/each}
      {#each locked === 'unrecognised' ? [] : segs as s, i (i)}
        <div class="block" class:active={active === i} role="button" tabindex={locked ? -1 : 0} aria-roledescription={m.program.slotRole}
          aria-describedby="{uid}-hint" aria-label="{label} {fromMin(s.start)}–{fromMin(s.end)}"
          style:left={pct(s.start)} style:width={pct(s.end - s.start)}
          onpointerdown={(e) => down(e, i, 'move')} onkeydown={(e) => key(e, i)} onfocus={() => !inert && (active = i)}
          onclick={(e) => e.stopPropagation()}>
          {#if fits(s)}<span class="times num" aria-hidden="true">{fromMin(s.start)}–{fromMin(s.end)}</span>{/if}
          {#if !locked}
            <span class="handle start" onpointerdown={(e) => down(e, i, 'start')} aria-hidden="true"></span>
            <span class="handle end" onpointerdown={(e) => down(e, i, 'end')} aria-hidden="true"></span>
          {/if}
        </div>
      {/each}
      {#if now != null}<span class="now" style:left={pct(now)}></span>{/if}
      <!-- Near an end of the day the bubble leans inwards, so it never leaves the bar's width. -->
      {#if bubble}<span class="bubble num" class:lead={bubble.at < 240} class:trail={bubble.at > 1200} aria-hidden="true"
          style:left={pct(bubble.at)}>{bubble.text}</span>{/if}
    </div>
  {:else}
    <div class="bar ro" class:ghost role="img" aria-label={name} bind:clientWidth={width}>
      {#each TICKS as h (h)}<span class="tick" style:left={pct(h * 60)}></span>{/each}
      {#each segs as s, i (i)}
        <span class="block" style:left={pct(s.start)} style:width={pct(s.end - s.start)}>{#if fits(s)}<span
              class="times num" aria-hidden="true">{fromMin(s.start)}–{fromMin(s.end)}</span>{/if}</span>
      {/each}
      {#if now != null}<span class="now" style:left={pct(now)}></span>{/if}
    </div>
  {/if}
  {#if showHours}
    <div class="hours num" aria-hidden="true">
      {#each hours as h (h)}<span style:left={pct(h * 60)}>{String(h).padStart(2, '0')}</span>{/each}
    </div>
  {/if}
</div>

<style>
  /* Tableau day bar: the input well (--in, field edge, 10 px at 40 px tall, less on a short bar), gridlines every
     3 h, comfort blocks heat at 80 % (8 px) with their times in heat ink when they fit; the block being adjusted
     shows two ink handles and an ink edge; a drag shows the time it lands on in an ink bubble over the bar. */
  .day {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .bar {
    position: relative;
    height: var(--bar-h);
    border-radius: min(10px, calc(var(--bar-h) / 3.5));
    background: var(--in);
    border: 1px solid var(--field);
    cursor: copy;
    touch-action: pan-y;
  }
  /* While a block is dragged, the page must not scroll under the finger. */
  .bar.dragging {
    touch-action: none;
  }
  .bar.pending,
  .bar.locked {
    cursor: default;
  }
  .bar.locked {
    background: repeating-linear-gradient(45deg, var(--in) 0 4px, color-mix(in srgb, var(--fa-mark) 55%, var(--in)) 4px 5.5px);
  }
  .tick {
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: 1px;
    background: color-mix(in srgb, var(--field) 35%, transparent);
  }
  .block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: min(8px, calc(var(--bar-h) / 5));
    background: color-mix(in srgb, var(--heat) 80%, var(--in));
    cursor: grab;
    touch-action: none;
  }
  /* Read-only: a picture, nothing to grab; its marker stays inside the well. */
  .bar.ro {
    overflow: hidden;
    cursor: default;
  }
  .ro .block {
    cursor: default;
  }
  .ro .now {
    top: 0;
    bottom: 0;
  }
  .ghost .block {
    background: color-mix(in srgb, var(--heat) 38%, var(--in));
  }
  .block.active {
    overflow: visible;
    box-shadow: 0 0 0 2px var(--tx);
  }
  .locked .block {
    background: color-mix(in srgb, var(--heat) 45%, var(--in));
    cursor: default;
  }
  .pending .block {
    background: transparent;
    outline: 1.5px dashed var(--mu);
    outline-offset: -1.5px;
    box-shadow: none;
    cursor: default;
  }
  /* Times in a block: heat ink on the block (≥ 5:1), above the now marker so a marker never cuts them. */
  .times {
    position: relative;
    z-index: 2;
    padding: 0 3px;
    font-size: 11px;
    font-weight: 600;
    color: var(--heat-ink);
    white-space: nowrap;
    pointer-events: none;
  }
  .locked .times {
    color: var(--tx);
  }
  .pending .times {
    color: var(--mu);
  }
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
    touch-action: none;
  }
  /* A larger invisible grip than the visible edge, for fingers. */
  .handle::before {
    content: '';
    position: absolute;
    inset: -6px -8px;
  }
  /* The ink handles show on the block being adjusted, pointed at or focused. */
  .handle::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 5px;
    height: 18px;
    margin-top: -9px;
    border-radius: 3px;
    background: var(--tx);
    opacity: 0;
    transition: opacity var(--t-state) ease;
  }
  .handle.start::after {
    left: -2.5px;
  }
  .handle.end::after {
    right: -2.5px;
  }
  .block:focus-visible .handle::after,
  .block.active .handle::after {
    opacity: 1;
  }
  @media (hover: hover) {
    .block:hover .handle::after {
      opacity: 1;
    }
  }
  .handle.start {
    left: 0;
  }
  .handle.end {
    right: 0;
  }
  .now {
    position: absolute;
    z-index: 1;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--tx);
    pointer-events: none;
  }
  .bubble {
    position: absolute;
    z-index: 3;
    bottom: calc(100% + 8px);
    padding: 3px 8px;
    border-radius: 8px;
    background: var(--tx);
    color: var(--bg);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .bubble.lead {
    transform: translateX(-12px);
  }
  .bubble.trail {
    transform: translateX(calc(-100% + 12px));
  }
  .hours {
    position: relative;
    height: 15px;
    font-size: var(--fs-axis);
    color: var(--fa);
  }
  .hours span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
  }
  .hours span:first-child {
    transform: none;
  }
  .hours span:last-child {
    transform: translateX(-100%);
  }
  @media (max-width: 599px) {
    .handle::before {
      inset: -6px -12px;
    }
  }
</style>
