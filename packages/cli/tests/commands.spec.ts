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
	'init:default',
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
	'deps list',
	'deps check',
	'deps polyglot',
	'rules get',
	'rules check',
	'rules apply',
	'test-convention get',
	'test-convention suggest',
	'test-convention scan',
	'quality scopes',
	'quality run',
	'quality cancel',
	'quality run-all',
	'audit plan',
	'audit consolidate',
	'logs query',
	'logs tail',
	'logs subscribe',
	'logs correlate',
	'logs redact-test',
	'fs read',
	'fs write',
	'knowledge',
	'project analyze',
	'project plan',
	'project create',
	'docs search',
	'proposals auto-work',
	'proposals continue',
	'proposals create',
	'proposals close-slice',
	'proposals transition',
	'proposals board',
	'proposals status',
	'proposals health',
	'proposals agent-names',
	'proposals lock',
	'proposals worktree',
	'proposals stale-list',
	'proposals round-context',
	'proposals workflow',
	'proposals diagnose',
	'proposals adopt',
	'proposals force-transition',
	'proposals reconcile-folder',
	'proposals state-repair',
	'proposals release-orphan',
	'proposals review',
	'proposals sync',
	'proposals task-queue',
	'proposals delegate',
	'proposals plan',
	'notification status',
	'notification await-lock',
	'web-fetch',
	'status-marker close',
	'status-marker validate',
	'status-marker ping',
	'conventions check',
	'conventions plan',
	'conventions apply',
	'doctor',
	'completion',
] as const;

describe('CLI command registry', async () => {
	it('registers the complete public command surface', async () => {
		const names = (await registerAllCommands()).map(
			(command) => command.name,
		);
		expect(names).toEqual(EXPECTED_COMMANDS);
	});

	it('keeps every command documented with a summary', async () => {
		for (const command of await registerAllCommands()) {
			expect(command.summary.trim().length).toBeGreaterThan(0);
		}
	});

	it('does not register duplicate command names', async () => {
		const names = (await registerAllCommands()).map(
			(command) => command.name,
		);
		expect(new Set(names).size).toBe(names.length);
	});
});
