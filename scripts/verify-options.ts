/**
 * verify-options — step each option-bearing selector in a section through its
 * options, sending the schema's value and printing the EXPECTED label. Watch the
 * Nord display: it shows the selected option name as each value arrives. Report
 * any where the display name doesn't match the printed expected label.
 *
 *   npm run verify-options -- --section organ
 *   npm run verify-options -- --section synth
 *   npm run verify-options -- --id synth-filter.type
 */

import { readFileSync } from 'node:fs';
import { NordMidi } from '../src/midi/nord.js';
import type { ParameterSchema, ParameterSpec } from '../src/schema/types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const schema = JSON.parse(readFileSync(new URL('../src/schema/parameters.json', import.meta.url), 'utf8')) as ParameterSchema;

function sectionOf(id: string): 'organ' | 'piano' | 'synth' | 'other' {
  if (id.startsWith('organ.')) return 'organ';
  if (id.startsWith('piano.')) return 'piano';
  if (id.startsWith('synth')) return 'synth';
  return 'other';
}

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const ch = channel - 1;
  const onlyId = arg('id');
  const section = (arg('section') ?? 'organ') as 'organ' | 'piano' | 'synth';

  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'NONE'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port');

  const cc = (c: number, v: number) => nord.device.send([0xb0 | ch, c, v]);
  const nrpn = (msb: number, lsb: number, v: number) => { cc(99, msb); cc(98, lsb); cc(6, 0); cc(38, v); };
  const send = (p: ParameterSpec, v: number) => p.addressing === 'cc' ? cc(p.cc!, v) : nrpn(p.nrpnMsb!, p.nrpnLsb!, v);

  const targets = (onlyId ? schema.parameters.filter((p) => p.id === onlyId) : schema.parameters.filter((p) => p.options && sectionOf(p.id) === section));
  if (targets.length === 0) throw new Error(`no option-bearing params for ${onlyId ?? section}`);

  const keep = onlyId ? sectionOf(onlyId) : section;
  console.log(`\nIsolating ${keep} section so the display + sound follow the changes...`);
  cc(7, 110);
  cc(9, keep === 'organ' ? 127 : 0); cc(2, keep === 'organ' ? 127 : 0);
  cc(33, keep === 'piano' ? 127 : 0); cc(3, keep === 'piano' ? 127 : 0);
  cc(42, keep === 'synth' ? 127 : 0); cc(5, keep === 'synth' ? 127 : 0);
  if (keep === 'organ') { cc(13, 100); for (const d of [16, 17, 18]) cc(d, 127); }
  if (keep === 'piano') cc(34, 100);
  if (keep === 'synth') { cc(43, 100); cc(68, 0); cc(59, 110); } // level, amp attack 0, filter open
  await sleep(500);

  const chord = [48, 55, 60, 64];
  const play = async () => { chord.forEach((n) => nord.noteOn(n, 108)); await sleep(1100); chord.forEach((n) => nord.noteOff(n)); await sleep(600); };

  for (const p of targets) {
    console.log(`\n=== ${p.id}  (${p.addressing === 'cc' ? 'CC' + p.cc : 'NRPN ' + p.nrpnMsb + '/' + p.nrpnLsb}) ===`);
    for (const o of p.options!) {
      console.log(`  → send value ${String(o.value).padStart(3)}  EXPECT display: "${o.label}"`);
      send(p, o.value);
      await sleep(450);
      await play();
    }
  }

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('\nDone. For each parameter, did the Nord display show the EXPECTED labels in order?');
  console.log('Tell me any mismatches (e.g. "synth-filter.type step 3 showed LP 12 not LP M").');
  console.log('(Reload the program on the Nord to restore your patch.)');
  process.exit(0);
}

main().catch((err) => { console.error('verify-options failed:', err.message); process.exit(1); });
