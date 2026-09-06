/**
 * code-map/resource.ts — d00010 (Track H of q00006).
 *
 * MCP `delendai://code-map` resource.
 *
 *   URI    : `delendai://code-map` (canonical)
 *   URI    : `vertex://code-map`   (deprecated alias — b00239 rename)
 *   MIME   : `application/json`
 *   Schema : `ICodeMap` (see ./generator.ts)
 *
 * The resource is intentionally tiny: it is the single source of
 * truth that an agent reads once to learn "which plugin handles
 * what", "which package owns which surface", and "where are the
 * largest token hotspots in this repo".
 *
 * Privacy: only emits workspace-relative paths and public npm
 * names (R1.1–R1.10 hold — see the architecture gate in
 * `docs/delendai/CODE-MAP.md`).
 *
 * Surfaced via `assembleCliConfig` → `extraResources`; not auto-
 * mounted in adapter-only hosts because the map is workspace-
 * specific and the workspace is bound at CLI startup.
 *
 * b00239 rename: the URI scheme moved from `vertex://` (legacy brand)
 * to `delendai://` (matches `BRAND.md` — `delendai` is the machine
 * surface). The default is now `delendai://code-map`. Callers that
 * pass `vertex://code-map` explicitly are accepted but a deprecation
 * warning is emitted on stderr; the registration still mounts at
 * whatever URI the caller requested so existing hosts don't break.
 */

import type { IResourceRegistration } from '../contracts/interfaces/tool-registration.interface';

import { buildCodeMap, type ICodeMap } from './generator';

/** Canonical URI for the code-map resource (b00239 rename). */
export const CODE_MAP_RESOURCE_URI = 'delendai://code-map';

/**
 * Deprecated alias URIs the resource still accepts for backward
 * compatibility. New code MUST use `delendai://code-map`.
 *
 * Kept as an array (not a single constant) so a follow-up audit
 * can grow it without re-editing the resolution site.
 */
const CODE_MAP_URI_ALIASES: ReadonlySet<string> = new Set([
	'vertex://code-map', // b00239: legacy brand scheme
]);

const warnDeprecatedResourceUri = (uri: string): void => {
	process.stderr.write(
		`[delendai/code-map] resource URI '${uri}' is deprecated, use '${CODE_MAP_RESOURCE_URI}' instead. ` +
			`The alias is honored for backward compatibility and will be removed in a future release.\n`,
	);
};

export interface ICodeMapResourceOptions {
	/** Optional clock injection for unit tests. */
	readonly now?: () => Date;
	/** When set, the resource is cached for `ttlMs` after generation. */
	readonly ttlMs?: number;
	/** Override the URI; default `delendai://code-map`. */
	readonly uri?: string;
}

/** Build the `delendai://code-map` resource registration. */
export const buildCodeMapResourceRegistration = (
	options: ICodeMapResourceOptions = {},
): IResourceRegistration => {
	let uri = options.uri ?? CODE_MAP_RESOURCE_URI;
	if (uri !== CODE_MAP_RESOURCE_URI && CODE_MAP_URI_ALIASES.has(uri)) {
		warnDeprecatedResourceUri(uri);
	}
	let cache: { data: ICodeMap; expiresAt: number } | null = null;
	const ttlMs = options.ttlMs ?? 0;
	const now = options.now ?? (() => new Date());

	return {
		id: 'resource:code-map',
		register: async (server) => {
			server.registerResource(
				'vertex-code-map',
				uri,
				{
					title: 'Vertex code map',
					description:
						'Repository-wide structural map (packages, plugins, hotspots). ' +
						'Read once to orient before deep navigation.',
					mimeType: 'application/json',
				},
				async () => {
					const ts = now().getTime();
					if (cache === null || cache.expiresAt <= ts) {
						const data = await buildCodeMap(now);
						cache = {
							data,
							expiresAt:
								ttlMs > 0
									? ts + ttlMs
									: Number.POSITIVE_INFINITY,
						};
					}
					return {
						contents: [
							{
								uri,
								mimeType: 'application/json',
								text: JSON.stringify(cache.data, null, '\t'),
							},
						],
					};
				},
			);
		},
	};
};
