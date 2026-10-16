<!-- Maison › Linky (direction-2 §3, UX batch 9): the connection as facts, the form one disclosure away. The state
     line is the source line (Freshness + words + « synchro il y a 5 min »); « Connexion » lists the PDL masked
     (« Afficher » reveals it: the full PDL is never in the page before that, the form included), the token's
     presence, the day's MyElectricalData calls (a Fig: per day, limit, reset) and the Enedis consent.
     « Modifier la connexion » holds LinkyPanel's form, open when Linky is not connected. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import Disclosure from '$lib/components/Disclosure.svelte';
  import Fig from '$lib/components/Fig.svelte';
  import Freshness from '$lib/components/Freshness.svelte';
  import LinkyPanel from '$lib/components/LinkyPanel.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { fmtAgo, fmtDateLong } from '$lib/format';
  import { m } from '$lib/i18n';
  import { linkyFresh, linkyLine, linkyProblem, maskPdl } from '$lib/linky';
  import { ROUTES } from '$lib/paths';
  import { provenance } from '$lib/provenance';

  let status = $state<LinkyStatus | null>(null);
  let failed = $state(false);
  let modifying = $state(false);
  let shown = $state(false);
  let now = $state(Date.now());
  function load() {
    failed = false;
    api.linkyStatus().then(
      (s) => {
        status = s;
        modifying = !s.configured;
      },
      () => (failed = true)
    );
  }
  $effect(() => load());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  function saved(s: LinkyStatus) {
    status = s;
    now = Date.now();
    if (s.state !== 'auth' && s.state !== 'error') modifying = false;
  }

  let line = $derived(status ? (linkyLine(status) ?? linkyProblem(status) ?? '—') : '');
  let sync = $derived(status?.state === 'ok' && status.last_ok_at ? m.linky.sync(fmtAgo(status.last_ok_at * 1000, now)) : null);
  let problem = $derived(status ? linkyProblem(status) : null);
</script>

<svelte:head><title>{m.page.title('Linky')}</title></svelte:head>

<div class="vt">
  <PageHeader title="Linky" back={{ href: ROUTES.home, label: m.nav.home }}>
    {#snippet stateLine()}
      {#if status}
        <p class="state"><Freshness state={linkyFresh(status, now)} /><span class="txt">{line}{#if sync}&nbsp;· {sync}{/if}</span></p>
      {:else}<p class="state"><span class="skeleton line-sk" aria-hidden="true"></span></p>{/if}
    {/snippet}
  </PageHeader>
</div>

<div class="page">
  {#if status}
    {#if status.configured}
      <section class="panel" aria-labelledby="linky-conn">
        <h2 id="linky-conn" class="sl">{m.linky.connection}</h2>
        {#if problem}<p class="error" role="alert">{problem}</p>{/if}
        <dl>
          <div class="r">
            <dt>{m.linky.pdl}</dt>
            <dd>
              <span class="mono pdl">{shown ? status.prm : maskPdl(status.prm)}</span>
              <!-- The name starts with the visible word (label in name): « Afficher le PDL ». -->
              <button type="button" class="link hit" aria-label="{shown ? m.linky.hide : m.linky.show} {m.linky.pdlObject}"
                onclick={() => (shown = !shown)}>{shown ? m.linky.hide : m.linky.show}</button>
            </dd>
          </div>
          <div class="r"><dt>{m.linky.token}</dt><dd>{status.token_set ? m.linky.tokenPlaceholder : m.linky.tokenNone}</dd></div>
          <div class="r">
            <dt>{m.linky.callsTitle}</dt>
            <dd>
              <Fig value={m.linky.calls(status.calls_today, status.budget)} title={m.linky.callsTitle}
                rows={[
                  { label: m.linky.callsToday, value: String(status.calls_today) },
                  { label: m.linky.callsLimit, value: String(status.budget) }
                ]}
                notes={[m.linky.callsReset]}
                provenance={provenance('linky-day', { day: status.last_day, syncAt: status.last_ok_at ? status.last_ok_at * 1000 : undefined }, now)} />
            </dd>
          </div>
          {#if status.consent_expires}<div class="r"><dt>{m.linky.consentRow}</dt><dd>{fmtDateLong(status.consent_expires)}</dd></div>{/if}
        </dl>
        {#if status.simulator}<p class="muted small">{m.linky.simulator}</p>{/if}
      </section>
    {/if}
    <section class="panel modify">
      <Disclosure title={m.linky.modify} heading="h2" bind:open={modifying}>
        <!-- Only while open: the form's PDL field holds the full number. -->
        {#if modifying}<div class="form"><LinkyPanel {status} meta={!status.configured} onsaved={saved} /></div>{/if}
      </Disclosure>
    </section>
  {:else if failed}
    <section class="panel">
      <p class="error" role="alert">{m.home.linkyLoadFailed} <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button></p>
    </section>
  {:else}
    <div class="skeleton block" style:height="200px" aria-hidden="true"></div>
    <div class="skeleton block" style:height="46px" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .vt :global(h1) {
    view-transition-name: home-linky;
  }
  .page {
    display: grid;
    gap: 14px;
    max-width: 720px;
    min-width: 0;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    height: 19px;
    font-size: 13px;
    line-height: 19px;
    color: var(--mu);
    min-width: 0;
  }
  .txt {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line-sk {
    display: inline-block;
    width: 14rem;
    height: 13px;
    border-radius: 4px;
  }
  .block {
    border-radius: var(--radius);
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    min-width: 0;
  }
  .modify {
    padding: 0 14px;
  }
  .form {
    padding-bottom: 14px;
  }
  .sl {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  dl {
    margin: 0;
    font-size: 13px;
  }
  .r {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 2px 16px;
    min-height: 44px;
    border-bottom: 1px solid var(--line);
  }
  .r:last-child {
    border-bottom: 0;
  }
  dt {
    color: var(--mu);
  }
  dd {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    font-weight: 600;
    min-width: 0;
  }
  .pdl {
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .small {
    margin: 8px 0 0;
    font-size: 12px;
  }
  .error {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--bad);
  }
  .error .btn {
    color: var(--tx);
  }
</style>
