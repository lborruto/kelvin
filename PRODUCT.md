# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

FastAPI (Python) backend + SvelteKit static frontend, shipped as one multi-arch Docker image for a home server.
The backend is Python because the Overkiz protocol client (`pyoverkiz`, also used by Home Assistant) is Python and already encodes auth, event polling, rate limits and device quirks that a rewrite in another language would have to rediscover. The small static frontend bundle keeps the whole thing light.

## Users

Households with Sauter electric radiators on Cozytouch, on phones (primary) and desktop, at home or away over a VPN such as Tailscale. Moments of use: "it's cold, warm this room now", "we're leaving for the weekend", "why is the bill high", "fix the weekly schedule". The UI is in French.

## Product Purpose

Replace the official Sauter Cozytouch app, which is slow, confusing and painful to use, with a fast, clear, pleasant home-heating control surface for a home's electric radiators. Success: anyone in the home can see and change the heat in a room in a couple of seconds, and schedules and energy are understandable at a glance.

## Positioning

Built around each installation's own devices: rooms and radiators come from its Cozytouch setup. It exposes everything the Overkiz API allows (including what the official app hides or buries), with honest feedback about command delivery to radiators. Self-hosted: the data stays on the home's own server.

## Operating Context

- Sauter radiators on the Overkiz cloud (`sauter_cozytouch` server), grouped into rooms by Cozytouch places. A room may hold several radiators. A Cozytouch bridge (IOStack) links them and is not user-controlled.
- The simulator (`KELVIN_FAKE=1`) models a small home of this kind: three rooms, one of them with two radiators, plus the bridge. It is used for demos and every test.
- Each radiator exposes sub-devices: heater (#1), room temperature sensor (#2), window contact (#3), occupancy (#4), cumulative energy meter with 2 tariffs (#5), night light/dimmer (#6).
- Radiator modes (`core:OperatingModeState`): `standby` (off), `basic` (manual), `internal` (program/auto); heating levels comfort / eco / frostprotection / off; built-in weekly time program and a learned auto-program; open-window detection, occupancy/presence, holidays, derogation (temporary override).
- Access: LAN or VPN (Tailscale) only; login is the home's Cozytouch account.

## Capabilities and Constraints

- Cloud-only control through Overkiz; no local API for Sauter. Commands take seconds to reach radiators over io-homecontrol; state confirmations arrive via events.
- Overkiz rate limits: aggressive polling triggers `QUOTA_EXCEEDED`. Use the event listener and slow full refreshes.
- Execution status can be misleading: a command observed returning `FAILED OVERRIDEMODE_ERROR` was nonetheless applied. Device state events are the source of truth.
- Energy meter values are cumulative Wh (tariff 1 / tariff 2); history requires local recording (no history API assumed).
- Dangerous/installer commands (pairing, unpairing, network reset, twinning, calibration offset, lock levels) are out of scope for the UI.
- Room names come from Cozytouch places; radiator names are all "Radiateur" upstream.
- Whole-home electricity consumption and bill estimates come from the Linky meter (Enedis data through MyElectricalData), shown alongside per-radiator energy.

## Brand Commitments

Name: **Kelvin** (repo `kelvin`). Short, technical, unit-of-temperature. UI copy in French.
Modern, intuitive at first glance, detailed when needed; it must look and feel like a real professional app with polished animation.
Visual direction: **B · Précision**. It is a crisp, dark-first, data-forward tool in the Linear/Vercel family, with a 24 h thermal strip per room as its signature.

## Truthfulness

No brand assets or logo from the device makers are used. Never fabricate consumption figures or savings claims: every number shown comes from a radiator, the Linky meter or the user's tariff.

## Product Principles

1. Room first: people think "warm the living room", not "device io://…#1". Multi-radiator rooms act as one unless the user drills in.
2. Truthful state: show what the radiator reports, mark pending commands as pending, never fake success.
3. Two-second control: the most common actions (change temperature, on/off, boost) are reachable in one or two taps on a phone.
4. Calm by default, depth on demand: schedules, energy, and advanced radiator settings exist but don't crowd the main view.
5. Household-safe: no action in the UI can unpair or brick a device.

## Accessibility & Inclusion

French UI. Must be fully usable on phones one-handed, with large touch targets; WCAG AA contrast; respects reduced-motion.
