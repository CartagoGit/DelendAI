/**
 * config-transitions.service.spec.ts — the workspace follows its
 * configuration, and never at the price of somebody's data.
 *
 * Every case runs against a real temporary workspace: the claims are
 * about what ends up on disk, and a faked filesystem would prove
 * whichever answer this file expected.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	readAppliedSnapshot,
	reconcileConfigTransitions,
	snapshotOf,
	writeAppliedSnapshot,
	type IConfigTransition,
} from '@delendai/core/lib/workspace-migration/config-transitions.service';
import { ensureWorkspaceMigrated } from '@delendai/core/lib/workspace-migration/legacy-migration.service';

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'config-transitions-'));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const writeConfig = async (config: unknown): Promise<void> => {
	await writeFile(
		join(root, 'delendai.config.json'),
		JSON.stringify(config),
		'utf8',
	);
};

const put = async (relative: string, content: string): Promise<void> => {
	await mkdir(join(root, relative, '..'), { recursive: true });
	await writeFile(join(root, relative), content, 'utf8');
};

const read = async (relative: string): Promise<string> =>
	readFile(join(root, relative), 'utf8');

const run = async (dryRun = false) =>
	reconcileConfigTransitions({ workspaceRoot: root, dryRun });

describe('snapshotOf', () => {
	it('fills defaults and keeps only enabled plugins, sorted', () => {
		expect(
			snapshotOf({
				plugins: {
					zeta: {},
					alpha: { enabled: true },
					off: { enabled: false },
				},
			}),
		).toEqual({
			version: 1,
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			plugins: ['alpha', 'zeta'],
		});
	});
});

describe('the first pass', () => {
	it('records the configuration and transitions nothing', async () => {
		await writeConfig({ plugins: { git: {} } });

		const result = await run();

		// This assertion used to read `acted: false` while its own title
		// said the run recorded something — it pinned the defect x00607
		// describes. Nothing here was transitioned, which is the real
		// invariant of a first pass; writing the record is still acting.
		expect(result).toMatchObject({
			previousSource: 'inferred',
			outcomes: [],
			recorded: 'written',
			acted: true,
		});
		expect(await readAppliedSnapshot(root)).toMatchObject({
			plugins: ['git'],
		});
	});

	it('records nothing for a workspace with no config file', async () => {
		// Writing defaults would later read as a deliberate configuration.
		await run();
		expect(await readAppliedSnapshot(root)).toBeUndefined();
	});

	it('infers the old cache from the disk when the config names a new one', async () => {
		// No record, but a populated cache sits at the default path while
		// the config names another: the disk proves what "before" was.
		await put('.cache/delendai/proposals/index.json', '{"kept":true}');
		await writeConfig({ cacheDir: 'var/delendai' });

		const result = await run();

		expect(result.previousSource).toBe('inferred');
		expect(result.outcomes.map((o) => o.status)).toEqual(['applied']);
		expect(await read('var/delendai/proposals/index.json')).toBe(
			'{"kept":true}',
		);
	});
});

describe('a recorded configuration that changed', () => {
	it('moves the cache and never overwrites what the destination holds', async () => {
		await writeAppliedSnapshot(root, snapshotOf({ cacheDir: 'old-cache' }));
		await put('old-cache/a.json', 'from-old');
		await put('old-cache/shared.json', 'old-version');
		await put('new-cache/shared.json', 'already-here');
		await writeConfig({ cacheDir: 'new-cache' });

		const result = await run();

		expect(result.previousSource).toBe('recorded');
		expect(await read('new-cache/a.json')).toBe('from-old');
		// The destination's copy wins; the source copy is left, not lost.
		expect(await read('new-cache/shared.json')).toBe('already-here');
		expect(await read('old-cache/shared.json')).toBe('old-version');
		expect(await readAppliedSnapshot(root)).toMatchObject({
			cacheDir: 'new-cache',
		});
	});

	it("evicts a removed plugin's cache and leaves every other plugin's alone", async () => {
		await writeAppliedSnapshot(
			root,
			snapshotOf({ plugins: { git: {}, docs: {} } }),
		);
		await put('.cache/delendai/git/state.json', 'git');
		await put('.cache/delendai/docs/state.json', 'docs');
		await writeConfig({ plugins: { git: {} } });

		await run();

		expect(existsSync(join(root, '.cache/delendai/docs'))).toBe(false);
		expect(await read('.cache/delendai/git/state.json')).toBe('git');
	});

	it('treats a plugin switched to enabled:false as removed', async () => {
		await writeAppliedSnapshot(root, snapshotOf({ plugins: { docs: {} } }));
		await put('.cache/delendai/docs/state.json', 'docs');
		await writeConfig({ plugins: { docs: { enabled: false } } });

		await run();

		expect(existsSync(join(root, '.cache/delendai/docs'))).toBe(false);
	});

	it('never deletes through a plugin name that is not a plain identifier', async () => {
		await writeAppliedSnapshot(root, {
			version: 1,
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
			plugins: ['../../precious'],
		});
		await put('precious/data.txt', 'keep');
		await writeConfig({});

		await run();

		expect(await read('precious/data.txt')).toBe('keep');
	});

	it('reports a docsDir change and does not move tracked files', async () => {
		await writeAppliedSnapshot(root, snapshotOf({}));
		await put('docs/delendai/guide.md', '# guide');
		await writeConfig({ docsDir: 'documentation' });

		const result = await run();

		expect(result.outcomes).toMatchObject([
			{ id: 'config:docs-dir', steps: [{ kind: 'manual' }] },
		]);
		expect(await read('docs/delendai/guide.md')).toBe('# guide');
	});

	it('does nothing on the second pass', async () => {
		await writeAppliedSnapshot(root, snapshotOf({ cacheDir: 'a' }));
		await put('a/x.json', '1');
		await writeConfig({ cacheDir: 'b' });

		await run();
		const second = await run();

		expect(second).toMatchObject({ outcomes: [], acted: false });
	});
});

describe('what it refuses', () => {
	it('runs no transition over an invalid config file', async () => {
		// `{}` is what a broken file parses to, and `{}` read as the
		// configuration means every plugin was removed.
		await writeAppliedSnapshot(root, snapshotOf({ plugins: { docs: {} } }));
		await put('.cache/delendai/docs/state.json', 'docs');
		await writeFile(join(root, 'delendai.config.json'), '{ broken', 'utf8');

		const result = await run();

		expect(result.skipped).toContain('has problems');
		expect(await read('.cache/delendai/docs/state.json')).toBe('docs');
		expect(await readAppliedSnapshot(root)).toMatchObject({
			plugins: ['docs'],
		});
	});

	it('plans without touching anything in a dry run', async () => {
		await writeAppliedSnapshot(root, snapshotOf({ cacheDir: 'a' }));
		await put('a/x.json', '1');
		await writeConfig({ cacheDir: 'b' });

		const result = await run(true);

		expect(result.outcomes).toMatchObject([
			{ status: 'planned', id: 'config:cache-dir' },
		]);
		expect(await read('a/x.json')).toBe('1');
		expect(await readAppliedSnapshot(root)).toMatchObject({
			cacheDir: 'a',
		});
	});

	it('stops at a failed transition and does not record the new configuration', async () => {
		await writeAppliedSnapshot(root, snapshotOf({ cacheDir: 'a' }));
		await writeConfig({ cacheDir: 'b' });
		const exploding: IConfigTransition = {
			id: 'test:explodes',
			plan: () => [{ kind: 'boom', detail: 'always' }],
			apply: async () => {
				throw new Error('disk full');
			},
		};

		const result = await reconcileConfigTransitions({
			workspaceRoot: root,
			dryRun: false,
			transitions: [exploding],
		});

		expect(result.outcomes).toEqual([
			{ status: 'failed', id: 'test:explodes', reason: 'disk full' },
		]);
		// Recording it would make a half-applied change permanent.
		expect(await readAppliedSnapshot(root)).toMatchObject({
			cacheDir: 'a',
		});
	});
});

describe('ensureWorkspaceMigrated runs the transitions', () => {
	it('reports a configuration change even when no migration was pending', async () => {
		await writeAppliedSnapshot(root, snapshotOf({ plugins: { docs: {} } }));
		await put('.cache/delendai/docs/state.json', 'docs');
		await writeConfig({});
		const reported: unknown[] = [];

		const result = await ensureWorkspaceMigrated({
			migrations: [],
			journal: { read: async () => [], record: async () => undefined },
			workspaceRoot: root,
			report: (r) => reported.push(r),
		});

		expect(result.acted).toBe(true);
		expect(result.transitions?.outcomes).toMatchObject([
			{ status: 'applied', id: 'config:removed-plugin-cache' },
		]);
		expect(reported).toHaveLength(1);
	});

	it('stays silent when neither migrations nor configuration changed', async () => {
		const reported: unknown[] = [];
		await ensureWorkspaceMigrated({
			migrations: [],
			journal: { read: async () => [], record: async () => undefined },
			workspaceRoot: root,
			report: (r) => reported.push(r),
		});
		expect(reported).toHaveLength(0);
	});
});

/**
 * x00607 — a run that wrote something never reports that it did not.
 *
 * The record is the only file delendai creates in a project that has
 * changed nothing else, the directory holding it is self-ignoring, and
 * the caller gates its whole report on `acted`. So `acted: false` on a
 * run that created it is not a cosmetic inaccuracy: it is the reason
 * nobody was told.
 */
describe('recording the applied configuration is acting (x00607)', () => {
	it('reports the write, and names where it went', async () => {
		await writeConfig({ plugins: { proposals: { enabled: true } } });

		const result = await run();

		expect(result.recorded).toBe('written');
		// Not `outcomes.length > 0`: no transition ran, and a file still
		// appeared in somebody's repository.
		expect(result.outcomes).toStrictEqual([]);
		expect(result.acted).toBe(true);
		expect(result.recordPath).toBe('.delendai/applied-config.json');
		await expect(read(result.recordPath)).resolves.toContain('proposals');
	});

	it('does not claim to have acted on a second, unchanged run', async () => {
		await writeConfig({ plugins: { proposals: { enabled: true } } });
		await run();

		const again = await run();

		// A second boot is not news, and reporting it every time would
		// teach a reader to skip the report that matters.
		expect(again.recorded).toBe('unchanged');
		expect(again.acted).toBe(false);
	});

	it('still detects a later edit, which is why the record is written at all', async () => {
		await writeConfig({
			cacheDir: '.cache/delendai',
			plugins: { proposals: { enabled: true } },
		});
		await run();
		// Something in the old cache, so a move has work to do.
		await put('.cache/delendai/keep.txt', 'evidence\n');

		await writeConfig({
			cacheDir: '.cache/elsewhere',
			plugins: { proposals: { enabled: true } },
		});
		const moved = await run();

		// Withholding the first write to look polite would have made this
		// run infer "previous === current" and miss the edit entirely,
		// orphaning the old cache in silence.
		expect(moved.previousSource).toBe('recorded');
		expect(moved.acted).toBe(true);
		await expect(read('.cache/elsewhere/keep.txt')).resolves.toBe(
			'evidence\n',
		);
	});

	it('records nothing for a workspace with neither a config nor a record', async () => {
		// Writing defaults here would later read back as a deliberate
		// configuration nobody chose.
		const result = await run();

		expect(result.recorded).toBe('withheld');
		expect(result.acted).toBe(false);
	});

	it('withholds the record while a dry run only plans', async () => {
		await writeConfig({ plugins: { proposals: { enabled: true } } });

		const result = await run(true);

		expect(result.recorded).toBe('withheld');
		expect(result.acted).toBe(false);
	});
});
