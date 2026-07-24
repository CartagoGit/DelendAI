import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import {
	buildSecurityDepsRegistration,
	type ISecurityDepsToolOptions,
} from './security-deps.tool';

const options = (
	overrides: Partial<ISecurityDepsToolOptions> = {},
): ISecurityDepsToolOptions => ({
	namespacePrefix: 'mcp',
	workspaceRootAbs: '/repo',
	...overrides,
});

describe('security_deps tool', () => {
	it('maps bun audit json into normalized findings', async () => {
		const tool = buildSecurityDepsRegistration(
			options({
				listDeps: async () => ({
					manifest: 'package.json',
					found: true,
					counts: {
						dependencies: 1,
						devDependencies: 0,
						peerDependencies: 0,
						optionalDependencies: 0,
					},
					deps: [
						{
							name: 'astro',
							range: '^5.0.0',
							section: 'dependencies',
						},
					],
				}),
				auditExec: async () => ({
					code: 1,
					stdout: JSON.stringify({
						astro: [
							{
								id: 1,
								url: 'https://github.com/advisories/GHSA-8mv7-9c27-98vc',
								title: 'checkOrigin bypass',
								severity: 'high',
							},
						],
					}),
					stderr: '',
					timedOut: false,
				}),
			}),
		);
		const captured = await captureToolRegistration(tool);
		const out = (await captured.invoke({ json: 'bun' })) as Record<
			string,
			unknown
		>;
		expect(out.ok).toBe(true);
		expect(out.findings as unknown[]).toHaveLength(1);
	});

	it('maps npm audit json into normalized findings', async () => {
		const tool = buildSecurityDepsRegistration(
			options({
				listDeps: async () => ({
					manifest: 'package.json',
					found: true,
					counts: {
						dependencies: 1,
						devDependencies: 0,
						peerDependencies: 0,
						optionalDependencies: 0,
					},
					deps: [
						{
							name: 'minimatch',
							range: '^3.0.0',
							section: 'dependencies',
						},
					],
				}),
				auditExec: async () => ({
					code: 1,
					stdout: JSON.stringify({
						vulnerabilities: {
							minimatch: {
								severity: 'critical',
								via: [
									{
										title: 'ReDoS',
										severity: 'critical',
										source: 1,
									},
								],
								fixAvailable: {
									name: 'minimatch',
									version: '3.1.2',
								},
							},
						},
					}),
					stderr: '',
					timedOut: false,
				}),
			}),
		);
		const captured = await captureToolRegistration(tool);
		const out = (await captured.invoke({ json: 'npm' })) as Record<
			string,
			unknown
		>;
		expect(out.ok).toBe(true);
		expect((out.summary as { critical: number }).critical).toBe(1);
	});

	it('returns ok:false with an install hint when the cli is missing', async () => {
		const tool = buildSecurityDepsRegistration(
			options({
				listDeps: async () => ({
					manifest: 'package.json',
					found: true,
					counts: {
						dependencies: 0,
						devDependencies: 0,
						peerDependencies: 0,
						optionalDependencies: 0,
					},
					deps: [],
				}),
				auditExec: async () => {
					throw new Error('Missing required CLI: bun');
				},
			}),
		);
		const captured = await captureToolRegistration(tool);
		const out = (await captured.invoke({
			json: 'bun',
		})) as Record<string, unknown>;
		// The real missing-cli path is asserted by audit.spec.ts; here we pin the tool envelope.
		expect(out.ok).toBe(false);
		expect(out.error).toBe('Missing required CLI: bun');
	});

	it('runs the optional OSV second pass', async () => {
		const tool = buildSecurityDepsRegistration(
			options({
				listDeps: async () => ({
					manifest: 'package.json',
					found: true,
					counts: {
						dependencies: 1,
						devDependencies: 0,
						peerDependencies: 0,
						optionalDependencies: 0,
					},
					deps: [
						{
							name: 'axios',
							range: '^1.7.0',
							section: 'dependencies',
						},
					],
				}),
				auditExec: async () => ({
					code: 0,
					stdout: JSON.stringify({ vulnerabilities: {} }),
					stderr: '',
					timedOut: false,
				}),
				osvFetch: async () => ({
					ok: true,
					status: 200,
					json: async () => ({
						vulns: [
							{
								id: 'OSV-1',
								summary: 'OSV finding',
								database_specific: { severity: 'high' },
							},
						],
					}),
				}),
			}),
		);
		const captured = await captureToolRegistration(tool);
		const out = (await captured.invoke({
			json: 'npm',
			includeOsv: true,
		})) as Record<string, unknown>;
		expect(
			((out.findings as unknown[]) ?? []).length,
		).toBeGreaterThanOrEqual(1);
	});

	it('filters findings to the requested severity only', async () => {
		const tool = buildSecurityDepsRegistration(
			options({
				listDeps: async () => ({
					manifest: 'package.json',
					found: true,
					counts: {
						dependencies: 1,
						devDependencies: 0,
						peerDependencies: 0,
						optionalDependencies: 0,
					},
					deps: [
						{
							name: 'astro',
							range: '^5.0.0',
							section: 'dependencies',
						},
					],
				}),
				auditExec: async () => ({
					code: 1,
					stdout: JSON.stringify({
						astro: [
							{ id: 1, title: 'high one', severity: 'high' },
							{
								id: 2,
								title: 'critical one',
								severity: 'critical',
							},
						],
					}),
					stderr: '',
					timedOut: false,
				}),
			}),
		);
		const captured = await captureToolRegistration(tool);
		const out = (await captured.invoke({
			json: 'bun',
			severity: 'critical',
		})) as Record<string, unknown>;
		const findings = out.findings as Array<{ severity: string }>;
		expect(findings).toHaveLength(1);
		expect(findings[0]?.severity).toBe('critical');
	});

	it('redacts secret-shaped strings before parsing the audit payload', async () => {
		const tool = buildSecurityDepsRegistration(
			options({
				listDeps: async () => ({
					manifest: 'package.json',
					found: true,
					counts: {
						dependencies: 1,
						devDependencies: 0,
						peerDependencies: 0,
						optionalDependencies: 0,
					},
					deps: [
						{
							name: 'astro',
							range: '^5.0.0',
							section: 'dependencies',
						},
					],
				}),
				auditExec: async () => ({
					code: 1,
					stdout: JSON.stringify({
						astro: [
							{
								id: 1,
								title: 'Token ghp_0123456789abcdefghijklmnopqrstuvwxyz leaked in advisory text',
								severity: 'high',
							},
						],
					}),
					stderr: '',
					timedOut: false,
				}),
			}),
		);
		const captured = await captureToolRegistration(tool);
		const out = (await captured.invoke({ json: 'bun' })) as Record<
			string,
			unknown
		>;
		const message =
			(out.findings as Array<{ message: string }>)[0]?.message ?? '';
		expect(message).toContain('[REDACTED]');
		expect(message).not.toContain(
			'ghp_0123456789abcdefghijklmnopqrstuvwxyz',
		);
	});
});
