import { describe, it, expect } from 'vitest';
import { parseDocuments, parseSchema } from '../../src/cli/parse';
import { FieldValidationError, PolysearchError } from '../../src/errors';

describe('parseSchema', () => {
  it('parses a valid schema', () => {
    const schema = parseSchema('{"fields":{"title":{"type":"text"},"price":{"type":"float"}}}');
    expect(schema.fields.title).toEqual({ type: 'text' });
    expect(schema.fields.price).toEqual({ type: 'float' });
  });

  it('rejects invalid JSON', () => {
    expect(() => parseSchema('{not json')).toThrow(PolysearchError);
  });

  it('rejects a missing fields object', () => {
    expect(() => parseSchema('{}')).toThrow(/must be an object with a "fields"/);
  });

  it('rejects an unknown field type', () => {
    expect(() => parseSchema('{"fields":{"title":{"type":"nope"}}}')).toThrow(/must have a "type"/);
  });

  it('rejects a malicious field name in the schema', () => {
    expect(() => parseSchema('{"fields":{"a:b OR c":{"type":"text"}}}')).toThrow(
      FieldValidationError,
    );
  });
});

describe('parseDocuments', () => {
  it('parses NDJSON, skips blank lines, and stringifies ids', () => {
    const docs = parseDocuments('{"id":1,"title":"a"}\n\n{"id":"2","title":"b"}\n');
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({ id: '1', title: 'a' });
    expect(docs[1]?.id).toBe('2');
  });

  it('reports the line number on invalid JSON', () => {
    expect(() => parseDocuments('{"id":"1"}\n{bad}')).toThrow(/line 2: not valid JSON/);
  });

  it('requires an id', () => {
    expect(() => parseDocuments('{"title":"no id"}')).toThrow(/string or number "id"/);
  });
});
