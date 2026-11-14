import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'media-test-secret-signing-key-for-tests';
const { validateImageUrl } = await import('../dist/services/image.service.js');

describe('validateImageUrl', () => {
  it('accepts a public HTTPS image URL with query parameters', () => {
    const result = validateImageUrl('https://cdn.example.com/assets/cover.webp?size=large');
    assert.equal(result.valid, true);
    assert.equal(result.host, 'cdn.example.com');
    assert.equal(result.extension, '.webp');
  });

  it('rejects insecure and local URLs', () => {
    assert.throws(() => validateImageUrl('http://cdn.example.com/cover.png'));
    assert.throws(() => validateImageUrl('https://localhost/cover.png'));
    assert.throws(() => validateImageUrl('https://127.0.0.1/cover.png'));
    assert.throws(() => validateImageUrl('https://[::1]/cover.png'));
    assert.throws(() => validateImageUrl('https://192.168.1.10/cover.png'));
  });

  it('rejects unsupported media extensions', () => {
    assert.throws(() => validateImageUrl('https://cdn.example.com/file.exe'));
  });
});
