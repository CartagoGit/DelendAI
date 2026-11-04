/**
 * llm-trailer.helper.ts — whether a commit message credits an AI model as
 * a co-author, with the public model catalogue as the vocabulary.
 *
 * A hand-kept list of ten makers whose `gpt-?[3-9]` missed `gpt-10` let
 * an unknown maker pass. The vocabulary is now every provider id, name and
 * model family the catalogue lists (shipped snapshot when offline), so a
 * maker listed tomorrow is caught without an edit here.
 */
import type { readModelCatalogue } from '@delendai/core/cli';

type IModelCatalogue = NonNullable<
	Awaited<ReturnType<typeof readModelCatalogue>>
>;

/** Words too common in names to stand for a maker on their own. */
const TOO_COMMON = new Set([
	'open',
	'chat',
	'code',
	'model',
	'models',
	'ai',
	'api',
	'llm',
	'local',
]);

const MIN_WORD = 3;

/** Every word the catalogue names a maker, a provider or a model family by. */
export const makerVocabulary = (
	catalogue: IModelCatalogue | undefined,
): readonly string[] => {
	const words = new Set<string>();
	for (const provider of catalogue?.providers ?? []) {
		words.add(provider.id.split('-')[0] ?? provider.id);
		for (const word of provider.name.toLowerCase().split(/[^a-z0-9]+/u))
			words.add(word);
		for (const model of provider.models) {
			const family = /^[a-z]+/u.exec(
				model.split('/').pop()?.toLowerCase() ?? '',
			)?.[0];
			if (family !== undefined) words.add(family);
		}
	}
	return [...words]
		.filter((word) => word.length >= MIN_WORD && !TOO_COMMON.has(word))
		.sort();
};

/** The co-author trailers of `message` that credit a catalogue maker or model. */
export const llmCoAuthorTrailers = (
	message: string,
	vocabulary: readonly string[],
): readonly string[] => {
	if (vocabulary.length === 0) return [];
	const named = new RegExp(
		`(^|[^a-z0-9])(${vocabulary.map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})`,
		'iu',
	);
	return message
		.split('\n')
		.filter(
			(line) =>
				/^co-authored-by:/iu.test(line.trim()) && named.test(line),
		);
};
