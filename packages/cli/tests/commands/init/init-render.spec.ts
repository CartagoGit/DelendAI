/**
 * f00084 S2 — `renderInitBundle` and writers acceptance spec.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	writeFile as fsWriteFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MockInstance } from 'vitest';
import { vi } from 'vitest';

import { initCommand } from '../../../src/commands/init/init.command';
import {
	InitAnswers,
	type IInitAnswers,
} from '../../../src/commands/init/init-answers.schema';
import { computeHostInstructionsWrite } from '../../../src/commands/init/init-host-instructions';
import {
	deriveScope,
	renderMigrationProposal,
} from '../../../src/commands/init/init-migrate-offer';
import {
	renderInitBundle,
	resolvePluginSet,
} from '../../../src/commands/init/init-render';
import { writeMcpVertexConfig } from '../../../src/commands/init/init-writers';

const parseAnswers = (
	partial: Partial<IInitAnswers> = {},
	workspaceRoot = '/tmp',
): IInitAnswers => InitAnswers.parse({ workspaceRoot, ...partial });

describe('renderInitBundle (f00084 S2-S5)', () => {
	it('produces config + .vscode/mcp.json + .agent.md + host-instructions + migration proposal for swarm', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'swarm' }, '/tmp/example-ws'),
		);
		const rels = bundle.files.map((f) => f.relPath);
		expect(rels).toContain('mcp-vertex.config.json');
		expect(rels).toContain('.vscode/mcp.json');
		expect(rels.some((r) => r.startsWith('.github/agents/'))).toBe(true);
		expect(rels).toContain('AGENTS.md');
		expect(rels).toContain('CLAUDE.md');
		expect(rels).toContain('.github/copilot-instructions.md');
		expect(rels.some((r) => r.includes('f00001-migrate-legacy'))).toBe(
			true,
		);
	});

	it('skips .agent.md when generateAgentMd=false', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ generateAgentMd: false }),
		);
		expect(
			bundle.files.some((f) => f.relPath.startsWith('.github/agents/')),
		).toBe(false);
	});

	it('skips host-instructions blocks when hostInstructions=skip', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ hostInstructions: 'skip' }),
		);
		expect(bundle.files.some((f) => f.relPath === 'AGENTS.md')).toBe(false);
		expect(bundle.files.some((f) => f.relPath === 'CLAUDE.md')).toBe(false);
		expect(
			bundle.files.some(
				(f) => f.relPath === '.github/copilot-instructions.md',
			),
		).toBe(false);
	});

	it('skips migration proposal when migrateFromLegacy=false', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ migrateFromLegacy: false }),
		);
		expect(
			bundle.files.some((r) =>
				r.relPath.includes('f00001-migrate-legacy'),
			),
		).toBe(false);
	});

	it('resolves swarm plugin set with audit added and issues excluded', () => {
		const resolved = resolvePluginSet(
			parseAnswers({
				preset: 'swarm',
				extraPlugins: ['audit'],
				excludedPlugins: ['issues'],
			}),
		);
		expect(resolved).toContain('proposals');
		expect(resolved).toContain('audit');
		expect(resolved).not.toContain('issues');
	});

	it('emits a valid JSON config payload', async () => {
		const bundle = await renderInitBundle(parseAnswers({}));
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		expect(configFile).toBeDefined();
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: Record<string, { options: Record<string, unknown> }>;
		};
		expect(parsed.plugins.proposals).toBeDefined();
		expect(parsed.plugins.git).toBeDefined();
	});
});

describe('initCommand extraOptions (f00084 S8)', () => {
	let workspace: string;
	let stderrWrite: MockInstance<typeof process.stderr.write>;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'mcpv-init-command-'));
		stderrWrite = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		process.stdin.isTTY = false;
	});

	afterEach(async () => {
		stderrWrite.mockRestore();
		await rm(workspace, { recursive: true, force: true });
	});

	it('merges CLI plugin option overrides on top of rendered defaults before writing', async () => {
		const result = await initCommand.run(
			[
				'--mcp-vertex-root=/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/host/host-server.script.ts',
			],
			{
			cwd: workspace,
			globals: {
				workspace,
				remote: undefined,
				json: false,
				format: 'text',
				lang: 'en',
				noColor: false,
				plugins: [],
				extraOptions: {
					memory: { maxNotes: '500' },
					proposals: { proposalDir: 'docs/proposals/custom' },
				},
			},
			request: async () => {
				throw new Error('not used');
			},
			listTools: async () => [],
			close: async () => {},
			},
		);

		expect(result.code).toBe(0);
		const onDisk = await readFile(
			join(workspace, 'mcp-vertex.config.json'),
			'utf8',
		);
		const parsed = JSON.parse(onDisk) as {
			plugins: {
				memory?: { options: { maxNotes?: string } };
				proposals?: { options: { proposalDir?: string } };
			};
		};
		expect(parsed.plugins.memory?.options.maxNotes).toBe('500');
		expect(parsed.plugins.proposals?.options.proposalDir).toBe(
			'docs/proposals/custom',
		);
	});

	it('warns and skips when a CLI override targets a plugin outside the resolved set', async () => {
		const result = await initCommand.run(
			[
				'--mcp-vertex-root=/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/host/host-server.script.ts',
			],
			{
				cwd: workspace,
				globals: {
					workspace,
					remote: undefined,
					json: false,
					format: 'text',
					lang: 'en',
					noColor: false,
					plugins: [],
					extraOptions: {
						memory: { maxNotes: '500' },
						audit: { auditDir: 'docs/audits' },
						'web-fetch': { userAgent: 'custom' },
					},
				},
				request: async () => {
					throw new Error('not used');
				},
				listTools: async () => [],
				close: async () => {},
			},
		);

		expect(result.code).toBe(0);
		expect(stderrWrite).toHaveBeenCalledWith(
			'warning: init override ignored for unresolved plugin "audit"\n',
		);
		expect(stderrWrite).toHaveBeenCalledWith(
			'warning: init override ignored for unresolved plugin "web-fetch"\n',
		);
		const onDisk = await readFile(
			join(workspace, 'mcp-vertex.config.json'),
			'utf8',
		);
		const parsed = JSON.parse(onDisk) as {
			plugins: Record<string, { options: Record<string, unknown> }>;
		};
		expect(parsed.plugins.memory?.options.maxNotes).toBe('500');
		expect(parsed.plugins.audit).toBeUndefined();
		expect(parsed.plugins['web-fetch']).toBeUndefined();
	});
});

describe('writeMcpVertexConfig (f00084 S2)', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'mcpv-init-writer-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('writes a fresh config in an empty workspace', async () => {
		const result = await writeMcpVertexConfig(
			workspace,
			{ plugins: { git: { options: {} } } },
			false,
		);
		expect(result.kind).toBe('written');
		const onDisk = await readFile(
			`${workspace}/mcp-vertex.config.json`,
			'utf8',
		);
		const parsed = JSON.parse(onDisk) as {
			plugins: { git: { options: object } };
		};
		expect(parsed.plugins.git).toEqual({ options: {} });
	});

	it('refuses to overwrite without --force', async () => {
		await writeMcpVertexConfig(workspace, { plugins: {} }, false);
		const second = await writeMcpVertexConfig(
			workspace,
			{ plugins: { proposals: { options: {} } } },
			false,
		);
		expect(second.kind).toBe('exists');
		const onDisk = await readFile(
			`${workspace}/mcp-vertex.config.json`,
			'utf8',
		);
		const parsed = JSON.parse(onDisk) as {
			plugins: Record<string, unknown>;
		};
		expect(parsed.plugins.proposals).toBeUndefined();
	});

	it('overwrites with --force', async () => {
		await writeMcpVertexConfig(workspace, { plugins: {} }, false);
		const second = await writeMcpVertexConfig(
			workspace,
			{ plugins: { proposals: { options: {} } } },
			true,
		);
		expect(second.kind).toBe('written');
		const onDisk = await readFile(
			`${workspace}/mcp-vertex.config.json`,
			'utf8',
		);
		const parsed = JSON.parse(onDisk) as {
			plugins: Record<string, unknown>;
		};
		expect(parsed.plugins.proposals).toBeDefined();
	});
});

describe('computeHostInstructionsWrite (f00084 S4)', () => {
	const BEGIN = '<!-- mcp-vertex:begin -->';
	const END = '<!-- mcp-vertex:end -->';

	it('returns the block when current is undefined', () => {
		const next = computeHostInstructionsWrite(undefined, 'hello', 'append');
		expect(next).toContain(BEGIN);
		expect(next).toContain('hello');
		expect(next).toContain(END);
	});

	it('replaces the block in place when markers are present', () => {
		const current = `# Title\n\n${BEGIN}\nold\n${END}\n\n# Footer\n`;
		const next = computeHostInstructionsWrite(current, 'new', 'append');
		expect(next).toContain('# Title');
		expect(next).toContain('# Footer');
		expect(next).toContain('new');
		expect(next).not.toContain('old');
	});

	it('appends when markers are absent', () => {
		const current = '# Existing\n';
		const next = computeHostInstructionsWrite(current, 'hello', 'append');
		expect(next?.startsWith('# Existing')).toBe(true);
		expect(next).toContain('hello');
	});

	it('is idempotent: a second call with the previous output produces the same bytes', () => {
		const first = computeHostInstructionsWrite(
			undefined,
			'first body',
			'append',
		);
		expect(first).toBeDefined();
		const second = computeHostInstructionsWrite(
			first,
			'first body',
			'append',
		);
		expect(second).toBe(first);
	});

	it('replaces the whole file in overwrite mode', () => {
		const current = '# Existing\n';
		const next = computeHostInstructionsWrite(
			current,
			'fresh',
			'overwrite',
		);
		expect(next?.startsWith(BEGIN)).toBe(true);
		expect(next).toContain('fresh');
		expect(next).not.toContain('# Existing');
	});

	it('returns undefined in skip mode', () => {
		expect(
			computeHostInstructionsWrite('# x', 'body', 'skip'),
		).toBeUndefined();
	});
});

describe('renderMigrationProposal (f00084 S5)', () => {
	it('produces a valid frontmatter for the workspace scope', () => {
		const out = renderMigrationProposal(
			parseAnswers({ workspaceRoot: '/tmp/azur-lx' }),
		);
		expect(out.relPath).toContain('f00001-migrate-legacy-azur-lx');
		expect(out.content).toMatch(/^---\nid: f00001/m);
		expect(out.content).toMatch(/kind: feat/);
		expect(out.content).toContain('mcp-vertex');
	});

	it('derives a slugified scope from the workspace basename', () => {
		expect(deriveScope('/tmp/AZUR LX--develop')).toMatch(
			/^azur-lx-develop/,
		);
		expect(deriveScope('/tmp/_weird_ name!')).toMatch(/^weird-name/);
	});
});

describe('renderInitBundle end-to-end (f00084 S6)', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'mcpv-init-e2e-'));
		await mkdir(`${workspace}/.github/agents`, { recursive: true });
		await mkdir(`${workspace}/docs/mcp-vertex/proposals/ready`, {
			recursive: true,
		});
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('produces a self-consistent bundle and a second render is byte-identical (idempotent append)', async () => {
		const answers = parseAnswers({ preset: 'swarm' }, workspace);
		const first = await renderInitBundle(answers);

		for (const file of first.files) {
			const target = `${workspace}/${file.relPath}`;
			await mkdir(join(target, '..'), { recursive: true });
			await fsWriteFile(target, file.content, 'utf8');
		}

		const second = await renderInitBundle(answers);
		for (const file of second.files) {
			if (file.relPath === 'mcp-vertex.config.json') continue;
			const onDisk = await readFile(
				`${workspace}/${file.relPath}`,
				'utf8',
			);
			expect(onDisk).toBe(file.content);
		}
	});
});

describe('plugin defaults (f00087 S1 preview)', () => {
	it('audit initialises with auditDir and topActions', async () => {
		const bundle = await renderInitBundle(
			parseAnswers(
				{
					preset: 'swarm',
					extraPlugins: ['audit'],
				},
				'/tmp/defaults-test',
			),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: {
				audit: { options: { auditDir?: string; topActions?: number } };
			};
		};
		expect(parsed.plugins.audit.options.auditDir).toBe(
			'docs/proposals/done/audits',
		);
		expect(parsed.plugins.audit.options.topActions).toBe(5);
	});

	it('memory initialises with bm25 defaults', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'swarm' }),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: {
				memory: { options: { bm25K1?: number; bm25B?: number } };
			};
		};
		expect(parsed.plugins.memory.options.bm25K1).toBe(1.5);
		expect(parsed.plugins.memory.options.bm25B).toBe(0.75);
	});

	it('search initialises with sensible roots and extensions', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'swarm' }),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: {
				search: {
					options: { roots?: string[]; extensions?: string[] };
				};
			};
		};
		expect(parsed.plugins.search.options.roots).toContain('packages');
		expect(parsed.plugins.search.options.extensions).toContain('.ts');
	});

	it('web-fetch is empty by default (fail closed)', async () => {
		const bundle = await renderInitBundle(parseAnswers({ preset: 'full' }));
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: { 'web-fetch': { options: { allowList?: string[] } } };
		};
		expect(parsed.plugins['web-fetch'].options.allowList).toEqual([]);
	});

	it('issues repo answer overrides the issues plugin repo option', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({
				preset: 'full',
				issuesRepo: 'octo/example',
			}),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: { issues: { options: { repo?: string } } };
		};
		expect(parsed.plugins.issues.options.repo).toBe('octo/example');
	});

	it('web-fetch allow-list answer overrides the default empty allow-list', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({
				preset: 'full',
				webFetchAllowList: ['api.github.com', 'example.com'],
			}),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: { 'web-fetch': { options: { allowList?: string[] } } };
		};
		expect(parsed.plugins['web-fetch'].options.allowList).toEqual([
			'api.github.com',
			'example.com',
		]);
	});

	it('unknown plugins produce an empty options object', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'minimal' }),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		const parsed = JSON.parse(configFile?.content ?? '{}') as {
			plugins: { git: { options: Record<string, unknown> } };
		};
		expect(parsed.plugins.git.options).toEqual({});
	});
});
