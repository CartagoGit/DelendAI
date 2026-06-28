/**
 * f00082 S1 — pure helpers contract guard.
 *
 * Pins the four guarantees the helpers make:
 *
 *  1. `slugify` collapses anything non-`[a-z0-9]` to `-` and
 *     falls back to `'unknown'` on the empty string.
 *  2. `composeIdentity` returns the four-field composite in the
 *     canonical order, omits empty fields, and bounds the total
 *     at `AGENT_IDENTITY_LIMITS.composite` (92 chars).
 *  3. `parseIdentity` is **lossy-friendly** — unknown hosts /
 *     models pass through as `'unknown'` instead of throwing.
 *  4. `nextCollisionSuffix` is deterministic and gap-filling:
 *     when the composite is free, returns `null`; when the bare
 *     composite is taken, picks the smallest `n ≥ 1` whose
 *     `<composite>-<n>` is also free.
 */
import { describe, expect, it } from 'vitest';

import {
	composeIdentity,
	nextCollisionSuffix,
	parseIdentity,
	slugify,
	slugifyAgentName,
	slugifyHost,
	slugifyModel,
	slugifyTaskId,
} from '@mcp-vertex/proposals/lib/shared/agent-identity';

describe('slugify', () => {
	it('keeps lowercase alphanumerics and dashes', () => {
		expect(slugify('copilot')).toBe('copilot');
		expect(slugify('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
	});

	it('collapses non-slug chars to single dashes', () => {
		expect(slugify('GitHub Copilot Chat')).toBe('github-copilot-chat');
		expect(slugify('claude-3.5-sonnet:20240620')).toBe(
			'claude-3-5-sonnet-20240620',
		);
		expect(slugify('  leading-and-trailing  ')).toBe('leading-and-trailing');
	});

	it('falls back to "unknown" on empty input', () => {
		expect(slugify('')).toBe('unknown');
		expect(slugify('   ')).toBe('unknown');
		expect(slugify('!!!')).toBe('unknown');
	});
});

describe('slugifyHost', () => {
	it('returns the canonical short slug for known hosts', () => {
		expect(slugifyHost('vscode-copilot')).toBe('copilot');
		expect(slugifyHost('claude-code')).toBe('claude-code');
		expect(slugifyHost('codex-cli')).toBe('codex-cli');
	});

	it('returns empty string when host is undefined (composer omits it)', () => {
		expect(slugifyHost(undefined)).toBe('');
	});

	it('returns empty string for the "unknown" sentinel (composer omits it)', () => {
		expect(slugifyHost('unknown')).toBe('');
	});
});

describe('slugifyModel / slugifyTaskId / slugifyAgentName', () => {
	it('slugifyModel caps at 24 chars and falls back to empty on undefined', () => {
		expect(slugifyModel('m3')).toBe('m3');
		expect(slugifyModel('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
		expect(slugifyModel('a'.repeat(40))).toHaveLength(24);
		expect(slugifyModel(undefined)).toBe('');
	});

	it('slugifyTaskId accepts proposal ids verbatim', () => {
		expect(slugifyTaskId('f00078')).toBe('f00078');
		expect(slugifyTaskId('x00076')).toBe('x00076');
		expect(slugifyTaskId(undefined)).toBe('');
	});

	it('slugifyAgentName is required and always non-empty', () => {
		expect(slugifyAgentName('orion')).toBe('orion');
		expect(slugifyAgentName('copilot-minimax-m3')).toBe('copilot-minimax-m3');
		// agent_name is the required field; even garbage normalises
		// to something the engine can put in a branch.
		expect(slugifyAgentName('!!!')).toBe('unknown');
	});
});

describe('composeIdentity', () => {
	it('composes the canonical 4-field order host-model-agent-task', () => {
		expect(
			composeIdentity({
				agent_name: 'orion',
				host: 'vscode-copilot',
				model: 'm3',
				task_id: 'f00078',
			}),
		).toBe('copilot-m3-orion-f00078');
	});

	it('omits empty fields (undefined host/model/task)', () => {
		expect(
			composeIdentity({ agent_name: 'orion', host: 'vscode-copilot' }),
		).toBe('copilot-orion');
		expect(composeIdentity({ agent_name: 'orion' })).toBe('orion');
	});

	it('preserves the historical single-arg layout for legacy callers', () => {
		// `agent_name: "copilot-minimax-m3"` is the manual host pair
		// the user picks; without host/model/task the engine must
		// keep emitting `agent/copilot-minimax-m3` (the bug fix
		// for the 28-Jun incident).
		expect(composeIdentity({ agent_name: 'copilot-minimax-m3' })).toBe(
			'copilot-minimax-m3',
		);
	});

	it('bounds the composite at 92 chars and trims the suffix fields first', () => {
		const longModel = 'a'.repeat(30);
		const longTask = 'b'.repeat(30);
		const composite = composeIdentity({
			agent_name: 'orion',
			host: 'vscode-copilot',
			model: longModel,
			task_id: longTask,
		});
		expect(composite.length).toBeLessThanOrEqual(92);
		// The trim keeps the host intact (always informative) and
		// shortens the rightmost fields first.
		expect(composite.startsWith('copilot-')).toBe(true);
		expect(composite).toContain('orion');
	});

	it('still produces a unique composite when every field is long', () => {
		const composite = composeIdentity({
			agent_name: 'andromeda-vela-orion-cassiopeia',
			host: 'vscode-copilot',
			model: 'x'.repeat(30),
			task_id: 'y'.repeat(30),
		});
		expect(composite.length).toBeLessThanOrEqual(92);
		// The agent_name is shortened as a last resort but host
		// and task_id are preserved.
		expect(composite).toMatch(/^copilot-/);
	});
});

describe('parseIdentity', () => {
	it('round-trips a canonical 4-field composite', () => {
		const parsed = parseIdentity('copilot-m3-orion-f00078');
		expect(parsed.host).toBe('vscode-copilot');
		expect(parsed.model).toBe('m3');
		expect(parsed.agent_name).toBe('orion');
		expect(parsed.task_id).toBe('f00078');
	});

	it('falls back to host: "unknown" for non-canonical host slugs', () => {
		const parsed = parseIdentity('weirdhost-m3-orion-f00078');
		expect(parsed.host).toBe('unknown');
	});

	it('round-trips the historical single-arg shape as a single agent_name', () => {
		const parsed = parseIdentity('copilot-minimax-m3');
		expect(parsed.agent_name).toBe('copilot-minimax-m3');
		expect(parsed.host).toBe('vscode-copilot');
		expect(parsed.task_id).toBeUndefined();
	});
});

describe('nextCollisionSuffix', () => {
	it('returns null when the bare composite is free', () => {
		expect(
			nextCollisionSuffix(new Set(), 'copilot-m3-orion-f00078'),
		).toBeNull();
		expect(
			nextCollisionSuffix(new Set(['other-branch']), 'copilot-m3-orion-f00078'),
		).toBeNull();
	});

	it('returns 1 when the bare composite is taken', () => {
		expect(
			nextCollisionSuffix(
				new Set(['copilot-m3-orion-f00078']),
				'copilot-m3-orion-f00078',
			),
		).toBe(1);
	});

	it('picks the smallest free n (gap-filling)', () => {
		const taken = new Set([
			'copilot-m3-orion-f00078',
			'copilot-m3-orion-f00078-1',
			'copilot-m3-orion-f00078-3',
		]);
		expect(nextCollisionSuffix(taken, 'copilot-m3-orion-f00078')).toBe(2);
	});

	it('does not match unrelated branches that share a prefix', () => {
		// The bare composite IS in the set; an unrelated branch
		// with the same prefix but a non-numeric suffix must not
		// inflate the returned `n`.
		const taken = new Set([
			'copilot-m3-orion-f00078',
			'copilot-m3-orion-f00078-extra',
		]);
		expect(nextCollisionSuffix(taken, 'copilot-m3-orion-f00078')).toBe(1);
	});
});
