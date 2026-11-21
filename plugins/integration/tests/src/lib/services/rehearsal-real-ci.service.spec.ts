import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { renderRehearsalCiWorkflow } from '../../../../src/lib/services/rehearsal-ci-workflow.helper';
import {
	createRehearsalSetup,
	rehearsalPolicy,
} from '../../../../src/lib/services/rehearsal-setup.helper';

import {
	judgePrCiWall,
	realModeFiles,
	renderBranchFilters,
	wallSecondsOf,
	withSignalJob,
} from '../../../../src/lib/services/rehearsal-real-ci.service';

const CI = [
	'name: CI',
	'on:',
	'  push:',
	'    branches: [main, develop]',
	'  pull_request:',
	'    branches:',
	'      - develop',
	'      - main',
	'    types: [opened]',
	'jobs:',
	'  a:',
	'    branches: [keep]',
	'',
].join('\n');

describe('renderBranchFilters', () => {
	it('[<5ms] replaces only the integration branch in each trigger list and keeps the others', () => {
		const text = renderBranchFilters(
			CI,
			'ns/rehearsal/r1/integration',
			'develop',
		);
		expect(text).toContain(
			"    branches: [main, 'ns/rehearsal/r1/integration']",
		);
		expect(text).toContain("      - 'ns/rehearsal/r1/integration'");
		expect(text).toContain('      - main');
		expect(text).not.toContain('develop');
		expect(text).toContain('types: [opened]');
		expect(text).toContain('branches: [keep]');
	});
	it('[<5ms] keeps quoted entries and lists that do not name the integration branch', () => {
		const text = renderBranchFilters(
			[
				'on:',
				'  push:',
				'    branches: [\'develop\', "release/*"]',
				'  pull_request:',
				'    branches: [main]',
				'  schedule:',
				'    branches:',
				'      - "develop" # the line',
				'      - main',
				'jobs: {}',
			].join('\n'),
			'r',
			'develop',
		);
		expect(text).toContain('branches: [\'r\', "release/*"]');
		expect(text).toContain('branches: [main]');
		expect(text).toContain("- 'r' # the line");
		expect(text).toContain('- main');
	});
	it("[<50ms] keeps main in this repository's own ci.yml and codeql.yml", () => {
		const branch = 'ns/rehearsal/r1/integration';
		for (const name of ['ci.yml', 'codeql.yml']) {
			const text = renderBranchFilters(
				readRepo(`.github/workflows/${name}`),
				branch,
				'develop',
			);
			const lists = text
				.split('\n')
				.filter((line) => /^\s*branches:/u.test(line));
			expect(lists.length).toBeGreaterThan(0);
			for (const line of lists) expect(line).not.toContain('develop');
			expect(lists.some((line) => line.includes('main'))).toBe(true);
			expect(lists.filter((line) => line.includes(branch)).length).toBe(
				lists.length,
			);
		}
	});
	it('[<5ms] renders each named workflow under the workflows directory', () => {
		const files = realModeFiles({
			integration: 'x',
			projectIntegration: 'develop',
			workflows: { 'ci.yml': CI, 'codeql.yml': CI },
		});
		expect(files.map((f) => f.path)).toEqual([
			'.github/workflows/ci.yml',
			'.github/workflows/codeql.yml',
		]);
	});
	it('[<5ms] ends a pull request CI with the signal job, indented like its own jobs, and leaves other files alone', () => {
		const [ci] = realModeFiles({
			integration: 'x',
			projectIntegration: 'develop',
			workflows: { 'ci.yml': CI },
		});
		expect(ci?.content).toContain('\n  integration-signal:\n');
		expect(ci?.content).toContain('    needs: [a]');
		expect(ci?.content).toContain('gh workflow run land.yml');
		expect(
			ci?.content?.trimEnd().endsWith('could not wake the integrator"'),
		).toBe(true);
		const plain = 'name: x\non:\n  push:\njobs:\n  a:\n    runs-on: x\n';
		expect(withSignalJob(plain, 'x')).toBe(plain);
	});
});

describe('the pull request CI wall time', () => {
	it('[<5ms] is judged against 5 minutes, or 20 when the change also runs the rehearsal', () => {
		expect(judgePrCiWall(299, false).ok).toBe(true);
		expect(judgePrCiWall(300, false).ok).toBe(false);
		expect(judgePrCiWall(900, true).ok).toBe(true);
		expect(judgePrCiWall(1200, true).thresholdMinutes).toBe(20);
	});
	it('[<5ms] spans the first start to the last end', () => {
		expect(wallSecondsOf([])).toBe(0);
		expect(
			wallSecondsOf([
				{ startMs: 1000, endMs: 5000 },
				{ startMs: 2000, endMs: 61000 },
			]),
		).toBe(60);
	});
});

describe('a real-mode setup', () => {
	it('[<5ms] swaps the stand-ins for the project workflows and keeps its required checks', async () => {
		const input = {
			runId: 'r1',
			branchPrefix: 'ns/rehearsal/',
			policyText:
				'{"development":{"integration":{"requiredChecks":["tests"]}}}',
			integratorWorkflow: () => 'land',
		};
		const fast = (await createRehearsalSetup(input).files('b')).map(
			(f) => f.path,
		);
		const real = await createRehearsalSetup({
			...input,
			realWorkflows: { 'ci.yml': CI },
			projectIntegration: 'develop',
		}).files('b');
		expect(fast).toContain('.github/workflows/rehearsal-ci.yml');
		expect(fast).toContain('.github/workflows/land-signal.yml');
		expect(real.map((f) => f.path)).not.toContain(
			'.github/workflows/rehearsal-ci.yml',
		);
		expect(real.map((f) => f.path)).toContain('.github/workflows/ci.yml');
		expect(real.map((f) => f.path)).toContain(
			'.github/workflows/land-signal.yml',
		);
		const policy = real.find((f) => f.path === 'delendai.config.json');
		expect(policy?.content).toContain('"tests"');
	});

	const realInput = {
		runId: 'r1',
		branchPrefix: 'ns/rehearsal/',
		policyText: '{}',
		integratorWorkflow: () => 'land',
		realWorkflows: { 'ci.yml': CI },
		projectIntegration: 'develop',
	};

	it('[<5ms] writes no workflow-token writer, which only the fast mode has', async () => {
		const paths = async (input: typeof realInput) =>
			(await createRehearsalSetup(input).files('b')).map((f) => f.path);
		expect(await paths(realInput)).not.toContain(
			'.github/workflows/rehearsal-token.yml',
		);
		const { realWorkflows: _fast, ...fastInput } = realInput;
		expect(await paths(fastInput as typeof realInput)).toContain(
			'.github/workflows/rehearsal-token.yml',
		);
	});

	it('[<5ms] includes every file the setup command changed, the command winning on a shared path', async () => {
		const seen: { command: string; paths: string[] }[] = [];
		const files = await createRehearsalSetup({
			...realInput,
			setupCommand: 'regenerate',
			materialise: async (command, written) => {
				seen.push({ command, paths: written.map((f) => f.path) });
				return [
					{ path: 'delendai.config.json', content: 'regenerated' },
					{ path: '.github/settings.yml', content: 'settings' },
					{ path: 'gone.txt', content: null },
				];
			},
		}).files('b');
		expect(seen).toHaveLength(1);
		expect(seen[0]?.command).toBe('regenerate');
		expect(seen[0]?.paths).toContain('.github/workflows/ci.yml');
		const byPath = new Map(files.map((f) => [f.path, f.content]));
		expect(byPath.get('delendai.config.json')).toBe('regenerated');
		expect(byPath.get('.github/settings.yml')).toBe('settings');
		expect(byPath.get('gone.txt')).toBeNull();
		expect(byPath.has('.github/workflows/ci.yml')).toBe(true);
	});

	it('[<5ms] runs nothing without a setup command, and fails naming the command when it fails', async () => {
		let ran = 0;
		const materialise = async () => {
			ran += 1;
			throw new Error('the rehearsal setup command `boom` failed: x');
		};
		await createRehearsalSetup({
			...realInput,
			setupCommand: '',
			materialise,
		}).files('b');
		expect(ran).toBe(0);
		await expect(
			Promise.resolve(
				createRehearsalSetup({
					...realInput,
					setupCommand: 'boom',
					materialise,
				}).files('b'),
			),
		).rejects.toThrow('`boom`');
	});
});

describe('the fast rehearsal CI', () => {
	it('[<5ms] ends with the signal job that wakes the land on the rehearsal branch', () => {
		const text = renderRehearsalCiWorkflow({
			integration: 'ns/r1',
			runId: 'r1',
		});
		expect(text.trimEnd().endsWith('could not wake the integrator"')).toBe(
			true,
		);
		expect(text).toContain('    integration-signal:\n');
		expect(text).toContain('needs: [rehearsal-ci]');
		expect(text).toContain('gh workflow run land.yml');
		expect(text).toContain('actions: write');
	});
});

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
				projectIntegration: 'develop',
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
			projectIntegration: 'develop',
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
			projectIntegration: 'develop',
			workflows: { 'ci.yml': own },
		});
		expect(jobsOf(ci?.content ?? '')['integration-signal']?.needs).toEqual(
			jobsOf(own)['integration-signal']?.needs,
		);
	});

	it("[<20ms] keep the project's required checks in the real-mode policy", async () => {
		const text = readRepo('delendai.config.json');
		const original = JSON.parse(text).development.integration;
		expect(original.requiredChecks).toEqual([
			'delendai-validate',
			'CodeQL',
		]);
		const direct = JSON.parse(rehearsalPolicy(text, 'b', true, 'r1'))
			.development.integration;
		expect(direct.requiredChecks).toEqual(original.requiredChecks);
		const policy = (
			await createRehearsalSetup({
				runId: 'r1',
				branchPrefix: 'ns/rehearsal/',
				policyText: text,
				integratorWorkflow: () => 'land',
				realWorkflows: {},
				projectIntegration: 'develop',
			}).files('b')
		).find((file) => file.path === 'delendai.config.json');
		expect(
			JSON.parse(policy?.content ?? '{}').development.integration
				.requiredChecks,
		).toEqual(original.requiredChecks);
	});
});
