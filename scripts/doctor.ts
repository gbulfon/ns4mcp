/**
 * doctor — environment & device diagnostic.
 *
 * Lists all MIDI input/output ports and flags whether a Nord Stage 4 is visible.
 * Run before any feature work:  npm run doctor
 */

import { RtMidiDevice, findPort } from '../src/midi/device.js';
import { DEFAULT_PORT_MATCH } from '../src/midi/nord.js';

function header(title: string): void {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

function main(): void {
  const match = process.argv[2] ?? DEFAULT_PORT_MATCH;
  console.log('NS4MCP doctor');
  console.log(`node ${process.version}  platform ${process.platform}/${process.arch}`);

  let device: RtMidiDevice;
  try {
    device = new RtMidiDevice();
  } catch (err) {
    console.error('\n✗ Failed to initialize the MIDI backend (@julusian/midi native addon).');
    console.error('  ' + (err as Error).message);
    console.error('  macOS: ensure Xcode Command Line Tools are installed.');
    console.error('  Linux: install ALSA dev headers (libasound2-dev) and rebuild.');
    process.exit(2);
  }

  const outputs = device.listOutputPorts();
  const inputs = device.listInputPorts();

  header('Output ports (server -> Nord)');
  if (outputs.length === 0) console.log('  (none)');
  outputs.forEach((p) => console.log(`  [${p.index}] ${p.name}`));

  header('Input ports (Nord -> server)');
  if (inputs.length === 0) console.log('  (none)');
  inputs.forEach((p) => console.log(`  [${p.index}] ${p.name}`));

  header(`Nord detection (match: "${match}")`);
  const out = findPort(outputs, match);
  const inp = findPort(inputs, match);
  console.log(`  output: ${out ? `✓ [${out.index}] ${out.name}` : '✗ not found'}`);
  console.log(`  input:  ${inp ? `✓ [${inp.index}] ${inp.name}` : '✗ not found'}`);

  console.log();
  if (out && inp) {
    console.log('✓ Nord Stage 4 detected on both input and output. Ready for Phase 1 send tests.');
    process.exit(0);
  } else if (out || inp) {
    console.log('⚠ Nord detected on only one direction. Send tests work with output; readback needs input.');
    process.exit(0);
  } else {
    console.log('✗ Nord not detected. Check: USB connected, powered on, and MIDI USB enabled in System menu.');
    console.log('  Pass a different name to match, e.g.:  npm run doctor -- "Stage 4"');
    process.exit(1);
  }
}

main();
