/**
 * resolve-work-agent.spec.ts — one answer to "who is working", and the
 * machine is never it.
 */
import { describe, expect, it } from 'vitest';

import {
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
		expect(resolveWorkAgentId({ client: 'codex-mcp-client' })).toEqual({
			id: 'codex-mcp-client',
			source: 'client',
		});
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
			id: 'claude-code',
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
