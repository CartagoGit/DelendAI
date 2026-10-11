import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
	IGitHubBranchProtectionResponse,
	IProtectionFetchResult,
} from './lib/github-protection.lib.ts';
import {
	diffBranch,
	loadDeclaredBranchProtectionConfig,
	run,
} from './verify-branch-protection.script.ts';

const CONFIG_YAML = [
	'version: 1',
	'branches:',
	'  - name: main',
	'    protected: true',
	'    protection:',
	'      required_status_checks:',
	'        strict: true',
	'        contexts:',
	'          - ci-complete',
	'          - release-pr-gate',
	'      enforce_admins: true',
	'      required_linear_history: true',
	'      allow_force_pushes: false',
	'      allow_deletions: false',
	'      restrictions: null',
	'  - name: develop',
	'    protected: true',
	'    protection:',
	'      required_status_checks:',
	'        strict: true',
	'        contexts:',
	'          - ci-complete',
	'      enforce_admins: true',
	'      required_linear_history: true',
	'      allow_force_pushes: false',
	'      allow_deletions: false',
	'      restrictions: null',
].join('\n');

const makeLive = (
	overrides: Partial<IGitHubBranchProtectionResponse> = {},
): IGitHubBranchProtectionResponse => ({
	enforce_admins: { enabled: true },
	required_linear_history: { enabled: true },
	allow_force_pushes: { enabled: false },
	allow_deletions: { enabled: false },
	required_status_checks: {
		strict: true,
		contexts: ['ci-complete', 'release-pr-gate'],
	},
	...overrides,
});

const withTempConfig = async (
	fn: (configPath: string) => Promise<void>,
): Promise<void> => {
	const root = mkdtempSync(join(tmpdir(), 'verify-branch-protection-'));
	const configPath = join(root, 'branch-protection.yml');
	writeFileSync(configPath, CONFIG_YAML, 'utf8');
	try {
		await fn(configPath);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
};

describe('verify-branch-protection', () => {
	it('parses the declarative YAML policy', async () => {
		await withTempConfig(async (configPath) => {
			const config = await loadDeclaredBranchProtectionConfig(configPath);
			expect(config.version).toBe(1);
			expect(config.branches.map((branch) => branch.name)).toEqual([
				'main',
				'develop',
			]);
			expect(
				config.branches[0]?.protection.required_status_checks.contexts,
			).toEqual(['ci-complete', 'release-pr-gate']);
		});
	});

	it('returns no drift when live protection matches the declaration', async () => {
		await withTempConfig(async (configPath) => {
			const config = await loadDeclaredBranchProtectionConfig(configPath);
			const drifts = diffBranch(config.branches[0]!, makeLive());
			expect(drifts).toEqual([]);
		});
	});

	it('treats required checks as a set, not an ordered list', async () => {
		await withTempConfig(async (configPath) => {
			const config = await loadDeclaredBranchProtectionConfig(configPath);
			const drifts = diffBranch(
				config.branches[0]!,
				makeLive({
					required_status_checks: {
						strict: true,
						contexts: ['release-pr-gate', 'ci-complete'],
					},
				}),
			);
			expect(drifts).toEqual([]);
		});
	});

	it('accepts an intentionally unprotected branch', async () => {
		await withTempConfig(async (configPath) => {
			const config = await loadDeclaredBranchProtectionConfig(configPath);
			const develop = {
				...config.branches[1]!,
				protected: false,
			};
			expect(diffBranch(develop, null)).toEqual([]);
			expect(diffBranch(develop, makeLive())).toHaveLength(1);
		});
	});

	it('exits 0 when both protected branches match the declared policy', async () => {
		await withTempConfig(async (configPath) => {
			const stdout: string[] = [];
			const stderr: string[] = [];
			const result = await run([], {
				configPath,
				env: {},
				out: (msg) => stdout.push(msg),
				err: (msg) => stderr.push(msg),
				reportUnverified: async () => undefined,
				fetchProtection: async ({
					branch,
				}): Promise<IProtectionFetchResult> => ({
					kind: 'live',
					data:
						branch === 'main'
							? makeLive()
							: makeLive({
									required_status_checks: {
										strict: true,
										contexts: ['ci-complete'],
									},
								}),
				}),
			});
			expect(result).toBe(0);
			expect(stderr).toEqual([]);
			expect(stdout.join('\n')).toMatch(/2 of 2 branch\(es\) read match/);
		});
	});

	it('exits 1 when a protected branch diverges from the declared checks', async () => {
		await withTempConfig(async (configPath) => {
			const stderr: string[] = [];
			const result = await run([], {
				configPath,
				env: {},
				out: () => undefined,
				err: (msg) => stderr.push(msg),
				reportUnverified: async () => undefined,
				fetchProtection: async ({
					branch,
				}): Promise<IProtectionFetchResult> => ({
					kind: 'live',
					data:
						branch === 'main'
							? makeLive({
									required_status_checks: {
										strict: true,
										contexts: [
											'quality-gate',
											'tests',
											'tokens',
											'security',
										],
									},
								})
							: makeLive({
									required_status_checks: {
										strict: true,
										contexts: ['ci-complete'],
									},
								}),
				}),
			});
			expect(result).toBe(1);
			expect(stderr.join('\n')).toMatch(
				/missing required checks: ci-complete, release-pr-gate/,
			);
		});
	});

	it('reports rate-limit failures clearly', async () => {
		await withTempConfig(async (configPath) => {
			const stderr: string[] = [];
			const result = await run([], {
				configPath,
				env: {},
				out: () => undefined,
				err: (msg) => stderr.push(msg),
				reportUnverified: async () => undefined,
				fetchProtection: async () => {
					throw new Error(
						'GitHub API 429 on main: rate limit exceeded',
					);
				},
			});
			expect(result).toBe(1);
			expect(stderr.join('\n')).toMatch(/rate limit exceeded/);
			expect(stderr.join('\n')).toMatch(/failed to read/);
		});
	});
});
