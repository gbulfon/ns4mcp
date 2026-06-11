/**
 * Parameter schema types.
 *
 * The schema is the contract between the model (which works in named, normalized
 * parameters) and the translation layer (which emits MIDI bytes). It is GENERATED
 * by scripts/fetch-schema.ts from the midi.guide CSV — do not hand-edit
 * parameters.json.
 */

export type Addressing = 'cc' | 'nrpn' | 'nrpn14';
export type Orientation = 'unipolar' | 'bipolar';

/** A named choice for an enumerated selector parameter (e.g. a piano type category). */
export interface SelectorOption {
  /** Representative MIDI value that selects this option (midpoint of its range). */
  value: number;
  /** Human label, addressable by name, e.g. "Grand". */
  label: string;
}

export interface ParameterSpec {
  /** Stable section-qualified id, e.g. "synth-filter.frequency". The addressable key. */
  id: string;
  /** Human parameter name as in the source, e.g. "Frequency". */
  name: string;
  /** Source section, e.g. "Synth Filter". */
  section: string;
  addressing: Addressing;
  /** CC controller number (addressing === 'cc'). */
  cc?: number;
  /** NRPN parameter MSB (addressing === 'nrpn' | 'nrpn14'). */
  nrpnMsb?: number;
  /** NRPN parameter LSB (addressing === 'nrpn' | 'nrpn14'). */
  nrpnLsb?: number;
  /** Inclusive minimum raw value. */
  min: number;
  /** Inclusive maximum raw value. */
  max: number;
  /** Source default raw value, if known. */
  default?: number;
  orientation: Orientation;
  /**
   * For bipolar params, the raw value treated as center (the model reasons in
   * -/0/+ around this). Conventionally 64 for a 0-127 range.
   */
  center?: number;
  /** Named choices for enumerated selectors (e.g. piano type categories). Curated. */
  options?: SelectorOption[];
  /** Short semantic hint to help the model choose values. Curated, optional. */
  hint?: string;
  /** Source notes (e.g. the 14-bit explanation). */
  notes?: string;
}

export interface SchemaSource {
  url: string;
  humanReadable: string;
  license: string;
  attribution: string;
  authoritativeReference: string;
  /** Notes on cross-checking the community data against the official manual. */
  validation?: string;
  fetchedAt: string;
  rowCount: number;
}

export interface ParameterSchema {
  device: string;
  source: SchemaSource;
  parameters: ParameterSpec[];
  /**
   * Full oscillator catalog: per type (Analog/FM-H/FM-I/Wave), the categories and
   * their waveforms. Set synth-oscillator.type=type.value, .category=category.value,
   * .wave=<index> (named types: array position in `waves`; FM types: see waveNote).
   */
  oscillatorWaveforms?: Array<{
    type: string;
    value: number;
    categories: Array<{ category: string; value: number; waves?: string[]; waveNote?: string }>;
  }>;
}
