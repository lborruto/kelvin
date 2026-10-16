<!-- The app's one always-visible freshness signal (direction-2 §6): the sidebar's status footer,
     « ○ Cozytouch · il y a 1 min » as a SourceLine whose Fiche gives the connection state, the last reading
     and the last error. Dashed while Kelvin's own stream is not open (reconnecting, or before the first
     snapshot); a bad dot when Cozytouch is unreachable. -->
<script lang="ts">
  import { freshness, type Fresh } from '$lib/freshness';
  import { fmtAgo, fmtDateTime } from '$lib/format';
  import { m } from '$lib/i18n';
  import { provenance } from '$lib/provenance';
  import { house } from '$lib/stores/house.svelte';
  import type { FicheRow } from './FicheBody.svelte';
  import SourceLine from './SourceLine.svelte';

  interface Props {
    /** The clock (the layout's), so « il y a 1 min » keeps moving; injected in tests. */
    now: number;
  }
  let { now }: Props = $props();

  let at = $derived(house.status.last_ok_at != null ? house.status.last_ok_at * 1000 : null);
  let down = $derived(house.loaded && house.connection === 'open' && !house.status.connected);
  let state = $derived<Fresh>(
    down ? 'bad' : freshness('cozytouch', { at, waiting: house.connection !== 'open' || !house.loaded }, now)
  );
  let text = $derived(
    down ? m.settings.unreachable : !house.loaded ? m.shell.waiting : at != null ? fmtAgo(at, now) : m.shell.never
  );
  let rows = $derived.by(() => {
    const out: FicheRow[] = [
      { label: m.shell.state, value: !house.loaded ? m.shell.waiting : house.status.connected ? m.settings.connected : m.settings.unreachable },
      { label: m.shell.lastRead, value: at != null ? fmtDateTime(at) : '—', note: at != null ? null : m.shell.never }
    ];
    const code = house.status.last_error_code;
    if (code) out.push({ label: m.shell.lastError, value: m.cozytouch[code] });
    return out;
  });
</script>

<SourceLine source={m.prov.cozytouch} {text} {state} title={m.shell.cozytouchTitle} {rows}
  provenance={provenance('cozytouch', { at }, now)} />
