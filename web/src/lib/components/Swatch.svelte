<!-- A legend key for an Énergie series (DESIGN « Tariff blues », Series rule): a 10 px square with a 3 px
     radius (8 px in field captions), hatched for heures creuses; `line` draws the radiators' 14 × 2 mark.
     Never a round dot: round dots belong to Tempo days (TempoDot). Decorative: the words beside it carry
     the meaning. -->
<script lang="ts">
  import { SERIES, seriesBackground, type SeriesKey } from '$lib/energy';

  interface Props {
    series: SeriesKey;
    /** 10 px in legends, 8 px in field captions and inline text. */
    size?: 8 | 10;
    /** A line mark (the radiators' overlay) instead of a square. */
    line?: boolean;
  }
  let { series, size = 10, line = false }: Props = $props();
</script>

<span class="sw" class:line data-series={series} style:--sw={`${size}px`}
  style:background={line ? SERIES[series] : seriesBackground(series)} aria-hidden="true"></span>

<style>
  .sw {
    display: inline-block;
    flex: none;
    width: var(--sw);
    height: var(--sw);
    /* 3 px at 10 px, 2 px at 8 px: always read as a square, never a round (Tempo) dot. */
    border-radius: calc((var(--sw) - 4px) / 2);
    vertical-align: -1px;
  }
  .line {
    width: 14px;
    height: 2px;
    border-radius: 1px;
    vertical-align: 3px;
  }
</style>
