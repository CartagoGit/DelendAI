import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { asWorkItemId } from './work-event';
import { NdjsonWorkEventStore } from './work-event-store.ndjson';
import { SqliteWorkEventStore } from './work-event-store.sqlite';
import { WorkEventStoreFacade } from './work-event-store.facade';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'state-telemetry-store-'));

describe('SqliteWorkEventStore (f00509 S1)', () => {
	let dir: string;
	let store: SqliteWorkEventStore;

	beforeEach(() => {
		dir = makeTmpDir();
		store = new SqliteWorkEventStore({
			path: join(dir, 'work-events.sqlite'),
		});
	});

	afterEach(() => {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it('creates the work_events table with the schema declared in q00020', () => {
		expect(store.count()).toBe(0);
		const event = store.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: 'agent:test',
			kind: 'git_change',
			payload_hash: 'a'.repeat(64),
		});
		expect(event.id).toBe(1);
		expect(event.kind).toBe('git_change');
		expect(store.count()).toBe(1);
	});

	it('rejects events whose kind is not in the closed union', () => {
		expect(() =>
			store.append({
				work_item_id: asWorkItemId('f00509/S1'),
				actor_id: null,
				kind: 'not_a_kind' as never,
				payload_hash: 'x',
			}),
		).toThrow(/unknown work event kind/);
	});

	it('preserves insertion order within a single work_item_id', () => {
		const ids: number[] = [];
		for (const kind of [
			'git_change',
			'test_started',
			'test_finished',
		] as const) {
			const event = store.append({
				work_item_id: asWorkItemId('f00509/S1'),
				actor_id: null,
				kind,
				payload_hash: 'b'.repeat(64),
			});
			expect(event.id).toBeDefined();
			ids.push(event.id ?? -1);
		}
		const events = store.listByWorkItem(asWorkItemId('f00509/S1'));
		expect(events.map((event) => event.kind)).toEqual([
			'git_change',
			'test_started',
			'test_finished',
		]);
		expect(events.map((event) => event.id)).toEqual(ids);
	});

	it('keeps the autoincrement id monotonic across closes', () => {
		store.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'c'.repeat(64),
		});
		store.close();
		const reopened = new SqliteWorkEventStore({
			path: join(dir, 'work-events.sqlite'),
		});
		const second = reopened.append({
			work_item_id: asWorkItemId('f00509/S2'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'd'.repeat(64),
		});
		expect(second.id).toBe(2);
		reopened.close();
	});

	it('two processes appending at once write every event once, each with its own id', async () => {
		const dbPath = join(dir, 'shared.sqlite');
		const eventsPerProcess = 200;
		const storeModule = join(
			dirname(fileURLToPath(import.meta.url)),
			'work-event-store.sqlite.ts',
		);
		// Each writer announces itself and spins until its peer has too, so
		// both open the store and append inside the same window.
		const writerScript = join(dir, 'writer.ts');
		writeFileSync(
			writerScript,
			`import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteWorkEventStore } from ${JSON.stringify(storeModule)};

const [dbFile, dir, name, peer, total] = process.argv.slice(2);
writeFileSync(join(dir, name + '.ready'), '');
while (!existsSync(join(dir, peer + '.ready'))) Bun.sleepSync(1);
const store = new SqliteWorkEventStore({ path: dbFile });
for (let index = 0; index < Number(total); index += 1) {
	store.append({
		work_item_id: name,
		actor_id: null,
		kind: 'git_change',
		payload_hash: String(index),
	});
}
store.close();
`,
		);
		const runWriter = (
			name: string,
			peer: string,
		): Promise<number | null> =>
			new Promise((resolve, reject) => {
				const child = spawn(
					process.execPath,
					[
						writerScript,
						dbPath,
						dir,
						name,
						peer,
						String(eventsPerProcess),
					],
					{ stdio: 'inherit' },
				);
				child.on('error', reject);
				child.on('exit', resolve);
			});

		const [firstExit, secondExit] = await Promise.all([
			runWriter('writer-a', 'writer-b'),
			runWriter('writer-b', 'writer-a'),
		]);
		expect([firstExit, secondExit]).toEqual([0, 0]);

		const shared = new SqliteWorkEventStore({ path: dbPath });
		try {
			expect(shared.count()).toBe(eventsPerProcess * 2);
			const perWriter = ['writer-a', 'writer-b'].map((name) =>
				shared.listByWorkItem(asWorkItemId(name)),
			);
			const ids = perWriter.flat().map((event) => event.id);
			expect(new Set(ids).size).toBe(eventsPerProcess * 2);
			for (const events of perWriter) {
				expect(events).toHaveLength(eventsPerProcess);
				expect(events.map((event) => event.payload_hash)).toEqual(
					Array.from({ length: eventsPerProcess }, (_, i) =>
						String(i),
					),
				);
			}
		} finally {
			shared.close();
		}
	});

	it('keeps ids unique, ordered and gap-free per writer when one of several processes is killed mid-burst', async () => {
		const dbPath = join(dir, 'killed.sqlite');
		const survivors = ['writer-a', 'writer-b', 'writer-c'];
		const victim = 'writer-victim';
		const eventsPerSurvivor = 150;
		const victimBurst = 1_000_000;
		const victimWarmup = 40;
		const storeModule = join(
			dirname(fileURLToPath(import.meta.url)),
			'work-event-store.sqlite.ts',
		);
		// Every writer opens the store, then waits for the start file so the
		// bursts overlap. The victim reports progress and is killed once it is
		// well into its burst, with a write possibly in flight.
		const writerScript = join(dir, 'burst-writer.ts');
		writeFileSync(
			writerScript,
			`import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteWorkEventStore } from ${JSON.stringify(storeModule)};

const [dbFile, dir, name, total, warmup] = process.argv.slice(2);
const store = new SqliteWorkEventStore({ path: dbFile });
writeFileSync(join(dir, name + '.ready'), '');
while (!existsSync(join(dir, 'start'))) Bun.sleepSync(1);
for (let index = 0; index < Number(total); index += 1) {
	store.append({
		work_item_id: name,
		actor_id: null,
		kind: 'git_change',
		payload_hash: String(index),
	});
	if (index + 1 === Number(warmup)) writeFileSync(join(dir, name + '.warm'), '');
}
store.close();
`,
		);
		const launch = (name: string, total: number) => {
			const child = spawn(
				process.execPath,
				[
					writerScript,
					dbPath,
					dir,
					name,
					String(total),
					String(victimWarmup),
				],
				{ stdio: 'inherit' },
			);
			const exit = new Promise<{
				code: number | null;
				signal: NodeJS.Signals | null;
			}>((resolve, reject) => {
				child.on('error', reject);
				child.on('exit', (code, signal) => resolve({ code, signal }));
			});
			return { child, exit };
		};
		const waitFor = async (file: string): Promise<void> => {
			const deadline = Date.now() + 30_000;
			while (!existsSync(join(dir, file))) {
				if (Date.now() > deadline)
					throw new Error(`timed out: ${file}`);
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		};

		const runs = survivors.map((name) => launch(name, eventsPerSurvivor));
		const doomed = launch(victim, victimBurst);
		for (const name of [...survivors, victim])
			await waitFor(`${name}.ready`);
		writeFileSync(join(dir, 'start'), '');
		await waitFor(`${victim}.warm`);
		doomed.child.kill('SIGKILL');

		expect((await doomed.exit).signal).toBe('SIGKILL');
		for (const run of runs) expect((await run.exit).code).toBe(0);

		const shared = new SqliteWorkEventStore({ path: dbPath });
		try {
			const byWriter = [...survivors, victim].map((name) =>
				shared.listByWorkItem(asWorkItemId(name)),
			);
			const all = byWriter.flat();
			// No id is handed out twice, whoever wrote the row.
			expect(new Set(all.map((event) => event.id ?? 0)).size).toBe(
				all.length,
			);
			expect(shared.count()).toBe(all.length);
			// Within one writer the ids only grow and the payloads form an
			// unbroken run from zero: nothing lost, nothing written twice.
			for (const events of byWriter) {
				const ids = events.map((event) => event.id ?? 0);
				expect(ids).toEqual([...ids].sort((a, b) => a - b));
				expect(events.map((event) => event.payload_hash)).toEqual(
					events.map((_, i) => String(i)),
				);
			}
			for (const events of byWriter.slice(0, survivors.length))
				expect(events).toHaveLength(eventsPerSurvivor);
			// The killed writer got at least its warm-up in, and no more than
			// it could have attempted; a torn write leaves no partial row.
			const victimEvents = byWriter[survivors.length] ?? [];
			expect(victimEvents.length).toBeGreaterThanOrEqual(victimWarmup);
			expect(victimEvents.length).toBeLessThan(victimBurst);
			// A fresh append after the crash continues past every existing id.
			const next = shared.append({
				work_item_id: asWorkItemId('after-crash'),
				actor_id: null,
				kind: 'git_change',
				payload_hash: 'next',
			});
			expect(next.id ?? 0).toBeGreaterThan(
				Math.max(...all.map((e) => e.id ?? 0)),
			);
		} finally {
			shared.close();
		}
	});
});

describe('NdjsonWorkEventStore (f00509 S1)', () => {
	let dir: string;
	let store: NdjsonWorkEventStore;

	beforeEach(() => {
		dir = makeTmpDir();
		store = new NdjsonWorkEventStore({
			path: join(dir, 'work-events.ndjson'),
		});
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('round-trips appended events even when the file did not exist', async () => {
		const first = await store.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'e'.repeat(64),
		});
		expect(first.id).toBe(1);
		const events = await store.list();
		expect(events).toHaveLength(1);
		expect(events[0]?.kind).toBe('git_change');
	});
	it('lists unique, ordered ids even when two processes appended to the same file', async () => {
		const file = join(dir, 'shared.ndjson');
		const storeModule = join(
			dirname(fileURLToPath(import.meta.url)),
			'work-event-store.ndjson.ts',
		);
		const writerScript = join(dir, 'ndjson-writer.ts');
		writeFileSync(
			writerScript,
			`import { NdjsonWorkEventStore } from ${JSON.stringify(storeModule)};
const [file, name, total] = process.argv.slice(2);
const store = new NdjsonWorkEventStore({ path: file });
for (let index = 0; index < Number(total); index += 1) {
	await store.append({ work_item_id: name, actor_id: null, kind: 'git_change', payload_hash: String(index) });
}
`,
		);
		const run = (name: string): Promise<number | null> =>
			new Promise((resolve, reject) => {
				const child = spawn(
					process.execPath,
					[writerScript, file, name, '100'],
					{ stdio: 'inherit' },
				);
				child.on('error', reject);
				child.on('exit', resolve);
			});
		expect(await Promise.all([run('one'), run('two')])).toEqual([0, 0]);
		const events = await new NdjsonWorkEventStore({ path: file }).list();
		expect(events).toHaveLength(200);
		expect(events.map((event) => event.id)).toEqual(
			events.map((_, i) => i + 1),
		);
	});
});

describe('WorkEventStoreFacade (f00509 S1)', () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTmpDir();
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('uses NDJSON when the config flag is absent or false', async () => {
		const facade = new WorkEventStoreFacade({ workspaceRoot: dir });
		expect(facade.activeBackend).toBe('ndjson');
		await facade.append({
			work_item_id: asWorkItemId('f00509/S1'),
			actor_id: null,
			kind: 'git_change',
			payload_hash: 'f'.repeat(64),
		});
		facade.close();
	});

	it('uses SQLite when the config flag is explicitly true', async () => {
		const configPath = join(dir, 'delendai.config.json');
		await Bun.write(
			configPath,
			JSON.stringify({
				state: { parity: { shadow: { enabled: true } } },
			}),
		);
		const facade = new WorkEventStoreFacade({
			workspaceRoot: dir,
			configPath,
		});
		expect(facade.activeBackend).toBe('sqlite');
		facade.close();
	});

	it('never throws at startup when the shadow is missing or disabled', () => {
		expect(
			() => new WorkEventStoreFacade({ workspaceRoot: dir }),
		).not.toThrow();
	});

	it('falls back to NDJSON when the config is malformed', async () => {
		const configPath = join(dir, 'delendai.config.json');
		await Bun.write(configPath, '{not json');
		const facade = new WorkEventStoreFacade({
			workspaceRoot: dir,
			configPath,
		});
		expect(facade.activeBackend).toBe('ndjson');
		facade.close();
	});
});
