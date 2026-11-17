import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_INTEGRATION_OPTIONS } from '@delendai/core/cli';

import {
	REHEARSAL_GROUPING,
	REHEARSAL_JOB_TIMEOUT_MINUTES,
	REHEARSAL_WORKFLOW_PATH,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { renderRehearsalWorkflow } from '../../../../src/lib/services/rehearsal-ci-workflow.helper';

const render = () =>
	renderRehearsalWorkflow({
		integration: 'develop',
		codePaths: [
			'plugins/integration/**',
			'.github/workflows/rehearsal.yml',
		],
		identity: DEFAULT_INTEGRATION_OPTIONS.identity,
	});

describe('the rehearsal workflow', () => {
	it('[<50ms] is the committed file exactly', () => {
		const committed = readFileSync(
			resolve(__dirname, '../../../../../..', REHEARSAL_WORKFLOW_PATH),
			'utf8',
		);
		expect(committed).toBe(render());
	});

	it('[<50ms] never triggers on the integration or release branch', () => {
		const text = render();
		expect(text).not.toContain('pull_request_target');
	});

	it('[<50ms] triggers on the pull request own diff into the integration branch, not on push', () => {
		const text = render();
		expect(text).toContain('    pull_request:');
		expect(text).toContain("branches: ['develop']");
		expect(text).toContain(
			'types: [opened, synchronize, reopened, ready_for_review]',
		);
		expect(text).toContain("- 'plugins/integration/**'");
		expect(text).toContain("- '.github/workflows/rehearsal.yml'");
		expect(text).not.toContain('push:');
	});

	it('[<50ms] takes the mode and the scenarios, and keeps the merged report as an artifact', () => {
		const text = render();
		expect(text).toContain('mode:');
		expect(text).toContain('options: [fast, real]');
		expect(text).toContain('scenarios:');
		expect(text).toContain('--mode="$REHEARSAL_MODE"');
		expect(text).toMatch(
			/if: always\(\)\n\s+uses: actions\/upload-artifact@[0-9a-f]{40}[^\n]*\n\s+with:\n\s+name: rehearsal-report-\$\{\{ inputs.mode \|\| 'fast' \}\}\n/u,
		);
	});

	it('[<50ms] has the three jobs plan, play and report, in that order', () => {
		const text = render();
		const jobs = [...text.matchAll(/^ {4}([a-z]+):$/gmu)].map((m) => m[1]);
		expect(jobs.slice(-3)).toEqual(['plan', 'play', 'report']);
		expect(text).toContain('needs: plan');
		expect(text).toMatch(
			/report:[\s\S]*needs: \[plan, play\][\s\S]*if: always\(\)/u,
		);
	});

	it('[<50ms] plays the groups as a matrix that does not stop at the first red one, as wide as the plan says', () => {
		const play =
			render().split('    play:')[1]?.split('    report:')[0] ?? '';
		expect(play).toContain('fail-fast: false');
		expect(play).toContain(
			'max-parallel: ${{ fromJSON(needs.plan.outputs.parallel) }}',
		);
		expect(play).toContain(
			'matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}',
		);
		expect(play).toContain(
			`timeout-minutes: ${String(REHEARSAL_JOB_TIMEOUT_MINUTES)}`,
		);
		expect(play).toContain('--group="$REHEARSAL_GROUP"');
		expect(play).toMatch(/if: always\(\)\n[\s\S]*--sweep --group=/u);
		expect(play).toContain(
			"name: rehearsal-report-${{ inputs.mode || 'fast' }}-${{ matrix.group }}",
		);
	});

	it('[<50ms] runs all fast groups at once and the real groups one at a time', () => {
		expect(REHEARSAL_GROUPING.fast.maxParallel).toBe('all');
		expect(REHEARSAL_GROUPING.real.maxParallel).toBe(1);
	});

	it('[<50ms] runs one at a time', () => {
		expect(render()).toContain('cancel-in-progress: false');
	});

	it('[<50ms] rehearses with the minted integrator token, never the workflow token', () => {
		const text = render();
		expect(text).toContain('Mint the integrator identity token');
		expect(text).toContain('actions/create-github-app-token@');
		expect(text).toContain('GH_TOKEN: ${{ steps.identity.outputs.token }}');
		expect(text).not.toContain('github.token');
	});

	it('[<50ms] rehearses with the token secret when the identity is a personal token', () => {
		const text = renderRehearsalWorkflow({
			integration: 'develop',
			codePaths: [],
			identity: { ...DEFAULT_INTEGRATION_OPTIONS.identity, kind: 'pat' },
		});
		expect(text).not.toContain('create-github-app-token');
		expect(text).toContain(
			'GH_TOKEN: ${{ secrets.DELENDAI_INTEGRATOR_TOKEN }}',
		);
	});
});
