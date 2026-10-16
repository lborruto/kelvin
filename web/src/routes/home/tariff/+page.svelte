<!-- Réglages › Tarif (Tableau §4, mockups 5 « Tarif »): « Tarif en vigueur » read without one input
     (TariffSummary and its band), then « Historique des prix » (each dated row, newest first). « Nouveau prix… »
     (a new dated row, from today) and « Corriger le tarif en vigueur » (the row in force, its date locked) open
     the editor beside them on a wide screen and under them on a phone, the date field first and focused; a
     mistyped price is flagged before saving (PriceFields). Enedis' notices (new off-peak hours, a price change)
     sit above. No tariff yet: the editor is the page. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { SettingsView, Slot, Tariff } from '$lib/api/types';
  import AlertCallout from '$lib/components/AlertCallout.svelte';
  import PriceHistory from '$lib/components/PriceHistory.svelte';
  import TariffForm from '$lib/components/TariffForm.svelte';
  import TariffSummary from '$lib/components/TariffSummary.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
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
  let stateText = $derived(settings ? (row ? m.tariff.sinceLine(m.tariffSummary.options[row.option], fmtDateLong(row.valid_from)) : m.tariff.none) : null);

  function open(next: 'new' | 'fix') {
    changed = new Set();
    savedShown = false;
    editing = next;
  }

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
    open('new');
  }
</script>

<svelte:head><title>{m.page.title(m.tariff.title)}</title></svelte:head>

<SettingsHeader back title={m.tariff.title} state={stateText} vt="home-tariff" />

{#if settings}
  {#if notices.length}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events (the links inside are the controls) -->
    <ul class="notices" onclick={noticeClick}>{#each notices as a (a.id)}<li><AlertCallout alert={a} /></li>{/each}</ul>
  {/if}
  <div class="cols" class:solo={!tariff}>
    {#if tariff}
      <div class="left">
        <section class="w" aria-labelledby="tariff-title">
          <div class="wh">
            <h2 id="tariff-title">{m.tariff.inForce}</h2>
            {#if savedShown}<p class="ok" role="status">{m.tariff.saved}</p>{/if}
          </div>
          <TariffSummary {tariff} {today} {changed} />
          {#if !mode}
            <div class="actions">
              <button type="button" class="btn btn-primary" onclick={() => open('new')}>{m.tariff.newPrice}</button>
              <button type="button" class="btn" onclick={() => open('fix')}>{m.tariff.fix}</button>
            </div>
          {/if}
        </section>
        <section class="w" aria-labelledby="history-title">
          <div class="wh">
            <h2 id="history-title">{m.tariff.history}</h2>
            <span class="aside">{m.tariff.historyMeta(tariff.prices.length)}</span>
          </div>
          <PriceHistory {tariff} />
        </section>
      </div>
    {/if}
    {#if mode}
      <section class="w form" aria-labelledby="form-title">
        <div class="wh">
          <h2 id="form-title">{mode === 'fix' ? m.tariff.fix : m.tariff.newTitle}</h2>
          <span class="aside">{m.tariff.draft}</span>
        </div>
        {#key mode}
          <TariffForm {settings} mode={mode} autofocus={!!tariff} onsaved={saved} oncancel={tariff ? () => (editing = null) : null}
            contractSlots={(alerts.of(['hc_changed'])[0]?.params.slots as Slot[] | undefined) ?? null} />
        {/key}
      </section>
    {/if}
  </div>
{:else if failed}
  <div class="notice bad" role="alert">
    <p class="err">{m.home.tariffLoadFailed}</p>
    <button type="button" class="btn btn-sm" onclick={load}>{m.common.retry}</button>
  </div>
{:else}
  <div class="cols solo" aria-busy="true">
    <div class="left">
      <div class="skeleton sk-widget" style:height="380px" aria-hidden="true"></div>
      <div class="skeleton sk-widget" style:height="150px" aria-hidden="true"></div>
    </div>
  </div>
{/if}

<style>
  .notices {
    display: grid;
    gap: 8px;
    max-width: 1100px;
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 400px) minmax(0, 1fr);
    align-items: start;
    gap: 18px;
    max-width: 1100px;
  }
  .cols.solo {
    grid-template-columns: minmax(0, 720px);
  }
  .left {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .w {
    padding: 16px 20px;
    border-radius: var(--r-widget);
    background: var(--s1);
    min-width: 0;
  }
  .form {
    padding: 18px 20px;
    box-shadow: inset 0 0 0 1px var(--field);
  }
  .wh {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
    margin-bottom: 6px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .form h2 {
    font-size: 16px;
  }
  .aside {
    font-size: 12.5px;
    font-weight: 600;
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
  .notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    max-width: 720px;
  }
  .err {
    margin: 0;
    font-size: 14px;
  }
  @media (max-width: 1023px) {
    .cols,
    .cols.solo {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
    .w {
      padding: 14px 16px;
    }
  }
</style>
