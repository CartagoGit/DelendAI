/**
 * model-identity.helper.ts — one identity per model, however it was spelt.
 *
 * The same model signed work and reviews as `minimax-3`, `minimax-3.1`,
 * `minimax-m3`, `minimax-m31`, `minimax-m3.1` and `MiniMax-M3`, so its
 * reviews, refs and attributions split over six names, and none said
 * that the model at work, `MiniMax-M3.1-Flash-Preview`, is a preview:
 * when it is released it is another model. The canonical id is the
 * model's own id as its vendor names it, lower-cased, its release stage
 * included; a spelling that names no model exactly is resolved against
 * the models this machine was seen running, when exactly one fits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	SEEN_MODELS_FILE,
	SEEN_MODELS_VARIABLE,
} from '../contracts/constants/host-chat-model.constant';
import type { IModelSpelling } from '../contracts/interfaces/host-chat-model.interface';

const STAGE_WORDS = new Set([
	'preview',
	'beta',
	'alpha',
	'exp',
	'experimental',
	'rc',
]);

const normalized = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9._-]+/gu, '-')
		.replaceAll(/-{2,}/gu, '-')
		.replace(/^[-._]+|[-._]+$/gu, '');

/** A model id without the `<vendor>/` the editor prefixes it with. */
export const withoutVendor = (value: string): string =>
	value.slice(value.lastIndexOf('/') + 1);

/** How a spelling reads: its brand, its version digits, and its other words. */
export const spellingOf = (id: string): IModelSpelling => {
	const [brand = '', ...rest] = normalized(id).split('-');
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
	const id = normalized(withoutVendor(raw));
	const alias = aliases[id] ?? aliases[normalized(raw)];
	if (alias !== undefined) return normalized(withoutVendor(alias));
	const models = [
		...new Set(known.map((model) => normalized(withoutVendor(model)))),
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

/** Where the models this machine was seen running are remembered. */
export const seenModelsPath = (
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const declared = env[SEEN_MODELS_VARIABLE]?.trim();
	return declared !== undefined && declared.length > 0
		? declared
		: join(homedir(), '.cache', 'delendai', SEEN_MODELS_FILE);
};

/** The model ids this machine was seen running; none when unreadable. */
export const seenModels = (
	path: string = seenModelsPath(),
): readonly string[] => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
		return Array.isArray(parsed)
			? parsed.filter(
					(model): model is string => typeof model === 'string',
				)
			: [];
	} catch {
		return [];
	}
};

/** Remembers a model the host was seen running, once. Never fails its caller. */
export const rememberSeenModel = (
	model: string,
	path: string = seenModelsPath(),
): void => {
	try {
		const known = seenModels(path);
		const id = normalized(withoutVendor(model));
		if (known.includes(id)) return;
		if (!existsSync(dirname(path)))
			mkdirSync(dirname(path), { recursive: true });
		writeFileSync(
			path,
			`${JSON.stringify([...known, id].sort(), null, '\t')}\n`,
		);
	} catch {
		// A cache that cannot be written only means the next spelling is not resolved.
	}
};
