/**
 * requirements/extract.ts — f00135 S2: pull env-var requirements out of a
 * plugin's zod `optionsSchema`.
 *
 * Convention: any `.describe("...env:VAR_NAME...")` string in a zod field
 * is treated as a binding from `VAR_NAME` to the enclosing plugin +
 * capability. The describe text after the `env:` marker (and optional
 * `provider:NAME` marker) is the capability label.
 *
 * Example:
 *   z.object({
 *     token: z.string()
 *       .describe('GitHub token — env:GH_TOKEN, provider:github, capability:GitHub API auth')
 *       .optional(),
 *   })
 *   → IEnvRequirement { var: 'GH_TOKEN', plugin: 'github', provider: 'github',
 *                        capability: 'GitHub API auth', required: false }
 */
import type { IEnvRequirement } from './types';

/** Regex for the env var marker inside a describe() string. */
const ENV_MARKER = /env:([A-Z][A-Z0-9_]*)/;
/** Optional provider marker — pairs the var with a routing tag. */
const PROVIDER_MARKER = /provider:([a-z][a-z0-9_-]*)/;

/**
 * The describe text after stripping markers — what remains is the
 * human-readable capability label.
 */
const CAPABILITY_RE = /^[^-]*/;

interface IZodLike {
	readonly _def?: {
		readonly description?: string;
		readonly typeName?: string;
		readonly shape?: () => Record<string, IZodLike>;
		readonly innerType?: IZodLike;
		readonly schema?: IZodLike;
	};
	readonly description?: string;
	readonly shape?: Record<string, IZodLike>;
}

export type { IZodLike };

/** Best-effort walker over a zod schema. Returns a flat list of fields with describe. */
const walkSchema = (
	schema: IZodLike,
	into: { name: string; description: string }[] = [],
): { name: string; description: string }[] => {
	const def = schema._def;
	// Zod v4: shape is a function on `_def.shape()`.
	let shapeMap: Record<string, IZodLike> | undefined;
	if (typeof def?.shape === 'function') {
		shapeMap = def.shape();
	} else if (schema.shape !== undefined) {
		shapeMap = schema.shape;
	}
	if (shapeMap === undefined) return into;
	for (const [name, child] of Object.entries(shapeMap)) {
		const desc = child._def?.description ?? child.description;
		if (desc !== undefined && desc !== '') {
			into.push({ name, description: desc });
		}
		// Recurse into nested objects.
		walkSchema(child, into);
	}
	return into;
};

/** Pull the env-var bindings out of one describe() string. */
const parseEnvFromDescription = (
	plugin: string,
	describe: string,
): IEnvRequirement[] => {
	const matches = describe.match(ENV_MARKER);
	if (matches === null) return [];
	const varName = matches[1];
	if (varName === undefined) return [];
	const providerMatch = describe.match(PROVIDER_MARKER);
	const provider = providerMatch?.[1];
	// Capability label = text before any marker, trimmed, fall back to describe.
	const head = describe.split(/\s*env:/)[0]?.trim() ?? describe;
	const capability = head.length > 0 ? head : describe;
	// required: true unless the field is .optional() — we approximate by
	// checking for "optional" in the describe text.
	const required = !/optional/i.test(describe);
	const requirement: IEnvRequirement =
		provider !== undefined
			? { var: varName, plugin, capability, provider, required }
			: { var: varName, plugin, capability, required };
	return [requirement];
};

/**
 * Extract every env-var binding from a plugin's zod options schema.
 * Pure over the schema; the caller supplies the plugin id.
 */
export const extractRequirements = (
	plugin: string,
	schema: IZodLike,
): readonly IEnvRequirement[] => {
	const fields = walkSchema(schema);
	const out: IEnvRequirement[] = [];
	for (const f of fields) {
		out.push(...parseEnvFromDescription(plugin, f.description));
	}
	// Deduplicate by (var, plugin) — same var can appear in two fields.
	const seen = new Set<string>();
	return out.filter((r) => {
		const key = `${r.plugin}:${r.var}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};
