import { existsSync, globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUN_OWNED_SPECS, bunOwnedExcludes } from '../../../vitest.shared';
import { repoRoot } from '../lib/repo-root';

const root = repoRoot();

describe('the bun-owned spec list', () => {
	it('names only paths that exist', () => {
		expect(
			BUN_OWNED_SPECS.filter((entry) => !existsSync(join(root, entry))),
		).toEqual([]);
	});

	it('gives each project the entries under it, relative to it', () => {
		expect(bunOwnedExcludes('packages/state-telemetry')).toEqual([
			'src/lib/eta/duration-history.spec.ts',
			'src/lib/events/work-event-store.spec.ts',
		]);
		expect(bunOwnedExcludes('packages/state-sqlite/')).toEqual(['**']);
		expect(bunOwnedExcludes('packages/cli')).toEqual([]);
	});

	it('includes every spec that imports bun:sqlite directly', () => {
		const owned = (spec: string) =>
			BUN_OWNED_SPECS.some((entry) =>
				entry.endsWith('/') ? spec.startsWith(entry) : spec === entry,
			);
		const direct = globSync(
			'{packages,plugins}/*/{src,tests}/**/*.spec.ts',
			{
				cwd: root,
			},
		).filter((spec) =>
			/from ['"]bun:sqlite['"]/u.test(
				readFileSync(join(root, spec), 'utf8'),
			),
		);
		expect(direct.filter((spec) => !owned(spec))).toEqual([]);
	});

	it('is what test:sqlite runs', () => {
		const scripts = (
			JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
				readonly scripts: Record<string, string>;
			}
		).scripts;
		expect(scripts['test:sqlite']).toBe(
			'bun tools/scripts/test/bun-owned-specs.script.ts',
		);
	});
});
