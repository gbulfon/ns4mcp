/**
 * reverb-test — make the reverb on/off contrast obvious: crank wet amount
 * (CC113), pick a large reverb type (NRPN 2/105), then toggle enable (NRPN 2/104)
 * while playing a single short note with a long tail to listen to.
 *
 *   npm run reverb-test
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
  const nrpn = (msb: number, lsb: number, v: number) => { cc(99, msb); cc(98, lsb); cc(6, 0); cc(38, v); };

  console.log('\nIsolate piano + crank reverb wet amount (CC113) + large reverb type (NRPN 2/105)');
  cc(7, 110); cc(9, 0); cc(2, 0); cc(42, 0); cc(5, 0); cc(33, 127); cc(3, 127); cc(34, 100);
  cc(113, 120);          // reverb amount (mix) -> very wet
  nrpn(2, 105, 110);     // reverb type -> large (hall/cathedral-ish)
  await sleep(400);

  const note = 60;
  const stab = async (label: string) => {
    console.log(`    ${label}: short note, then 3.5s to hear the tail`);
    nord.noteOn(note, 112);
    await sleep(350);
    nord.noteOff(note);
    await sleep(3500);
  };

  console.log('\nToggling REVERB enable (NRPN 2/104), wet amount maxed:');
  for (let i = 0; i < 3; i++) {
    nrpn(2, 104, 0); await sleep(400); await stab('reverb OFF (should be dry/short)');
    nrpn(2, 104, 127); await sleep(400); await stab('reverb ON  (should bloom with a long tail)');
  }

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('\nDone. With the wet amount cranked, the ON repeats should have an obvious tail.');
  console.log('(Reload the program on the Nord to restore your patch.)');
  process.exit(0);
}

main().catch((err) => { console.error('reverb-test failed:', err.message); process.exit(1); });
