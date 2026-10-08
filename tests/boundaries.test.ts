import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

async function messages(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.message);
}

describe('architecture boundaries (ESLint rules actually fire)', () => {
  it('domain cannot import React, Dexie or outer layers', async () => {
    expect((await messages("import React from 'react';\nexport const x = React;", 'packages/domain/src/a.ts')).join()).toMatch(/domain must not depend/);
    expect((await messages("import Dexie from 'dexie';\nexport const x = Dexie;", 'packages/domain/src/b.ts')).join()).toMatch(/domain must not depend/);
    expect((await messages("import { x } from '@fitapp/storage-local';\nexport const y = x;", 'packages/domain/src/c.ts')).join()).toMatch(/outer layers/);
  });

  it('domain cannot read the clock, randomness, or browser globals', async () => {
    expect((await messages('export const t = Date.now();', 'packages/domain/src/d.ts')).join()).toMatch(/Clock/);
    expect((await messages('export const t = new Date();', 'packages/domain/src/e.ts')).join()).toMatch(/Clock/);
    expect((await messages('export const r = Math.random();', 'packages/domain/src/f.ts')).join()).toMatch(/seed/);
    expect((await messages("export const s = localStorage.getItem('x');", 'packages/domain/src/g.ts')).join()).toMatch(/ports/);
  });

  it('domain may still build a date from an explicit value', async () => {
    expect(await messages("export const t = new Date('2026-10-01T00:00:00Z');", 'packages/domain/src/h.ts')).toEqual([]);
  });

  it('application cannot import storage adapters or the UI', async () => {
    expect((await messages("import { x } from '@fitapp/storage-local';\nexport const y = x;", 'packages/application/src/a.ts')).join()).toMatch(/application must not depend/);
  });

  it('storage cannot import the application layer', async () => {
    expect((await messages("import { x } from '@fitapp/application';\nexport const y = x;", 'packages/storage-local/src/a.ts')).join()).toMatch(/storage-local must not depend/);
  });

  it('the UI reaches storage only through the composition root', async () => {
    const code = "import { x } from '@fitapp/storage-local';\nexport const y = x;";
    expect((await messages(code, 'apps/web/src/screens/A.ts')).join()).toMatch(/composition/);
    expect(await messages(code, 'apps/web/src/composition/deps.ts')).toEqual([]);
  });
});
