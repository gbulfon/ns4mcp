/**
 * nrpn-diagnose — pinpoint why an NRPN parameter change isn't audible.
 * Three labelled stages; report which produced an audible change.
 *
 *   npm run nrpn-diagnose
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const CC = {
  globalVolume: 7,
  organEnableI: 9, organEnableII: 2,
  pianoEnableI: 33, pianoEnableII: 3, pianoLevelA: 34,
  synthEnableI: 42, synthEnableII: 5,
} as const;

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const ch = channel - 1;
  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'NONE'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port');

  // Raw send helpers (bypass NordMidi for the old-format experiment)
  const raw = (bytes: number[]) => nord.device.send(bytes);
  const cc = (c: number, v: number) => raw([0xb0 | ch, c, v]);

  console.log('\nIsolate piano (organ + synth off, piano on, volume up)');
  cc(CC.globalVolume, 110);
  cc(CC.organEnableI, 0); cc(CC.organEnableII, 0);
  cc(CC.synthEnableI, 0); cc(CC.synthEnableII, 0);
  cc(CC.pianoEnableI, 127); cc(CC.pianoEnableII, 127);
  cc(CC.pianoLevelA, 100);
  await sleep(400);

  const chord = [48, 55, 60, 64];
  const hold = async (ms: number, mid?: () => Promise<void>) => {
    chord.forEach((n) => nord.noteOn(n, 110));
    if (mid) await mid(); else await sleep(ms);
    chord.forEach((n) => nord.noteOff(n));
    await sleep(1200);
  };

  // ---- Stage A: CC parameter sanity — sweep Piano A Level (CC34) ----
  console.log('\n=== STAGE A: sweep Piano A Level (CC34) while holding chord ===');
  console.log('    Expect: volume swells loud -> soft -> loud. (Tests CC param response.)');
  await hold(0, async () => {
    for (const v of [127, 90, 50, 10, 50, 90, 127]) { cc(CC.pianoLevelA, v); await sleep(450); }
  });
  cc(CC.pianoLevelA, 100);
  await sleep(800);

  // ---- Stage B: NRPN NEW format (value in CC38 / Data Entry LSB, CC6=0) ----
  console.log('\n=== STAGE B: Piano Type via NRPN NEW format (value in CC38) ===');
  console.log('    Two chords: Type 0 then Type 127.');
  for (const v of [0, 127]) {
    cc(99, 2); cc(98, 32); cc(6, 0); cc(38, v);   // CC99,CC98,CC6=0,CC38=value
    console.log(`    Type=${v}  [b0 63 02][b0 62 20][b0 06 00][b0 26 ${v.toString(16).padStart(2, '0')}]`);
    await sleep(700); await hold(2000);
  }

  // ---- Stage C: NRPN OLD format (value in CC6 / Data Entry MSB, no CC38) ----
  console.log('\n=== STAGE C: Piano Type via NRPN OLD format (value in CC6, no CC38) ===');
  console.log('    Two chords: Type 0 then Type 127.');
  for (const v of [0, 127]) {
    cc(99, 2); cc(98, 32); cc(6, v);              // CC99,CC98,CC6=value  (no CC38)
    console.log(`    Type=${v}  [b0 63 02][b0 62 20][b0 06 ${v.toString(16).padStart(2, '0')}]`);
    await sleep(700); await hold(2000);
  }

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('\nDone. Which stage(s) produced an audible change? A / B / C.');
  console.log('(Reload the program on the Nord to restore your patch.)');
  process.exit(0);
}

main().catch((err) => { console.error('nrpn-diagnose failed:', err.message); process.exit(1); });
