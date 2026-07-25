/**
 * f00129 — `observability` plugin entry point.
 *
 * S1 (error + issue read): `obs_errors` lists recent issues from a
 * Sentry/Datadog source via the allow-listed web-fetch engine. Pure
 * over an injected `IErrorSource`; auth is env-only and never logged.
 * S2 (traces + release health) and S3 (local correlation + catalog)
 * are tracked separately under f00129.
 */
import { z } from 'zod';

import { definePlugin } from '@mcp-vertex/core/public';

import { buildObsErrorsToolRegistration } from './lib/tools/obs-errors.tool';
import { sentryBuildListUrl, sentryParseList } from './lib/errors/list-errors';
import type { IErrorSource } from './lib/errors/ierror-source';

const SENTRY_HOSTS = ['sentry.io', '.sentry.io', '.ingest.sentry.io'] as const;
const DATADOG_HOSTS = ['api.datadoghq.com', 'api.datadoghq.eu'] as const;

/** Resolve a vendor id to its default `IErrorSource` from env. */
const sourceFromEnv = (): IErrorSource | undefined => {
	const sentryToken = process.env.SENTRY_AUTH_TOKEN ?? '';
	if (sentryToken.length > 0) {
		return {
			id: 'sentry',
			baseUrl: process.env.SENTRY_BASE_URL ?? 'https://sentry.io',
			allowList: [...SENTRY_HOSTS],
			token: sentryToken,
			buildListUrl: sentryBuildListUrl({
				id: 'sentry',
				baseUrl: process.env.SENTRY_BASE_URL ?? 'https://sentry.io',
				allowList: [...SENTRY_HOSTS],
				token: sentryToken,
				buildListUrl: () => '',
				parseList: () => [],
			}),
			parseList: sentryParseList,
		};
	}
	const datadogToken = process.env.DATADOG_API_KEY ?? '';
	if (datadogToken.length > 0) {
		// Datadog list-issues mapper is intentionally not yet shipped (S2
		// work); the source descriptor is wired so the plugin registers
		// and the tool returns the actionable install hint at runtime.
		return {
			id: 'datadog',
			baseUrl: 'https://api.datadoghq.com',
			allowList: [...DATADOG_HOSTS],
			token: datadogToken,
			buildListUrl: () => 'https://api.datadoghq.com/api/v2/events',
			parseList: () => [],
		};
	}
	return undefined;
};

const OptionsSchema = z
	.object({
		source: z
			.object({
				id: z.enum(['sentry', 'datadog', 'custom']),
				baseUrl: z.string().url(),
				allowList: z.array(z.string()).min(1),
				token: z.string().min(1),
				buildListUrl: z.any(),
				parseList: z.any(),
				fetch: z.any().optional(),
			})
			.optional(),
	})
	.optional();

export default definePlugin({
	name: 'observability',
	version: '0.1.0',
	describe:
		'Read-only remote error/issue access (Sentry/Datadog) over the allow-listed web-fetch engine. Auth is env-only and never logged. S2 (traces) and S3 (local correlation) tracked separately.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`observability plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const source: IErrorSource | undefined =
			parsed.data?.source ?? sourceFromEnv();
		return {
			tools: [
				buildObsErrorsToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					...(source === undefined ? {} : { source }),
				}),
			],
		};
	},
});
