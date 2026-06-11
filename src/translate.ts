/**
 * Translation layer: named/validated parameter changes -> MIDI sends.
 *
 * This is where all byte-level specifics live (CC vs NRPN vs 14-bit NRPN,
 * ordering, the category/sample split). The model never sees any of it.
 */

import type { NordMidi } from './midi/nord.js';
import type { ParameterSpec } from './schema/types.js';
import { Schema, validateValue, type ValidationError } from './schema/load.js';
import { buildCC, buildNRPN, buildNRPN14 } from './midi/messages.js';

export interface ParamChange {
  id: string;
  /** Raw device value within [min, max]. For nrpn14, a combined 0-16383 value. */
  value?: number;
  /** Named option for an enumerated selector (e.g. piano.type = "Grand"). */
  label?: string;
  /** nrpn14 only: explicit category selector (Data Entry MSB). */
  category?: number;
  /** nrpn14 only: explicit sample selector (Data Entry LSB). */
  sample?: number;
}

/** Resolve a named option to its MIDI value via the parameter's options list. */
function resolveLabel(param: ParameterSpec, label: string): number | ValidationError {
  if (!param.options?.length) {
    return { id: param.id, message: `parameter "${param.id}" has no named options; pass a numeric value` };
  }
  const match = param.options.find((o) => o.label.toLowerCase() === label.toLowerCase());
  if (!match) {
    return { id: param.id, message: `unknown option "${label}" for ${param.id}; choices: ${param.options.map((o) => o.label).join(', ')}` };
  }
  return match.value;
}

export interface AppliedChange {
  id: string;
  /** Canonical stored value (0-16383 for nrpn14, else 0-127). */
  value: number;
  category?: number;
  sample?: number;
  addressing: ParameterSpec['addressing'];
  /** Raw MIDI messages that were sent, for traceability. */
  messages: number[][];
}

/** Resolve a change into the canonical value + (for nrpn14) category/sample. */
function resolveValue(
  param: ParameterSpec,
  change: ParamChange,
): { value: number; category?: number; sample?: number } | ValidationError {
  if (param.addressing === 'nrpn14') {
    let category: number;
    let sample: number;
    if (change.category !== undefined || change.sample !== undefined) {
      category = change.category ?? 0;
      sample = change.sample ?? 0;
      if (category < 0 || category > 127 || sample < 0 || sample > 127) {
        return { id: param.id, message: `category/sample must be 0-127 (got ${category}/${sample})` };
      }
    } else if (change.value !== undefined) {
      const err = validateValue(param, change.value);
      if (err) return err;
      category = change.value >> 7;
      sample = change.value & 0x7f;
    } else {
      return { id: param.id, message: 'nrpn14 change needs `value` or `category`+`sample`' };
    }
    return { value: (category << 7) | sample, category, sample };
  }

  let value: number;
  if (change.label !== undefined) {
    const resolved = resolveLabel(param, change.label);
    if (typeof resolved !== 'number') return resolved;
    value = resolved;
  } else if (change.value !== undefined) {
    value = change.value;
  } else {
    return { id: param.id, message: 'change needs a `value` or `label`' };
  }
  const err = validateValue(param, value);
  if (err) return err;
  return { value };
}

/**
 * Validate a change and BUILD the exact MIDI messages it would produce — without
 * sending. Pure: same output on a live device or in dry-run, so dry-run reports
 * byte-accurate output. Returns a ValidationError for unknown id / range / shape.
 */
export function buildChange(schema: Schema, change: ParamChange, channel: number): AppliedChange | ValidationError {
  const param = schema.get(change.id);
  if (!param) {
    const hint = schema.suggest(change.id);
    return {
      id: change.id,
      message: `unknown parameter id "${change.id}"${hint.length ? `; did you mean: ${hint.join(', ')}` : ''}`,
    };
  }

  const resolved = resolveValue(param, change);
  if ('message' in resolved) return resolved;

  let messages: number[][];
  switch (param.addressing) {
    case 'cc':
      messages = buildCC(channel, param.cc!, resolved.value);
      break;
    case 'nrpn':
      messages = buildNRPN(channel, param.nrpnMsb!, param.nrpnLsb!, resolved.value);
      break;
    case 'nrpn14':
      messages = buildNRPN14(channel, param.nrpnMsb!, param.nrpnLsb!, resolved.category!, resolved.sample!);
      break;
  }

  return {
    id: param.id,
    value: resolved.value,
    ...(resolved.category !== undefined ? { category: resolved.category, sample: resolved.sample } : {}),
    addressing: param.addressing,
    messages,
  };
}

/**
 * Validate, build, and SEND a single change via `nord`. State updates are the
 * caller's responsibility. Returns the applied change or a ValidationError.
 */
export function applyChange(nord: NordMidi, schema: Schema, change: ParamChange): AppliedChange | ValidationError {
  const built = buildChange(schema, change, nord.channel);
  if ('message' in built) return built;
  nord.device.sendAll(built.messages);
  return built;
}
