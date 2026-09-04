/**
 * stable-manifest.ts — f00152 S2 (L4 — stable facade manifest).
 *
 * Pure builder for the deterministic, machine-readable manifest
 * published at `docs/mcp-vertex/api/stable.json`. The manifest is
 * committed and regenerated on every release (see
 * `tools/scripts/build/stable-manifest.script.ts`).
 *
 * SOLID notes:
 *   - **Pure over inputs**: `buildStableManifest` takes a list of
 *     descriptors and returns the JSON object. No I/O.
 *   - **DIP**: the manifest shape is the public contract; the
 *     schema-binder and the verifier both depend on it.
 *   - **SRP**: the verifier lives in `verify-stable-manifest.script.ts`,
 *     not here.
 */
import { z } from 'zod';
import type { IStableToolDescriptor } from './stable-facade';

/**
 * Bumped on every change to the manifest's top-level shape (new
 * required field, removed field, etc.). Decoupled from
 * `@delendai/core`'s package version because the manifest is a
 * public document; downstream consumers may pin a specific manifest
 * schema version independently.
 */
export const SCHEMA_VERSION = '1';

/** Manifest's `version` block. Carries the package version the manifest was generated against. */
export interface IStableManifestVersion {
	readonly schema: typeof SCHEMA_VERSION;
	readonly packageVersion: string;
	readonly generatedAt: string;
}

/** Per-tool block in the manifest. */
export interface IStableManifestTool {
	readonly name: string;
	readonly plugin: string;
	readonly sinceVersion: string;
	readonly semverGuarantee: IStableToolDescriptor['semverGuarantee'];
	readonly summary: string;
	/**
	 * JSON Schema for the tool's `inputSchema`, derived from the
	 * Zod schema via `z.toJSONSchema()` when available. For tool
	 * descriptors that have not yet been bound at runtime (the
	 * default state of the facade), this field is `null` and the
	 * manifest is rebuilt with bindings before release.
	 */
	readonly inputSchema: unknown;
	/** JSON Schema for the tool's `outputSchema`. Same nullability rule. */
	readonly outputSchema: unknown;
}

/** Top-level manifest shape, the public contract. */
export interface IStableManifest {
	readonly version: IStableManifestVersion;
	readonly tools: readonly IStableManifestTool[];
}

/**
 * Pure builder. Sorts tools by name for output stability so two
 * builds on the same descriptor set produce byte-identical manifests.
 */
export const buildStableManifest = (
	descriptors: readonly IStableToolDescriptor[],
	packageVersion: string,
	generatedAt: string = new Date().toISOString(),
): IStableManifest => {
	const tools = [...descriptors]
		.map((descriptor) => ({
			name: descriptor.name,
			plugin: descriptor.plugin,
			sinceVersion: descriptor.sinceVersion,
			semverGuarantee: descriptor.semverGuarantee,
			summary: descriptor.summary,
			inputSchema: schemaToJson(descriptor.inputSchema),
			outputSchema: schemaToJson(descriptor.outputSchema),
		}))
		.sort((left, right) =>
			left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
		);
	return {
		version: {
			schema: SCHEMA_VERSION,
			packageVersion,
			generatedAt,
		},
		tools,
	};
};

/**
 * Best-effort Zod → JSON Schema conversion. The Zod API exposes
 * `z.toJSONSchema()` (Zod ≥3.24). When the descriptor's schema slot
 * is unbound (the default state of the facade), this returns
 * `null` so the manifest builder never crashes — release-time
 * binding is a separate concern.
 */
const schemaToJson = (schema: unknown): unknown => {
	if (schema === undefined || schema === null) return null;
	try {
		return z.toJSONSchema(schema as z.ZodType);
	} catch {
		// Fall through to null — the manifest builder is best-effort.
	}
	return null;
};

/**
 * Single source of truth for the manifest's committed path. Both the
 * builder script and the verifier import it so the two never drift.
 */
export const STABLE_MANIFEST_REL = 'docs/mcp-vertex/api/stable.json';
