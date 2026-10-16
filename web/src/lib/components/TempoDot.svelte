<script lang="ts">
  import type { TempoColour } from '$lib/api/types';

  interface Props {
    colour: TempoColour | null;
  }
  let { colour }: Props = $props();
</script>

<!-- The only user of the --tempo-* tokens (ruling 2). Decorative: the colour's name is the text beside it. -->
<span class="dot {colour ?? 'unknown'}" aria-hidden="true"></span>

<style>
  .dot {
    display: inline-block;
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px dashed var(--fa-mark);
  }
  .blue {
    background: var(--tempo-bleu);
    border: 0;
  }
  .white {
    background: var(--tempo-blanc);
    border: 1px solid var(--field);
  }
  .red {
    background: var(--tempo-rouge);
    border: 0;
  }
</style>
