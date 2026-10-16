<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, ApiError } from '$lib/api/client';
  import type { ServerInfo } from '$lib/api/types';
  import { safeNext } from '$lib/auth';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Wordmark from '$lib/components/Wordmark.svelte';
  import { errorText, LOCALE_NAMES, LOCALE_SHORT, LOCALES, locale, m, setLocale } from '$lib/i18n';
  import { dur, easeOut, T } from '$lib/motion';
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { auth } from '$lib/stores/auth.svelte';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<(() => string) | null>(null);
  let emailEl = $state<HTMLInputElement>();
  let passwordEl = $state<HTMLInputElement>();
  /** Which field the error is about, so it can be marked invalid and focused. */
  let invalid = $state<'email' | 'password' | 'both' | null>(null);
  let reauth = $derived(page.url.searchParams.get('reauth') === '1' || auth.reauth);
  /** The password shown in clear: only the input's `type` changes (its name and autocomplete stay, for password managers). */
  let revealed = $state(false);

  /** Plan 12: the servers Kelvin offers; `current` is the home's once claimed (then no choice). */
  let servers = $state<ServerInfo[]>([]);
  let current = $state<string | null>(null);
  let server = $state('sauter_cozytouch');
  let chosen = $derived(servers.find((s) => s.id === server));
  const group = (tier: ServerInfo['tier']) => servers.filter((s) => s.tier === tier);
  /** Batch 11: the choice of server sits behind « Changer » (a Sauter household never needs it). */
  let picking = $state(false);
  /** The account's own app, named in the lead and the forgotten-password line. */
  let experimental = $derived(chosen?.tier === 'experimental');

  /** A first login names the home's server, so nothing is sent before the list is known. */
  let listState = $state<'loading' | 'ready' | 'failed'>('loading');
  let ready = $derived(listState === 'ready');
  /** No home yet: this login claims it (the first-sign-in sentence and the server choice). */
  let claiming = $derived(ready && !current);

  function loadServers() {
    listState = 'loading';
    api
      .servers()
      .then((list) => {
        servers = list.servers;
        current = list.current;
        server = list.current ?? list.servers.find((s) => s.default)?.id ?? server;
        listState = 'ready';
      })
      .catch(() => {
        listState = 'failed';
      });
  }
  $effect(loadServers);

  $effect(() => {
    void auth.refresh().then((ok) => {
      if (ok === true) void goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    });
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = null;
    invalid = null;
    // Never leave a password in clear behind a submit (nor hand a text field to a password manager).
    revealed = false;
    if (!email.trim() || !password) {
      error = () => m.login.emptyFields;
      invalid = !email.trim() ? 'email' : 'password';
      await tick();
      (invalid === 'email' ? emailEl : passwordEl)?.focus();
      return;
    }
    if (!ready) return; // held: the list names the server a first login claims
    busy = true;
    try {
      // The server only on a first login with a list read: afterwards it is the home's.
      await auth.login(email.trim(), password, current ? undefined : server);
      password = '';
      await goto(safeNext(page.url.searchParams.get('next')), { replaceState: true });
    } catch (err) {
      error = () => errorText(err);
      // A refused account is about both fields (the password is the one to retype); a network or
      // server failure is about neither.
      invalid = err instanceof ApiError && (err.status === 401 || err.status === 403) ? 'both' : null;
      busy = false;
      await tick();
      passwordEl?.focus();
      passwordEl?.select();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{m.page.title(m.login.title)}</title></svelte:head>

<main class="login">
  <form class="box" onsubmit={submit} novalidate>
    <div class="brand"><Wordmark size="lg" /></div>
    <div class="head">
      <h1>{m.login.title}</h1>
      <p class="muted lead">{experimental && chosen ? m.login.leadServer(chosen.name) : m.login.lead}</p>
    </div>
    {#if reauth}<p class="note" role="status">{m.login.reauth}</p>{/if}

    <!-- The server line holds one 20 px line from the first paint (skeleton, then the line): nothing moves
         when the list arrives. Opening « Changer » is the only thing that grows it. -->
    <div class="server">
      {#if listState === 'loading'}
        <div class="line"><span class="skeleton sk" aria-hidden="true"></span></div>
      {:else if listState === 'failed'}
        <div class="error failed" role="alert">
          <p>{m.servers.loadFailed}</p>
          <button type="button" class="btn btn-sm" onclick={loadServers}>{m.common.retry}</button>
        </div>
      {:else if chosen}
        <p class="line">
          <span class="name">{m.login.serverLine(chosen.name)}</span>
          {#if claiming}
            <span class="dot" aria-hidden="true">·</span>
            <button type="button" class="change hit" aria-expanded={picking} aria-controls={picking ? 'server-pick' : undefined}
              onclick={() => (picking = !picking)}>{m.login.change}</button>
          {/if}
        </p>
        {#if claiming && picking}
          <div class="pick" id="server-pick" transition:slide={{ duration: dur(T.enter), easing: easeOut }}>
            <label class="field">
              <span class="visually-hidden">{m.servers.label}</span>
              <select name="server" bind:value={server} aria-describedby={experimental ? 'server-note' : undefined}>
                <optgroup label={m.servers.cozytouch}>
                  {#each group('cozytouch') as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
                </optgroup>
                <optgroup label={m.servers.experimental}>
                  {#each group('experimental') as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
                </optgroup>
              </select>
            </label>
            {#if experimental}
              <p class="note" id="server-note" role="note">{m.servers.experimentalNote}</p>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <label class="field">
      <span>Email</span>
      <input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false"
        bind:this={emailEl} bind:value={email}
        aria-invalid={invalid === 'email' || invalid === 'both' ? 'true' : undefined}
        aria-describedby={error && invalid !== 'password' ? 'login-error' : undefined} />
    </label>
    <div class="field">
      <label for="login-password">{m.login.password}</label>
      <div class="pw">
        <input id="login-password" type={revealed ? 'text' : 'password'} name="password" autocomplete="current-password"
          autocapitalize="none" spellcheck="false" bind:this={passwordEl} bind:value={password}
          aria-invalid={invalid === 'password' || invalid === 'both' ? 'true' : undefined}
          aria-describedby={error && invalid !== 'email' ? 'login-error' : undefined} />
        <!-- A toggle: its name stays « Afficher le mot de passe », aria-pressed says whether it is shown. -->
        <!-- Named by its own (hidden) text, not aria-label: a lookup of the field by « Mot de passe » finds the field alone. -->
        <button type="button" class="btn btn-icon reveal" aria-pressed={revealed} aria-controls="login-password"
          onclick={() => (revealed = !revealed)}>
          <Icon name={revealed ? 'eye-off' : 'eye'} size={18} />
          <span class="visually-hidden">{m.login.show}</span>
        </button>
      </div>
    </div>
    {#if error}<p class="error" id="login-error" role="alert">{error()}</p>{/if}
    <!-- aria-disabled while busy: the focused button keeps focus through the round trip. -->
    <button type="submit" class="btn btn-primary btn-lg" aria-disabled={busy || !ready}>{busy ? m.login.busy : m.login.submit}</button>

    <div class="fine">
      <!-- With the list: the first-sign-in sentence (no home yet), or how the server is changed (a claimed
           home). Only the fine print and the language switch are below it. -->
      {#if claiming}<p>{m.login.firstClaim}</p>{:else if ready}<p>{m.login.serverFixed}</p>{/if}
      <p>{experimental && chosen ? m.login.forgotServer(chosen.name) : m.login.forgot}</p>
      {#if auth.simulator}<p>{m.login.simulator}</p>{/if}
    </div>
    <div class="lang">
      <Segmented options={LOCALES.map((l) => ({ value: l, label: LOCALE_SHORT[l], lang: l, ariaLabel: LOCALE_NAMES[l] }))}
        value={locale.current} label={m.settings.language} onchange={setLocale} />
    </div>
  </form>
</main>

<style>
  /* One 360 px column. Its top is set by the viewport alone (about a centred column on a desktop), never by
     its own height: the lines that arrive with the API cannot move the ones above them. */
  .login {
    min-height: 100dvh;
    display: grid;
    justify-items: center;
    align-content: start;
    padding: clamp(28px, calc(50svh - 300px), 160px) 16px 32px;
    background: var(--bg);
  }
  .box {
    width: min(100%, 360px);
    display: grid;
    gap: 14px;
  }
  .brand {
    display: flex;
    margin-bottom: 6px;
  }
  .head {
    display: grid;
    gap: 6px;
  }
  h1 {
    font-size: 22px;
    line-height: 28px;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .lead {
    font-size: 13px;
    line-height: 18px;
    margin: 0;
  }
  .note {
    font-size: 13px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
  }
  .server {
    display: grid;
    min-height: 20px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 20px;
    margin: 0;
    font-size: 13px;
    line-height: 20px;
    white-space: nowrap;
  }
  .sk {
    display: block;
    width: 62%;
    height: 13px;
    border-radius: 4px;
  }
  /* A long experimental server name gives way (ellipsis); « Changer » never does. */
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    color: var(--mu);
  }
  .change {
    flex: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    text-decoration: underline dotted var(--fa) 1px;
    text-underline-offset: 3px;
    cursor: pointer;
    touch-action: manipulation;
    transition: text-decoration-color var(--t-state) ease;
    --hit-y: -12px;
    --hit-x: -6px;
  }
  @media (hover: hover) {
    .change:hover {
      text-decoration-color: var(--mu);
    }
  }
  .change[aria-expanded='true'] {
    text-decoration-color: var(--tx);
  }
  .pick {
    display: grid;
    gap: 10px;
    padding-top: 10px;
  }
  .pick select {
    width: 100%;
  }
  .failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .failed p {
    margin: 0;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  .pw {
    position: relative;
    display: grid;
  }
  .pw input {
    padding-right: calc(var(--ctl-h) + 2px);
  }
  /* The browser's own reveal (Edge) would sit beside ours. */
  .pw input::-ms-reveal {
    display: none;
  }
  .reveal {
    position: absolute;
    top: 0;
    right: 0;
    border-radius: 0 var(--ctl-radius) var(--ctl-radius) 0;
  }
  .reveal[aria-pressed='true'] {
    color: var(--tx);
  }
  input[aria-invalid='true'] {
    border-color: var(--bad);
  }
  .error {
    color: var(--bad);
    font-size: 13px;
    margin: 0;
  }
  .fine {
    display: grid;
    gap: 6px;
    margin-top: -2px;
    font-size: 12px;
    line-height: 17px;
    color: var(--mu);
  }
  .fine p {
    margin: 0;
  }
  .lang {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }
</style>
