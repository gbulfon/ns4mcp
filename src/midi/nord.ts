/**
 * Nord-specific MIDI controller.
 *
 * Wraps a `MidiDevice` and the pure message builders, holding the configured
 * MIDI channel and the device port-name match. This is the layer the MCP tools
 * call: it exposes the three send paths (CC, NRPN, 14-bit NRPN) by intent, and
 * relays inbound messages for state reconciliation.
 */

import { buildCC, buildNRPN, buildNRPN14 } from './messages.js';
import { MidiDevice, MidiMessageListener, PortInfo, RtMidiDevice } from './device.js';

/** Default substring used to find the Nord's MIDI ports. */
export const DEFAULT_PORT_MATCH = 'nord';

export interface NordConfig {
  /** Substring to match the Nord MIDI port name (case-insensitive). */
  portMatch?: string;
  /** MIDI channel 1-16 (Nord global channel). Defaults to 1. */
  channel?: number;
  /** Inject a device (e.g. a mock) for testing. */
  device?: MidiDevice;
}

export class NordMidi {
  readonly device: MidiDevice;
  readonly portMatch: string;
  /** 0-indexed channel (0-15) used on the wire. */
  readonly channel: number;
  private opened?: { input?: PortInfo; output?: PortInfo };

  constructor(config: NordConfig = {}) {
    this.device = config.device ?? new RtMidiDevice();
    this.portMatch = config.portMatch ?? DEFAULT_PORT_MATCH;
    const ch = config.channel ?? 1;
    if (!Number.isInteger(ch) || ch < 1 || ch > 16) {
      throw new RangeError(`channel must be 1-16, got ${ch}`);
    }
    this.channel = ch - 1;
  }

  open(): { input?: PortInfo; output?: PortInfo } {
    this.opened = this.device.open(this.portMatch);
    return this.opened;
  }

  close(): void {
    this.device.close();
  }

  isOpen(): boolean {
    return this.device.isOpen();
  }

  onMessage(listener: MidiMessageListener): void {
    this.device.onMessage(listener);
  }

  onDisconnect(listener: (reason: string) => void): void {
    this.device.onDisconnect(listener);
  }

  // --- The three send paths (Phase 1) ---

  /** Plain CC. */
  sendCC(controller: number, value: number): number[][] {
    const msgs = buildCC(this.channel, controller, value);
    this.device.sendAll(msgs);
    return msgs;
  }

  /** Standard NRPN: value goes in Data Entry LSB (CC38), Data Entry MSB (CC6)=0. */
  sendNRPN(nrpnMsb: number, nrpnLsb: number, value: number): number[][] {
    const msgs = buildNRPN(this.channel, nrpnMsb, nrpnLsb, value);
    this.device.sendAll(msgs);
    return msgs;
  }

  /** 14-bit NRPN (e.g. Sample category+sample: NRPN 3/4, MSB=category LSB=sample). */
  sendNRPN14(nrpnMsb: number, nrpnLsb: number, dataMsb: number, dataLsb: number): number[][] {
    const msgs = buildNRPN14(this.channel, nrpnMsb, nrpnLsb, dataMsb, dataLsb);
    this.device.sendAll(msgs);
    return msgs;
  }

  /** Play a note (raw Note On). For auditioning sounds without the user playing. */
  noteOn(note: number, velocity = 100): number[] {
    const m = [0x90 | this.channel, note & 0x7f, velocity & 0x7f];
    this.device.send(m);
    return m;
  }

  /** Release a note (Note On with velocity 0 — universally accepted Note Off). */
  noteOff(note: number): number[] {
    const m = [0x90 | this.channel, note & 0x7f, 0];
    this.device.send(m);
    return m;
  }

  /** Panic: All Notes Off (CC 123) — safety to avoid stuck notes. */
  allNotesOff(): void {
    this.sendCC(123, 0);
  }
}
