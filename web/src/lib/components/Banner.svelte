<script lang="ts">
  import type { Status } from '$lib/api/types';
  import { fmtAgo } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import Icon from './Icon.svelte';

  interface Props {
    connection: 'connecting' | 'open' | 'reconnecting';
    status: Status;
    now: number;
  }
  let { connection, status, now }: Props = $props();
  let rejected = $derived(connection === 'open' && !!status.auth_rejected);
  let message = $derived.by(() => {
    if (connection === 'reconnecting') return m.banner.reconnecting;
    if (rejected) return m.banner.passwordChanged;
    if (connection === 'open' && !status.connected) {
      return status.last_ok_at ? m.banner.unreachableSince(fmtAgo(status.last_ok_at * 1000, now)) : m.banner.unreachable;
    }
    return '';
  });
</script>

<!-- The live region is always mounted (it announces); the strip opens by its grid row, never by a jump. -->
<div class="wrap" class:banner-on={!!message}>
  <div class="clip">
    <div class="banner" role="status">
      {#if message}<Icon name="alert" size={16} /><span>{message}</span>{#if rejected}<a href="{ROUTES.login}?reauth=1">{m.banner.signInAgain}</a>{/if}{/if}
    </div>
  </div>
</div>

<style>
  /* Sticky: on a long phone page the state of the connection stays in view. */
  .wrap {
    position: sticky;
    top: 0;
    z-index: 15;
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--t-enter) var(--ease-out);
    view-transition-name: banner;
  }
  .wrap.banner-on {
    grid-template-rows: 1fr;
  }
  .clip {
    min-height: 0;
    overflow: hidden;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 10px 16px;
    background: color-mix(in srgb, var(--bad) 14%, var(--s1));
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .banner :global(svg) {
    flex: none;
  }
  a {
    margin-left: auto;
    min-height: 44px;
    margin-block: -10px;
    display: inline-flex;
    align-items: center;
    color: var(--tx);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  @media (min-width: 1024px) {
    .banner {
      padding: 10px 28px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .wrap {
      transition: none;
    }
  }
</style>
