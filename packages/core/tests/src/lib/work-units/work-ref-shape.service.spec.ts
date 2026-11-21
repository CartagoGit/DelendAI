/**
 * The reader and the writer are the same statement, or they are a bug.
 */
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { resolveWorkRef } from '@delendai/core/public';

import { compileWorkRefParser } from '@delendai/core/lib/startup-reconciler/work-ref-identity';
import {
	parseWorkScope,
	parseWorkSubject,
	renderWorkScope,
	workRefShapeInWords,
} from '@delendai/core/lib/work-units/work-ref-shape.service';

const TEMPLATE =
	'delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}';

describe('a work ref is read with the shape that wrote it (x00610)', () => {
	it('[<50ms] round-trips what the engine actually writes', () => {
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
			kind: 'implement',
			proposal: 'x00610',
			slice: 'S1',
			generation: '2',
			topic: 'one-shape-one-guard',
		});
	});

	it('[<50ms] refuses the dash spelling the guard used to teach', () => {
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

	it('[<50ms] states the shape in words exactly as the template states it', () => {
		expect(workRefShapeInWords(TEMPLATE)).toBe(
			'delendai/wip/<agent>/<proposal>-<slice>-g<generation>/<topic>',
		);
	});

	it('[<50ms] follows a template that spells the shape differently', () => {
		// The point of deriving: an operator who declares another shape gets
		// a reader for THAT shape, not for ours.
		const other =
			'wip/${agent}/${slice}.${proposal}.g${generation}.${topic}';
		expect(parseWorkSubject(other, 'S3.f00012.g7.something')).toStrictEqual(
			{
				kind: 'implement',
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

	it('[<50ms] matches nothing when the template names no parts at all', () => {
		// An unreadable configuration must not read every ref as claimable.
		expect(parseWorkSubject('wip/fixed-name', 'anything')).toBeUndefined();
	});

	it('[<50ms] reads the kind a ref names, and derives it for a ref that predates it (f00644)', () => {
		const shaped =
			'delendai/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}';
		expect(
			parseWorkSubject(shaped, 'review/x00001-all-g1/batch'),
		).toStrictEqual({
			kind: 'review',
			proposal: 'x00001',
			slice: 'all',
			generation: '1',
			topic: 'batch',
		});
		expect(parseWorkSubject(shaped, 'x00001-close-g2/work')?.kind).toBe(
			'review',
		);
		expect(
			parseWorkSubject(shaped, 'bogus/x00001-S1-g1/work'),
		).toBeUndefined();
	});
});

describe('the scope grammar (f00808)', () => {
	const CASES: readonly (readonly [
		string,
		ReturnType<typeof parseWorkScope>,
	])[] = [
		[
			'x01003',
			{ ids: ['x01003'], slices: [], range: false, generation: 1 },
		],
		[
			'x01003-S2',
			{
				ids: ['x01003'],
				slices: ['S2'],
				range: false,
				generation: 1,
			},
		],
		[
			'x01003-S1-S3',
			{
				ids: ['x01003'],
				slices: ['S1', 'S3'],
				range: true,
				generation: 1,
			},
		],
		[
			'x01003-S1+S4',
			{
				ids: ['x01003'],
				slices: ['S1', 'S4'],
				range: false,
				generation: 1,
			},
		],
		[
			'x01004+x01016',
			{
				ids: ['x01004', 'x01016'],
				slices: [],
				range: false,
				generation: 1,
			},
		],
		[
			'x01003-G2',
			{ ids: ['x01003'], slices: [], range: false, generation: 2 },
		],
		[
			'x01003-S1+S4-G3',
			{
				ids: ['x01003'],
				slices: ['S1', 'S4'],
				range: false,
				generation: 3,
			},
		],
	];

	it.each(CASES)(
		'[<200ms] %s parses and renders both ways',
		(text, scope) => {
			expect(parseWorkScope(text)).toStrictEqual(scope);
			expect(renderWorkScope(scope as NonNullable<typeof scope>)).toBe(
				text,
			);
			expect(() =>
				execFileSync('git', [
					'check-ref-format',
					`refs/wip/implement/a/${text}/t`,
				]),
			).not.toThrow();
		},
	);

	it('[<50ms] refuses text outside the grammar', () => {
		expect(parseWorkScope('x01003-S1-S3+S5')).toBeUndefined();
		expect(parseWorkScope('x01003-g2')).toBeUndefined();
		expect(parseWorkScope('nonsense')).toBeUndefined();
	});

	it('[<50ms] the parser reads both the old -g{n} template and the new grammar', () => {
		const old = compileWorkRefParser(
			'heads/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}',
			'',
		);
		const next = compileWorkRefParser(
			'heads/wip/${kind}/${agent}/${scope}/${topic}',
			'',
		);
		const former =
			'refs/heads/wip/claude-opus-5/implement/x00553-S1-g2/probe';
		const current =
			'refs/heads/wip/implement/claude-opus-5/x00553-S1-G2/probe';
		const expected = {
			agent: 'claude-opus-5',
			kind: 'implement',
			proposal: 'x00553',
			slice: 'S1',
			generation: 2,
			topic: 'probe',
		};
		for (const parser of [old, next]) {
			expect(parser?.parse(former)).toStrictEqual(expected);
			expect(parser?.parse(current)).toStrictEqual(expected);
		}
	});
});
