/**
 * near-specs.spec.ts — the local proof runs the specs nearest a change.
 */
import { describe, expect, it } from 'vitest';

import { isNearSource, nearSpecs } from './near-specs';

const SPECS = [
	'packages/core/tests/src/lib/a/widget.service.spec.ts',
	'plugins/x/tests/src/widget.service.spec.ts',
	'packages/core/tests/src/lib/b/other.spec.ts',
	'tools/scripts/ci/plan.spec.ts',
];

describe('nearSpecs', () => {
	it('takes a changed spec, the specs named after a source and its importers', () => {
		const importers: Record<string, readonly string[]> = {
			'widget.service': ['packages/core/tests/src/lib/b/other.spec.ts'],
		};
		expect(
			nearSpecs(
				[
					'packages/core/src/lib/a/widget.service.ts',
					'tools/scripts/ci/plan.spec.ts',
				],
				SPECS,
				(stem) => importers[stem] ?? [],
			),
		).toEqual([
			'packages/core/tests/src/lib/a/widget.service.spec.ts',
			'packages/core/tests/src/lib/b/other.spec.ts',
			'plugins/x/tests/src/widget.service.spec.ts',
			'tools/scripts/ci/plan.spec.ts',
		]);
	});

	it('looks nothing up for prose, configuration, locale leaves or a deleted spec', () => {
		const asked: string[] = [];
		expect(
			nearSpecs(
				[
					'README.md',
					'delendai.config.json',
					'apps/web/src/i18n/tools/x/delendai_x.ts',
					'packages/core/tests/src/lib/gone.spec.ts',
				],
				SPECS,
				(stem) => {
					asked.push(stem);
					return [];
				},
			),
		).toEqual([]);
		expect(asked).toEqual([]);
	});

	it('reaches a file no spec names through the sources that import it', () => {
		expect(
			nearSpecs(
				['packages/cli/src/lib/list.generated.ts'],
				['packages/cli/tests/list-reader.spec.ts'],
				() => [],
				(stem) =>
					stem === 'list.generated'
						? ['packages/cli/src/lib/list-reader.ts']
						: [],
			),
		).toEqual(['packages/cli/tests/list-reader.spec.ts']);
	});

	it('knows which paths are sources', () => {
		expect(isNearSource('plugins/x/src/a.ts')).toBe(true);
		expect(isNearSource('docs/a.md')).toBe(false);
		expect(isNearSource('apps/web/src/i18n/tools/index.ts')).toBe(false);
	});
});
