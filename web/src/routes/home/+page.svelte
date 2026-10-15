<script lang="ts">
  import { goto } from '$app/navigation';
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import type { LinkyStatus, SettingsView } from '$lib/api/types';
  import AlertList from '$lib/components/AlertList.svelte';
  import HouseActions from '$lib/components/HouseActions.svelte';
  import LinkyPanel from '$lib/components/LinkyPanel.svelte';
  import SessionsPanel from '$lib/components/SessionsPanel.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import SupportChip from '$lib/components/SupportChip.svelte';
  import Stepper from '$lib/components/Stepper.svelte';
  import TariffForm from '$lib/components/TariffForm.svelte';
  import { fmtAgo, fmtDateTime, fmtTemp } from '$lib/format';
  import { roomName } from '$lib/setup';
  import { apiMessage, LOCALE_NAMES, LOCALES, locale, m, setLocale, statusError } from '$lib/i18n';
  import { ANCHORS, ROUTES } from '$lib/paths';
  import { alerts } from '$lib/stores/alerts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { theme, type ThemeChoice } from '$lib/stores/theme';
  import { VERSION } from '$lib/version';

  const tomorrowAt18 = () => {
    const d = new Date(Date.now() + 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
  };

  let until = $state(tomorrowAt18());
  let awayTemp = $state(12);
  let themeChoice = $state<ThemeChoice>(theme.get());
  let now = $state(Date.now());
  let untilError = $state<(() => string) | null>(null);
  const nowLocal = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  let minUntil = $state(nowLocal());

  function startAway() {
    if (!house.online) return;
    if (!until || new Date(until).getTime() <= Date.now()) {
      untilError = () => apiMessage('end_in_past');
      return;
    }
    untilError = null;
    run(() => api.houseAway(until, awayTemp));
  }
  $effect(() => {
    const t = setInterval(() => {
        now = Date.now();
        minUntil = nowLocal();
      }, 30_000);
    return () => clearInterval(t);
  });

  const roomsOf = (ids: string[]) =>
    house.rooms.filter((r) => r.radiator_ids.some((i) => ids.includes(i))).map((r) => roomName(r)).join(', ') || m.home.wholeHome;

  let loggingOut = $state(false);
  async function logout() {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await auth.logout();
    } catch {
      toasts.push(() => m.home.logoutFailed);
      return;
    } finally {
      loggingOut = false;
    }
    await goto(ROUTES.login, { replaceState: true });
  }

  let settingsView = $state<SettingsView | null>(null);
  let linkyStatus = $state<LinkyStatus | null>(null);
  let tariffError = $state<(() => string) | null>(null);
  let linkyError = $state<(() => string) | null>(null);

  function loadTariff() {
    tariffError = null;
    api.settings().then((s) => (settingsView = s)).catch(() => (tariffError = () => m.home.tariffLoadFailed));
  }
  function loadLinky() {
    linkyError = null;
    api.linkyStatus().then((s) => (linkyStatus = s)).catch(() => (linkyError = () => m.home.linkyLoadFailed));
  }
  $effect(() => {
    loadTariff();
    loadLinky();
  });
  // Tarif, Linky and Réglages appear together, once both answers are in: nothing on screen moves. The
  // alerts' answer is one of them: their panel (above) takes its real height in that same frame.
  let settled = $derived((!!settingsView || !!tariffError) && (!!linkyStatus || !!linkyError) && alerts.answered);
  // The panels come after the anchors: once they render, land on the anchor again.
  let landed = false;
  $effect(() => {
    if (!settled || landed) return;
    landed = true;
    const id = location.hash.slice(1);
    if (id !== ANCHORS.tariff && id !== ANCHORS.linky) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  });

  // The form keeps its fields and its « Tarif enregistré. »; its price history follows the prop.
  function tariffSaved(s: SettingsView) {
    settingsView = s;
  }

  const THEMES: ThemeChoice[] = ['system', 'dark', 'light'];

  function setTheme(v: ThemeChoice) {
    themeChoice = v;
    theme.set(v);
  }
</script>

<svelte:head><title>{m.page.title(m.nav.home)}</title></svelte:head>

<h1>{m.nav.home}</h1>

<section id={ANCHORS.away} class="panel">
  <h2>{m.away.title}</h2>
  <p class="muted">{m.away.lead}</p>
  <div class="row">
    <label class="field"><span>{m.away.until} <span class="hint">{m.away.parisTime}</span></span><input type="datetime-local" min={minUntil}
        bind:value={until} /></label>
    <div class="field"><span>{m.away.temperature}</span>
      <Stepper label={m.away.tempLabel} value={awayTemp} min={7} max={19} debounceMs={0} onchange={(v) => (awayTemp = v)} />
    </div>
    <button type="button" class="btn btn-primary" aria-disabled={!until || !house.online} onclick={startAway}>{m.away.start}</button>
  </div>
  {#if untilError}<p class="error" role="alert">{untilError()}</p>{/if}
</section>

<section class="panel">
  <h2>{m.home.active}</h2>
  {#if !house.loaded}
    <p class="line-sk"><span class="skeleton inset" aria-hidden="true"></span></p>
  {:else if house.overrides.length}
    <ul class="overrides">
      {#each house.overrides as o (o.id)}
        <li>
          <div>
            <strong>{m.home.kind[o.kind]}</strong> · {roomsOf(o.radiator_ids)} · {fmtTemp(o.temperature)}
            <div class="muted small">{o.restoring ? m.home.restoring : m.home.until(fmtDateTime(o.ends_at * 1000))}</div>
          </div>
          <button type="button" class="btn btn-sm" aria-label={m.home.cancelLabel(m.home.kind[o.kind], roomsOf(o.radiator_ids))}
            aria-disabled={!house.online} onclick={() => house.online && run(() => api.cancelOverride(o.id))}>{m.common.cancel}</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{m.home.none}</p>
  {/if}
</section>

<section class="panel">
  <h2>Actions</h2>
  <div class="row">
    <HouseActions program away={false} />
  </div>
</section>

<!-- Below the always-drawn panels, so the alerts' arrival moves nothing that is already there. -->
<section id={ANCHORS.alerts} class="panel">
  <h2>{m.alerts.title}</h2>
  <AlertList hold={!settled} />
</section>

<!-- Everything below the alerts is drawn in the frame the alerts take their real height (it depends on how
     their text wraps, so on the font): nothing that is already on screen is ever pushed down. -->
{#if settled}
  <section class="panel">
    <h2>{m.devices.title}</h2>
    <p>{m.devices.homeText}</p>
    <a class="btn btn-sm" href={ROUTES.devices}>{m.devices.open}</a>
  </section>

  <section id={ANCHORS.tariff} class="panel">
    <h2>{m.home.tariff}</h2>
    {#if settingsView}
      <TariffForm settings={settingsView} onsaved={tariffSaved} />
    {:else}
      <p class="error" role="alert">{tariffError?.()} <button type="button" class="btn btn-sm" onclick={loadTariff}>{m.common.retry}</button></p>
    {/if}
  </section>

  <section id={ANCHORS.linky} class="panel">
    <h2>Linky</h2>
    {#if linkyStatus}
      <LinkyPanel status={linkyStatus} onsaved={(s) => (linkyStatus = s)} />
    {:else}
      <p class="error" role="alert">{linkyError?.()} <button type="button" class="btn btn-sm" onclick={loadLinky}>{m.common.retry}</button></p>
    {/if}
  </section>

  <section id={ANCHORS.sessions} class="panel">
    <h2>{m.sessions.title}</h2>
    <SessionsPanel />
  </section>

  <section class="panel">
    <h2>{m.settings.title}</h2>
    <dl>
      <div class="item">
        <dt>{m.settings.account}</dt>
        <dd class="account">
          <span class="email">{auth.email ?? '—'}</span>
          <button type="button" class="btn btn-sm" aria-disabled={loggingOut} onclick={logout}>{m.settings.signOut}</button>
        </dd>
      </div>
      <div class="item">
        <dt>Cozytouch</dt>
        <dd>
          <span>{house.status.connected ? m.settings.connected : m.settings.unreachable}</span>
          {#if house.status.last_ok_at}<span class="muted"> · {m.settings.lastSync(fmtAgo(house.status.last_ok_at * 1000, now))}</span>{/if}
          {#if house.status.last_error}<div class="muted small" title={house.status.last_error}>{statusError(house.status)}</div>{/if}
        </dd>
      </div>
      <div class="item">
        <dt>{m.settings.theme}</dt>
        <dd>
          <Segmented options={THEMES.map((t) => ({ value: t, label: m.settings.themes[t] }))} value={themeChoice} label={m.settings.theme}
            onchange={setTheme} />
        </dd>
      </div>
      <div class="item">
        <dt>{m.settings.language}</dt>
        <dd>
          <Segmented options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l], lang: l }))} value={locale.current}
            label={m.settings.language} onchange={setLocale} />
        </dd>
      </div>
      <div class="item">
        <dt>{m.settings.server}</dt>
        <dd>{auth.server?.name ?? '—'}{#if auth.server?.tier === 'experimental'} <SupportChip support="experimental" />{/if}</dd>
      </div>
      <div class="item">
        <dt>Version</dt>
        <dd class="mono">Kelvin {VERSION}</dd>
      </div>
    </dl>
  </section>
{:else}
  <!-- No height: the anchors exist from the first render (/home#tariff, #linky), the panels come with the rest. -->
  <div id={ANCHORS.tariff} aria-busy="true"></div>
  <div id={ANCHORS.linky} aria-busy="true"></div>
{/if}

<style>
  h1 {
    font-size: 22px;
    margin: 0 0 12px;
  }
  h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    margin: 0 0 8px;
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    margin-bottom: 14px;
    max-width: 720px;
  }
  p {
    font-size: 13px;
    margin: 0 0 10px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 12px;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  .hint {
    font-weight: 400;
  }
  .line-sk {
    display: flex;
    align-items: center;
    height: 19px;
  }
  .line-sk .skeleton {
    display: block;
    width: 12rem;
    height: 13px;
    border-radius: 4px;
  }
  .overrides {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .overrides li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .error {
    color: var(--bad);
    margin: 8px 0 0;
  }
  .panel > .error:first-of-type {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0;
  }
  .error .btn {
    color: var(--tx);
  }
  .small {
    font-size: 12px;
  }
  /* Réglages: label and value share a row, centred on the 44 px controls. */
  dl {
    display: grid;
    gap: 6px;
    margin: 0;
    font-size: 13px;
  }
  .item {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    align-items: center;
    gap: 4px 14px;
    min-height: 44px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .account {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }
  .email {
    overflow-wrap: anywhere;
  }
  /* Phone: the label column takes only what it needs, so the theme control fits at 360 px. */
  @media (max-width: 599px) {
    .item {
      grid-template-columns: max-content minmax(0, 1fr);
    }
  }
  /* Narrowest phones: the label sits above its value. */
  @media (max-width: 359px) {
    .item {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  }
</style>
