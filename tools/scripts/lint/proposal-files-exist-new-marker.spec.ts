/**
 * A Files entry written new:<path> declares a file not built yet, so the
 * existence lint leaves it to the review entry.
 */
import { describe, expect, it } from 'vitest';

import { extractPathCandidates } from './proposal-files-exist.script';

describe('proposal-files-exist and the new: marker', () => {
	it('[<50ms] skips a new: path and keeps a plain one', () => {
		expect(
			extractPathCandidates('`new:src/lib/made.ts`, `src/lib/kept.ts`'),
		).toEqual(['src/lib/kept.ts']);
	});
});
