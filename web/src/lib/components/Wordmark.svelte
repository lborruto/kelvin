<!-- The Kelvin mark (Tableau mockups): an ink disc with « K » beside « Kelvin » (18/700). Identity, not data.
     `size="lg"` is Login's mark: the same at 32 px. The letter is decorative; the word names it. -->
<script lang="ts">
  let { size = 'sm' }: { size?: 'sm' | 'lg' } = $props();
</script>

<span class="wordmark {size}"><i aria-hidden="true">K</i><span>Kelvin</span></span>

<style>
  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  i {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--tx);
    color: var(--bg);
    font-size: 14px;
    font-style: normal;
    font-weight: 700;
  }
  .lg i {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
</style>
