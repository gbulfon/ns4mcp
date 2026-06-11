/**
 * audition-debug — isolate WHY MIDI-triggered notes are silent.
 *
 * Plays a sustained chord in three staged configurations with pauses between.
 * Tell me which stage (A / B / C), if any, you actually heard.
 *
 *   npm run audition-debug
 *   npm run audition-debug -- --channel 3
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const CC = {
  globalVolume: 7,
  organEnableI: 9, organEnableII: 2,
  pianoEnableI: 33, pianoEnableII: 3, pianoLevelA: 34,
  synthEnableI: 42, synthEnableII: 5, synthLevelA: 43,
  synthLayersEnableI: 61, synthLayersEnableII: 75,
  synthLayersFocusI: 115, synthLayersFocusII: 119,
  ampAttack: 68, ampDecay: 69, ampRelease: 71,
  filterFreq: 59, filterReso: 60,
} as const;

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'NONE'} in=${ports.input?.name ?? 'none'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port');

  const cc = (c: number, v: number) => nord.sendCC(c, v);

  async function play(label: string, notes: number[], holdMs = 3000, arpeggiate = false): Promise<void> {
    console.log(`\n>>> LISTEN ${label} — notes ${JSON.stringify(notes)}${arpeggiate ? ' (arpeggio)' : ' (block chord)'} for ${holdMs / 1000}s`);
    if (arpeggiate) {
      for (const n of notes) { nord.noteOn(n, 112); await sleep(350); }
    } else {
      notes.forEach((n) => nord.noteOn(n, 112));
    }
    await sleep(holdMs);
    notes.forEach((n) => nord.noteOff(n));
    console.log('    (released) — silence for 2.5s, next stage...');
    await sleep(2500);
  }

  // Register-distinct, self-identifying gestures:
  const PIANO_NOTES = [48, 52, 55, 60]; // low rising arpeggio
  const SYNTH_NOTES = [72, 76, 79];     // high block chord

  console.log('\nGlobal volume up (CC7=110)');
  cc(CC.globalVolume, 110);

  // ---- Stage A: PIANO only (known-good sound) ----
  console.log('\n=== Stage A: PIANO only (organ+synth off) ===');
  cc(CC.organEnableI, 0); cc(CC.organEnableII, 0);
  cc(CC.synthEnableI, 0); cc(CC.synthEnableII, 0);
  cc(CC.pianoEnableI, 127); cc(CC.pianoEnableII, 127); cc(CC.pianoLevelA, 100);
  await sleep(300);
  await play('STAGE A (PIANO)', PIANO_NOTES, 3000, true);

  // ---- Stage B: SYNTH via "section enable" ----
  console.log('\n=== Stage B: SYNTH via section-enable (CC42/CC5) ===');
  cc(CC.pianoEnableI, 0); cc(CC.pianoEnableII, 0);
  cc(CC.synthEnableI, 127); cc(CC.synthEnableII, 127); cc(CC.synthLevelA, 100);
  cc(CC.ampAttack, 0); cc(CC.ampDecay, 90); cc(CC.ampRelease, 40);
  cc(CC.filterReso, 30); cc(CC.filterFreq, 110);
  await sleep(300);
  await play('STAGE B (SYNTH section-enable)', SYNTH_NOTES, 3000, false);

  // ---- Stage C: SYNTH also via "layers enable" + focus ----
  console.log('\n=== Stage C: SYNTH layers-enable + focus (CC61/75/115/119) ===');
  cc(CC.synthLayersEnableI, 127); cc(CC.synthLayersEnableII, 127);
  cc(CC.synthLayersFocusI, 127); cc(CC.synthLayersFocusII, 127);
  cc(CC.synthLevelA, 110); cc(CC.filterFreq, 110);
  await sleep(300);
  await play('STAGE C (SYNTH layers-enable)', SYNTH_NOTES, 3000, false);

  console.log('\nDone. Which stage(s) did you hear? A=piano works (note-in OK), B/C=synth enable path.');
  console.log('(Reload the program on the Nord to restore your original patch.)');
  await sleep(150);
  nord.close();
  process.exit(0);
}

main().catch((err) => { console.error('audition-debug failed:', err.message); process.exit(1); });
