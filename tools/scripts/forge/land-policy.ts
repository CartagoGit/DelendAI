/**
 * land-policy.ts — the project's `development` block as land and its
 * rehearsal read it from the checkout they run in.
 */
import { readFileSync } from 'node:fs';

import { parseJsonc } from '@delendai/core/cli';

/** The project's `development` block, `{}` when the config is absent or invalid. */
export const readDevelopmentConfig = (): {
	readonly development?: Record<string, unknown>;
} => {
	try {
		const { value, errors } = parseJsonc(
			readFileSync('delendai.config.json', 'utf8'),
		);
		// A config that does not parse declares no policy: the defaults stand.
		if (errors.length > 0) return {};
		const development = (value as Record<string, unknown>).development;
		return development === null || typeof development !== 'object'
			? {}
			: { development: development as Record<string, unknown> };
	} catch {
		return {};
	}
};
