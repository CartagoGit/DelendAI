import { describe, expect, it } from 'vitest';

import { createRehearsalSetup } from '../../../../src/lib/services/rehearsal-setup.helper';

import {
	judgePrCiWall,
	realModeFiles,
	renderBranchFilters,
	wallSecondsOf,
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
	it('[<5ms] sets every trigger filter to the rehearsal branch and leaves the jobs alone', () => {
		const text = renderBranchFilters(CI, 'ns/rehearsal/r1/integration');
		expect(text).toContain("    branches: ['ns/rehearsal/r1/integration']");
		expect(text.match(/ns\/rehearsal\/r1\/integration/gu)).toHaveLength(2);
		expect(text).not.toContain('- develop');
		expect(text).toContain('types: [opened]');
		expect(text).toContain('branches: [keep]');
	});
	it('[<5ms] renders each named workflow under the workflows directory', () => {
		const files = realModeFiles({
			integration: 'x',
			workflows: { 'ci.yml': CI, 'codeql.yml': CI },
		});
		expect(files.map((f) => f.path)).toEqual([
			'.github/workflows/ci.yml',
			'.github/workflows/codeql.yml',
		]);
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
	it('[<5ms] swaps the stand-ins for the project workflows and keeps its required checks', () => {
		const input = {
			runId: 'r1',
			branchPrefix: 'ns/rehearsal/',
			policyText:
				'{"development":{"integration":{"requiredChecks":["tests"]}}}',
			integratorWorkflow: () => 'land',
		};
		const fast = createRehearsalSetup(input)
			.files('b')
			.map((f) => f.path);
		const real = createRehearsalSetup({
			...input,
			realWorkflows: { 'ci.yml': CI },
		}).files('b');
		expect(fast).toContain('.github/workflows/rehearsal-ci.yml');
		expect(real.map((f) => f.path)).not.toContain(
			'.github/workflows/rehearsal-ci.yml',
		);
		expect(real.map((f) => f.path)).toContain('.github/workflows/ci.yml');
		const policy = real.find((f) => f.path === 'delendai.config.json');
		expect(policy?.content).toContain('"tests"');
	});
});
