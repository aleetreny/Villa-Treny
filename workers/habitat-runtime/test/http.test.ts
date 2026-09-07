import { describe, expect, it } from 'vitest';
import { readJson } from '../src/http';

describe('JSON request boundary', () => {
  it('parses a bounded JSON body', async () => {
    const request = new Request('https://habitat.test/v1/admin/pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"commandId":"pause-test"}',
    });
    await expect(readJson(request)).resolves.toEqual({ commandId: 'pause-test' });
  });

  it('normalizes malformed JSON into a client error', async () => {
    const request = new Request('https://habitat.test/v1/admin/pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    await expect(readJson(request)).rejects.toThrow(TypeError);
  });

  it('rejects an oversized body even when content-length is absent', async () => {
    const request = new Request('https://habitat.test/v1/admin/pause', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(64 * 1024) }),
    });
    request.headers.delete('content-length');
    await expect(readJson(request)).rejects.toThrow('request body is too large');
  });
});
