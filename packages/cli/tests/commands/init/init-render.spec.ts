/**
 * f00084 S2 — `renderInitBundle` and writers acceptance spec.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	InitAnswers,
	type IInitAnswers,
} from '../../../src/commands/init/init-answers.schema';
import {
	renderInitBundle,
	resolvePluginSet,
} from '../../../src/commands/init/init-render';
import { writeMcpVertexConfig } from '../../../src/commands/init/init-writers';

const parseAnswers = (partial: Partial<IInitAnswers>): IInitAnswers =>
	InitAnswers.parse({ workspaceRoot: '/tmp', ...partial });

describe('renderInitBundle (f00084 S2)', () => {
	it('produces config + .vscode/mcp.json + 5 .agent.md for swarm', () => {
		const bundle = renderInitBundle(parseAnswers({ preset: 'swarm' }));
		const rels = bundle.files.map((f) => f.relPath);
		expect(rels).toContain('mcp-vertex.config.json');
		expect(rels).toContain('.vscode/mcp.json');
		expect(
			rels.filter((r) => r.startsWith('.github/agents/')),
		).toHaveLength(5);
	});

	it('skips .agent.md when generateAgentMd=false', () => {
		const bundle = renderInitBundle(
			parseAnswers({ generateAgentMd: false }),
		);
		expect(
			bundle.files.some((f) => f.relPath.startsWith('.github/agents/')),
		).toBe(false);
	});

	it('skips host-instructions blocks when hostInstructions=skip', () => {
		const bundle = renderInitBundle(
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

	it('emits a valid JSON config payload', () => {
		const bundle = renderInitBundle(parseAnswers({}));
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
