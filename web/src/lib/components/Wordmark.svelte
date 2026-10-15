<!-- The Kelvin mark (direction-2 §6): the thermal strip in miniature, as in the PWA icon (static/icon.svg):
     a heat-ramp sparkline and an ink now-marker, 20 × 12, beside « Kelvin ». Identity, not data. -->
<script lang="ts">
  const uid = $props.id();
</script>

<span class="wordmark">
  <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
    <defs>
      <linearGradient id="{uid}-k" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="var(--cool)" />
        <stop offset="0.5" stop-color="var(--neutral)" />
        <stop offset="1" stop-color="var(--warm)" />
      </linearGradient>
    </defs>
    <polyline points="1,10 4.5,9.6 7.5,8.4 10,6.6 12.3,4.6 15,3.2 18,2.6 19,2.5" fill="none" stroke="url(#{uid}-k)"
      stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="12.3" y1="0.8" x2="12.3" y2="11.2" stroke="var(--tx)" stroke-width="0.9" stroke-linecap="round" />
  </svg>
  <span>Kelvin</span>
</span>

<style>
  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  svg {
    flex: none;
  }
</style>
