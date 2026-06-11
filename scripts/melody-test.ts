/**
 * melody-test — verify play_sequence renders a real melody continuously.
 * Plays "Fra Martino" (Frère Jacques) on an isolated Grand piano.
 *
 *   npm run melody-test
 */

import { NordController } from '../src/controller.js';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

// C major (middle C = 60). Each phrase played twice.
const N = (pitch: number | null, beats = 1) => ({ pitch, beats });
const FRA_MARTINO = [
  // Fra Martino (x2)
  N(60), N(62), N(64), N(60),
  N(60), N(62), N(64), N(60),
  // Dormi tu (x2)
  N(64), N(65), N(67, 2),
  N(64), N(65), N(67, 2),
  // Suona le campane (x2): quick run G-A-G-F (sixteenths), then rest on E and C
  N(67, 0.25), N(69, 0.25), N(67, 0.25), N(65, 0.25), N(64, 1.5), N(60, 1.5),
  N(67, 0.25), N(69, 0.25), N(67, 0.25), N(65, 0.25), N(64, 1.5), N(60, 1.5),
  // Din don dan (x2)
  N(60), N(55), N(60, 2),
  N(60), N(55), N(60, 2),
];

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const ctrl = new NordController({ channel });
  if (!ctrl.ensureConnected()) throw new Error(`not connected: ${ctrl.lastError}`);

  // Isolate piano + select Grand category.
  ctrl.nord.sendCC(7, 110);
  ctrl.nord.sendCC(9, 0); ctrl.nord.sendCC(2, 0);      // organ off
  ctrl.nord.sendCC(42, 0); ctrl.nord.sendCC(5, 0);     // synth off
  ctrl.nord.sendCC(33, 127); ctrl.nord.sendCC(3, 127); // piano on
  ctrl.nord.sendCC(34, 100);                            // piano A level
  ctrl.nord.sendNRPN(2, 32, 11);                        // piano type = Grand
  await new Promise((r) => setTimeout(r, 500));

  console.log('Playing "Fra Martino" via play_sequence (tempo 130)...');
  const result = await ctrl.playSequence(FRA_MARTINO, { tempoBpm: 130, gate: 0.8 });
  console.log('result:', JSON.stringify(result));

  ctrl.close();
  console.log('Done. Should have been a continuous, recognizable melody.');
  process.exit(0);
}

main().catch((err) => { console.error('melody-test failed:', err.message); process.exit(1); });
