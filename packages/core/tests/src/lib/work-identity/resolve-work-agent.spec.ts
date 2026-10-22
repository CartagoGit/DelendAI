/**
 * resolve-work-agent.spec.ts — one answer to "who is working", and the
 * machine is never it.
 */
import { describe, expect, it } from 'vitest';

import {
	CLIENT_ID_PREFIX,
	DEFAULT_WORK_AGENT_PRECEDENCE,
	WORK_AGENT_UNKNOWN,
	normalizeWorkAgentId,
	resolveWorkAgentId,
} from '@delendai/core/lib/work-identity/resolve-work-agent.service';

describe('resolveWorkAgentId (x00560)', () => {
	it('prefers the exact model over everything else', () => {
		expect(
			resolveWorkAgentId({
				model: 'claude-opus-5',
				environment: 'claude-code',
				client: 'Visual Studio Code',
			}),
		).toMatchObject({ id: 'claude-opus-5', source: 'model' });
	});

	it('falls back to what the environment declares, then to the client', () => {
		expect(
			resolveWorkAgentId({
				environment: 'codex',
				client: 'Visual Studio Code',
			}),
		).toMatchObject({ id: 'codex', source: 'environment' });
		// Marked, because the handshake reports the APPLICATION that
		// connected. Unmarked it read exactly like a model, which is how
		// `delendai/wip/claude-code/…` came to sit in this repository's
		// graph beside `delendai/wip/claude-opus-5/…`.
		expect(
			resolveWorkAgentId({ client: 'codex-mcp-client' }),
		).toMatchObject({
			id: 'client-codex-mcp-client',
			source: 'client',
		});
	});

	it('never lets an application name pass as a model', () => {
		for (const application of [
			'Claude Code',
			'Visual Studio Code',
			'codex-mcp-client',
		]) {
			const identity = resolveWorkAgentId({ client: application });
			expect(identity.id.startsWith(CLIENT_ID_PREFIX)).toBe(true);
			// A declared model or environment is never marked: those
			// answer "who did the work", which is what the ref is for.
			expect(
				resolveWorkAgentId({ model: 'claude-opus-5' }).id,
			).not.toContain(CLIENT_ID_PREFIX);
			expect(
				resolveWorkAgentId({ environment: 'codex' }).id,
			).not.toContain(CLIENT_ID_PREFIX);
		}
	});

	it('says nobody declared it rather than naming a ref after a machine', () => {
		// The chain this replaces ended at `os.hostname()`, which put
		// `delendai/wip/desktop-9ctqrs7/…` in this repository — a ref that
		// names the hardware, and that every agent on it would share.
		expect(resolveWorkAgentId({})).toMatchObject({
			id: WORK_AGENT_UNKNOWN,
			source: 'none',
		});
		expect(WORK_AGENT_UNKNOWN).not.toMatch(/desktop|localhost|host/iu);
	});

	it('reads a source that is only known later, at call time', () => {
		let handshake: string | undefined;
		const sources = { client: () => handshake };
		expect(resolveWorkAgentId(sources).source).toBe('none');
		handshake = 'claude-code';
		expect(resolveWorkAgentId(sources)).toMatchObject({
			id: 'client-claude-code',
			source: 'client',
		});
	});

	it('takes the model a provider observed over a client name', () => {
		// The handshake says which APPLICATION connected; the provider
		// bridge says which MODEL served the conversation. A model names
		// who did the work, so it wins — and unlike `client-…` it is not
		// marked, because it is a model id, observed rather than invented.
		expect(
			resolveWorkAgentId({
				provider: 'gpt-5.6-sol',
				client: 'Visual Studio Code',
			}),
		).toMatchObject({ id: 'gpt-5.6-sol', source: 'provider' });
	});

	it('keeps a declared model or environment ahead of the bridge', () => {
		expect(
			resolveWorkAgentId({
				model: 'claude-opus-5',
				provider: 'gpt-5.6-sol',
			}),
		).toMatchObject({ id: 'claude-opus-5', source: 'model' });
		expect(
			resolveWorkAgentId({
				environment: 'minimax-m3.1',
				provider: 'gpt-5.6-sol',
			}),
		).toMatchObject({ id: 'minimax-m3.1', source: 'environment' });
	});

	it('calls the provider thunk only when nothing else answered', () => {
		// The bridge reads the filesystem; a host that declared its model
		// must never pay for it, and a stale bridge on disk must never
		// shadow a declared identity.
		let called = false;
		resolveWorkAgentId({
			environment: 'codex',
			provider: () => {
				called = true;
				return 'gpt-5.6-sol';
			},
		});
		expect(called).toBe(false);
		resolveWorkAgentId({
			provider: () => {
				called = true;
				return 'gpt-5.6-sol';
			},
		});
		expect(called).toBe(true);
	});

	it('treats blank and whitespace declarations as absent', () => {
		expect(
			resolveWorkAgentId({
				model: '   ',
				environment: '',
				client: () => undefined,
			}).source,
		).toBe('none');
	});

	it('produces something a git ref component actually accepts', () => {
		// The previous implementation only lowercased, so a client called
		// `Visual Studio Code` produced `visual studio code` — spaces and
		// all — and the spec pinned it.
		expect(normalizeWorkAgentId('Visual Studio Code')).toBe(
			'visual-studio-code',
		);
		expect(normalizeWorkAgentId('GPT-5.1 (preview)')).toBe(
			'gpt-5.1-preview',
		);
		expect(normalizeWorkAgentId('  --weird--  ')).toBe('weird');
		for (const raw of [
			'Visual Studio Code',
			'GPT-5.1 (preview)',
			'a/b:c',
		]) {
			expect(normalizeWorkAgentId(raw)).toMatch(/^[a-z0-9._-]+$/u);
		}
	});
});

describe('a source that cannot survive normalising has not answered', () => {
	it('never reports an empty id as an identity', () => {
		// `!!!` is non-empty, so it passed the presence check, and then
		// normalised to ''. The ref built from it would have been
		// `…/wip//x1-S1-g1/topic`, which is not a ref at all.
		expect(resolveWorkAgentId({ model: '!!!' })).toMatchObject({
			id: WORK_AGENT_UNKNOWN,
			source: 'none',
		});
	});

	it('asks the next source instead of shadowing it', () => {
		// The damaging half: a host offering punctuation as its model hid
		// a perfectly good environment behind it.
		expect(
			resolveWorkAgentId({ model: '!!!', environment: 'codex' }),
		).toMatchObject({ id: 'codex', source: 'environment' });
	});

	it('falls all the way through to the client', () => {
		expect(
			resolveWorkAgentId({
				model: '!!!',
				environment: '???',
				client: 'visual-studio-code',
			}),
		).toMatchObject({ id: 'client-visual-studio-code', source: 'client' });
	});

	it('answers unknown when no source survives', () => {
		expect(
			resolveWorkAgentId({
				model: '!!!',
				environment: '???',
				client: '@@@',
			}),
		).toMatchObject({ id: WORK_AGENT_UNKNOWN, source: 'none' });
	});

	it('still prefers the first source that does survive', () => {
		expect(
			resolveWorkAgentId({
				model: 'claude-opus-5',
				environment: 'codex',
			}),
		).toMatchObject({ id: 'claude-opus-5', source: 'model' });
	});
});

describe('an identity is a claim with its channel (f00777)', () => {
	it('says how certain each channel is and why', () => {
		expect(
			resolveWorkAgentId({ environment: 'glm-5.3-flash' }),
		).toMatchObject({
			channel: 'environment',
			confidence: 'declared',
		});
		expect(resolveWorkAgentId({ provider: 'gpt-6' })).toMatchObject({
			channel: 'provider',
			confidence: 'observed',
		});
		const client = resolveWorkAgentId({ client: 'visual-studio-code' });
		expect(client).toMatchObject({
			source: 'client',
			confidence: 'reported',
		});
		expect(client.reason).toContain('a program connected');
		const nothing = resolveWorkAgentId({});
		expect(nothing).toMatchObject({ source: 'none', confidence: 'none' });
		expect(nothing.reason).toContain('nothing declared');
	});

	it('carries a channel the system has not met, not coerced to none', () => {
		const claim = resolveWorkAgentId(
			{ channels: { gateway: 'qwen-3.8-max' } },
			[
				{
					channel: 'gateway',
					source: 'provider',
					confidence: 'observed',
				},
			],
		);
		expect(claim).toMatchObject({
			id: 'qwen-3.8-max',
			source: 'provider',
			channel: 'gateway',
		});
	});

	it('resolves as before by default, and a reordered precedence changes the winner', () => {
		const both = { environment: 'glm-5.3-flash', provider: 'gpt-6' };
		expect(resolveWorkAgentId(both).id).toBe('glm-5.3-flash');
		expect(
			DEFAULT_WORK_AGENT_PRECEDENCE.map((rule) => rule.channel),
		).toEqual(['model', 'environment', 'provider', 'client']);
		const providerFirst = [
			...DEFAULT_WORK_AGENT_PRECEDENCE.filter(
				(rule) => rule.channel === 'provider',
			),
			...DEFAULT_WORK_AGENT_PRECEDENCE.filter(
				(rule) => rule.channel !== 'provider',
			),
		];
		expect(resolveWorkAgentId(both, providerFirst).id).toBe('gpt-6');
	});
});

describe('a spelling that fits several known models (f00777)', () => {
	it('stays as written, and says which models it could have been', async () => {
		const { canonicalModelReading } = await import(
			'@delendai/core/lib/work-identity/model-spelling.helper'
		);
		const reading = canonicalModelReading('minimax-3.1', [
			'minimax-m3.1-flash-preview',
			'minimax-m3.1-pro',
		]);
		expect(reading.id).toBe('minimax-3.1');
		expect(reading.ambiguous).toEqual([
			'minimax-m3.1-flash-preview',
			'minimax-m3.1-pro',
		]);
		expect(
			canonicalModelReading('minimax-m3.1-pro', ['minimax-m3.1-pro'])
				.ambiguous,
		).toEqual([]);
	});
});
