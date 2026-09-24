/**
 * migration-checksums.spec.ts — an applied migration is never edited, and
 * a database is never refused for an edit that changed nothing.
 *
 * `bun test`, never vitest: it opens real databases through `bun:sqlite`.
 *
 * #121 changed a SQL comment inside `0015_work_model_identity.sql`, which
 * changed its checksum. Every database created before that commit then
 * refused to open, and startup reconciliation blocked all mutations over a
 * file that was not corrupt. Two properties close that for good, in any
 * repository that runs these migrations:
 *
 *   - every migration's checksum is pinned here, so an edit to an applied
 *     migration fails CI instead of reaching someone's database;
 *   - a mismatch whose schema is still identical to what the current files
 *     build is healed, while a mismatch that changed the schema is refused.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	MIGRATION_CHECKSUMS,
	MigrationChecksumMismatchError,
	parseMigrationVersion,
} from '../../../src/lib/migrations';
import {
	makeFixture,
	ProposalsSqliteDriver,
	type IWorkModelFixture,
} from './work-model/fixture';

/** Never edit a line. A changed schema is a NEW migration file. */
const PINNED: Readonly<Record<string, string>> = {
	'0001_initial.sql':
		'218cbae7818c0624089f445a4c6ecb12d800f4b97d7525ef59352caeca391556',
	'0002_reconciliation_runs.sql':
		'21c369c7440ed7736c13d37d110e0e9f05fd18daefdec3818ea52d10d95352b9',
	'0003_lifecycle_events.sql':
		'2c9a866a472a1eda7e9adec62dfced171101c6acf4e530afb445b04285a3b162',
	'0004_outbox.sql':
		'680f354b0cf65556ddaf17d614431c2d80b1993a9280951a2ee8fc8d80e899c4',
	'0005_quarantine_and_tombstones.sql':
		'eb46286871ff1e906124ab5d7159ab14a67b77f61025a82b8cb7ee1c21515f7f',
	'0006_mutation_commands.sql':
		'769bb61e7ad48f58b826f4ed37f29d4d486e29511fb90f11ab5dc836d9e4c955',
	'0007_lifecycle_events_append_only_guards.sql':
		'2274ad57777491217d19352391822a69d48508ce6056a0fdcc7b4d752b847ba8',
	'0008_plan_slice_lifecycle_parity.sql':
		'f12ede199c4deebbea3c03a03c79bc2a3b23eced13e1e7fd0608b1d4567915fd',
	'0009_outbox_leases.sql':
		'615d72f542573b894ff0741b0aca7aa86905fbbf9268c618e0d38c0c6eb1d34e',
	'0010_fts5.sql':
		'b9d85682d700b34f50d41824a7f4a1b2fc7aed8b9860032f7b60562a8c8966a3',
	'0011_kind_vocabulary.sql':
		'd74d24180eeca7ee53dba9b66ad9ad61217afe2a93fb0643d079de945ee5e876',
	'0012_summary_cache.sql':
		'b38c9e5e1859365256387007b0fbf280a2756a1b69743ae8d374fde1f51945e8',
	'0013_compile_runs.sql':
		'7f29ebad72702b7c70d94f421b085bc1fb6f03cc4574ad3085f7ee74e9b78a5a',
	'0014_tombstones.sql':
		'2bd49addae143bf1047535b2ebad1f3dbd25b9a51d5a7ea6baf8529b0dbf7521',
	'0015_work_model_identity.sql':
		'd840f2ad744cdca2dfdc110832e28ea0a3a257f400030b4565bd834048ccb20f',
	'0016_work_units_generations.sql':
		'25b4cab5e8d92de2f5beb30be3c1840e474473a3fec1bacdb37b900fdebfefb3',
	'0017_coordination_journal.sql':
		'453eca985d423235518b3c79eb08f224cf90794b4aa9e8588524c1e966069d31',
	'0018_revision_step_guards.sql':
		'019bfb699914794cbc6262b277e3632792cd799d2d179e4c523c6491c5f2ae3a',
	'0019_ref_attribution_is_not_a_local_agent.sql':
		'a7486c20040dcea160530ec12f64a200ae8be15b408bd068c1066881e16b3688',
	'0020_strict_tables.sql':
		'e4ccb916b3c63cbb7b4619f0f52835a7d8ab29c03e0e922e971c0b1b707c946f',
};

/** What `0015` hashed to before #121 edited its comment. */
const PRE_121_0015 =
	'2b063fa3b4cb201443cafc612cf7ff4dc2edd3bb2ae28f52ef3cfc5d802c3d89';

const MIGRATION_0015 = '0015_work_model_identity.sql';

describe('migration checksums', () => {
	it('pins every migration: an applied one is never edited, only followed by a new one', () => {
		expect(MIGRATION_CHECKSUMS).toEqual(PINNED);
	});
});

describe('a database whose recorded checksum no longer matches its file', () => {
	let fixture: IWorkModelFixture;

	beforeEach(() => {
		fixture = makeFixture('migration-checksums');
	});

	afterEach(() => fixture.dispose());

	const withDriver = <T>(run: (driver: ProposalsSqliteDriver) => T): T => {
		const driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			return run(driver);
		} finally {
			driver.close();
		}
	};

	const recordChecksum = (name: string, value: string): void => {
		withDriver((driver) =>
			driver.handle
				.prepare(
					'UPDATE schema_migrations SET checksum = ? WHERE version = ?',
				)
				.run(value, parseMigrationVersion(name)),
		);
	};

	const storedChecksum = (name: string): string | undefined =>
		withDriver(
			(driver) =>
				driver.handle
					.query<{ checksum: string }, [number]>(
						'SELECT checksum FROM schema_migrations WHERE version = ?',
					)
					.get(parseMigrationVersion(name))?.checksum,
		);

	it('opens when only the file changed, and brings the record forward', () => {
		// Exactly the database #121 locked out: created before the comment
		// edit, schema identical to what the current file builds.
		recordChecksum(MIGRATION_0015, PRE_121_0015);

		expect(storedChecksum(MIGRATION_0015)).toBe(PINNED[MIGRATION_0015]);
	});

	it('heals any comment-only edit, not only one somebody listed', () => {
		recordChecksum(MIGRATION_0015, '0'.repeat(64));

		expect(storedChecksum(MIGRATION_0015)).toBe(PINNED[MIGRATION_0015]);
	});

	it('still refuses when the schema itself differs from what the files build', () => {
		withDriver((driver) =>
			driver.handle.exec('CREATE TABLE drifted_by_hand (id INTEGER)'),
		);
		recordChecksum(MIGRATION_0015, PRE_121_0015);

		expect(
			() => new ProposalsSqliteDriver({ path: fixture.dbPath }),
		).toThrow(MigrationChecksumMismatchError);
	});
});
