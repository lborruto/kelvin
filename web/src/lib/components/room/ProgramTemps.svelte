<!-- « Températures du programme »: Confort and Éco as two steppers (absolute °C, Éco with « x °C sous le
     confort »), in the room sheet and in Programme's « Modifier les températures » sheet. The limits come from the
     radiators' capabilities (Sauter: Éco ≤ Confort − 2 °C, the line at the limit with « Modifier Confort »); each
     stepper sends once, 1,5 s after the last tap, and a waiting value goes out when the sheet closes (Stepper).
     Radiators that disagree read as their mean (« Mixte (moyenne) »); a partial capability says how many take it.
     Nothing is drawn for a read-only or offline room, off, or a room without these setpoints. -->
<script lang="ts">
  import { run } from '$lib/actions';
  import { api } from '$lib/api/client';
  import { roomControls, roomRange } from '$lib/capabilities';
  import { fmtTemp } from '$lib/format';
  import { m } from '$lib/i18n';
  import { ROUTES } from '$lib/paths';
  import { agg } from '$lib/room';
  import { house } from '$lib/stores/house.svelte';
  import GroupedList from '../GroupedList.svelte';
  import ListRow from '../ListRow.svelte';
  import Stepper from '../Stepper.svelte';

  interface Props {
    roomId: string;
    /** Reconnecting or offline: the steppers dim (aria-disabled). */
    paused?: boolean;
    /** The group's heading (the room sheet); none in a sheet already named by it. */
    label?: string;
    /** « Modifier les horaires » under the steppers (the room sheet; not on Programme itself). */
    editHours?: boolean;
  }
  let { roomId, paused = false, label, editHours = false }: Props = $props();
  const uid = $props.id();

  let radiators = $derived(house.roomRadiators(roomId));
  let rc = $derived(roomControls(radiators));
  let comfortRange = $derived(roomRange(radiators, 'comfort'));
  let ecoRange = $derived(roomRange(radiators, 'eco'));
  let expected = $derived(house.roomExpected(roomId));
  let aComfort = $derived(agg(radiators.map((r) => r.comfort)));
  let aEco = $derived(agg(radiators.map((r) => r.eco_delta)));
  let comfortNow = $derived(expected.comfort ?? aComfort.value);
  let deltaNow = $derived(expected.eco_delta ?? aEco.value);
  let ecoNow = $derived(comfortNow != null && deltaNow != null ? comfortNow - deltaNow : null);
  // Éco stays at least the smallest lowering below Confort (Sauter: 2 °C); the line follows the draft on screen.
  let ecoShown = $state<number | null>(null);
  let ecoMax = $derived(comfortNow != null && ecoRange ? comfortNow - ecoRange[0] : null);
  let ecoCur = $derived(ecoShown ?? ecoNow);
  let ecoAtLimit = $derived(ecoMax != null && ecoCur != null && ecoCur >= ecoMax);
  let shown = $derived(!!comfortRange || (!!ecoRange && comfortNow != null));

  const setEco = (v: number) => comfortNow != null && run(() => api.roomSetpoint(roomId, 'eco', Math.round((comfortNow! - v) * 2) / 2));
  function focusComfort() {
    document.getElementById(`${uid}-comfort`)?.querySelector<HTMLElement>('.inc')?.focus();
  }
</script>

{#if shown}
  <GroupedList {label} id="{uid}-h">
    {#if comfortRange}
      <div class="li trow">
        <span class="sw comfort" aria-hidden="true"></span>
        <span class="x">{m.room.comfort}{#if aComfort.mixed && expected.comfort === undefined}<small>{m.room.mixedMean}</small>{/if}{#if rc.comfort < rc.total}<small>{m.roomCaps.partial(rc.comfort, rc.total)}</small>{/if}</span>
        <Stepper id="{uid}-comfort" label={m.room.comfort} announce={false} value={comfortNow} min={comfortRange[0]} max={comfortRange[1]} disabled={paused}
          pending={expected.comfort !== undefined} onchange={(v) => run(() => api.roomSetpoint(roomId, 'comfort', v))} />
      </div>
    {/if}
    {#if ecoRange && comfortNow != null}
      <div class="li trow">
        <span class="sw eco" aria-hidden="true"></span>
        <span class="x">{m.room.eco}{#if deltaNow != null}<small>{m.room.ecoBelow(fmtTemp(deltaNow))}</small>{/if}{#if aEco.mixed && expected.eco_delta === undefined}<small>{m.room.mixedMean}</small>{/if}{#if rc.eco < rc.total}<small>{m.roomCaps.partial(rc.eco, rc.total)}</small>{/if}{#if ecoAtLimit}<small
            class="limit">{m.roomSheet.ecoLimit(fmtTemp(ecoRange[0]))}{#if comfortRange}{' · '}<button type="button" class="linkbtn" onclick={focusComfort}>{m.roomSheet.editComfort}</button>{/if}</small>{/if}</span>
        <Stepper label={m.room.eco} announce={false} value={ecoNow} min={comfortNow - ecoRange[1]} max={comfortNow - ecoRange[0]}
          pending={expected.eco_delta !== undefined} disabled={paused} onchange={setEco} bind:shown={ecoShown} />
      </div>
    {/if}
    {#if editHours && rc.program > 0}
      <ListRow label={m.room.editHours} href="{ROUTES.schedule}?room={encodeURIComponent(roomId)}" />
    {/if}
  </GroupedList>
{/if}

<style>
  .sw {
    display: inline-block;
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
  .sw.comfort {
    background: var(--heat);
  }
  .sw.eco {
    background: var(--in);
    box-shadow: inset 0 0 0 1px var(--field);
  }
  .trow {
    gap: 12px;
  }
  .trow .x {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .trow small {
    color: var(--fa);
    font-size: 12px;
  }
  .trow small.limit {
    color: var(--mu);
  }
  /* An inline action in a muted line (« Modifier Confort »): text, underlined. */
  .linkbtn {
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
</style>
