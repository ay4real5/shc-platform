import { logoDataUrl, logoType } from './agency.module.js';

describe('company logo (S-032)', () => {
  it('accepts PNG, JPEG and WebP by their first bytes, never SVG', () => {
    expect(logoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
    expect(logoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(logoType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(logoType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
  });

  it('makes a data: URL for the careers page', () => {
    expect(logoDataUrl(new Uint8Array([1, 2, 3]), 'image/png')).toBe('data:image/png;base64,AQID');
    expect(logoDataUrl(null, null)).toBeNull();
  });
});
