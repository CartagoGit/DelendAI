/**
 * The reader and the writer are the same statement, or they are a bug.
 */
import { describe, expect, it } from 'vitest';

import { resolveWorkRef } from '@delendai/core/public';

import {
	parseWorkSubject,
	workRefShapeInWords,
	workSubjectPatternFor,
} from './work-ref-shape.service';

const TEMPLATE =
	'delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}';

describe('a work ref is read with the shape that wrote it (x00610)', () => {
	it('round-trips what the engine actually writes', () => {
		const ref = resolveWorkRef(TEMPLATE, {
			agent: 'claude-opus-5',
			proposal: 'x00610',
			slice: 'S1',
			generation: 2,
			topic: 'one shape, one guard',
		});
		// Everything after `refs/delendai/wip/<agent>/`.
		const subject = ref.split('/').slice(4).join('/');

		expect(parseWorkSubject(TEMPLATE, subject)).toStrictEqual({
			proposal: 'x00610',
			slice: 'S1',
			generation: '2',
			topic: 'one-shape-one-guard',
		});
	});

	it('refuses the dash spelling the guard used to teach', () => {
		// `…-g<n>-<topic>` was printed by commit-branch-discipline while the
		// engine wrote `…-g<n>/<topic>`. 135 refs were named this way and
		// none of them could ever be claimed or published.
		expect(
			parseWorkSubject(
				TEMPLATE,
				'x00512-S1-g1-foundation-capabilityresolver',
			),
		).toBeUndefined();
	});

	it('states the shape in words exactly as the template states it', () => {
		expect(workRefShapeInWords(TEMPLATE)).toBe(
			'delendai/wip/<agent>/<proposal>-<slice>-g<generation>/<topic>',
		);
	});

	it('follows a template that spells the shape differently', () => {
		// The point of deriving: an operator who declares another shape gets
		// a reader for THAT shape, not for ours.
		const other =
			'wip/${agent}/${slice}.${proposal}.g${generation}.${topic}';
		expect(parseWorkSubject(other, 'S3.f00012.g7.something')).toStrictEqual(
			{
				proposal: 'f00012',
				slice: 'S3',
				generation: '7',
				topic: 'something',
			},
		);
		expect(
			parseWorkSubject(other, 'f00012-S3-g7/something'),
		).toBeUndefined();
	});

	it('matches nothing when the template names no parts at all', () => {
		// An unreadable configuration must not read every ref as claimable.
		expect(workSubjectPatternFor('wip/fixed-name').test('anything')).toBe(
			false,
		);
	});
});
