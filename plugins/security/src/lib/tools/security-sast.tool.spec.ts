import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import { buildSecuritySastRegistration } from './security-sast.tool';
import type { ISecuritySastToolOptions } from '../sast/exports';

const options = (
	overrides: Partial<ISecuritySastToolOptions> = {},
): ISecuritySastToolOptions => ({
	namespacePrefix: 'mcp',
	workspaceRootAbs: '/repo',
	...overrides,
});

describe('security_sast tool', () => {
	it('returns a normalized fallback result', async () => {
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration(
				options({
					detectStack: async () => ({
						pack: 'typescript',
						languages: ['typescript', 'javascript', 'generic'],
						files: ['src/db.ts'],
					}),
					runSastRunner: async () => ({
						source: 'fallback',
						scanned: 1,
						findings: [
							{
								ruleId: 'sql-injection',
								severity: 'critical',
								message: 'Potential SQL injection',
								location: { file: 'src/db.ts', line: 3 },
							},
						],
					}),
				}),
			),
		);
		const out = (await captured.invoke({})) as Record<string, unknown>;
		expect(out.tool).toBe('sast');
		expect((out.summary as { critical: number }).critical).toBe(1);
	});

	it('passes through a forced semgrep runner', async () => {
		let seenRunner: string | undefined;
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration(
				options({
					detectStack: async () => ({
						pack: 'typescript',
						languages: ['typescript', 'generic'],
						files: ['src/db.ts'],
					}),
					runSastRunner: async (input) => {
						seenRunner = input.runner;
						return { source: 'semgrep', scanned: 1, findings: [] };
					},
				}),
			),
		);
		await captured.invoke({ runner: 'semgrep' });
		expect(seenRunner).toBe('semgrep');
	});

	it('filters rules by id', async () => {
		let selectedIds: string[] = [];
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration(
				options({
					detectStack: async () => ({
						pack: 'javascript',
						languages: ['javascript', 'generic'],
						files: ['src/eval.js'],
					}),
					runSastRunner: async (input) => {
						selectedIds = input.rules.map((rule) => rule.id);
						return { source: 'fallback', scanned: 1, findings: [] };
					},
				}),
			),
		);
		await captured.invoke({ rules: ['dangerous-eval'] });
		expect(selectedIds).toEqual(['dangerous-eval']);
	});

	it('works for mixed stacks', async () => {
		let languages: readonly string[] = [];
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration(
				options({
					detectStack: async () => ({
						pack: 'mixed',
						languages: ['typescript', 'python', 'generic'],
						files: ['src/db.ts', 'app.py'],
					}),
					runSastRunner: async (input) => {
						languages = input.languages ?? [];
						return { source: 'fallback', scanned: 2, findings: [] };
					},
				}),
			),
		);
		await captured.invoke({});
		expect(languages).toContain('python');
	});

	it('returns a tool error when a forced CLI is missing', async () => {
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration(
				options({
					detectStack: async () => ({
						pack: 'typescript',
						languages: ['typescript', 'generic'],
						files: ['src/db.ts'],
					}),
					runSastRunner: async () => {
						throw Object.assign(
							new Error('Missing required CLI: semgrep'),
							{
								name: 'MissingCliError',
								hint: 'brew install semgrep',
							},
						);
					},
				}),
			),
		);
		const out = await captured.invokeRaw({ runner: 'semgrep' });
		expect(out.isError).toBe(true);
	});

	it('rejects a symlinked cwd whose real target escapes the workspace', async () => {
		const root = await mkdtemp(join(tmpdir(), 'security-sast-root-'));
		const outside = await mkdtemp(join(tmpdir(), 'security-sast-outside-'));
		try {
			await symlink(outside, join(root, 'linked-outside'));
			let reachedDetectStack = false;
			const captured = await captureToolRegistration(
				buildSecuritySastRegistration(
					options({
						workspaceRootAbs: root,
						detectStack: async () => {
							reachedDetectStack = true;
							return {
								pack: 'typescript',
								languages: ['typescript', 'generic'],
								files: ['src/db.ts'],
							};
						},
						runSastRunner: async () => ({
							source: 'fallback',
							scanned: 0,
							findings: [],
						}),
					}),
				),
			);
			const out = await captured.invokeRaw({
				cwd: 'linked-outside',
			});
			expect(out.isError).toBe(true);
			expect(
				(out.payload as { error?: { reason?: string } }).error?.reason,
			).toContain('cwd');
			expect(reachedDetectStack).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(outside, { recursive: true, force: true });
		}
	});

	it('rejects a nested symlinked cwd whose real target escapes the workspace', async () => {
		const root = await mkdtemp(
			join(tmpdir(), 'security-sast-nested-root-'),
		);
		const outside = await mkdtemp(
			join(tmpdir(), 'security-sast-nested-outside-'),
		);
		try {
			await mkdir(join(root, 'workspace', 'src'), { recursive: true });
			await symlink(outside, join(root, 'workspace', 'src', 'generated'));
			const captured = await captureToolRegistration(
				buildSecuritySastRegistration(
					options({
						workspaceRootAbs: root,
						detectStack: async () => ({
							pack: 'typescript',
							languages: ['typescript', 'generic'],
							files: ['src/db.ts'],
						}),
						runSastRunner: async () => ({
							source: 'fallback',
							scanned: 0,
							findings: [],
						}),
					}),
				),
			);
			const out = await captured.invokeRaw({
				cwd: 'workspace/src/generated',
			});
			expect(out.isError).toBe(true);
			expect(
				(
					out.payload as {
						error?: { reason?: string; nextAction?: string };
					}
				).error?.reason,
			).toContain('cwd');
			expect(
				(
					out.payload as {
						error?: { reason?: string; nextAction?: string };
					}
				).error?.nextAction,
			).toContain('effective path escapes');
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(outside, { recursive: true, force: true });
		}
	});
});
