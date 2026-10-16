<!-- Réglages › Linky (Tableau §4, mockups 5 « Linky »): the state and its freshness in one line under the title,
     then « Connexion » as a grouped list: the PDL masked (« Afficher » reveals it: the full PDL is never in the
     page before that, the form included), the token's presence (never shown), the day's MyElectricalData calls
     (a Fig: per day, limit, reset) and the Enedis consent. « Modifier la connexion » holds LinkyPanel's form in a
     grouped row of its own, open when Linky is not connected. The J+1 note closes the page. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { LinkyStatus } from '$lib/api/types';
  import Disclosure from '$lib/components/Disclosure.svelte';
  import Fig from '$lib/components/Fig.svelte';
  import Freshness from '$lib/components/Freshness.svelte';
  import GroupedList from '$lib/components/GroupedList.svelte';
  import LinkyPanel from '$lib/components/LinkyPanel.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { fmtAgo, fmtDateLong } from '$lib/format';
  import { m } from '$lib/i18n';
  import { linkyFresh, linkyLine, linkyProblem, maskPdl } from '$lib/linky';
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

<div class="page">
  <SettingsHeader back title="Linky" vt="home-linky">
    {#snippet stateLine()}
      {#if status}<Freshness state={linkyFresh(status, now)} /><span class="txt">{line}{#if sync}&nbsp;· {sync}{/if}</span>
      {:else}<span class="skeleton sk-line line-sk" aria-hidden="true"></span>{/if}
    {/snippet}
  </SettingsHeader>

  {#if status}
    {#if problem}<div class="notice bad" role="alert"><p>{problem}</p></div>{/if}
    {#if status.configured}
      <section class="conn">
        <GroupedList label={m.linky.connection} id="linky-conn" level="h2" tag="dl">
          <div class="li">
            <dt>{m.linky.pdl}</dt>
            <dd>
              <span class="mono pdl">{shown ? status.prm : maskPdl(status.prm)}</span>
              <!-- The name starts with the visible word (label in name): « Afficher le PDL ». -->
              <button type="button" class="link hit" aria-label="{shown ? m.linky.hide : m.linky.show} {m.linky.pdlObject}"
                onclick={() => (shown = !shown)}>{shown ? m.linky.hide : m.linky.show}</button>
            </dd>
          </div>
          <div class="li"><dt>{m.linky.token}</dt><dd>{status.token_set ? m.linky.tokenPlaceholder : m.linky.tokenNone}</dd></div>
          <div class="li">
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
          {#if status.consent_expires}<div class="li"><dt>{m.linky.consentRow}</dt><dd>{fmtDateLong(status.consent_expires)}</dd></div>{/if}
        </GroupedList>
        {#if status.simulator}<p class="note">{m.linky.simulator}</p>{/if}
      </section>
    {/if}
    <section class="grp modify">
      <Disclosure title={m.linky.modify} heading="h2" bind:open={modifying}>
        <!-- Only while open: the form's PDL field holds the full number. -->
        {#if modifying}<div class="form"><LinkyPanel {status} meta={!status.configured} onsaved={saved} /></div>{/if}
      </Disclosure>
    </section>
    <p class="note">{m.linky.dayAfter}</p>
  {:else if failed}
    <div class="notice bad fail" role="alert">
      <p>{m.home.linkyLoadFailed}</p>
      <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button>
    </div>
  {:else}
    <div class="skeleton sk-line head-sk" aria-hidden="true"></div>
    <div class="skeleton" style:height="232px" aria-hidden="true"></div>
    <div class="skeleton" style:height="52px" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .page {
    display: grid;
    gap: 12px;
    max-width: 720px;
    min-width: 0;
  }
  .page > :global(.sh) {
    margin-bottom: 8px;
  }
  .txt {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line-sk {
    display: inline-block;
    width: 16rem;
    height: 14px;
  }
  .head-sk {
    width: 7rem;
    height: 14px;
    margin: 18px 16px 0;
  }
  .conn > :global(.grph) {
    margin-top: 6px;
  }
  .li {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 16px;
    padding: 6px 0;
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
    text-align: right;
  }
  .pdl {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-weight: 500;
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .note {
    margin: 8px 16px 0;
  }
  .notice p {
    margin: 0;
    font-size: 14px;
  }
  .fail {
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }
  .modify {
    padding: 0 16px;
  }
  .form {
    padding-bottom: 16px;
  }
  /* The disclosure's heading holds its button: a 15 px row, not a page heading. */
  .modify :global(h2) {
    margin: 0;
    font-size: 15px;
    font-weight: 400;
  }
  .modify :global(h2 button) {
    min-height: 52px;
    font-size: 15px;
    font-weight: 400;
  }
</style>
