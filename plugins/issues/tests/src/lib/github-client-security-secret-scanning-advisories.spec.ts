import { describe, expect, it } from 'vitest';

import {
	listSecretScanningAlerts,
	listSecurityAdvisories,
} from '../../../src/lib/github-client';
import type { IFetchFn, ISpawnSync } from '../../../src/lib/contracts';

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

const rawSecretScanningAlert = {
	number: 33,
	state: 'resolved' as const,
	secret_type: 'github_personal_access_token',
	push_protection_bypassed: true,
	validity: 'active',
	locations_count: 4,
	html_url: 'https://github.com/o/r/secret-scanning/33',
	created_at: '2026-03-01T00:00:00Z',
	updated_at: '2026-03-02T00:00:00Z',
};

const rawSecurityAdvisory = {
	ghsa_id: 'GHSA-1234-5678-9abc',
	cve_id: 'CVE-2026-1234',
	summary: 'Repository advisory summary',
	severity: 'high',
	state: 'published',
	html_url: 'https://github.com/o/r/security/advisories/GHSA-1234-5678-9abc',
	published_at: '2026-04-01T00:00:00Z',
	updated_at: '2026-04-02T00:00:00Z',
	vulnerabilities: [
		{
			package: { ecosystem: 'npm', name: 'pkg' },
			vulnerable_version_range: '< 1.2.3',
		},
	],
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

describe('listSecretScanningAlerts', async () => {
	it('uses the gh tier and maps raw alert fields', async () => {
		const result = await listSecretScanningAlerts(
			'o/r',
			{},
			{
				spawnSync: okJsonSpawn({
					'secret-scanning/alerts?': [rawSecretScanningAlert],
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
				number: 33,
				state: 'resolved',
				secretType: 'github_personal_access_token',
				pushProtection: true,
				validity: 'active',
				locationsCount: 4,
				htmlUrl: 'https://github.com/o/r/secret-scanning/33',
				createdAt: '2026-03-01T00:00:00Z',
				updatedAt: '2026-03-02T00:00:00Z',
			},
		]);
	});

	it('falls back to rest-authed when gh is not installed and GITHUB_TOKEN is set', async () => {
		const result = await listSecretScanningAlerts(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'secret-scanning/alerts?': [rawSecretScanningAlert],
				}),
				env: { GITHUB_TOKEN: 'secret-token' },
			},
		);

		expect(result.tier).toBe('rest-authed');
		expect(result.alerts[0]?.secretType).toBe(
			'github_personal_access_token',
		);
	});

	it('falls back to rest-anon when gh is missing and there is no GITHUB_TOKEN', async () => {
		const result = await listSecretScanningAlerts(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'secret-scanning/alerts?': [rawSecretScanningAlert],
				}),
				env: {},
			},
		);

		expect(result.tier).toBe('rest-anon');
		expect(result.alerts[0]?.locationsCount).toBe(4);
	});

	it('throws when gh is installed but fails for a real reason', async () => {
		await expect(
			listSecretScanningAlerts(
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

	it('passes state and limit filters to gh api', async () => {
		let capturedPath = '';
		const spawnSync: ISpawnSync = (cmd) => {
			capturedPath = cmd[2] ?? '';
			return {
				exitCode: 0,
				stdout: encode(JSON.stringify([rawSecretScanningAlert])),
				stderr: encode(''),
			};
		};

		await listSecretScanningAlerts(
			'o/r',
			{ state: 'resolved', limit: 5 },
			{ spawnSync },
		);

		expect(capturedPath).toContain('state=resolved');
		expect(capturedPath).toContain('per_page=5');
	});
});

describe('listSecurityAdvisories', async () => {
	it('uses the gh tier and maps raw advisory fields', async () => {
		const result = await listSecurityAdvisories(
			'o/r',
			{},
			{
				spawnSync: okJsonSpawn({
					'security-advisories?': [rawSecurityAdvisory],
				}),
				fetchFn: async () => {
					throw new Error(
						'fetch should not be called when gh succeeds',
					);
				},
			},
		);

		expect(result.tier).toBe('gh');
		expect(result.advisories).toEqual([
			{
				ghsaId: 'GHSA-1234-5678-9abc',
				cveId: 'CVE-2026-1234',
				summary: 'Repository advisory summary',
				severity: 'high',
				state: 'published',
				htmlUrl:
					'https://github.com/o/r/security/advisories/GHSA-1234-5678-9abc',
				publishedAt: '2026-04-01T00:00:00Z',
				updatedAt: '2026-04-02T00:00:00Z',
			},
		]);
	});

	it('falls back to rest-authed when gh is not installed and GITHUB_TOKEN is set', async () => {
		const result = await listSecurityAdvisories(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'security-advisories?': [rawSecurityAdvisory],
				}),
				env: { GITHUB_TOKEN: 'secret-token' },
			},
		);

		expect(result.tier).toBe('rest-authed');
		expect(result.advisories[0]?.ghsaId).toBe('GHSA-1234-5678-9abc');
	});

	it('falls back to rest-anon when gh is missing and there is no GITHUB_TOKEN', async () => {
		const result = await listSecurityAdvisories(
			'o/r',
			{},
			{
				spawnSync: notFoundSpawn,
				fetchFn: jsonFetch({
					'security-advisories?': [rawSecurityAdvisory],
				}),
				env: {},
			},
		);

		expect(result.tier).toBe('rest-anon');
		expect(result.advisories[0]?.severity).toBe('high');
	});

	it('throws when gh is installed but fails for a real reason', async () => {
		await expect(
			listSecurityAdvisories(
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

	it('passes state and limit filters to gh api', async () => {
		let capturedPath = '';
		const spawnSync: ISpawnSync = (cmd) => {
			capturedPath = cmd[2] ?? '';
			return {
				exitCode: 0,
				stdout: encode(JSON.stringify([rawSecurityAdvisory])),
				stderr: encode(''),
			};
		};

		await listSecurityAdvisories(
			'o/r',
			{ state: 'closed', limit: 5 },
			{ spawnSync },
		);

		expect(capturedPath).toContain('state=closed');
		expect(capturedPath).toContain('per_page=5');
	});
});
