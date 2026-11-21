/**
 * cli-tool-scope.spec.ts — a hop scoped to its tools is told so in its
 * client's own flags, and carries nothing it will not use.
 */
import { knownClientOf } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import { buildCliArgs } from '../../../../src/lib/subprocess/cli';

const claude = knownClientOf('claude', '/work');
const codex = knownClientOf('codex', '/work');

describe('buildCliArgs', () => {
	it('adds nothing to a hop that names no tools', () => {
		expect(buildCliArgs(['-p'], 'task', undefined, claude)).toEqual([
			'-p',
			'task',
		]);
		expect(buildCliArgs(['-p'], 'task', [], claude)).toEqual([
			'-p',
			'task',
		]);
	});

	it('limits Claude Code to the tools, and leaves out skills and MCP servers', () => {
		// 25,801 cache tokens with everything loaded, 10,695 with Read
		// and Edit only (measured 2026-10-20).
		expect(buildCliArgs(['-p'], 'task', ['Read', 'Edit'], claude)).toEqual([
			'-p',
			'task',
			'--tools',
			'Read,Edit',
			'--allowedTools',
			'Read,Edit',
			'--disable-slash-commands',
			'--strict-mcp-config',
		]);
	});

	it('keeps MCP servers for a hop whose tools name one', () => {
		const argv = buildCliArgs(
			['-p'],
			'task',
			['Read', 'mcp__delendai__work'],
			claude,
		);
		expect(argv).toContain('--disable-slash-commands');
		expect(argv).not.toContain('--strict-mcp-config');
	});

	it('tells a known client with no tool flag nothing it would reject', () => {
		// Codex has no --allowedTools: appending it failed the hop.
		expect(buildCliArgs(['exec'], 'task', ['Read'], codex)).toEqual([
			'exec',
			'task',
		]);
	});

	it('keeps --allowedTools for a command it does not know', () => {
		expect(buildCliArgs(['-p'], 'task', ['Read'])).toEqual([
			'-p',
			'task',
			'--allowedTools',
			'Read',
		]);
	});
});
