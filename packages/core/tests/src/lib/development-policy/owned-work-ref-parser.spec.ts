/**
 * Work refs under every owned namespace parse to the same identity, so a
 * unit under a former namespace stays somebody's live work (f00808 S2).
 */
import { describe, expect, it } from 'vitest';

import {
	compileOwnedWorkRefParser,
	ownedWorkRefShapeOf,
	ownedWorkRefShapes,
	workShapeOfPublication,
} from '@delendai/core/lib/development-policy/owned-work-ref-parser';
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
	it('lists the current shape first, then each former one', () => {
		const shapes = ownedWorkRefShapes(transition);
		expect(shapes.map((shape) => [shape.prefix, shape.current])).toEqual([
			['heads/wip/', true],
			['heads/delendai/wip/', false],
		]);
		expect(shapes[1]?.template.startsWith('heads/delendai/wip/')).toBe(
			true,
		);
	});

	it('recognises both prefixes in the transition, as one identity', () => {
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

	it('places a branch under its own namespace, and nothing foreign', () => {
		expect(ownedWorkRefShapeOf(transition, OLD_UNIT)?.current).toBe(false);
		expect(
			ownedWorkRefShapeOf(transition, 'wip/a/implement/x-S1-g1/t')
				?.current,
		).toBe(true);
		expect(ownedWorkRefShapeOf(transition, 'feature/mine')).toBeUndefined();
	});

	it('maps each publication prefix to the work shape of its namespace', () => {
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

	it('reads only the current namespace when none was left', () => {
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
