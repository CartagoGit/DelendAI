/**
 * Work refs under every owned namespace parse to the same identity, so a
 * unit under a former namespace stays somebody's live work (f00808 S2).
 */
import { describe, expect, it } from 'vitest';

import {
	branchesForRef,
	compileOwnedWorkRefParser,
	ownedWorkRefShapeOf,
	ownedWorkRefShapes,
	unitPolicy,
	workShapeOfPublication,
} from '@delendai/core/lib/development-policy/owned-work-ref-parser';
import { WORK_REF_SHAPE } from '@delendai/core/lib/development-policy/profiles.constant';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const transition = resolveDevelopmentPolicy({
	development: {
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
}).branches;

const NEW_UNIT = 'refs/heads/wip/claude-opus-5-5/implement/f00808-S2-g1/guards';
const OLD_UNIT =
	'refs/heads/delendai/wip/claude-opus-5-5/implement/f00808-S2-g1/guards';

describe('owned work-ref parser', () => {
	it('[<20ms] lists the current shape first, then each former one', () => {
		const shapes = ownedWorkRefShapes(transition);
		expect(shapes.map((shape) => [shape.prefix, shape.current])).toEqual([
			['heads/wip/', true],
			['heads/delendai/wip/', false],
		]);
		expect(shapes[1]?.template.startsWith('heads/delendai/wip/')).toBe(
			true,
		);
	});

	it('[<20ms] recognises both prefixes in the transition, as one identity', () => {
		const parser = compileOwnedWorkRefParser(transition);
		const fresh = parser?.parse(NEW_UNIT);
		const old = parser?.parse(OLD_UNIT);
		expect(fresh?.proposal).toBe('f00808');
		expect({ ...old, ref: undefined }).toEqual({
			...fresh,
			ref: undefined,
		});
		expect(parser?.namespaces).toEqual([
			'refs/heads/wip',
			'refs/heads/delendai/wip',
		]);
	});

	it('[<20ms] places a branch under its own namespace, and nothing foreign', () => {
		expect(ownedWorkRefShapeOf(transition, OLD_UNIT)?.current).toBe(false);
		expect(
			ownedWorkRefShapeOf(transition, 'wip/a/implement/x-S1-g1/t')
				?.current,
		).toBe(true);
		expect(ownedWorkRefShapeOf(transition, 'feature/mine')).toBeUndefined();
	});

	it('[<20ms] maps each publication prefix to the work shape of its namespace', () => {
		expect(
			workShapeOfPublication(
				transition,
				'delendai/pr/a/implement/x-S1-g1/t',
			)?.shape.prefix,
		).toBe('heads/delendai/wip/');
		expect(
			workShapeOfPublication(transition, 'pr/a/implement/x-S1-g1/t')
				?.shape.current,
		).toBe(true);
		expect(workShapeOfPublication(transition, 'main')).toBeUndefined();
	});

	it('[<20ms] reads only the current namespace when none was left', () => {
		const plain = resolveDevelopmentPolicy({
			development: { branches: { namespacePrefix: 'delendai' } },
		}).branches;
		expect(
			compileOwnedWorkRefParser(plain)?.parse(NEW_UNIT),
		).toBeUndefined();
		expect(compileOwnedWorkRefParser(plain)?.parse(OLD_UNIT)?.slice).toBe(
			'S2',
		);
	});
});

describe('a unit in its own namespace', () => {
	it('[<20ms] gives a former unit the settings of its namespace', () => {
		const own = branchesForRef(transition, OLD_UNIT);
		expect(own.namespacePrefix).toBe('delendai');
		expect(own.workRefPrefix).toBe('heads/delendai/wip/');
		expect(own.publicationRefPrefix).toBe('delendai/pr/');
		expect(branchesForRef(transition, NEW_UNIT)).toBe(transition);
	});

	it('[<20ms] leaves the policy as it is for a current unit', () => {
		const policy = { branches: transition };
		expect(unitPolicy(policy, NEW_UNIT)).toBe(policy);
		expect(unitPolicy(policy, OLD_UNIT).branches.namespacePrefix).toBe(
			'delendai',
		);
	});
});

describe('owned shapes at the edges', () => {
	it('[<20ms] owns nothing without a template, and one shape for a template outside its prefix', () => {
		expect(
			ownedWorkRefShapes({ ...transition, workRefTemplate: '' }),
		).toEqual([]);
		expect(
			ownedWorkRefShapes({
				...transition,
				workRefTemplate: `refs/units/${WORK_REF_SHAPE}`,
			}),
		).toHaveLength(1);
	});

	it('[<20ms] reads a former publication in its own namespace', () => {
		const own = branchesForRef(
			transition,
			'delendai/pr/claude-opus-5-5/implement/f00808-S2-g1/guards',
		);
		expect(own.publicationRefPrefix).toBe('delendai/pr/');
		expect(branchesForRef(transition, 'feature/mine')).toBe(transition);
	});

	it('[<20ms] finds no owned shape for a branch outside every namespace', () => {
		expect(workShapeOfPublication(transition, 'feature/x')).toBeUndefined();
		expect(ownedWorkRefShapeOf(transition, 'pr/x')).toBeUndefined();
	});
});
