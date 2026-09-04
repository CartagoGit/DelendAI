/**
 * code-map/resource.ts — d00010 (Track H of q00006).
 *
 * MCP `vertex://code-map` resource.
 *
 *   URI    : `vertex://code-map`
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
 */

import type { IResourceRegistration } from '../contracts/interfaces/tool-registration.interface';

import { buildCodeMap, type ICodeMap } from './generator';

export interface ICodeMapResourceOptions {
	/** Optional clock injection for unit tests. */
	readonly now?: () => Date;
	/** When set, the resource is cached for `ttlMs` after generation. */
	readonly ttlMs?: number;
	/** Override the URI; default `vertex://code-map`. */
	readonly uri?: string;
}

/** Build the `vertex://code-map` resource registration. */
export const buildCodeMapResourceRegistration = (
	options: ICodeMapResourceOptions = {},
): IResourceRegistration => {
	const uri = options.uri ?? 'vertex://code-map';
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
