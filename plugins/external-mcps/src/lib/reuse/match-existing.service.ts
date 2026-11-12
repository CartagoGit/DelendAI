/**
 * match-existing.service.ts — before a described component becomes a new
 * file, the components the project already has that it may be.
 *
 * "Add a button" from a design produced a third button beside the two
 * the project had. The candidates are reported with how much of the
 * description their names share, so adding one more is a decision
 * somebody makes, not a default.
 */
import { basename, extname } from 'node:path';

import type { IReuseCandidate } from '../contracts/interfaces/external-answer.interface';

const MIN_SIMILARITY = 0.34;
const MAX_CANDIDATES = 5;
const NOISE = new Set([
	'component',
	'components',
	'the',
	'a',
	'an',
	'new',
	'ui',
	'view',
	'index',
]);

/** The words of a name: `PrimaryButton`, `primary-button` and `primary_button` alike. */
export const wordsOf = (text: string): ReadonlySet<string> =>
	new Set(
		text
			.replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
			.toLowerCase()
			.split(/[^a-z0-9]+/u)
			.filter((word) => word.length > 1 && !NOISE.has(word)),
	);

export const matchExisting = (
	description: string,
	components: readonly string[],
): readonly IReuseCandidate[] => {
	const wanted = wordsOf(description);
	if (wanted.size === 0) return [];
	return components
		.map((path) => {
			const name = wordsOf(
				basename(path, extname(path)).replace(/\.component$/u, ''),
			);
			const shared = [...wanted].filter((word) => name.has(word)).length;
			const union = new Set([...wanted, ...name]).size;
			return {
				path,
				similarity:
					union === 0 ? 0 : Math.round((shared / union) * 100) / 100,
			};
		})
		.filter((candidate) => candidate.similarity >= MIN_SIMILARITY)
		.sort(
			(left, right) =>
				right.similarity - left.similarity ||
				left.path.localeCompare(right.path),
		)
		.slice(0, MAX_CANDIDATES);
};
