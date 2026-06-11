/**
 * wind — build a wind sound from filtered Red Noise on the synth and hold it.
 * Requires the synth oscillator in Analog mode/type (Waveform 3:2 = 127 = Red Noise).
 *
 *   npm run wind
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const ch = channel - 1;
  const nord = new NordMidi({ channel });
  if (!nord.open().output) throw new Error('no output port');
  const cc = (c: number, v: number) => nord.device.send([0xb0 | ch, c, v]);
  // Paced sends — the Nord drops NRPNs if a burst arrives too fast.
  const C = async (c: number, v: number) => { cc(c, v); await sleep(20); };
  // NRPNs (esp. oscillator type/category/wave, which trigger a reload) need a
  // generous gap or the Nord drops the following message.
  const N = async (msb: number, lsb: number, v: number) => { cc(99, msb); cc(98, lsb); cc(6, 0); cc(38, v); await sleep(150); };

  console.log('Isolating synth + building wind patch...');
  await C(7, 110);
  await C(9, 0); await C(2, 0); await C(33, 0); await C(3, 0);   // organ + piano off
  await C(42, 127); await C(5, 127); await C(43, 100);          // synth on, level up

  await N(3, 1, 16);                           // Oscillator Type = Analog
  await N(3, 2, 120);                          // Oscillator Category = Misc
  await N(3, 3, 1);                            // Oscillator Wave = Red Noise (index 1)
  await N(3, 51, 32);                          // Filter type = LP 24
  await C(59, 42);                             // Filter cutoff: low/dark
  await C(60, 92);                             // Resonance: high -> howling whistle
  await N(3, 80, 13);                          // LFO waveform = Triangle
  await N(3, 81, 112);                         // LFO destination = Filter
  await C(79, 10);                             // LFO rate: very slow gusts
  await C(54, 85);                             // LFO amount: strong sweep (whistle glides)
  await C(68, 78);                             // Amp attack: slow swell-in
  await C(69, 70);                             // Amp decay
  await C(71, 95);                             // Amp release: long slow fade-out
  await sleep(300);

  console.log('Playing wind (held ~8s)... listen for filtered noise gusting up and down.');
  const note = 40; // pitch barely matters for noise
  nord.noteOn(note, 100);
  await sleep(10000);
  nord.noteOff(note);
  await sleep(3500); // let the long slow release tail ring

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('Done. Reload the program on the Nord to restore your patch.');
  process.exit(0);
}

main().catch((err) => { console.error('wind failed:', err.message); process.exit(1); });
