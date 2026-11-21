/**
 * A unit's generation and its refs in a namespace transition (f00808): a
 * unit entered under a former namespace is still the same unit, and a
 * generation retired under it is still spent.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { unitOfName } from '@delendai/core/lib/development-policy/owned-work-ref-parser';
import { ownedRootsOf } from '@delendai/core/lib/work-units/namespaced-ref.helper';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	ambiguousUnit,
	chooseGeneration,
	generationsEndedIn,
	existingWorkRef,
	sessionHolding,
	unitGeneration,
} from '@delendai/core/lib/work-units/work-unit-generation.service';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync(
		'git',
		['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
		{
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	).trim();

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const OLD = 'refs/heads/delendai/wip/implement/agent-a/x00001-S1/topic';
const NEW = 'refs/heads/wip/implement/agent-a/x00001-S1/topic';
const ARGS = ['--kind=implement', '--topic=topic'];

const template = createGitRepoTemplate({
	trunk: 'develop',
	files: { 'a.ts': 'export const a = 1;\n' },
});

const repo = (): string => template.copy().root;

describe('a unit under a former namespace', () => {
	it('[<200ms] is the unit work enter finds again', () => {
		const root = repo();
		git(root, 'update-ref', OLD, 'HEAD');
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(OLD);
	});

	it('[<200ms] leaves a new unit under the current namespace', () => {
		const root = repo();
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(NEW);
		expect(
			chooseGeneration(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toEqual({ generation: 1 });
	});

	it('[<200ms] keeps a generation retired under the former root spent', () => {
		// The remote answers for the former root too, and a ref retired
		// there names the unit the same way: pure, no repository needed.
		expect(ownedRootsOf(policy.branches, 'retired', '*')).toContain(
			'refs/delendai/retired/*',
		);
		const unit = unitOfName(NEW);
		if (unit === undefined) throw new Error('the unit name did not parse');
		const listing =
			'abc123\trefs/delendai/retired/agent-a/implement/x00001-S1-g1/topic';
		expect([...generationsEndedIn(unit, [listing])]).toEqual([1]);
		// Another unit's retirement does not spend this one's generation.
		expect([
			...generationsEndedIn(unit, [
				'abc123\trefs/delendai/retired/agent-a/implement/x00002-S1-g1/t',
			]),
		]).toEqual([]);
	});

	it('[<200ms] is ambiguous when two names answer for one unit', () => {
		const root = repo();
		git(root, 'update-ref', OLD, 'HEAD');
		git(root, 'update-ref', NEW, 'HEAD');
		expect(
			ambiguousUnit(
				root,
				['--kind=implement'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBeDefined();
		expect(sessionHolding(root, NEW)).toBeUndefined();
	});

	it('[<200ms] reads the generation the arguments name', () => {
		expect(unitGeneration(['--generation=3'])).toBe(3);
		expect(unitGeneration([])).toBe(1);
	});

	it('[<200ms] finds a unit written before its shape named the kind', () => {
		const root = repo();
		const legacy = 'refs/heads/wip/agent-a/x00001-S1-g1/topic';
		git(root, 'update-ref', legacy, 'HEAD');
		expect(
			existingWorkRef(
				root,
				['--topic=topic'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toBe(legacy);
		expect(
			existingWorkRef(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBe(NEW);
	});

	it('[<200ms] is not ambiguous for the one ref the arguments render', () => {
		const root = repo();
		git(root, 'update-ref', NEW, 'HEAD');
		git(root, 'update-ref', OLD, 'HEAD');
		expect(
			ambiguousUnit(root, ARGS, policy, 'agent-a', 'x00001', 'S1'),
		).toBeUndefined();
		expect(
			chooseGeneration(
				root,
				['--kind=implement', '--generation=1'],
				policy,
				'agent-a',
				'x00001',
				'S1',
			),
		).toEqual({ generation: 1 });
	});
});
