/**
 * Curated semantic hints, keyed by parameter id (section-qualified slug).
 *
 * These are layered onto the generated schema by scripts/fetch-schema.ts. They
 * are semantic metadata (what a parameter *means* for sound design), NOT MIDI
 * values — so maintaining them here by hand is appropriate and they are
 * re-applied deterministically on every fetch. Parameters without a hint simply
 * omit the field.
 */

export const HINTS: Record<string, string> = {
  // --- Global ---
  'global.volume': 'master output level',

  // --- Synth: oscillator / tone ---
  'synth.sample-category-and-sample': '14-bit: MSB selects sample category, LSB selects sample within it',
  'synth.sample-bright': 'sample brightness — high-frequency content of the sample',
  'synth-oscillator.pitch-coarse': 'oscillator pitch in semitones — bipolar, 64 = no transpose',
  'synth-oscillator.pitch-fine': 'oscillator fine tune/detune — bipolar, 64 = in tune',
  'synth-oscillator.envelope-to-pitch': 'how much the modulation envelope sweeps pitch',

  // --- Synth: filter — the main "brightness/openness" control ---
  'synth-filter.frequency': 'filter cutoff — brightness/openness; low = dark/muffled, high = bright/open',
  'synth-filter.resonance': 'filter resonance/emphasis at the cutoff — adds bite/whistle as it rises',
  'synth-filter.drive': 'filter drive/overdrive — adds dirt and harmonic saturation',
  'synth-filter.keyboard-track': 'how much cutoff follows the note pitch up the keyboard',
  'synth-filter.type': 'filter type/slope selection',

  // --- Synth: filter envelope (shapes how the filter opens over time) ---
  'synth-filter-envelope.attack': 'filter envelope attack — how fast the filter opens',
  'synth-filter-envelope.decay': 'filter envelope decay — fall to sustain after the attack peak',
  'synth-filter-envelope.sustain': 'filter envelope sustain — held cutoff level',
  'synth-filter-envelope.release': 'filter envelope release — how long the filter stays open after release',
  'synth-filter-envelope.amount': 'how much the envelope modulates the cutoff',

  // --- Synth: amplifier envelope (loudness contour) ---
  'synth-amplifier-envelope.attack': 'amp attack — how fast the note speaks (0 = instant, high = slow swell)',
  'synth-amplifier-envelope.decay': 'amp decay — fall to sustain level after attack',
  'synth-amplifier-envelope.sustain': 'amp sustain — held loudness while a key is down',
  'synth-amplifier-envelope.release': 'amp release — how long the note rings out after key-up',

  // --- Synth: LFO / vibrato / pan ---
  'synth-lfo.rate': 'LFO speed',
  'synth-lfo.waveform': 'LFO shape',
  'synth-lfo.destination': 'what the LFO modulates',
  'synth-vibrato.mode': 'vibrato mode',
  'synth.a-pan': 'pan of synth layer A — bipolar, 64 = center',
  'synth.b-pan': 'pan of synth layer B — bipolar, 64 = center',
  'synth.c-pan': 'pan of synth layer C — bipolar, 64 = center',

  // --- Organ ---
  'organ.model': 'organ engine/model selection',
  'organ.percussion-enable': 'tonewheel percussion on/off',
  'organ.percussion-harmonic': 'percussion harmonic (2nd vs 3rd)',
  'organ.vibrato-enable': 'organ vibrato/chorus on/off',

  // --- Piano ---
  'piano.type': 'piano category (grand, upright, EP, etc.)',
  'piano.timbre': 'piano timbre/brightness variation',
  'piano.dynamic-compression': 'dynamic range compression of the piano',
  'piano.acoustics': 'string resonance / acoustic ambience amount',

  // --- Effects ---
  'delay.amount': 'delay wet/dry mix',
  'delay.rate': 'delay time',
  'delay.feedback': 'delay feedback — number of repeats',
  'reverb.amount': 'reverb wet/dry mix',
  'reverb.type': 'reverb size/character',
  'compressor.amount': 'compression amount',
  'amp-eq.drive': 'amp/EQ overdrive amount',
  'rotary.speed': 'rotary speaker fast/slow',
};
