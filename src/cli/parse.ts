/**
 * Validate untrusted CLI input (schema and document files) at the boundary.
 *
 * The CLI reads JSON from disk, which is untrusted: a type assertion (`as
 * IndexSchema`) would lie to the compiler and let a malformed file through to
 * fail later with a cryptic engine error. These parsers validate the shape and
 * throw a clear `PolysearchError` (with a line number for documents) instead.
 */
import type { Document, FieldDefinition, FieldType, IndexSchema } from '../types';
import { assertValidFieldName } from '../query/field';
import { PolysearchError } from '../errors';

const FIELD_TYPES = new Set<string>(['text', 'keyword', 'integer', 'float', 'boolean', 'date']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse and validate an index-schema JSON file. */
export function parseSchema(raw: string): IndexSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PolysearchError('schema file is not valid JSON');
  }
  if (!isRecord(parsed) || !isRecord(parsed.fields)) {
    throw new PolysearchError('schema file must be an object with a "fields" object');
  }

  const fields: Record<string, FieldDefinition> = {};
  for (const [name, def] of Object.entries(parsed.fields)) {
    assertValidFieldName(name);
    if (!isRecord(def) || typeof def.type !== 'string' || !FIELD_TYPES.has(def.type)) {
      throw new PolysearchError(
        `schema field "${name}" must have a "type" of one of: ${[...FIELD_TYPES].join(', ')}`,
      );
    }
    fields[name] = { type: def.type as FieldType };
  }
  return { fields };
}

/** Parse and validate an NDJSON document file (one JSON object per line). */
export function parseDocuments(raw: string): Document[] {
  const docs: Document[] = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new PolysearchError(`line ${i + 1}: not valid JSON`);
    }
    if (!isRecord(parsed) || (typeof parsed.id !== 'string' && typeof parsed.id !== 'number')) {
      throw new PolysearchError(
        `line ${i + 1}: document must be a JSON object with a string or number "id"`,
      );
    }
    docs.push({ ...parsed, id: String(parsed.id) });
  }
  return docs;
}
