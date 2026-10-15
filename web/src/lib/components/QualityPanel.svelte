<script lang="ts">
  import type { EnergyGroup, EnergyReport, Quality, SplitMethod } from '$lib/api/types';
  import { bucketLabel, bucketSpan } from '$lib/energy';
  import { fmtDateLong, fmtPct1 } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ANCHORS } from '$lib/paths';
  import Icon from './Icon.svelte';

  type Mark = 'full' | 'partial' | 'missing' | 'none';
  interface Props {
    /** The selected period's buckets: one strip cell each (in Jour, the day's alone, not the 7 bars). */
    buckets: EnergyReport['buckets'];
    group: EnergyGroup;
    /** The selected period's quality block (`period.quality`). */
    quality: Quality;
    class?: string;
  }
  let { buckets, group, quality, class: cls = '' }: Props = $props();
  const uid = $props.id();
  let open = $state(false);

  // Opened by a link to #quality (the « est. » footnotes) or a page reached at that anchor.
  $effect(() => {
    const check = () => {
      if (location.hash === `#${ANCHORS.quality}`) open = true;
    };
    const onclick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(`a[href="#${ANCHORS.quality}"]`)) open = true;
    };
    check();
    window.addEventListener('hashchange', check);
    window.addEventListener('click', onclick, true);
    return () => {
      window.removeEventListener('hashchange', check);
      window.removeEventListener('click', onclick, true);
    };
  });

  type Bucket = EnergyReport['buckets'][number];
  /** Nothing was expected (not yet published, before the history): no mark rather than a false gap. A bucket is
   * judged on the days expected so far (`present_days` + `missing_days`), never on days still to come, so a running
   * month with every elapsed day reads complete so far. */
  const expected = (b: Bucket) => b.present_days > 0 || b.missing_days > 0;
  const linky = (b: Bucket): Mark => (!expected(b) ? 'none' : b.missing_days === 0 ? 'full' : b.present_days > 0 ? 'partial' : 'missing');
  // The curve, like the radiators, is expected from its first day on (`curve_since`); before it a bucket stays blank.
  // A bucket that starts before that day holds a curve for part of it at most.
  const curve = (b: Bucket): Mark => {
    const since = quality.curve_since;
    const span = bucketSpan(b.key, group);
    if (!expected(b) || since == null || span.to <= since) return 'none';
    const n = b.curve?.complete_days ?? 0;
    if (n === 0) return 'missing';
    return n >= b.present_days && span.from >= since ? 'full' : 'partial';
  };
  // Radiators were expected from their first recording on (`radiators_since`); before it a bucket stays blank.
  // A bucket holding only today has `radiators: null` (counted once the day is over) and is not expected yet either.
  const radiators = (b: Bucket): Mark => {
    const since = quality.radiators_since;
    if (!b.radiators) return expected(b) && since != null && bucketSpan(b.key, group).to > since ? 'missing' : 'none';
    return b.radiators.coverage == null || b.radiators.coverage >= 1 ? 'full' : 'partial';
  };
  // A coverage that rounds to « 0,0 % » is no figure: it says that no radiator-day was fully measured.
  const word = (mark: Mark, b: Bucket) => {
    const c = b.radiators?.coverage;
    if (mark !== 'partial' || c == null) return m.quality.mark[mark];
    return c >= 0.0005 ? m.quality.partialPct(fmtPct1(c)) : m.quality.partialNone;
  };
  let strip = $derived([
    { label: m.quality.rows.linky, marks: buckets.map(linky) },
    { label: m.quality.rows.curve, marks: buckets.map(curve) },
    { label: m.quality.rows.radiators, marks: buckets.map(radiators) }
  ]);
  let facts = $derived(
    [
      quality.linky_since ? m.quality.linkySince(fmtDateLong(quality.linky_since)) : null,
      quality.curve_since ? m.quality.curveSince(fmtDateLong(quality.curve_since)) : null,
      quality.radiators_since ? m.quality.radiatorsSince(fmtDateLong(quality.radiators_since)) : null,
      quality.estimated_days > 0 && quality.fallback_method
        ? m.quality.estimated(quality.estimated_days, fmtPct1(quality.fallback_share), m.quality.method[quality.fallback_method])
        : null,
      quality.curve_vs_daily_pct != null ? m.quality.gap(fmtPct1(quality.curve_vs_daily_pct / 100)) : null,
      quality.retro_priced_days > 0 ? m.quality.retro(quality.retro_priced_days) : null,
      quality.missing_colour_days > 0 ? m.energyTariff.qualityColours(quality.missing_colour_days) : null,
      quality.retro_scheduled_days > 0 ? m.energyTariff.qualityRetro(quality.retro_scheduled_days) : null
    ].filter((x): x is string => !!x)
  );
</script>

<!-- A heading holding its toggle (the disclosure pattern), not an <h2> inside <summary>: a summary is a button, and
     some screen readers drop the heading role of what it holds, so « Qualité des données » left heading navigation. -->
<section id={ANCHORS.quality} class="panel {cls}" class:open aria-labelledby="{uid}-title">
  <h2 class="qtitle">
    <button type="button" id="{uid}-title" class="disclose" aria-expanded={open} aria-controls="{uid}-body" onclick={() => (open = !open)}>
      <span class="chev" class:on={open} aria-hidden="true"><Icon name="chevron" size={16} /></span>{m.quality.title}
    </button>
  </h2>
  <!-- Hidden until found: find-in-page still reaches the facts and opens the panel (`beforematch`); a browser without
       it reads the value as plain `hidden`. -->
  <div id="{uid}-body" hidden={open ? undefined : 'until-found'} onbeforematch={() => (open = true)}>
  <div class="strip" aria-hidden="true" style:--n={buckets.length}>
    {#each strip as row (row.label)}
      <div class="row">
        <span class="label">{row.label}</span>
        <span class="cells">{#each row.marks as mark, i (i)}<span class="cell {mark}"></span>{/each}</span>
      </div>
    {/each}
  </div>
  <ul class="legend" aria-hidden="true">
    <li><span class="cell full"></span>{m.quality.legend.full}</li>
    <li><span class="cell partial"></span>{m.quality.legend.partial}</li>
    <li><span class="cell missing"></span>{m.quality.legend.missing}</li>
  </ul>
  <div class="visually-hidden"><table>
    <caption>{m.quality.title}</caption>
    <thead>
      <tr><th scope="col">{m.quality.period}</th><th scope="col">{m.quality.rows.linky}</th><th scope="col">{m.quality.rows.curve}</th><th scope="col">{m.quality.rows.radiators}</th></tr>
    </thead>
    <tbody>
      {#each buckets as b, i (b.key)}
        <tr>
          <th scope="row">{bucketLabel(b.key, group)}</th>
          <td>{m.quality.mark[strip[0].marks[i]]}</td>
          <td>{m.quality.mark[strip[1].marks[i]]}</td>
          <td>{word(strip[2].marks[i], b)}</td>
        </tr>
      {/each}
    </tbody>
  </table></div>
  <ul class="facts">{#each facts as f (f)}<li>{f}</li>{/each}</ul>
  <p class="muted note">{m.quality.est}</p>
  </div>
</section>

<style>
  /* Beats the page's section-label margin (.panels > .panel h2): the toggle row is the whole collapsed panel. */
  section.panel > h2.qtitle {
    margin: -10px 0;
  }
  section.panel.open > h2.qtitle {
    margin-bottom: 0;
  }
  /* The toggle takes the heading's own type (the section label), full width and 44 px tall; the chevron (as in Par
     pièce) says it opens, and the title's line box is the chevron's height, so both centre on the row. */
  .disclose {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    line-height: 16px;
    text-align: left;
    cursor: pointer;
  }
  .chev {
    display: grid;
    flex: none;
    color: var(--mu);
    transition: transform var(--t-state) var(--ease-out);
  }
  .chev.on {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .strip {
    display: grid;
    gap: 6px;
    margin-top: 8px;
  }
  .row {
    display: grid;
    grid-template-columns: 8.5rem minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--mu);
  }
  .cells {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
  }
  .cell {
    display: block;
    box-sizing: border-box;
    height: 10px;
    border-radius: 2px;
  }
  /* Full / partial / missing as ink / half ink in a faint frame / dashed; « none » (nothing expected) is a hairline
     frame, so the strip keeps its length when a running period has days still to come. */
  .cell.full {
    background: var(--tx);
  }
  .cell.partial {
    background: linear-gradient(to top, var(--tx) 50%, transparent 50%);
    border: 1px solid var(--fa);
  }
  .cell.none {
    border: 1px solid var(--line);
  }
  .cell.missing {
    border: 1px dashed var(--fa);
  }
  .legend {
    list-style: none;
    display: flex;
    gap: 14px;
    padding: 0;
    margin: 10px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend .cell {
    width: 10px;
  }
  .facts {
    margin: 12px 0 0;
    padding-left: 18px;
    font-size: 13px;
  }
  .note {
    font-size: 12px;
    margin: 8px 0 0;
  }
  @media (max-width: 599px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
