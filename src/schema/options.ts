/**
 * Curated enumerated-selector options, keyed by parameter id.
 *
 * These let the model address a category/type by NAME (e.g. piano.type = "Grand",
 * synth-filter.type = "LP 24") instead of a raw MIDI value. Layered onto the
 * generated schema by scripts/fetch-schema.ts, like HINTS.
 *
 * VALUE MAPPING: the Nord manual documents option NAMES and panel ORDER but not
 * explicit NRPN value tables. Each `value` is the MIDPOINT of that option's even
 * slice of 0-127 (the scheme confirmed working for piano.type). For an N-option
 * selector: value_i = round((i + 0.5) * 128 / N).
 *
 * CONFIDENCE: ALL 15 selectors HARDWARE-VERIFIED 2026-06-02 (panel LEDs/display).
 *  The midpoint/even-division mapping is confirmed (NOT literal 0..N — unison
 *  value 16 → Off, not 3). Three selectors were CORRECTED during verification:
 *   - synth-lfo.destination: 3→4 options (hidden leading Off).
 *   - synth-vibrato.mode:    5→6 options (hidden leading Off).
 *   - synth-filter.type:     order was LP24/LP12 swapped AND HP/BP swapped;
 *                            true order LP12,LP24,LP M,LP+HP,BP,HP.
 *  synth.waveform (3/2) intentionally omitted (context-dependent, not a flat enum).
 *  Re-runnable: edit here + `npm run fetch-schema`.
 *
 * Names of SPECIFIC loaded sounds (e.g. "White Grand XL") are NOT included — they
 * aren't sent over MIDI; the user picks the exact model on the Nord.
 */

import type { SelectorOption } from './types.js';

/** Build {value,label} options from labels, placing each at the midpoint of its slice. */
function opts(labels: string[]): SelectorOption[] {
  const n = labels.length;
  return labels.map((label, i) => ({ value: Math.round(((i + 0.5) * 128) / n), label }));
}

export const OPTIONS: Record<string, SelectorOption[]> = {
  // --- Piano (HARDWARE-CONFIRMED) ---
  'piano.type': opts(['Grand', 'Upright', 'Electric Piano', 'Clav / Harpsichord', 'Digital', 'Misc']),

  // --- Organ (documented order, unverified) ---
  'organ.model': opts(['B3', 'Vox', 'Farfisa', 'Pipe 1', 'Pipe 2', 'B3 Bass']),
  'organ.vibrato-type': opts(['V1', 'C1', 'V2', 'C2', 'V3', 'C3']),
  'organ.percussion-harmonic': opts(['2nd', '3rd']),

  // NOTE: the oscillator (Type/Category/Wave) is now three params defined in
  // extra-params.ts (NRPN 3/1, 3/2, 3/3) — hardware-discovered, fully addressable.
  // The CSV's misnamed "synth.waveform" (3/2) is dropped by fetch-schema.

  // --- Synth (documented order, unverified) ---
  'synth.voice-mode': opts(['Poly', 'Mono', 'Legato']),
  'synth.voice-priority': opts(['Normal', 'Lo', 'Hi']),
  'synth.unison': opts(['Off', '1', '2', '3']),
  // Hardware-verified 2026-06-02: order is LP12,LP24,LP M,LP+HP,BP,HP (manual had LP24/LP12 and HP/BP swapped).
  'synth-filter.type': opts(['LP 12', 'LP 24', 'LP M', 'LP+HP', 'BP', 'HP']),
  'synth-filter.drive': opts(['Off', 'Low', 'Mid', 'High']),
  'synth-filter.keyboard-track': opts(['Off', '1/3', '2/3', 'Full']),
  'synth-lfo.waveform': opts(['Triangle', 'Sawtooth 1', 'Sawtooth 2', 'Square', 'Sample & Hold']),
  // Hardware-verified 2026-06-02: 4 options incl. leading Off (21→Off, 48→Osc Ctrl, 112→Filter).
  'synth-lfo.destination': opts(['Off', 'Osc Ctrl', 'Pitch', 'Filter']),
  'synth-arpeggiator.mode': opts(['Arp', 'Poly', 'Gate']),
  'synth-arpeggiator.direction': opts(['Up', 'Down', 'Up/Down', 'Random']),
  // Hardware-verified 2026-06-02: 6 options incl. leading Off (value 32→On, 117→Pedal).
  'synth-vibrato.mode': opts(['Off', 'On', 'Delay', 'Wheel', 'Aftertouch', 'Pedal']),
};
