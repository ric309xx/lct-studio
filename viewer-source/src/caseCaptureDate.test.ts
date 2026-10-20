import {it,expect} from 'vitest';
import {caseCaptureDate} from './caseCaptureDate';
import dates from './caseCaptureDates.json';
it('shows verified local capture dates independently of model build/upload dates',()=>{
  expect(caseCaptureDate({overlayUrl:'a',tilesetPath:'1010-cl1/tileset.json'})).toBe('2026/10/10');
  expect(caseCaptureDate({overlayUrl:'b',tilesetPath:'1013-v2/tileset.json'})).toBe('2026/10/13');
  expect(caseCaptureDate({overlayUrl:'c',tilesetPath:'1015-cl2/tileset.json'})).toBe('2026/10/15');
  expect(dates['1010-cl1/tileset.json'].timezone).toBe('Asia/Taipei');
  expect(dates['1010-cl1/tileset.json'].exifSamplesVerified).toBe(3);
});
it('does not infer dates for unmatched or legacy ion-only parcels',()=>{
  expect(caseCaptureDate(undefined)).toBe('待補');
  expect(caseCaptureDate({})).toBe('待補');
  expect(caseCaptureDate({overlayUrl:'a',tilesetPath:'unknown/tileset.json'})).toBe('待補');
});
