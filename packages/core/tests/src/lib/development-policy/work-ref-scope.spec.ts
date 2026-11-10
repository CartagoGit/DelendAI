/**
 * The readable `{wip|pr}/{action}/{agent}/{scope}/{topic}` names, the
 * owner's scheme (f00808 S9): the scope grammar both ways, and the old
 * shape still read in the transition.
 */
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { compileOwnedWorkRefParser } from '@delendai/core/lib/development-policy/owned-work-ref-parser';
import { READABLE_WORK_REF_SHAPE } from '@delendai/core/lib/development-policy/profiles.constant';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	parseWorkRefScope,
	renderWorkRefScope,
} from '@delendai/core/lib/development-policy/work-ref-scope';
import { compileWorkRefParser } from '@delendai/core/lib/startup-reconciler/work-ref-identity';
import { resolveWorkRef } from '@delendai/core/lib/wip-engine/ref-name';

const CASES = [
	['x01003', { proposal: 'x01003', slice: 'all', generation: 1 }],
	['x01003-S2', { proposal: 'x01003', slice: 'S2', generation: 1 }],
	['x01003-S1-S3', { proposal: 'x01003', slice: 'S1-S3', generation: 1 }],
	['x01003-S1+S4', { proposal: 'x01003', slice: 'S1+S4', generation: 1 }],
	[
		'x01004+x01016',
		{ proposal: 'x01004+x01016', slice: 'all', generation: 1 },
	],
	['x01003-G2', { proposal: 'x01003', slice: 'all', generation: 2 }],
	['x01003-S1-S3-G3', { proposal: 'x01003', slice: 'S1-S3', generation: 3 }],
] as const;

describe('scope grammar', () => {
	it.each(CASES)(
		'[<20ms] renders and parses %s both ways',
		(segment, scope) => {
			expect(renderWorkRefScope(scope)).toBe(segment);
			expect(parseWorkRefScope(segment)).toEqual(scope);
		},
	);

	it('[<20ms] shows the generation only from the second on, in upper case', () => {
		expect(
			renderWorkRefScope({ proposal: 'x1', slice: 'S2', generation: 1 }),
		).toBe('x1-S2');
		expect(
			renderWorkRefScope({ proposal: 'x1', slice: 'S2', generation: 2 }),
		).toBe('x1-S2-G2');
	});

	it('[<20ms] refuses what is not a scope', () => {
		expect(parseWorkRefScope('x01003-all-g1')).toBeUndefined();
		expect(parseWorkRefScope('X01003')).toBeUndefined();
		expect(parseWorkRefScope('x01003..S2')).toBeUndefined();
	});

	it('[<600ms] renders only names git accepts', () => {
		for (const [segment] of CASES) {
			const ref = `refs/heads/wip/implement/agent/${segment}/topic`;
			expect(() =>
				execFileSync('git', ['check-ref-format', ref], {
					stdio: 'pipe',
				}),
			).not.toThrow();
		}
	});
});

describe('the readable template', () => {
	const template = `heads/wip/${READABLE_WORK_REF_SHAPE}`;

	it('[<60ms] names what is done, and reads back the identity', () => {
		const ref = resolveWorkRef(template, {
			agent: 'claude-opus-5-5',
			kind: 'implement',
			proposal: 'x01003',
			slice: 'S2',
			generation: 1,
			topic: 'work-ref-refuses-shared-checkout',
		});
		expect(ref).toBe(
			'refs/heads/wip/implement/claude-opus-5-5/x01003-S2/work-ref-refuses-shared-checkout',
		);
		expect(
			compileWorkRefParser(template, 'heads/wip/')?.parse(ref),
		).toEqual({
			agent: 'claude-opus-5-5',
			kind: 'implement',
			proposal: 'x01003',
			slice: 'S2',
			generation: 1,
			topic: 'work-ref-refuses-shared-checkout',
		});
	});

	it('[<20ms] names a review of several proposals by what it reviews', () => {
		const ref = resolveWorkRef(template, {
			agent: 'gpt-5.3-codex',
			kind: 'review',
			proposal: 'x01004+x01016',
			slice: 'all',
			generation: 1,
			topic: 'verdicts',
		});
		expect(ref).toBe(
			'refs/heads/wip/review/gpt-5.3-codex/x01004+x01016/verdicts',
		);
	});

	it('[<60ms] is configurable in the policy, and reads the old form in the transition', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				branches: {
					namespacePrefix: '',
					formerNamespacePrefixes: ['delendai'],
					workRefTemplate: template,
				},
			},
		});
		const parser = compileOwnedWorkRefParser(policy.branches);
		expect(
			parser?.parse(
				'refs/heads/wip/implement/claude-opus-5-5/x01003-S2-G2/t',
			),
		).toMatchObject({ proposal: 'x01003', slice: 'S2', generation: 2 });
		expect(
			parser?.parse(
				'refs/heads/delendai/wip/claude-opus-5-5/implement/x01003-S2-g1/t',
			),
		).toMatchObject({
			agent: 'claude-opus-5-5',
			proposal: 'x01003',
			slice: 'S2',
		});
	});
});
