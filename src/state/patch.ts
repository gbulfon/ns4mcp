/**
 * Authoritative in-memory patch state + snapshot stack + inbound reconciliation.
 *
 * State maps parameter id -> canonical value. Snapshots support A/B compare and
 * undo (Phase 4). Inbound MIDI from the Nord is parsed back into parameter values
 * where possible so our state tracks panel edits.
 */

import type { Schema } from '../schema/load.js';
import { CC } from '../midi/messages.js';

export interface PatchValue {
  value: number;
  /** When the value last changed, ISO string. */
  at: string;
  /** 'set' = we sent it; 'readback' = parsed from the Nord; 'snapshot' = restored. */
  origin: 'set' | 'readback' | 'snapshot';
}

export interface Snapshot {
  label: string;
  at: string;
  values: Record<string, number>;
}

export class PatchState {
  private readonly values = new Map<string, PatchValue>();
  private readonly stack: Snapshot[] = [];
  private readonly ccIndex = new Map<number, string>();
  private readonly nrpnIndex = new Map<string, string>();

  constructor(private readonly schema: Schema, private readonly now: () => string = () => new Date().toISOString()) {
    for (const p of schema.parameters) {
      if (p.addressing === 'cc' && p.cc !== undefined) this.ccIndex.set(p.cc, p.id);
      if ((p.addressing === 'nrpn' || p.addressing === 'nrpn14') && p.nrpnMsb !== undefined && p.nrpnLsb !== undefined) {
        this.nrpnIndex.set(`${p.nrpnMsb}/${p.nrpnLsb}`, p.id);
      }
    }
  }

  set(id: string, value: number, origin: PatchValue['origin'] = 'set'): void {
    this.values.set(id, { value, at: this.now(), origin });
  }

  get(id: string): PatchValue | undefined {
    return this.values.get(id);
  }

  /** Full current state as a plain id->value map. */
  toJSON(): Record<string, PatchValue> {
    return Object.fromEntries(this.values);
  }

  /** Compact id->value map (for snapshots / resources). */
  flatValues(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, v] of this.values) out[id] = v.value;
    return out;
  }

  // --- Snapshots (Phase 4) ---

  snapshot(label: string): Snapshot {
    const snap: Snapshot = { label, at: this.now(), values: this.flatValues() };
    this.stack.push(snap);
    return snap;
  }

  listSnapshots(): Array<{ index: number; label: string; at: string; count: number }> {
    return this.stack.map((s, i) => ({ index: i, label: s.label, at: s.at, count: Object.keys(s.values).length }));
  }

  /** Restore a snapshot by index (default: most recent). Returns the diff to apply, or null. */
  peekSnapshot(index?: number): Snapshot | null {
    const i = index ?? this.stack.length - 1;
    return this.stack[i] ?? null;
  }

  popSnapshot(): Snapshot | null {
    return this.stack.pop() ?? null;
  }

  applySnapshotValues(snap: Snapshot): void {
    for (const [id, value] of Object.entries(snap.values)) this.set(id, value, 'snapshot');
  }

  // --- Inbound reconciliation ---

  /** NRPN parse state (one running address per channel is sufficient here). */
  private nrpnMsb = 0;
  private nrpnLsb = 0;
  private dataMsb = 0;

  /**
   * Feed an inbound MIDI message; update state if it maps to a known parameter.
   * Returns the affected parameter id, or null.
   */
  ingest(message: number[]): string | null {
    if ((message[0] & 0xf0) !== 0xb0) return null; // only Control Change
    const ctrl = message[1];
    const val = message[2];

    switch (ctrl) {
      case CC.NRPN_MSB:
        this.nrpnMsb = val;
        return null;
      case CC.NRPN_LSB:
        this.nrpnLsb = val;
        return null;
      case CC.DATA_ENTRY_MSB: {
        this.dataMsb = val;
        const id = this.nrpnIndex.get(`${this.nrpnMsb}/${this.nrpnLsb}`);
        if (!id) return null;
        const param = this.schema.get(id)!;
        // For nrpn14 we may also get a Data Entry LSB next; store MSB-shifted for now.
        const value = param.addressing === 'nrpn14' ? val << 7 : val;
        this.set(id, value, 'readback');
        return id;
      }
      case CC.DATA_ENTRY_LSB: {
        const id = this.nrpnIndex.get(`${this.nrpnMsb}/${this.nrpnLsb}`);
        if (!id) return null;
        const param = this.schema.get(id)!;
        if (param.addressing === 'nrpn14') {
          this.set(id, (this.dataMsb << 7) | val, 'readback');
          return id;
        }
        return null;
      }
      default: {
        const id = this.ccIndex.get(ctrl);
        if (!id) return null;
        this.set(id, val, 'readback');
        return id;
      }
    }
  }
}
