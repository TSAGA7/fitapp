import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, STORE_NAMES } from '@fitapp/domain';
import { loadSeedCatalog } from '@fitapp/seed';
import { createFixedClock } from './clock';
import { META_KEYS } from './constants';
import { openAppDatabase } from './database';
import { StorageTooNewError } from './errors';
import { getMeta, setMeta } from './meta';
import { LATEST_VERSION, MIGRATIONS, STORES_V1, STORES_V2 } from './schema';
import { builders, makeStorage } from './testkit';
import { createLocalStorage } from './storage';
import { deterministicIds } from './testkit';

describe('schema', () => {
  it('has a store for every domain entity, with an updatedAt index, plus meta stores', async () => {
    const { s } = await makeStorage();
    const names = s.db.tables.map((t) => t.name);
    for (const store of STORE_NAMES) {
      expect(names).toContain(store);
      expect(s.db.table(store).schema.idxByName.updatedAt).toBeDefined();
      expect(s.db.table(store).schema.primKey.name).toBe('id');
    }
    expect(names).toEqual(expect.arrayContaining(['appMeta', 'syncState']));
    expect(names).toHaveLength(STORE_NAMES.length + 2);
    expect(Object.keys({ ...STORES_V1, ...STORES_V2 })).toHaveLength(STORE_NAMES.length + 2);
  });
  it('the last migration matches the domain schema version', () => {
    expect(LATEST_VERSION).toBe(SCHEMA_VERSION);
    expect(MIGRATIONS.map((m) => m.version)).toEqual([...MIGRATIONS.map((m) => m.version)].sort((a, b) => a - b));
  });
  it('has the indexes the repositories need', async () => {
    const { s } = await makeStorage();
    expect(s.db.bodyMetrics.schema.idxByName['[type+measuredOn]']).toBeDefined();
    expect(s.db.setLogs.schema.idxByName.contextKey).toBeDefined();
    expect(s.db.foods.schema.idxByName.barcode).toBeDefined();
  });
});

describe('meta', () => {
  it('creates a device id once and keeps it across reopening', async () => {
    const factory = new IDBFactory();
    const mk = () => createLocalStorage({ name: 'meta', indexedDB: factory, IDBKeyRange, clock: createFixedClock('2026-10-01T08:00:00.000Z'), ids: deterministicIds() });
    const a = await mk();
    const id = a.deviceId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getMeta(a.db, META_KEYS.installedAt)).toBe('2026-10-01T08:00:00.000Z');
    expect(await getMeta(a.db, META_KEYS.schemaVersion)).toBe(SCHEMA_VERSION);
    a.close();
    const b = await mk();
    expect(b.deviceId).toBe(id);
  });
  it('stamps the device id on entities created through the builders', async () => {
    const { s } = await makeStorage();
    expect(builders(s).goal().deviceId).toBe(s.deviceId);
  });
});

describe('migrations', () => {
  const v2 = {
    version: 3,
    description: 'Index on goals.priority and a data fix',
    stores: { goals: 'id, status, priority, updatedAt' },
    upgrade: async (tx: import('dexie').Transaction) => {
      await tx.table('goals').toCollection().modify((g: Record<string, unknown>) => {
        g.migrated = true;
      });
    },
  };
  it('upgrades an existing database: data survives, the new index exists, the upgrade runs', async () => {
    const factory = new IDBFactory();
    const opts = { name: 'mig', indexedDB: factory, IDBKeyRange };
    const first = await createLocalStorage({ ...opts, clock: createFixedClock('2026-10-01T08:00:00.000Z'), ids: deterministicIds() });
    const g = builders(first).goal();
    await first.repos.goals.put(g);
    first.close();

    const db = await openAppDatabase({ ...opts, migrations: [...MIGRATIONS, v2] });
    const row = (await db.goals.get(g.id)) as unknown as Record<string, unknown>;
    expect(row.id).toBe(g.id);
    expect(row.migrated).toBe(true);
    expect(db.goals.schema.idxByName.priority).toBeDefined();
    expect(db.verno).toBe(3);
    db.close();
  });
  it('refuses a database written by a newer app instead of damaging it', async () => {
    const factory = new IDBFactory();
    const opts = { name: 'newer', indexedDB: factory, IDBKeyRange };
    const newer = await openAppDatabase({ ...opts, migrations: [...MIGRATIONS, v2] });
    await setMeta(newer, META_KEYS.schemaVersion, 3);
    newer.close();
    await expect(openAppDatabase({ ...opts })).rejects.toBeInstanceOf(StorageTooNewError);
  });
});

describe('seed catalog', () => {
  it('installs the bundled catalog once; ids are the catalog keys', async () => {
    const { s } = await makeStorage();
    const catalog = loadSeedCatalog();
    const r = await s.installSeed(catalog);
    expect(r).toMatchObject({ installed: true, equipment: catalog.equipment.length, exercises: catalog.exercises.length, foods: catalog.foods.length, skipped: 0 });
    expect((await s.repos.exercises.get('leg_press'))?.origin).toBe('seed');
    expect((await s.repos.equipment.listAll()).length).toBe(catalog.equipment.length);
    const again = await s.installSeed(catalog);
    expect(again.installed).toBe(false);
    expect(await s.db.exercises.count()).toBe(catalog.exercises.length);
  });
  it('a newer catalog version updates seed rows and never touches the user items', async () => {
    const { s } = await makeStorage();
    const catalog = loadSeedCatalog();
    const mine = { ...builders(s).exercise({ key: 'leg_press', name: 'Мой жим' }), id: 'leg_press' };
    await s.repos.exercises.put(mine);
    const r = await s.installSeed(catalog);
    expect(r.skipped).toBe(1);
    expect((await s.repos.exercises.get('leg_press'))?.name).toBe('Мой жим');
    const renamed = { ...catalog, catalogVersion: catalog.catalogVersion + 1, exercises: catalog.exercises.map((e) => (e.key === 'smith_squat' ? { ...e, name: 'Присед в Смите v2' } : e)) };
    const r2 = await s.installSeed(renamed);
    expect(r2.installed).toBe(true);
    expect((await s.repos.exercises.get('smith_squat'))?.name).toBe('Присед в Смите v2');
    expect((await s.repos.exercises.get('leg_press'))?.name).toBe('Мой жим');
  });
});
