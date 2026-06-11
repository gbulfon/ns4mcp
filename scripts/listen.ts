/**
 * listen — capture NRPN/CC the Nord TRANSMITS when you move panel controls.
 * Used to map values by ear/eye: you switch a control, the Nord sends its NRPN,
 * we read the value here and you tell us the name shown on the display.
 *
 *   npm run listen                  # log all NRPN + CC
 *   npm run listen -- --only 3/2    # only log NRPN 3/2 (Synth Waveform)
 *
 * Requires: Nord MIDI menu p.7 Ctrl = Send (or Send & Receive) so panel moves
 * are transmitted. Runs until killed.
 */

import { RtMidiDevice } from '../src/midi/device.js';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const KNOWN: Record<string, string> = {
  '3/2': 'Synth Waveform',
  '3/4': 'Synth Sample Cat/Sample',
  '2/16': 'Organ Model',
  '3/51': 'Synth Filter Type',
};

function main(): void {
  const only = arg('only'); // e.g. "3/2"
  const dev = new RtMidiDevice();
  const inPort = dev.listInputPorts().find((p) => p.name.toLowerCase().includes('nord'));
  if (!inPort) throw new Error('No Nord input port. Run `npm run doctor`.');
  dev.open('nord');
  console.log(`Listening on "${inPort.name}". Move a control on the Nord. Ctrl-C to stop.`);
  if (only) console.log(`(filtering to NRPN ${only})`);

  // NRPN parse state (running address + last data bytes).
  let msb = 0, lsb = 0, dataMsb = 0;
  let count = 0;

  const raw = process.argv.includes('--raw');

  dev.onMessage((m) => {
    if (raw) { console.log(`RAW [${m.map((b) => b.toString(16).padStart(2, '0')).join(' ')}]  status=0x${(m[0] & 0xf0).toString(16)} ch${(m[0] & 0x0f) + 1}` + ((m[0] & 0xf0) === 0xb0 ? `  CC${m[1]}=${m[2]}` : '')); return; }
    if ((m[0] & 0xf0) !== 0xb0) return; // only Control Change
    const ctrl = m[1], val = m[2];
    if (ctrl === 99) { msb = val; return; }
    if (ctrl === 98) { lsb = val; return; }
    if (ctrl === 6) { dataMsb = val; return; }
    if (ctrl === 38) {
      const addr = `${msb}/${lsb}`;
      if (only && addr !== only) return;
      const name = KNOWN[addr] ? ` (${KNOWN[addr]})` : '';
      count++;
      console.log(`#${count}  NRPN ${addr}${name}  dataMSB(cc6)=${dataMsb} dataLSB(cc38)=${val}  -> value=${val}`);
      return;
    }
    // Non-NRPN CC (skip the NRPN helpers above)
    if (!only) console.log(`     CC ${ctrl} = ${val}`);
  });

  // keep alive
  setInterval(() => {}, 1 << 30);
}

main();
