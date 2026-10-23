import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createLegacyWorkspaceFixture,
	hashWorkspaceTree,
} from '../../../packages/test-kit/src/lib/fixtures/legacy-workspace/index';
import {
	createFileSystemHostConfigIO,
	applyGlobalConfig,
} from '../../../packages/core/src/lib/workspace-migration/host-scope/global-config.migrator';
import {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
} from '../../../packages/core/src/lib/workspace-migration/migration-registry';
import { refreshLockfile } from '../../../packages/core/src/lib/workspace-migration/package-manager/lockfile-refresh';
import { scanLegacyIdentity } from '../../../packages/core/src/lib/workspace-migration/scanner/legacy-identity-scanner';
import {
	createDefaultPhases,
	runMigrationTransaction,
	rollbackLatestMigration,
} from '../../../packages/core/src/lib/workspace-migration/transaction/migration-transaction';
import { readLatestManifestFromDisk } from '../../../packages/core/src/lib/workspace-migration/transaction/migration-manifest';
import { applyCacheAndDocs } from '../../../packages/core/src/lib/workspace-migration/migrators/cache-and-docs.migrator';
import { ensureWorkspaceMigrated } from '../../../packages/core/src/lib/workspace-migration/legacy-migration.service';

const createdRoots: string[] = [];

const makeRoot = async (prefix: string): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), prefix));
	createdRoots.push(root);
	return root;
};

afterEach(async () => {
	for (const root of createdRoots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

const createTransactionPhases = () =>
	createDefaultPhases({
		migrations: DEFAULT_MIGRATIONS,
		journal: createFileSystemJournal(),
	});

const runLegacyAdoption = async (input: {
	readonly workspaceRoot: string;
	readonly hostConfigPaths?: readonly string[];
	readonly packageManager?: 'bun' | 'npm' | 'pnpm' | 'yarn' | 'none';
	readonly lockfileRunner?: Parameters<typeof refreshLockfile>[0]['runner'];
}) => {
	const transaction = await runMigrationTransaction(
		createTransactionPhases(),
		{ workspaceRoot: input.workspaceRoot },
	);
	const globalConfigReport =
		input.hostConfigPaths === undefined ||
		input.hostConfigPaths.length === 0
			? null
			: await applyGlobalConfig({
					workspaceRoot: input.workspaceRoot,
					hostConfigs: input.hostConfigPaths.map((path) => ({
						host: path.endsWith('.json') ? 'claude' : 'codex',
						path,
					})),
					io: createFileSystemHostConfigIO(),
				});
	const lockfile =
		input.packageManager === undefined || input.packageManager === 'none'
			? null
			: await refreshLockfile({
					workspaceRoot: input.workspaceRoot,
					packageManager: input.packageManager,
					runner: input.lockfileRunner,
				});
	const residual = await scanLegacyIdentity(input.workspaceRoot);
	return { transaction, globalConfigReport, lockfile, residual };
};

describe('b00239 S9 — legacy workspace adoption e2e', () => {
	it('covers the 10-step happy path on a real legacy fixture and the second run is byte-identical', async () => {
		const sandbox = await makeRoot('b00239-s9-happy-');
		const workspaceRoot = join(sandbox, 'workspace');
		const homeRoot = join(sandbox, 'home');
		const fixture = await createLegacyWorkspaceFixture({
			workspaceRoot,
			homeRoot,
			includeGlobalHostConfigs: true,
			packageManager: 'npm',
		});

		const beforeScan = await scanLegacyIdentity(workspaceRoot);
		expect(beforeScan.ok).toBe(false);

		const adoption = await runLegacyAdoption({
			workspaceRoot,
			hostConfigPaths: [
				fixture.ownedClaudeConfigPath!,
				fixture.ownedCodexConfigPath!,
			],
			packageManager: 'npm',
			lockfileRunner: async (_command, options) => {
				await writeFile(
					join(options.cwd, 'package-lock.json'),
					'{"name":"delendai-demo","lockfileVersion":3,"packages":{"":{"name":"delendai-demo"},"node_modules/@delendai/core":{"version":"0.1.0"}}}\n',
					'utf8',
				);
				return { code: 0, output: 'ok', timedOut: false };
			},
		});

		expect(adoption.transaction.status).toBe('committed');
		expect(
			JSON.parse(
				await readFile(join(workspaceRoot, 'package.json'), 'utf8'),
			).name,
		).toBe('delendai-demo');
		expect(
			await readFile(join(workspaceRoot, 'delendai.config.json'), 'utf8'),
		).toContain('"name": "delendai"');
		expect(
			JSON.parse(
				await readFile(
					join(workspaceRoot, '.vscode', 'mcp.json'),
					'utf8',
				),
			).servers.delendai.command,
		).toBe('delendai');
		expect(
			existsSync(join(workspaceRoot, '.cache', 'delendai', 'state.json')),
		).toBe(true);
		expect(
			existsSync(join(workspaceRoot, 'docs', 'delendai', 'guide.md')),
		).toBe(true);
		expect(
			await readFile(
				join(workspaceRoot, '.github', 'agents', 'workspace-helper.md'),
				'utf8',
			),
		).toContain('delendai-helper');
		expect(
			adoption.globalConfigReport?.rewritten
				.map((entry) => entry.projectKey)
				.sort(),
		).toEqual([workspaceRoot, workspaceRoot].sort());
		expect(adoption.lockfile?.status).toBe('refreshed');
		expect(
			await readFile(join(workspaceRoot, 'package-lock.json'), 'utf8'),
		).toContain('@delendai/core');
		expect(adoption.residual.ok).toBe(true);

		const afterFirstHash = await hashWorkspaceTree(workspaceRoot);
		const second = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot,
		});
		const secondGlobal = await applyGlobalConfig({
			workspaceRoot,
			hostConfigs: [
				{ host: 'claude', path: fixture.ownedClaudeConfigPath! },
				{ host: 'codex', path: fixture.ownedCodexConfigPath! },
			],
			io: createFileSystemHostConfigIO(),
		});
		const afterSecondHash = await hashWorkspaceTree(workspaceRoot);
		expect(second.acted).toBe(false);
		expect(second.outcomes).toEqual([{ status: 'not-needed' }]);
		expect(secondGlobal.writtenFiles).toEqual([]);
		expect(afterSecondHash).toBe(afterFirstHash);
		expect((await scanLegacyIdentity(workspaceRoot)).ok).toBe(true);
	});

	it('preserves unrelated dirty workspace files while migrating owned legacy state', async () => {
		const sandbox = await makeRoot('b00239-s9-dirty-');
		const workspaceRoot = join(sandbox, 'workspace');
		await createLegacyWorkspaceFixture({
			workspaceRoot,
			dirtyWorkspace: true,
			packageManager: 'none',
		});
		const dirtyPath = join(workspaceRoot, 'src', 'dirty-user-note.ts');
		const before = await readFile(dirtyPath, 'utf8');

		const adoption = await runLegacyAdoption({
			workspaceRoot,
			packageManager: 'none',
		});

		expect(adoption.transaction.status).toBe('committed');
		expect(await readFile(dirtyPath, 'utf8')).toBe(before);
		expect(adoption.residual.ok).toBe(true);
	});

	it('finishes a partially migrated fixture without reintroducing legacy identity', async () => {
		const sandbox = await makeRoot('b00239-s9-partial-');
		const workspaceRoot = join(sandbox, 'workspace');
		await createLegacyWorkspaceFixture({
			workspaceRoot,
			partial: true,
			packageManager: 'none',
		});

		const adoption = await runLegacyAdoption({
			workspaceRoot,
			packageManager: 'none',
		});

		expect(adoption.transaction.status).toBe('committed');
		expect(
			await readFile(
				join(workspaceRoot, '.github', 'agents', 'workspace-helper.md'),
				'utf8',
			),
		).toContain('delendai-helper');
		expect(adoption.residual.ok).toBe(true);
	});

	it('reports a pre-existing destination and never clobbers it', async () => {
		const sandbox = await makeRoot('b00239-s9-dest-');
		const workspaceRoot = join(sandbox, 'workspace');
		await mkdir(join(workspaceRoot, 'legacy-cache'), { recursive: true });
		await mkdir(join(workspaceRoot, 'new-cache', 'keep'), {
			recursive: true,
		});
		await writeFile(
			join(workspaceRoot, 'legacy-cache', 'incoming.json'),
			'{"incoming":true}\n',
			'utf8',
		);
		await writeFile(
			join(workspaceRoot, 'new-cache', 'keep', 'sentinel.json'),
			'{"keep":true}\n',
			'utf8',
		);

		const report = await applyCacheAndDocs({
			workspaceRoot,
			renames: [
				{
					from: 'legacy-cache',
					to: 'new-cache',
					label: 'cache directory',
					kind: 'directory',
				},
			],
		});

		expect(report.preExisting).toEqual(['legacy-cache']);
		expect(
			await readFile(
				join(workspaceRoot, 'new-cache', 'keep', 'sentinel.json'),
				'utf8',
			),
		).toBe('{"keep":true}\n');
		expect(
			existsSync(join(workspaceRoot, 'legacy-cache', 'incoming.json')),
		).toBe(true);
	});

	it('rolls back to the original tree when apply is interrupted after real migration work', async () => {
		const sandbox = await makeRoot('b00239-s9-interrupted-');
		const workspaceRoot = join(sandbox, 'workspace');
		await createLegacyWorkspaceFixture({
			workspaceRoot,
			packageManager: 'none',
		});
		const before = await hashWorkspaceTree(workspaceRoot);

		const base = createTransactionPhases();
		const outcome = await runMigrationTransaction(
			{
				...base,
				apply: async (steps, ctx) => {
					await base.apply(steps, ctx);
					throw new Error('forced interruption');
				},
			},
			{ workspaceRoot },
		);

		expect(outcome.status).toBe('rolled-back');
		expect(await hashWorkspaceTree(workspaceRoot)).toBe(before);
	});

	it('manual rollback restores the pre-migration tree from the persisted manifest backup', async () => {
		const sandbox = await makeRoot('b00239-s9-rollback-');
		const workspaceRoot = join(sandbox, 'workspace');
		await createLegacyWorkspaceFixture({
			workspaceRoot,
			packageManager: 'none',
		});
		const before = await hashWorkspaceTree(workspaceRoot);

		const committed = await runMigrationTransaction(
			createTransactionPhases(),
			{
				workspaceRoot,
			},
		);
		expect(committed.status).toBe('committed');
		const stored = await readLatestManifestFromDisk(workspaceRoot);
		expect(stored).not.toBeNull();
		await rollbackLatestMigration(
			{ workspaceRoot },
			stored!.manifest,
			'manual rollback for fixture adoption test',
		);

		expect(await hashWorkspaceTree(workspaceRoot)).toBe(before);
	});

	it('rewrites only the owned project entries in shared global host configs', async () => {
		const sandbox = await makeRoot('b00239-s9-global-');
		const workspaceRoot = join(sandbox, 'workspace');
		const homeRoot = join(sandbox, 'home');
		const fixture = await createLegacyWorkspaceFixture({
			workspaceRoot,
			homeRoot,
			includeGlobalHostConfigs: true,
			packageManager: 'none',
		});

		const report = await applyGlobalConfig({
			workspaceRoot,
			hostConfigs: [
				{ host: 'claude', path: fixture.ownedClaudeConfigPath! },
				{ host: 'codex', path: fixture.ownedCodexConfigPath! },
			],
			io: createFileSystemHostConfigIO(),
		});

		expect(
			report.rewritten.map((entry) => entry.projectKey).sort(),
		).toEqual([workspaceRoot, workspaceRoot].sort());
		const claude = await readFile(fixture.ownedClaudeConfigPath!, 'utf8');
		expect(claude).toContain('delendai');
		expect(claude).toContain(fixture.foreignWorkspaceRoot!);
	});

	it('refreshes the lockfile through the package-manager API instead of text replacement', async () => {
		const sandbox = await makeRoot('b00239-s9-lock-');
		const workspaceRoot = join(sandbox, 'workspace');
		await createLegacyWorkspaceFixture({
			workspaceRoot,
			packageManager: 'pnpm',
		});
		const result = await refreshLockfile({
			workspaceRoot,
			packageManager: 'pnpm',
			runner: async (_command, options) => {
				await writeFile(
					join(options.cwd, 'pnpm-lock.yaml'),
					'lockfileVersion: 9\npackages:\n  "@delendai/core@workspace:*":\n    resolution: {directory: packages/core}\n',
					'utf8',
				);
				return { code: 0, output: 'ok', timedOut: false };
			},
		});

		expect(result.status).toBe('refreshed');
		expect(
			await readFile(join(workspaceRoot, 'pnpm-lock.yaml'), 'utf8'),
		).toContain('@delendai/core');
	});
});
