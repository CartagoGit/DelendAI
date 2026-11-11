/**
 * land-policy.ts — the project's `development` block as land and its
 * rehearsal read it from the checkout they run in.
 *
 * On the integration path a config that cannot be read is an error, never
 * the defaults: defaults would integrate under rules the project did not
 * declare.
 */
import { readFileSync } from 'node:fs';

import { integrationProtocolRefusal, parseJsonc } from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

export const DEVELOPMENT_CONFIG_PATH = 'delendai.config.json';

/** The `development` block of `text`; throws when it does not parse or is not an object. */
export const developmentConfigOf = (
	text: string,
): { readonly development?: Record<string, unknown> } => {
	const { value, errors } = parseJsonc(text);
	if (errors.length > 0)
		throw new Error(
			`${DEVELOPMENT_CONFIG_PATH} does not parse (${String(errors.length)} error(s)): land refuses to integrate under defaults.`,
		);
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${DEVELOPMENT_CONFIG_PATH} is not an object.`);
	const development = (value as Record<string, unknown>).development;
	if (development === undefined) return {};
	if (
		development === null ||
		typeof development !== 'object' ||
		Array.isArray(development)
	)
		throw new Error(
			`${DEVELOPMENT_CONFIG_PATH}: \`development\` is not an object.`,
		);
	return { development: development as Record<string, unknown> };
};

/** The project's `development` block, read from the checkout; throws when unreadable. */
export const readDevelopmentConfig = (
	path: string = DEVELOPMENT_CONFIG_PATH,
): { readonly development?: Record<string, unknown> } =>
	developmentConfigOf(readFileSync(path, 'utf8'));

/**
 * The policy a land pass runs under, or why it does not run: a config that
 * cannot be read, an engine that is not `land` (nothing to do), or a
 * repository on a newer integration protocol than this code speaks.
 */
export const landPolicy = ():
	| { readonly policy: ReturnType<typeof resolveDevelopmentPolicy> }
	| { readonly stop: string; readonly code: number } => {
	let development: ReturnType<typeof readDevelopmentConfig>;
	try {
		development = readDevelopmentConfig();
	} catch (error) {
		return {
			stop: error instanceof Error ? error.message : String(error),
			code: 2,
		};
	}
	const policy = resolveDevelopmentPolicy(development);
	if (policy.integration.engine !== 'land')
		return {
			stop: "the policy's integration engine is not `land`; nothing to do.",
			code: 0,
		};
	const stale = integrationProtocolRefusal(policy.integration.protocol);
	if (stale !== undefined)
		return { stop: `${stale.reason} ${stale.remedy}`, code: 2 };
	return { policy };
};
