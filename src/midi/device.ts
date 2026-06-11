/**
 * MIDI device abstraction.
 *
 * `MidiDevice` is the interface the rest of the app depends on. The concrete
 * `RtMidiDevice` wraps @julusian/midi (raw byte I/O — required for NRPN). A mock
 * implementation can satisfy the same interface for tests or for running the MCP
 * server without hardware attached.
 */

import { Input, Output } from '@julusian/midi';

export interface PortInfo {
  index: number;
  name: string;
}

export type MidiMessageListener = (message: number[], deltaTime: number) => void;
export type DisconnectListener = (reason: string) => void;

export interface MidiDevice {
  listOutputPorts(): PortInfo[];
  listInputPorts(): PortInfo[];
  /** Open in/out ports whose names match (case-insensitive substring). Returns the matched ports. */
  open(match: string): { input?: PortInfo; output?: PortInfo };
  close(): void;
  isOpen(): boolean;
  /** Send one raw MIDI message (array of bytes). */
  send(message: number[]): void;
  /** Send a sequence of raw MIDI messages in order. */
  sendAll(messages: number[][]): void;
  onMessage(listener: MidiMessageListener): void;
  onDisconnect(listener: DisconnectListener): void;
}

/** Find the first port whose name contains `match` (case-insensitive). */
export function findPort(ports: PortInfo[], match: string): PortInfo | undefined {
  const needle = match.toLowerCase();
  return ports.find((p) => p.name.toLowerCase().includes(needle));
}

export class RtMidiDevice implements MidiDevice {
  private readonly out = new Output();
  private readonly in = new Input();
  private opened = false;
  private openedOutputName?: string;
  private readonly messageListeners: MidiMessageListener[] = [];
  private readonly disconnectListeners: DisconnectListener[] = [];

  constructor() {
    // Receive everything except real-time clock spam; we DO want SysEx later.
    this.in.ignoreTypes(false, true, true);
    this.in.on('message', (deltaTime: number, message: number[]) => {
      for (const l of this.messageListeners) l(message, deltaTime);
    });
  }

  private static enumerate(io: Input | Output): PortInfo[] {
    const count = io.getPortCount();
    const ports: PortInfo[] = [];
    for (let i = 0; i < count; i++) ports.push({ index: i, name: io.getPortName(i) });
    return ports;
  }

  listOutputPorts(): PortInfo[] {
    return RtMidiDevice.enumerate(this.out);
  }

  listInputPorts(): PortInfo[] {
    return RtMidiDevice.enumerate(this.in);
  }

  open(match: string): { input?: PortInfo; output?: PortInfo } {
    const outPort = findPort(this.listOutputPorts(), match);
    const inPort = findPort(this.listInputPorts(), match);

    if (!outPort && !inPort) {
      throw new Error(`No MIDI port matching "${match}". Run \`npm run doctor\` to list ports.`);
    }
    if (outPort) {
      this.out.openPort(outPort.index);
      this.openedOutputName = outPort.name;
    }
    if (inPort) {
      this.in.openPort(inPort.index);
    }
    this.opened = true;
    return { input: inPort, output: outPort };
  }

  close(): void {
    if (this.out.isPortOpen()) this.out.closePort();
    if (this.in.isPortOpen()) this.in.closePort();
    this.opened = false;
  }

  isOpen(): boolean {
    return this.opened;
  }

  send(message: number[]): void {
    if (!this.out.isPortOpen()) {
      this.handleDisconnect('output port is not open');
      throw new Error('Cannot send: MIDI output port is not open.');
    }
    try {
      this.out.sendMessage(message);
    } catch (err) {
      this.handleDisconnect(`send failed: ${(err as Error).message}`);
      throw err;
    }
  }

  sendAll(messages: number[][]): void {
    for (const m of messages) this.send(m);
  }

  onMessage(listener: MidiMessageListener): void {
    this.messageListeners.push(listener);
  }

  onDisconnect(listener: DisconnectListener): void {
    this.disconnectListeners.push(listener);
  }

  /** Detect whether the previously-opened output port has vanished from the system. */
  isStillPresent(): boolean {
    if (!this.openedOutputName) return false;
    return this.listOutputPorts().some((p) => p.name === this.openedOutputName);
  }

  private handleDisconnect(reason: string): void {
    this.opened = false;
    for (const l of this.disconnectListeners) l(reason);
  }
}
