/**
 * midi-test — hardware test of the three Phase-1 send paths + readback.
 *
 *   npm run midi-test                 # run all paths on channel 1
 *   npm run midi-test -- --channel 3  # use MIDI channel 3
 *   npm run midi-test -- --listen     # only listen and print inbound messages
 *
 * This is human-in-the-loop: it prints the exact bytes it sends so you can
 * confirm the Nord reacts audibly / on its panel.
 */

import { NordMidi } from '../src/midi/nord.js';
import { CC } from '../src/midi/messages.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

function describeInbound(msg: number[]): string {
  const status = msg[0] & 0xf0;
  const ch = (msg[0] & 0x0f) + 1;
  if (status === 0xb0) {
    const ctrl = msg[1];
    const name =
      ctrl === CC.NRPN_MSB ? 'NRPN MSB' :
      ctrl === CC.NRPN_LSB ? 'NRPN LSB' :
      ctrl === CC.DATA_ENTRY_MSB ? 'Data Entry MSB' :
      ctrl === CC.DATA_ENTRY_LSB ? 'Data Entry LSB' : `CC ${ctrl}`;
    return `ch${ch} ${name} = ${msg[2]}`;
  }
  if (status === 0xf0 || msg[0] === 0xf0) return `SysEx (${msg.length} bytes)`;
  return `ch${ch} status 0x${status.toString(16)}`;
}

async function main(): Promise<void> {
  const channel = Number(arg('channel') ?? '1');
  const nord = new NordMidi({ channel });

  console.log(`Opening Nord (match "${nord.portMatch}") on MIDI channel ${channel}...`);
  const ports = nord.open();
  console.log(`  output: ${ports.output ? ports.output.name : '(none — cannot send!)'}`);
  console.log(`  input:  ${ports.input ? ports.input.name : '(none — no readback)'}`);

  let inboundCount = 0;
  nord.onMessage((msg) => {
    inboundCount++;
    console.log(`  <- [${hex(msg)}]  ${describeInbound(msg)}`);
  });
  nord.onDisconnect((reason) => console.error(`  ! disconnect: ${reason}`));

  if (flag('listen')) {
    console.log('\nListen mode: move knobs on the Nord. Ctrl-C to quit.');
    await new Promise(() => {});
    return;
  }

  console.log('\n=== Path 1: Plain CC — Synth Filter Frequency (CC 59) sweep ===');
  for (const v of [0, 32, 64, 96, 127]) {
    const sent = nord.sendCC(59, v);
    console.log(`  -> CC 59 = ${v.toString().padStart(3)}   [${hex(sent[0])}]`);
    await sleep(400);
  }

  console.log('\n=== Path 2: NRPN — Piano Type (NRPN 2/32), real param ===');
  console.log('  Manual-correct format: CC99, CC98, CC6=0, value in CC38 (Data Entry LSB).');
  for (const v of [0, 1, 2]) {
    const sent = nord.sendNRPN(2, 32, v);
    console.log(`  -> Piano Type (NRPN 2/32) value=${v}`);
    sent.forEach((m) => console.log(`       [${hex(m)}]`));
    await sleep(600);
  }

  console.log('\n=== Path 3: 14-bit NRPN — Sample category+sample (NRPN 3/4) ===');
  console.log('  MSB selects category, LSB selects sample within it.');
  for (const [cat, smp] of [[0, 0], [1, 0], [1, 2]] as const) {
    const sent = nord.sendNRPN14(3, 4, cat, smp);
    console.log(`  -> category=${cat} sample=${smp}`);
    sent.forEach((m) => console.log(`       [${hex(m)}]`));
    await sleep(600);
  }

  await sleep(300);
  console.log(`\nDone. Inbound messages received during test: ${inboundCount}`);
  console.log('If the Nord moved/sounded as expected, Phase 1 send paths are verified.');
  nord.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('midi-test failed:', err.message);
  process.exit(1);
});
