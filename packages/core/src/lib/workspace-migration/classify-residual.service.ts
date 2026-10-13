/**
 * classify-residual.service.ts — b00239 S8.
 *
 * Decides what a leftover mention of the old identity IS, after a
 * migration has run.
 *
 * The vocabulary and the path lists live in
 * `contracts/constants/legacy-identity.constant.ts`, shared with the
 * migrators, because a rename whose migrator and scanner disagree about
 * the old name reports itself complete while leaving live references
 * behind.
 */
import {
	GENERATED_PATH_MARKERS,
	HISTORICAL_PATH_SEGMENTS,
	VENDORED_PATH_SEGMENTS,
} from '../contracts/constants/legacy-identity.constant';
import type { IResidualClass } from '../contracts/interfaces/workspace-migration.interface';

/**
 * Classify one hit by where it lives.
 *
 * Deliberately asymmetric: anything this cannot place is `live`. A hit
 * wrongly called live costs somebody a look; a hit wrongly called
 * historical is a broken reference that ships while the migration reports
 * success.
 */
export const classifyResidual = (
	file: string,
	/**
	 * Repository-specific history locations, on top of the generic ones.
	 * This repository passes `/proposals/done/`; another project's records
	 * live somewhere else entirely, and core has no business guessing.
	 */
	extraHistoricalSegments: readonly string[] = [],
): { readonly classification: IResidualClass; readonly reason: string } => {
	const normalized = `/${file.replace(/^\/+/u, '')}`;
	for (const segment of VENDORED_PATH_SEGMENTS)
		if (normalized.includes(segment))
			return {
				classification: 'vendored',
				reason: `under ${segment} — third-party, not ours to edit`,
			};
	for (const marker of GENERATED_PATH_MARKERS)
		if (normalized.includes(marker))
			return {
				classification: 'generated',
				reason: `emitted artefact (${marker}) — regenerate from its source instead`,
			};
	for (const segment of [
		...HISTORICAL_PATH_SEGMENTS,
		...extraHistoricalSegments,
	])
		if (normalized.includes(segment))
			return {
				classification: 'historical',
				reason: `under ${segment} — a record of what happened; rewriting it would falsify the record`,
			};
	return {
		classification: 'live',
		reason: 'not identifiable as history, vendored or generated',
	};
};
