/**
 * detect-agent.spec.ts — the client → {id,kind,extension} table.
 *
 * Acceptance (f00067 S3): the table covers at least GitHub Copilot Chat,
 * Claude Code, Codex CLI, Cursor, Aider, Continue, plus the headless
 * `cli-doctor` / `cli-direct` hosts, and a user `clientMap` can name an
 * unknown client without a code change.
 */
import { describe, expect, it } from 'vitest';

import { detectAgent } from '../../../src/lib/detect-agent';

describe('detectAgent', () => {
	it('maps every client the proposal calls out', () => {
		const cases: Array<[string, string, string]> = [
			['GitHub Copilot Chat', 'copilot', 'vscode-copilot'],
			['Claude Code', 'claude-code', 'claude-code'],
			['Codex CLI', 'codex', 'codex-cli'],
			['Cursor', 'cursor', 'cursor'],
			['Aider', 'aider', 'aider'],
			['Continue', 'continue', 'continue'],
			['cli-doctor', 'cli-doctor', 'cli'],
			['cli-direct', 'cli-direct', 'cli'],
		];
		for (const [name, kind, extension] of cases) {
			const agent = detectAgent(name);
			expect(agent.kind).toBe(kind);
			expect(agent.extension).toBe(extension);
			expect(agent.id).toBe(name);
		}
	});

	it('is case-insensitive on the client name', () => {
		expect(detectAgent('CLAUDE CODE').kind).toBe('claude-code');
		expect(detectAgent('cursor').extension).toBe('cursor');
	});

	it('falls back to unknown for an unmapped client', () => {
		const agent = detectAgent('SomeRandomClient');
		expect(agent.kind).toBe('unknown');
		expect(agent.extension).toBe('unknown');
		expect(agent.id).toBe('SomeRandomClient');
	});

	it('returns unknown/unknown for an absent client name', () => {
		const agent = detectAgent(undefined);
		expect(agent.kind).toBe('unknown');
		expect(agent.id).toBe('unknown');
	});

	it('honours a user clientMap override (exact + case-insensitive)', () => {
		const map = {
			'My IDE': { kind: 'my-ide', extension: 'my-ide-ext' },
			lowercased: { kind: 'low', extension: 'low-ext' },
		};
		expect(detectAgent('My IDE', map)).toEqual({
			id: 'My IDE',
			kind: 'my-ide',
			extension: 'my-ide-ext',
		});
		expect(detectAgent('LOWERCASED', map).kind).toBe('low');
	});

	it('lets clientMap override a built-in entry', () => {
		const map = { cursor: { kind: 'cursor-pro', extension: 'cursor-x' } };
		expect(detectAgent('cursor', map).kind).toBe('cursor-pro');
	});
});
