/**
 * browse-sounds — step through the loaded sounds of a section and play each,
 * so you can read the names off the Nord's DISPLAY (sound names are not sent
 * over MIDI; selection is by index only).
 *
 *   npm run browse-sounds -- --section piano            # 6 piano type categories
 *   npm run browse-sounds -- --section piano --models   # models within current type
 *   npm run browse-sounds -- --section piano --type 1 --models
 *   npm run browse-sounds -- --section organ            # 6 organ models
 *   npm run browse-sounds -- --section synth            # synth sample categories (needs sample osc)
 *   npm run browse-sounds -- --section piano --values 0,16,32,48,64,80,96,112,127
 *
 * For each step it prints the index/label and plays a chord. Watch the Nord
 * display for the actual loaded sound name, then tell me the names to record.
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);

// Fixed, documented category/model names (the only names knowable without the display).
const PIANO_TYPES = ['Grand', 'Upright', 'Electric Piano', 'Clav / Harpsichord', 'Digital', 'Misc (mallets etc.)'];
const ORGAN_MODELS = ['B3', 'B3 (2)/Bass', 'Vox', 'Farfisa', 'Pipe 1', 'Pipe 2'];

/** N midpoint values spanning 0-127 so each lands squarely in one of N options. */
const midpoints = (n: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * 128) / n));
/** Even spread for unknown-count browsing. */
const spread = (n: number) => Array.from({ length: n }, (_, i) => Math.round((i * 127) / (n - 1)));

async function main(): Promise<void> {
  const section = (arg('section') ?? 'piano').toLowerCase();
  const channel = Number(arg('channel') ?? '1');
  const ch = channel - 1;
  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'NONE'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port');

  const cc = (c: number, v: number) => nord.device.send([0xb0 | ch, c, v]);
  const nrpn = (msb: number, lsb: number, v: number) => { cc(99, msb); cc(98, lsb); cc(6, 0); cc(38, v); };

  // Isolate a section: turn the others off, this one on + audible.
  const isolate = (keep: 'organ' | 'piano' | 'synth') => {
    cc(7, 110);
    cc(9, keep === 'organ' ? 127 : 0); cc(2, keep === 'organ' ? 127 : 0); // organ enable I/II
    cc(33, keep === 'piano' ? 127 : 0); cc(3, keep === 'piano' ? 127 : 0); // piano enable I/II
    cc(42, keep === 'synth' ? 127 : 0); cc(5, keep === 'synth' ? 127 : 0); // synth enable I/II
    if (keep === 'organ') {
      cc(13, 100);                       // organ A level
      for (const d of [16, 17, 18]) cc(d, 127); // drawbars 1-3 full so it sounds
    }
    if (keep === 'piano') cc(34, 100);   // piano A level
    if (keep === 'synth') cc(43, 100);   // synth A level
  };

  const chord = [48, 55, 60, 64];
  const play = async (label: string, ms = 1900) => {
    console.log(`  ▶ ${label}`);
    chord.forEach((n) => nord.noteOn(n, 110));
    await sleep(ms);
    chord.forEach((n) => nord.noteOff(n));
    await sleep(1300);
  };

  const customValues = arg('values')?.split(',').map((s) => Number(s.trim()));

  if (section === 'piano') {
    isolate('piano');
    const typeArg = arg('type');
    if (typeArg !== undefined) nrpn(2, 32, midpoints(6)[Math.max(0, Math.min(5, Number(typeArg) - 1))]);
    await sleep(400);

    if (flag('models')) {
      const values = customValues ?? spread(10);
      console.log(`\nBrowsing PIANO MODELS within the current type (NRPN 2/33). Read names off the Nord display.\n`);
      for (let i = 0; i < values.length; i++) { nrpn(2, 33, values[i]); await sleep(500); await play(`model step ${i + 1}/${values.length} (value ${values[i]})`); }
    } else {
      const values = customValues ?? midpoints(6);
      console.log(`\nBrowsing PIANO TYPES (NRPN 2/32), 6 categories. Watch the display for the loaded sound name.\n`);
      for (let i = 0; i < values.length; i++) { nrpn(2, 32, values[i]); await sleep(500); await play(`Type ${i + 1}: ${PIANO_TYPES[i] ?? '?'} (value ${values[i]})`); }
    }
  } else if (section === 'organ') {
    isolate('organ');
    await sleep(400);
    const values = customValues ?? midpoints(6);
    console.log(`\nBrowsing ORGAN MODELS (NRPN 2/16), 6 models, drawbars 1-3 up so it sounds.\n`);
    for (let i = 0; i < values.length; i++) { nrpn(2, 16, values[i]); await sleep(500); await play(`Model ${i + 1}: ${ORGAN_MODELS[i] ?? '?'} (value ${values[i]})`); }
  } else if (section === 'synth') {
    isolate('synth');
    await sleep(400);
    console.log(`\nBrowsing SYNTH SAMPLE categories (14-bit NRPN 3/4: MSB=category, LSB=sample).`);
    console.log(`NOTE: the synth oscillator must be in SAMPLE mode for this to sound; if silent, set it on the panel.\n`);
    const cats = customValues ?? Array.from({ length: 8 }, (_, i) => i); // categories 0..7
    for (const cat of cats) {
      cc(99, 3); cc(98, 4); cc(6, cat); cc(38, 0); // 14-bit: category in CC6, sample 0 in CC38
      await sleep(500);
      await play(`sample category ${cat}, sample 0`);
    }
  } else {
    throw new Error(`unknown --section "${section}" (use piano|organ|synth)`);
  }

  nord.allNotesOff();
  await sleep(150);
  nord.close();
  console.log('\nDone. Tell me the sound names you saw on the display and I will record them in a sound-map.');
  console.log('(Reload the program on the Nord to restore your patch.)');
  process.exit(0);
}

main().catch((err) => { console.error('browse-sounds failed:', err.message); process.exit(1); });
