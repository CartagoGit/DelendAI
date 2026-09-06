import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
	ICliCommand,
	ICliCommandContext,
	ICliToolDescriptor,
} from '../contracts/interfaces/cli-command.interface';
import type { IDoctorFs } from '../lib/doctor/types';
import {
	doctorCommands,
	renderDoctorSummary,
	runDoctorBody,
	type IDoctorCommandCheck,
	type IDoctorCommandCheckContext,
} from './doctor';
import { checkBranchProtection } from './doctor-checks/branch-protection';
import { checkCiStatus } from './doctor-checks/ci-status';
import { checkConfig } from './doctor-checks/config';
import { checkDeps } from './doctor-checks/deps';
import {
	createGitStatusCheck,
	type IGitStatusProbe,
} from './doctor-checks/git-status';
import { checkManifests } from './doctor-checks/manifests';
import { checkHostServerHandshake } from './doctor-checks/host-server-handshake';
import { checkPermissions } from './doctor-checks/permissions';
import { checkPluginGraph } from './doctor-checks/plugin-graph';
import { checkPorts } from './doctor-checks/ports';
import { checkRuntime } from './doctor-checks/runtime';
import { checkSchemas } from './doctor-checks/schemas';
import {
	createStaleDocsCheck,
	type IStaleDocsProbe,
} from './doctor-checks/stale-docs';
import { checkTokenBudgets } from './doctor-checks/token-budgets';

const buildFs = (files: Record<string, string>): IDoctorFs => ({
	fileExists: async (relPath) => Object.hasOwn(files, relPath),
	readFile: async (relPath) => files[relPath],
	listDirs: async (relPath) => {
		const prefix = relPath.length === 0 ? '' : `${relPath}/`;
		const entries = new Set<string>();
		for (const filePath of Object.keys(files)) {
			if (!filePath.startsWith(prefix)) continue;
			const next = filePath.slice(prefix.length).split('/')[0];
			if (next !== undefined && next.length > 0) entries.add(next);
		}
		return [...entries];
	},
});

const buildCliContext = (
	options: {
		json?: boolean;
		request?: ICliCommandContext['request'];
		listTools?: () => Promise<readonly ICliToolDescriptor[]>;
	} = {},
): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json: options.json ?? false,
		format: options.json ? 'json' : 'text',
		lang: 'en',
		noColor: false,
		plugins: [],
	},
	request: options.request ?? (async <TOut>() => ({}) as TOut),
	listTools:
		options.listTools ??
		(async () => [
			{ name: 'delendai_overview' },
			{ name: 'delendai_status' },
		]),
	close: async () => {},
});

const buildDoctorContext = (
	files: Record<string, string>,
	overrides: Partial<IDoctorCommandCheckContext> = {},
): IDoctorCommandCheckContext => ({
	cli: overrides.cli ?? buildCliContext(),
	workspace: '/workspace',
	fs: overrides.fs ?? buildFs(files),
	now: overrides.now ?? (() => new Date('2026-08-30T00:00:00.000Z')),
});

const findCommand = (name: string): ICliCommand => {
	const command = doctorCommands.find((candidate) => candidate.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('doctor command', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('returns exit 0 when every check is healthy', async () => {
		const ctx = buildCliContext();
		const checks: readonly IDoctorCommandCheck[] = [
			async () => ({ name: 'config', status: 'ok', findings: ['ok'] }),
			async () => ({ name: 'runtime', status: 'ok', findings: ['ok'] }),
		];
		const result = await runDoctorBody(ctx, { checks });
		expect(result.code).toBe(0);
		expect(result.data).toMatchObject({ status: 'ok' });
	});

	it('returns exit 2 when only warnings are present', async () => {
		const result = await runDoctorBody(buildCliContext(), {
			checks: [
				async () => ({
					name: 'git-status',
					status: 'warn',
					findings: ['dirty tree'],
				}),
			],
		});
		expect(result.code).toBe(2);
		expect(result.data).toMatchObject({ status: 'warn' });
	});

	it('returns exit 1 when a P0 finding exists', async () => {
		const result = await runDoctorBody(buildCliContext(), {
			checks: [
				async () => ({
					name: 'mcp-handshake',
					status: 'error',
					findings: ['handshake failed'],
				}),
			],
		});
		expect(result.code).toBe(1);
		expect(result.data).toMatchObject({ status: 'error' });
	});

	it('prints a human summary to stderr outside json mode', async () => {
		const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		await findCommand('doctor').run([], buildCliContext());
		expect(spy).toHaveBeenCalled();
	});

	it('keeps stderr quiet in json mode', async () => {
		const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		await findCommand('doctor').run([], buildCliContext({ json: true }));
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('renderDoctorSummary', () => {
	it('renders score buckets and sections', () => {
		const text = renderDoctorSummary(
			'warn',
			[
				{ name: 'config', status: 'ok', findings: ['parseable'] },
				{
					name: 'git-status',
					status: 'warn',
					findings: ['dirty tree'],
				},
			],
			{ value: 90, p0: [], p1: ['git-status: dirty tree'], p2: [] },
		);
		expect(text).toContain('Health: 90/100');
		expect(text).toContain('P1 (should fix):');
		expect(text).toContain('git-status (warn)');
	});
});

describe('doctor checks', () => {
	it('config: validates parseable config JSON', async () => {
		const result = await checkConfig(
			buildDoctorContext({ 'delendai.config.json': '{"plugins":{}}' }),
		);
		expect(result).toMatchObject({ name: 'config', status: 'ok' });
	});

	it('manifests: flags missing plugin manifests', async () => {
		const result = await checkManifests(
			buildDoctorContext({
				'plugins/a/plugin.manifest.ts':
					'definePluginManifest({ id: "a" })',
				'plugins/b/package.json': '{}',
			}),
		);
		expect(result.status).toBe('warn');
		expect(result.findings.join('\n')).toContain(
			'missing plugin.manifest.ts',
		);
	});

	it('plugin-graph: detects local cycles', async () => {
		const result = await checkPluginGraph(
			buildDoctorContext({
				'plugins/a/package.json': JSON.stringify({
					dependencies: { '@delendai/b': 'workspace:*' },
				}),
				'plugins/b/package.json': JSON.stringify({
					dependencies: { '@delendai/a': 'workspace:*' },
				}),
			}),
		);
		expect(result.status).toBe('warn');
		expect(result.findings.join('\n')).toContain('cycle(s) detected');
	});

	it('deps: reports bun.lock presence', async () => {
		const result = await checkDeps(
			buildDoctorContext({ 'bun.lock': 'lock' }),
		);
		expect(result).toMatchObject({ name: 'deps', status: 'ok' });
	});

	it('token-budgets: parses baseline snapshots', async () => {
		const result = await checkTokenBudgets(
			buildDoctorContext({
				'config/metrics-baseline.json': '{"ok":true}',
			}),
		);
		expect(result).toMatchObject({ name: 'token-budgets', status: 'ok' });
	});

	it('branch-protection: validates local branch policy contract', async () => {
		const result = await checkBranchProtection(
			buildDoctorContext({
				'.github/branch-protection.ts': `export const BRANCH_PROTECTION = { branches: [
					{ name: 'develop', protected: false, required_checks: [] },
					{ name: 'main', protected: true, required_checks: ['ci-complete'] },
				] };`,
			}),
		);
		expect(result).toMatchObject({
			name: 'branch-protection',
			status: 'ok',
		});
	});

	it('git-status: preserves warn-only semantics for dirty trees', async () => {
		const probe: IGitStatusProbe = { status: async () => 'dirty' };
		const result = await createGitStatusCheck(probe)(
			buildDoctorContext({}),
		);
		expect(result).toMatchObject({ name: 'git-status', status: 'warn' });
	});

	it('runtime: validates the Bun floor from package.json', async () => {
		vi.stubGlobal('Bun', { version: '1.3.0' });
		const result = await checkRuntime(
			buildDoctorContext({
				'package.json': '{"engines":{"bun":">=0.1.0"}}',
			}),
		);
		expect(result).toMatchObject({ name: 'runtime', status: 'ok' });
	});

	it('host-server-handshake: succeeds when the local transport answers overview', async () => {
		const result = await checkHostServerHandshake(
			buildDoctorContext(
				{},
				{
					cli: buildCliContext({
						request: async <TOut>() =>
							({ tools: ['a', 'b'] }) as TOut,
						listTools: async () => [{ name: 'a' }, { name: 'b' }],
					}),
				},
			),
		);
		expect(result).toMatchObject({ name: 'mcp-handshake', status: 'ok' });
	});

	it('stale-docs: reports drifted generated artifacts', async () => {
		const probe: IStaleDocsProbe = {
			staleFiles: async () => [
				'docs/delendai/generated/plugin-manifests.generated.md',
			],
		};
		const result = await createStaleDocsCheck(probe)(
			buildDoctorContext({}),
		);
		expect(result).toMatchObject({ name: 'stale-docs', status: 'warn' });
	});

	it('schemas: sees plugin schema files', async () => {
		const result = await checkSchemas(
			buildDoctorContext({
				'plugins/a/src/output.schema.ts': 'export {};',
			}),
		);
		expect(result).toMatchObject({ name: 'schemas', status: 'ok' });
	});

	it('ports: stays side-effect free', async () => {
		const result = await checkPorts(buildDoctorContext({}));
		expect(result).toMatchObject({ name: 'ports', status: 'ok' });
	});

	it('permissions: accepts known manifest permissions', async () => {
		const result = await checkPermissions(
			buildDoctorContext({
				'plugins/a/plugin.manifest.ts': `export default definePluginManifest({
					id: 'a',
					permissions: ['filesystem-read', 'github'],
				});`,
			}),
		);
		expect(result).toMatchObject({ name: 'permissions', status: 'ok' });
	});

	it('ci-status: verifies core workflow definitions and local CI artifacts', async () => {
		const result = await checkCiStatus(
			buildDoctorContext({
				'.github/workflows/ci.yml': 'name: ci',
				'.github/workflows/quality-gate.yml': 'name: quality-gate',
				'ci/affected.json': '{}',
			}),
		);
		expect(result).toMatchObject({ name: 'ci-status', status: 'ok' });
	});
});
