<script lang="ts" module>
  /** Reconnecting stays silent this long (the sidebar ring turns dashed), then a neutral banner. */
  export const QUIET_MS = 60_000;
  /** After this long without Kelvin the banner turns bad and offers « Réessayer ». */
  export const DOWN_MS = 180_000;
</script>

<!-- The connection strip atop the main column (direction-2 §6): the browser offline is neutral at once;
     Kelvin's stream lost is silent for 60 s, then neutral, then bad after 3 min with « Réessayer »;
     Cozytouch unreachable and a refused password stay bad. Every message says how old the data is. -->
<script lang="ts">
  import type { Status } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import { stamp } from '$lib/provenance';
  import Icon from './Icon.svelte';

  interface Props {
    connection: 'connecting' | 'open' | 'reconnecting';
    status: Status;
    now: number;
    /** The browser says it is offline (`navigator.onLine`, the window's offline/online events). */
    offline?: boolean;
    /** When Kelvin's stream was lost (epoch ms). */
    lostAt?: number | null;
    /** When Kelvin last sent anything (epoch ms): « données de 21:14 ». */
    dataAt?: number | null;
    /** « Réessayer » once Kelvin has been silent for 3 min. */
    onretry?: () => void;
  }
  let { connection, status, now, offline = false, lostAt = null, dataAt = null, onretry = () => location.reload() }: Props = $props();
  let rejected = $derived(connection === 'open' && !!status.auth_rejected);
  let time = $derived(dataAt != null ? stamp(dataAt, now) : null);
  // Any state but open counts once the stream was lost: a retry ('connecting') never resets the stages.
  let lost = $derived(connection !== 'open' && lostAt != null ? now - lostAt : 0);
  let state = $derived.by((): { tone: 'neutral' | 'bad'; text: string; icon: 'wifi-off' | 'alert'; retry?: boolean } | null => {
    if (offline) return { tone: 'neutral', text: m.banner.offline(time), icon: 'wifi-off' };
    if (lost >= DOWN_MS) return { tone: 'bad', text: m.banner.kelvinDown(Math.floor(lost / 60_000), time), icon: 'alert', retry: true };
    // Nothing ever arrived (Kelvin unreachable at load): no quiet minute, the page would only show skeletons.
    if (lost >= QUIET_MS || (connection === 'reconnecting' && dataAt == null))
      return { tone: 'neutral', text: m.banner.reconnecting(time), icon: 'wifi-off' };
    if (rejected) return { tone: 'bad', text: m.banner.passwordChanged, icon: 'alert' };
    if (connection === 'open' && !status.connected) {
      const text = status.last_ok_at ? m.banner.unreachableAt(stamp(status.last_ok_at * 1000, now)) : m.banner.unreachable;
      return { tone: 'bad', text, icon: 'alert' };
    }
    return null;
  });
</script>

<!-- The live region is always mounted (it announces); the strip opens by its grid row, never by a jump. -->
<div class="wrap" class:banner-on={!!state}>
  <div class="clip">
    <div class="banner {state?.tone ?? ''}" role="status">
      {#if state}
        <span class="ic"><Icon name={state.icon} size={16} /></span><span>{state.text}</span>
        {#if rejected && state.tone === 'bad' && !state.retry}<a href="{ROUTES.login}?reauth=1">{m.banner.signInAgain}</a>{/if}
        {#if state.retry}<button type="button" class="btn btn-sm retry" onclick={onretry}>{m.common.retry}</button>{/if}
      {/if}
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
    background: var(--s1);
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  /* Neutral (offline, reconnecting): s2, a hairline, a muted glyph. Nothing to fix, only to know. */
  .banner.neutral {
    background: var(--s2);
  }
  .neutral .ic {
    color: var(--mu);
  }
  .banner.bad {
    background: color-mix(in srgb, var(--bad) 14%, var(--s1));
  }
  .ic {
    display: grid;
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
  .retry {
    margin: -6px 0 -6px auto;
    background: var(--s1);
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
