<!-- Maison › Tarif (direction-2 §3, UX batch 9): the tariff in force read as a fact (TariffSummary), with
     « Nouveau prix… » (a new dated row, from today) and « Corriger le tarif en vigueur » (the row in force, its
     date locked) opening the editor in place of the summary, the date field first and focused. Enedis' notices
     (new off-peak hours, a price change) sit above. The price history is one Disclosure away (L2). -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { SettingsView, Slot, Tariff } from '$lib/api/types';
  import AlertCallout from '$lib/components/AlertCallout.svelte';
  import Disclosure from '$lib/components/Disclosure.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import PriceHistory from '$lib/components/PriceHistory.svelte';
  import TariffForm from '$lib/components/TariffForm.svelte';
  import TariffSummary from '$lib/components/TariffSummary.svelte';
  import { fmtDateLong, parisTodayIso } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { inForce, tariffDiff } from '$lib/tariff';

  let settings = $state<SettingsView | null>(null);
  let failed = $state(false);
  function load() {
    failed = false;
    api.settings().then((s) => (settings = s), () => (failed = true));
  }
  $effect(() => load());

  const today = parisTodayIso();
  let editing = $state<'new' | 'fix' | null>(null);
  let changed = $state(new Set<string>());
  let savedShown = $state(false);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(savedTimer));

  let tariff = $derived(settings?.tariff ?? null);
  let row = $derived(tariff ? inForce(tariff.prices, today) : null);
  // No tariff yet: the editor is the page (nothing to go back to).
  let mode = $derived(tariff ? editing : 'new');
  let notices = $derived(alerts.of(['price_change', 'hc_changed']));
  let stateText = $derived(row ? m.tariff.sinceLine(m.tariffSummary.options[row.option], fmtDateLong(row.valid_from)) : m.tariff.none);

  function saved(s: SettingsView) {
    const before: Tariff | null = settings?.tariff ?? null;
    if (s.tariff) changed = tariffDiff(before, s.tariff, today);
    settings = s;
    editing = null;
    savedShown = true;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (savedShown = false), 6000);
  }

  // A notice's « Ajouter les prix » / « Ajouter ces heures creuses » points here: open the editor instead.
  function noticeClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || a.getAttribute('href') !== ROUTES.tariff) return;
    e.preventDefault();
    changed = new Set();
    editing = 'new';
  }
</script>

<svelte:head><title>{m.page.title(m.tariff.title)}</title></svelte:head>

<div class="vt">
  <PageHeader title={m.tariff.title} back={{ href: ROUTES.home, label: m.nav.home }}>
    {#snippet stateLine()}
      {#if settings}<p class="state">{stateText}</p>{:else}<p class="state"><span class="skeleton line-sk" aria-hidden="true"></span></p>{/if}
    {/snippet}
  </PageHeader>
</div>

<div class="page">
  {#if settings}
    {#if notices.length}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events (the links inside are the controls) -->
      <ul class="notices" onclick={noticeClick}>{#each notices as a (a.id)}<li><AlertCallout alert={a} /></li>{/each}</ul>
    {/if}
    <section class="panel" aria-labelledby="tariff-title">
      {#if mode}
        <h2 id="tariff-title" class="sl">{mode === 'fix' ? m.tariff.fix : m.tariff.newTitle}</h2>
        {#key mode}
          <TariffForm {settings} mode={mode} autofocus={!!tariff} onsaved={saved} oncancel={tariff ? () => (editing = null) : null}
            contractSlots={(alerts.of(['hc_changed'])[0]?.params.slots as Slot[] | undefined) ?? null} />
        {/key}
      {:else if tariff}
        <div class="head">
          <h2 id="tariff-title" class="sl">{m.tariff.inForce}</h2>
          {#if savedShown}<p class="ok" role="status">{m.tariff.saved}</p>{/if}
        </div>
        <TariffSummary {tariff} {today} {changed} />
        <div class="actions">
          <button type="button" class="btn btn-primary" onclick={() => ((changed = new Set()), (editing = 'new'))}>{m.tariff.newPrice}</button>
          <button type="button" class="btn btn-ghost" onclick={() => ((changed = new Set()), (editing = 'fix'))}>{m.tariff.fix}</button>
        </div>
      {/if}
    </section>
    {#if tariff}
      <section class="panel hist">
        <Disclosure title={m.tariff.history} meta={m.tariff.historyMeta(tariff.prices.length)} heading="h2" detail>
          <PriceHistory {tariff} />
        </Disclosure>
      </section>
    {/if}
  {:else if failed}
    <section class="panel">
      <p class="error" role="alert">{m.home.tariffLoadFailed} <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button></p>
    </section>
  {:else}
    <div class="skeleton block" style:height="360px" aria-hidden="true"></div>
    <div class="skeleton block" style:height="46px" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .vt :global(h1) {
    view-transition-name: home-tariff;
  }
  .page {
    display: grid;
    gap: 14px;
    max-width: 720px;
    min-width: 0;
  }
  .state {
    margin: 0;
    height: 19px;
    font-size: 13px;
    line-height: 19px;
    color: var(--mu);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line-sk {
    display: inline-block;
    width: 14rem;
    height: 13px;
    border-radius: 4px;
    vertical-align: -2px;
  }
  .block {
    border-radius: var(--radius);
  }
  .notices {
    display: grid;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    min-width: 0;
  }
  .hist {
    padding: 0 14px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .sl {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  .ok {
    margin: 0;
    font-size: 13px;
    color: var(--ok);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0;
    font-size: 13px;
    color: var(--bad);
  }
  .error .btn {
    color: var(--tx);
  }
  /* The disclosure's heading holds its button: a 13 px 600 row, not a page heading. */
  .hist :global(h2) {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
</style>
