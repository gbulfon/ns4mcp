/**
 * audition-synth — set up the patch so the SYNTH layer is audible in isolation,
 * then play a held chord and sweep the filter cutoff so you can hear it.
 *
 *   npm run audition-synth                 # channel 1
 *   npm run audition-synth -- --channel 3
 *
 * This deliberately MODIFIES your patch (turns piano/organ off, synth on, opens
 * the amp envelope, sets a level). Reload the program on the Nord afterwards to
 * restore. By default it leaves the synth on at the end so you can keep playing;
 * pass --restore to flip piano back on / synth off when done.
 */

import { NordMidi } from '../src/midi/nord.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);

// Parameter -> CC map (from src/schema/parameters.json).
const CCs = {
  organEnableI: 9, organEnableII: 2,
  pianoEnableI: 33, pianoEnableII: 3,
  synthEnableI: 42, synthEnableII: 5,
  synthLevelA: 43,
  ampAttack: 68, ampDecay: 69, ampRelease: 71,
  filterFreq: 59, filterReso: 60,
} as const;

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const nord = new NordMidi({ channel });
  const ports = nord.open();
  console.log(`Nord open: out=${ports.output?.name ?? 'none'} (ch ${channel})`);
  if (!ports.output) throw new Error('no output port — cannot send');

  const cc = (controller: number, value: number, label: string) => {
    nord.sendCC(controller, value);
    console.log(`  CC${controller} = ${value.toString().padStart(3)}  (${label})`);
  };

  console.log('\n[1] Isolate the synth layer (piano + organ off, synth on)');
  cc(CCs.organEnableI, 0, 'organ scene I off');
  cc(CCs.organEnableII, 0, 'organ scene II off');
  cc(CCs.pianoEnableI, 0, 'piano scene I off');
  cc(CCs.pianoEnableII, 0, 'piano scene II off');
  cc(CCs.synthEnableI, 127, 'synth scene I ON');
  cc(CCs.synthEnableII, 127, 'synth scene II ON');
  cc(CCs.synthLevelA, 100, 'synth A level up');

  console.log('\n[2] Make held notes speak + give the sweep something to chew on');
  cc(CCs.ampAttack, 0, 'amp attack = instant');
  cc(CCs.ampDecay, 90, 'amp decay');
  cc(CCs.ampRelease, 40, 'amp release');
  cc(CCs.filterReso, 55, 'filter resonance up');
  cc(CCs.filterFreq, 0, 'filter cutoff start closed');
  await sleep(300);

  const chord = [48, 52, 55]; // C major triad
  console.log(`\n[3] Hold a chord ${JSON.stringify(chord)} and sweep filter cutoff up/down`);
  chord.forEach((n) => nord.noteOn(n, 100));

  const steps = 40;
  for (let i = 0; i <= steps; i++) nord.sendCC(CCs.filterFreq, Math.round((i / steps) * 127)), await sleep(50);
  for (let i = steps; i >= 0; i--) nord.sendCC(CCs.filterFreq, Math.round((i / steps) * 127)), await sleep(50);

  console.log('   (released)');
  chord.forEach((n) => nord.noteOff(n));
  await sleep(200);

  if (flag('restore')) {
    console.log('\n[4] --restore: piano back on, synth off');
    cc(CCs.synthEnableI, 0, 'synth scene I off');
    cc(CCs.synthEnableII, 0, 'synth scene II off');
    cc(CCs.pianoEnableI, 127, 'piano scene I ON');
    cc(CCs.pianoEnableII, 127, 'piano scene II ON');
  } else {
    console.log('\nSynth left ON and isolated — play the keyboard to hear it.');
    console.log('Reload the program on the Nord (or re-run with --restore) to get your piano patch back.');
  }

  await sleep(150);
  nord.close();
  process.exit(0);
}

main().catch((err) => { console.error('audition-synth failed:', err.message); process.exit(1); });
