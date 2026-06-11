/**
 * step — send ONE selector option and play a chord, for interactive Y/N
 * verification driven from the conversation.
 *
 *   npx tsx scripts/step.ts --id organ.model --index 0 --isolate
 *   npx tsx scripts/step.ts --id organ.model --index 1
 */

import { readFileSync } from 'node:fs';
import { NordMidi } from '../src/midi/nord.js';
import type { ParameterSchema, ParameterSpec } from '../src/schema/types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);

const schema = JSON.parse(readFileSync(new URL('../src/schema/parameters.json', import.meta.url), 'utf8')) as ParameterSchema;
const sectionOf = (id: string) => id.startsWith('organ.') ? 'organ' : id.startsWith('piano.') ? 'piano' : id.startsWith('synth') ? 'synth' : 'other';

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const ch = channel - 1;
  // Raw NRPN mode: --nrpn "3/1" --value N  (send an arbitrary NRPN, no schema needed)
  const rawNrpn = arg('nrpn');
  if (rawNrpn) {
    const [m, l] = rawNrpn.split('/').map(Number);
    const v = Number(arg('value') ?? '0');
    const nordR = new NordMidi({ channel });
    if (!nordR.open().output) throw new Error('no output port');
    const ccR = (c: number, val: number) => nordR.device.send([0xb0 | ch, c, val]);
    if (flag('isolate')) { ccR(7, 110); ccR(9, 0); ccR(2, 0); ccR(33, 0); ccR(3, 0); ccR(42, 127); ccR(5, 127); ccR(43, 100); ccR(68, 0); ccR(59, 110); await sleep(450); }
    ccR(99, m); ccR(98, l); ccR(6, 0); ccR(38, v);
    console.log(`NRPN ${m}/${l} = ${v}`);
    await sleep(400);
    [48, 55, 60, 64].forEach((n) => nordR.noteOn(n, 108));
    await sleep(1300);
    [48, 55, 60, 64].forEach((n) => nordR.noteOff(n));
    await sleep(200); nordR.allNotesOff(); nordR.close();
    process.exit(0);
  }

  const id = arg('id')!;
  const rawValue = arg('value');
  const index = Number(arg('index') ?? '0');
  const p = schema.parameters.find((x) => x.id === id) as ParameterSpec | undefined;
  if (!p) throw new Error(`no param ${id}`);
  const o = rawValue !== undefined ? { value: Number(rawValue), label: arg('label') ?? `value ${rawValue}` } : p.options?.[index];
  if (!o) throw new Error(`no option ${index} for ${id}`);

  const nord = new NordMidi({ channel });
  if (!nord.open().output) throw new Error('no output port');
  const cc = (c: number, v: number) => nord.device.send([0xb0 | ch, c, v]);
  const nrpn = (msb: number, lsb: number, v: number) => { cc(99, msb); cc(98, lsb); cc(6, 0); cc(38, v); };

  if (flag('isolate')) {
    const keep = sectionOf(id);
    cc(7, 110);
    cc(9, keep === 'organ' ? 127 : 0); cc(2, keep === 'organ' ? 127 : 0);
    cc(33, keep === 'piano' ? 127 : 0); cc(3, keep === 'piano' ? 127 : 0);
    cc(42, keep === 'synth' ? 127 : 0); cc(5, keep === 'synth' ? 127 : 0);
    if (keep === 'organ') { cc(13, 100); for (const d of [16, 17, 18]) cc(d, 127); }
    if (keep === 'piano') cc(34, 100);
    if (keep === 'synth') { cc(43, 100); cc(68, 0); cc(59, 110); }
    await sleep(450);
  }

  // Percussion is a standard-B3-only feature: set B3 model + enable percussion first.
  if (id === 'organ.percussion-harmonic') { nrpn(2, 16, 11); nrpn(2, 18, 127); nrpn(2, 23, 110); await sleep(350); }
  // Vibrato/chorus: set B3 model + enable vib/chorus so the selected type LED shows.
  if (id === 'organ.vibrato-type') { nrpn(2, 16, 11); nrpn(2, 20, 127); await sleep(350); }
  // Arp direction only shows in Arp/Poly mode (not Gate): set mode = Arp first.
  if (id === 'synth-arpeggiator.direction') { nrpn(3, 72, 21); await sleep(300); }

  if (p.addressing === 'cc') cc(p.cc!, o.value); else nrpn(p.nrpnMsb!, p.nrpnLsb!, o.value);
  console.log(`${id}[${index}] → value ${o.value}   EXPECT display: "${o.label}"`);
  await sleep(400);

  const chord = [48, 55, 60, 64];
  chord.forEach((n) => nord.noteOn(n, 108));
  await sleep(1300);
  chord.forEach((n) => nord.noteOff(n));
  await sleep(200);
  nord.allNotesOff();
  nord.close();
  process.exit(0);
}

main().catch((err) => { console.error('step failed:', err.message); process.exit(1); });
