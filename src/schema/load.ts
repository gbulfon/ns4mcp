/**
 * Schema loader + lookup helpers.
 *
 * Loads the generated parameters.json and indexes it by id. Provides validation
 * of incoming values against each parameter's range/orientation. Pure of MIDI;
 * the translation layer consumes the validated result.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParameterSchema, ParameterSpec } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'parameters.json');

export class Schema {
  readonly raw: ParameterSchema;
  private readonly byId = new Map<string, ParameterSpec>();

  constructor(raw: ParameterSchema) {
    this.raw = raw;
    for (const p of raw.parameters) this.byId.set(p.id, p);
  }

  static load(path: string = SCHEMA_PATH): Schema {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as ParameterSchema;
    if (!raw.parameters?.length) {
      throw new Error(`Schema at ${path} has no parameters. Run \`npm run fetch-schema\`.`);
    }
    return new Schema(raw);
  }

  get parameters(): ParameterSpec[] {
    return this.raw.parameters;
  }

  get(id: string): ParameterSpec | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Suggest close ids for an unknown one (cheap substring match) to aid the model. */
  suggest(id: string, limit = 5): string[] {
    const needle = id.toLowerCase();
    return this.parameters
      .map((p) => p.id)
      .filter((pid) => pid.includes(needle) || needle.includes(pid))
      .slice(0, limit);
  }
}

export interface ValidationError {
  id: string;
  message: string;
}

/** Validate a raw numeric value against a parameter's range. Returns null if OK. */
export function validateValue(param: ParameterSpec, value: number): ValidationError | null {
  if (!Number.isInteger(value)) {
    return { id: param.id, message: `value must be an integer, got ${value}` };
  }
  if (value < param.min || value > param.max) {
    return {
      id: param.id,
      message: `value ${value} out of range [${param.min}, ${param.max}]${
        param.orientation === 'bipolar' ? ` (bipolar, center ${param.center})` : ''
      }`,
    };
  }
  return null;
}
