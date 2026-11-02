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

	it('leaves out the step --skip names', async () => {
		const stdout: string[] = [];
		const code = await main(['--dry-run', '--skip', 'validate'], {
			loadSteps: async () => TEST_STEPS,
			out: (msg) => stdout.push(msg),
			err: () => undefined,
		});
		expect(code).toBe(0);
		expect(stdout.join('\n')).toContain('typecheck');
		expect(stdout.join('\n')).not.toContain('bun run validate');
	});

	it('names every failing step, not only the first', async () => {
		const stderr: string[] = [];
		const code = await main(['--real'], {
			loadSteps: async () => TEST_STEPS,
			runStep: async (step) => (step.name === 'typecheck' ? 0 : 3),
			out: () => undefined,
			err: (msg) => stderr.push(msg),
		});
		expect(code).toBe(3);
		expect(stderr.join('\n')).toContain('validate');
		expect(stderr.join('\n')).toContain('lint:proposals');
	});

	it('keeps only what no workflow runs', async () => {
		const stdout: string[] = [];
		await main(['--dry-run', '--not-in-ci'], {
			loadSteps: async () => TEST_STEPS,
			scripts: {
				typecheck: 'tsc',
				validate: 'bun run typecheck && bun run lint:other',
				'lint:other': 'bun tools/scripts/lint/other.script.ts',
			},
			workflows: 'run: bun run typecheck',
			out: (msg) => stdout.push(msg),
			err: () => undefined,
		});
		const listed = stdout.join('\n');
		expect(listed).not.toContain('bun run typecheck');
		expect(listed).not.toContain('bun run validate');
		expect(listed).toContain('tools/scripts/lint/other.script.ts');
		expect(listed).toContain('lint:proposals');
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
