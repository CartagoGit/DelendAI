/**
 * f00084 S2 — `renderInitBundle` and writers acceptance spec.
 */
import {
	writeFile as fsWriteFile,
	mkdtemp,
	readFile,
	rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/cli';

/**
 * f00502: the generated config is JSONC — it carries a comment above
 * every plugin entry — so the spec reads it the way the loader does,
 * not with `JSON.parse`.
 */
const parseGeneratedConfig = <T>(raw: string | undefined): T =>
	parseJsonc(raw ?? '{}').value as T;
import { InitAnswers } from './init-answers.schema';
import type { IInitAnswers } from './init-answers.types';
import { computeHostInstructionsWrite } from './init-host-instructions.service';
import { deriveScope } from './init-migrate-offer.service';
import { renderAgentFiles, resolvePluginSet } from './init-render.service';
import { writeDelendaiConfig } from './init-writers.factory';

const parseAnswers = (
	partial: Partial<IInitAnswers> = {},
	workspaceRoot = '/tmp',
): IInitAnswers => InitAnswers.parse({ workspaceRoot, ...partial });

describe('resolvePluginSet (f00084 S2-S5)', () => {
	it('[<200ms] resolves swarm plugin set with audit added and issues excluded', () => {
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
	it('[<200ms] marks the orchestrator user-invocable and every subagent not', async () => {
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

	it('[<200ms] grants the default server, not one named after the namespace prefix', async () => {
		const files = await renderAgentFiles('/no-catalog', {
			namespacePrefix: 'acme',
			locale: 'en',
		});
		const githubFiles = files.filter((f) =>
			f.relPath.startsWith('.github/agents/'),
		);
		for (const file of githubFiles) {
			expect(file.content).toContain('delendai/*]');
			expect(file.content).not.toContain('acme/*');
			expect(file.content).not.toContain('search_search');
			expect(file.content).not.toContain('acme_search_search');
		}
	});

	it.each([
		['delendai', 'delendai'],
		['DelendAI', 'delendai'],
		['My Project MCP', 'my-project-mcp'],
	])(
		'[<200ms] grants server %s by the reference the host gives it (%s)',
		async (serverName, reference) => {
			const files = await renderAgentFiles('/no-catalog', {
				locale: 'en',
				serverName,
			});
			const githubFiles = files.filter((f) =>
				f.relPath.startsWith('.github/agents/'),
			);
			expect(githubFiles.length).toBeGreaterThan(0);
			for (const file of githubFiles) {
				expect(file.content).toContain(`${reference}/*]`);
			}
		},
	);

	it("[<200ms] writes agents only for the hosts the project declares, in each one's format", async () => {
		const files = await renderAgentFiles('/no-catalog', {
			locale: 'en',
			hosts: ['opencode', 'cursor'],
		});
		expect(files.length).toBeGreaterThan(0);
		expect(
			files.every((file) => file.relPath.startsWith('.opencode/agent/')),
		).toBe(true);
		const entry = files.find((file) =>
			file.relPath.endsWith('-orchestrator.md'),
		);
		expect(entry?.content).toContain('mode: primary');
	});
});

describe('writeDelendaiConfig (f00084 S2)', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'delendai-init-writer-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('[<200ms] writes a fresh config in an empty workspace', async () => {
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

	it('[<200ms] merges generated defaults into a valid existing project config', async () => {
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

	it('[<200ms] overwrites with --force', async () => {
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

	it('[<200ms] preserves an invalid existing config unless replacement is explicit', async () => {
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

describe('computeHostInstructionsWrite (f00084 S4)', () => {
	const BEGIN = '<!-- delendai:begin -->';
	const END = '<!-- delendai:end -->';

	it('[<200ms] returns the block when current is undefined', () => {
		const next = computeHostInstructionsWrite(undefined, 'hello', 'append');
		expect(next).toContain(BEGIN);
		expect(next).toContain('hello');
		expect(next).toContain(END);
	});

	it('[<200ms] replaces the block in place when markers are present', () => {
		const current = `# Title\n\n${BEGIN}\nold\n${END}\n\n# Footer\n`;
		const next = computeHostInstructionsWrite(current, 'new', 'append');
		expect(next).toContain('# Title');
		expect(next).toContain('# Footer');
		expect(next).toContain('new');
		expect(next).not.toContain('old');
	});

	it('[<200ms] appends when markers are absent', () => {
		const current = '# Existing\n';
		const next = computeHostInstructionsWrite(current, 'hello', 'append');
		expect(next?.startsWith('# Existing')).toBe(true);
		expect(next).toContain('hello');
	});

	it('[<200ms] is idempotent: a second call with the previous output produces the same bytes', () => {
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

	it('[<200ms] replaces the whole file in overwrite mode', () => {
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

	it('[<200ms] returns undefined in skip mode', () => {
		expect(
			computeHostInstructionsWrite('# x', 'body', 'skip'),
		).toBeUndefined();
	});
});

describe('deriveScope (workspace → proposal scope slug)', () => {
	it('[<200ms] derives a slugified scope from the workspace basename', () => {
		expect(deriveScope('/tmp/AZUR LX--develop')).toMatch(
			/^azur-lx-develop/,
		);
		expect(deriveScope('/tmp/_weird_ name!')).toMatch(/^weird-name/);
	});
});
