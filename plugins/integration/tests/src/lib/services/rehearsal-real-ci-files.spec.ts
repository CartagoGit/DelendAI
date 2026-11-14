/**
 * rehearsal-real-ci-files.spec.ts — the files a real-mode setup commit
 * writes must be workflows GitHub accepts: this repository's own CI and
 * CodeQL files, and a 2-space and a 4-space project, parsed as YAML.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { realModeFiles } from '../../../../src/lib/services/rehearsal-real-ci.service';
import {
	createRehearsalSetup,
	rehearsalPolicy,
} from '../../../../src/lib/services/rehearsal-setup.helper';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../'.repeat(6));
const readRepo = (path: string): string =>
	readFileSync(join(ROOT, path), 'utf8');

interface IJob {
	readonly needs?: string | readonly string[];
	readonly steps?: readonly Record<string, unknown>[];
}

const jobsOf = (text: string): Record<string, IJob> =>
	(parse(text) as { jobs: Record<string, IJob> }).jobs;

const fixture = (unit: number): string => {
	const pad = (level: number): string => ' '.repeat(level * unit);
	return [
		'name: CI',
		'on:',
		`${pad(1)}pull_request:`,
		`${pad(2)}branches: [develop]`,
		'jobs:',
		`${pad(1)}build:`,
		`${pad(2)}runs-on: ubuntu-latest`,
		`${pad(2)}steps:`,
		`${pad(3)}- name: Build`,
		`${pad(3)}  run: echo build`,
		`${pad(1)}test:`,
		`${pad(2)}runs-on: ubuntu-latest`,
		`${pad(2)}steps:`,
		`${pad(3)}- run: echo test`,
		'',
	].join('\n');
};

/** The rendered job parses, needs every other job, and carries the wake step whole. */
const expectSignalIn = (text: string, others: readonly string[]): void => {
	const jobs = jobsOf(text);
	const signal = jobs['integration-signal'];
	expect(signal?.needs).toEqual(others);
	const step = signal?.steps?.[0] as {
		env: Record<string, string>;
		run: string;
	};
	expect(step.env.GH_TOKEN).toBe('${{ github.token }}');
	expect(step.run).toContain('gh workflow run land.yml');
	expect(step.run).toContain(
		'|| echo "::warning::could not wake the integrator"',
	);
};

const expectNoBrokenNeeds = (text: string): void => {
	const jobs = jobsOf(text);
	for (const [id, job] of Object.entries(jobs))
		for (const need of [job.needs ?? []].flat()) {
			expect(need).not.toBe(id);
			expect(Object.keys(jobs)).toContain(need);
		}
};

describe('the real-mode workflow files', () => {
	it('[<20ms] append a parseable signal job to a 2-space and a 4-space project', () => {
		for (const unit of [2, 4]) {
			const [ci] = realModeFiles({
				integration: 'x',
				workflows: { 'ci.yml': fixture(unit) },
			});
			const text = ci?.content ?? '';
			expectSignalIn(text, ['build', 'test']);
			expectNoBrokenNeeds(text);
			expect(text).not.toMatch(/\t/u);
		}
	});

	it("[<100ms] parse for this repository's own ci.yml and codeql.yml, and never wait on themselves", () => {
		const files = realModeFiles({
			integration: 'ns/rehearsal/r1/integration',
			workflows: {
				'ci.yml': readRepo('.github/workflows/ci.yml'),
				'codeql.yml': readRepo('.github/workflows/codeql.yml'),
			},
		});
		expect(files).toHaveLength(2);
		for (const file of files) {
			const content = file.content ?? '';
			expectNoBrokenNeeds(content);
			expect(content.match(/^ +integration-signal:$/gmu)).toHaveLength(1);
		}
		const codeql = files.find((f) => f.path.endsWith('codeql.yml'));
		expectSignalIn(codeql?.content ?? '', ['analyze']);
	});

	it('[<20ms] leave a CI that already has the signal job as the project wrote it', () => {
		const own = readRepo('.github/workflows/ci.yml');
		const [ci] = realModeFiles({
			integration: 'x',
			workflows: { 'ci.yml': own },
		});
		expect(jobsOf(ci?.content ?? '')['integration-signal']?.needs).toEqual(
			jobsOf(own)['integration-signal']?.needs,
		);
	});

	it("[<20ms] keep the project's required checks in the real-mode policy", () => {
		const text = readRepo('delendai.config.json');
		const original = JSON.parse(text).development.integration;
		expect(original.requiredChecks).toEqual([
			'delendai-validate',
			'CodeQL',
		]);
		const direct = JSON.parse(rehearsalPolicy(text, 'b', true, 'r1'))
			.development.integration;
		expect(direct.requiredChecks).toEqual(original.requiredChecks);
		const policy = createRehearsalSetup({
			runId: 'r1',
			branchPrefix: 'ns/rehearsal/',
			policyText: text,
			integratorWorkflow: () => 'land',
			realWorkflows: {},
		})
			.files('b')
			.find((file) => file.path === 'delendai.config.json');
		expect(
			JSON.parse(policy?.content ?? '{}').development.integration
				.requiredChecks,
		).toEqual(original.requiredChecks);
	});
});
