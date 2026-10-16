<!-- A skeleton block (spec « Skeleton »): the shape of what is coming at its final size, never a value. `shape`
     sets the final radius (widget 22, tile 20, pill 99, line 6, block 16); `inset` sits one tone up inside a
     surface. The shimmer runs 1.4 s × 7 then stops; static under reduced motion (app.css `.skeleton`). -->
<script lang="ts">
  interface Props {
    /** Height: px number or any CSS length. */
    h: number | string;
    w?: number | string;
    shape?: 'block' | 'widget' | 'tile' | 'pill' | 'line';
    inset?: boolean;
    class?: string;
  }
  let { h, w = '100%', shape = 'block', inset = false, class: cls = '' }: Props = $props();
  const css = (v: number | string) => (typeof v === 'number' ? `${v}px` : v);
</script>

<span class="skeleton sk-{shape} {cls}" class:inset style:height={css(h)} style:width={css(w)} aria-hidden="true"></span>

<style>
  span {
    display: block;
    flex: none;
    max-width: 100%;
  }
</style>
