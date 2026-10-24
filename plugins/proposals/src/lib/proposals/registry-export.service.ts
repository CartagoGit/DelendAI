/**
 * registry-export.service.ts — the proposal registry, derived from the
 * database instead of a second scan of the markdown (the registry exported from the database).
 *
 * The database keeps each proposal's parsed frontmatter (migration 0023),
 * and `registryEntryFrom` is the same builder the markdown scan uses, so
 * an entry exported here is the entry the scan would write for the same
 * file. Not yet the registry's producer: the parity it has to keep is
 * proven first (`registry-export.parity.spec.ts`).
 */
import { basename } from 'node:path';

import type {
	IRegistryExport,
	IRegistryExportRow,
} from '../contracts/interfaces/registry-entry.interface';
import { openReadonlyProposalsDb } from './index-reader-sql';
import { registryEntryFrom, toIndexEntry } from './registry-entry.helper';

/** Registry entries from the database's proposal rows. Pure. */
export const registryEntriesFromRows = (
	rows: readonly IRegistryExportRow[],
): IRegistryExport => {
	const entries: Readonly<Record<string, unknown>>[] = [];
	const errors: string[] = [];
	for (const row of rows) {
		if (row.source_path === null) continue;
		if (row.frontmatter_json === null) {
			errors.push(
				`${row.source_path}: projected without its frontmatter; reconcile to fill it`,
			);
			continue;
		}
		const built = registryEntryFrom({
			name: basename(row.source_path),
			relPath: row.source_path,
			parsed: JSON.parse(row.frontmatter_json) as Record<string, unknown>,
		});
		if (built.ok) entries.push(toIndexEntry(built.entry));
		else errors.push(built.detail);
	}
	return { entries, errors };
};

/**
 * The registry as the database at `databasePath` holds it, or `null`
 * when the database cannot be read.
 */
export const exportRegistryFromDb = async (
	databasePath: string,
): Promise<IRegistryExport | null> => {
	const db = await openReadonlyProposalsDb(databasePath);
	if (db === null) return null;
	try {
		return registryEntriesFromRows(
			db
				.query<IRegistryExportRow>(
					'SELECT source_path, frontmatter_json FROM proposals WHERE deleted_at IS NULL ORDER BY source_path',
				)
				.all(),
		);
	} finally {
		db.close();
	}
};
