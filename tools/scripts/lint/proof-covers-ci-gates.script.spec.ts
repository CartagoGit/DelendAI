import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { describe, expect, it } from 'vitest';

import { gateNamesOf } from '../ci/prove-plan.script';
import {
	CI_ONLY_GATES,
	gateOfCommand,
	judgeProofCoverage,
	requiredGatesOf,
	staticGatesOf,
} from './proof-covers-ci-gates.script';
import { trackedFilesOf } from './proposal-files-exist.script';

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('gateOfCommand', () => {
	it('[<100ms] names a package script or a script file, and nothing else', () => {
		expect(gateOfCommand('bun run test:budgets:check')).toBe(
			'test:budgets:check',
		);
		expect(gateOfCommand('bun tools/scripts/ci/x.script.ts --a')).toBe(
			'tools/scripts/ci/x.script.ts',
		);
		expect(gateOfCommand('echo hi')).toBeUndefined();
	});
});

describe('judgeProofCoverage', () => {
	const base = {
		staticGates: new Set(['lint:a']),
		proofGateNames: ['tests'],
		proofGates: { 'test:shard': 'tests' },
	};

	it('[<100ms] fails a required gate with no proof step and no CI-only reason', () => {
		const problems = judgeProofCoverage({
			...base,
			required: ['lint:a', 'test:budgets:check'],
			ciOnly: {},
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('test:budgets:check');
	});

	it('[<100ms] accepts a gate the proof reads, runs, or lists CI-only with a reason', () => {
		expect(
			judgeProofCoverage({
				...base,
				required: ['lint:a', 'test:shard', 'only:ci'],
				ciOnly: { 'only:ci': 'needs CI timings' },
			}),
		).toEqual([]);
	});

	it('[<100ms] fails a CI-only entry that has no reason, that CI dropped, or that the proof now runs', () => {
		const problems = judgeProofCoverage({
			...base,
			required: ['lint:a', 'test:shard'],
			ciOnly: { 'lint:a': 'x', gone: 'x', 'test:shard': ' ' },
		});
		expect(problems.join('\n')).toContain('gone: listed as CI-only but no');
		expect(problems.join('\n')).toContain(
			'lint:a: listed as CI-only but the proof runs',
		);
		expect(problems.join('\n')).toContain(
			'test:shard: a CI-only gate carries no reason',
		);
	});

	it('[<100ms] fails a proof gate the proof does not name', () => {
		expect(
			judgeProofCoverage({
				...base,
				proofGateNames: [],
				required: [],
				ciOnly: {},
			})[0],
		).toContain('does not name');
	});
});

describe('this repository', () => {
	it('[<100ms] covers every gate its required CI jobs run', () => {
		expect(
			judgeProofCoverage({
				required: requiredGatesOf(WORKFLOW),
				staticGates: staticGatesOf(WORKFLOW),
				proofGateNames: gateNamesOf(
					['packages/core/src/x.ts'],
					false,
					'BASE',
				),
			}),
		).toEqual([]);
	});

	it('[<100ms] proves proposal-files-exist through the governance family and lists test:budgets:check as CI-only', () => {
		expect(
			staticGatesOf(WORKFLOW).has(
				'tools/scripts/lint/run-together.script.ts',
			),
		).toBe(true);
		expect(CI_ONLY_GATES['test:budgets:check']).toContain(
			'.vitest-reports',
		);
	});
});

describe('a baseline computed from the working tree counts tracked files only', () => {
	const template = createGitRepoTemplate({
		files: { '.gitignore': 'local/\n', 'kept.md': 'x' },
	});

	it('[<200ms] lists a tracked file and not an ignored one', () => {
		const repo = template.copy();
		mkdirSync(join(repo.root, 'local'));
		writeFileSync(join(repo.root, 'local', 'a.md'), 'x');
		repo.git('add', '-A');
		const tracked = trackedFilesOf(repo.root);
		expect(tracked?.has('kept.md')).toBe(true);
		expect(tracked?.has('local/a.md')).toBe(false);
	});
});
