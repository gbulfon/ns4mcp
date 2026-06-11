/**
 * Synth oscillator catalog — the full Type → Category → Wave map, discovered by
 * dialing the panel and reading the display (2026-06-03/04). The manual documents
 * almost none of this. Hardware-verified.
 *
 * Selection uses three NRPNs (see extra-params.ts):
 *   synth-oscillator.type     = type.value      (3/1, 0-127 midpoint)
 *   synth-oscillator.category = category.value  (3/2, 0-127 midpoint — fixed 8-slot
 *                                                grid; types use the first N slots)
 *   synth-oscillator.wave     = wave index      (3/3, LITERAL 0-based index)
 *
 * For named types (Analog, Wave) the wave index = position in `waves`.
 * For FM types the wave is numeric (ratio / semitone) — see `waveNote`.
 */

/** Category-slot values on the 3/2 grid: round((i+0.5)*128/8). */
const CAT = [8, 24, 40, 56, 72, 88, 104, 120];

export interface OscCategory {
  category: string;
  /** synth-oscillator.category (3/2) value. */
  value: number;
  /** Named waveforms; array index = synth-oscillator.wave (3/3) value. */
  waves?: string[];
  /** For numeric (FM) types: how the wave index maps. */
  waveNote?: string;
}

export interface OscType {
  type: string;
  /** synth-oscillator.type (3/1) value. */
  value: number;
  categories: OscCategory[];
}

export const OSCILLATOR: OscType[] = [
  {
    type: 'Analog',
    value: 16,
    categories: [
      { category: 'Pure', value: CAT[0], waves: ['Sine', 'Triangle', 'Saw', 'Square', 'Pulse 33', 'Pulse 10', 'White Noise'] },
      { category: 'Sub Osc', value: CAT[1], waves: ['Square Sub Saw', 'Pulse Sub Saw', 'Sine Sub Saw'] },
      { category: 'Sync', value: CAT[2], waves: ['Sine', 'Triangle', 'Saw', 'Square', 'Pulse 33', 'Pulse 10', 'Chop Saw', 'Chop Saw 2', 'Chop Square'] },
      { category: 'Shape', value: CAT[3], waves: ['Triangle', 'Saw', 'Square', 'Half Sine', 'Parabolic'] },
      { category: 'Shape Sine', value: CAT[4], waves: ['Saw', 'Square', 'Pulse', 'Squeeze', 'Fold', 'ESaw', 'ESquare'] },
      { category: 'Multi', value: CAT[5], waves: ['Multi Saw', 'Multi Saw 8ve', 'Multi Saw 5th', 'Multi Saw 5th+', 'Multi Saw 8ve 8ve+', 'Multi Saw 8ve 5th+'] },
      { category: 'Super', value: CAT[6], waves: ['Super Saw', 'Super Square', 'Super Organ', 'Super Bright', 'Super Square Bright'] },
      { category: 'Misc', value: CAT[7], waves: ['Pink Noise', 'Red Noise', 'Bell'] },
    ],
  },
  {
    type: 'FM-H',
    value: 48,
    categories: ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({
      category: `FM Harmonic ${c}`,
      value: CAT[i],
      waveNote: 'wave index 0 = ratio 0.5; index n (1..24) = ratio n. 25 ratios.',
    })),
  },
  {
    type: 'FM-I',
    value: 80,
    categories: ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({
      category: `FM Inharmonic ${c}`,
      value: CAT[i],
      waveNote: 'wave index 0..60 = semitone (index - 12); range -12 .. +48 semitones.',
    })),
  },
  {
    type: 'Wave',
    value: 112,
    categories: [
      { category: 'Bells/Tines', value: CAT[0], waves: ['Bell', 'Bar 1', 'Bar 2', 'Tines', 'Marimba', 'Tubular Bells'] },
      { category: 'Acoustic', value: CAT[1], waves: ['Flute 1', 'Flute 2', 'Clarinet 1', 'Clarinet 2', 'Alto Sax', 'Tenor Sax'] },
      { category: 'Digital', value: CAT[2], waves: ['2nd Spectra', '3rd Spectra', '4th Spectra', '5th Spectra', '6th Spectra', '7th Spectra', '8th Spectra', 'Saw Random', 'Saw Bright', 'Saw NoFund', 'Square Bright', 'Ice 1', 'Ice 2', 'Triplets'] },
      { category: 'Organ', value: CAT[3], waves: ['Second', 'Third', 'Jimmy Smith', 'Blues', 'Gospel', 'Church', 'Squabble', 'Full Organ', 'Full Organ+', 'Principal'] },
      { category: 'Keys', value: CAT[4], waves: ['EPiano 1', 'EPiano 2', 'EPiano 3', 'DX 1', 'DX 2', 'Full Tines', 'AcPiano', 'Clavinet 1', 'Clavinet 2', 'Clavinet 3'] },
    ],
  },
];
