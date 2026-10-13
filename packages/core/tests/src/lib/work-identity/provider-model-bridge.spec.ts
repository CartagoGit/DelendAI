/**
 * provider-model-bridge.spec.ts — the model a chat provider observed, read
 * back within the window it is still a statement about now.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	PROVIDER_MODEL_MAX_AGE_MS,
	providerBridgeSilence,
	providerModelBridgePath,
	providerModelId,
	providerModelReading,
} from '@delendai/core/lib/work-identity/provider-model-bridge.helper';

const dirs: string[] = [];
const bridge = (): { file: string; env: NodeJS.ProcessEnv } => {
	const dir = mkdtempSync(join(tmpdir(), 'provider-bridge-'));
	dirs.push(dir);
	const file = join(dir, 'provider-model.json');
	return { file, env: { DELENDAI_PROVIDER_MODEL_FILE: file } };
};

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const write = (file: string, entry: unknown): void =>
	writeFileSync(file, JSON.stringify(entry));

describe('providerModelBridgePath', () => {
	it('prefers the override variable over the user cache default', () => {
		expect(
			providerModelBridgePath({
				DELENDAI_PROVIDER_MODEL_FILE: '/x/y.json',
			}),
		).toBe('/x/y.json');
		const fallback = providerModelBridgePath({});
		expect(
			fallback.endsWith(
				join('.cache', 'delendai', 'provider-model.json'),
			),
		).toBe(true);
	});
});

describe('providerModelId', () => {
	it('names the model a fresh entry observed', () => {
		const { file, env } = bridge();
		write(file, {
			model: 'gpt-5.6-sol',
			at: new Date().toISOString(),
			provider: 'universal-chat-provider',
		});
		expect(providerModelId({ env })).toBe('gpt-5.6-sol');
	});

	it('says nothing when no provider has published', () => {
		const { env } = bridge();
		expect(providerModelId({ env })).toBeUndefined();
	});

	it('refuses a malformed or model-less entry rather than guessing', () => {
		const { file, env } = bridge();
		writeFileSync(file, '{ not json');
		expect(providerModelId({ env })).toBeUndefined();
		write(file, { at: new Date().toISOString() });
		expect(providerModelId({ env })).toBeUndefined();
		write(file, { model: '   ', at: new Date().toISOString() });
		expect(providerModelId({ env })).toBeUndefined();
	});

	it('refuses an entry older than the freshness window', () => {
		const { file, env } = bridge();
		const stale = new Date(Date.now() - PROVIDER_MODEL_MAX_AGE_MS - 1000);
		write(file, { model: 'gpt-5.6-sol', at: stale.toISOString() });
		expect(providerModelId({ env, now: new Date() })).toBeUndefined();
		// Just inside the window, the observation still counts.
		const fresh = new Date(Date.now() - PROVIDER_MODEL_MAX_AGE_MS + 60_000);
		write(file, { model: 'gpt-5.6-sol', at: fresh.toISOString() });
		expect(providerModelId({ env, now: new Date() })).toBe('gpt-5.6-sol');
	});

	it('ignores an entry from a conversation in another workspace', () => {
		const { file, env } = bridge();
		write(file, {
			model: 'claude-opus-5',
			at: new Date().toISOString(),
			workspace: '/projects/other',
		});
		expect(providerModelId({ env, workspace: '/projects/delendai' })).toBe(
			undefined,
		);
		// A worktree under the workspace is still this conversation's work.
		expect(
			providerModelId({
				env,
				workspace: '/projects/other/.cache/delendai/.worktrees/w',
			}),
		).toBe('claude-opus-5');
		// An entry that names no workspace names no conversation to conflict with.
		write(file, { model: 'gpt-5.6-sol', at: new Date().toISOString() });
		expect(providerModelId({ env, workspace: '/anywhere' })).toBe(
			'gpt-5.6-sol',
		);
	});
});

describe('agentFor over the bridge', () => {
	const withBridge = async (run: (bridgeFile: string) => Promise<void>) => {
		const previousFile = process.env.DELENDAI_PROVIDER_MODEL_FILE;
		const previousAgent = process.env.DELENDAI_AGENT_ID;
		delete process.env.DELENDAI_AGENT_ID;
		try {
			const { file, env } = bridge();
			process.env.DELENDAI_PROVIDER_MODEL_FILE =
				env.DELENDAI_PROVIDER_MODEL_FILE;
			await run(file);
		} finally {
			if (previousFile === undefined)
				delete process.env.DELENDAI_PROVIDER_MODEL_FILE;
			else process.env.DELENDAI_PROVIDER_MODEL_FILE = previousFile;
			if (previousAgent !== undefined)
				process.env.DELENDAI_AGENT_ID = previousAgent;
		}
	};

	it('names a host that declares no model after what the provider served', async () => {
		const { agentFor } = await import(
			'@delendai/core/lib/work-units/work-unit-shared.service'
		);
		await withBridge(async (file) => {
			// Nothing published yet: still nobody.
			expect(agentFor([])).toBe('');
			write(file, { model: 'GPT-5.6-Sol', at: new Date().toISOString() });
			expect(agentFor([])).toBe('gpt-5.6-sol');
			// An explicit declaration still wins over the observation.
			expect(agentFor(['--agent=claude-opus-5'])).toBe('claude-opus-5');
			process.env.DELENDAI_AGENT_ID = 'minimax-m3.1';
			try {
				expect(agentFor([])).toBe('minimax-m3.1');
			} finally {
				delete process.env.DELENDAI_AGENT_ID;
			}
		});
	});

	it('only reads a bridge entry written for this workspace', async () => {
		const { agentFor } = await import(
			'@delendai/core/lib/work-units/work-unit-shared.service'
		);
		await withBridge(async (file) => {
			write(file, {
				model: 'claude-opus-5',
				at: new Date().toISOString(),
				workspace: '/projects/other',
			});
			expect(agentFor([], '/projects/delendai')).toBe('');
			expect(agentFor([], '/projects/other')).toBe('claude-opus-5');
		});
	});
});

describe('the development.identity axis rules what agentFor counts (f00758)', () => {
	const withBridge = async (run: (bridgeFile: string) => Promise<void>) => {
		const previousFile = process.env.DELENDAI_PROVIDER_MODEL_FILE;
		const previousAgent = process.env.DELENDAI_AGENT_ID;
		delete process.env.DELENDAI_AGENT_ID;
		try {
			const { file, env } = bridge();
			process.env.DELENDAI_PROVIDER_MODEL_FILE =
				env.DELENDAI_PROVIDER_MODEL_FILE;
			await run(file);
		} finally {
			if (previousFile === undefined)
				delete process.env.DELENDAI_PROVIDER_MODEL_FILE;
			else process.env.DELENDAI_PROVIDER_MODEL_FILE = previousFile;
			if (previousAgent !== undefined)
				process.env.DELENDAI_AGENT_ID = previousAgent;
		}
	};

	it('providerBridge:false closes the bridge, and declared ids still work', async () => {
		const { agentFor } = await import(
			'@delendai/core/lib/work-units/work-unit-shared.service'
		);
		await withBridge(async (file) => {
			write(file, { model: 'gpt-5.6-sol', at: new Date().toISOString() });
			expect(agentFor([], undefined, { providerBridge: false })).toBe('');
			expect(
				agentFor(['--agent=claude-opus-5'], undefined, {
					providerBridge: false,
				}),
			).toBe('claude-opus-5');
			process.env.DELENDAI_AGENT_ID = 'minimax-m3.1';
			try {
				expect(agentFor([], undefined, { providerBridge: false })).toBe(
					'minimax-m3.1',
				);
			} finally {
				delete process.env.DELENDAI_AGENT_ID;
			}
		});
	});

	it('unrecognizedModel.use names what nothing named a model', async () => {
		const { agentFor } = await import(
			'@delendai/core/lib/work-units/work-unit-shared.service'
		);
		await withBridge(async (file) => {
			const axis = { unrecognizedModel: { use: 'Shared Agent' } };
			// Nothing declared, nothing observed: the project's default names it.
			expect(agentFor([], undefined, axis)).toBe('shared-agent');
			// A client name (an application, not a model) is renamed too…
			// …but an observed model keeps its own name.
			write(file, { model: 'gpt-5.6-sol', at: new Date().toISOString() });
			expect(agentFor([], undefined, axis)).toBe('gpt-5.6-sol');
			// With the bridge closed, the observation stops counting and the
			// default name takes over — one knob, still one answer.
			expect(
				agentFor([], undefined, { ...axis, providerBridge: false }),
			).toBe('shared-agent');
		});
	});

	it('never renames a declared model identity', async () => {
		const { agentFor } = await import(
			'@delendai/core/lib/work-units/work-unit-shared.service'
		);
		const axis = { unrecognizedModel: { use: 'shared-agent' } };
		expect(agentFor(['--agent=claude-opus-5'], undefined, axis)).toBe(
			'claude-opus-5',
		);
		process.env.DELENDAI_AGENT_ID = 'minimax-m3.1';
		try {
			expect(agentFor([], undefined, axis)).toBe('minimax-m3.1');
		} finally {
			delete process.env.DELENDAI_AGENT_ID;
		}
	});
});

describe('providerModelReading', () => {
	it('keeps one entry per workspace, so two windows do not erase each other', () => {
		const { file, env } = bridge();
		const at = new Date().toISOString();
		write(file, {
			entries: {
				'/work/a': { model: 'model-a', at, provider: 'p' },
				'/work/b': { model: 'model-b', at, provider: 'p' },
			},
		});
		expect(providerModelId({ env, workspace: '/work/a' })).toBe('model-a');
		expect(
			providerModelId({ env, workspace: '/work/b/.worktrees/x' }),
		).toBe('model-b');
		expect(
			providerModelReading({ env, workspace: '/work/c' }),
		).toMatchObject({
			reason: 'other-workspace',
		});
	});

	it('names the freshest model when one workspace has several entries', () => {
		const { file, env } = bridge();
		const now = Date.now();
		write(file, {
			entries: {
				'/work/a': {
					model: 'older',
					at: new Date(now - 60_000).toISOString(),
				},
				'/work/a/.worktrees/u': {
					model: 'newer',
					at: new Date(now).toISOString(),
				},
			},
		});
		expect(providerModelId({ env, workspace: '/work/a' })).toBe('newer');
	});

	it('says why it named nothing, and how to fix it', () => {
		const { file, env } = bridge();
		const absent = providerModelReading({ env });
		expect(absent).toMatchObject({ reason: 'absent', path: file });
		expect(providerBridgeSilence(absent)).toContain('does not exist');
		write(file, {
			model: 'old',
			at: new Date(
				Date.now() - 2 * PROVIDER_MODEL_MAX_AGE_MS,
			).toISOString(),
		});
		const stale = providerModelReading({ env });
		expect(stale).toMatchObject({ reason: 'stale' });
		expect(providerBridgeSilence(stale)).toContain('min old');
		writeFileSync(file, '{');
		expect(providerModelReading({ env })).toMatchObject({
			reason: 'malformed',
		});
		expect(providerBridgeSilence({ model: 'm' })).toBeUndefined();
	});
});
