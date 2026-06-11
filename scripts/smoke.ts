/**
 * smoke — end-to-end MCP test against the built server in --dry-run mode.
 * Exercises the full stack (transport, tools, resources, validation, state)
 * without touching hardware.
 *
 *   npm run build && npx tsx scripts/smoke.ts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function body(res: any): any {
  const txt = res.content?.find((c: any) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(txt);
}
let failures = 0;
function check(label: string, cond: boolean, extra?: unknown): void {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) { failures++; if (extra !== undefined) console.log('   ', JSON.stringify(extra)); }
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js', '--dry-run'],
  });
  const client = new Client({ name: 'smoke', version: '0.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  check('all 9 tools registered', names.length === 9, names);
  check('expected tool names', ['audition_variations', 'get_patch_state', 'list_parameters', 'play_notes', 'play_sequence', 'randomize', 'restore', 'set_parameters', 'snapshot'].every((n) => names.includes(n)), names);

  const resources = await client.listResources();
  check('schema + patch resources', resources.resources.length === 2, resources.resources.map((r) => r.uri));

  const schemaRes = await client.readResource({ uri: 'ns4://schema' });
  const schema = JSON.parse((schemaRes.contents[0] as any).text);
  check('schema resource has 148 params', schema.parameters.length === 148, schema.parameters.length);
  check('oscillator type/category/wave present', ['synth-oscillator.type', 'synth-oscillator.category', 'synth-oscillator.wave'].every((id) => schema.parameters.some((p: any) => p.id === id)));

  const lp = body(await client.callTool({ name: 'list_parameters', arguments: { section: 'synth filter' } }));
  check('list_parameters filters by section', lp.count > 0 && lp.parameters.every((p: any) => p.section.toLowerCase().includes('synth filter')), lp.count);

  // Valid CC change + invalid out-of-range + unknown id
  const sp = body(await client.callTool({
    name: 'set_parameters',
    arguments: {
      changes: [
        { id: 'synth-filter.frequency', value: 100 },
        { id: 'synth-filter.frequency', value: 999 },
        { id: 'nope.nope', value: 1 },
        { id: 'synth.sample-category-and-sample', category: 2, sample: 5 },
      ],
      rationale: 'smoke test',
    },
  }));
  check('one valid CC applied', sp.applied.some((a: any) => a.id === 'synth-filter.frequency' && a.value === 100), sp.applied);
  check('nrpn14 category/sample applied', sp.applied.some((a: any) => a.id === 'synth.sample-category-and-sample' && a.category === 2 && a.sample === 5));
  check('nrpn14 combined value = (2<<7)|5 = 261', sp.applied.find((a: any) => a.id === 'synth.sample-category-and-sample')?.value === 261);
  check('out-of-range rejected', sp.errors.some((e: any) => e.message.includes('out of range')), sp.errors);
  check('unknown id rejected with suggestion', sp.errors.some((e: any) => e.id === 'nope.nope'), sp.errors);
  check('dry-run reports nothing sent', sp.sent === false);

  // Verify CC byte for filter freq = [0xB0, 59, 100]
  const ccBytes = sp.applied.find((a: any) => a.id === 'synth-filter.frequency')?.bytes?.[0];
  check('CC bytes correct [176,59,100]', JSON.stringify(ccBytes) === JSON.stringify([176, 59, 100]), ccBytes);

  // Label-based selection: piano.type = "Grand" -> value 11 -> NRPN 2/32
  const lab = body(await client.callTool({ name: 'set_parameters', arguments: { changes: [{ id: 'piano.type', label: 'Grand' }] } }));
  const labApplied = lab.applied.find((a: any) => a.id === 'piano.type');
  check('label "Grand" resolves to value 11', labApplied?.value === 11, lab.applied);
  check('label resolves to NRPN 2/32 bytes', JSON.stringify(labApplied?.bytes) === JSON.stringify([[176, 99, 2], [176, 98, 32], [176, 6, 0], [176, 38, 11]]), labApplied?.bytes);
  const badLab = body(await client.callTool({ name: 'set_parameters', arguments: { changes: [{ id: 'piano.type', label: 'Nonsense' }] } }));
  check('unknown label rejected with choices', badLab.errors.some((e: any) => e.message.includes('choices:')), badLab.errors);

  // Verify standard NRPN byte layout per manual: CC99,CC98,CC6=0,CC38=value (organ.model = NRPN 2/16)
  const nrpn = body(await client.callTool({ name: 'set_parameters', arguments: { changes: [{ id: 'organ.model', value: 3 }] } }));
  const nrpnBytes = nrpn.applied.find((a: any) => a.id === 'organ.model')?.bytes;
  check('NRPN bytes = [[176,99,2],[176,98,16],[176,6,0],[176,38,3]]',
    JSON.stringify(nrpnBytes) === JSON.stringify([[176, 99, 2], [176, 98, 16], [176, 6, 0], [176, 38, 3]]), nrpnBytes);

  // State should now reflect the dry-run set
  const gs = body(await client.callTool({ name: 'get_patch_state', arguments: {} }));
  check('state tracks set value', gs.values['synth-filter.frequency']?.value === 100, gs.values['synth-filter.frequency']);

  // Snapshot -> randomize -> restore
  body(await client.callTool({ name: 'snapshot', arguments: { label: 'base' } }));
  const rnd = body(await client.callTool({ name: 'randomize', arguments: { sections: ['Synth Filter'], amount: 0.3 } }));
  check('randomize produced changes', rnd.randomized > 0, rnd.randomized);
  const rst = body(await client.callTool({ name: 'restore', arguments: { index: 0 } }));
  check('restore ran', rst.restored === 'base', rst);
  const gs2 = body(await client.callTool({ name: 'get_patch_state', arguments: {} }));
  check('restore brought freq back to 100', gs2.values['synth-filter.frequency']?.value === 100, gs2.values['synth-filter.frequency']);

  await client.close();
  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('smoke failed:', err); process.exit(1); });
