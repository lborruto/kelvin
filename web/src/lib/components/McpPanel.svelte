<!-- Réglages › Compte › Accès MCP (Plan 13, spec MCP §5.4; Tableau mockups 5 « Compte »): read-only tokens for
     an AI assistant, inside the « Accès MCP » grouped list: the lead, one row per token (key disc, name and its
     last four characters, created and last call; revoked rows muted, without actions), revoke in the row's « ⋯ »
     menu after a confirmation, « Nom du jeton » + « Créer un jeton », then the recent calls in a Disclosure (L2;
     refusals are counted rows, the count always shown). A token's secret is shown once, in a dialog on desktop
     or a bottom sheet on a phone, with the Claude Code and Claude Desktop snippets; closing it drops the secret
     from the page (never kept client-side). -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { McpAuditRow, McpCreated, McpToken, McpTokenList } from '$lib/api/types';
  import { fmtAgo, fmtDateTime } from '$lib/format';
  import { errorText, m } from '$lib/i18n';
  import { claudeCodeSnippet, claudeDesktopSnippet, endpointUrl } from '$lib/mcp';
  import { toasts } from '$lib/stores/toasts.svelte';
  import { tick } from 'svelte';
  import Disclosure from './Disclosure.svelte';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import Sheet from './Sheet.svelte';

  interface Props {
    /** True once the tokens (or their error) are known: what follows waits for it (CLS). */
    ready?: boolean;
  }
  let { ready = $bindable(false) }: Props = $props();
  const uid = $props.id();
  let list = $state<McpTokenList | null>(null);
  let calls = $state<McpAuditRow[]>([]);
  let failed = $state(false);
  let busy = $state(false);
  let name = $state('');
  let created = $state<McpCreated | null>(null);
  let target = $state<McpToken | null>(null);
  let copied = $state<string | null>(null);
  let revealing = $state(false);
  let confirming = $state(false);
  let cancel = $state<HTMLButtonElement>();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  async function load() {
    failed = false;
    try {
      [list, calls] = await Promise.all([api.mcpTokens(), api.mcpAudit(10)]);
    } catch {
      failed = true;
    }
  }
  $effect(() => {
    load();
  });
  $effect(() => {
    ready = list !== null || failed;
  });

  let url = $derived(list ? endpointUrl(location.origin, list.endpoint_path) : '');

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      created = await api.createMcpToken(name.trim() || m.mcp.defaultName);
      name = '';
      copied = null;
      revealing = true;
      await load();
    } catch (err) {
      toasts.push(() => errorText(err));
    } finally {
      busy = false;
    }
  }

  /** Closing the sheet (button, Esc, scrim, drag) drops the secret: it is never kept in the page. */
  function closeReveal() {
    revealing = false;
    created = null;
    copied = null;
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
    } catch {
      copied = null;
    }
  }

  function ask(t: McpToken) {
    if (busy) return;
    target = t;
    confirming = true;
    void tick().then(() => cancel?.focus()); // the safe choice takes focus
  }
  function closeConfirm() {
    confirming = false;
    target = null;
  }

  async function revoke() {
    const t = target;
    closeConfirm();
    if (!t) return;
    busy = true;
    try {
      await api.revokeMcpToken(t.id);
      toasts.push(() => m.mcp.revokedToast, 'info');
      await load();
    } catch (err) {
      toasts.push(() => errorText(err));
    } finally {
      busy = false;
    }
  }
</script>

{#if list === null && !failed}
  <div class="sk" aria-hidden="true">
    <span class="skeleton inset lead-sk"></span>
    <span class="skeleton inset row-sk"></span>
    <span class="skeleton inset form-sk"></span>
  </div>
{:else if failed && list === null}
  <p class="error" role="alert">{m.mcp.loadError} <button type="button" class="btn btn-sm" onclick={load}>{m.mcp.retry}</button></p>
{:else if list}
  <p class="intro">{m.mcp.intro}</p>
  {#if !list.enabled}
    <p class="muted small">{m.mcp.disabled}</p>
  {:else}
    {#if list.tokens.length === 0}
      <p class="muted small empty">{m.mcp.empty}</p>
    {:else}
      <ul class="list" aria-label={m.mcp.title}>
        {#each list.tokens as t (t.id)}
          <li class="row" class:revoked={t.revoked_at !== null}>
            <span class="disc" aria-hidden="true"><Icon name="key" size={16} /></span>
            <div class="who">
              <span class="name">{t.name} <span class="hint mono">{m.mcp.hint(t.hint)}</span></span>
              <span class="sub">
                {m.mcp.created(fmtDateTime(t.created * 1000))} ·
                {#if t.revoked_at !== null}
                  {m.mcp.revokedOn(fmtDateTime(t.revoked_at * 1000))}
                {:else}
                  {t.last_used === null ? m.mcp.neverUsed : m.mcp.lastUsed(fmtAgo(t.last_used * 1000, now))}
                {/if}
              </span>
            </div>
            {#if t.revoked_at === null}
              <Menu label={m.mcp.actionsFor(t.name)} items={[{ label: m.mcp.revoke, icon: 'x', danger: true, onselect: () => ask(t) }]} />
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <form class="create" onsubmit={create}>
      <label for="{uid}-name" class="visually-hidden">{m.mcp.nameLabel}</label>
      <input id="{uid}-name" bind:value={name} maxlength="40" placeholder={m.mcp.namePlaceholder} autocomplete="off" />
      <button type="submit" class="btn btn-primary" aria-disabled={busy} aria-busy={busy}>{m.mcp.create}</button>
    </form>
    <Disclosure title={m.mcp.recent} meta={calls.length ? m.mcp.recentMeta(calls.length) : undefined} detail>
      {#if calls.length === 0}
        <p class="muted small">{m.mcp.noCalls}</p>
      {:else}
        <ul class="calls">
          {#each calls as row, i (i)}
            <li>
              <span class="mono call">{row.name}</span>
              <span class="muted small">{[row.token_name ?? m.mcp.unknownToken, m.mcp.outcome[row.outcome], row.count > 1 ? m.mcp.times(row.count) : null, fmtAgo(row.at * 1000, now)].filter(Boolean).join(' · ')}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </Disclosure>
  {/if}
{/if}

<Sheet open={revealing && !!created} title={created ? m.mcp.secretTitle(created.token.name) : ''} width={560} onclose={closeReveal} noClose>
  {#if created}
    <p class="once">{m.mcp.secretOnce}</p>
    <div class="snip">
      <code class="mono secret">{created.secret}</code>
      <button type="button" class="btn btn-sm" aria-label={m.mcp.copyLabel(m.mcp.secretLabel)}
        onclick={() => copy('secret', created!.secret)}><Icon name={copied === 'secret' ? 'check' : 'copy'} size={14} />{copied === 'secret' ? m.mcp.copied : m.mcp.copy}</button>
    </div>
    <h3>{m.mcp.claudeCode}</h3>
    <div class="snip">
      <pre class="mono">{claudeCodeSnippet(url, created.secret)}</pre>
      <button type="button" class="btn btn-sm" aria-label={m.mcp.copyLabel(m.mcp.claudeCode)}
        onclick={() => copy('code', claudeCodeSnippet(url, created!.secret))}><Icon name={copied === 'code' ? 'check' : 'copy'} size={14} />{copied === 'code' ? m.mcp.copied : m.mcp.copy}</button>
    </div>
    <h3>{m.mcp.claudeDesktop}</h3>
    <div class="snip">
      <pre class="mono">{claudeDesktopSnippet(url, created.secret)}</pre>
      <button type="button" class="btn btn-sm" aria-label={m.mcp.copyLabel(m.mcp.claudeDesktop)}
        onclick={() => copy('desktop', claudeDesktopSnippet(url, created!.secret))}><Icon name={copied === 'desktop' ? 'check' : 'copy'} size={14} />{copied === 'desktop' ? m.mcp.copied : m.mcp.copy}</button>
    </div>
  {/if}
  {#snippet footer()}
    <div class="actions"><button type="button" class="btn btn-primary" onclick={closeReveal}>{m.mcp.done}</button></div>
  {/snippet}
</Sheet>

<Sheet open={confirming} title={m.mcp.confirmTitle(target?.name ?? '')} width={400} onclose={closeConfirm} noClose>
  <p class="once">{m.mcp.confirmBody}</p>
  {#snippet footer()}
    <div class="actions">
      <button type="button" class="btn" bind:this={cancel} onclick={closeConfirm}>{m.common.cancel}</button>
      <button type="button" class="btn btn-danger" onclick={revoke}>{m.mcp.revoke}</button>
    </div>
  {/snippet}
</Sheet>

<style>
  .intro {
    margin: 0;
    padding: 12px 0;
    font-size: 13px;
    color: var(--mu);
  }
  .small {
    font-size: 13px;
  }
  .empty {
    margin: 0 0 4px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  .disc {
    display: grid;
    place-items: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--s2);
  }
  .who {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .hint {
    margin-left: 2px;
    font-weight: 400;
    font-size: 12px;
    color: var(--fa);
  }
  .sub {
    font-size: 12.5px;
    color: var(--mu);
  }
  .revoked {
    color: var(--fa);
  }
  .revoked .name,
  .revoked .sub {
    color: var(--fa);
  }
  .revoked .disc {
    opacity: 0.5;
  }
  /* The skeleton: the lead, one token row and the create line. */
  .sk {
    display: grid;
    gap: 10px;
    padding: 12px 0 14px;
  }
  .lead-sk {
    display: block;
    height: 34px;
  }
  .row-sk {
    display: block;
    height: 56px;
  }
  .form-sk {
    display: block;
    height: 44px;
  }
  .create {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 10px 0 4px;
  }
  .create input {
    flex: 1 1 11rem;
    min-width: 0;
    min-height: 44px;
  }
  .calls {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .calls li {
    display: flex;
    flex-wrap: wrap;
    column-gap: 8px;
    min-width: 0;
  }
  .call {
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .error {
    margin: 12px 0;
    color: var(--bad);
  }
  .once {
    margin: 0 0 14px;
    font-size: 13.5px;
    color: var(--mu);
  }
  h3 {
    margin: 14px 0 6px;
    font-size: var(--fs-note);
    font-weight: 500;
    color: var(--fa);
  }
  .snip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .snip code,
  .snip pre {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--s2);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .secret {
    font-weight: 600;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
