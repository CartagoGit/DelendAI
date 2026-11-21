/**
 * The `close_slice` gate runs the project's declared gate as a resumable
 * job. The tree identity is a real git tree; the runner and the clock are
 * simulated through the deps the gate accepts, so each test drives the
 * runner's states (held, finished green, finished red, gone) by
 * construction and never races a spawned process or the wall clock.
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

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

/** A checkout directory whose `validate` script is `command`. */
const checkoutWithGate = (
	command: string,
): { readonly cwd: string; readonly store: string } => {
	const cwd = scratch('close-gate-tree-');
	const store = scratch('close-gate-store-');
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
	// The tree is a stand-in: one distinct tree per checkout. The real git
	// fingerprint is exercised by close-slice-gate.e2e.spec.ts.
	fingerprint: async (cwd) => `tree:${cwd}`,
	readDeclaration: async (path) => {
		const file = join(fixture.cwd, path);
		return existsSync(file) ? readFileSync(file, 'utf8') : null;
	},
	...extra,
});

describe('runCloseSliceGate', () => {
	it('[<200ms] says so when the project declares no gate', async () => {
		const cwd = scratch('close-gate-empty-');

		const verdict = await runCloseSliceGate(
			depsFor({ cwd, store: scratch('close-gate-store-') }),
		);

		expect(verdict.state).toBe('unverifiable');
		expect(verdict.findings.join('\n')).toContain('declares no gate');
	});

	it('[<200ms] says so when the checkout cannot be fingerprinted', async () => {
		const fixture = checkoutWithGate('validate-gate');

		const verdict = await runCloseSliceGate(
			depsFor(fixture, { fingerprint: async () => undefined }),
		);

		expect(verdict.state).toBe('unverifiable');
	});
});

describe('runCloseSliceGate with existing certification', () => {
	it('[<200ms] closes from a certification of the tree without running the gate', async () => {
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

	it('[<200ms] blocks on a failed certification without running the gate', async () => {
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

	it('[<200ms] stays unverifiable when there is no evidence and no gate', async () => {
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

	it('[<200ms] narrows the declared matrix to the slice scopes', async () => {
		const steps = await declaredGateSteps(read, ['api']);

		expect(steps).toEqual([{ scope: 'api', command: 'run api' }]);
	});

	it('[<200ms] runs the whole declared gate when no scope matches, never nothing', async () => {
		const steps = await declaredGateSteps(read, ['unknown']);

		expect(steps.map((step) => step.command)).toEqual([
			'run web',
			'run api',
		]);
	});
});
