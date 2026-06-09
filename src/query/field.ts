/**
 * Field-name validation.
 *
 * Field names are interpolated into engine queries. For Elasticsearch and
 * OpenSearch they become JSON keys (structurally safe), but for Solr they are
 * concatenated into a Lucene query STRING, so an unchecked field name is a
 * query-injection vector (e.g. a field name like `title:x OR price:[* TO *]`).
 *
 * We restrict field names to a conservative identifier pattern, applied across
 * all engines so a query is valid everywhere or rejected everywhere: a letter or
 * underscore, then letters, digits, underscores or dots (dots for nested
 * fields). This matches how real schema fields are named and rejects every
 * Lucene/Solr special character that injection would rely on.
 */
import { FieldValidationError } from '../errors';

const VALID_FIELD = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export function assertValidFieldName(field: string): void {
  if (!VALID_FIELD.test(field)) {
    throw new FieldValidationError(
      `invalid field name ${JSON.stringify(field)}: ` +
        'field names must be letters, digits, underscores or dots, starting with a letter or underscore',
    );
  }
}
