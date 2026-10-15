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
    border: 1px dashed var(--fa);
  }
  .blue {
    background: var(--tempo-blue);
    border: 0;
  }
  .white {
    background: var(--tempo-white);
    border: 1px solid var(--field-line);
  }
  .red {
    background: var(--tempo-red);
    border: 0;
  }
</style>
