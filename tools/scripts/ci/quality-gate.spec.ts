import { describe, expect, it } from 'vitest';

import { main, type IStep } from './quality-gate.script.ts';

const TEST_STEPS: readonly IStep[] = [
	{
		name: 'typecheck',
		cmd: ['bun', 'run', 'typecheck'],
		description: 'Typecheck.',
	},
	{
		name: 'lint:proposals',
		aliases: ['proposals'],
		cmd: ['bun', 'tools/scripts/lint/proposals.script.ts'],
		description: 'Proposal lint.',
	},
	{
		name: 'validate',
		cmd: ['bun', 'run', 'validate'],
		description: 'Integrated validation.',
	},
];

describe('quality-gate script', () => {
	it('prints every selected step in dry-run mode', async () => {
		const stdout: string[] = [];
		const code = await main(['--dry-run'], {
			loadSteps: async () => TEST_STEPS,
			out: (msg) => stdout.push(msg),
			err: () => undefined,
		});

		expect(code).toBe(0);
		expect(stdout.join('\n')).toContain(
			'[dry-run] typecheck: bun run typecheck',
		);
		expect(stdout.join('\n')).toContain(
			'[dry-run] lint:proposals: bun tools/scripts/lint/proposals.script.ts',
		);
		expect(stdout.join('\n')).toContain(
			'[dry-run] validate: bun run validate',
		);
	});

	it('filters lint steps by bare lint name via --only', async () => {
		const stdout: string[] = [];
		const code = await main(['--dry-run', '--only', 'proposals'], {
			loadSteps: async () => TEST_STEPS,
			out: (msg) => stdout.push(msg),
			err: () => undefined,
		});

		expect(code).toBe(0);
		expect(stdout.join('\n')).toContain(
			'[dry-run] lint:proposals: bun tools/scripts/lint/proposals.script.ts',
		);
		expect(stdout.join('\n')).not.toContain('[dry-run] typecheck:');
		expect(stdout.join('\n')).not.toContain('[dry-run] validate:');
	});

	it('propagates the failing step exit code', async () => {
		const code = await main(['--real', '--only', 'validate'], {
			loadSteps: async () => TEST_STEPS,
			out: () => undefined,
			err: () => undefined,
			runStep: async () => 7,
		});

		expect(code).toBe(7);
	});

	it('returns 2 for an unknown --only selector', async () => {
		const stderr: string[] = [];
		const code = await main(['--dry-run', '--only', 'missing'], {
			loadSteps: async () => TEST_STEPS,
			out: () => undefined,
			err: (msg) => stderr.push(msg),
		});

		expect(code).toBe(2);
		expect(stderr.join('\n')).toContain('unknown --only "missing"');
	});
});
