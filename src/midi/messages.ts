/**
 * Low-level MIDI message builders.
 *
 * These are PURE functions: named/numeric intent -> raw MIDI byte arrays.
 * This is the deterministic heart of the translation layer. Nothing here knows
 * about parameter names or semantics; it only knows MIDI wire format.
 *
 * MIDI channels are 0-indexed internally (0-15) and map to "MIDI channel 1-16".
 */

/** Control Change controller numbers used by the NRPN protocol. */
export const CC = {
  DATA_ENTRY_MSB: 6,
  DATA_ENTRY_LSB: 38,
  NRPN_LSB: 98,
  NRPN_MSB: 99,
} as const;

const STATUS_CC = 0xb0; // Control Change, channel nibble OR'd in

function assert7bit(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError(`${label} must be a 7-bit integer (0-127), got ${value}`);
  }
}

function assertChannel(channel: number): void {
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
    throw new RangeError(`MIDI channel must be 0-15 (=channel 1-16), got ${channel}`);
  }
}

/** A single Control Change message: [status, controller, value]. */
export function controlChange(channel: number, controller: number, value: number): number[] {
  assertChannel(channel);
  assert7bit('CC controller', controller);
  assert7bit('CC value', value);
  return [STATUS_CC | channel, controller, value];
}

/**
 * Plain CC send path (Phase 1, path 1).
 * Returns a single CC message array.
 */
export function buildCC(channel: number, controller: number, value: number): number[][] {
  return [controlChange(channel, controller, value)];
}

/**
 * NRPN send path (Phase 1, path 2).
 *
 * Per the Nord Stage 4 manual (v1.2x Edition K, Appendix II, p.66, verbatim):
 *   "The first number corresponds to CC#99 (NRPN MSB) and the second to CC#98
 *    (NRPN LSB). The parameter value is defined by CC#38 (Data Entry LSB).
 *    Unless otherwise is specified, Data Entry MSB (CC#6) is expected to be 0.
 *    A complete NRPN package consists of four messages: CC#99, CC#98, CC#6 and
 *    CC#38."
 *
 * So an ordinary 0-127 NRPN parameter is sent as ALL FOUR messages, with the
 * value in Data Entry LSB and Data Entry MSB = 0:
 *   CC 99 (NRPN MSB)      = nrpnMsb
 *   CC 98 (NRPN LSB)      = nrpnLsb
 *   CC  6 (Data Entry MSB)= 0
 *   CC 38 (Data Entry LSB)= value
 *
 * NOTE: this corrects an earlier assumption (value in CC 6). The manual is
 * authoritative and hardware-confirmed. The 14-bit "Sample category and sample"
 * exception (value also in CC 6) is handled by buildNRPN14.
 */
export function buildNRPN(channel: number, nrpnMsb: number, nrpnLsb: number, value: number): number[][] {
  assert7bit('NRPN MSB', nrpnMsb);
  assert7bit('NRPN LSB', nrpnLsb);
  assert7bit('NRPN value', value);
  return [
    controlChange(channel, CC.NRPN_MSB, nrpnMsb),
    controlChange(channel, CC.NRPN_LSB, nrpnLsb),
    controlChange(channel, CC.DATA_ENTRY_MSB, 0),
    controlChange(channel, CC.DATA_ENTRY_LSB, value),
  ];
}

/**
 * 14-bit NRPN send path (Phase 1, path 3).
 *
 * Special case for the Nord Synth "Sample category and sample"
 * (NRPN MSB 3 / LSB 4): Data Entry MSB selects the CATEGORY, Data Entry LSB
 * selects the SAMPLE within that category. Both bytes are always sent, and the
 * semantics of the two data bytes differ from a normal 14-bit value (they are
 * two independent selectors, not a combined high/low pair).
 *
 * Modeled distinctly so the translation layer never conflates it with a generic
 * 14-bit numeric parameter.
 */
export function buildNRPN14(
  channel: number,
  nrpnMsb: number,
  nrpnLsb: number,
  dataMsb: number,
  dataLsb: number,
): number[][] {
  assert7bit('NRPN14 data MSB', dataMsb);
  assert7bit('NRPN14 data LSB', dataLsb);
  return [
    controlChange(channel, CC.NRPN_MSB, nrpnMsb),
    controlChange(channel, CC.NRPN_LSB, nrpnLsb),
    controlChange(channel, CC.DATA_ENTRY_MSB, dataMsb),
    controlChange(channel, CC.DATA_ENTRY_LSB, dataLsb),
  ];
}
