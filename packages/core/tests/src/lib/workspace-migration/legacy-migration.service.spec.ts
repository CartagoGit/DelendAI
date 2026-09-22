/**
 * legacy-migration.service.spec.ts — b00239 S2.
 *
 * The properties that make this engine safe to run before every server
 * start, in order of how badly each one fails if it is wrong:
 *
 *  - it must cost almost nothing and say nothing when there is nothing to
 *    migrate, because that is the case for every project forever after the
 *    transition, and a check that talks on the happy path gets disabled;
 *  - it must not record a migration that did not finish, because that
 *    makes a half-migrated workspace permanent;
 *  - it must stop at the first failure rather than stack the next
 *    migration on top of an unfinished one.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import {
	ensureWorkspaceMigrated,
	hasAdopted,
	runPendingMigrations,
	type IMigration,
	type IMigrationJournal,
} from '@delendai/core/lib/workspace-migration/legacy-migration.service';
import {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from '@delendai/core/lib/workspace-migration/migration-registry';

const ROOT = '/workspace';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** Every file under a directory, with its bytes — the whole tree, exactly. */
const snapshotOf = (root: string): string =>
	execFileSync(
		'sh',
		[
			'-c',
			`find . -type f -exec sha256sum {} + 2>/dev/null | sort || true`,
		],
		{ cwd: root, encoding: 'utf8' },
	);

const journalOver = (applied: string[] = []): IMigrationJournal => ({
	read: async () => applied,
	record: async (_root, id) => {
		applied.push(id);
	},
});

const migration = (
	id: string,
	overrides: Partial<IMigration> = {},
): IMigration => ({
	id,
	detect: async () => true,
	plan: async () => [{ kind: 'rename', detail: `${id} would rename` }],
	apply: async () => undefined,
	...overrides,
});

describe('runPendingMigrations', () => {
	it('costs one probe and reports not-needed when nothing matches', async () => {
		// The common case after the transition, and the one that must stay
		// silent: `plan` is the expensive half and must not be reached.
		const plan = vi.fn();
		const apply = vi.fn();
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', { detect: async () => false, plan, apply }),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(result.acted).toBe(false);
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(plan).not.toHaveBeenCalled();
		expect(apply).not.toHaveBeenCalled();
	});

	it('skips a migration already recorded, without probing for it', async () => {
		const detect = vi.fn(async () => true);
		const result = await runPendingMigrations({
			migrations: [migration('v1', { detect })],
			journal: journalOver(['v1']),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(detect).not.toHaveBeenCalled();
		expect(result.acted).toBe(false);
	});

	it('applies a pending migration and records it afterwards', async () => {
		const order: string[] = [];
		const applied: string[] = [];
		const journal: IMigrationJournal = {
			read: async () => applied,
			record: async (_root, id) => {
				order.push(`record:${id}`);
				applied.push(id);
			},
		};
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', {
					apply: async () => {
						order.push('apply:v1');
					},
				}),
			],
			journal,
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(result.outcomes).toEqual([{ status: 'migrated', id: 'v1' }]);
		// Order matters: recording first would mark a crashed migration
		// as done and make the damage permanent.
		expect(order).toEqual(['apply:v1', 'record:v1']);
	});

	it('does NOT record a migration whose apply threw', async () => {
		const applied: string[] = [];
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', {
					apply: async () => {
						throw new Error('disk full');
					},
				}),
			],
			journal: journalOver(applied),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(result.outcomes[0]).toMatchObject({
			status: 'failed',
			id: 'v1',
		});
		expect(applied).toEqual([]);
	});

	it('stops at the first failure instead of stacking the next migration', async () => {
		// Running v2 over a workspace where v1 did not finish is how a
		// half-migrated tree ends up recorded as complete.
		const second = vi.fn(async () => undefined);
		const result = await runPendingMigrations({
			migrations: [
				migration('v1', {
					apply: async () => {
						throw new Error('interrupted');
					},
				}),
				migration('v2', { apply: second }),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(second).not.toHaveBeenCalled();
		expect(result.outcomes).toHaveLength(1);
	});

	it('runs migrations in declaration order, not alphabetically', async () => {
		// Declaration order IS the dependency statement; an alphabetical
		// accident is not.
		const order: string[] = [];
		await runPendingMigrations({
			migrations: [
				migration('zeta', {
					apply: async () => {
						order.push('zeta');
					},
				}),
				migration('alpha', {
					apply: async () => {
						order.push('alpha');
					},
				}),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});
		expect(order).toEqual(['zeta', 'alpha']);
	});

	it('is idempotent: a second run over the same journal does nothing', async () => {
		const applied: string[] = [];
		const journal = journalOver(applied);
		const apply = vi.fn(async () => undefined);
		const ctx = { workspaceRoot: ROOT, dryRun: false };
		await runPendingMigrations({
			migrations: [migration('v1', { apply })],
			journal,
			ctx,
		});
		const second = await runPendingMigrations({
			migrations: [migration('v1', { apply })],
			journal,
			ctx,
		});
		expect(apply).toHaveBeenCalledTimes(1);
		expect(second.acted).toBe(false);
	});
});

describe('dry run', () => {
	it('plans without applying or recording', async () => {
		const applied: string[] = [];
		const apply = vi.fn();
		const result = await runPendingMigrations({
			migrations: [migration('v1', { apply })],
			journal: journalOver(applied),
			ctx: { workspaceRoot: ROOT, dryRun: true },
		});
		expect(apply).not.toHaveBeenCalled();
		expect(applied).toEqual([]);
		expect(result.outcomes[0]).toMatchObject({
			status: 'planned',
			id: 'v1',
		});
	});
});

describe('ensureWorkspaceMigrated', () => {
	it('reports nothing when there was nothing to do', async () => {
		// The guard runs on every start of every project. Silence on the
		// happy path is the feature.
		const report = vi.fn();
		await ensureWorkspaceMigrated({
			migrations: [migration('v1', { detect: async () => false })],
			journal: journalOver(),
			workspaceRoot: ROOT,
			report,
		});
		expect(report).not.toHaveBeenCalled();
	});

	it('reports once when a migration ran', async () => {
		// A real adopted workspace, because healing one that never adopted
		// delendai is what this guard exists to stop.
		const root = mkdtempSync(join(tmpdir(), 'adopted-'));
		roots.push(root);
		writeFileSync(join(root, 'delendai.config.json'), '{}');
		const report = vi.fn();
		await ensureWorkspaceMigrated({
			migrations: [migration('v1')],
			journal: journalOver(),
			workspaceRoot: root,
			report,
		});
		expect(report).toHaveBeenCalledTimes(1);
	});
});

describe('a workspace that did not adopt delendai is not touched', () => {
	it('writes nothing, reads nothing, and says nothing', async () => {
		// Observed: opening an unrelated project with the MCP configured
		// created and modified a great many files. The migrations behind
		// this rename identity strings inside .vscode/*.json,
		// package.json, host configuration and agent files, and move
		// directories — correct for a workspace carrying this product's
		// old name, and an intrusion anywhere else.
		const root = mkdtempSync(join(tmpdir(), 'stranger-'));
		roots.push(root);
		writeFileSync(join(root, 'package.json'), '{"name":"theirs"}');
		mkdirSync(join(root, '.vscode'), { recursive: true });
		writeFileSync(join(root, '.vscode', 'settings.json'), '{"a":1}');
		const before = snapshotOf(root);

		const apply = vi.fn();
		const record = vi.fn();
		const result = await ensureWorkspaceMigrated({
			migrations: [migration('v1', { apply })],
			journal: { read: async () => [], record },
			workspaceRoot: root,
		});

		expect(result.acted).toBe(false);
		expect(apply).not.toHaveBeenCalled();
		expect(record).not.toHaveBeenCalled();
		// Not one byte, and no `.delendai/` conjured into their project.
		expect(snapshotOf(root)).toEqual(before);
		expect(existsSync(join(root, '.delendai'))).toBe(false);
	});

	it('heals a workspace that has adopted it', async () => {
		const root = mkdtempSync(join(tmpdir(), 'adopted-'));
		roots.push(root);
		writeFileSync(join(root, 'delendai.config.json'), '{}');
		const apply = vi.fn();
		await ensureWorkspaceMigrated({
			migrations: [migration('v1', { apply })],
			journal: { read: async () => [], record: vi.fn() },
			workspaceRoot: root,
		});
		expect(apply).toHaveBeenCalled();
	});

	it('counts a previous adoption, so a momentarily missing config is not a stranger', async () => {
		const root = mkdtempSync(join(tmpdir(), 'healed-'));
		roots.push(root);
		mkdirSync(join(root, '.delendai'), { recursive: true });
		expect(await hasAdopted(root)).toBe(true);
	});
});

describe('a migration means there was something to migrate (x00592)', () => {
	// Observed in an adopted project that had nothing legacy in it: six
	// migrators reported `migrated:` on every boot, and the journal they
	// wrote conjured `.delendai/` into the tree.
	//
	// The cause is that `detect` answers a question one step short of the
	// one that matters. Every migrator here probes for the file it OWNS —
	// `pathExists(delendai.config.json)`, `pathExists(.vscode/mcp.json)` —
	// and an adopted project has those files by definition. "The file I
	// rewrite exists" is not "the file needs rewriting".
	//
	// `plan` already answers the real question, for every migrator, and it
	// is what `--dry-run` has always trusted. So the engine asks it: a
	// migration that plans nothing does nothing, records nothing, and is
	// not reported.
	it('does not apply, record or report a migration that plans no steps', async () => {
		const apply = vi.fn();
		const record = vi.fn();
		const result = await runPendingMigrations({
			migrations: [
				migration('nothing-to-do', { plan: async () => [], apply }),
			],
			journal: { read: async () => [], record },
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});

		expect(apply).not.toHaveBeenCalled();
		expect(record).not.toHaveBeenCalled();
		expect(result.acted).toBe(false);
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
	});

	it('still applies the one that does, and skips only the empty one', async () => {
		const idle = vi.fn();
		const busy = vi.fn();
		const result = await runPendingMigrations({
			migrations: [
				migration('idle', { plan: async () => [], apply: idle }),
				migration('busy', { apply: busy }),
			],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: false },
		});

		expect(idle).not.toHaveBeenCalled();
		expect(busy).toHaveBeenCalled();
		expect(result.outcomes).toEqual([{ status: 'migrated', id: 'busy' }]);
	});

	it('leaves a dry run listing everything it would do, including nothing', async () => {
		// `--dry-run` reports the plan; an empty plan is a legitimate
		// answer to "what would you do?" and the operator asked.
		const result = await runPendingMigrations({
			migrations: [migration('idle', { plan: async () => [] })],
			journal: journalOver(),
			ctx: { workspaceRoot: ROOT, dryRun: true },
		});
		expect(result.outcomes).toEqual([
			{ status: 'planned', id: 'idle', steps: [] },
		]);
	});
});

describe('the real registry against a project that has nothing legacy (x00592)', () => {
	// The end of the chain, measured rather than reasoned about: the
	// migrations that actually ship, the journal that actually writes,
	// and a sha256 of every file before and after.
	it('leaves an adopted project byte-identical, and writes no journal', async () => {
		const root = mkdtempSync(join(tmpdir(), 'adopted-modern-'));
		roots.push(root);
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{ "development": { "profile": "shared-checkout-merge" } }\n',
		);
		writeFileSync(
			join(root, 'package.json'),
			'{ "name": "somebody-elses-app", "version": "1.0.0" }\n',
		);
		mkdirSync(join(root, '.vscode'), { recursive: true });
		writeFileSync(
			join(root, '.vscode', 'mcp.json'),
			'{ "servers": { "DelendAI": { "command": "delendai" } } }\n',
		);
		const before = snapshotOf(root);

		const reported = vi.fn();
		const result = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot: root,
			report: reported,
		});

		expect(result.acted).toBe(false);
		expect(result.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(reported).not.toHaveBeenCalled();
		// Their own files, untouched: the config, the manifest, the host
		// configuration. Before this, six migrators rewrote-in-place and
		// reported `migrated:` on every one of these.
		for (const file of [
			'delendai.config.json',
			'package.json',
			'.vscode/mcp.json',
		]) {
			expect(before).toContain(file);
			expect(snapshotOf(root)).toContain(
				before
					.split('\n')
					.filter((line) => line.endsWith(file))
					.join(''),
			);
		}
	});
});

describe('a project still on mcp-vertex is actually migrated (x00592)', () => {
	// The case the whole engine exists for, and the one it had never
	// handled. Two independent reasons it could not:
	//
	//  - the rename table's `from` had been flattened to the NEW
	//    spelling, so there was no `mcp-vertex` path it knew about;
	//  - and the adoption gate listed only `delendai.config.json` and
	//    `.delendai`, neither of which such a project has, so it was
	//    read as a stranger and skipped before any of that mattered.
	//
	// Each one alone was enough. Together they meant the migration ran
	// on every project except the ones it was written for.
	it('renames its config, cache and docs, and records the run', async () => {
		const root = mkdtempSync(join(tmpdir(), 'still-mcp-vertex-'));
		roots.push(root);
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			'{ "cacheDir": ".cache/mcp-vertex" }\n',
		);
		mkdirSync(join(root, '.cache', 'mcp-vertex'), { recursive: true });
		writeFileSync(
			join(root, '.cache', 'mcp-vertex', 'index.json'),
			'{"kept":true}\n',
		);
		mkdirSync(join(root, 'docs', 'mcp-vertex'), { recursive: true });
		writeFileSync(join(root, 'docs', 'mcp-vertex', 'index.md'), '# kept\n');

		expect(await hasAdopted(root)).toBe(true);

		const result = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot: root,
		});

		expect(result.acted).toBe(true);
		// Moved, not copied: the old spellings are gone.
		expect(existsSync(join(root, 'mcp-vertex.config.json'))).toBe(false);
		expect(existsSync(join(root, '.cache', 'mcp-vertex'))).toBe(false);
		expect(existsSync(join(root, 'docs', 'mcp-vertex'))).toBe(false);
		// And their contents arrived intact under the new names.
		expect(existsSync(join(root, 'delendai.config.json'))).toBe(true);
		expect(
			readFileSync(
				join(root, '.cache', 'delendai', 'index.json'),
				'utf8',
			),
		).toBe('{"kept":true}\n');
		expect(
			readFileSync(join(root, 'docs', 'delendai', 'index.md'), 'utf8'),
		).toBe('# kept\n');
	});

	it('is a stranger only when it is really a stranger', async () => {
		const root = mkdtempSync(join(tmpdir(), 'stranger-'));
		roots.push(root);
		writeFileSync(join(root, 'package.json'), '{ "name": "theirs" }\n');
		expect(await hasAdopted(root)).toBe(false);
	});
});
