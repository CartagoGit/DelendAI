/**
 * model-catalogue-cache.migration.service.ts — the model catalogue cached
 * by the first offer of accounts (`~/.cache/delendai/model-catalogue.json`)
 * moves into the catalogue layers (`~/.cache/delendai/catalogues/models.json`).
 *
 * It keeps its providers and its date, and carries no ETag, so the next
 * check downloads the catalogue in full. A copy already in the new place
 * wins and the old file is left alone. Each move is journalled beside the
 * copies.
 */
import { appendFile, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { LEGACY_MODEL_CATALOGUE_FILE } from '../contracts/constants/public-catalogues.constant';
import type { IModelCatalogue } from '../contracts/interfaces/account-finding.interface';
import type { ICatalogueCopy } from '../contracts/interfaces/public-catalogue.interface';
import { writeFileAtomic } from './atomic-write';
import { catalogueCachePath } from './public-catalogue-sources.service';

export const legacyModelCataloguePath = (): string =>
	join(homedir(), '.cache', 'delendai', LEGACY_MODEL_CATALOGUE_FILE);

/** Move the old copy into the layers; `true` when it moved. Never throws. */
export const migrateLegacyModelCatalogue = async (input: {
	readonly cacheDir?: string | undefined;
	readonly legacyPath?: string | undefined;
	readonly format: number;
	readonly now?: Date | undefined;
}): Promise<boolean> => {
	const from = input.legacyPath ?? legacyModelCataloguePath();
	const to = catalogueCachePath('models', input.cacheDir);
	const legacy = await readFile(from, 'utf8')
		.then((text) => JSON.parse(text) as Partial<IModelCatalogue>)
		.catch(() => undefined);
	if (
		legacy === undefined ||
		!Array.isArray(legacy.providers) ||
		typeof legacy.fetchedAt !== 'string'
	)
		return false;
	if (
		await readFile(to, 'utf8').then(
			() => true,
			() => false,
		)
	)
		return false;
	const copy: ICatalogueCopy<IModelCatalogue> = {
		meta: {
			source: 'https://models.dev/api.json',
			format: input.format,
			fetchedAt: legacy.fetchedAt,
			checkedAt: legacy.fetchedAt,
			sha256: '',
		},
		data: { fetchedAt: legacy.fetchedAt, providers: legacy.providers },
	};
	try {
		await writeFileAtomic(to, JSON.stringify(copy));
		await rm(from, { force: true });
		await appendFile(
			join(dirname(to), 'journal.jsonl'),
			`${JSON.stringify({ at: (input.now ?? new Date()).toISOString(), moved: { from, to } })}\n`,
		);
		return true;
	} catch {
		return false;
	}
};
