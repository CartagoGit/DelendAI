/**
 * Three separate lints turned out to be failing on `develop` while every
 * check was green, because no workflow ran them. These cases pin the
 * reachability rule that notices the fourth.
 */
import { describe, expect, it } from 'vitest';

import { judgeReachability, reachableLints } from './lints-reach-ci.script';

describe('reachableLints', () => {
	it('reaches a lint a workflow runs directly', () => {
		expect([
			...reachableLints({ 'lint:a': 'bun x' }, 'run: bun run lint:a'),
		]).toEqual(['lint:a']);
	});

	it('reaches a lint only through the umbrella that chains it', () => {
		// The reason this is a closure and not a grep: `lint-architecture`
		// runs `bun run lint:architecture`, which chains seventeen lints.
		// A grep for each lint's own name would call all seventeen
		// unreachable and the umbrella reachable — precisely backwards.
		const scripts = {
			'lint:architecture': 'bun run lint:a && bun run lint:b',
			'lint:a': 'x',
			'lint:b': 'y',
		};
		expect(
			[
				...reachableLints(scripts, 'run: bun run lint:architecture'),
			].sort(),
		).toEqual(['lint:a', 'lint:architecture', 'lint:b']);
	});

	it('follows a chain through a script that is not itself a lint', () => {
		// `validate:run` is not a `lint:*` script and chains many that
		// are. If CI ever runs it, those become reachable through it.
		const scripts = { 'validate:run': 'bun run lint:a', 'lint:a': 'x' };
		expect([...reachableLints(scripts, 'bun run validate:run')]).toEqual([
			'lint:a',
		]);
	});

	it('does not loop forever on a script that references itself', () => {
		const scripts = { 'lint:a': 'bun run lint:a' };
		expect([...reachableLints(scripts, 'bun run lint:a')]).toEqual([
			'lint:a',
		]);
	});
});

describe('judgeReachability', () => {
	const scripts = { 'lint:a': 'x', 'lint:b': 'y', build: 'z' };

	it('fails only on a lint that is unreachable AND unrecorded', () => {
		// Fifty-nine unreachable scripts is a real finding and not a
		// thing to fix in one change. The baseline records today; a new
		// one is the failure.
		const report = judgeReachability(scripts, 'bun run lint:a', ['lint:b']);
		expect(report.newlyUnreachable).toEqual([]);
		expect(report.unreachable).toEqual(['lint:b']);
	});

	it('names a lint that arrives unreachable and unrecorded', () => {
		expect(
			judgeReachability(scripts, 'bun run lint:a', []).newlyUnreachable,
		).toEqual(['lint:b']);
	});

	it('reports a baselined lint that now runs, so the win can be locked in', () => {
		// A ratchet that only tightens is a ratchet nobody notices
		// loosening. This is how the number goes down on purpose.
		const report = judgeReachability(
			scripts,
			'bun run lint:a && bun run lint:b',
			['lint:b'],
		);
		expect(report.nowReachable).toEqual(['lint:b']);
	});

	it('counts only lint scripts, not every script in the manifest', () => {
		expect(judgeReachability(scripts, '', []).total).toBe(2);
	});
});
