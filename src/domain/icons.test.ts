import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WoWClass } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import { SPECS, specIcon } from './wow.js';

const icons = resolve(__dirname, '../../web/public/icons');
const isJpeg = (file: string) => {
  const bytes = readFileSync(file);
  return bytes.length > 500 && bytes[0] === 0xff && bytes[1] === 0xd8; // JPEG magic number, not an error page
};

describe('icons shipped with the admin site', () => {
  const specs = Object.values(WoWClass).flatMap(cls => SPECS[cls].map(spec => ({ cls, spec: spec.id })));

  test.each(specs)('$cls $spec has an icon', ({ cls, spec }) => {
    expect(isJpeg(`${icons}/spec/${specIcon(cls, spec)}.jpg`)).toBe(true);
  });

  test.each(Object.values(WoWClass))('%s has a class icon', (cls) => {
    expect(isJpeg(`${icons}/class/${cls.toLowerCase()}.jpg`)).toBe(true);
  });
});
