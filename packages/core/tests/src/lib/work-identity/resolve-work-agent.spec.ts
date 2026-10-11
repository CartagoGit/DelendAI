/**
 * resolve-work-agent.spec.ts — one answer to "who is working", and the
 * machine is never it.
 */
import { describe, expect, it } from 'vitest';

import {
	CLIENT_ID_PREFIX,
	normalizeWorkAgentId,
	resolveWorkAgentId,
	WORK_AGENT_UNKNOWN,
} from '@delendai/core/lib/work-identity/resolve-work-agent.service';

describe('resolveWorkAgentId (x00560)', () => {
	it('prefers the exact model over everything else', () => {
		expect(
			resolveWorkAgentId({
				model: 'claude-opus-5',
				environment: 'claude-code',
				client: 'Visual Studio Code',
			}),
		).toEqual({ id: 'claude-opus-5', source: 'model' });
	});

	it('falls back to what the environment declares, then to the client', () => {
		expect(
			resolveWorkAgentId({
				environment: 'codex',
				client: 'Visual Studio Code',
			}),
		).toEqual({ id: 'codex', source: 'environment' });
		// Marked, because the handshake reports the APPLICATION that
		// connected. Unmarked it read exactly like a model, which is how
		// `delendai/wip/claude-code/…` came to sit in this repository's
		// graph beside `delendai/wip/claude-opus-5/…`.
		expect(resolveWorkAgentId({ client: 'codex-mcp-client' })).toEqual({
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
		expect(resolveWorkAgentId({})).toEqual({
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
		expect(resolveWorkAgentId(sources)).toEqual({
			id: 'client-claude-code',
			source: 'client',
		});
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
		expect(resolveWorkAgentId({ model: '!!!' })).toEqual({
			id: WORK_AGENT_UNKNOWN,
			source: 'none',
		});
	});

	it('asks the next source instead of shadowing it', () => {
		// The damaging half: a host offering punctuation as its model hid
		// a perfectly good environment behind it.
		expect(
			resolveWorkAgentId({ model: '!!!', environment: 'codex' }),
		).toEqual({ id: 'codex', source: 'environment' });
	});

	it('falls all the way through to the client', () => {
		expect(
			resolveWorkAgentId({
				model: '!!!',
				environment: '???',
				client: 'visual-studio-code',
			}),
		).toEqual({ id: 'client-visual-studio-code', source: 'client' });
	});

	it('answers unknown when no source survives', () => {
		expect(
			resolveWorkAgentId({
				model: '!!!',
				environment: '???',
				client: '@@@',
			}),
		).toEqual({ id: WORK_AGENT_UNKNOWN, source: 'none' });
	});

	it('still prefers the first source that does survive', () => {
		expect(
			resolveWorkAgentId({
				model: 'claude-opus-5',
				environment: 'codex',
			}),
		).toEqual({ id: 'claude-opus-5', source: 'model' });
	});
});
