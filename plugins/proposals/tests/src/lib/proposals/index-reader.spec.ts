import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_PROPOSAL_INDEX_SOURCE,
	PROPOSAL_INDEX_SOURCE_ENV_VAR,
	readProposalIndex,
	resetProposalIndexFallbackNotice,
	resolveProposalIndexSource,
	type IProposalIndexEntry,
} from '../../../../src/lib/proposals/index-reader';
import { ProposalIndexSqlUnavailableError } from '../../../../src/lib/proposals/proposal-errors';

import {
	INDEX_JSON,
	INDEX_PATH,
	JSON_ENTRIES,
	emptyWorkspace,
	fakeFs,
} from './index-reader-workspace';

describe('readProposalIndex — signature and default source (f00535 S2)', () => {
	it('defaults to sql: the authority rebuilds itself on demand', () => {
		// q00022 S4 phase 2: `sql` used to be unable to also be the
		// default, because a workspace whose database was not built yet
		// would fail every index read instead of being told once. It now
		// rebuilds the projection from markdown before giving up (see the
		// "rebuild-on-missing" describe block below), so the default can
		// move.
		expect(DEFAULT_PROPOSAL_INDEX_SOURCE).toBe('sql');
		expect(resolveProposalIndexSource({ env: {} })).toBe('sql');
	});

	it('keeps the 2-arg call shape every consumer uses (source pinned to json)', async () => {
		// The JSON reading mechanics (arg shape, parse tolerance) are
		// orthogonal to which source answers by default; pin `json` so
		// this exercises exactly that, independent of the default.
		const fs = fakeFs();
		expect(
			await readProposalIndex(INDEX_PATH, fs, { source: 'json' }),
		).toEqual(JSON_ENTRIES);
	});

	it('the default serves JSON, once noticed, where no projection can be located', async () => {
		// `/nope/index.json` matches no canonical layout, so neither the
		// database nor a workspace to rebuild into can be resolved. Nobody
		// chose `sql` here, so the read is not refused over it.
		const notices: string[] = [];
		const read = () =>
			readProposalIndex('/nope/index.json', fakeFs(), {
				env: {},
				log: (message) => notices.push(message),
			});
		expect(await read()).toEqual(JSON_ENTRIES);
		expect(await read()).toEqual(JSON_ENTRIES);
		expect(notices).toHaveLength(1);
		expect(notices[0]).toContain('no SQLite projection can be located');
	});

	it('a chosen sql refuses where no projection can be located', async () => {
		await expect(
			readProposalIndex('/nope/index.json', fakeFs(), { source: 'sql' }),
		).rejects.toBeInstanceOf(ProposalIndexSqlUnavailableError);
		await expect(
			readProposalIndex('/nope/index.json', fakeFs(), {
				env: { [PROPOSAL_INDEX_SOURCE_ENV_VAR]: 'sql' },
			}),
		).rejects.toBeInstanceOf(ProposalIndexSqlUnavailableError);
	});

	it('returns the parsed `proposals` array unchanged', async () => {
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'json',
		});
		expect(entries).toEqual(
			(JSON.parse(INDEX_JSON) as { proposals: IProposalIndexEntry[] })
				.proposals,
		);
	});

	it('returns [] when the index is missing or unparseable', async () => {
		expect(
			await readProposalIndex(INDEX_PATH, fakeFs(null), {
				source: 'json',
			}),
		).toEqual([]);
		expect(
			await readProposalIndex(INDEX_PATH, fakeFs('{ not json'), {
				source: 'json',
			}),
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
		const jsonResult = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'json',
		});
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
	const _SQL_ENTRIES: readonly IProposalIndexEntry[] = [
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
	it('throws when pinned to sql and SQL cannot serve — never a quiet JSON read', async () => {
		// The bug this pins: `sql` used to fall back exactly like `auto`,
		// so pinning it to prove production ran on SQL proved nothing.
		const fs = fakeFs();
		await expect(
			readProposalIndex(INDEX_PATH, fs, {
				source: 'sql',
				databasePath: '/fake/proposals.sqlite',
				readFromSql: async () => null,
				log: () => undefined,
			}),
		).rejects.toMatchObject({
			name: 'ProposalIndexSqlUnavailableError',
			failure: 'unavailable',
		});
		// And it did not consult the legacy index on the way out.
		expect(fs.reads).toEqual([]);
	});

	it('throws when pinned to sql and the projection was never stamped', async () => {
		await expect(
			readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'sql',
				databasePath: '/fake/proposals.sqlite',
				readFromSqlResult: async () => ({
					entries: JSON_ENTRIES,
					sourceCommit: null,
					logicalDigest: null,
				}),
				log: () => undefined,
			}),
		).rejects.toBeInstanceOf(ProposalIndexSqlUnavailableError);
	});

	it('serves SQL over a diverging JSON when pinned, and reports the difference once', async () => {
		// Under `sql` the database is the authority. Letting the legacy
		// copy override it would be the silent fallback again.
		const sqlOnly = [
			{ ...JSON_ENTRIES[0], status: 'done' },
		] as typeof JSON_ENTRIES;
		const messages: string[] = [];
		const read = async (): Promise<unknown> =>
			readProposalIndex(INDEX_PATH, fakeFs(), {
				source: 'sql',
				databasePath: '/fake/proposals.sqlite',
				readFromSqlResult: async () => ({
					entries: sqlOnly,
					sourceCommit: 'abc123',
					logicalDigest: 'digest',
				}),
				log: (message) => messages.push(message),
			});

		expect(await read()).toEqual(sqlOnly);
		await read();
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('pinned to "sql"');
	});

	it('keeps auto falling back to JSON when SQL cannot serve', async () => {
		const entries = await readProposalIndex(INDEX_PATH, fakeFs(), {
			source: 'auto',
			databasePath: '/fake/proposals.sqlite',
			readFromSql: async () => null,
			log: () => undefined,
		});
		expect(entries).toEqual(JSON_ENTRIES);
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
			join(root, '.cache', 'delendai', 'state', 'proposals.sqlite'),
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
