/**
 * options-schema.ts — the `plugins.external-mcps` config contract (f00068 S1).
 *
 * The config block is editable by humans AND by the LLM (via the suggest
 * flow in a later slice), so the schema is the gate:
 *
 * - `servers` is a record keyed by kebab-case server id (the id is the
 *   roster key AND the `ext.<id>.*` namespace root — gate decision 4).
 * - `version` is a MANDATORY exact semver pin. `latest`/`next`/ranges are
 *   rejected with a `missing-version-pin` issue so the LLM can fix it on
 *   the spot (supply-chain rule: `npx -y pkg@latest` runs whatever npm
 *   serves at call time).
 * - `env` entries are environment-variable NAMES only, never values
 *   (gate decision 7 — no cleartext secrets in the config). A value
 *   assignment (`FOO=bar`) or a 20+ char mixed-case token is rejected.
 * - The three autonomy knobs default to the resolved security posture:
 *   llmDecidesActivation:true, requireHumanAckWhenLlmDecides:true,
 *   allowDiscoverySearch:false (the kill switch stays off).
 *
 * Pure module: no I/O, no core imports — `external_mcp_validate_config`
 * dry-runs proposals against these schemas without booting anything.
 */
import { z } from 'zod';

/** Server ids are kebab-case: unique roster keys and `ext.<id>` roots. */
export const KEBAB_CASE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Exact `X.Y.Z` semver, optionally with prerelease/build metadata. */
const EXACT_SEMVER_RE =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

/** Floating dist-tags that defeat pinning (all rejected). */
const FLOATING_TAGS = new Set([
	'latest',
	'next',
	'canary',
	'beta',
	'alpha',
	'*',
]);

/**
 * Heuristic for a cleartext credential smuggled where a NAME belongs:
 * 20+ chars mixing upper- and lower-case (env NAMES are conventionally
 * UPPER_SNAKE; long mixed-case blobs look like tokens).
 */
export const looksLikeCleartextSecret = (value: string): boolean =>
	value.length >= 20 && /[a-z]/.test(value) && /[A-Z]/.test(value);

/**
 * Validate one `env` entry as an environment-variable NAME. Returns the
 * issue message (with a stable `code:` prefix) or `null` when valid.
 */
export const envVarNameIssue = (value: string): string | null => {
	if (value.includes('=')) {
		return `env-value-not-allowed: "${value.slice(0, 32)}…" — env entries are variable NAMES only, never NAME=VALUE assignments`;
	}
	if (looksLikeCleartextSecret(value)) {
		return 'cleartext-secret-suspected: env entry looks like a credential value (20+ char mixed-case token); declare the variable NAME instead';
	}
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		return `invalid-env-name: "${value}" is not a valid environment variable name`;
	}
	return null;
};

/** Mandatory exact pin. `latest` & friends get the specific issue code. */
export const VersionSchema = z.string().superRefine((value, ctx) => {
	const normalized = value.trim().toLowerCase();
	if (
		FLOATING_TAGS.has(normalized) ||
		normalized.endsWith('@latest') ||
		normalized === ''
	) {
		ctx.addIssue({
			code: 'custom',
			message:
				'missing-version-pin: version must be an exact semver pin (e.g. "1.4.2") — floating tags like "latest" are a supply-chain hole',
		});
		return;
	}
	if (!EXACT_SEMVER_RE.test(value.trim())) {
		ctx.addIssue({
			code: 'custom',
			message: `invalid-version: "${value}" is not an exact semver pin (ranges like "^1.2.3" are not pinned)`,
		});
	}
});

export const EnvVarNameSchema = z.string().superRefine((value, ctx) => {
	const issue = envVarNameIssue(value);
	if (issue !== null) ctx.addIssue({ code: 'custom', message: issue });
});

/** One declared external server (transport + pin + namespace + detect). */
export const ServerEntrySchema = z
	.object({
		/** Config switchboard override; disabled entries stay visible but never boot. */
		enabled: z.boolean().optional(),
		/** REQUIRED exact semver pin (never `latest` — see VersionSchema). */
		version: VersionSchema,
		/** Executable that boots the server (e.g. `npx`, `uvx`, `docker`). */
		command: z.string().min(1),
		/** Arguments for `command`; the pinned package spec belongs here. */
		args: z.array(z.string()),
		/**
		 * Tool namespace root (defaults to `ext.<id>` when omitted; the
		 * subprocess registry in S2 applies it).
		 */
		namespacePrefix: z.string().min(1).optional(),
		/**
		 * Optional auto-detect rule (e.g. a `package.json` dependency
		 * probe). Detection only ANNOTATES catalog/suggest output — it
		 * never activates a server (knob semantics preserved, S4).
		 */
		detect: z.string().min(1).optional(),
		/**
		 * Environment variables the server needs, by NAME only. Values
		 * live in the user's shell/host secret store — never in config.
		 */
		env: z.array(EnvVarNameSchema).optional(),
	})
	.strict();

/**
 * The declared roster: kebab-case id → server entry. Key validation is a
 * superRefine (not a key schema) so the issue keeps a precise, actionable
 * message — zod v4 collapses key-schema failures into a generic
 * "Invalid key in record".
 */
export const ServersSchema = z
	.record(z.string(), ServerEntrySchema)
	.superRefine((servers, ctx) => {
		for (const key of Object.keys(servers)) {
			if (!KEBAB_CASE_RE.test(key)) {
				ctx.addIssue({
					code: 'custom',
					path: [key],
					message:
						'invalid-server-id: server names must be kebab-case (lowercase letters, digits, single hyphens)',
				});
			}
		}
	});

export const OptionsSchema = z
	.object({
		/** The servers the host may mount. Empty by default (opt-in). */
		servers: ServersSchema.optional(),
		/**
		 * When true (default) the LLM may activate servers WITHIN the
		 * declared set; when false it can only suggest and a human
		 * activates.
		 */
		llmDecidesActivation: z.boolean().default(true),
		/**
		 * When true (default) every LLM-decided activation awaits a
		 * recorded human ack (non-modal notification + dashboard, S3).
		 */
		requireHumanAckWhenLlmDecides: z.boolean().default(true),
		/**
		 * Kill switch for live npm/GitHub discovery. OFF by default; when
		 * enabled the 10 calls / 10 min budget and per-candidate ack apply
		 * (S5).
		 */
		allowDiscoverySearch: z.boolean().default(false),
	})
	.strict();

export type IExternalMcpsOptions = z.infer<typeof OptionsSchema>;
export type IServerEntry = z.infer<typeof ServerEntrySchema>;
