/**
 * The `close_slice` gate runs the project's declared gate as a resumable
 * job. The tree identity is a real git tree; the runner and the clock are
 * simulated through the deps the gate accepts, so each test drives the
 * runner's states (held, finished green, finished red, gone) by
 * construction and never races a spawned process or the wall clock.
 */
import { execFileSync } from 'node:child_process';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCloseSliceGateProbe } from '@delendai/proposals/lib/tools/authoring.tool';
import type { ICloseGateDeps } from '@delendai/proposals/lib/contracts/interfaces/close-slice-gate.interface';
import { fakeRunner } from '../_fixtures/fake-gate-runner';
import {
	declaredGateSteps,
	runCloseSliceGate,
} from '@delendai/proposals/lib/tools/close-slice-gate';

const directories: string[] = [];

afterAll(() => {
	for (const dir of directories)
		rmSync(dir, { recursive: true, force: true });
});

const scratch = (prefix: string): string => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	directories.push(dir);
	return dir;
};

/** A git checkout whose `validate` script is `command`. */
const checkoutWithGate = (
	command: string,
): { readonly cwd: string; readonly store: string } => {
	const cwd = scratch('close-gate-tree-');
	const store = scratch('close-gate-store-');
	execFileSync('git', ['init', '-q'], { cwd });
	writeFileSync(
		join(cwd, 'package.json'),
		JSON.stringify({
			name: 'fixture',
			private: true,
			scripts: { validate: command },
		}),
	);
	return { cwd, store };
};

const depsFor = (
	fixture: { readonly cwd: string; readonly store: string },
	extra: Partial<ICloseGateDeps> = {},
): ICloseGateDeps => ({
	storeRoot: fixture.store,
	cwd: fixture.cwd,
	readDeclaration: async (path) => {
		const file = join(fixture.cwd, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	},
	...extra,
});

describe('runCloseSliceGate', () => {
	it('[<1000ms] answers pending with a handle when the gate outlives the wait, then passes on resume', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'hold' });

		const first = await runCloseSliceGate(
			depsFor(fixture, { ...runner.deps, waitMs: 100 }),
		);

		expect(first.state).toBe('pending');
		expect(first.handle).toMatch(/^gate-/);

		runner.release();
		const resumed = await runCloseSliceGate(
			depsFor(fixture, { ...runner.deps, waitMs: 10_000 }),
		);

		expect(resumed.state).toBe('pass');
		expect(resumed.handle).toBe(first.handle);
		expect(runner.runs()).toBe(1);
	});

	it('[<1000ms] never reports a still-running gate as a pass through the probe', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'hold' });

		const probe = await runCloseSliceGateProbe(
			depsFor(fixture, { ...runner.deps, waitMs: 100 }),
		);

		expect(probe.ok).toBe(false);
		expect(probe.severity).toBe('error');
		expect(probe.gate?.state).toBe('pending');
	});

	it('[<1000ms] reuses a recorded green result for the same tree and reruns when the tree changes', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'finish', code: 0 });
		const deps = depsFor(fixture, runner.deps);

		const first = await runCloseSliceGate(deps);
		const second = await runCloseSliceGate(deps);

		expect(first).toMatchObject({ state: 'pass', reused: false });
		expect(second).toMatchObject({ state: 'pass', reused: true });
		expect(runner.runs()).toBe(1);

		appendFileSync(join(fixture.cwd, 'changed.txt'), 'new content');
		const third = await runCloseSliceGate(deps);

		expect(third).toMatchObject({ state: 'pass', reused: false });
		expect(runner.runs()).toBe(2);
	});

	it('[<1000ms] keeps the tree identity when only host state or a lock file changes', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'finish', code: 0 });
		const state = join(fixture.cwd, '.cache');
		mkdirSync(state, { recursive: true });
		const deps = depsFor(fixture, { ...runner.deps, stateRoots: [state] });

		await runCloseSliceGate(deps);
		writeFileSync(join(state, 'lock.json'), 'held');
		writeFileSync(join(fixture.cwd, 'proposal.md.mutex'), 'owner 1');
		const again = await runCloseSliceGate(deps);

		expect(again).toMatchObject({ state: 'pass', reused: true });
		expect(runner.runs()).toBe(1);
	});

	it('[<1000ms] blocks on a failing gate and reports the step and its output', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({
			kind: 'finish',
			code: 3,
			output: 'lint exploded\n',
		});

		const verdict = await runCloseSliceGate(depsFor(fixture, runner.deps));

		expect(verdict.state).toBe('fail');
		expect(verdict.findings.join('\n')).toContain('lint exploded');
		expect(verdict.findings.join('\n')).toContain('gate step failed');
	});

	it('[<1000ms] runs a failed gate again on the next call instead of remembering the failure', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'finish', code: 1 });
		const deps = depsFor(fixture, runner.deps);

		await runCloseSliceGate(deps);
		await runCloseSliceGate(deps);

		expect(runner.runs()).toBe(2);
	});

	it('[<1000ms] reports a gate that exceeds its timeout as unverifiable, stopped, and never green', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'hold' });

		const verdict = await runCloseSliceGate(
			depsFor(fixture, {
				...runner.deps,
				waitMs: 5_000,
				timeoutMs: 300,
			}),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.findings.join('\n')).toContain('stopped after 300 ms');
		expect(runner.killed).toHaveLength(1);
	});

	it('[<1000ms] reports a run whose process vanished as unverifiable', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'vanish' });

		const verdict = await runCloseSliceGate(
			depsFor(fixture, { ...runner.deps, waitMs: 1_000 }),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.findings.join('\n')).toContain('process is gone');
	});

	it('[<1000ms] says so when the project declares no gate', async () => {
		const cwd = scratch('close-gate-empty-');
		execFileSync('git', ['init', '-q'], { cwd });

		const verdict = await runCloseSliceGate(
			depsFor({ cwd, store: scratch('close-gate-store-') }),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.findings.join('\n')).toContain('declares no gate');
	});

	it('[<1000ms] says so when the checkout cannot be fingerprinted', async () => {
		const fixture = checkoutWithGate('validate-gate');

		const verdict = await runCloseSliceGate(
			depsFor(fixture, { fingerprint: async () => undefined }),
		);

		expect(verdict.state).toBe('unverifiable');
	});
});

describe('runCloseSliceGate with existing certification', () => {
	it('[<1000ms] closes from a certification of the tree without running the gate', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'finish', code: 0 });

		const verdict = await runCloseSliceGate(
			depsFor(fixture, {
				...runner.deps,
				certification: async () => ({
					state: 'certified',
					source: 'forge-check',
					evidence: 'CI green',
				}),
			}),
		);

		expect(verdict).toMatchObject({
			state: 'pass',
			reused: true,
			certifiedBy: 'forge-check',
		});
		expect(runner.runs()).toBe(0);
	});

	it('[<1000ms] blocks on a failed certification without running the gate', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'finish', code: 0 });

		const verdict = await runCloseSliceGate(
			depsFor(fixture, {
				...runner.deps,
				certification: async () => ({
					state: 'failed',
					check: 'delendai-validate',
					evidence: 'required check `delendai-validate` failure',
					nextAction: 'fix it',
				}),
			}),
		);

		expect(verdict.state).toBe('fail');
		expect(verdict.findings.join(' ')).toContain('delendai-validate');
		expect(runner.runs()).toBe(0);
	});

	it('[<1000ms] runs the gate when no evidence exists and says what was missing', async () => {
		const fixture = checkoutWithGate('validate-gate');
		const runner = fakeRunner({ kind: 'finish', code: 1 });

		const verdict = await runCloseSliceGate(
			depsFor(fixture, {
				...runner.deps,
				certification: async () => ({
					state: 'none',
					missing: ['no pushed commit has this tree'],
					nextAction: 'publish; CI will certify',
				}),
			}),
		);

		expect(verdict.state).toBe('fail');
	});

	it('[<1000ms] stays unverifiable when there is no evidence and no gate', async () => {
		const fixture = checkoutWithGate('validate-gate');
		rmSync(join(fixture.cwd, 'package.json'));

		const verdict = await runCloseSliceGate(
			depsFor(fixture, {
				certification: async () => ({
					state: 'none',
					missing: ['no pushed commit has this tree'],
					nextAction: 'publish; CI will certify',
				}),
			}),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.nextAction).toBe('publish; CI will certify');
	});

	it('[<1000ms] queues a second local gate while another is running', async () => {
		const first = checkoutWithGate('first-gate');
		const second = checkoutWithGate('second-gate');
		const runner = fakeRunner({ kind: 'hold' });

		await runCloseSliceGate(
			depsFor(first, { ...runner.deps, waitMs: 100 }),
		);
		const queued = await runCloseSliceGate(
			depsFor(
				{ ...second, store: first.store },
				{ ...runner.deps, waitMs: 100 },
			),
		);

		expect(queued.state).toBe('pending');
		expect(queued.findings.join(' ')).toContain('queued');
		expect(runner.runs()).toBe(1);
	});

	it('[<1000ms] admits the next tree once a running gate is past its timeout, though its own tree never came back', async () => {
		const stuck = checkoutWithGate('stuck-gate');
		const next = checkoutWithGate('next-gate');
		const runner = fakeRunner({ kind: 'hold' });

		await runCloseSliceGate(
			depsFor(stuck, { ...runner.deps, waitMs: 0, timeoutMs: 200 }),
		);
		// The next tree asks once the stuck run's time is up.
		runner.advance(1_000);
		runner.setOutcome({ kind: 'finish', code: 0 });
		const admitted = await runCloseSliceGate(
			depsFor(
				{ ...next, store: stuck.store },
				{ ...runner.deps, waitMs: 5_000 },
			),
		);

		expect(admitted.findings.join(' ')).not.toContain('queued');
		expect(admitted.state).toBe('pass');
		expect(runner.killed).toHaveLength(1);
	});
});

describe('declaredGateSteps', () => {
	const config = JSON.stringify({
		validationMatrix: {
			scopes: {
				web: [{ command: 'run web' }],
				api: [{ command: 'run api' }],
			},
		},
	});
	const read = async (path: string): Promise<string | null> =>
		path === 'delendai.config.json' ? config : null;

	it('[<1000ms] narrows the declared matrix to the slice scopes', async () => {
		const steps = await declaredGateSteps(read, ['api']);

		expect(steps).toEqual([{ scope: 'api', command: 'run api' }]);
	});

	it('[<1000ms] runs the whole declared gate when no scope matches, never nothing', async () => {
		const steps = await declaredGateSteps(read, ['unknown']);

		expect(steps.map((step) => step.command)).toEqual([
			'run web',
			'run api',
		]);
	});
});
