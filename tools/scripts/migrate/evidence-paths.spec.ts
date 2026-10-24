/**
 * evidence-paths.spec.ts — no rewrite rule brings back the removed
 * `docs/delendai/evidence/` directory.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('the evidence paths', () => {
	it('gives the rebrand no rewrite rule for docs/delendai/evidence', () => {
		const source = readFileSync(
			resolve(ROOT, 'tools/scripts/migrate/rebrand-propagate.script.ts'),
			'utf8',
		);
		const paths =
			/const REPO_SCANNER_HISTORICAL_PATHS = \[([^\]]*)\]/u.exec(
				source,
			)?.[1];
		expect(paths).toBeDefined();
		expect(paths).not.toContain('docs/delendai/evidence');
	});
});
