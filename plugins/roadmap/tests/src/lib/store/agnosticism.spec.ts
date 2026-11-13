/**
 * agnosticism.spec.ts — nothing in the plugin's source names a branch.
 *
 * The branches a promotion runs between are the project's, read from its
 * development policy. A literal here would make this repository's
 * `develop` and `main` everybody's.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = resolve(import.meta.dirname, '../../../../src');

/** A quoted branch name, as a string literal would carry it. */
const BRANCH_LITERAL =
	/['"`](?:develop|main|master|trunk|release\/[^'"`]*)['"`]/u;

const sources = (readdirSync(SOURCE, { recursive: true }) as string[])
	.filter((file) => file.endsWith('.ts'))
	.map((file) => join(SOURCE, file));

describe('the roadmap plugin and branch names', () => {
	it('has source files to look at', () => {
		expect(sources.length).toBeGreaterThan(30);
	});

	it('names no branch in any source file', () => {
		const offenders = sources.filter((file) =>
			BRANCH_LITERAL.test(readFileSync(file, 'utf8')),
		);
		expect(offenders).toEqual([]);
	});
});
