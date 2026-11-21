/**
 * ref-name.spec.ts — the policy template is operator-controlled and the
 * values interpolated into it are not, so these tests pin the property
 * that matters for durability: whatever an agent id or slice name
 * contains, the expansion is still a ref git will accept, and it is never
 * a branch.
 */

import { describe, expect, it } from 'vitest';

import { READABLE_WORK_REF_SHAPE } from '@delendai/core/lib/development-policy/profiles.constant';
import { renderWorkScope } from '@delendai/core/lib/development-policy/work-ref-placeholders';
import {
	parseRefIdentityTrailer,
	refTrailerFor,
	withScopeTrailers,
} from '@delendai/core/lib/wip-engine/scope';
import {
	expandWorkRefTemplate,
	resolveWorkRef,
	sanitizeRefComponent,
} from '@delendai/core/lib/wip-engine/ref-name';

const DEFAULT_TEMPLATE = 'wip/${agent}/${proposal}-${slice}-g${generation}'; // work-ref-shape: alternative

describe('resolveWorkRef', () => {
	it('[<50ms] expands every placeholder of the shipped default template', () => {
		expect(
			resolveWorkRef(DEFAULT_TEMPLATE, {
				agent: 'implementation-runner',
				proposal: 'f00418',
				slice: 's3',
				generation: 2,
			}),
		).toBe('refs/wip/implementation-runner/f00418-s3-g2');
	});

	it('[<50ms] keeps a fully-qualified template as it is', () => {
		expect(
			resolveWorkRef('refs/delendai/wip/${agent}-g${generation}', {
				agent: 'a',
				proposal: 'p',
				slice: 's',
				generation: '1',
			}),
		).toBe('refs/delendai/wip/a-g1');
	});

	it('[<50ms] never places a work ref under refs/heads — a WIP ref is not a branch', () => {
		expect(
			resolveWorkRef(DEFAULT_TEMPLATE, {
				agent: 'a',
				proposal: 'p',
				slice: 's',
				generation: 1,
			}).startsWith('refs/heads/'),
		).toBe(false);
	});

	it('[<50ms] sanitises values git would reject', () => {
		expect(sanitizeRefComponent('feature/one two~three')).toBe(
			'feature-one-two-three',
		);
		expect(sanitizeRefComponent('..leading')).toBe('leading');
		expect(sanitizeRefComponent('   ')).toBe('unnamed');
		expect(sanitizeRefComponent('_.-mid._-')).toBe('mid');
		expect(sanitizeRefComponent('-._-')).toBe('unnamed');
		expect(sanitizeRefComponent(`${'-._'.repeat(50_000)}x`)).toBe('x');
		expect(
			resolveWorkRef(DEFAULT_TEMPLATE, {
				agent: 'agent one',
				proposal: 'f 1',
				slice: 'slice:2',
				generation: 1,
			}),
		).toBe('refs/wip/agent-one/f-1-slice-2-g1');
	});

	it('[<50ms] leaves an unknown placeholder visible instead of blanking it', () => {
		expect(
			expandWorkRefTemplate('wip/${agent}/${unknown}', {
				agent: 'a',
				proposal: 'p',
				slice: 's',
				generation: 1,
			}),
		).toBe('wip/a/${unknown}');
	});
});

describe('the readable branch shape (f00808)', () => {
	const NEW_TEMPLATE = `wip/${READABLE_WORK_REF_SHAPE}`;

	it('[<50ms] the default shape is action/agent/scope/topic', () => {
		expect(READABLE_WORK_REF_SHAPE).toBe(
			'${kind}/${agent}/${scope}/${topic}',
		);
		expect(
			resolveWorkRef(NEW_TEMPLATE, {
				agent: 'claude-opus-5-5',
				kind: 'implement',
				proposal: 'x01003',
				slice: 'S2',
				generation: 1,
				topic: 'shared checkout stays clean',
				scope: 'x01003',
			}),
		).toBe(
			'refs/wip/implement/claude-opus-5-5/x01003/shared-checkout-stays-clean',
		);
		expect(
			resolveWorkRef(`pr/${READABLE_WORK_REF_SHAPE}`, {
				agent: 'claude-opus-5-5',
				kind: 'implement',
				proposal: 'x01003',
				slice: 'S2',
				generation: 1,
				topic: 'work-ref-refuses-shared-checkout',
			}),
		).toBe(
			'refs/pr/implement/claude-opus-5-5/x01003-S2/work-ref-refuses-shared-checkout',
		);
		expect(
			resolveWorkRef(NEW_TEMPLATE, {
				agent: 'gpt-5.3-codex',
				kind: 'review',
				proposal: 'x01004',
				slice: 'S1',
				generation: 1,
				topic: 'verdicts',
				scope: renderWorkScope({
					ids: ['x01004', 'x01016'],
					slices: [],
					range: false,
					generation: 1,
				}),
			}),
		).toBe('refs/wip/review/gpt-5.3-codex/x01004+x01016/verdicts');
	});

	it('[<50ms] the generation is spelled -G only from the second on', () => {
		const scope = (generation: number): string =>
			renderWorkScope({
				ids: ['x01003'],
				slices: [],
				range: false,
				generation,
			});
		expect(scope(1)).toBe('x01003');
		expect(scope(2)).toBe('x01003-G2');
	});

	it('[<50ms] the Delendai-Wip-Ref trailer carries the machine identity', () => {
		const identity = {
			agent: 'claude-sonnet-5-5',
			kind: 'implement',
			proposal: 'f00808',
			slices: ['S9', 'S9b'],
			generation: 2,
		};
		const message = withScopeTrailers('work', ['a.ts'], 'd', identity);
		expect(message).toContain('Delendai-Wip-Ref: agent=claude-sonnet-5-5');
		expect(parseRefIdentityTrailer(message)).toStrictEqual(identity);
	});

	it('[<50ms] a message without the identity trailer reads as undefined', () => {
		expect(parseRefIdentityTrailer('just a message')).toBeUndefined();
		expect(
			parseRefIdentityTrailer(
				withScopeTrailers('m', [], 'd', 'refs/wip/x'),
			),
		).toBeUndefined();
	});

	it('[<50ms] a trailer missing a field or with a bad generation reads as undefined', () => {
		const line = (value: string): string =>
			`m\n\nDelendai-Wip-Ref: ${value}\n`;
		expect(
			parseRefIdentityTrailer(line('agent=a kind=implement')),
		).toBeUndefined();
		expect(
			parseRefIdentityTrailer(
				line('agent=a kind=implement proposal=x1 generation=two'),
			),
		).toBeUndefined();
		expect(
			parseRefIdentityTrailer(
				line('agent=a kind=implement proposal=x1 generation=3'),
			),
		).toStrictEqual({
			agent: 'a',
			kind: 'implement',
			proposal: 'x1',
			slices: [],
			generation: 3,
		});
	});

	it('[<50ms] refTrailerFor gives the identity of a unit ref and the name of any other', () => {
		expect(
			refTrailerFor('refs/wip/implement/agent-a/x00001-S1+S4-G2/t'),
		).toStrictEqual({
			agent: 'agent-a',
			kind: 'implement',
			proposal: 'x00001',
			slices: ['S1', 'S4'],
			generation: 2,
		});
		expect(refTrailerFor('refs/heads/not-a-unit')).toBe(
			'refs/heads/not-a-unit',
		);
	});
});
