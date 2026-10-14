<script lang="ts">
  import { untrack } from 'svelte';
  import { api, ApiError } from '$lib/api/client';
  import type { SettingsView, Slot } from '$lib/api/types';
  import { fmtAmount, fmtDateLong, parisTodayIso, parseDecimal } from '$lib/format';

  const KVA = [3, 6, 9, 12, 15, 18, 24, 30, 36];
  interface Props {
    settings: SettingsView;
    onsaved: (s: SettingsView) => void;
  }
  let { settings, onsaved }: Props = $props();

  const dec = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));
  // The fields start from the saved tariff, else the Enedis contract; only the history follows the prop.
  const init = untrack(() => {
    const t = settings.tariff;
    const today = parisTodayIso();
    // The price in force today (a future-dated entry must not seed the fields).
    const last = t?.prices.filter((p) => p.valid_from <= today).at(-1);
    const saved = t?.hc_slots.length ? t.hc_slots : settings.prefill?.hc_slots.length ? settings.prefill.hc_slots : null;
    return {
      today,
      inForce: last,
      kva: t?.kva ?? settings.prefill?.kva ?? 6,
      slots: (saved ?? [{ start: '22:00', end: '06:00' }]).map((s) => ({ ...s })),
      sub: dec(last?.subscription_eur_month),
      hc: dec(last?.hc_eur_kwh),
      hp: dec(last?.hp_eur_kwh)
    };
  });
  let kva = $state(init.kva);
  let slots = $state<Slot[]>(init.slots);
  let sub = $state(init.sub);
  let hc = $state(init.hc);
  let hp = $state(init.hp);
  let validFrom = $state(init.today);
  let kvaOptions = $derived(KVA.includes(kva) ? KVA : [...KVA, kva].sort((a, b) => a - b));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);
  let history = $derived(settings.tariff?.prices ?? []);

  function addSlot() {
    saved = false;
    if (slots.length < 3) slots.push({ start: '12:00', end: '14:00' });
  }
  function removeSlot(i: number) {
    saved = false;
    slots.splice(i, 1);
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    saved = false;
    const s = parseDecimal(sub);
    const h = parseDecimal(hc);
    const p = parseDecimal(hp);
    if (s === null || h === null || p === null) {
      error = 'Saisissez des montants valides (ex. 0,2068).';
      return;
    }
    if (!slots.length) {
      error = 'Indiquez au moins une plage d’heures creuses.';
      return;
    }
    if (!validFrom) {
      error = 'Choisissez une date.';
      return;
    }
    // Prices untouched and date left on today: re-send the entry in force (same date, so it is
    // replaced) rather than adding a duplicate row for a power or slot change.
    const f = init.inForce;
    const same =
      f && validFrom === init.today && s === f.subscription_eur_month && h === f.hc_eur_kwh && p === f.hp_eur_kwh;
    busy = true;
    try {
      const res = await api.putTariff({
        option: 'hchp',
        kva,
        hc_slots: slots.map((x) => ({ start: x.start, end: x.end })),
        subscription_eur_month: s,
        hc_eur_kwh: h,
        hp_eur_kwh: p,
        valid_from: same ? f.valid_from : validFrom
      });
      saved = true;
      onsaved(res);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Erreur inattendue.';
    } finally {
      busy = false;
    }
  }
</script>

<form class="tariff" onsubmit={save} oninput={() => (saved = false)} onchange={() => (saved = false)} novalidate>
  {#if !settings.tariff && settings.prefill}
    <p class="muted note">
      Prérempli d’après votre contrat Enedis ({settings.prefill.kva ?? '—'}&nbsp;kVA, heures creuses
      {settings.prefill.hc_slots.map((x) => `${x.start}–${x.end}`).join(' et ')}). Ajoutez vos prix TTC.
    </p>
  {/if}
  <div class="grid">
    <label class="field">
      <span>Puissance souscrite</span>
      <select bind:value={kva}>
        {#each kvaOptions as k (k)}<option value={k}>{k}&nbsp;kVA</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Abonnement (€/mois)</span>
      <input inputmode="decimal" autocomplete="off" bind:value={sub} />
    </label>
    <label class="field">
      <span>Prix heures creuses (€/kWh)</span>
      <input inputmode="decimal" autocomplete="off" bind:value={hc} />
    </label>
    <label class="field">
      <span>Prix heures pleines (€/kWh)</span>
      <input inputmode="decimal" autocomplete="off" bind:value={hp} />
    </label>
    <label class="field">
      <span>Applicable à partir du</span>
      <input type="date" bind:value={validFrom} />
    </label>
  </div>

  <fieldset>
    <legend>Heures creuses</legend>
    {#each slots as slot, i (i)}
      <div class="slot">
        <label class="field"><span>Début de la plage {i + 1}</span><input type="time" step="600" bind:value={slot.start} /></label>
        <label class="field"><span>Fin de la plage {i + 1}</span><input type="time" step="600" bind:value={slot.end} /></label>
        <button type="button" class="ghost" aria-label="Retirer la plage {i + 1}" disabled={slots.length === 1} onclick={() => removeSlot(i)}>Retirer</button>
      </div>
    {/each}
    <button type="button" class="ghost" disabled={slots.length >= 3} onclick={addSlot}>Ajouter une plage</button>
  </fieldset>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if saved}<p class="ok" role="status">Tarif enregistré.</p>{/if}
  <button type="submit" class="primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le tarif'}</button>

  {#if history.length}
    <!-- Units sit in the headers; below 600 px each price becomes a two-column list. -->
    <div class="table-wrap">
      <table aria-label="Historique des prix">
        <thead>
          <tr><th>Depuis</th><th class="r">Abonnement (€/mois)</th><th class="r">HC (€/kWh)</th><th class="r">HP (€/kWh)</th></tr>
        </thead>
        <tbody>
          {#each history as p (p.valid_from)}
            <tr>
              <td>{fmtDateLong(p.valid_from)}</td>
              <td class="r mono">{fmtAmount(p.subscription_eur_month, 2)}</td>
              <td class="r mono">{fmtAmount(p.hc_eur_kwh, 4)}</td>
              <td class="r mono">{fmtAmount(p.hp_eur_kwh, 4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <ul class="history-list" aria-label="Historique des prix">
      {#each history as p (p.valid_from)}
        <li>
          <dl>
            <dt>Depuis</dt><dd>{fmtDateLong(p.valid_from)}</dd>
            <dt>Abonnement (€/mois)</dt><dd class="mono">{fmtAmount(p.subscription_eur_month, 2)}</dd>
            <dt>HC (€/kWh)</dt><dd class="mono">{fmtAmount(p.hc_eur_kwh, 4)}</dd>
            <dt>HP (€/kWh)</dt><dd class="mono">{fmtAmount(p.hp_eur_kwh, 4)}</dd>
          </dl>
        </li>
      {/each}
    </ul>
  {/if}
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  input,
  select {
    min-height: 44px;
    padding: 0 10px;
    font: inherit;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    background: var(--in);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--tx);
    min-width: 0;
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
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    padding: 0;
    margin-bottom: 8px;
  }
  .slot {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    align-items: end;
    gap: 10px;
  }
  .ghost {
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: none;
    color: var(--mu);
    font-size: 12px;
    cursor: pointer;
    justify-self: start;
  }
  .primary {
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--tx);
    color: var(--bg);
    font-weight: 600;
    cursor: pointer;
    justify-self: start;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
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
  /* min-width: 0 lets the grid item shrink below the table's width, so the page never scrolls. */
  .table-wrap {
    overflow-x: auto;
    min-width: 0;
  }
  .history-list {
    display: none;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .history-list li {
    border-top: 1px solid var(--line);
    padding: 10px 0;
  }
  .history-list li:last-child {
    border-bottom: 1px solid var(--line);
  }
  .history-list dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
  }
  .history-list dt {
    color: var(--mu);
  }
  .history-list dd {
    margin: 0;
    text-align: right;
  }
  @media (max-width: 599px) {
    .table-wrap {
      display: none;
    }
    .history-list {
      display: block;
    }
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    padding: 8px 6px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    white-space: nowrap;
  }
  th {
    color: var(--mu);
    font-weight: 500;
  }
  .r {
    text-align: right;
  }
</style>
