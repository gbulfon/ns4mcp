/**
 * nrpn-test — hardware confirmation of the manual-corrected NRPN format.
 *
 * Isolates the piano, then plays the SAME chord several times while changing
 * Piano Type via NRPN (2/32). If the piano character changes between repeats,
 * standard NRPN (value in CC38 / Data Entry LSB, CC6=0) works on hardware.
 *
 *   npm run nrpn-test
 *   npm run nrpn-test -- --channel 3
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join(' ');

const CC = {
  globalVolume: 7,
  organEnableI: 9, organEnableII: 2,
  pianoEnableI: 33, pianoEnableII: 3, pianoLevelA: 34,
  synthEnableI: 42, synthEnableII: 5,
} as const;

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'NONE'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port');

  console.log('\nIsolate piano (organ + synth off, piano on, volume up)');
  nord.sendCC(CC.globalVolume, 110);
  nord.sendCC(CC.organEnableI, 0); nord.sendCC(CC.organEnableII, 0);
  nord.sendCC(CC.synthEnableI, 0); nord.sendCC(CC.synthEnableII, 0);
  nord.sendCC(CC.pianoEnableI, 127); nord.sendCC(CC.pianoEnableII, 127);
  nord.sendCC(CC.pianoLevelA, 100);
  await sleep(400);

  const chord = [48, 55, 60, 64];
  console.log(`\nPlaying chord ${JSON.stringify(chord)} once per Piano Type value.`);
  console.log('Listen for the piano SOUND/CHARACTER changing between repeats.\n');

  // Spread across 0-127 so we land in DIFFERENT piano categories (each spans ~18 values).
  for (const type of [0, 32, 64, 96, 127]) {
    const sent = nord.sendNRPN(2, 32, type); // Piano Type, manual-correct 4-message NRPN
    console.log(`>>> Piano Type = ${type}`);
    sent.forEach((m) => console.log(`      ${hex(m)}`));
    await sleep(700); // let the type load
    chord.forEach((n) => nord.noteOn(n, 110));
    await sleep(2200);
    chord.forEach((n) => nord.noteOff(n));
    console.log('    (released)\n');
    await sleep(1500);
  }

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('Done. Did the piano character change across the 5 repeats? If yes, NRPN is confirmed.');
  console.log('(Reload the program on the Nord to restore your original patch.)');
  process.exit(0);
}

main().catch((err) => { console.error('nrpn-test failed:', err.message); process.exit(1); });
