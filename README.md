# NS4MCP — Nord Stage 4 MCP Server

A local [MCP](https://modelcontextprotocol.io) server that exposes a USB-attached
**Nord Stage 4** as natural-language-controllable tools. An MCP client (e.g.
Claude Desktop) does the semantic work — *"make the synth brighter and a touch
slower to speak"* → a named-parameter diff — and this server deterministically
translates that diff into the correct Nord MIDI (CC / NRPN / 14-bit NRPN) and
applies it live.

- **The model works in named, normalized parameters** (`synth-filter.frequency`),
  never raw MIDI bytes.
- **The server is a deterministic translator.** All byte-level specifics (CC vs
  NRPN vs 14-bit NRPN, ordering, bipolar center offsets) live in the translation
  layer.
- **Human-in-the-loop for audio.** The server cannot hear sound — it proposes and
  applies; you judge. `snapshot` / `audition_variations` support A/B and undo.

See [`PLAN.md`](./PLAN.md) for the full phased design.

## ⚠️ Required Nord setting: enable NRPN reception

Many parameters (organ/piano model & type, effects enables, synth vibrato/arp/LFO,
etc.) are addressed via **NRPN**. The Nord **discards NRPN unless you enable it**:

> On the Nord: **Shift + Program 7** (MIDI menu) → **PAGE** to **page 7
> "Control / NRPN / Device Mode"** → set **Type = "CC & NRPN"** and **Ctrl =
> "Send & Receive"** (or "Receive") → **Exit** (Shift). Settings persist
> automatically.

Symptom if this is wrong: plain-CC params (filter, levels, on/off) respond but
all NRPN params are silently ignored. (Confirmed on hardware; root-caused to the
**Type = "CC"** default-discards-NRPN case.)

## Requirements

- Node.js ≥ 18 (developed on v23).
- Native build toolchain for the `@julusian/midi` rtmidi addon:
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`). CoreMIDI works out of the box.
  - **Linux** — ALSA dev headers (`sudo apt install libasound2-dev`).
- A Nord Stage 4 connected over USB, powered on, with USB-MIDI enabled.

## Install & verify

```bash
npm install            # builds the native MIDI addon
npm run doctor         # list MIDI ports, confirm the Nord is detected
```

`doctor` exits 0 when the Nord is visible on both input and output. If the name
differs, pass a match string: `npm run doctor -- "Stage 4"`.

### Hardware MIDI test (optional, changes your current patch)

```bash
npm run midi-test               # sweeps filter, sends an NRPN + the 14-bit sample select
npm run midi-test -- --listen   # just print inbound messages while you move knobs
```

This sends live MIDI and will **alter the Nord's current sound** — it's
human-in-the-loop on purpose, so you can confirm the three send paths (CC, NRPN,
14-bit NRPN) actually move the instrument.

### End-to-end test (no hardware needed)

```bash
npm run smoke          # builds, then drives the server in --dry-run over MCP
```

## Build & run

```bash
npm run build          # tsc -> dist/, copies the parameter schema
npm start              # run the stdio server (node dist/index.js)
npm run dev            # run from TS directly via tsx
```

Flags / env:

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--dry-run` | — | off | Validate + track state, never send MIDI |
| `--channel <1-16>` | `NS4_CHANNEL` | `1` | Nord global MIDI channel |
| `--port-match <str>` | `NS4_PORT_MATCH` | `nord` | MIDI port name substring |

## Claude Desktop configuration

Add to your Claude Desktop MCP config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```jsonc
{
  "mcpServers": {
    "nord-stage-4": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/NS4MCP/dist/index.js"],
      "env": { "NS4_CHANNEL": "1" }
    }
  }
}
```

Run `npm run build` first so `dist/index.js` exists. Restart Claude Desktop; the
server's `ns4://schema` and `ns4://patch` resources and its tools will appear.

## Tools

| Tool | Purpose |
|---|---|
| `list_parameters` | List parameters (filter by `section` / `query`) with ranges, orientation, hints, current values. |
| `get_patch_state` | Current authoritative in-memory patch as JSON. |
| `set_parameters` | Apply a diff of named changes; validates ranges/orientation; emits CC/NRPN/14-bit NRPN. |
| `play_notes` | Play MIDI notes as a single chord/arpeggio to audition the current sound. |
| `play_sequence` | Play a timed melody (notes with beats/rests at a tempo) in one continuous call. |
| `snapshot` | Push current state for A/B compare and undo. |
| `restore` | Restore a snapshot (default most recent) and re-send to the Nord. |
| `audition_variations` | Step through N proposed variations for the human to choose between. |
| `randomize` | Mutate selected parameters within constrained ranges (respects orientation). |

### Selecting sound categories by name

Enumerated selectors expose named `options`, so the model can pick a **category**
by label instead of a raw value:

```jsonc
// set_parameters
{ "changes": [{ "id": "piano.type", "label": "Grand" }] }
```

Selectors with named `options` (15 parameters):

| Parameter | Options |
|---|---|
| `piano.type` ✅ | Grand, Upright, Electric Piano, Clav / Harpsichord, Digital, Misc |
| `organ.model` | B3, Vox, Farfisa, Pipe 1, Pipe 2, B3 Bass |
| `organ.vibrato-type` | V1, C1, V2, C2, V3, C3 |
| `organ.percussion-harmonic` | 2nd, 3rd |
| `synth-filter.type` | LP 24, LP 12, LP M, LP+HP, HP, BP |
| `synth-filter.drive` | Off, Low, Mid, High |
| `synth-filter.keyboard-track` | Off, 1/3, 2/3, Full |
| `synth.voice-mode` | Poly, Mono, Legato |
| `synth.voice-priority` | Normal, Lo, Hi |
| `synth.unison` | Off, 1, 2, 3 |
| `synth-lfo.waveform` | Triangle, Sawtooth 1, Sawtooth 2, Square, Sample & Hold |
| `synth-lfo.destination` | Osc Ctrl, Pitch, Filter |
| `synth-arpeggiator.mode` | Arp, Poly, Gate |
| `synth-arpeggiator.direction` | Up, Down, Up/Down, Random |
| `synth-vibrato.mode` | On, Delay, Wheel, Aftertouch, Pedal |

The label maps to the representative MIDI value (midpoint of its slice of 0–127);
specific loaded sound names (e.g. "White Grand XL") are *not* available over MIDI
— only the category. Browse what's loaded with
`npm run browse-sounds -- --section piano|organ|synth` (read names off the display).

> **Confidence:** all 15 selectors are **hardware-verified** (2026-06-02, via panel
> LEDs/display). Verification corrected three: `lfo.destination` and `vibrato.mode`
> each had a hidden leading **Off** state, and `synth-filter.type` had two swapped
> pairs (true order LP 12, LP 24, LP M, LP+HP, BP, HP). The midpoint/even-division
> mapping is confirmed (not literal 0–N). To change a label, fix
> `src/schema/options.ts` and re-run `npm run fetch-schema`.

### Synth oscillator (undocumented — discovered by listening to panel transmissions)

The manual lists only "Synth Waveform 3:2", but the oscillator is actually **three**
NRPNs, all hardware-verified and exposed as named params:

| Param | NRPN | Selection |
|---|---|---|
| `synth-oscillator.type` | 3/1 | Analog / FM-H / FM-I / Wave (midpoint values) |
| `synth-oscillator.category` | 3/2 | Pure … Misc — 8 categories for the Analog type (midpoint) |
| `synth-oscillator.wave` | 3/3 | **literal 0-based index** within the category |

Set all three to choose a waveform. The **complete catalog** (all 4 types, every
category and waveform, hardware-mapped) is in the schema's `oscillatorWaveforms`:

- **Analog** (8 categories, 45 named waves: Pure, Sub Osc, Sync, Shape, Shape Sine, Multi, Super, Misc)
- **FM-H** (5 cats FM Harmonic A–E; wave = FM ratio, index 0 = 0.5 then 1–24)
- **FM-I** (5 cats FM Inharmonic A–E; wave = semitone, index 0..60 = −12…+48)
- **Wave** (5 cats: Bells/Tines, Acoustic, Digital, Organ, Keys; 46 named waves)

Examples: Super Saw = Analog/Super/wave 0; Tubular Bells = Wave/Bells-Tines/wave 5;
Red Noise (wind) = Analog/Misc/wave 1. `npm run wind` is a complete wind patch.
(Discovered by listening to panel transmissions — the manual documents almost none of it.)

### Resources

- `ns4://schema` — all parameters with ids, ranges, orientation, hints, options, current values.
- `ns4://patch` — live patch state.

## Parameter schema (reproducible)

The schema in `src/schema/parameters.json` is **generated**, not hand-copied:

```bash
npm run fetch-schema             # download upstream CSV and re-transform
npm run fetch-schema -- --offline  # transform from a cached CSV
```

146 parameters: 95 CC, 50 NRPN, 1 14-bit NRPN (the synth sample category+sample),
5 bipolar/centered (synth A/B/C pan, oscillator pitch coarse/fine). Section-
qualified ids (`piano.model` vs `organ.model`) keep colliding names distinct.

### NRPN transmission (manual-verified)

Per the Nord Stage 4 manual (v1.2x Edition K, Appendix II), a standard NRPN
parameter is sent as **four** messages — `CC99` (NRPN MSB), `CC98` (NRPN LSB),
`CC6` (Data Entry MSB) = **0**, and the **value in `CC38`** (Data Entry LSB). The
14-bit "Sample category and sample" (NRPN 3/4) is the documented exception:
category in `CC6`, sample in `CC38`. All CC/NRPN numbers were cross-checked
against the manual with no value conflicts; this provenance is recorded in
`parameters.json`'s `source.validation`.

### Data attribution

Parameter data is derived from the community **[midi.guide](https://midi.guide/d/nord/stage-4/)**
Nord Stage 4 database, licensed **CC BY-SA 4.0**. The transform records the
source URL, license, and fetch date in `parameters.json`. The official
[Nord Stage 4 User Manual (v1.2X, Edition K)](https://www.nordkeyboards.com/downloads/downloads-nord-stage-4)
— *"Controlling the Nord Stage 4 using MIDI"* and the MIDI Implementation Chart —
is the **authoritative tiebreaker** on any conflict.

## Architecture notes

- `src/midi/messages.ts` — pure CC/NRPN/14-bit NRPN byte builders (the deterministic core).
- `src/midi/device.ts` — `MidiDevice` interface + `RtMidiDevice` (`@julusian/midi`); mockable.
- `src/midi/nord.ts` — Nord-specific send paths bound to a channel.
- `src/translate.ts` — named change → validated value → MIDI send.
- `src/state/patch.ts` — authoritative state, snapshot stack, inbound NRPN reconciliation.
- `src/server.ts` — MCP tools + resources (transport-agnostic).
- `src/index.ts` — stdio transport entrypoint. The transport is created here and
  handed to the server, so an HTTP/SSE transport can be added without redesign.

### Out of scope (for now)

- **SysEx** program/controller dumps — only needed for whole-program save/restore,
  not live per-parameter tweaking. A future phase may add true patch dump/restore.
