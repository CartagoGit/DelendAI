import { describe, expect, it } from 'vitest';

import {
	analyseJobs,
	formatReport,
	type IProvides,
} from './workflow-runner-bootstrap.script';

/** Wraps step YAML into a single-job workflow document. */
const workflow = (steps: readonly string[]): string =>
	['jobs:', '    build:', '        steps:', ...steps].join('\n');

const step = (lines: readonly string[]): readonly string[] =>
	lines.map(
		(line, index) => `            ${index === 0 ? '- ' : '  '}${line}`,
	);

const SETUP_BUN_REPO: IProvides = { checkout: true, bun: true };
const resolveComposite = (uses: string): IProvides | undefined =>
	uses === './.github/actions/setup-bun-repo' ? SETUP_BUN_REPO : undefined;

describe('workflow runner bootstrap', () => {
	it('flags the exact shape that broke delendai-validate', () => {
		// The required check on `develop` ran `bun …` on a bare
		// ubuntu-latest with no checkout and no setup-bun. It exited 127
		// on every run, so nothing could merge into develop at all.
		const findings = analyseJobs(
			'ci.yml',
			workflow([
				...step([
					'name: Summarize every CI gate',
					'run: bun tools/scripts/ci/validate-summary.script.ts',
				]),
			]),
		);
		expect(findings).toEqual([
			{
				workflow: 'ci.yml',
				job: 'build',
				step: 'Summarize every CI gate',
				missing: 'oven-sh/setup-bun',
				command: 'bun tools/scripts/ci/validate-summary.script.ts',
			},
			{
				workflow: 'ci.yml',
				job: 'build',
				step: 'Summarize every CI gate',
				missing: 'actions/checkout',
				command: 'bun tools/scripts/ci/validate-summary.script.ts',
			},
		]);
	});

	it('accepts checkout + setup-bun in that order', () => {
		expect(
			analyseJobs(
				'ci.yml',
				workflow([
					...step(['uses: actions/checkout@v7']),
					...step([
						'uses: oven-sh/setup-bun@v2',
						'with:',
						'    bun-version: 1.4.2',
					]),
					...step(['name: Typecheck', 'run: bun run typecheck']),
				]),
			),
		).toEqual([]);
	});

	it('credits a resolved local composite action with what it provides', () => {
		expect(
			analyseJobs(
				'ci.yml',
				workflow([
					...step(['uses: actions/checkout@v7']),
					...step(['uses: ./.github/actions/setup-bun-repo']),
					...step(['name: Lint', 'run: bun run lint']),
				]),
				resolveComposite,
			),
		).toEqual([]);
	});

	it('credits nothing to a composite action it cannot resolve', () => {
		// Conservative on purpose: an unreadable action must not be
		// assumed to install a toolchain.
		const findings = analyseJobs(
			'ci.yml',
			workflow([
				...step(['uses: actions/checkout@v7']),
				...step(['uses: ./.github/actions/mystery']),
				...step(['name: Lint', 'run: bun run lint']),
			]),
			resolveComposite,
		);
		expect(findings.map((f) => f.missing)).toEqual(['oven-sh/setup-bun']);
	});

	it('is positional: a setup step after the run does not count', () => {
		const findings = analyseJobs(
			'ci.yml',
			workflow([
				...step(['uses: actions/checkout@v7']),
				...step(['name: Too early', 'run: bun run test']),
				...step(['uses: oven-sh/setup-bun@v2']),
			]),
		);
		expect(findings.map((f) => f.missing)).toEqual(['oven-sh/setup-bun']);
	});

	it('finds bun inside a multi-line run block', () => {
		const findings = analyseJobs(
			'ci.yml',
			workflow([
				...step(['uses: actions/checkout@v7']),
				'            - name: Run lints',
				'              run: |',
				'                  set -euo pipefail',
				'                  bun run lint',
			]),
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.command).toBe('bun run lint');
	});

	it('flags a repo-path command in a job that never checked out', () => {
		const findings = analyseJobs(
			'ci.yml',
			workflow([
				...step(['uses: oven-sh/setup-bun@v2']),
				...step([
					'name: Guard',
					'run: bun tools/scripts/lint/guard.ts',
				]),
			]),
		);
		expect(findings.map((f) => f.missing)).toEqual(['actions/checkout']);
	});

	it('does not flag a command that needs neither', () => {
		expect(
			analyseJobs(
				'ci.yml',
				workflow([
					...step(['name: Say hi', 'run: echo "bun run test"']),
				]),
			),
		).toEqual([]);
	});

	it('flags bunx as well as bun', () => {
		const findings = analyseJobs(
			'ci.yml',
			workflow([
				...step(['uses: actions/checkout@v7']),
				...step(['name: Tests', 'run: bunx vitest run']),
			]),
		);
		expect(findings.map((f) => f.missing)).toEqual(['oven-sh/setup-bun']);
	});

	it('ignores an unnamed job step list and jobs without steps', () => {
		expect(
			analyseJobs(
				'reusable.yml',
				'jobs:\n    call:\n        uses: ./.github/workflows/x.yml\n',
			),
		).toEqual([]);
	});

	it('names the job and the missing step in the report', () => {
		const report = formatReport([
			{
				workflow: 'ci.yml',
				job: 'delendai-validate',
				step: 'Summarize every CI gate',
				missing: 'oven-sh/setup-bun',
				command: 'bun tools/scripts/ci/validate-summary.script.ts',
			},
		]);
		expect(report).toContain('delendai-validate');
		expect(report).toContain('Summarize every CI gate');
		expect(report).toContain('oven-sh/setup-bun');
	});

	it('reports nothing for unparseable YAML (another gate owns that)', () => {
		expect(
			analyseJobs('broken.yml', '    oops: not column zero\n'),
		).toEqual([]);
	});
});
