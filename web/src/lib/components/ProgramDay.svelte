<script lang="ts">
  import Icon from './Icon.svelte';
  import { addSlot, fromMin, moveSlot, removeSlot, resizeSlot, toMin, validateDay, type Seg } from '$lib/program';

  interface Props {
    label: string;
    segs: Seg[];
    nowMinute?: number | null;
    pending?: boolean;
    onchange: (segs: Seg[]) => void;
  }
  let { label, segs, nowMinute = null, pending = false, onchange }: Props = $props();

  let bar = $state<HTMLDivElement>();
  let drag: { i: number; kind: 'move' | 'start' | 'end'; origin: number; base: Seg[] } | null = null;
  let moved = false;
  let error = $derived(validateDay(segs));

  const minuteAt = (clientX: number) => {
    const r = bar!.getBoundingClientRect();
    return r.width ? ((clientX - r.left) / r.width) * 1440 : 0;
  };
  const pct = (m: number) => `${(m / 1440) * 100}%`;

  function down(e: PointerEvent, i: number, kind: 'move' | 'start' | 'end') {
    e.stopPropagation();
    if (pending) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = { i, kind, origin: minuteAt(e.clientX), base: segs };
    moved = false;
  }
  function move(e: PointerEvent) {
    if (!drag || pending) return;
    const m = minuteAt(e.clientX);
    moved = true;
    onchange(drag.kind === 'move' ? moveSlot(drag.base, drag.i, m - drag.origin) : resizeSlot(drag.base, drag.i, drag.kind, m));
  }
  function up() {
    drag = null;
  }
  function barDown() {
    moved = false;
  }
  function addAt(e: MouseEvent) {
    if (pending) return;
    if (moved) {
      moved = false;
      return;
    }
    const next = addSlot(segs, minuteAt(e.clientX));
    if (next) onchange(next);
  }
  function addFirstFree() {
    if (pending) return;
    for (const m of [420, 1080, 720, 0, 60, 180, 300, 540, 840, 960, 1200, 1320]) {
      const next = addSlot(segs, m);
      if (next) return onchange(next);
    }
  }
  function setTime(el: HTMLInputElement, i: number, edge: 'start' | 'end') {
    const value = el.value;
    if (pending || !segs[i]) return;
    let shown = segs[i][edge];
    if (/^\d{2}:\d{2}$/.test(value)) {
      const next = resizeSlot(segs, i, edge, toMin(value));
      shown = next[i]?.[edge] ?? shown;
      onchange(next);
    }
    // Reset the field to the model so a rejected or clamped value does not linger.
    el.value = fromMin(shown);
  }
  function key(e: KeyboardEvent, i: number) {
    if (pending) return;
    const delta = e.key === 'ArrowRight' ? 15 : e.key === 'ArrowLeft' ? -15 : 0;
    if (delta) {
      e.preventDefault();
      onchange(moveSlot(segs, i, delta));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onchange(removeSlot(segs, i));
    }
  }
</script>

<div class="day">
  <div class="head"><span class="label">{label}</span></div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="bar" class:pending data-testid="bar-{label}" bind:this={bar} onclick={addAt} onpointerdown={barDown} onpointermove={move}
    onpointerup={up} onpointercancel={up}>
    {#each [6, 12, 18] as h (h)}<span class="tick" style:left={pct(h * 60)}></span>{/each}
    {#each segs as s, i (i)}
      <div class="block" role="button" tabindex="0" aria-label="{label} {fromMin(s.start)}–{fromMin(s.end)}"
        style:left={pct(s.start)} style:width={pct(s.end - s.start)}
        onpointerdown={(e) => down(e, i, 'move')} onkeydown={(e) => key(e, i)}
        onclick={(e) => e.stopPropagation()}>
        <span class="handle start" onpointerdown={(e) => down(e, i, 'start')} aria-hidden="true"></span>
        <span class="handle end" onpointerdown={(e) => down(e, i, 'end')} aria-hidden="true"></span>
      </div>
    {/each}
    {#if nowMinute != null}<span class="now" style:left={pct(nowMinute)}></span>{/if}
  </div>
  <ul class="slots">
    {#each segs as s, i (i)}
      <li>
        <input type="time" step="900" disabled={pending} aria-label="{label}, plage {i + 1}, début" value={fromMin(s.start)}
          onchange={(e) => setTime(e.currentTarget, i, 'start')} />
        <span aria-hidden="true">–</span>
        <input type="time" step="900" disabled={pending} aria-label="{label}, plage {i + 1}, fin" value={fromMin(s.end)}
          onchange={(e) => setTime(e.currentTarget, i, 'end')} />
        <button type="button" disabled={pending} aria-label="Supprimer la plage {i + 1} du {label}" onclick={() => onchange(removeSlot(segs, i))}><Icon name="x" size={16} /></button>
      </li>
    {/each}
    <li>
      <button type="button" class="add" disabled={pending || segs.length >= 3} aria-label="Ajouter une plage le {label}" onclick={addFirstFree}><Icon name="plus" size={16} />Plage</button>
    </li>
  </ul>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .day {
    display: grid;
    gap: 6px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .label {
    font-weight: 600;
    font-size: 13px;
  }
  .bar {
    position: relative;
    height: 32px;
    border-radius: 6px;
    background: var(--in);
    border: 1px solid var(--line);
    cursor: copy;
    touch-action: pan-y;
  }
  .bar.pending {
    cursor: default;
  }
  .pending .block {
    background: transparent;
    border: 1.5px dashed var(--mu);
    cursor: default;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }
  .block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--warm) 55%, transparent);
    cursor: grab;
    touch-action: none;
  }
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
    touch-action: none;
  }
  .handle.start {
    left: -4px;
  }
  .handle.end {
    right: -4px;
  }
  .now {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    background: var(--tx);
  }
  .slots {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: center;
  }
  .slots li {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  input {
    min-height: 44px;
    padding: 0 6px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 6px;
    font-variant-numeric: tabular-nums;
  }
  .slots button {
    display: inline-grid;
    place-items: center;
    min-height: 44px;
    min-width: 44px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--s2);
    cursor: pointer;
  }
  .slots button.add {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px 0 10px;
  }
  .slots button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .error {
    margin: 0;
    color: var(--bad);
    font-size: 12px;
  }
</style>
