/**
 * shell-fallback.spec.ts — f00085 S1 + S3.
 *
 * Unit specs for the agent shell-fallback ladder:
 *   - Ring 1 detector: `detectStuckShell` regex/sentinel matching, and
 *     the negative cases (intentional failures must NOT be "stuck").
 *   - The ladder: `withShellFallback` escalation order across the three
 *     rings via an injected driver seam.
 *   - Ring 3 adapter: `mapShellIntentToTool` intent → tool mapping
 *     table, including the fall-through to `null` for uncovered intents.
 *
 * Run: bun test packages/core/tests/src/lib/agents/shell-fallback.spec.ts
 */

import { describe, expect, it } from 'vitest';

import {
	detectStuckShell,
	mapShellIntentToTool,
	STUCK_SHELL_SENTINELS,
	withShellFallback,
	type IShellFallbackDriver,
	type IShellResult,
} from '../../../../src/lib/agents/shell-fallback';

describe('detectStuckShell (Ring 1)', () => {
	it('fires on the Spanish "búfer alternativo" sentinel with no exit code', () => {
		const result: IShellResult = {
			output: 'El comando abrió el búfer alternativo.',
		};
		expect(detectStuckShell(result)).toBe(true);
	});

	it('fires on the accent-stripped Spanish variant', () => {
		expect(
			detectStuckShell({
				output: 'El comando abrio el bufer alternativo',
			}),
		).toBe(true);
	});

	it('fires on the English "open alternative buffer" variant', () => {
		expect(
			detectStuckShell({
				output: 'The command tried to open alternative buffer',
			}),
		).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(
			detectStuckShell({
				output: 'EL COMANDO ABRIÓ EL BÚFER ALTERNATIVO.',
			}),
		).toBe(true);
	});

	it('does NOT fire on a normal command failure (non-zero exit, real output)', () => {
		const result: IShellResult = {
			output: 'fatal: not a git repository',
			exitCode: 128,
		};
		expect(detectStuckShell(result)).toBe(false);
	});

	it('does NOT fire when a terminal id is present (async recovered)', () => {
		const result: IShellResult = {
			output: 'El comando abrió el búfer alternativo.',
			terminalId: 'uuid-1234',
		};
		expect(detectStuckShell(result)).toBe(false);
	});

	it('does NOT fire on empty/missing output', () => {
		expect(detectStuckShell({ output: '' })).toBe(false);
		expect(detectStuckShell({})).toBe(false);
		expect(detectStuckShell(null)).toBe(false);
		expect(detectStuckShell(undefined)).toBe(false);
	});

	it('does NOT fire on ordinary successful output', () => {
		expect(
			detectStuckShell({ output: 'all tests passed', exitCode: 0 }),
		).toBe(false);
	});

	it('exposes a non-empty sentinel table', () => {
		expect(STUCK_SHELL_SENTINELS.length).toBeGreaterThan(0);
		for (const s of STUCK_SHELL_SENTINELS) {
			expect(s).toBe(s.toLowerCase());
		}
	});
});

describe('withShellFallback (the ladder)', () => {
	it('Ring 1: returns sync result when not stuck', async () => {
		const driver: IShellFallbackDriver = {
			runSync: () => ({ output: 'ok', exitCode: 0 }),
		};
		const outcome = await withShellFallback('git status', driver);
		expect(outcome.ring).toBe('sync');
		expect(outcome.result?.output).toBe('ok');
	});

	it('Ring 2: escalates to async on a stuck sync sentinel and polls', async () => {
		const calls: string[] = [];
		const driver: IShellFallbackDriver = {
			runSync: () => {
				calls.push('sync');
				return { output: 'El comando abrió el búfer alternativo.' };
			},
			runAsync: () => {
				calls.push('async');
				return { terminalId: 'uuid-9', output: '' };
			},
			pollAsync: () => {
				calls.push('poll');
				return {
					output: 'real output',
					exitCode: 0,
					terminalId: 'uuid-9',
				};
			},
		};
		const outcome = await withShellFallback('bun run validate', driver);
		expect(outcome.ring).toBe('async');
		expect(outcome.result?.output).toBe('real output');
		// The stuck sync call is issued exactly once — never retried.
		expect(calls).toEqual(['sync', 'async', 'poll']);
	});

	it('never retries the stuck sync call', async () => {
		let syncCalls = 0;
		const driver: IShellFallbackDriver = {
			runSync: () => {
				syncCalls += 1;
				return { output: 'opened the alternate buffer' };
			},
			runAsync: () => ({ output: 'fell through', exitCode: 0 }),
		};
		await withShellFallback('cmd', driver);
		expect(syncCalls).toBe(1);
	});

	it('Ring 2: handles async without a poll seam', async () => {
		const driver: IShellFallbackDriver = {
			runAsync: () => ({ output: 'direct async', exitCode: 0 }),
		};
		const outcome = await withShellFallback('cmd', driver);
		expect(outcome.ring).toBe('async');
		expect(outcome.result?.output).toBe('direct async');
	});

	it('Ring 3: falls to file-tools when no shell is available', async () => {
		const outcome = await withShellFallback('cat foo', {});
		expect(outcome.ring).toBe('file-tools');
		expect(outcome.trail.join(' ')).toContain('mapShellIntentToTool');
	});

	it('Ring 3: falls to file-tools when async also stuck', async () => {
		const driver: IShellFallbackDriver = {
			runSync: () => ({
				output: 'el comando abrió el búfer alternativo',
			}),
			runAsync: () => ({ output: 'opened an alternate screen buffer' }),
		};
		const outcome = await withShellFallback('cmd', driver);
		expect(outcome.ring).toBe('file-tools');
	});
});

describe('mapShellIntentToTool (Ring 3 adapter)', () => {
	it('maps cat → read_file with the path', () => {
		const plan = mapShellIntentToTool({ command: 'cat', args: ['a.txt'] });
		expect(plan?.tool).toBe('read_file');
		expect(plan?.note).toContain('a.txt');
	});

	it('maps head/tail → read_file', () => {
		expect(mapShellIntentToTool({ command: 'head', args: [] })?.tool).toBe(
			'read_file',
		);
		expect(mapShellIntentToTool({ command: 'tail', args: [] })?.tool).toBe(
			'read_file',
		);
	});

	it('maps grep → grep_search with the pattern', () => {
		const plan = mapShellIntentToTool({
			command: 'grep',
			args: ['-r', 'needle'],
		});
		expect(plan?.tool).toBe('grep_search');
		expect(plan?.note).toContain('needle');
	});

	it('maps find/ls → file_search', () => {
		expect(mapShellIntentToTool({ command: 'find', args: [] })?.tool).toBe(
			'file_search',
		);
		expect(mapShellIntentToTool({ command: 'ls', args: [] })?.tool).toBe(
			'file_search',
		);
	});

	it('maps mkdir → create_file guidance', () => {
		expect(
			mapShellIntentToTool({ command: 'mkdir', args: ['d'] })?.tool,
		).toBe('create_file');
	});

	it('maps git status/diff/log → git MCP tools', () => {
		expect(
			mapShellIntentToTool({ command: 'git', args: ['status'] })?.tool,
		).toBe('mcp-vertex_git_status');
		expect(
			mapShellIntentToTool({ command: 'git', args: ['diff'] })?.tool,
		).toBe('mcp-vertex_git_diff');
		expect(
			mapShellIntentToTool({ command: 'git', args: ['log'] })?.tool,
		).toBe('mcp-vertex_git_log');
	});

	it('returns null for an uncovered git sub-command', () => {
		expect(
			mapShellIntentToTool({ command: 'git', args: ['push'] }),
		).toBeNull();
	});

	it('returns null for an uncovered command', () => {
		expect(mapShellIntentToTool({ command: 'curl', args: [] })).toBeNull();
	});

	it('returns null defensively for empty/missing intent', () => {
		expect(mapShellIntentToTool(null)).toBeNull();
		expect(mapShellIntentToTool(undefined)).toBeNull();
		expect(mapShellIntentToTool({ command: '', args: [] })).toBeNull();
	});
});
