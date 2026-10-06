import { describe, expect, it } from 'vitest';

import {
	DEFAULT_MAX_CORE_PUBLIC_EXPORTS,
	evaluateCorePublicSurfaceBudget,
	main,
} from './core-public-surface-budget.script';

describe('evaluateCorePublicSurfaceBudget', () => {
	it('passes when exports stay within the budget', () => {
		const report = evaluateCorePublicSurfaceBudget(
			DEFAULT_MAX_CORE_PUBLIC_EXPORTS,
			DEFAULT_MAX_CORE_PUBLIC_EXPORTS,
		);
		expect(report.ok).toBe(true);
		expect(report.excess).toBe(0);
		expect(report.message).toContain('within budget');
	});

	it('fails when exports exceed the budget', () => {
		const report = evaluateCorePublicSurfaceBudget(
			DEFAULT_MAX_CORE_PUBLIC_EXPORTS + 1,
			DEFAULT_MAX_CORE_PUBLIC_EXPORTS,
		);
		expect(report.ok).toBe(false);
		expect(report.excess).toBe(1);
		expect(report.message).toContain('exceeds budget');
	});
});

describe('main', () => {
	it('returns 0 and writes to stdout when the budget passes', async () => {
		let stdout = '';
		let stderr = '';
		const exitCode = await main({
			countExports: async () => DEFAULT_MAX_CORE_PUBLIC_EXPORTS,
			stdout: {
				write: (chunk: string) => {
					stdout += chunk;
					return true;
				},
			},
			stderr: {
				write: (chunk: string) => {
					stderr += chunk;
					return true;
				},
			},
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain('within budget');
		expect(stderr).toBe('');
	});

	it('returns 1 and writes to stderr when the budget fails', async () => {
		let stdout = '';
		let stderr = '';
		const exitCode = await main({
			countExports: async () => DEFAULT_MAX_CORE_PUBLIC_EXPORTS + 3,
			stdout: {
				write: (chunk: string) => {
					stdout += chunk;
					return true;
				},
			},
			stderr: {
				write: (chunk: string) => {
					stderr += chunk;
					return true;
				},
			},
		});
		expect(exitCode).toBe(1);
		expect(stdout).toBe('');
		expect(stderr).toContain('exceeds budget');
	});

	it('returns 2 for an invalid --max override', async () => {
		let stderr = '';
		const exitCode = await main({
			argv: ['--max=not-a-number'],
			countExports: async () => DEFAULT_MAX_CORE_PUBLIC_EXPORTS,
			stdout: { write: () => true },
			stderr: {
				write: (chunk: string) => {
					stderr += chunk;
					return true;
				},
			},
		});
		expect(exitCode).toBe(2);
		expect(stderr).toContain('invalid --max value');
	});

	it('accepts a CLI override for the budget ceiling', async () => {
		let stdout = '';
		const exitCode = await main({
			argv: ['--max=800'],
			countExports: async () => 800,
			stdout: {
				write: (chunk: string) => {
					stdout += chunk;
					return true;
				},
			},
			stderr: { write: () => true },
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain('800/800');
	});
});
