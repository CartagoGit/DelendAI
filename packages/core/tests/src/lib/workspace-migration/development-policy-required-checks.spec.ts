import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';
import { adoptionFor } from '@delendai/core/lib/workspace-migration/migrators/development-policy.migrator';
import {
	deriveRequiredChecks,
	gateCheckOf,
	jobChecksOf,
} from '@delendai/core/lib/workspace-migration/migrators/development-policy-required-checks';

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

const projectWith = (workflows: Record<string, string>): string => {
	const root = mkdtempSync(join(tmpdir(), 'required-checks-'));
	directories.push(root);
	mkdirSync(join(root, '.github/workflows'), { recursive: true });
	for (const [file, text] of Object.entries(workflows)) {
		writeFileSync(join(root, '.github/workflows', file), text);
	}
	return root;
};

const ONE_JOB = `name: CI
on:
  pull_request:
jobs:
  test:
    name: Unit tests
    runs-on: ubuntu-latest
`;

describe('jobChecksOf', () => {
	it('reads the name of a job, or its id when it has none', () => {
		expect(
			jobChecksOf(
				'on: push\njobs:\n  build:\n    runs-on: x\n  lint:\n    name: "Lint it" # c\n    runs-on: x\n',
			),
		).toEqual(['build', 'Lint it']);
	});

	it('finds nothing in a file with no jobs', () => {
		expect(jobChecksOf('on: push\n')).toEqual([]);
	});
});

describe('gateCheckOf', () => {
	it('takes the only job, or the one aggregate among several', () => {
		expect(gateCheckOf(['build'])).toBe('build');
		expect(gateCheckOf(['lint', 'test', 'ci-complete'])).toBe(
			'ci-complete',
		);
	});

	it('refuses to choose between several plausible jobs', () => {
		expect(gateCheckOf(['lint', 'test'])).toBeUndefined();
	});
});

describe('deriveRequiredChecks', () => {
	it('names the job of the one workflow that runs on pull requests', async () => {
		const derived = await deriveRequiredChecks(
			projectWith({ 'ci.yml': ONE_JOB }),
		);
		expect(derived?.checks).toEqual(['Unit tests']);
	});

	it('ignores a workflow that does not run on pull requests', async () => {
		const root = projectWith({
			'release.yml': 'on: push\njobs:\n  ship:\n    runs-on: x\n',
		});
		expect(await deriveRequiredChecks(root)).toBeUndefined();
	});

	it('is undefined without workflows', async () => {
		expect(await deriveRequiredChecks(projectWith({}))).toBeUndefined();
	});
});

describe('adoption of a pull-request profile', () => {
	const github = async () => ({
		hasDevelopmentBlock: false,
		forge: 'github' as const,
		canRequireChecks: true,
		currentBranch: 'develop',
	});

	it('writes the checks it read, and the result is a policy that starts', async () => {
		const root = projectWith({ 'ci.yml': ONE_JOB });
		const { block } = await adoptionFor(root, {}, github);
		expect(block?.profile).toBe('shared-checkout-pr');
		expect(block?.integration?.requiredChecks).toEqual(['Unit tests']);
		expect(
			validateDevelopmentPolicy(
				resolveDevelopmentPolicy({ development: block }),
			),
		).toEqual([]);
	});

	it('adopts the merge profile, and says why, when no check can be read', async () => {
		const { block, reasons } = await adoptionFor(
			projectWith({}),
			{},
			github,
		);
		expect(block?.profile).toBe('shared-checkout-merge');
		expect(reasons.join('\n')).toContain('requiredChecks');
	});
});
