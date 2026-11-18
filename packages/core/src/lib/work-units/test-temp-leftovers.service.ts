/**
 * test-temp-leftovers.service.ts — the empty directories the test kit
 * left in the system temp folder before x01091 are removed.
 *
 * x01091 stops new ones; nothing removed the old: 134,223 empty
 * `delendai-gh-*` directories and some 40,000 more from the other test
 * prefixes sat in /tmp. Only a directory directly under the temp root,
 * named with one of the prefixes of one constant, empty, and older than
 * a day goes — removed with `rmdir`, which refuses a directory that
 * gained a file meanwhile. One that holds something is listed, never
 * removed.
 */
import { readdir, rmdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	PRE_X01091_TEST_TEMP_PREFIXES,
	TEST_TEMP_LEFTOVER_AGE_SECONDS,
	TEST_TEMP_LISTED_NON_EMPTY,
} from '../contracts/constants/test-temp-prefixes.constant';
import type { ITestTempLeftovers } from '../contracts/interfaces/test-temp-leftovers.interface';

/** Directories read or removed at once. */
const BATCH = 64;

type Verdict = 'removable' | 'removed' | 'non-empty' | 'skip';

const judge = async (
	path: string,
	cutoffMs: number,
	apply: boolean,
): Promise<Verdict> => {
	try {
		const info = await stat(path);
		if (!info.isDirectory() || info.mtimeMs > cutoffMs) return 'skip';
		if ((await readdir(path)).length > 0) return 'non-empty';
		if (!apply) return 'removable';
		await rmdir(path);
		return 'removed';
	} catch {
		// Gone, or gained a file while it was judged: not this pass's.
		return 'skip';
	}
};

export const reapTestTempLeftovers = async (input: {
	readonly apply: boolean;
	/** The folder read: the system's temp folder unless a test injects one. */
	readonly tmpRoot?: string | undefined;
	/** Milliseconds since the epoch. */
	readonly now?: number | undefined;
}): Promise<ITestTempLeftovers> => {
	const root = input.tmpRoot ?? tmpdir();
	const cutoffMs =
		(input.now ?? Date.now()) - TEST_TEMP_LEFTOVER_AGE_SECONDS * 1000;
	let names: readonly string[];
	try {
		names = (await readdir(root)).filter((name) =>
			PRE_X01091_TEST_TEMP_PREFIXES.some((prefix) =>
				name.startsWith(prefix),
			),
		);
	} catch {
		names = [];
	}
	let empty = 0;
	let removed = 0;
	const nonEmpty: string[] = [];
	let nonEmptyCount = 0;
	for (let at = 0; at < names.length; at += BATCH) {
		const batch = names.slice(at, at + BATCH);
		const verdicts = await Promise.all(
			batch.map((name) => judge(join(root, name), cutoffMs, input.apply)),
		);
		verdicts.forEach((verdict, index) => {
			if (verdict === 'removable' || verdict === 'removed') empty += 1;
			if (verdict === 'removed') removed += 1;
			if (verdict === 'non-empty') {
				nonEmptyCount += 1;
				if (nonEmpty.length < TEST_TEMP_LISTED_NON_EMPTY)
					nonEmpty.push(batch[index] ?? '');
			}
		});
	}
	return { empty, removed, nonEmpty, nonEmptyCount };
};
