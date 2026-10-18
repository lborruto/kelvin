<!-- The Tableau kit gallery (development only, /kit): every shared component in its states, on the real shell,
     for the screen batches and for screenshots. Demo data is fixed (vendredi 16 octobre 2026, 18:42) and
     marked; every word a component writes still comes from the dictionaries. -->
<script lang="ts">
  import type { GridView, Pending, Tariff } from '$lib/api/types';
  import Banner from '$lib/components/Banner.svelte';
  import Fig from '$lib/components/Fig.svelte';
  import GroupedList from '$lib/components/GroupedList.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import IconTile from '$lib/components/IconTile.svelte';
  import ListRow from '$lib/components/ListRow.svelte';
  import MaintenantCard from '$lib/components/MaintenantCard.svelte';
  import Menu from '$lib/components/Menu.svelte';
  import MiniBars from '$lib/components/MiniBars.svelte';
  import MiniSpark from '$lib/components/MiniSpark.svelte';
  import Notice from '$lib/components/Notice.svelte';
  import PendingTag from '$lib/components/PendingTag.svelte';
  import RoomTile from '$lib/components/RoomTile.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Stepper from '$lib/components/Stepper.svelte';
  import SummaryChip from '$lib/components/SummaryChip.svelte';
  import Swatch from '$lib/components/Swatch.svelte';
  import TempoDot from '$lib/components/TempoDot.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import VSlider from '$lib/components/VSlider.svelte';
  import Widget from '$lib/components/Widget.svelte';
  import ForecastStrip from '$lib/components/ForecastStrip.svelte';
  import TomorrowWidget from '$lib/components/dashboard/TomorrowWidget.svelte';
  import WeatherCostPanel from '$lib/components/WeatherCostPanel.svelte';
  import WeatherScatter from '$lib/components/WeatherScatter.svelte';
  import { fmtTemp, monthName } from '$lib/format';
  import { m } from '$lib/i18n';
  import { provenance } from '$lib/provenance';
  import { roomRows, roomValue, roomWhy } from '$lib/weatherCost';
  import { FORECAST, HIDDEN, OK, ROOM, THIN, forecastView, week } from '$lib/weatherModel.fixture';

  const NOW = Date.parse('2026-10-16T18:42:00+02:00');
  const START = Date.parse('2026-10-16T00:00:00+02:00');
  const END = START + 86_400_000;
  const H = 3_600_000;
  // Demo data (i18n-ignore below: room names and figures are data, not copy).
  const salon = 'Salon'; // i18n-ignore: demo room name
  const ch1 = 'Chambre 1'; // i18n-ignore: demo room name
  const ch2 = 'Chambre 2'; // i18n-ignore: demo room name
  const temp = Array.from({ length: 76 }, (_, i) => {
    const h = i / 4;
    const t = h < 6.5 ? 18.2 - h * 0.12 : h < 8 ? 17.4 + (h - 6.5) * 1.6 : h < 17 ? 19.8 - (h - 8) * 0.28 : 17.3 + Math.min(2.3, (h - 17) * 1.35);
    return { t: START + h * H, v: Math.round(t * 10) / 10 };
  });
  const slots: [number, number][] = [[6.5, 8], [17, 23]];
  const setpoint = Array.from({ length: 97 }, (_, i) => ({ t: START + (i / 4) * H, v: slots.some(([a, b]) => i / 4 >= a && i / 4 < b) ? 20 : 17 }));
  const bands = slots.map(([a, b]) => ({ from: START + a * H, to: START + b * H }));

  const tariff = (option: 'base' | 'hchp' | 'tempo', rates: Record<string, number>): Tariff => ({
    option, kva: 9, hc_slots: [{ start: '22:00', end: '06:00' }], hc_schedules: [],
    tempo_hours: { hc_start: '22:00', hc_end: '06:00', day_start: '06:00' },
    prices: [{ valid_from: '2026-01-01', option, subscription_eur_month: 23.48, rates }]
  });
  const grid: GridView = {
    tempo: { today: { date: '2026-10-16', colour: 'blue' }, tomorrow: { date: '2026-10-17', colour: 'white', expected_at: null }, fetched_at: null },
    ecowatt: { days: [], fetched_at: null },
    source: 'MyElectricalData'
  };
  const daily = [18.4, 17.9, 19.6, 21.3, 20.2, 22.8, 21.5, 23.0, 24.1, 25.6, 24.4, 27.0, 28.6, 26.9, 38.2];
  const parts = daily.map((k) => ({ hc: Math.round(k * 0.33 * 10) / 10, hp: Math.round(k * 0.67 * 10) / 10 }));
  const sending = { id: 'demo', status: 'pending', label: '', label_code: null } as unknown as Pending;

  let comfort = $state(20);
  let manual = $state(19.5);
  let slider = $state(20);
  let seg = $state<'day' | 'week' | 'month' | 'year'>('month');
  let tog = $state(false);
  let sheet = $state(false);
  let modal = $state(false);
  let sheetBtn = $state<HTMLButtonElement>();
  let modalBtn = $state<HTMLButtonElement>();
  let disclosure = $state(false);
  // Plan 15 « Météo et coût »: the contract's sample widened (weatherModel.fixture), in its states.
  const tempoWeek = { ...OK.forecast, week: null, days: week().map((d, i) => (i > 0 ? { ...d, eur: null, eur_lo: null, eur_hi: null, heating_eur: null, eur_why: 'tempo_colour_unknown' as const } : d)) };
  const holes = { ...OK.forecast, week: null, days: week().map((d, i) => (i > 3 ? { ...d, complete: false, t_c: null, kwh: null, heating_kwh: null, eur: null, heating_eur: null } : d)) };
  const warm = forecastView({ ...OK, forecast: { ...OK.forecast, days: [{ ...OK.forecast.days[0], t_c: 17.5, heating_kwh: 0, heating_eur: 0 }] } });
  const unknown = forecastView({ ...OK, forecast: tempoWeek });
  const roomHidden = { ...ROOM, state: 'hidden' as const, why: 'few_days' as const, kwh_per_c: null, kwh_per_c_range: null, eur_per_c: null, coverage: { days: 12, of: 60, share: 0.2 } };
</script>

<svelte:head><title>Kit · Kelvin</title></svelte:head>

<div class="kit">
  <h1 class="t-page">Kit</h1>
  <p class="muted">Tableau · {fmtTemp(19.6)} · 16/10/2026 18:42</p>

  <h2 class="areah"><span>Buttons</span></h2>
  <div class="row">
    <button type="button" class="btn btn-primary"><Icon name="resume" size={16} />{m.houseActions.allProgram}</button>
    <button type="button" class="btn"><Icon name="away" size={16} />{m.nav.away}</button>
    <button type="button" class="btn"><Icon name="power" size={16} />{m.houseActions.allOff}</button>
    <button type="button" class="btn btn-ghost">{m.common.cancel}</button>
    <button type="button" class="btn btn-danger">{m.houseActions.allOff}</button>
    <button type="button" class="btn btn-sm">{m.common.retry}</button>
    <button type="button" class="btn" aria-disabled="true">{m.common.retry}</button>
    <button type="button" class="btn btn-icon" aria-label={m.common.close}><Icon name="x" size={18} /></button>
    <button type="button" class="btn btn-icon btn-icon-lg" aria-label={m.nav.away}><Icon name="away" size={18} /></button>
  </div>
  <div class="narrow"><button type="button" class="btn btn-primary btn-lg btn-block"><Icon name="away" size={18} />{m.away.go}</button></div>

  <h2 class="areah"><span>SummaryChip</span></h2>
  <div class="chip-row">
    <SummaryChip icon="flame" label="Climat" value="19,1–19,6° · 1 en chauffe" href="/" /><!-- i18n-ignore: demo chip -->
    <SummaryChip icon="euro" label="Octobre" value="100,22 €" href="/energy" /><!-- i18n-ignore: demo chip -->
    <SummaryChip icon="alert" label="Réseau" value="EcoWatt orange demain" /><!-- i18n-ignore: demo chip -->
    <SummaryChip icon="away" label="Absence" value={m.nav.away} onclick={() => {}} /><!-- i18n-ignore: demo chip -->
    <SummaryChip icon="away" label="Absence" value="jusqu’à dim. 18:00" tone="cool" /><!-- i18n-ignore: demo chip -->
    <!-- Plan 14: a chip with its Fiche (the outdoor temperature): hover or click opens the exact values. -->
    <SummaryChip icon="weather" label={m.weather.chip} value={fmtTemp(4.2)}
      fiche={{ title: m.weather.ficheTitle, rows: [{ label: m.weather.now, value: fmtTemp(4.2) }], notes: [m.weather.notStation],
        provenance: provenance('weather', { at: NOW - 25 * 60_000, model: 'arome_hd' }, NOW), link: { label: m.weather.attributionShort, href: 'https://open-meteo.com/' } }} />
    <SummaryChip icon="flame" label="" skeleton width={150} />
  </div>

  <h2 class="areah"><span>RoomTile · tile (phone)</span></h2>
  <div class="tiles">
    <RoomTile name={salon} href="/rooms/p-salon" ariaLabel={salon} reading={19.6} heating lead={m.room.heatingNow} tone="warm" rest="→ 23:00">
      {#snippet control()}<Stepper size="sm" block caption={m.level.comfort} label={m.level.comfort} value={comfort} min={12} max={28}
          onchange={(v) => (comfort = v)} />{/snippet}
    </RoomTile>
    <RoomTile name={ch1} href="/rooms/p-ch1" ariaLabel={ch1} reading={19.1} lead={m.mode.manual} rest="19,5 °C" pending>
      {#snippet control()}<Stepper size="sm" block caption={m.mode.manual} label={m.mode.manual} value={manual} min={7} max={28} pending
          onchange={(v) => (manual = v)} />{/snippet}
    </RoomTile>
    <RoomTile name={salon} href="/rooms/p-salon" ariaLabel={salon} reading={19.4} variant="off" lead={m.mode.off} note="Ne chauffe pas" /><!-- i18n-ignore: demo note -->
    <RoomTile name={ch1} href="/rooms/p-ch1" ariaLabel={ch1} reading={19.0} variant="absence" lead={m.status.away} tone="cool" rest="12,0 °C"
      note="jusqu’à dim. 18:00" /><!-- i18n-ignore: demo note -->
    <RoomTile name={ch2} href="/rooms/p-ch2" ariaLabel={ch2} reading={null} variant="offline" lead={m.status.offlineSince('04:07')} hint={m.status.offlineHint(1)}
      class="span2" />
    <RoomTile name="Salle de bain" href="/rooms/x" ariaLabel="Salle de bain" reading={21.2} variant="readonly" lead={m.support.readonly} chip={m.support.readonly} /><!-- i18n-ignore: demo room name -->
    <RoomTile name={salon} href="/rooms/p-salon" ariaLabel={salon} reading={19.6} heating lead={m.room.heatingNow} tone="warm" rest="→ 23:00">
      {#snippet control()}<Stepper size="sm" block caption={m.level.comfort} label={m.level.comfort} value={20} min={12} max={28} disabled onchange={() => {}} />{/snippet}
      {#snippet tag()}<PendingTag pending={sending} onretry={() => {}} ondismiss={() => {}} />{/snippet}
    </RoomTile>
  </div>

  <h2 class="areah"><span>RoomTile · widget (desktop) · IconTile</span></h2>
  <div class="cols">
    <div class="col">
      <RoomTile layout="widget" name={salon} href="/rooms/p-salon" ariaLabel={salon} reading={19.6} heating lead={m.room.heatingNow} tone="warm"
        rest={m.status.comfortUntil('23:00')}>
        {#snippet control()}<Stepper block caption={m.level.comfort} label={m.level.comfort} value={comfort} min={12} max={28} onchange={(v) => (comfort = v)} />{/snippet}
        {#snippet spark()}<MiniSpark points={temp} {setpoint} {bands} start={START} end={END} now={NOW} />{/snippet}
      </RoomTile>
      <div class="two">
        <IconTile layout="stack" icon="bolt" title={m.kit.boostShort} sub="Lancer…" onclick={() => {}} /><!-- i18n-ignore: demo sub -->
        <IconTile layout="stack" icon="cal" title={m.mode.program} sub="→ Éco 23:00" href="/schedule" /><!-- i18n-ignore: demo sub -->
      </div>
      <IconTile icon="rad" tone="heat" title={m.inspector.radiators} sub="2 en chauffe · baie 19,7° · entrée 19,5°" /><!-- i18n-ignore: demo sub -->
    </div>
    <div class="col">
      <RoomTile layout="widget" name={ch1} href="/rooms/p-ch1" ariaLabel={ch1} reading={19.1} variant="off" lead={m.mode.off} note="La pièce ne chauffe pas." /><!-- i18n-ignore: demo note -->
      <IconTile icon="window" title={m.room.windowOpen} sub="—" />
      <IconTile icon="bolt" title={m.kit.boostShort} sub="—" inert onclick={() => {}} />
    </div>
    <div class="col">
      <RoomTile layout="widget" name={ch2} href="/rooms/p-ch2" ariaLabel={ch2} reading={null} variant="offline" lead={m.status.offlineSince('04:07')}
        hint={m.status.offlineHint(1)} />
    </div>
  </div>

  <h2 class="areah"><span>Stepper · VSlider · Segmented · Toggle</span></h2>
  <div class="row top">
    <div class="stack">
      <Stepper caption={m.level.comfort} label={m.level.comfort} value={comfort} min={12} max={28} onchange={(v) => (comfort = v)} />
      <Stepper label={m.level.eco} value={28} min={12} max={28} onchange={() => {}} />
      <Stepper caption={m.mode.manual} label={m.mode.manual} value={19.5} min={7} max={28} pending onchange={() => {}} />
      <Stepper caption={m.level.comfort} label={m.level.comfort} value={20} min={12} max={28} disabled onchange={() => {}} />
      <Stepper size="lg" label={m.room.setpoint} value={slider} min={10} max={26} onchange={(v) => (slider = v)} />
    </div>
    <VSlider label={m.room.setpoint} value={slider} measured={19.6} width={140} height={300} onchange={(v) => (slider = v)} />
    <VSlider label={m.room.setpoint} value={10} measured={19.1} width={120} height={300} dim onchange={() => {}} />
    <div class="stack">
      <Segmented label={m.energy.views.month} options={(['day', 'week', 'month', 'year'] as const).map((v) => ({ value: v, label: m.energy.views[v] }))} value={seg}
        onchange={(v) => (seg = v)} />
      <div class="grp"><div class="li"><Toggle checked={tog} label={m.detail.label} onchange={(v) => (tog = v)} /></div></div>
    </div>
  </div>

  <h2 class="areah"><span>MaintenantCard · MiniBars · Widget</span></h2>
  <div class="grid4">
    <MaintenantCard tariff={tariff('hchp', { hc: 0.2, hp: 0.27 })} grid={null} now={NOW} span={2} />
    <MaintenantCard tariff={tariff('tempo', { blue_hc: 0.1288, blue_hp: 0.1552, white_hc: 0.1447, white_hp: 0.1792, red_hc: 0.1518, red_hp: 0.6586 })} {grid}
      now={NOW} span={2} />
    <MaintenantCard tariff={tariff('base', { base: 0.2516 })} grid={null} now={NOW} span={2} />
    <MaintenantCard tariff={null} grid={null} now={NOW} span={2} />
    <Widget title="Octobre, jusqu’au 15" aside="abonnement inclus" span={2}><!-- i18n-ignore: demo widget -->
      <p class="t-hero">100,22 €</p>
      <MiniBars values={[...daily, null, ...Array(15).fill(null)]} parts={[...parts]} estimate={30} label="Octobre" /><!-- i18n-ignore: demo -->
    </Widget>
    <Widget title="Hier" aside="38,2 kWh"><!-- i18n-ignore: demo widget -->
      <MiniBars values={daily.slice(-8)} highlight={7} label="Hier" /><!-- i18n-ignore: demo -->
    </Widget>
    <Widget title="Demain" tone="bad"><!-- i18n-ignore: demo widget -->
      <p><Icon name="alert" size={15} /> EcoWatt orange</p>
    </Widget>
    <Widget title="Tempo" span={2}>
      <MiniBars values={daily} parts={parts} tempo={daily.map((_, i) => (i === 7 || i === 13 ? 'white' : 'blue'))} label="Tempo" height={60} />
      <p class="note"><TempoDot colour="blue" /> {m.grid.colour.blue} · <TempoDot colour="white" /> {m.grid.colour.white} · <TempoDot colour="red" />
        {m.grid.colour.red} · <TempoDot colour={null} /> · <Swatch series="hc" /> {m.now.hc} · <Swatch series="hp" /> {m.now.hp}</p>
    </Widget>
  </div>

  <h2 class="areah"><span>GroupedList · Notice · Fiche · Menu · Sheet</span></h2>
  <div class="cols">
    <div class="col">
      <GroupedList label={m.home.display}>
        <ListRow icon="tag" disc label={m.tariff.title} sub="Heures creuses / pleines · 9 kVA" href="/home/tariff" tall /><!-- i18n-ignore: demo sub -->
        <ListRow icon="bolt" disc label="Linky" sub="jusqu’au 15/10" href="/home/linky" tall /><!-- i18n-ignore: demo sub -->
        <ListRow label={m.settings.language} value="Français" /><!-- i18n-ignore: a language named in itself -->
        <ListRow label={m.detail.label} onclick={() => (disclosure = !disclosure)} expanded={disclosure} />
        <ListRow label={m.sessions.signOutOthers} danger onclick={() => {}} chevron={false} />
      </GroupedList>
    </div>
    <div class="col">
      <Notice title={m.status.offlineHint(1)} icon="plug-off"><p>{m.room.offlineBody}</p></Notice>
      <Notice tone="bad" icon="window" title={m.room.windowOpen} />
      <p>{m.now.priceTitle}: <Fig value="0,2700 €" title={m.now.priceTitle} rows={[{ label: m.now.period, value: m.now.hp }]} provenance={provenance('tariff', {}, NOW)} /></p>
      <div class="row">
        <Menu label={m.menu.more} items={[{ label: m.common.retry, icon: 'sync', onselect: () => {} }, 'separator', { label: m.houseActions.allOff, icon: 'power', onselect: () => {}, danger: true }]} />
        <button type="button" class="btn" bind:this={sheetBtn} onclick={() => (sheet = true)}>{m.away.title}</button>
        <button type="button" class="btn" bind:this={modalBtn} onclick={() => (modal = true)}>{m.room.setpoint}</button>
      </div>
    </div>
  </div>

  <h2 class="areah"><span>Banner · Skeleton</span></h2>
  <Banner connection="reconnecting" status={{ connected: true, last_ok_at: NOW / 1000, last_error: null }} now={NOW + 120_000} lostAt={NOW} dataAt={NOW} />
  <Banner connection="reconnecting" status={{ connected: true, last_ok_at: NOW / 1000, last_error: null }} now={NOW + 240_000} lostAt={NOW} dataAt={NOW} />
  <div class="row sk">
    <Skeleton shape="pill" h={46} w={180} /><Skeleton shape="pill" h={46} w={120} /><Skeleton shape="pill" h={46} w={200} />
  </div>
  <div class="cols">
    <div class="col"><Skeleton shape="line" h={22} w="60%" /><Skeleton shape="widget" h={232} /><div class="two"><Skeleton shape="tile" h={110} /><Skeleton shape="tile" h={110} /></div></div>
    <div class="col"><Skeleton shape="line" h={22} w="50%" /><Skeleton shape="widget" h={128} /><Skeleton shape="widget" h={150} /></div>
  </div>

  <h2 class="areah"><span>WeatherScatter · kWh · € · a day read</span></h2>
  <div class="cols">
    <div class="col"><WeatherScatter points={OK.house.points} line={OK.house.line} tb={15.5} mode="kwh" height={260} /></div>
    <div class="col"><WeatherScatter points={OK.house.points} line={OK.house.line} tb={15.5} mode="eur" height={260} selected={OK.house.points[3].date} /></div>
  </div>

  <h2 class="areah"><span>ForecastStrip · priced · Tempo unknown · incomplete · no model</span></h2>
  <ForecastStrip forecast={OK.forecast} />
  <ForecastStrip forecast={tempoWeek} />
  <ForecastStrip forecast={holes} />
  <ForecastStrip forecast={HIDDEN.forecast} />

  <h2 class="areah"><span>WeatherCostPanel · ok · thin · hidden · loading</span></h2>
  <WeatherCostPanel model={OK} periodName={monthName('2026-10-01')} tariff />
  <WeatherCostPanel model={THIN} periodName={monthName('2026-10-01')} tariff />
  <WeatherCostPanel model={HIDDEN} periodName={monthName('2026-10-01')} tariff />
  <WeatherCostPanel model={undefined} periodName={monthName('2026-10-01')} tariff />

  <h2 class="areah"><span>Tomorrow · heating · none · Tempo unknown · loading</span></h2>
  <div class="grid4">
    <TomorrowWidget grid={grid} todayIso="2026-10-16" forecast={FORECAST} weatherOn />
    <TomorrowWidget grid={grid} todayIso="2026-10-16" forecast={warm} weatherOn />
    <TomorrowWidget grid={grid} todayIso="2026-10-16" forecast={unknown} weatherOn />
    <TomorrowWidget grid={grid} todayIso="2026-10-16" forecast={undefined} weatherOn />
  </div>

  <h2 class="areah"><span>Room sheet cold row · ok · hidden</span></h2>
  <div class="row">
    <Fig value={roomValue(ROOM)} title={m.weatherCost.roomRow} rows={roomRows(ROOM)} provenance={provenance('weather-model', {}, NOW)} />
    <Fig value={roomValue(roomHidden)} title={m.weatherCost.roomRow} rows={roomRows(roomHidden)} empty={roomWhy(roomHidden)}
      provenance={provenance('weather-model', {}, NOW)} />
  </div>
</div>

<Sheet open={sheet} title={m.away.title} trigger={sheetBtn} onclose={() => (sheet = false)}>
  <p class="muted">{m.away.lead}</p>
  <Stepper caption={m.away.temperature} label={m.away.tempLabel} value={12} min={7} max={19} block onchange={() => {}} />
  {#snippet footer()}<button type="button" class="btn btn-primary btn-lg btn-block" onclick={() => (sheet = false)}><Icon name="away" size={18} />{m.away.go}</button>{/snippet}
</Sheet>
<Sheet open={modal} title={salon} tone="modal" width={920} tall trigger={modalBtn} onclose={() => (modal = false)}>
  <div class="sheetbody">
    <Stepper size="lg" label={m.room.setpoint} value={slider} min={10} max={26} onchange={(v) => (slider = v)} />
    <VSlider label={m.room.setpoint} value={slider} measured={19.6} width={140} height={280} onchange={(v) => (slider = v)} />
  </div>
</Sheet>

<style>
  .kit {
    display: grid;
    gap: 12px;
    max-width: 1180px;
  }
  .kit > :global(.areah) {
    margin-top: 28px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .row.top {
    align-items: flex-start;
    gap: 24px;
  }
  .stack {
    display: grid;
    gap: 12px;
    justify-items: start;
  }
  .narrow {
    max-width: 360px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    max-width: 420px;
  }
  .tiles :global(.span2) {
    grid-column: span 2;
  }
  .cols {
    display: grid;
    gap: 18px;
  }
  .col {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .grid4 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .grid4 :global(.span2) {
    grid-column: span 2;
  }
  .sk {
    margin-top: 12px;
  }
  .sheetbody {
    display: grid;
    justify-items: center;
    gap: 24px;
    padding: 12px 0;
  }
  p {
    margin: 0;
  }
  @media (min-width: 1024px) {
    .cols {
      grid-template-columns: 254px 254px 1fr;
    }
    .grid4 {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
