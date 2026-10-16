<script lang="ts">
  import { untrack } from 'svelte';
  import { api } from '$lib/api/client';
  import type { SettingsView, Slot, TariffOption } from '$lib/api/types';
  import { fmtDateLong, fmtDay, parisTodayIso, parseDecimal } from '$lib/format';
  import { errorText, locale, m } from '$lib/i18n';
  import { ALL_MONTHS, DEFAULT_TEMPO_HOURS, OPTIONS, RATE_KEYS, buildDocument, inForce, monthsProblem, priceProblem, withSchedule } from '$lib/tariff';
  import HcScheduleEditor from './HcScheduleEditor.svelte';
  import PriceFields from './PriceFields.svelte';
  import Segmented from './Segmented.svelte';

  const KVA = [3, 6, 9, 12, 15, 18, 24, 30, 36];
  const ALL_KEYS = [...new Set(Object.values(RATE_KEYS).flat())];
  interface Props {
    settings: SettingsView;
    onsaved: (s: SettingsView) => void;
    /** Off-peak hours Enedis now lists (the `hc_changed` alert's slots); null when none. */
    contractSlots?: Slot[] | null;
    /** `new`: a new dated price (« Nouveau prix… », from today); `fix`: corrects the row in force, its date
     * locked to that row's start (« Corriger le tarif en vigueur »). */
    mode?: 'new' | 'fix';
    /** « Annuler »: the editor closes without saving (absent when there is no tariff to go back to). */
    oncancel?: (() => void) | null;
    /** Focus the first field (the date) when the editor opens. */
    autofocus?: boolean;
  }
  let { settings, onsaved, contractSlots = null, mode = 'new', oncancel = null, autofocus = false }: Props = $props();
  let dateField = $state<HTMLInputElement>();
  $effect(() => {
    if (autofocus) dateField?.focus();
  });

  const dec = (v: number | null | undefined) => (v == null ? '' : locale.current === 'en' ? String(v) : String(v).replace('.', ','));
  // The fields start from the row and the off-peak hours in force today, else the Enedis contract.
  const init = untrack(() => {
    const t = settings.tariff;
    const today = parisTodayIso();
    const row = t ? inForce(t.prices, today) : null;
    const sched = t ? inForce(t.hc_schedules, today) : null;
    const prefill = settings.prefill?.hc_slots?.length ? settings.prefill.hc_slots : null;
    return {
      today,
      // A correction keeps the dates of what it corrects: the row's, and the off-peak hours' in force.
      from: mode === 'fix' && row ? row.valid_from : today,
      hcFrom: mode === 'fix' && sched ? sched.valid_from : today,
      option: (row?.option ?? 'hchp') as TariffOption,
      kva: t?.kva ?? settings.prefill?.kva ?? 6,
      sub: dec(row?.subscription_eur_month),
      rates: Object.fromEntries(ALL_KEYS.map((k) => [k, dec(row?.rates[k])])),
      variants: sched
        ? sched.variants.map((v) => ({ months: [...v.months], slots: v.slots.map((s) => ({ ...s })) }))
        : [{ months: [...ALL_MONTHS], slots: (prefill ?? [{ start: '22:00', end: '06:00' }]).map((s) => ({ ...s })) }],
      tempo: { ...DEFAULT_TEMPO_HOURS, ...(t?.tempo_hours ?? {}) }
    };
  });
  let option = $state<TariffOption>(init.option);
  let kva = $state(init.kva);
  let sub = $state(init.sub);
  let rates = $state<Record<string, string>>(init.rates);
  let validFrom = $state(init.from);
  let hcFrom = $state(init.hcFrom);
  const locked = untrack(() => mode === 'fix' && !!settings.tariff);
  let variants = $state(init.variants);
  let seasonal = $state(init.variants.length > 1);
  let tempoStart = $state(init.tempo.hc_start);
  let tempoEnd = $state(init.tempo.hc_end);
  let prefilled = $state<number | null>(null);
  let contractFrom = $state(init.today);
  let busy = $state(false);
  let error = $state<(() => string) | null>(null);
  let saved = $state(false);
  let kvaOptions = $derived(KVA.includes(kva) ? KVA : [...KVA, kva].sort((a, b) => a - b));
  // The contract callout shows under HC/HP only, once a tariff exists to add a schedule to.
  let contract = $derived(option === 'hchp' && settings.tariff && contractSlots?.length ? contractSlots : null);

  const monthNames = (months: number[]) => () =>
    months.map((mo) => new Intl.DateTimeFormat(locale.intl, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, mo - 1, 15)))).join(', ');

  function readRates(): Record<string, number> | null {
    const out: Record<string, number> = {};
    for (const k of RATE_KEYS[option]) {
      const v = parseDecimal(rates[k] ?? '');
      if (v === null || priceProblem(rates[k] ?? '')) return null;
      out[k] = v;
    }
    return out;
  }

  async function send(doc: Parameters<typeof api.putTariffDoc>[0]) {
    busy = true;
    try {
      const res = await api.putTariffDoc(doc);
      saved = true;
      onsaved(res);
    } catch (e) {
      error = () => errorText(e);
    } finally {
      busy = false;
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = null;
    saved = false;
    const s = parseDecimal(sub);
    const r = readRates();
    if (s === null || r === null) {
      error = () => m.tariff.amountsInvalid;
      return;
    }
    if (!validFrom || (option === 'hchp' && !hcFrom)) {
      error = () => m.tariff.dateMissing;
      return;
    }
    if (option === 'hchp') {
      if (variants.some((v) => !v.slots.length)) {
        error = () => m.tariff.slotsNone;
        return;
      }
      const problem = monthsProblem(variants);
      if (problem) {
        const names = monthNames(problem.months);
        error = () => (problem.kind === 'missing' ? m.tariff.monthsMissing(names()) : m.tariff.monthsOverlap(names()));
        return;
      }
    }
    await send(
      buildDocument(settings.tariff, {
        option,
        kva,
        validFrom,
        subscription: s,
        rates: r,
        schedule:
          option === 'hchp'
            ? { valid_from: hcFrom, variants: variants.map((v) => ({ months: [...v.months], slots: v.slots.map((x) => ({ start: x.start, end: x.end })) })) }
            : null,
        tempoHours: { hc_start: tempoStart, hc_end: tempoEnd }
      })
    );
  }

  async function prefillTempo() {
    if (busy) return;
    error = null;
    busy = true;
    try {
      const p = await api.tempoPrices();
      for (const [k, v] of Object.entries(p.rates)) rates[k] = dec(v);
      prefilled = p.fetched_at;
    } catch (e) {
      error = () => errorText(e);
    } finally {
      busy = false;
    }
  }

  async function addContractHours() {
    if (busy || !settings.tariff || !contract || !contractFrom) return;
    error = null;
    saved = false;
    const slots = contract.map((s) => ({ start: s.start, end: s.end }));
    await send(withSchedule(settings.tariff, { valid_from: contractFrom, variants: [{ months: [...ALL_MONTHS], slots }] }));
  }
</script>

<form class="tariff" onsubmit={save} oninput={() => (saved = false)} onchange={() => (saved = false)} novalidate>
  {#if !settings.tariff && settings.prefill}
    <p class="muted note">{m.tariff.prefill(String(settings.prefill.kva ?? '—'), settings.prefill.hc_slots.map((x) => `${x.start}–${x.end}`).join(', '))}</p>
  {/if}
  <!-- The date first (direction-2 §3): from when this price applies; a correction keeps the row's own date. -->
  <label class="field">
    <span>{m.tariff.validFrom}</span>
    <input class="w-date" type="date" bind:this={dateField} bind:value={validFrom} readonly={locked} aria-readonly={locked}
      aria-describedby={locked ? 'tariff-fix-note' : undefined} />
  </label>
  {#if locked}<p class="muted note" id="tariff-fix-note">{m.tariff.fixNote(fmtDateLong(validFrom))}</p>{/if}
  <div class="options">
    <Segmented options={OPTIONS.map((o) => ({ value: o, label: m.tariff.options[o] }))} value={option} label={m.tariff.option}
      onchange={(v) => { option = v; saved = false; }} />
  </div>
  <div class="grid">
    <label class="field">
      <span>{m.tariff.kva}</span>
      <select class="w-kva" bind:value={kva}>{#each kvaOptions as k (k)}<option value={k}>{m.tariff.kvaValue(k)}</option>{/each}</select>
    </label>
    <label class="field"><span>{m.tariff.subscription}</span><input class="w-price" inputmode="decimal" autocomplete="off" bind:value={sub} /></label>
  </div>

  <PriceFields {option} bind:values={rates} />

  {#if option === 'tempo'}
    <div class="row">
      <button type="button" class="btn btn-ghost" aria-disabled={busy} onclick={prefillTempo}>{m.tariff.tempoPrefill}</button>
    </div>
    {#if prefilled}<p class="muted note" role="status">{m.tariff.tempoPrefillNote(fmtDateLong(parisTodayIso(prefilled * 1000)))}</p>{/if}
    <fieldset>
      <legend>{m.tariff.tempoHours}</legend>
      <div class="grid">
        <label class="field"><span>{m.tariff.tempoStart}</span><input type="time" step="600" bind:value={tempoStart} /></label>
        <label class="field"><span>{m.tariff.tempoEnd}</span><input type="time" step="600" bind:value={tempoEnd} /></label>
      </div>
      <p class="muted note">{m.tariff.tempoDay}</p>
    </fieldset>
  {/if}

  {#if option === 'hchp'}
    <fieldset>
      <legend>{m.tariff.hc}</legend>
      {#if contract}
        <div class="contract" role="status">
          <p>{m.tariff.contractNew(contract.map((s) => `${s.start}–${s.end}`).join(', '))}</p>
          <div class="contract-row">
            <label class="field"><span>{m.tariff.contractFrom}</span><input type="date" bind:value={contractFrom} /></label>
            <button type="button" class="btn btn-sm" aria-disabled={busy} onclick={addContractHours}>{m.tariff.contractAdd(fmtDay(contractFrom))}</button>
          </div>
        </div>
      {/if}
      <label class="field"><span>{m.tariff.hcValidFrom}</span><input type="date" bind:value={hcFrom} readonly={locked} aria-readonly={locked}
          aria-describedby={locked ? 'tariff-fix-hc-note' : undefined} /></label>
      {#if locked}<p class="muted note" id="tariff-fix-hc-note">{m.tariff.fixNote(fmtDateLong(hcFrom))}</p>{/if}
      <HcScheduleEditor bind:variants bind:seasonal />
    </fieldset>
  {/if}

  {#if error}<p class="error" role="alert">{error()}</p>{/if}
  {#if saved}<p class="ok" role="status">{m.tariff.saved}</p>{/if}
  <div class="buttons">
    <button type="submit" class="btn btn-primary" aria-disabled={busy}>{busy ? m.tariff.saving : m.tariff.save}</button>
    {#if oncancel}<button type="button" class="btn btn-ghost" onclick={() => oncancel?.()}>{m.common.cancel}</button>{/if}
  </div>
</form>

<style>
  .tariff {
    display: grid;
    gap: 14px;
  }
  .note {
    font-size: 13px;
    margin: 0;
  }
  /* Intrinsic widths in wrapping groups (DESIGN Form fields): kVA, dates, prices and times are as wide
     as their value, never a stretched column. */
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ctl-gap) 16px;
  }
  .field {
    display: grid;
    justify-items: start;
    gap: 6px;
    font-size: 13px;
    color: var(--mu);
  }
  fieldset {
    border: 0;
    border-top: 1px solid var(--line);
    padding: 14px 0 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }
  legend {
    font-size: 13px;
    font-weight: 600;
    color: var(--tx);
    padding: 0;
    margin-bottom: 8px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  input[readonly] {
    color: var(--mu);
  }
  .error {
    color: var(--bad);
    font-size: 13px;
    margin: 0;
  }
  .ok {
    color: var(--ok);
    font-size: 13px;
    margin: 0;
  }
  .row,
  .contract-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 10px;
  }

  /* Long button labels wrap instead of widening the page (320 px). */
  .row :global(.btn),
  .contract-row :global(.btn) {
    white-space: normal;
    max-width: 100%;
    min-width: 0;
    text-align: left;
  }
  .contract {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    font-size: 13px;
  }
  .contract p {
    margin: 0;
  }
  /* Three choices share the width from 320 px (« Peak/Off-peak » is the widest label). */
  .options {
    max-width: 420px;
  }
  .options :global(.seg) {
    display: flex;
    width: 100%;
  }
  .options :global(.seg button) {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 8px;
  }
</style>
