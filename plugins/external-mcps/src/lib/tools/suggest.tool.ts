/**
 * suggest.tool.ts — `<prefix>_suggest` (f00068 S3).
 *
 * The LLM-assisted config flow: given a free-text `need`, match the seed
 * catalog (reusing the S1 data + filter logic — never duplicated) and
 * return an RFC 6902 JSON Patch proposal targeting
 * `plugins.external-mcps.options.servers` in `mcp-vertex.config.json`,
 * following the f00067 bootstrap-wizard patch convention.
 *
 * Token-lean and trust-gradient by design:
 *
 * - Max 3 candidates, ONE-line rationale each (tier + catalog summary).
 * - The patch only ADDS: already-declared server ids are skipped, so
 *   re-running is non-destructive.
 * - The tool NEVER writes — applying the patch stays with the
 *   human/host (dry-run it first via `validate_config`; activation is
 *   further gated by the S3 ack flow).
 *
 * Pure and read-only: no filesystem, no network, no state.
 */
import { toolJson, type IToolRegistration } from '@mcp-vertex/core/public';
import { z } from 'zod';

import type { ICatalogEntry } from '../catalog/catalog-data';
import { filterCatalog } from './catalog.tool';

/** Hard cap on suggested candidates per call (token-lean mandate). */
export const MAX_SUGGEST_CANDIDATES = 3;

/** JSON Pointer to the config block every suggested op targets. */
export const SERVERS_POINTER = '/plugins/external-mcps/options/servers';

/** A single RFC 6902 `add` op (same convention as the f00067 wizard). */
export interface IJsonPatchOp {
	readonly op: 'add';
	readonly path: string;
	readonly value: unknown;
}

export interface ISuggestToolOptions {
	readonly namespacePrefix: string;
	/** The plugin's raw `ctx.options` — used to skip declared ids. */
	readonly options: Readonly<Record<string, unknown>>;
	/**
	 * Optional detection provider (f00068 S4). Candidates whose id is in
	 * the returned set are annotated `detected: true` — a signal only
	 * (e.g. "this workspace already uses Angular"); it NEVER activates a
	 * server. Absent by default so the tool stays pure in tests.
	 */
	readonly detect?: () => Promise<ReadonlySet<string>>;
}

const InputSchema = z.object({
	/** Free-text description of the capability gap (e.g. "query postgres"). */
	need: z.string().min(1),
});

const PatchOpSchema = z.object({
	op: z.literal('add'),
	path: z.string(),
	value: z.unknown(),
});

const CandidateSchema = z.object({
	id: z.string(),
	category: z.string(),
	/** ONE line: tier + catalog summary. */
	rationale: z.string(),
	/** Present + true only when a detect rule matched this workspace (S4). */
	detected: z.boolean().optional(),
});

export const SuggestOutputSchema = z.object({
	ok: z.literal(true),
	/** TOTAL catalog matches (may exceed the ≤3 returned candidates). */
	total: z.number().int().nonnegative(),
	candidates: z.array(CandidateSchema).max(MAX_SUGGEST_CANDIDATES),
	/** RFC 6902 JSON Patch for `mcp-vertex.config.json` — NEVER applied here. */
	patch: z.array(PatchOpSchema),
	note: z.string(),
});

/** Filler words that would substring-match half the catalog. */
const STOP_WORDS = new Set([
	'the',
	'and',
	'for',
	'with',
	'need',
	'want',
	'use',
	'mcp',
	'server',
	'servers',
	'tool',
	'tools',
]);

/**
 * Free-text matcher built ON TOP of the S1 `filterCatalog`: one pass
 * with the full phrase (exact intent wins), then one pass per
 * meaningful token, deduped in encounter order.
 */
export const matchNeed = (need: string): readonly ICatalogEntry[] => {
	const seen = new Set<string>();
	const ordered: ICatalogEntry[] = [];
	const absorb = (entries: readonly ICatalogEntry[]): void => {
		for (const entry of entries) {
			if (seen.has(entry.id)) continue;
			seen.add(entry.id);
			ordered.push(entry);
		}
	};
	absorb(filterCatalog(need));
	const tokens = need
		.toLowerCase()
		.split(/[^a-z0-9-]+/)
		.filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
	for (const token of tokens) absorb(filterCatalog(token));
	return ordered;
};

/**
 * Extract the exact version from a catalog `pinExample`
 * (`pkg@1.2.3`, `pypkg==1.2.3`, `image:v1.2.3` → `1.2.3`).
 */
export const versionFromPinExample = (pinExample: string): string => {
	const trimmed = pinExample.trim();
	const eq = trimmed.lastIndexOf('==');
	let raw: string;
	if (eq > 0) {
		raw = trimmed.slice(eq + 2);
	} else {
		const at = trimmed.lastIndexOf('@');
		if (at > 0) {
			raw = trimmed.slice(at + 1);
		} else {
			const colon = trimmed.lastIndexOf(':');
			raw = colon > 0 ? trimmed.slice(colon + 1) : trimmed;
		}
	}
	return raw.replace(/^v/, '');
};

/**
 * Draft the `servers.<id>` config entry for a catalog candidate. Keeps
 * the S1 contract shape (pinned version, command+args, env NAMES only)
 * so the value passes `validate_config` as-is; `<…>` placeholders in
 * args stay for the human to fill before applying.
 */
export const draftServerEntry = (
	entry: ICatalogEntry,
): Record<string, unknown> => ({
	version: versionFromPinExample(entry.install.pinExample),
	command: entry.install.command,
	args: [...entry.install.args],
	...(entry.envVars !== undefined ? { env: [...entry.envVars] } : {}),
});

/**
 * Rank matches for suggestion: drop already-declared ids (the patch
 * only ADDS — bootstrap-wizard convention), curated tier first, stable
 * order within a tier, capped at {@link MAX_SUGGEST_CANDIDATES}.
 */
export const rankCandidates = (
	matches: readonly ICatalogEntry[],
	declaredIds: ReadonlySet<string>,
): readonly ICatalogEntry[] => {
	const undeclared = matches.filter((entry) => !declaredIds.has(entry.id));
	return [
		...undeclared.filter((entry) => entry.tier === 'curated'),
		...undeclared.filter((entry) => entry.tier !== 'curated'),
	].slice(0, MAX_SUGGEST_CANDIDATES);
};

/**
 * Build the RFC 6902 patch: when the config has no
 * `plugins.external-mcps.options.servers` block yet, the first op
 * creates it; then one `add` per candidate id.
 */
export const buildSuggestPatch = (
	hasServersBlock: boolean,
	candidates: readonly ICatalogEntry[],
): readonly IJsonPatchOp[] => {
	const ops: IJsonPatchOp[] = [];
	if (!hasServersBlock && candidates.length > 0) {
		ops.push({ op: 'add', path: SERVERS_POINTER, value: {} });
	}
	for (const candidate of candidates) {
		ops.push({
			op: 'add',
			path: `${SERVERS_POINTER}/${candidate.id}`,
			value: draftServerEntry(candidate),
		});
	}
	return ops;
};

const declaredServerIds = (
	options: Readonly<Record<string, unknown>>,
): ReadonlySet<string> => {
	const servers = options['servers'];
	if (typeof servers !== 'object' || servers === null) return new Set();
	return new Set(Object.keys(servers));
};

export const buildSuggestToolRegistration = (
	options: ISuggestToolOptions,
): IToolRegistration => ({
	id: 'suggest',
	tags: ['external-mcps', 'lazy', 'config'],
	summary:
		'Propose a config patch (RFC 6902) for external servers matching a free-text need — never writes.',
	descriptionKey: 'mcp-vertex_external-mcps_suggest',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_suggest`,
			{
				description:
					'Describe a capability gap in free text (`need`) and get up to 3 catalog candidates, each with a one-line rationale, plus an RFC 6902 JSON Patch that ADDS them to `mcp-vertex.config.json#plugins.external-mcps.options.servers` (pinned versions, env var NAMES only; already-declared ids are skipped). This tool NEVER writes: dry-run the patch with `validate_config`, apply it only on user confirm, and remember activation is still gated by the human ack flow.',
				inputSchema: InputSchema,
				outputSchema: SuggestOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const detected = options.detect
					? await options.detect()
					: new Set<string>();
				const matches = matchNeed(args.need);
				const declared = declaredServerIds(options.options);
				const candidates = rankCandidates(matches, declared);
				const patch = buildSuggestPatch(
					options.options['servers'] !== undefined,
					candidates,
				);
				return toolJson({
					ok: true,
					total: matches.length,
					candidates: candidates.map((entry) => ({
						id: entry.id,
						category: entry.category,
						rationale: `${entry.tier}: ${entry.summary}`,
						...(detected.has(entry.id) ? { detected: true } : {}),
					})),
					patch,
					note:
						candidates.length === 0
							? 'No catalog match. Broaden the need or browse via the catalog tool; live npm discovery stays behind allowDiscoverySearch.'
							: 'Proposal only — apply the patch to mcp-vertex.config.json on user confirm (dry-run via validate_config first). This tool never writes.',
				});
			},
		);
	},
});
