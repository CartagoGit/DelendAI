import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildScaffoldReport,
	createWorkspacePathProvider,
	scaffoldAgentFile,
	scaffoldHostProject,
	scaffoldSkillFile,
	scaffoldToolFile,
} from '@mcp-vertex/core/public';
import type { IScaffoldToolOptions } from '@mcp-vertex/core/public';

const HOST = {
	projectName: 'Acme Quest',
	namespacePrefix: 'acme',
	serverPackageName: '@acme/mcp-server',
} as const;

describe('scaffold-host generators (p97)', () => {
	it('generates a registerable tool file in the host namespace', () => {
		const file = scaffoldToolFile('acme', 'render stats', 'Stats only.');
		expect(file.path).toBe(
			'libs/mcp-server/src/lib/tools/acme-render-stats.tool.ts'
		);
		expect(file.content).toContain("name: 'acme_render_stats'");
		expect(file.content).toContain(
			'export async function registerRenderStatsTool'
		);
	});

	it('generates skills with canonical frontmatter', () => {
		const file = scaffoldSkillFile('acme', 'level design', 'Rooms.', [
			'Before editing rooms.',
		]);
		expect(file.path).toBe(
			'libs/mcp-server/src/lib/skills/acme-level-design.md'
		);
		expect(file.content).toContain('id: acme-level-design');
		expect(file.content).toContain('- Before editing rooms.');
		expect(file.content).toContain('acme_overview');
	});

	it('agent adapters always delegate to the HOST MCP server', () => {
		const orchestrator = scaffoldAgentFile(HOST, 'orchestrator');
		expect(orchestrator.path).toBe('.github/agents/orchestrator.agent.md');
		expect(orchestrator.content).toContain('mcp-server-acme/*');
		expect(orchestrator.content).toContain('acme_overview');
		expect(orchestrator.content).toContain('user-invocable: true');
		// M9: the proposal-workflow tools are shown as conditional on the
		// plugin, never promised as always-present.
		expect(orchestrator.content).toContain('--plugins=proposals');
		expect(orchestrator.content).not.toContain('acme_check_project_state');
		const runner = scaffoldAgentFile(HOST, 'implementation_runner');
		expect(runner.content).toContain('user-invocable: false');
		expect(runner.content).not.toContain('affairs_');
	});

	it('scaffoldHostProject covers server, config, agents and docs', () => {
		const files = scaffoldHostProject(HOST);
		const paths = files.map((file) => file.path);
		expect(paths).toContain('libs/mcp-server/src/server.ts');
		expect(paths).toContain(
			'libs/mcp-server/src/lib/shared/host-config.ts'
		);
		expect(paths).toContain('.vscode/mcp.json');
		expect(paths).toContain('.github/agents/orchestrator.agent.md');
		expect(paths).toContain('.github/copilot-instructions.md');
		expect(
			paths.filter((path) => path.startsWith('.github/agents/'))
		).toHaveLength(5);
		const config = files.find((file) =>
			file.path.endsWith('host-config.ts')
		);
		expect(config?.content).toContain("namespacePrefix: 'acme'");
		expect(config?.content).toContain('buildScaffoldToolRegistration');
		// The generated project must not leak the Affairs host.
		for (const file of files) {
			expect(file.content, file.path).not.toContain('affairs_');
		}
	});
});

describe('scaffold tool report (p97)', () => {
	let root = '';
	let options: IScaffoldToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'mcp-core-scaffold-'));
		options = {
			...HOST,
			workspace: createWorkspacePathProvider(root),
		};
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('dry-run returns the files without touching the disk', async () => {
		const report = await buildScaffoldReport(options, {
			kind: 'host',
			dryRun: true,
		});
		expect(report.files.length).toBeGreaterThan(5);
		expect(report.written).toEqual([]);
		expect(existsSync(join(root, 'libs'))).toBe(false);
	});

	it('write mode creates files once and refuses overwrites', async () => {
		const first = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Combat rules.',
			dryRun: false,
		});
		expect(first.written).toEqual([
			'libs/mcp-server/src/lib/skills/acme-combat.md',
		]);
		expect(
			readFileSync(
				join(root, 'libs/mcp-server/src/lib/skills/acme-combat.md'),
				'utf8'
			)
		).toContain('id: acme-combat');
		const second = await buildScaffoldReport(options, {
			kind: 'skill',
			name: 'combat',
			description: 'Combat rules.',
			dryRun: false,
		});
		expect(second.written).toEqual([]);
		expect(second.skipped).toEqual([
			'libs/mcp-server/src/lib/skills/acme-combat.md',
		]);
	});

	it('reports input errors instead of writing partial artefacts', async () => {
		const report = await buildScaffoldReport(options, {
			kind: 'tool',
			dryRun: false,
		});
		expect(report.errors[0]).toContain('requires name');
		expect(report.written).toEqual([]);
	});

	it('scaffolds a plugin and an MCP client', async () => {
		const plugin = await buildScaffoldReport(options, {
			kind: 'plugin',
			name: 'pepegrillo',
			description: 'Conscience plugin.',
			dryRun: true,
		});
		expect(plugin.files.map((f) => f.path)).toContain(
			'plugins/pepegrillo/src/index.ts'
		);
		const client = await buildScaffoldReport(options, {
			kind: 'client',
			name: 'acme',
			description: 'Acme MCP client.',
			dryRun: true,
		});
		expect(client.files.map((f) => f.path)).toContain(
			'clients/acme/src/index.ts'
		);
		const entry = client.files.find((f) =>
			f.path.endsWith('clients/acme/src/index.ts')
		);
		expect(entry?.content).toContain('createAcmeClient');
	});
});
