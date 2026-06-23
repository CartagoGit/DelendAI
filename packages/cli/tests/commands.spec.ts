import { describe, expect, it } from 'vitest';

import { registerAllCommands } from '../src/commands/registry';

const EXPECTED_COMMANDS = [
	'status',
	'overview',
	'plugin list',
	'plugin inspect',
	'metrics',
	'validate-matrix',
	'validate',
	'config schema',
	'config show',
	'config get',
	'config doctor',
	'config set',
	'init',
	'search',
	'docs list',
	'docs read',
	'scaffold',
	'git status',
	'git changed',
	'git diff',
	'git log',
	'git blame',
	'git show',
	'git worktree',
	'memory save',
	'memory recall',
	'memory list',
	'memory forget',
	'memory export',
	'memory import',
] as const;

describe('CLI command registry', () => {
	it('registers the complete public command surface', () => {
		const names = registerAllCommands().map((command) => command.name);
		expect(names).toEqual(EXPECTED_COMMANDS);
	});

	it('keeps every command documented with a summary', () => {
		for (const command of registerAllCommands()) {
			expect(command.summary.trim().length).toBeGreaterThan(0);
		}
	});

	it('does not register duplicate command names', () => {
		const names = registerAllCommands().map((command) => command.name);
		expect(new Set(names).size).toBe(names.length);
	});
});
