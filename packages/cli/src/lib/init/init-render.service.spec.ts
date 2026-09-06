/**
 * f00084 S2 — `renderInitBundle` and writers acceptance spec.
 */
import {
	writeFile as fsWriteFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseJsonc } from '@delendai/core/public';

import { initCommand } from '../../commands/init/init.command';

/**
 * f00502: the generated config is JSONC — it carries a comment above
 * every plugin entry — so the spec reads it the way the loader does,
 * not with `JSON.parse`.
 */
const parseGeneratedConfig = <T>(raw: string | undefined): T =>
	parseJsonc(raw ?? '{}').value as T;
import { buildCanonicalLaunch } from '../server-args.service';
import { InitAnswers } from './init-answers.schema';
import type { IInitAnswers } from './init-answers.types';
import { computeHostInstructionsWrite } from './init-host-instructions.service';
import { deriveScope } from './init-migrate-offer.service';
import {
	renderAgentFiles,
	renderInitBundle,
	resolvePluginSet,
} from './init-render.service';
import {
	writeCoreSkillProjection,
	writeDelendaiConfig,
} from './init-writers.factory';

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
		expect(rels).toContain('delendai.config.json');
		expect(rels).toContain('.vscode/mcp.json');
		expect(rels).toContain('.mcp.json');
		expect(rels.some((r) => r.startsWith('.github/agents/'))).toBe(true);
		// x00160 S2: the Claude Code-native subagent format is rendered
		// alongside the Copilot one — AGENT-BOOTSTRAP.md §8.2 tells every
		// Claude Code host to delegate to it, so init must create it.
		expect(rels.some((r) => r.startsWith('.claude/agents/'))).toBe(true);
		// Codex CLI custom-subagent format, parallel to Claude. AGENT-BOOTSTRAP.md
		// §8.3 tells every Codex CLI host to invoke them by name.
		expect(rels.some((r) => r.startsWith('.codex/agents/'))).toBe(true);
		expect(rels).toContain('AGENTS.md');
		expect(rels).toContain('CLAUDE.md');
		expect(rels).toContain('.github/copilot-instructions.md');
		// f00089 U1: the migration offer now emits an adoption PLAN whose id
		// is allocated against the canonical layout (empty here → f00001),
		// not a hardcoded `f00001-migrate-legacy` stub.
		expect(rels.some((r) => r.includes('adopt-delendai'))).toBe(true);
	});

	it('renders both MCP config entries from the canonical launch builder', async () => {
		const bundle = await renderInitBundle(parseAnswers());
		const vscode = JSON.parse(
			bundle.files.find((file) => file.relPath === '.vscode/mcp.json')
				?.content ?? '{}',
		) as { servers: { delendai: { command: string; args: string[] } } };
		const generic = JSON.parse(
			bundle.files.find((file) => file.relPath === '.mcp.json')
				?.content ?? '{}',
		) as {
			mcpServers: { delendai: { command: string; args: string[] } };
		};

		expect(vscode.servers['delendai']).toMatchObject(
			buildCanonicalLaunch({ workspace: '${workspaceFolder}' }),
		);
		expect(generic.mcpServers['delendai']).toMatchObject(
			buildCanonicalLaunch({ workspace: '.' }),
		);
	});

	it('skips .agent.md AND the Claude Code AND the Codex subagents when generateAgentMd=false', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ generateAgentMd: false }),
		);
		expect(
			bundle.files.some((f) => f.relPath.startsWith('.github/agents/')),
		).toBe(false);
		expect(
			bundle.files.some((f) => f.relPath.startsWith('.claude/agents/')),
		).toBe(false);
		expect(
			bundle.files.some((f) => f.relPath.startsWith('.codex/agents/')),
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
			bundle.files.some((r) => r.relPath.includes('adopt-delendai')),
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
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'swarm' }),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'delendai.config.json',
		);
		expect(configFile).toBeDefined();
		const parsed = parseGeneratedConfig<{
			plugins: Record<string, { options: Record<string, unknown> }>;
		}>(configFile?.content);
		expect(parsed.plugins.proposals).toBeDefined();
		expect(parsed.plugins.git).toBeDefined();
	});

	it('renders the `dogfood` preset as an independent plugin set (no swarm inheritance)', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'dogfood' }, '/tmp/example-ws'),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'delendai.config.json',
		);
		expect(configFile).toBeDefined();
		const config = parseGeneratedConfig<{
			plugins: Record<string, { enabled?: boolean }>;
		}>(configFile?.content);
		// x00166: dogfood mirrors delendai.config.json's `plugins` keys
		// exactly (38 total in the current dogfood snapshot), including
		// proposals (orchestration/swarm) — no independent-preset chain
		// inheritance involved, this is just what the live config loads.
		//
		// f00502 S4: the file now also lists every other plugin the
		// catalog knows about, disabled, so the preset is measured by
		// what it ENABLES rather than by how many keys exist.
		const enabled = Object.entries(config.plugins)
			.filter(([, entry]) => entry.enabled !== false)
			.map(([id]) => id);
		expect(enabled.length).toBe(38);
		expect(Object.keys(config.plugins).length).toBeGreaterThan(38);
		for (const required of [
			'audit',
			'auto-agent-selector',
			'container',
			'conventions',
			'deps',
			'diagram',
			'docs',
			'env',
			'error-reporting',
			'forge',
			'git',
			'i18n',
			'link-check',
			'logs',
			'memory',
			'notification',
			'orchestrator-runner',
			'perf',
			'proposals',
			'quality',
			'rules',
			'search',
			'security',
			'status-marker',
			'tech-debt',
			'test-convention',
			'test-policy',
			'usage-tracking',
		]) {
			expect(config.plugins[required]).toBeDefined();
		}
		// f00502 S4: these are not in the `vertex` preset. They are still
		// written to the file — that is the point, the user discovers
		// them there — but explicitly disabled, so the preset's boundary
		// is expressed by `enabled: false`, not by absence.
		for (const notInPreset of [
			'web-fetch',
			'issues',
			'refactor',
			'api',
			'prompt-eval',
			'database',
		]) {
			expect(config.plugins[notInPreset]?.enabled).toBe(false);
			expect(enabled).not.toContain(notInPreset);
		}
	});
});

describe('renderAgentFiles — Copilot user-invocable + server key (x00202 S1)', () => {
	// x00202: `delendai init`'s fallback path (the ONLY path it has ever
	// exercised — nothing in this repo ever writes an `agents` array
	// into agent-catalog.generated.json) never emitted `user-invocable`
	// at all, so every adopter got all 5 agents visible/selectable in
	// the Copilot picker — the exact bug f00031's redirector contract
	// exists to prevent, just on a different code path than x00201
	// fixed. It also emitted a bare, un-namespaced tool list with at
	// least one stale entry (search_search is not a real tool).
	it('marks the orchestrator user-invocable and every subagent not', async () => {
		const files = await renderAgentFiles('/no-catalog', { locale: 'en' });
		const githubFiles = files.filter((f) =>
			f.relPath.startsWith('.github/agents/'),
		);
		expect(githubFiles.length).toBeGreaterThan(0);
		const orchestrator = githubFiles.find((f) =>
			f.relPath.endsWith('delendai-orchestrator.agent.md'),
		);
		expect(orchestrator?.content).toContain('user-invocable: true');
		const subagents = githubFiles.filter((f) => f !== orchestrator);
		expect(subagents.length).toBeGreaterThan(0);
		for (const subagent of subagents) {
			expect(subagent.content).toContain('user-invocable: false');
		}
	});

	it('grants the fixed delendai/* server key, never a bare or stale tool name', async () => {
		const files = await renderAgentFiles('/no-catalog', {
			namespacePrefix: 'acme',
			locale: 'en',
		});
		const githubFiles = files.filter((f) =>
			f.relPath.startsWith('.github/agents/'),
		);
		for (const file of githubFiles) {
			expect(file.content).toContain('acme/*');
			expect(file.content).not.toContain('search_search');
			expect(file.content).not.toContain('acme_search_search');
		}
	});

	it('uses the namespace for agent files and the configured MCP server key', async () => {
		const bundle = await renderInitBundle(
			parseAnswers(
				{
					namespacePrefix: 'acme',
					serverName: 'acme-tools',
				},
				'/tmp/example-ws',
			),
		);
		const github = bundle.files.find((file) =>
			file.relPath.startsWith('.github/agents/'),
		);
		const claude = bundle.files.find((file) =>
			file.relPath.startsWith('.claude/agents/'),
		);
		const codex = bundle.files.find((file) =>
			file.relPath.startsWith('.codex/agents/'),
		);
		const vscode = JSON.parse(
			bundle.files.find((file) => file.relPath === '.vscode/mcp.json')
				?.content ?? '{}',
		) as { servers: Record<string, unknown> };
		const generic = JSON.parse(
			bundle.files.find((file) => file.relPath === '.mcp.json')
				?.content ?? '{}',
		) as { mcpServers: Record<string, unknown> };

		expect(github?.relPath).toContain('.github/agents/acme-');
		expect(claude?.relPath).toContain('.claude/agents/acme-');
		expect(codex?.relPath).toContain('.codex/agents/acme-');
		expect(github?.content).toContain('name: acme-');
		expect(github?.content).toContain('acme-tools/*');
		expect(vscode.servers['acme-tools']).toBeDefined();
		expect(generic.mcpServers['acme-tools']).toBeDefined();
	});
});

describe('initCommand extraOptions (f00084 S8)', () => {
	// The CLI requires the explicit `--delendai-root` to point at a file
	// that exists on disk. Resolve the host entry script relative to this
	// spec file so the test is portable across checkouts (it used to
	// hardcode the author's `/home/cartago/_proyectos/propios/...` path,
	// which broke in any other developer's environment).
	const HOST_ENTRY_PATH = join(
		dirname(fileURLToPath(import.meta.url)),
		'../../../../../tools/scripts/host/host-server.script.ts',
	);

	// f00084 S8: `initCommand.run` performs a dynamic import of every
	// resolved plugin to compute the env warning block. In the test
	// sandbox each import costs ~100-300ms, so the standard preset
	// (14 non-env plugins) easily exceeds vitest's 5s default timeout
	// when the suite is warm. Bump the timeout for this describe.
	const TEST_TIMEOUT_MS = 30_000;

	let workspace: string;
	let stderrWrite: MockInstance<typeof process.stderr.write>;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'delendai-init-command-'));
		stderrWrite = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		process.stdin.isTTY = false;
	});

	afterEach(async () => {
		stderrWrite.mockRestore();
		await rm(workspace, { recursive: true, force: true });
	});

	it(
		'merges CLI plugin option overrides on top of rendered defaults before writing',
		async () => {
			// Dynamic imports of every standard-preset plugin take ~2-4s
			// in the test sandbox (env warning lookup); the standard
			// preset exceeds vitest's 5s default. The describe-level
			// `TEST_TIMEOUT_MS` constant explains why.
			const result = await initCommand.run(
				[`--delendai-root=${HOST_ENTRY_PATH}`],
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
				join(workspace, 'delendai.config.json'),
				'utf8',
			);
			const parsed = parseGeneratedConfig<{
				plugins: {
					memory?: { options: { maxNotes?: string } };
					proposals?: { options: { proposalDir?: string } };
				};
			}>(onDisk);
			expect(parsed.plugins.memory?.options.maxNotes).toBe('500');
			expect(parsed.plugins.proposals?.options.proposalDir).toBe(
				'docs/proposals/custom',
			);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		'warns and skips when a CLI override targets a plugin outside the resolved set',
		async () => {
			const result = await initCommand.run(
				[`--delendai-root=${HOST_ENTRY_PATH}`],
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
				join(workspace, 'delendai.config.json'),
				'utf8',
			);
			const parsed = parseGeneratedConfig<{
				plugins: Record<
					string,
					{ enabled?: boolean; options: Record<string, unknown> }
				>;
			}>(onDisk);
			expect(parsed.plugins.memory?.options.maxNotes).toBe('500');
			// f00502 S4: an unresolved plugin is listed but disabled, and
			// the override did NOT land on it — being visible in the file
			// is not the same as being configured by the flag.
			expect(parsed.plugins.audit?.enabled).toBe(false);
			expect(parsed.plugins.audit?.options).toEqual({});
			expect(parsed.plugins['web-fetch']?.enabled).toBe(false);
			expect(parsed.plugins['web-fetch']?.options).toEqual({});
		},
		TEST_TIMEOUT_MS,
	);
});

describe('writeDelendaiConfig (f00084 S2)', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'delendai-init-writer-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('writes a fresh config in an empty workspace', async () => {
		const result = await writeDelendaiConfig(
			workspace,
			{ plugins: { git: { options: {} } } },
			false,
		);
		expect(result.kind).toBe('written');
		const onDisk = await readFile(
			`${workspace}/delendai.config.json`,
			'utf8',
		);
		const parsed = parseGeneratedConfig<{
			plugins: { git: { options: object } };
		}>(onDisk);
		expect(parsed.plugins.git).toEqual({ options: {} });
	});

	it('merges generated defaults into a valid existing project config', async () => {
		await writeDelendaiConfig(workspace, { plugins: {} }, false);
		const second = await writeDelendaiConfig(
			workspace,
			{
				cacheDir: '.generated-cache',
				plugins: {
					proposals: { options: { docsDir: 'docs/proposals' } },
				},
			},
			false,
		);
		expect(second.kind).toBe('merged');
		const onDisk = await readFile(
			`${workspace}/delendai.config.json`,
			'utf8',
		);
		const parsed = parseGeneratedConfig<{
			plugins: Record<string, unknown>;
		}>(onDisk);
		expect(parsed.plugins.proposals).toBeDefined();
	});

	it('overwrites with --force', async () => {
		await writeDelendaiConfig(workspace, { plugins: {} }, false);
		const second = await writeDelendaiConfig(
			workspace,
			{ plugins: { proposals: { options: {} } } },
			true,
		);
		expect(second.kind).toBe('written');
		const onDisk = await readFile(
			`${workspace}/delendai.config.json`,
			'utf8',
		);
		const parsed = parseGeneratedConfig<{
			plugins: Record<string, unknown>;
		}>(onDisk);
		expect(parsed.plugins.proposals).toBeDefined();
	});

	it('preserves an invalid existing config unless replacement is explicit', async () => {
		await fsWriteFile(
			`${workspace}/delendai.config.json`,
			'{broken',
			'utf8',
		);
		const result = await writeDelendaiConfig(
			workspace,
			{ plugins: { git: { options: {} } } },
			false,
		);
		expect(result.kind).toBe('exists');
		expect(
			await readFile(`${workspace}/delendai.config.json`, 'utf8'),
		).toBe('{broken');
	});
});

describe('writeCoreSkillProjection', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'delendai-skill-writer-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('writes a project-owned manifest and core bodies, then preserves them', async () => {
		const first = await writeCoreSkillProjection(
			workspace,
			'docs/delendai',
			false,
		);
		expect(first.length).toBeGreaterThan(1);
		expect(first.every((write) => write.kind === 'written')).toBe(true);
		const manifestPath = join(
			workspace,
			'docs/delendai/skills/manifest.json',
		);
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
			skills: Array<{ bodyPath: string }>;
		};
		expect(manifest.skills[0]?.bodyPath).toContain('docs/delendai/skills/');

		const second = await writeCoreSkillProjection(
			workspace,
			'docs/delendai',
			false,
		);
		expect(second.some((write) => write.kind === 'exists')).toBe(true);
	});

	it('mergeSkillManifest de-dupes duplicate ids in the existing manifest on next merge', async () => {
		// a00079 (audit): the previous merge logic preserved `current.skills`
		// verbatim and only filtered the incoming list, so any duplicate
		// already present in the existing manifest was never stripped.
		// This regression test seeds a manifest with two entries of the
		// same id and asserts the next merge collapses to a single row.
		const manifestPath = join(
			workspace,
			'docs/delendai/skills/manifest.json',
		);
		await mkdir(dirname(manifestPath), { recursive: true });
		await fsWriteFile(
			manifestPath,
			`${JSON.stringify(
				{
					skills: [
						{ id: 'delendai-operator', bodyPath: 'a' },
						{ id: 'delendai-operator', bodyPath: 'b' },
						{ id: 'other-plugin', bodyPath: 'c' },
					],
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await writeCoreSkillProjection(workspace, 'docs/delendai', false);

		const onDisk = JSON.parse(await readFile(manifestPath, 'utf8')) as {
			skills: Array<{ id: string }>;
		};
		const operatorRows = onDisk.skills.filter(
			(skill) => skill.id === 'delendai-operator',
		);
		expect(operatorRows).toHaveLength(1);
	});
});

describe('computeHostInstructionsWrite (f00084 S4)', () => {
	const BEGIN = '<!-- delendai:begin -->';
	const END = '<!-- delendai:end -->';

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

describe('deriveScope (workspace → proposal scope slug)', () => {
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
		workspace = await mkdtemp(join(tmpdir(), 'delendai-init-e2e-'));
		await mkdir(`${workspace}/.github/agents`, { recursive: true });
		await mkdir(`${workspace}/docs/delendai/proposals/ready`, {
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
			if (file.relPath === 'delendai.config.json') continue;
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
			(f) => f.relPath === 'delendai.config.json',
		);
		const parsed = parseGeneratedConfig<{
			plugins: {
				audit: { options: { auditDir?: string; topActions?: number } };
			};
		}>(configFile?.content);
		expect(parsed.plugins.audit.options.auditDir).toBe(
			'docs/delendai/proposals/done/audits',
		);
		expect(parsed.plugins.audit.options.topActions).toBe(5);
	});

	it('memory initialises with bm25 defaults', async () => {
		const bundle = await renderInitBundle(
			parseAnswers({ preset: 'swarm' }),
		);
		const configFile = bundle.files.find(
			(f) => f.relPath === 'delendai.config.json',
		);
		const parsed = parseGeneratedConfig<{
			plugins: {
				memory: { options: { bm25K1?: number; bm25B?: number } };
			};
		}>(configFile?.content);
		expect(parsed.plugins.memory.options.bm25K1).toBe(1.5);
		expect(parsed.plugins.memory.options.bm25B).toBe(0.75);
	});

	it('a00063: search roots are derived from the REAL workspace layout, not stamped from the monorepo', async () => {
		// An Angular-shaped app: src/ + e2e/, no packages/plugins/apps.
		// Stamping delendai's own monorepo roots here made every
		// search scan 0 files — the "agent went crazy" incident.
		const ws = await mkdtemp(join(tmpdir(), 'init-angular-'));
		try {
			await mkdir(join(ws, 'src'), { recursive: true });
			await mkdir(join(ws, 'e2e'), { recursive: true });
			const bundle = await renderInitBundle(
				parseAnswers({ preset: 'swarm' }, ws),
			);
			const configFile = bundle.files.find(
				(f) => f.relPath === 'delendai.config.json',
			);
			const parsed = parseGeneratedConfig<{
				plugins: {
					search: {
						options: { roots?: string[]; extensions?: string[] };
					};
					conventions?: { options: { roots?: string[] } };
				};
			}>(configFile?.content);
			expect(parsed.plugins.search.options.roots).toContain('src');
			expect(parsed.plugins.search.options.roots).not.toContain(
				'packages',
			);
			// No extensions/ignoreDirs materialised: the engine's richer
			// built-in defaults (incl. html/scss for frontend repos) apply.
			expect(parsed.plugins.search.options.extensions).toBeUndefined();
		} finally {
			await rm(ws, { recursive: true, force: true });
		}
	});

	it('a00063: search roots are OMITTED when no known source dir exists (engine walks "." safely)', async () => {
		const ws = await mkdtemp(join(tmpdir(), 'init-bare-'));
		try {
			const bundle = await renderInitBundle(
				parseAnswers({ preset: 'swarm' }, ws),
			);
			const configFile = bundle.files.find(
				(f) => f.relPath === 'delendai.config.json',
			);
			const parsed = parseGeneratedConfig<{
				plugins: { search: { options: { roots?: string[] } } };
			}>(configFile?.content);
			expect(parsed.plugins.search.options.roots).toBeUndefined();
		} finally {
			await rm(ws, { recursive: true, force: true });
		}
	});

	it('web-fetch is empty by default (fail closed)', async () => {
		const bundle = await renderInitBundle(parseAnswers({ preset: 'full' }));
		const configFile = bundle.files.find(
			(f) => f.relPath === 'delendai.config.json',
		);
		const parsed = parseGeneratedConfig<{
			plugins: { 'web-fetch': { options: { allowList?: string[] } } };
		}>(configFile?.content);
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
			(f) => f.relPath === 'delendai.config.json',
		);
		const parsed = parseGeneratedConfig<{
			plugins: { issues: { options: { repo?: string } } };
		}>(configFile?.content);
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
			(f) => f.relPath === 'delendai.config.json',
		);
		const parsed = parseGeneratedConfig<{
			plugins: { 'web-fetch': { options: { allowList?: string[] } } };
		}>(configFile?.content);
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
			(f) => f.relPath === 'delendai.config.json',
		);
		const parsed = parseGeneratedConfig<{
			plugins: { git: { options: Record<string, unknown> } };
		}>(configFile?.content);
		expect(parsed.plugins.git.options).toEqual({});
	});
});
