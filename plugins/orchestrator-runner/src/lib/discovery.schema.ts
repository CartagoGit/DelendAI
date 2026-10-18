/**
 * discovery.schema.ts — what `discover_providers` and `bootstrap_providers`
 * return: the clients found, with their verdict and models, and the ones
 * missing with how to install them.
 */
import z from 'zod';

export const InstallHintSchema = z.object({
	tool: z.string(),
	args: z.array(z.string()),
	pipeTo: z.literal('sh').optional(),
	dangerous: z.boolean(),
	caveat: z.string(),
});

const DetectedProviderSchema = z.object({
	id: z.string(),
	cliPath: z.string().nullable(),
	version: z.string().nullable(),
	authTier: z.string().nullable(),
	/** Whether it can work now, from its own login-status answer. */
	verdict: z
		.enum([
			'usable',
			'needs-login',
			'needs-plan',
			'quota-exhausted',
			'not-installed',
			'unknown',
		])
		.optional(),
	evidence: z
		.object({ command: z.string(), line: z.string() })
		.nullable()
		.optional(),
	/** The models a client that hosts several says it reaches. */
	models: z
		.object({
			listed: z.boolean(),
			providers: z.array(
				z.object({ provider: z.string(), models: z.array(z.string()) }),
			),
			reason: z.string().optional(),
		})
		.optional(),
});

const MissingProviderSchema = z.object({
	id: z.string(),
	installHint: InstallHintSchema,
});

/** Whether the probes ran, and what to do next when they did not. */
const DiscoveryConsentSchema = z.object({
	state: z.enum(['granted', 'declined', 'unavailable', 'manual', 'off']),
	next: z.string().optional(),
});

export const DiscoverProvidersOutputSchema = z.object({
	consent: DiscoveryConsentSchema,
	detected: z.array(DetectedProviderSchema),
	missing: z.array(MissingProviderSchema),
});

/** A single RFC 6902 JSON Patch `add` op (CRITICAL I13). */
const JsonPatchOpSchema = z.object({
	op: z.literal('add'),
	path: z.string(),
	value: z.unknown(),
});

export const BootstrapProvidersOutputSchema = z.object({
	consent: DiscoveryConsentSchema,
	detected: z.array(DetectedProviderSchema),
	missing: z.array(MissingProviderSchema),
	rosterDraftPath: z.string(),
	configPatch: z.array(JsonPatchOpSchema),
	brief: z.string(),
	note: z.string(),
});
