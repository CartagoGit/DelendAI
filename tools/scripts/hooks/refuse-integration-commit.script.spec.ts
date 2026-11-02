/**
 * The guarantee a swarm actually needs.
 *
 * Every policy-derived guard in this repository refused these commits
 * correctly, and they landed on `develop` anyway — twice, one minute
 * after the WIP route had refused the same work. Which code path
 * produced them was never identified, which is the reason this lives in
 * a hook: the guarantee has to hold for tooling nobody here has read.
 *
 * So the cases below are about the decision, not the plumbing, and the
 * two that matter most are the ones that must NOT refuse — a guard that
 * blocks a legitimate commit gets disabled, and a disabled guard
 * protects nothing.
 */

import { describe, expect, it } from 'vitest';

import { judgeIntegrationCommit } from './refuse-integration-commit.script';

const judge = (
	over: Partial<Parameters<typeof judgeIntegrationCommit>[0]> = {},
) =>
	judgeIntegrationCommit({
		branch: 'develop',
		integration: 'develop',
		allowsDirectIntegrationCommit: false,
		isMerge: false,
		...over,
	});

describe('judgeIntegrationCommit — what it refuses', () => {
	it('refuses a plain commit on the integration branch', () => {
		expect(judge().refused).toBe(true);
	});

	it('refuses whatever the integration branch is called', () => {
		expect(judge({ branch: 'trunk', integration: 'trunk' }).refused).toBe(
			true,
		);
	});

	it('says why, naming the branch it protected', () => {
		expect(judge().reason).toContain('develop');
	});
});

describe('judgeIntegrationCommit — what it must let through', () => {
	// A guard that blocks legitimate work gets turned off, and a guard
	// that is off protects nothing.
	it('stands aside when the policy allows direct integration commits', () => {
		expect(judge({ allowsDirectIntegrationCommit: true }).refused).toBe(
			false,
		);
	});

	it('stands aside on a publication ref', () => {
		expect(judge({ branch: 'delendai/pr/whatever' }).refused).toBe(false);
	});

	it('stands aside on a detached HEAD', () => {
		expect(judge({ branch: undefined }).refused).toBe(false);
	});

	it('stands aside when no integration branch is declared', () => {
		expect(judge({ integration: undefined }).refused).toBe(false);
	});

	// A merge is how an integration branch legitimately moves — a
	// fast-forward from origin, or concluding a merge started elsewhere.
	it('stands aside for a merge', () => {
		expect(judge({ isMerge: true }).refused).toBe(false);
	});
});

describe('judgeIntegrationCommit — precedence', () => {
	// Permission is checked first, so a project that has opted into
	// direct commits is never second-guessed by a later rule.
	it('lets permission win over every other consideration', () => {
		expect(
			judge({
				allowsDirectIntegrationCommit: true,
				branch: 'develop',
				integration: 'develop',
				isMerge: false,
			}).refused,
		).toBe(false);
	});

	// Every verdict carries a sentence, including the ones that permit:
	// "it did not fire" and "it decided not to fire" are different
	// answers, and only one of them means the guard is working.
	it('gives a reason even when it permits', () => {
		expect(
			judge({ allowsDirectIntegrationCommit: true }).reason.length,
		).toBeGreaterThan(20);
	});
});
