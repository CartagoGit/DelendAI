import { describe, expect, it, vi } from 'vitest';

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
