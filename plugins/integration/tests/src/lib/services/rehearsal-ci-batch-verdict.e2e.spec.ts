/**
 * rehearsal-ci-batch-verdict.spec.ts — the fast CI concludes a head with no
 * declaration (a batch) from the declarations in its tree, and the red-batch
 * scenario is reachable: both members green alone, the batch red because of a.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { REHEARSAL_SCENARIOS } from '../../../../src/lib/contracts/constants/rehearsal-scenarios.constant';
import { renderRehearsalCiWorkflow } from '../../../../src/lib/services/rehearsal-ci-workflow.helper';
import { createRehearsalSetup } from '../../../../src/lib/services/rehearsal-setup.helper';

const concludingScript = (): string => {
	const rendered = renderRehearsalCiWorkflow({
		integration: 'ns/i',
		runId: 'r1',
	}).split('\n');
	const start = rendered.findIndex((line) => line.endsWith('run: |')) + 1;
	const end = rendered.findIndex((line, i) => i >= start && line === '');
	return rendered
		.slice(start, end)
		.map((line) => line.slice(18))
		.join('\n');
};

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** The exit code of the CI's concluding step on `headRef`, with these declarations in the tree. */
const conclude = (
	headRef: string,
	declarations: Readonly<Record<string, object>>,
): number | null => {
	const root = mkdtempSync(join(tmpdir(), 'ci-verdict-'));
	dirs.push(root);
	mkdirSync(join(root, 'run'));
	for (const [name, body] of Object.entries(declarations))
		writeFileSync(join(root, 'run', `${name}.json`), JSON.stringify(body));
	return spawnSync('bash', ['-c', concludingScript()], {
		env: { ...process.env, HEAD_REF: headRef, RUN_DIR: join(root, 'run') },
	}).status;
};

const green = { result: 'success', seconds: 0 };
const redInBatch = { ...green, batch: 'failure' };

describe('the fast CI on a head with no declaration', () => {
	it('[<2000ms] is red when the batch holds a declaration whose batch verdict fails', () => {
		expect(
			conclude('ns/queue/batch-1+2', {
				's-a': redInBatch,
				's-b': green,
			}),
		).toBe(1);
		expect(conclude('ns/queue/batch-1', { 's-a': redInBatch })).toBe(1);
	});

	it('[<2000ms] is green when none of the declarations in the batch fails it', () => {
		expect(conclude('ns/queue/batch-2', { 's-b': green })).toBe(0);
	});

	it('[<2000ms] still concludes a declared member as it declares', () => {
		expect(conclude('ns/pr/s-a', { 's-a': redInBatch })).toBe(0);
		expect(
			conclude('ns/pr/s-b', { 's-b': { result: 'failure', seconds: 0 } }),
		).toBe(1);
	});
});

describe('the red-batch scenario', () => {
	const scenario = REHEARSAL_SCENARIOS.find((one) => one.id === 'red-batch');

	it('[<50ms] has both members green on their own pull request and a red in any batch', () => {
		const [a, b] = scenario?.pulls ?? [];
		expect(a?.declaration.result).toBe('success');
		expect(a?.declaration.batch).toBe('failure');
		expect(b?.declaration.result).toBe('success');
		expect(b?.declaration.batch).toBeUndefined();
	});

	it('[<50ms] reaches the tree of a branch only through its own pull request, never the setup commit', () => {
		const files = createRehearsalSetup({
			runId: 'r1',
			branchPrefix: 'ns/rehearsal/',
			policyText: '{}',
			integratorWorkflow: () => '',
		}).files('ns/rehearsal/r1/red-batch-integration');
		expect(files.map((file) => file.path).join('\n')).not.toMatch(
			/r1\/.*\.json/u,
		);
	});
});
