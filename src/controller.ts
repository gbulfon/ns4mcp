/**
 * NordController — the runtime that the MCP tools operate on.
 *
 * Bundles the MIDI device, the parameter schema, and the authoritative patch
 * state. Handles graceful connect/reconnect and a dry-run mode so the server can
 * run (for inspection) even with no hardware attached.
 */

import { NordMidi, type NordConfig } from './midi/nord.js';
import { Schema } from './schema/load.js';
import { PatchState } from './state/patch.js';
import { applyChange, buildChange, type ParamChange, type AppliedChange } from './translate.js';
import type { ValidationError } from './schema/load.js';

export interface ControllerOptions extends NordConfig {
  /** Never send MIDI; validate + update state only. */
  dryRun?: boolean;
  /** stderr logger (stdout is reserved for the MCP stdio transport). */
  log?: (msg: string) => void;
}

export class NordController {
  readonly schema: Schema;
  readonly state: PatchState;
  readonly nord: NordMidi;
  private readonly log: (msg: string) => void;
  dryRun: boolean;
  connected = false;
  lastError?: string;
  /** Saved audition set so the client can step through variations across calls. */
  auditionSet?: { label: string; changes: ParamChange[] }[];

  constructor(opts: ControllerOptions = {}) {
    this.schema = Schema.load();
    this.state = new PatchState(this.schema);
    this.nord = new NordMidi(opts);
    this.dryRun = opts.dryRun ?? false;
    this.log = opts.log ?? ((m) => process.stderr.write(`[ns4mcp] ${m}\n`));

    this.nord.onMessage((msg) => {
      const id = this.state.ingest(msg);
      if (id) this.log(`readback ${id} = ${this.state.get(id)?.value}`);
    });
    this.nord.onDisconnect((reason) => {
      this.connected = false;
      this.lastError = reason;
      this.log(`device disconnected: ${reason}`);
    });
  }

  /** Try to open the Nord. Safe to call repeatedly (idempotent reconnect). */
  ensureConnected(): boolean {
    if (this.dryRun) return false;
    if (this.connected && this.nord.isOpen()) return true;
    try {
      const ports = this.nord.open();
      this.connected = true;
      this.lastError = undefined;
      this.log(`connected: out=${ports.output?.name ?? 'none'} in=${ports.input?.name ?? 'none'}`);
      return true;
    } catch (err) {
      this.connected = false;
      this.lastError = (err as Error).message;
      this.log(`connect failed: ${this.lastError}`);
      return false;
    }
  }

  /**
   * Validate and apply a batch of changes. In dry-run or when disconnected,
   * validation still runs and (in dry-run) state is updated; on a live device,
   * state updates only for successfully-sent changes.
   */
  async applyBatch(changes: ParamChange[]): Promise<{ applied: AppliedChange[]; errors: ValidationError[]; sent: boolean }> {
    const applied: AppliedChange[] = [];
    const errors: ValidationError[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Validate-only pass first so a bad batch reports all problems without
    // half-sending. We resolve by attempting apply on a connected device.
    const live = !this.dryRun && this.ensureConnected();

    let i = 0;
    for (const change of changes) {
      if (live) {
        try {
          const result = applyChange(this.nord, this.schema, change);
          if ('message' in result) errors.push(result);
          else {
            applied.push(result);
            this.state.set(result.id, result.value, 'set');
            // Pace sends: the Nord drops messages if a burst arrives too fast.
            // NRPN params (esp. oscillator type/category/wave, which trigger a
            // reload) need a generous gap; plain CC needs only a little.
            if (++i < changes.length) await sleep(result.addressing === 'cc' ? 12 : 150);
          }
        } catch (err) {
          errors.push({ id: change.id, message: `send failed: ${(err as Error).message}` });
        }
      } else {
        // Dry validation: reuse the translator against a no-op send by checking
        // the schema directly via a throwaway resolve through applyChange would
        // send; instead validate without sending.
        const res = this.validateOnly(change);
        if ('message' in res) errors.push(res);
        else {
          applied.push(res);
          if (this.dryRun) this.state.set(res.id, res.value, 'set');
        }
      }
    }
    return { applied, errors, sent: live };
  }

  /** Validate a change and compute the REAL bytes that would be sent, without sending. */
  private validateOnly(change: ParamChange): AppliedChange | ValidationError {
    return buildChange(this.schema, change, this.nord.channel);
  }

  /**
   * Play notes so a human can audition the current sound (the server can't hear).
   * Block chord by default; set `gapMs > 0` to arpeggiate. Always releases notes
   * (try/finally + All Notes Off) so nothing sticks. Duration is capped.
   */
  async playNotes(
    notes: number[],
    opts: { velocity?: number; durationMs?: number; gapMs?: number } = {},
  ): Promise<{ played: boolean; notes: number[]; durationMs: number; reason?: string }> {
    const velocity = Math.max(1, Math.min(127, opts.velocity ?? 100));
    const durationMs = Math.max(50, Math.min(10_000, opts.durationMs ?? 1500));
    const gapMs = Math.max(0, Math.min(2000, opts.gapMs ?? 0));
    const valid = notes.filter((n) => Number.isInteger(n) && n >= 0 && n <= 127);

    if (valid.length === 0) return { played: false, notes: [], durationMs, reason: 'no valid MIDI notes (0-127)' };
    const live = !this.dryRun && this.ensureConnected();
    if (!live) {
      return { played: false, notes: valid, durationMs, reason: this.dryRun ? 'dry-run' : `not connected (${this.lastError ?? 'unknown'})` };
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      for (const n of valid) {
        this.nord.noteOn(n, velocity);
        if (gapMs > 0) await sleep(gapMs);
      }
      await sleep(durationMs);
    } finally {
      for (const n of valid) {
        try { this.nord.noteOff(n); } catch { /* ignore */ }
      }
      try { this.nord.allNotesOff(); } catch { /* ignore */ }
    }
    return { played: true, notes: valid, durationMs };
  }

  /**
   * Play a timed sequence of notes (a melody, with rhythm and rests) in ONE call,
   * so it sounds continuous. Each step is monophonic (a pitch) or a chord (pitches);
   * null/empty pitch is a rest. Durations come from `beats` at `tempoBpm`. `gate`
   * is the fraction of each step the note(s) sound before release (separation).
   */
  async playSequence(
    steps: Array<{ pitch?: number | number[] | null; beats?: number; velocity?: number }>,
    opts: { tempoBpm?: number; gate?: number; velocity?: number } = {},
  ): Promise<{ played: boolean; steps: number; totalMs: number; tempoBpm: number; truncated: boolean; reason?: string }> {
    const tempoBpm = Math.max(20, Math.min(300, opts.tempoBpm ?? 120));
    const gate = Math.max(0.1, Math.min(1, opts.gate ?? 0.85));
    const baseVel = Math.max(1, Math.min(127, opts.velocity ?? 100));
    const beatMs = 60_000 / tempoBpm;
    const MAX_STEPS = 512;
    const MAX_TOTAL_MS = 120_000;

    if (!Array.isArray(steps) || steps.length === 0) {
      return { played: false, steps: 0, totalMs: 0, tempoBpm, truncated: false, reason: 'no steps' };
    }
    const live = !this.dryRun && this.ensureConnected();
    if (!live) {
      return { played: false, steps: steps.length, totalMs: 0, tempoBpm, truncated: false, reason: this.dryRun ? 'dry-run' : `not connected (${this.lastError ?? 'unknown'})` };
    }

    const norm = (p: number | number[] | null | undefined): number[] => {
      const arr = p == null ? [] : Array.isArray(p) ? p : [p];
      return arr.filter((n) => Number.isInteger(n) && n >= 0 && n <= 127);
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let elapsed = 0;
    let done = 0;
    let truncated = false;
    try {
      for (const step of steps.slice(0, MAX_STEPS)) {
        const dur = Math.max(0.0625, Math.min(16, step.beats ?? 1)) * beatMs;
        if (elapsed + dur > MAX_TOTAL_MS) { truncated = true; break; }
        const pitches = norm(step.pitch);
        const vel = Math.max(1, Math.min(127, step.velocity ?? baseVel));
        if (pitches.length === 0) {
          await sleep(dur); // rest
        } else {
          const onMs = dur * gate;
          for (const n of pitches) this.nord.noteOn(n, vel);
          await sleep(onMs);
          for (const n of pitches) this.nord.noteOff(n);
          await sleep(dur - onMs);
        }
        elapsed += dur;
        done++;
      }
    } finally {
      try { this.nord.allNotesOff(); } catch { /* ignore */ }
    }
    if (steps.length > MAX_STEPS) truncated = true;
    return { played: true, steps: done, totalMs: Math.round(elapsed), tempoBpm, truncated };
  }

  close(): void {
    try { this.nord.allNotesOff(); } catch { /* ignore */ }
    this.nord.close();
  }
}
