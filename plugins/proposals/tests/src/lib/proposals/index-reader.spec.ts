/**
 * index-reader.spec.ts — f00535 S2.
 *
 * `readProposalIndex` gains a source, not a new signature. This spec
 * pins the mechanism and, above all, pins that the DEFAULT is still the
 * JSON index: S2 delivers the switch, S3 flips it.
 *
 * Run with `bun test`, like every other spec in this tree that can
 * reach `bun:sqlite`. The JSON path never loads it (the SQL import is
 * dynamic), so the consumers' specs stay runner-agnostic; the two tests
 * at the bottom exercise the real derivation of the database path and
 * therefore need the Bun runtime.
 *
 * What is pinned:
 *   1. Default (no options, no env) == today's behaviour, byte for byte
 *      against the raw `index.json` contents.
 *   2. With the database ABSENT, the 'auto' source returns exactly what
 *      the JSON path returns.
 *   3. The fallback notice is emitted ONCE, not per call.
 *   4. `null` from the SQL reader falls back; `[]` from the SQL reader
 *      does NOT — it is served as-is.
 *   5. Both switches (option and environment) can force either source.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IIndexFs } from '../../../../src/lib/proposals/index-reader-fs';
import {
	DEFAULT_PROPOSAL_INDEX_SOURCE,
	PROPOSAL_INDEX_SOURCE_ENV_VAR,
	readProposalIndex,
	resetProposalIndexFallbackNotice,
	resolveProposalIndexSource,
	type IProposalIndexEntry,
} from '../../../../src/lib/proposals/index-reader';

const INDEX_PATH = '/fake/.cache/delendai/proposals/index.json';

const JSON_ENTRIES: readonly IProposalIndexEntry[] = [
	{ id: 'f00535', file: 'ready/feats/f00535-cutover.md', status: 'ready' },
	{ id: 'q00022', file: 'in-progress/q00022-plan.md', status: 'in-progress' },
];

const INDEX_JSON = JSON.stringify({
	generated_at: '2026-09-08T00:00:00.000Z',
	count: JSON_ENTRIES.length,
	proposals: JSON_ENTRIES,
});

/** In-memory `IIndexFs` that also counts reads, so a test can prove the
 *  JSON file was (or was not) consulted. */
const fakeFs = (
	contents: string | null = INDEX_JSON,
): IIndexFs & { readonly reads: string[] } => {
	const reads: string[] = [];
	return {
		reads,
		async read(absPath: string) {
			reads.push(absPath);
			return contents;
		},
	};
};

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
	resetProposalIndexFallbackNotice();
});

/** A workspace root with NO `.delendai/state/proposals.sqlite`. */
const emptyWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'f00535-idx-'));
	roots.push(root);
	return root;
};

describe('readProposalIndex — signature and default source (f00535 S2)', () => {
	it('defaults to the SQL source after the parity-proven cutover', () => {
		expect(DEFAULT_PROPOSAL_INDEX_SOURCE).toBe('sql');
		expect(resolveProposalIndexSource()).toBe('sql');
		expect(resolveProposalIndexSource({ env: {} })).toBe('sql');
	});

	it('keeps the 1-arg and 2-arg call shapes every consumer uses', async () => {
		const fs = fakeFs();
		expect(await readProposalIndex(INDEX_PATH, fs)).toEqual(JSON_ENTRIES);
		// 1-arg call: real fs, missing file -> [] (unchanged contract).
		expect(await readProposalIndex('/nope/index.json')).toEqual([]);
	});

	it('returns the parsed `proposals` array unchanged', async () => {
		const entries = await readProposalIndex(INDEX_PATH, fakeFs());
		expect(entries).toEqual(
			(JSON.parse(INDEX_JSON) as { proposals: IProposalIndexEntry[] })
				.proposals,
		);
	});

	it('returns [] when the index is missing or unparseable', async () => {
		expect(await readProposalIndex(INDEX_PATH, fakeFs(null))).toEqual([]);
		expect(
			await readProposalIndex(INDEX_PATH, fakeFs('{ not json')),
		).toEqual([]);
	});

	it('can pin the JSON rollback without touching the SQL reader', async () => {
		let sqlCalls = 0;
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'json',
			readFromSql: async () => {
				sqlCalls += 1;
				return [];
			},
		});
		expect(sqlCalls).toBe(0);
		expect(entries).toEqual(JSON_ENTRIES);
	});
});

describe('readProposalIndex — fallback with the database absent (f00535 S2)', () => {
	it('returns exactly what the JSON path returns when there is no database', async () => {
		const root = emptyWorkspace();
		const jsonResult = await readProposalIndex(INDEX_PATH, fakeFs());
		const autoResult = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'auto',
			workspaceRoot: root,
			log: () => undefined,
		});
		expect(autoResult).toEqual(jsonResult);
		expect(JSON.stringify(autoResult)).toBe(JSON.stringify(jsonResult));
	});

	it('logs the fallback ONCE, not once per call', async () => {
		const root = emptyWorkspace();
		const messages: string[] = [];
		for (let i = 0; i < 4; i += 1) {
			await readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'auto',
				workspaceRoot: root,
				log: (message) => messages.push(message),
			});
		}
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(INDEX_PATH);
	});

	it('logs again after the notice bookkeeping is reset', async () => {
		const root = emptyWorkspace();
		const messages: string[] = [];
		const read = async (): Promise<unknown> =>
			readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'auto',
				workspaceRoot: root,
				log: (message) => messages.push(message),
			});
		await read();
		resetProposalIndexFallbackNotice();
		await read();
		expect(messages).toHaveLength(2);
	});
});

describe('readProposalIndex — null vs empty from the SQL reader (f00535 S2)', () => {
	const SQL_ENTRIES: readonly IProposalIndexEntry[] = [
		{
			id: 's00001',
			file: 'ready/feats/s00001-from-sql.md',
			status: 'ready',
		},
	];

	it('serves SQL when the SQL reader can serve, without reading the JSON', async () => {
		const fs = fakeFs();
		const entries = await readProposalIndex(INDEX_PATH, fs, {
			source: 'auto',
			databasePath: '/fake/proposals.sqlite',
			readFromSqlResult: async () => ({
				entries: JSON_ENTRIES,
				sourceCommit: 'test',
				logicalDigest: 'digest',
			}),
		});
		expect(entries).toEqual(JSON_ENTRIES);
		expect(fs.reads).toEqual([INDEX_PATH]);
	});

	it('serves an EMPTY SQL result as-is: [] means "no proposals", not "cannot serve"', async () => {
		const fs = fakeFs(JSON.stringify({ proposals: [] }));
		const entries = await readProposalIndex(INDEX_PATH, fs, {
			source: 'auto',
			databasePath: '/fake/proposals.sqlite',
			readFromSqlResult: async () => ({
				entries: [],
				sourceCommit: 'test',
				logicalDigest: 'digest',
			}),
			log: () => {
				throw new Error('an empty projection must not log a fallback');
			},
		});
		expect(entries).toEqual([]);
		expect(fs.reads).toEqual([INDEX_PATH]);
	});

	it('falls back to JSON on null: null means "cannot serve"', async () => {
		const fs = fakeFs();
		const entries = await readProposalIndex(INDEX_PATH, fs, {
			source: 'auto',
			databasePath: '/fake/proposals.sqlite',
			readFromSql: async () => null,
			log: () => undefined,
		});
		expect(entries).toEqual(JSON_ENTRIES);
		expect(fs.reads).toEqual([INDEX_PATH]);
	});
});

describe('readProposalIndex — forcing a source (f00535 S2)', () => {
	it('forces SQL selection but falls back to JSON when SQL cannot serve', async () => {
		const fs = fakeFs();
		const messages: string[] = [];
		const entries = await readProposalIndex(INDEX_PATH, fs, {
			source: 'sql',
			databasePath: '/fake/proposals.sqlite',
			readFromSql: async () => null,
			log: (message) => messages.push(message),
		});
		expect(entries).toEqual(JSON_ENTRIES);
		expect(fs.reads).toEqual([INDEX_PATH]);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('pinned to "sql"');
	});

	it('forces JSON through the option even when SQL could serve', async () => {
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'json',
			readFromSql: async () => [],
		});
		expect(entries).toEqual(JSON_ENTRIES);
	});

	it('reads the source from the environment switch', async () => {
		expect(
			resolveProposalIndexSource({
				env: { [PROPOSAL_INDEX_SOURCE_ENV_VAR]: 'sql' },
			}),
		).toBe('sql');
		expect(
			resolveProposalIndexSource({
				env: { [PROPOSAL_INDEX_SOURCE_ENV_VAR]: 'auto' },
			}),
		).toBe('auto');
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			env: { [PROPOSAL_INDEX_SOURCE_ENV_VAR]: 'auto' },
			databasePath: '/fake/proposals.sqlite',
			readFromSqlResult: async () => ({
				entries: JSON_ENTRIES,
				sourceCommit: 'test',
				logicalDigest: 'digest',
			}),
		});
		expect(entries).toEqual(JSON_ENTRIES);
	});

	it('ignores an unrecognised environment value instead of failing', () => {
		expect(
			resolveProposalIndexSource({
				env: { [PROPOSAL_INDEX_SOURCE_ENV_VAR]: 'postgres' },
			}),
		).toBe(DEFAULT_PROPOSAL_INDEX_SOURCE);
	});

	it('lets the explicit option win over the environment', () => {
		expect(
			resolveProposalIndexSource({
				source: 'json',
				env: { [PROPOSAL_INDEX_SOURCE_ENV_VAR]: 'sql' },
			}),
		).toBe('json');
	});
});

describe('readProposalIndex — end to end against a real absent projection', () => {
	it('uses the canonical database path derived from the workspace root', async () => {
		const root = emptyWorkspace();
		const fs = fakeFs();
		const seen: string[] = [];
		await readProposalIndex(INDEX_PATH, fs, {
			source: 'auto',
			workspaceRoot: root,
			readFromSql: async (databasePath) => {
				seen.push(databasePath);
				return null;
			},
			log: () => undefined,
		});
		expect(seen).toEqual([
			join(root, '.delendai', 'state', 'proposals.sqlite'),
		]);
	});

	it('goes through the real SQL reader and falls back when the file is absent', async () => {
		const root = emptyWorkspace();
		const fs = fakeFs();
		const entries = await readProposalIndex(INDEX_PATH, fs, {
			source: 'auto',
			workspaceRoot: root,
			log: () => undefined,
		});
		expect(entries).toEqual(JSON_ENTRIES);
	});
});
