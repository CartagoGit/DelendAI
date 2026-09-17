/**
 * shingle-collision.spec.ts — a shared hash is not shared code.
 *
 * `shingleBlocks` used to group windows by a 32-bit FNV-1a hash and
 * report every group as copy-paste. Across all plugins that is hundreds
 * of thousands of windows, so collisions happen, and `lint:solid` told
 * an agent to extract a "duplicated" block into core when the two
 * blocks — a `throw` in a checkout cleaner and the fields of an options
 * interface — had nothing in common but their hash.
 *
 * These are the two real windows that collided. The first assertion
 * proves the collision still exists, so this case can never pass
 * vacuously if the hash function changes.
 */
import { describe, expect, it } from 'vitest';

import { shingleBlocks } from '../../../../src/lib/scan/shingle';
import { fnv1a } from '../../../../src/lib/scan/text-utils';

const CLEANER = [
	'\t\t}',
	"\t\tif (entry.type !== 'blob') {",
	'\t\t\tthrow new Error(',
	'\t\t\t\t`cannot clean unsupported git tree entry ${path} (${entry.type})`,',
	'\t\t\t);',
	'\t\t}',
	'\t\tplans.push({',
	'\t\t\tpath,',
];

const OPTIONS = [
	'\treadonly run: IGitRunner;',
	'\treadonly workspaceRoot: string;',
	'\treadonly baseBranch?: string;',
	'\treadonly staleMinutes?: number;',
	'\treadonly force?: boolean;',
	'\treadonly agentPrefix?: string;',
	'\treadonly now?: number;',
	'\t/**',
];

describe('scan/shingle — hash collisions', () => {
	it('does not report two different blocks that share a hash', () => {
		const cleaner = CLEANER.join('\n');
		const options = OPTIONS.join('\n');
		expect(fnv1a(cleaner.trim())).toBe(fnv1a(options.trim()));
		expect(cleaner.trim()).not.toBe(options.trim());

		const hits = shingleBlocks(
			new Map([
				['plugins/a/src/lib/cleaner.ts', cleaner],
				['plugins/b/src/lib/options.ts', options],
			]),
		);
		expect(hits).toEqual([]);
	});

	it('still reports the same block verbatim in two files', () => {
		const cleaner = CLEANER.join('\n');
		const hits = shingleBlocks(
			new Map([
				['plugins/a/src/lib/cleaner.ts', cleaner],
				['plugins/b/src/lib/copy.ts', cleaner],
			]),
		);
		expect(hits).toHaveLength(2);
		expect(hits[0]?.hash).toBe(fnv1a(cleaner.trim()));
	});
});
