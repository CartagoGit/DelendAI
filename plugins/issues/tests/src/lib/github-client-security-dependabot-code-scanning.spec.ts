import { describe, expect, it } from 'vitest';

import {
	listCodeScanningAlerts,
	listDependabotAlerts,
} from '../../../src/lib/github-client';
import type { IFetchFn, ISpawnSync } from '../../../src/lib/contracts';

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

const rawDependabotAlert = {
	number: 11,
	state: 'open' as const,
	dependency: {
		package: {
			ecosystem: 'npm',
			name: 'left-pad',
		},
	},
	security_vulnerability: {
		severity: 'critical',
		advisory: {
			ghsa_id: 'GHSA-dead-beef',
			summary: 'Prototype pollution',
			severity: 'high',
		},
	},
	html_url: 'https://github.com/o/r/dependabot/11',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-02T00:00:00Z',
};

const rawCodeScanningAlert = {
	number: 22,
	state: 'open' as const,
	rule: {
		id: 'js/sql-injection',
		severity: 'error',
		description: 'Unsanitized SQL input',
		name: 'SQL injection',
	},
	tool: {
		name: 'CodeQL',
		version: '2.18.0',
	},
	most_recent_instance: {
		location: {
			path: 'src/server.ts',
			start_line: 87,
		},
	},
	html_url: 'https://github.com/o/r/code-scanning/22',
	created_at: '2026-02-01T00:00:00Z',
	updated_at: '2026-02-02T00:00:00Z',
};

const okJsonSpawn =
	(byPath: Record<string, unknown>): ISpawnSync =>
	(cmd) => {
		const path = cmd[2] ?? '';
		for (const [key, value] of Object.entries(byPath)) {
			if (path.includes(key)) {
				return {
					exitCode: 0,
					stdout: encode(JSON.stringify(value)),
					stderr: encode(''),
				};
			}
		}
		return { exitCode: 0, stdout: encode('null'), stderr: encode('') };
	};

const notFoundSpawn: ISpawnSync = () => ({
	exitCode: 127,
	stdout: encode(''),
	stderr: encode('command not found'),
});

const failingGhSpawn: ISpawnSync = () => ({
	exitCode: 1,
	stdout: encode(''),
	stderr: encode('HTTP 401: Bad credentials'),
});

const jsonFetch =
	(byPath: Record<string, unknown>): IFetchFn =>
	async (url) => {
		for (const [key, value] of Object.entries(byPath)) {
			if (url.includes(key)) {
				return {
					ok: true,
					status: 200,
					json: async () => value,
				};
			}
		}
		return { ok: false, status: 404, json: async () => ({}) };
	};

describe('listDependabotAlerts', async () => {
	it('uses the gh tier and maps raw alert fields', async () => {
		const result = await listDependabotAlerts(
			'o/r',
			{},
			{
				spawnSync: okJsonSpawn({
					'dependabot/alerts?': [rawDependabotAlert],
				}),
				fetchFn: async () => {
					throw new Error(
						'fetch should not be called when gh succeeds',
					);
				},
			},
		);

		expect(result.tier).toBe('gh');
		expect(result.alerts).toEqual([
			{
				number: 11,
				state: 'open',
				severity: 'critical',
				package: {
					ecosystem: 'npm',
					name: 'left-pad',
				},
				vuln: {
					id: 'GHSA-dead-beef',
					severity: 'critical',
					summary: 'Prototype pollution',
				},
				htmlUrl: 'https://github.com/o/r/dependabot/11',
				createdAt: '2026-01-01T00:00:00Z',
				updatedAt: '2026-01-02T00:00:00Z',
			},
		]);
	});

	it('falls back to rest-authed when gh is not installed and GITHUB_TOKEN is set', async () => {
		const result = await listDependabotAlerts(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'dependabot/alerts?': [rawDependabotAlert],
				}),
				env: { GITHUB_TOKEN: 'secret-token' },
			},
		);

		expect(result.tier).toBe('rest-authed');
		expect(result.alerts[0]?.package.name).toBe('left-pad');
	});

	it('falls back to rest-anon when gh is missing and there is no GITHUB_TOKEN', async () => {
		const result = await listDependabotAlerts(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'dependabot/alerts?': [rawDependabotAlert],
				}),
				env: {},
			},
		);

		expect(result.tier).toBe('rest-anon');
		expect(result.alerts[0]?.severity).toBe('critical');
	});

	it('throws when gh is installed but fails for a real reason', async () => {
		await expect(
			listDependabotAlerts(
				'o/r',
				{},
				{
					spawnSync: failingGhSpawn,
					fetchFn: async () => {
						throw new Error('should not reach fetch');
					},
					env: { GITHUB_TOKEN: 'x' },
				},
			),
		).rejects.toThrow(/gh api .* failed/);
	});

	it('passes state, severity and limit filters to gh api', async () => {
		let capturedPath = '';
		const spawnSync: ISpawnSync = (cmd) => {
			capturedPath = cmd[2] ?? '';
			return {
				exitCode: 0,
				stdout: encode(JSON.stringify([rawDependabotAlert])),
				stderr: encode(''),
			};
		};

		await listDependabotAlerts(
			'o/r',
			{ state: 'fixed', severity: 'high', limit: 5 },
			{ spawnSync },
		);

		expect(capturedPath).toContain('state=fixed');
		expect(capturedPath).toContain('severity=high');
		expect(capturedPath).toContain('per_page=5');
	});
});

describe('listCodeScanningAlerts', async () => {
	it('uses the gh tier and maps raw alert fields', async () => {
		const result = await listCodeScanningAlerts(
			'o/r',
			{},
			{
				spawnSync: okJsonSpawn({
					'code-scanning/alerts?': [rawCodeScanningAlert],
				}),
				fetchFn: async () => {
					throw new Error(
						'fetch should not be called when gh succeeds',
					);
				},
			},
		);

		expect(result.tier).toBe('gh');
		expect(result.alerts).toEqual([
			{
				number: 22,
				state: 'open',
				severity: 'error',
				rule: {
					id: 'js/sql-injection',
					severity: 'error',
					description: 'Unsanitized SQL input',
					name: 'SQL injection',
				},
				tool: {
					name: 'CodeQL',
					version: '2.18.0',
				},
				mostRecentInstance: {
					path: 'src/server.ts',
					startLine: 87,
				},
				htmlUrl: 'https://github.com/o/r/code-scanning/22',
				createdAt: '2026-02-01T00:00:00Z',
				updatedAt: '2026-02-02T00:00:00Z',
			},
		]);
	});

	it('falls back to rest-authed when gh is not installed and GITHUB_TOKEN is set', async () => {
		const result = await listCodeScanningAlerts(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'code-scanning/alerts?': [rawCodeScanningAlert],
				}),
				env: { GITHUB_TOKEN: 'secret-token' },
			},
		);

		expect(result.tier).toBe('rest-authed');
		expect(result.alerts[0]?.tool.name).toBe('CodeQL');
	});

	it('falls back to rest-anon when gh is missing and there is no GITHUB_TOKEN', async () => {
		const result = await listCodeScanningAlerts(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'code-scanning/alerts?': [rawCodeScanningAlert],
				}),
				env: {},
			},
		);

		expect(result.tier).toBe('rest-anon');
		expect(result.alerts[0]?.mostRecentInstance?.path).toBe(
			'src/server.ts',
		);
	});

	it('throws when gh is installed but fails for a real reason', async () => {
		await expect(
			listCodeScanningAlerts(
				'o/r',
				{},
				{
					spawnSync: failingGhSpawn,
					fetchFn: async () => {
						throw new Error('should not reach fetch');
					},
					env: { GITHUB_TOKEN: 'x' },
				},
			),
		).rejects.toThrow(/gh api .* failed/);
	});

	it('passes state, severity and limit filters to gh api', async () => {
		let capturedPath = '';
		const spawnSync: ISpawnSync = (cmd) => {
			capturedPath = cmd[2] ?? '';
			return {
				exitCode: 0,
				stdout: encode(JSON.stringify([rawCodeScanningAlert])),
				stderr: encode(''),
			};
		};

		await listCodeScanningAlerts(
			'o/r',
			{ state: 'dismissed', severity: 'warning', limit: 5 },
			{ spawnSync },
		);

		expect(capturedPath).toContain('state=dismissed');
		expect(capturedPath).toContain('severity=warning');
		expect(capturedPath).toContain('per_page=5');
	});
});
