/**
 * The local pre-flight and CI must not be able to disagree.
 *
 * Two incidents wrote this file. A candidate passed everything locally
 * and then failed `lint-architecture` in CI, because the job listed
 * seventeen commands inline and the pre-flight listed a different set.
 * And the pre-flight's first home was `pre-push`, where lefthook skips
 * the whole hook on a plumbing publication — `skip_empty` looked like
 * the fix and is not even in lefthook v2's schema, so adding it would
 * have been an inert config key pretending to be a rule.
 *
 * Both failures were invisible in a green run. That is why they are
 * pinned here rather than remembered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROOF_STEPS } from '../../scripts/lint/publication-proof-gate.script';
import { repoRoot } from '../../scripts/lib/monorepo-paths';

const read = (relative: string): string =>
	readFileSync(join(repoRoot(), relative), 'utf8');

const packageScripts = (): Record<string, string> =>
	(
		JSON.parse(read('package.json')) as {
			readonly scripts: Record<string, string>;
		}
	).scripts;

describe('the pre-flight', () => {
	it('runs only commands this repository actually has', () => {
		// A renamed script would turn a check into a confusing "script
		// not found" at publication time, on somebody else's machine.
		const scripts = packageScripts();
		const missing = PROOF_STEPS.map((step) => step.script).filter(
			(script) => scripts[script] === undefined,
		);
		expect(missing).toEqual([]);
	});

	it('puts the slowest check last', () => {
		// A candidate that fails a four-second lint should not wait for
		// a ninety-second typecheck to be told.
		expect(PROOF_STEPS.at(-1)?.script).toBe('typecheck');
	});
});

describe('the architecture lints', () => {
	it('are one list that CI and the pre-flight both run', () => {
		// The job used to list them inline. `lint:types-in-contracts`
		// was in that list and not in the pre-flight, and it failed a
		// candidate that had passed everything else locally.
		expect(read('.github/workflows/ci.yml')).toContain(
			'run: bun run lint:architecture',
		);
		expect(PROOF_STEPS.map((step) => step.script)).toContain(
			'lint:architecture',
		);
	});
});

describe('lefthook', () => {
	it('does not pretend an option exists that lefthook v2 does not have', () => {
		// `skip_empty` is absent from `node_modules/lefthook/schema.json`.
		// Setting it changes nothing and reads, to the next person, like
		// the hole is closed.
		expect(read('lefthook.yml')).not.toContain('skip_empty:');
	});

	it('keeps the measured limitation written down', () => {
		// The hook is a backstop, not the mechanism, and the file has to
		// say so — otherwise somebody moves the gate back into it.
		const lefthook = read('lefthook.yml');
		expect(lefthook).toContain('no matching push files');
		expect(lefthook).toContain('forge:publish');
	});
});
