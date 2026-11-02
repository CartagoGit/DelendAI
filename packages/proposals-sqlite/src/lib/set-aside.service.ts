/**
 * set-aside.service.ts
 *
 * The proposal files a rebuild could not represent, kept where the
 * proposals are read from.
 *
 * A rebuild sets aside a file it cannot project (no `kind`, an unknown
 * status, an id another file already holds) and builds the rest. The
 * list went back to whoever called the rebuild and nowhere else, so a
 * read that rebuilt on its own dropped it: the file was absent from
 * every count and nothing said why. It is written to `quarantine` with
 * the run that found it, and read from there.
 */
import { ProposalsSqliteDriver } from './sqlite-driver';

/**
 * Replace the pending set-aside files of the database at `databasePath`
 * with `files`: the list is what the last rebuild found, not a history.
 * Entries somebody resolved or ignored are kept. Returns how many were
 * written.
 */
export const recordSetAsideFiles = (input: {
	readonly databasePath: string;
	readonly files: readonly {
		readonly path: string;
		readonly blobSha: string;
		readonly code: string;
		readonly message: string;
	}[];
	readonly now: number;
}): number => {
	const driver = new ProposalsSqliteDriver({ path: input.databasePath });
	try {
		const handle = driver.handle;
		handle.transaction(() => {
			const run = handle
				.query<{ readonly id: number }, []>(
					'SELECT id FROM reconciliation_runs ORDER BY id DESC LIMIT 1',
				)
				.get();
			handle
				.prepare("DELETE FROM quarantine WHERE status = 'pending'")
				.run();
			for (const file of input.files) {
				handle
					.prepare(
						`INSERT INTO quarantine (
							source_path, blob_sha, error_code, error_message,
							run_id, status, created_at, updated_at
						) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
					)
					.run(
						file.path,
						file.blobSha,
						file.code,
						file.message,
						run?.id ?? null,
						input.now,
						input.now,
					);
			}
		})();
		return input.files.length;
	} finally {
		driver.close();
	}
};

/**
 * The pending set-aside files of the database at `databasePath`: how
 * many, and each one's path and reason, by path. `null` when the
 * database cannot be read.
 */
export const readSetAsideFiles = (
	databasePath: string,
): readonly { readonly path: string; readonly reason: string }[] | null => {
	try {
		const driver = new ProposalsSqliteDriver({
			path: databasePath,
			readonly: true,
		});
		try {
			return driver.handle
				.query<
					{
						readonly source_path: string;
						readonly error_message: string;
					},
					[]
				>(
					`SELECT source_path, error_message
					 FROM quarantine
					 WHERE status = 'pending'
					 ORDER BY source_path ASC`,
				)
				.all()
				.map((row) => ({
					path: row.source_path,
					reason: row.error_message,
				}));
		} finally {
			driver.close();
		}
	} catch {
		return null;
	}
};
