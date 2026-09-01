/**
 * diagnose-workspace-layout.spec.ts — f00109 S1.
 *
 * The dead-config detector: a config file copied from another repo
 * (docsDir + plugin `options.roots` pointing at paths that do not exist
 * here) must produce human-readable issues; a clean or absent config
 * must produce none. The end-to-end wiring (doctor + overview
 * `configIssues` + recommendedNextAction) is covered on top of
 * `assembleCliConfig` with an injected `exists` probe.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { diagnoseWorkspaceLayout } from '@mcp-vertex/core/lib/plugins/diagnose-workspace-layout';
import type { WorkspacePathStatus } from '@mcp-vertex/core/lib/contracts/interfaces/workspace-layout.interface';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const probeOf =
	(existing: readonly string[]) =>
	(relPath: string): WorkspacePathStatus =>
		existing.includes(relPath) ? 'exists' : 'missing';

describe('diagnoseWorkspaceLayout (f00109 S1)', () => {
	it('is silent when no config file is present (fresh-project default)', () => {
		expect(
			diagnoseWorkspaceLayout({
				config: {},
				configPresent: false,
				docsDir: 'docs/mcp-vertex',
				probe: probeOf([]),
			}),
		).toEqual([]);
	});

	it('is silent when docsDir and every configured root exist', () => {
		expect(
			diagnoseWorkspaceLayout({
				config: {
					plugins: {
						search: { options: { roots: ['src', 'docs'] } },
					},
				},
				configPresent: true,
				docsDir: 'docs/mcp-vertex',
				probe: probeOf(['docs/mcp-vertex', 'src', 'docs']),
			}),
		).toEqual([]);
	});

	it('reports a missing docsDir and each missing options.roots entry', () => {
		const issues = diagnoseWorkspaceLayout({
			config: {
				plugins: {
					search: { options: { roots: ['packages', 'src'] } },
					docs: { options: { roots: ['docs/other', 'README.md'] } },
					// No roots option → never probed.
					memory: { options: { maxNotes: 5 } },
				},
			},
			configPresent: true,
			docsDir: 'docs/mcp-vertex',
			probe: probeOf(['src', 'README.md']),
		});
		expect(issues).toHaveLength(3);
		expect(issues[0]).toMatch(/docsDir: "docs\/mcp-vertex" does not exist/);
		expect(
			issues.some((issue) =>
				/plugins\.search\.options\.roots: "packages"/.test(issue),
			),
		).toBe(true);
		expect(
			issues.some((issue) =>
				/plugins\.docs\.options\.roots: "docs\/other"/.test(issue),
			),
		).toBe(true);
	});

	it('reports an escaping path as such and skips non-string roots', () => {
		const issues = diagnoseWorkspaceLayout({
			config: {
				plugins: {
					search: { options: { roots: ['../outside', 42, ''] } },
				},
			},
			configPresent: true,
			docsDir: 'docs',
			probe: (relPath) =>
				relPath.startsWith('..') ? 'escapes' : 'exists',
		});
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatch(/"\.\.\/outside" escapes the workspace root/);
	});
});

describe('assembleCliConfig — dead-config surfacing (f00109 S1)', () => {
	const WRITABLE_WORKSPACE = createTestWorkspace('mcp-vertex-diagnose-');
	afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));
	const args = () =>
		parseCliArgs(
			[`--workspace=${WRITABLE_WORKSPACE}`, '--surface=native'],
			WRITABLE_WORKSPACE,
		);
	const deadConfig = JSON.stringify({
		docsDir: 'docs/mcp-vertex',
		plugins: { search: { options: { roots: ['packages'] } } },
	});
	// Serve the config file only for the config path — every other read
	// (proposals index, skill bodies) behaves as "file not found".
	const configOnlyReader = async (
		absolutePath: string,
	): Promise<string | undefined> =>
		absolutePath.endsWith('mcp-vertex.config.json')
			? deadConfig
			: undefined;

	it('folds layout issues into configDiagnostic and the compact overview', async () => {
		const { configDiagnostic, config } = await assembleCliConfig(args(), {
			readFile: configOnlyReader,
			import: async () => {
				throw new Error('no plugins in this test');
			},
			exists: () => false,
		});
		expect(
			configDiagnostic.issues.some((issue) =>
				/docsDir: "docs\/mcp-vertex" does not exist/.test(issue),
			),
		).toBe(true);
		expect(
			configDiagnostic.issues.some((issue) =>
				/plugins\.search\.options\.roots: "packages"/.test(issue),
			),
		).toBe(true);

		// The same issues reach the agent's first orientation call, and the
		// recommended next action routes to fixing the config, not auto_work.
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const client = new Client(
			{ name: 'dead-config-test', version: '0.0.0' },
			{ capabilities: {} },
		);
		await client.connect(clientTransport);
		try {
			const res = await client.callTool({
				name: 'mcp-vertex_overview',
				arguments: { compact: true },
			});
			const overview = res.structuredContent as {
				readonly configIssues?: readonly string[];
				readonly recommendedNextAction?: string;
			};
			expect(
				(overview.configIssues ?? []).some((issue) =>
					/docsDir/.test(issue),
				),
			).toBe(true);
			expect(overview.recommendedNextAction).toMatch(/Config mismatch/);
			expect(overview.recommendedNextAction).not.toMatch(/auto_work/);
		} finally {
			await client.close();
			await assembled.server.close();
		}
	});

	it('keeps a clean workspace clean (no issues, normal next action)', async () => {
		const { configDiagnostic } = await assembleCliConfig(args(), {
			readFile: configOnlyReader,
			import: async () => {
				throw new Error('no plugins in this test');
			},
			exists: () => true,
		});
		expect(configDiagnostic.issues).toEqual([]);
	});

	it('does not probe at all when no config file exists', async () => {
		let probed = 0;
		const { configDiagnostic } = await assembleCliConfig(args(), {
			readFile: async () => undefined,
			import: async () => {
				throw new Error('no plugins in this test');
			},
			exists: () => {
				probed += 1;
				return false;
			},
		});
		expect(configDiagnostic.issues).toEqual([]);
		expect(probed).toBe(0);
	});
});
