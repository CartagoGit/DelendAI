import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import {
	registerAdoptionExtensions,
	resetAdoptionExtensionsForTests,
} from '@delendai/core/lib/adopt/adoption-extension-registry';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import { createWorkspaceFileReader } from '@delendai/core/lib/bootstrap/workspace-file-reader';
import { buildAdoptProjectToolRegistration } from '@delendai/core/lib/adopt/adopt-project.tool';
import { buildProposalsAdoptionExtension } from '@delendai/proposals/lib/adoption/proposals-adoption-extension';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('adopt_project (f00157 S1)', () => {
	let root = '';
	let adopt: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;

	beforeEach(async () => {
		resetAdoptionExtensionsForTests();
		root = mkdtempSync(join(tmpdir(), 'adopt-project-'));
		const workspace = createWorkspacePathProvider(root);
		adopt = await capture(
			buildAdoptProjectToolRegistration({
				namespacePrefix: 'mcp-vertex',
				workspace,
				corePaths: {
					cacheDir: '.cache/mcp-vertex',
					docsDir: 'docs/mcp-vertex',
				},
				reader: createWorkspaceFileReader(workspace),
			}),
		);
	});
	afterEach(() => {
		resetAdoptionExtensionsForTests();
		rmSync(root, { recursive: true, force: true });
	});

	it('dry-run by default: returns the plan without writing anything', async () => {
		const result = parse(await adopt({}));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(false);
		expect(result.preset).toBeDefined();
		expect(result.config.plugins).toBeDefined();
		expect(result.rationale.length).toBeGreaterThan(0);
		expect(Array.isArray(result.residual)).toBe(true);
		expect(existsSync(join(root, 'mcp-vertex.config.json'))).toBe(false);
	});

	it('analyze:true returns a read-only adoption assessment without writing', async () => {
		const result = parse(await adopt({ analyze: true }));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(false);
		expect(result.assessment).toBeDefined();
		expect(result.assessment.cost.schemaBytes).toBeGreaterThan(0);
		expect(Array.isArray(result.assessment.pluginRecommendations)).toBe(
			true,
		);
		expect(existsSync(join(root, 'mcp-vertex.config.json'))).toBe(false);
	});

	it('write:true without extensions persists config and agent files only', async () => {
		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(true);
		// config
		const written = JSON.parse(
			await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
		);
		expect(written.plugins).toBeDefined();
		// orchestrator + subagents in every host format
		expect(result.created).toContain(
			'.github/agents/orchestrator.agent.md',
		);
		expect(result.created).toContain(
			'.claude/agents/implementation-runner.md',
		);
		expect(result.created).toContain('.codex/agents/proposal-guardian.md');
		expect(result.created).toContain('.github/copilot-instructions.md');
		expect(
			result.created.filter(
				(p: string) =>
					p.startsWith('docs/mcp-vertex/proposals/') &&
					p.endsWith('.gitkeep'),
			),
		).toHaveLength(0);
	});

	it('write:true with the proposals extension persists the proposals store too', async () => {
		registerAdoptionExtensions('proposals', [
			buildProposalsAdoptionExtension(),
		]);
		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(true);
		expect(result.created).toContain('docs/mcp-vertex/proposals/README.md');
		expect(result.created).toContain(
			'docs/mcp-vertex/proposals/ready/.gitkeep',
		);
		expect(result.created).toContain(
			'docs/mcp-vertex/proposals/retired/.gitkeep',
		);
		expect(
			result.created.filter(
				(p: string) =>
					p.startsWith('docs/mcp-vertex/proposals/') &&
					p.endsWith('.gitkeep'),
			),
		).toHaveLength(7);
	});

	it('never overwrites project-owned files: existing config is merged, existing files skipped', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			JSON.stringify({
				cacheDir: '.project-cache',
				plugins: { search: { options: { roots: ['app'] } } },
			}),
			'utf8',
		);
		mkdirSync(join(root, '.github'), { recursive: true });
		writeFileSync(
			join(root, '.github/copilot-instructions.md'),
			'# project-owned instructions',
			'utf8',
		);
		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(true);
		// project config wins
		expect(result.config.cacheDir).toBe('.project-cache');
		expect(result.config.plugins.search.options.roots).toEqual(['app']);
		// project instructions win
		expect(result.skipped).toContain('.github/copilot-instructions.md');
		const kept = await readFile(
			join(root, '.github/copilot-instructions.md'),
			'utf8',
		);
		expect(kept).toBe('# project-owned instructions');
	});

	it('overwrite:true replaces an existing config', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			'{"plugins":{}}',
			'utf8',
		);
		const result = parse(await adopt({ write: true, overwrite: true }));
		expect(result.ok).toBe(true);
		const written = JSON.parse(
			await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
		);
		expect(Object.keys(written.plugins).length).toBeGreaterThan(0);
	});

	it('repo wiring stays generic when no plugin-owned adoption extension is loaded', async () => {
		const result = parse(await adopt({ repo: 'acme/widgets' }));
		expect(result.ok).toBe(true);
		expect(result.config.plugins.issues).toBeUndefined();
		expect(result.config.plugins.proposals).toBeUndefined();
		const launch = result.residual.find((r: string) =>
			r.includes('__serve'),
		);
		expect(launch).not.toContain('--preset full');
		expect(
			result.residual.find((r: string) =>
				r.includes('GitHub repo provided (acme/widgets)'),
			),
		).toBeDefined();
	});

	it('repo wiring keeps proposals + issues behavior when the proposals extension is loaded', async () => {
		registerAdoptionExtensions('proposals', [
			buildProposalsAdoptionExtension(),
		]);
		const result = parse(
			await adopt({ repo: 'acme/widgets', stage: 'specialized' }),
		);
		expect(result.ok).toBe(true);
		expect(result.config.plugins.issues.options.repo).toBe('acme/widgets');
		expect(result.config.plugins.proposals).toBeDefined();
		const launch = result.residual.find((r: string) =>
			r.includes('__serve'),
		);
		expect(launch).toContain('--preset full');
	});

	it('detects an existing MCP server key and emits agents against that server', async () => {
		mkdirSync(join(root, '.vscode'), { recursive: true });
		writeFileSync(
			join(root, '.vscode/mcp.json'),
			JSON.stringify({
				servers: {
					'acme-tools': {
						command: 'bunx',
						args: [
							'--package',
							'@delendai/cli',
							'mcpv',
							'__serve',
						],
					},
				},
			}),
			'utf8',
		);

		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(true);
		const orchestrator = await readFile(
			join(root, '.github/agents/orchestrator.agent.md'),
			'utf8',
		);
		const instructions = await readFile(
			join(root, '.github/copilot-instructions.md'),
			'utf8',
		);

		expect(orchestrator).toContain(
			'tools: [read, search, edit, execute, todo, agent, acme-tools/*]',
		);
		expect(orchestrator).toContain(
			'tool: `acme-tools/mcp-vertex_overview`',
		);
		expect(instructions).toContain('The MCP server `acme-tools` rules.');
	});

	it('refuses to merge a malformed existing config', async () => {
		writeFileSync(join(root, 'mcp-vertex.config.json'), '{nope', 'utf8');
		const result = parse(await adopt({ write: true }));
		expect(result.ok).toBe(false);
		expect(result.error.reason).toContain('not valid JSON');
	});
});
