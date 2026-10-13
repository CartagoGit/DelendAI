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

import { normalizedModelId, withoutVendor } from './model-spelling.helper';

export {
	canonicalModelId,
	modelStage,
	spellingOf,
	withoutVendor,
} from './model-spelling.helper';

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
		const id = normalizedModelId(withoutVendor(model));
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
