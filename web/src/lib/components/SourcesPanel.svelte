<script lang="ts">
  import { api } from '$lib/api/client';
  import type { SourceStatus, Sources } from '$lib/api/types';
  import { fmtTime } from '$lib/format';
  import { m } from '$lib/i18n';

  let sources = $state<Sources | null | undefined>(undefined);
  $effect(() => {
    api.status().then(
      (s) => (sources = s.sources ?? null),
      () => (sources = null)
    );
  });
  const when = (ts: number) => fmtTime(ts * 1000);
  function line(s: SourceStatus): string {
    const parts = [
      s.state === 'ok' && s.last_ok ? m.sources.ok(when(s.last_ok)) : null,
      s.state === 'never' ? m.sources.never : null,
      s.state === 'error' && s.error_since ? m.sources.error(when(s.error_since)) : null,
      s.state === 'quota' ? m.sources.quota : null,
      s.next ? m.sources.next(when(s.next)) : null
    ];
    return parts.filter(Boolean).join(' · ');
  }
</script>

{#if sources === undefined}
  <div class="skeleton inset" style:height="88px" aria-hidden="true"></div>
{:else if sources === null}
  <p class="muted">{m.sources.loadFailed}</p>
{:else}
  <dl class="sources">
    {#if sources.tempo.enabled}
      <div><dt>{m.sources.tempo}</dt><dd class:bad={sources.tempo.state === 'error'}>{line(sources.tempo)}</dd></div>
    {/if}
    <div><dt>{m.sources.ecowatt}</dt><dd class:bad={sources.ecowatt.state === 'error'}>{line(sources.ecowatt)}</dd></div>
  </dl>
  <p class="muted med">{m.sources.med(sources.med.calls_today, sources.med.budget, sources.med.grid_calls_today)}</p>
  <p class="muted med">{m.sources.via}</p>
{/if}

<style>
  .sources {
    display: grid;
    gap: 6px;
    margin: 0;
    font-size: 13px;
  }
  .sources div {
    display: grid;
    grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
    gap: 12px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
  }
  dd.bad {
    color: var(--bad);
  }
  .med {
    font-size: 12px;
    margin: 6px 0 0;
  }
</style>
