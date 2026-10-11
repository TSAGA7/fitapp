import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Packages that must never be imported from the pure layers. */
const IO_AND_UI = ['react', 'react-dom', 'react/*', 'react-dom/*', 'dexie', 'dexie/*', 'vite', 'vite/*'];
const OUTER = ['@fitapp/application', '@fitapp/storage-local', '@fitapp/seed', '@fitapp/web'];

const message = (layer, what) => ({ message: `${layer} must not depend on ${what}` });

const pureGlobals = [
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
  'fetch', 'XMLHttpRequest', 'crypto', 'performance', 'setTimeout', 'setInterval',
  'requestAnimationFrame', 'process', 'require',
].map((name) => ({ name, message: 'Pure layers get time, ids and I/O through ports' }));

const pureSyntax = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Do not read the clock: use the Clock port' },
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Do not read the clock: use the Clock port' },
  { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'No randomness in pure code: pass a seed' },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: IO_AND_UI, ...message('domain', 'React, Dexie or Vite') },
        { group: OUTER, ...message('domain', 'outer layers') },
      ] }],
      'no-restricted-globals': ['error', ...pureGlobals],
      'no-restricted-syntax': ['error', ...pureSyntax],
    },
  },
  {
    files: ['packages/application/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: IO_AND_UI, ...message('application', 'React, Dexie or Vite') },
        { group: ['@fitapp/storage-local', '@fitapp/web', '@fitapp/seed'], ...message('application', 'adapters or UI') },
      ] }],
      'no-restricted-globals': ['error', ...pureGlobals],
      'no-restricted-syntax': ['error', ...pureSyntax],
    },
  },
  {
    files: ['packages/storage-local/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'vite'], ...message('storage-local', 'React or Vite') },
        { group: ['@fitapp/application', '@fitapp/web'], ...message('storage-local', 'application or UI') },
      ] }],
    },
  },
  {
    files: ['packages/seed/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: [...IO_AND_UI, '@fitapp/application', '@fitapp/storage-local', '@fitapp/web'], ...message('seed', 'UI, storage or application') },
      ] }],
    },
  },
  {
    // The UI reaches storage only through the composition root.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/composition/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@fitapp/storage-local', 'dexie', 'dexie/*'], message: 'Only src/composition may import storage; the UI uses use cases' },
      ] }],
    },
  },
);
