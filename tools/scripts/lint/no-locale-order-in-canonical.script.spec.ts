import { describe, expect, it } from 'vitest';

import {
	isCanonicalProducer,
	localeOrderLines,
} from './no-locale-order-in-canonical.script';

describe('no-locale-order-in-canonical', () => {
	it('names each localeCompare call, and not one in a comment', () => {
		expect(
			localeOrderLines(
				'a.ts',
				[
					'x.sort((a, b) => a.localeCompare(b));',
					'// a.localeCompare(b)',
					' * a.localeCompare(b)',
				].join('\n'),
			),
		).toEqual(['a.ts:1']);
	});

	it('holds the state packages, and elsewhere what hashes or writes what it serialised', () => {
		expect(isCanonicalProducer('packages/state/src/a.ts', '')).toBe(true);
		expect(
			isCanonicalProducer('plugins/x/src/a.ts', "createHash('sha256')"),
		).toBe(true);
		expect(
			isCanonicalProducer(
				'plugins/search/src/lib/embed/index-store.ts',
				'await writeFileAtomic(path, JSON.stringify(index));',
			),
		).toBe(true);
		expect(
			isCanonicalProducer(
				'packages/cli/src/lib/stable-json.service.ts',
				'',
			),
		).toBe(true);
		expect(
			isCanonicalProducer(
				'apps/web/src/list.ts',
				'names.sort(); JSON.stringify(x);',
			),
		).toBe(false);
	});
});
