<script lang="ts">
  import type { CurveSummary, EnergyDay } from '$lib/api/types';
  import { SERIES, type View } from '$lib/energy';
  import { fmtEurExact, fmtKwhExact, fmtPct, fmtTime, fmtW } from '$lib/format';
  import { locale, m } from '$lib/i18n';
  import { baseLoad, peakShare } from '$lib/power';
  import Disclosure from './Disclosure.svelte';

  /** The skeleton's stand-in texts: never shown (transparent, aria-hidden), they only give the bars a complete
   * day's line breaks, so the skeleton wraps as the figures will at every width. */
  let GHOST = $derived({
    peak: fmtW(6840),
    when: m.power.range('19:00', '19:30'),
    kva: m.power.kva(12),
    share: m.power.share(fmtPct(0.57))
  });
  let dayName = $derived(
    new Intl.DateTimeFormat(locale.intl, { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })
  );

  interface Props {
    view: View;
    /** The Courbe's day: Jour's figures, and the subscribed power. Null while it loads. */
    day: EnergyDay | null;
    /** Semaine: the period's figures over its complete curve days. */
    week: CurveSummary | null;
    /** The day could not be loaded (the Courbe offers « Réessayer »). */
    failed?: boolean;
    class?: string;
  }
  let { view, day, week, failed = false, class: cls = '' }: Props = $props();

  // Jour waits on its day for every figure; Semaine only for the subscribed power.
  let waiting = $derived(!day && !failed);
  let kva = $derived(day?.power.kva ?? null);
  let src = $derived.by(() => {
    if (view === 'week') return week && week.peak_w != null ? { ...week, days: week.complete_days } : null;
    return day?.complete && day.power.peak_w != null ? { ...day.power, days: 1 } : null;
  });
  let share = $derived(peakShare(src?.peak_w, kva));
  let floor = $derived(view === 'day' && day ? baseLoad(src?.base_w_p10, day.intervals) : null);
  let floorWeek = $derived(view === 'week' && src?.base_w_p10 != null ? (src.base_w_p10 * 24) / 1000 : null);
  // The half-hour itself (« 06:30–07:00 »): on the autumn DST day the repeated hour stays true.
  let when = $derived(
    src?.peak_ts != null
      ? `${view === 'week' ? `${dayName.format(new Date(src.peak_ts * 1000))}, ` : ''}${m.power.range(
          fmtTime(src.peak_ts * 1000),
          fmtTime((src.peak_ts + 1800) * 1000)
        )}`
      : ''
  );
  let why = $derived(view === 'day' && failed ? m.power.failed : view === 'week' ? m.power.noWeek : m.power.noDay);
</script>

{#snippet kvaGhost()}
  <p class="line skeleton inset">{GHOST.kva}</p>
  <div class="meter"></div>
  <p class="line skeleton inset">{GHOST.share}</p>
{/snippet}

<!-- Analyse card (direction-2 §2): the peak against the subscribed power in L0; the baseload, the night minimum, the
     10 % line, the background consumption and the kVA assumption one « Détails » away (`detail`). -->
<section class="panel {cls}" aria-busy={view === 'day' && waiting}>
  <h3>{m.power.title}</h3>
  {#if view === 'day' && waiting}
    <!-- The loaded day's own structure, each line a skeleton bar of its text: same breaks, same height. -->
    <div class="ghost" aria-hidden="true">
      <dl class="figs">
        <div>
          <dt>{m.power.peak}</dt>
          <dd><strong class="num big skeleton inset">{GHOST.peak}</strong><span class="num when skeleton inset">{GHOST.when}</span></dd>
        </div>
      </dl>
      {@render kvaGhost()}
      <!-- The « Détails » row to come. -->
      <div class="more-sk"></div>
    </div>
  {:else}
    <dl class="figs">
      <div>
        <dt>{m.power.peak}</dt>
        <!-- {' '}: Svelte trims a block's leading space. -->
        <dd><strong class="num big">{fmtW(src?.peak_w)}</strong>{#if when}{' '}<span class="num when">{when}</span>{/if}</dd>
      </div>
    </dl>
    {#if src && waiting}
      <div class="ghost" aria-hidden="true">{@render kvaGhost()}</div>
    {:else if src && kva != null}
      <p class="muted line">{m.power.kva(kva)}</p>
      {#if share != null}
        <div class="meter" aria-hidden="true"><span style:transform="scaleX({Math.min(1, share)})" style:background={SERIES.home}></span></div>
        <p class="line">{m.power.share(fmtPct(share))}</p>
      {/if}
    {/if}
    {#if !src}<p class="muted note">{why}</p>{/if}
    {#if src}
      <Disclosure title={m.energyUi.details} meta={m.energyUi.powerMeta} detail class="more">
        <p class="muted note">{m.power.instant}</p>
        {#if kva != null && share != null}<p class="muted note">{m.power.pf}</p>{/if}
        <dl class="figs base">
          <div>
            <dt>{m.power.base}</dt>
            <dd><strong class="num big">{fmtW(src.base_w_p10)}</strong></dd>
          </div>
        </dl>
        {#if src.night_min_w != null}<p class="muted line num">{m.power.night(fmtW(src.night_min_w))}</p>{/if}
        {#if src.base_w_p10 != null}<p class="muted line num">{m.power.p10(fmtW(src.base_w_p10))}</p>{/if}
        {#if floor?.kwh != null}
          <p class="line num">{m.power.floorDay(fmtKwhExact(floor.kwh), floor.eur != null ? fmtEurExact(floor.eur) : null)}</p>
        {:else if floorWeek != null}
          <p class="line num">{m.power.floorWeek(fmtKwhExact(floorWeek))}</p>
          <p class="muted note">{m.power.days(src.days)}</p>
        {/if}
      </Disclosure>
    {/if}
  {/if}
</section>

<style>
  .figs {
    margin: 0;
  }
  .figs div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0 12px;
  }
  dt {
    color: var(--mu);
    font-size: 13px;
  }
  dd {
    margin: 0 0 0 auto;
    font-size: 13px;
    text-align: right;
  }
  .big {
    font-size: 20px;
    font-weight: 600;
  }
  /* The peak's day and time sit under its figure, right-aligned, so a weekday never splits the row. */
  .when {
    display: block;
    color: var(--mu);
    font-size: 12px;
  }
  .base {
    margin-top: 10px;
  }
  .more-sk {
    height: 45px;
    margin-top: 6px;
  }
  .panel :global(.disclosure.more) {
    margin-top: 6px;
    border-top: 1px solid var(--line);
  }
  .line {
    font-size: 13px;
    margin: 6px 0 0;
  }
  .note {
    font-size: 12px;
    margin: 4px 0 0;
  }
  /* Skeletons in the figures' own boxes: each bar is its text's box, the text itself transparent. */
  .ghost .skeleton {
    width: fit-content;
    max-width: 100%;
    color: transparent;
    user-select: none;
  }
  /* overflow: clip (not hidden) keeps the inline-block on its text baseline, so the row is as tall as the figure's. */
  .ghost .big.skeleton {
    display: inline-block;
    overflow: clip;
  }
  .ghost .when.skeleton {
    margin-left: auto;
  }
  .meter {
    height: 6px;
    margin-top: 10px;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  .meter span {
    display: block;
    width: 100%;
    height: 100%;
    transform-origin: left;
    transition: transform var(--t-data) var(--ease-out);
  }
  @media (prefers-reduced-motion: reduce) {
    .meter span {
      transition: none;
    }
  }
</style>
