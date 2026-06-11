/**
 * nrpn-fx-test — does ANY NRPN take effect? Toggle high-contrast effect enables
 * (Reverb 2/104, Delay 2/88) which are NRPN-only. Wet<->dry is unmistakable.
 *
 *   npm run nrpn-fx-test
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const ch = channel - 1;
  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'NONE'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port');

  const cc = (c: number, v: number) => nord.device.send([0xb0 | ch, c, v]);
  // Standard NRPN per manual: CC99, CC98, CC6=0, value in CC38.
  const nrpn = (msb: number, lsb: number, v: number) => { cc(99, msb); cc(98, lsb); cc(6, 0); cc(38, v); };

  console.log('\nIsolate piano (organ + synth off, piano on, volume up)');
  cc(7, 110); cc(9, 0); cc(2, 0); cc(42, 0); cc(5, 0); cc(33, 127); cc(3, 127); cc(34, 100);
  await sleep(400);

  const chord = [48, 55, 60, 64];
  const stab = async (label: string) => {
    console.log(`    play: ${label} (short chord, then 2s to hear any tail/echo)`);
    chord.forEach((n) => nord.noteOn(n, 112));
    await sleep(450);
    chord.forEach((n) => nord.noteOff(n));
    await sleep(2200);
  };

  console.log('\n=== STAGE 1: REVERB enable (NRPN 2/104) ===');
  for (let i = 0; i < 2; i++) {
    nrpn(2, 104, 0); await sleep(400); await stab('reverb OFF');
    nrpn(2, 104, 127); await sleep(400); await stab('reverb ON (listen for tail)');
  }

  console.log('\n=== STAGE 2: DELAY enable (NRPN 2/88) ===');
  for (let i = 0; i < 2; i++) {
    nrpn(2, 88, 0); await sleep(400); await stab('delay OFF');
    nrpn(2, 88, 127); await sleep(400); await stab('delay ON (listen for echoes)');
  }

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('\nDone. Did reverb tail or delay echoes appear/disappear? If yes, NRPN works.');
  console.log('(Reload the program on the Nord to restore your patch.)');
  process.exit(0);
}

main().catch((err) => { console.error('nrpn-fx-test failed:', err.message); process.exit(1); });
