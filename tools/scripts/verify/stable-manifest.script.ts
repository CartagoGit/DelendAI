#!/usr/bin/env bun
/**
 * stable-manifest.script.ts — f00152 S2 (L4 — stable facade manifest verifier).
 *
 * Reads the committed `docs/mcp-vertex/api/stable.json` and checks:
 *   1. The file exists.
 *   2. It is a valid manifest (parses + matches the IStableManifest
 *      structural shape).
 *   3. Every facade descriptor is reflected in the manifest.
 *   4. No tool the manifest references is missing from the facade.
 *
 * Pure CLI wrapper — the structural check lives in the same file so
 * the verifier is the only thing that imports the file from disk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	STABLE_API_TOOLS,
	STABLE_API_TOOL_NAMES,
	STABLE_MANIFEST_REL,
	buildStableManifest,
} from '@mcp-vertex/core/public';
import { MCP_VERTEX_VERSION } from '@mcp-vertex/core/version';

import { registerStableToolContributions } from '../lib/register-stable-tool-contributions';

const REPO_ROOT = process.cwd();
const SEMVER_RE =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const isJsonSchema = (value: unknown): boolean =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const main = (): number => {
	registerStableToolContributions();
	const abs = join(REPO_ROOT, STABLE_MANIFEST_REL);
	if (!existsSync(abs)) {
		process.stderr.write(
			`stable-manifest: missing committed manifest at ${STABLE_MANIFEST_REL}. Run \`bun run build:stable-manifest\`.\n`,
		);
		return 1;
	}

	const onDisk = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
	const errors: string[] = [];

	if (
		onDisk === null ||
		typeof onDisk !== 'object' ||
		!('version' in onDisk) ||
		!('tools' in onDisk) ||
		!Array.isArray((onDisk as { tools: unknown }).tools)
	) {
		process.stderr.write(
			`stable-manifest: committed file does not match IStableManifest shape.\n`,
		);
		return 1;
	}

	const toolNames = new Set<string>(
		((onDisk as { tools: Array<{ name: string }> }).tools ?? []).map(
			(t) => t.name,
		),
	);
	const manifest = onDisk as {
		version: { packageVersion?: unknown };
		tools: Array<{
			name: string;
			sinceVersion?: unknown;
			inputSchema?: unknown;
			outputSchema?: unknown;
		}>;
	};
	if (manifest.version.packageVersion !== MCP_VERTEX_VERSION) {
		errors.push(
			`manifest packageVersion "${String(manifest.version.packageVersion)}" does not match "${MCP_VERTEX_VERSION}"`,
		);
	}
	for (const tool of manifest.tools) {
		if (
			typeof tool.sinceVersion !== 'string' ||
			!SEMVER_RE.test(tool.sinceVersion)
		) {
			errors.push(`tool "${tool.name}" has non-semver sinceVersion`);
		}
		if (!isJsonSchema(tool.inputSchema)) {
			errors.push(
				`tool "${tool.name}" has a null or invalid inputSchema`,
			);
		}
		if (!isJsonSchema(tool.outputSchema)) {
			errors.push(
				`tool "${tool.name}" has a null or invalid outputSchema`,
			);
		}
	}
	for (const name of STABLE_API_TOOL_NAMES) {
		if (!toolNames.has(name)) {
			errors.push(
				`facade tool "${name}" missing from committed manifest`,
			);
		}
	}
	for (const name of toolNames) {
		if (!STABLE_API_TOOL_NAMES.includes(name)) {
			errors.push(`manifest references non-facade tool "${name}"`);
		}
	}

	if (errors.length > 0) {
		for (const error of errors) {
			process.stderr.write(`stable-manifest: ${error}\n`);
		}
		process.stderr.write(
			`Run \`bun run build:stable-manifest\` and commit the regenerated ${STABLE_MANIFEST_REL}.\n`,
		);
		return 1;
	}

	// Cross-check that rebuilding with the same descriptors reproduces
	// the committed file byte-for-byte (catches drift in the builder).
	const fresh = buildStableManifest(STABLE_API_TOOLS, MCP_VERTEX_VERSION);
	const onDiskJson = JSON.stringify(onDisk, null, 2);
	const freshJson = JSON.stringify(fresh, null, 2);
	if (
		onDiskJson !==
		freshJson.replace(/"generatedAt": ".*?"/, '"generatedAt": "REPLACED"')
	) {
		// The fresh build always has a fresh timestamp; we can't byte-compare
		// directly. Instead we compare structurally ignoring the timestamp.
		const onDiskNoTs = JSON.parse(onDiskJson) as {
			tools: unknown;
			version: unknown;
		};
		const freshNoTs = JSON.parse(freshJson) as {
			tools: unknown;
			version: unknown;
		};
		if (
			JSON.stringify(onDiskNoTs.tools) !== JSON.stringify(freshNoTs.tools)
		) {
			process.stderr.write(
				`stable-manifest: committed tools differ from a fresh build. Run \`bun run build:stable-manifest\`.\n`,
			);
			return 1;
		}
		const onDiskVersion = (
			onDisk as {
				version: { schema: unknown; packageVersion: unknown };
			}
		).version;
		const freshVersion = freshNoTs.version as {
			schema: unknown;
			packageVersion: unknown;
		};
		if (
			JSON.stringify({
				schema: onDiskVersion.schema,
				packageVersion: onDiskVersion.packageVersion,
			}) !==
			JSON.stringify({
				schema: freshVersion.schema,
				packageVersion: freshVersion.packageVersion,
			})
		) {
			process.stderr.write(
				`stable-manifest: committed version differs from a fresh build. Run \`bun run build:stable-manifest\`.\n`,
			);
			return 1;
		}
	}

	process.stdout.write(
		`✓ stable-manifest: ${toolNames.size} facade tools verified at ${STABLE_MANIFEST_REL}\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
