/**
 * Extra parameters NOT in the midi.guide CSV, discovered by listening to what the
 * Nord transmits from the panel (2026-06-02). Merged into the schema by
 * scripts/fetch-schema.ts.
 *
 * The synth oscillator is selected by THREE NRPNs (the manual documents only the
 * middle one, mislabeled "Synth Waveform 3:2"):
 *   - 3/1 = Type     (Analog / FM-H / FM-I / Wave)   — 0-127 range, midpoint select
 *   - 3/2 = Category (Pure / Sub Osc / ... / Misc)   — 0-127 range, midpoint select
 *   - 3/3 = Wave     (waveform within the category)  — LITERAL 0-based index
 * To pick a waveform, set all three. Categories below are for the ANALOG type
 * (FM/Wave types have different category sets). Hardware-verified.
 */

import type { ParameterSpec } from './types.js';

export const EXTRA_PARAMS: ParameterSpec[] = [
  {
    id: 'synth-oscillator.type',
    name: 'Oscillator Type',
    section: 'Synth Oscillator',
    addressing: 'nrpn',
    nrpnMsb: 3,
    nrpnLsb: 1,
    min: 0,
    max: 127,
    orientation: 'unipolar',
    options: [
      { value: 16, label: 'Analog' },
      { value: 48, label: 'FM-H' },
      { value: 80, label: 'FM-I' },
      { value: 112, label: 'Wave' },
    ],
    hint: 'synth oscillator type (NRPN 3/1, undocumented). Set this first, then category + wave.',
  },
  {
    id: 'synth-oscillator.category',
    name: 'Oscillator Category',
    section: 'Synth Oscillator',
    addressing: 'nrpn',
    nrpnMsb: 3,
    nrpnLsb: 2,
    min: 0,
    max: 127,
    orientation: 'unipolar',
    options: [
      { value: 8, label: 'Pure' },
      { value: 24, label: 'Sub Osc' },
      { value: 40, label: 'Sync' },
      { value: 56, label: 'Shape' },
      { value: 72, label: 'Shape Sine' },
      { value: 88, label: 'Multi' },
      { value: 104, label: 'Super' },
      { value: 120, label: 'Misc' },
    ],
    hint: 'synth oscillator waveform category (NRPN 3/2; the manual\'s mislabeled "Waveform"). The `options` here are for the Analog type; for FM-H/FM-I/Wave types use the category values in the schema\'s oscillatorWaveforms catalog. Analog/Misc holds the noises.',
  },
  {
    id: 'synth-oscillator.wave',
    name: 'Oscillator Wave',
    section: 'Synth Oscillator',
    addressing: 'nrpn',
    nrpnMsb: 3,
    nrpnLsb: 3,
    min: 0,
    max: 127,
    orientation: 'unipolar',
    hint: 'waveform within the current oscillator category (NRPN 3/3) — a LITERAL 0-based index, not a 0-127 range (out-of-range is ignored). See the schema\'s oscillatorWaveforms for the full Analog catalog (category -> ordered wave names; index = position). E.g. wind/SFX: type=Analog, category=Misc, wave=1 (Red Noise).',
  },
];
