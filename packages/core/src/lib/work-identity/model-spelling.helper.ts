/**
 * model-spelling.helper.ts — how a model id is spelt, and the one model a
 * spelling names. Pure: no file, no process, so the contracts that
 * resolve a declared identity can use it.
 */
import type { IModelSpelling } from '../contracts/interfaces/host-chat-model.interface';

const STAGE_WORDS = new Set([
	'preview',
	'beta',
	'alpha',
	'exp',
	'experimental',
	'rc',
]);

const EDGE_SEPARATORS = new Set(['-', '.', '_']);

/**
 * `value` without the separators at either end. An index walk, not
 * `/[-._]+$/`: an anchored run backtracks on every start position, so a
 * long run of `-` from an editor's model id took quadratic time.
 */
const withoutEdgeSeparators = (value: string): string => {
	let start = 0;
	let end = value.length;
	while (start < end && EDGE_SEPARATORS.has(value.charAt(start))) start++;
	while (end > start && EDGE_SEPARATORS.has(value.charAt(end - 1))) end--;
	return value.slice(start, end);
};

export const normalizedModelId = (value: string): string =>
	withoutEdgeSeparators(
		value
			.trim()
			.toLowerCase()
			.replaceAll(/[^a-z0-9._-]+/gu, '-')
			.replaceAll(/-{2,}/gu, '-'),
	);

/** A model id without the `<vendor>/` the editor prefixes it with. */
export const withoutVendor = (value: string): string =>
	value.slice(value.lastIndexOf('/') + 1);

/** How a spelling reads: its brand, its version digits, and its other words. */
export const spellingOf = (id: string): IModelSpelling => {
	const [brand = '', ...rest] = normalizedModelId(id).split('-');
	const digits = rest
		.filter((token) => /\d/u.test(token))
		.map((token) => token.replaceAll(/\D/gu, ''))
		.join('');
	const words = rest.filter(
		(token) => !/\d/u.test(token) && token.length > 0,
	);
	return { brand, digits, words };
};

/** `preview` when the model's own id says it is not released yet, else `stable`. */
export const modelStage = (id: string): 'preview' | 'stable' =>
	spellingOf(id).words.some((word) => STAGE_WORDS.has(word))
		? 'preview'
		: 'stable';

/**
 * The canonical id of `raw`: a declared alias first, then the model id
 * itself when it is one the machine knows, then the one known model its
 * brand, digits and words fit. A spelling that fits none, or several,
 * stays as it was written: guessing would put one model's work under
 * another's name.
 */
export const canonicalModelId = (
	raw: string,
	known: readonly string[],
	aliases: Readonly<Record<string, string>> = {},
): string => {
	const id = normalizedModelId(withoutVendor(raw));
	const alias = aliases[id] ?? aliases[normalizedModelId(raw)];
	if (alias !== undefined) return normalizedModelId(withoutVendor(alias));
	const models = [
		...new Set(
			known.map((model) => normalizedModelId(withoutVendor(model))),
		),
	];
	if (models.includes(id)) return id;
	const asked = spellingOf(id);
	if (asked.digits.length === 0) return id;
	const fitting = models.filter((model) => {
		const candidate = spellingOf(model);
		return (
			candidate.brand === asked.brand &&
			candidate.digits === asked.digits &&
			asked.words.every((word) => candidate.words.includes(word))
		);
	});
	if (fitting.length === 1) return fitting[0] ?? id;
	const exact = fitting.filter(
		(model) => spellingOf(model).words.length === asked.words.length,
	);
	return exact.length === 1 ? (exact[0] ?? id) : id;
};
