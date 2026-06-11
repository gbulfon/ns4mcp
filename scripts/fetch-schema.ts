/**
 * fetch-schema — reproducible download + transform of the Nord Stage 4
 * parameter database into src/schema/parameters.json.
 *
 *   npm run fetch-schema              # download fresh CSV and transform
 *   npm run fetch-schema -- --offline # transform from a cached CSV at /tmp or ./.cache
 *
 * Source:  https://midi.guide/d/nord/stage-4/csv/  (community DB, CC BY-SA 4.0)
 * The transform is re-runnable when upstream changes — values are NOT hand-copied.
 * The official Nord manual is the authoritative tiebreaker on any conflict.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS } from '../src/schema/hints.js';
import { OPTIONS } from '../src/schema/options.js';
import { EXTRA_PARAMS } from '../src/schema/extra-params.js';
import { OSCILLATOR } from '../src/schema/waveforms.js';
import type { ParameterSchema, ParameterSpec, Orientation, Addressing } from '../src/schema/types.js';

const CSV_URL = 'https://midi.guide/d/nord/stage-4/csv/';
const HUMAN_URL = 'https://midi.guide/d/nord/stage-4/';
const MANUAL_URL = 'https://www.nordkeyboards.com/downloads/downloads-nord-stage-4';
const LICENSE = 'CC BY-SA 4.0';
const ATTRIBUTION = 'Parameter data from midi.guide (https://midi.guide/d/nord/stage-4/), licensed CC BY-SA 4.0.';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE = join(ROOT, '.cache', 'nord-stage-4.csv');
const OUT = join(ROOT, 'src', 'schema', 'parameters.json');

/** Minimal RFC-4180-ish CSV parser (handles quoted fields and embedded commas/quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore; \n handles row break
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function num(s: string): number | undefined {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

async function loadCsv(offline: boolean): Promise<string> {
  if (offline) {
    const candidates = [CACHE, '/tmp/ns4.csv'];
    for (const p of candidates) {
      if (existsSync(p)) { console.log(`Using cached CSV: ${p}`); return readFileSync(p, 'utf8'); }
    }
    throw new Error(`--offline: no cached CSV found at ${candidates.join(' or ')}`);
  }
  console.log(`Downloading ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, text);
  console.log(`Cached CSV -> ${CACHE} (${text.length} bytes)`);
  return text;
}

function transform(rows: string[][]): { params: ParameterSpec[]; notMidi: string[] } {
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const ci = {
    section: col('section'),
    name: col('parameter_name'),
    ccMsb: col('cc_msb'),
    ccLsb: col('cc_lsb'),
    ccMin: col('cc_min_value'),
    ccMax: col('cc_max_value'),
    ccDef: col('cc_default_value'),
    nrpnMsb: col('nrpn_msb'),
    nrpnLsb: col('nrpn_lsb'),
    nrpnMin: col('nrpn_min_value'),
    nrpnMax: col('nrpn_max_value'),
    nrpnDef: col('nrpn_default_value'),
    orientation: col('orientation'),
    notes: col('notes'),
  };

  const params: ParameterSpec[] = [];
  const notMidi: string[] = [];
  const seen = new Set<string>();

  for (const r of rows.slice(1)) {
    const section = r[ci.section]?.trim();
    const name = r[ci.name]?.trim();
    if (!section || !name) continue;

    const ccMsb = num(r[ci.ccMsb]);
    const nrpnMsb = num(r[ci.nrpnMsb]);
    const nrpnLsb = num(r[ci.nrpnLsb]);
    const notes = r[ci.notes]?.trim() || undefined;

    // Determine addressing.
    let addressing: Addressing;
    let min: number | undefined;
    let max: number | undefined;
    let def: number | undefined;
    const spec: Partial<ParameterSpec> = {};

    if (nrpnMsb !== undefined && nrpnLsb !== undefined) {
      min = num(r[ci.nrpnMin]);
      max = num(r[ci.nrpnMax]);
      def = num(r[ci.nrpnDef]);
      const is14 = (max !== undefined && max > 127) || /14-?bit/i.test(notes ?? '');
      addressing = is14 ? 'nrpn14' : 'nrpn';
      spec.nrpnMsb = nrpnMsb;
      spec.nrpnLsb = nrpnLsb;
    } else if (ccMsb !== undefined) {
      min = num(r[ci.ccMin]);
      max = num(r[ci.ccMax]);
      def = num(r[ci.ccDef]);
      addressing = 'cc';
      spec.cc = ccMsb;
    } else {
      // No MIDI addressing — record explicitly as out-of-scope for live tweaking.
      notMidi.push(`${section} / ${name}`);
      continue;
    }

    const orientationRaw = (r[ci.orientation] ?? '').trim().toLowerCase();
    const orientation: Orientation = orientationRaw === 'centered' ? 'bipolar' : 'unipolar';

    const lo = min ?? 0;
    const hi = max ?? (addressing === 'nrpn14' ? 16383 : 127);

    let id = `${slug(section)}.${slug(name)}`;
    if (seen.has(id)) id = `${id}-${slug(notes ?? String(params.length))}`;
    seen.add(id);

    const param: ParameterSpec = {
      id,
      name,
      section,
      addressing,
      ...spec,
      min: lo,
      max: hi,
      ...(def !== undefined ? { default: def } : {}),
      orientation,
      ...(orientation === 'bipolar' ? { center: Math.round((lo + hi) / 2) } : {}),
      ...(OPTIONS[id] ? { options: OPTIONS[id] } : {}),
      ...(HINTS[id] ? { hint: HINTS[id] } : {}),
      ...(notes ? { notes } : {}),
    };
    params.push(param);
  }

  // The CSV's "Synth Waveform" (3/2) is actually the oscillator CATEGORY; it's
  // replaced by the hardware-verified synth-oscillator.* params (3/1, 3/2, 3/3).
  const filtered = params.filter((p) => p.id !== 'synth.waveform');
  filtered.push(...EXTRA_PARAMS);
  filtered.sort((a, b) => a.id.localeCompare(b.id));
  return { params: filtered, notMidi };
}

async function main(): Promise<void> {
  const offline = process.argv.includes('--offline');
  const csv = await loadCsv(offline);
  const rows = parseCsv(csv);
  const { params, notMidi } = transform(rows);

  const schema: ParameterSchema = {
    device: 'Nord Stage 4',
    source: {
      url: CSV_URL,
      humanReadable: HUMAN_URL,
      license: LICENSE,
      attribution: ATTRIBUTION,
      authoritativeReference: `Nord Stage 4 User Manual v1.2X Edition K (English) — ${MANUAL_URL}`,
      validation:
        'CC/NRPN values cross-checked against the official manual (v1.2x Edition K, Appendix II MIDI Controller List) on 2026-06-02 — no value conflicts. Manual clarifies standard NRPN transmission: value in CC#38 (Data Entry LSB), CC#6 (Data Entry MSB)=0; the 14-bit "Sample category and sample" (3:4) is the documented exception with category in CC#6 and sample in CC#38. Filter Frequency=CC59 and CC layer/level values hardware-confirmed audibly.',
      fetchedAt: new Date().toISOString(),
      rowCount: params.length,
    },
    parameters: params,
    oscillatorWaveforms: OSCILLATOR,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(schema, null, 2) + '\n');

  const byAddr = params.reduce<Record<string, number>>((a, p) => {
    a[p.addressing] = (a[p.addressing] ?? 0) + 1;
    return a;
  }, {});
  const bipolar = params.filter((p) => p.orientation === 'bipolar').length;
  const hinted = params.filter((p) => p.hint).length;

  console.log(`\nWrote ${params.length} parameters -> ${OUT}`);
  console.log(`  addressing: ${JSON.stringify(byAddr)}`);
  console.log(`  bipolar (centered): ${bipolar}   hinted: ${hinted}`);
  if (notMidi.length) {
    console.log(`  non-MIDI panel controls (out of scope): ${notMidi.length}`);
    notMidi.forEach((n) => console.log(`    - ${n}`));
  } else {
    console.log('  non-MIDI panel controls: none in this dataset');
  }
}

main().catch((err) => {
  console.error('fetch-schema failed:', err.message);
  process.exit(1);
});
