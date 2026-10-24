import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ITransactionOutcome } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createMigrateCommand } from './migrate.command';

const mkCtx = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>() => undefined as unknown as TOut,
	listTools: async () => [],
	close: async () => {},
});

describe('migrate command (b00239 S6)', () => {
	it('returns journal state + latest manifest for `status`', async () => {
		const cmd = createMigrateCommand({
			readJournal: async () => ['delendaiToDelendAI:v1'],
			scanResidual: async () => ({ live: 0, hits: [] }),
			readLatestManifest: async () => ({
				path: '/workspace/.delendai/migration-manifests/m.json',
				manifest: {
					id: 'delendaiToDelendAI:v1',
					version: 1,
					timestamp: '2026-09-07T00:00:00.000Z',
					affectedFiles: ['package.json'],
					hashesBefore: {},
					hashesAfter: {},
					renames: [],
					packageChanges: [],
					hostConfigChanges: [],
					validationResult: { ok: true, reason: '' },
				},
			}),
		});

		const result = await cmd.run(['status'], mkCtx('/workspace'));
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.data).toMatchObject({
			workspaceRoot: '/workspace',
			applied: ['delendaiToDelendAI:v1'],
		});
	});

	it('reports the old name a live file still carries', async () => {
		const root = mkdtempSync(join(tmpdir(), 'migrate-residual-'));
		try {
			writeFileSync(
				join(root, 'package.json'),
				'{ "scripts": { "serve": "mcp-vertex serve" } }\n',
			);
			mkdirSync(join(root, 'node_modules', 'mcp-vertex'), {
				recursive: true,
			});
			writeFileSync(
				join(root, 'node_modules', 'mcp-vertex', 'index.js'),
				'module.exports = "mcp-vertex";\n',
			);
			const cmd = createMigrateCommand({
				readJournal: async () => [],
				readLatestManifest: async () => null,
			});

			const result = await cmd.run(['status'], mkCtx(root));

			const residual = (
				result.data as {
					residual: { live: number; hits: { file: string }[] };
				}
			).residual;
			expect(residual.live).toBeGreaterThan(0);
			expect(residual.hits.map((hit) => hit.file)).toEqual(
				expect.arrayContaining(['package.json']),
			);
			expect(
				residual.hits.some((hit) =>
					hit.file.startsWith('node_modules'),
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('migrates the user-level host configs only when asked, and plans them in a dry run', async () => {
		const planHost = vi.fn(async () => [{ kind: 'rewrite', detail: 'x' }]);
		const applyHost = vi.fn(async () => ({
			writtenFiles: ['~/.claude.json'],
		}));
		const runTransaction = vi.fn(async () =>
			fakePartial<ITransactionOutcome>({ status: 'committed' }),
		);
		const cmd = createMigrateCommand({
			planHost,
			applyHost,
			runTransaction,
			scanResidual: async () => ({ live: 0, hits: [] }),
		});

		const planned = await cmd.run(['host', '--dry-run'], mkCtx('/w'));
		expect(planned.data).toEqual({
			plan: [{ kind: 'rewrite', detail: 'x' }],
		});
		expect(applyHost).not.toHaveBeenCalled();

		await cmd.run(['run'], mkCtx('/w'));
		expect(applyHost).not.toHaveBeenCalled();

		const applied = await cmd.run(['host'], mkCtx('/w'));
		expect(applied.data).toEqual({ writtenFiles: ['~/.claude.json'] });
		expect(applyHost).toHaveBeenCalledWith('/w');
	});

	it('returns the dry-run plan for `--dry-run`', async () => {
		const cmd = createMigrateCommand({
			dryRun: async () => ({
				acted: true,
				outcomes: [
					{
						status: 'planned',
						id: 'delendaiToDelendAI:v1',
						steps: [
							{ kind: 'rename', detail: 'config: old → new' },
						],
					},
				],
			}),
		});

		const result = await cmd.run(['--dry-run'], mkCtx('/workspace'));
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.data).toMatchObject({ acted: true });
	});

	it('maps `run` through the transaction outcome', async () => {
		const cmd = createMigrateCommand({
			runTransaction: async () => ({
				status: 'committed',
				manifestPath: '/workspace/.delendai/migration-manifests/m.json',
				manifest: {
					id: 'delendaiToDelendAI:v1',
					version: 1,
					timestamp: '2026-09-07T00:00:00.000Z',
					affectedFiles: ['package.json'],
					hashesBefore: { 'package.json': 'before' },
					hashesAfter: { 'package.json': 'after' },
					renames: [],
					packageChanges: [],
					hostConfigChanges: [],
					validationResult: { ok: true, reason: '' },
				},
			}),
		});

		const result = await cmd.run(['run'], mkCtx('/workspace'));
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.data).toMatchObject({ status: 'committed' });
	});

	it('supports `rollback` against the latest recorded manifest', async () => {
		const rollbackLatest = vi.fn(async () => ({
			restored: ['package.json'],
		}));
		const cmd = createMigrateCommand({
			readLatestManifest: async () => ({
				path: '/workspace/.delendai/migration-manifests/m.json',
				manifest: {
					id: 'delendaiToDelendAI:v1',
					version: 1,
					timestamp: '2026-09-07T00:00:00.000Z',
					affectedFiles: ['package.json'],
					hashesBefore: {},
					hashesAfter: {},
					renames: [],
					packageChanges: [],
					hostConfigChanges: [],
					validationResult: { ok: true, reason: '' },
				},
			}),
			rollbackLatest,
		});

		const result = await cmd.run(['rollback'], mkCtx('/workspace'));
		expect(result.code).toBe(EXIT_CODE.VALIDATION);
		expect(rollbackLatest).toHaveBeenCalledTimes(1);
		expect(result.data).toMatchObject({ restored: ['package.json'] });
	});

	it('rejects unknown subcommands with USAGE', async () => {
		const cmd = createMigrateCommand({
			readJournal: async () => [],
			readLatestManifest: async () => null,
		});
		const result = await cmd.run(['explode'], mkCtx('/workspace'));
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(result.error).toContain('unknown migrate subcommand');
	});
});
