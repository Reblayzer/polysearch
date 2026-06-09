import { describe, it, expect } from 'vitest';
import {
  EngineRequestError,
  FieldValidationError,
  PolysearchError,
  TimeoutError,
} from '../../src/errors';

describe('error classes', () => {
  it('all subclasses extend PolysearchError and Error', () => {
    const errors = [
      new PolysearchError('x'),
      new FieldValidationError('x'),
      new EngineRequestError('x', 404),
      new TimeoutError('x'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(PolysearchError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('sets a distinct name per class', () => {
    expect(new PolysearchError('x').name).toBe('PolysearchError');
    expect(new FieldValidationError('x').name).toBe('FieldValidationError');
    expect(new EngineRequestError('x').name).toBe('EngineRequestError');
    expect(new TimeoutError('x').name).toBe('TimeoutError');
  });

  it('EngineRequestError carries an optional status code', () => {
    expect(new EngineRequestError('failed', 503).statusCode).toBe(503);
    expect(new EngineRequestError('failed').statusCode).toBeUndefined();
  });
});
