/**
 * manifest-plugin.service.ts — an MCP server with a `delendai.plugin.json`
 * beside it is a delendai plugin, written in whatever language the server
 * is. Its manifest is validated against the published schema, and what it
 * declares bounds what the server is given: a server that asks for host
 * environment variables must declare a permission that grants them.
 */
import { dirname, join, resolve } from 'node:path';

import {
	parsePluginManifest,
	RESERVED_PACKAGE_SCOPE,
} from '@delendai/core/runtime';

import type {
	IManifestPlugin,
	IManifestPluginInput,
} from '../contracts/interfaces/manifest-plugin.interface';
import {
	ENV_PERMISSIONS,
	MANIFEST_PLUGIN_FILE,
} from '../contracts/constants/manifest-plugin.constant';

/**
 * A path the server is started from (`tools/server.py`, `./bin/x`), not a
 * package spec: a scoped npm name (`@acme/weather-mcp@1.0.0`) or a URL has
 * a slash too, and read as a path it found a manifest that is not its own.
 */
const looksLikePath = (value: string): boolean =>
	/[\\/]/u.test(value) && !value.startsWith('@') && !value.includes('://');

const issuesOf = (error: unknown): string => {
	const issues = (error as { issues?: unknown }).issues;
	if (!Array.isArray(issues)) return String(error);
	return issues
		.map((issue: { path?: readonly PropertyKey[]; message?: string }) => {
			const path = (issue.path ?? []).map(String).join('.');
			return `${path.length > 0 ? path : '(root)'}: ${issue.message ?? 'invalid'}`;
		})
		.join('; ');
};

const judged = (
	path: string,
	text: string,
	env: readonly string[],
): IManifestPlugin => {
	let manifest: ReturnType<typeof parsePluginManifest>;
	try {
		manifest = parsePluginManifest(JSON.parse(text));
	} catch (error) {
		return {
			kind: 'refused',
			path,
			reason: `${path} is not a valid plugin manifest: ${
				error instanceof SyntaxError ? error.message : issuesOf(error)
			}`,
		};
	}
	// The published schema reserves delendai's scope for delendai's own
	// plugins; a manifest beside a server is somebody else's.
	if (manifest.package.startsWith(RESERVED_PACKAGE_SCOPE)) {
		return {
			kind: 'refused',
			path,
			reason: `${path} names package ${manifest.package}, in the ${RESERVED_PACKAGE_SCOPE} scope delendai keeps for its own plugins: publish it under your own name or scope`,
		};
	}
	const granted = ENV_PERMISSIONS.some((permission) =>
		manifest.permissions.includes(permission),
	);
	if (env.length > 0 && !granted) {
		return {
			kind: 'refused',
			path,
			reason: `the server asks for host env ${env.join(', ')}, but ${path} grants neither ${ENV_PERMISSIONS.join(' nor ')}`,
		};
	}
	return { kind: 'plugin', path, manifest };
};

/**
 * The manifest of the server `entry` boots: the first
 * `delendai.plugin.json` in the directory of its command or of a
 * path-like argument (`python3 tools/server.py`), resolved against the
 * workspace.
 */
export const manifestPluginOf = async (
	input: IManifestPluginInput,
): Promise<IManifestPlugin> => {
	const { entry, workspaceRoot } = input;
	for (const candidate of [entry.command, ...entry.args]) {
		if (!looksLikePath(candidate)) continue;
		const path = join(
			dirname(resolve(workspaceRoot, candidate)),
			MANIFEST_PLUGIN_FILE,
		);
		const text = await input.read(path);
		if (text === undefined) continue;
		const env = entry.env ?? [];
		return judged(path, text, Array.isArray(env) ? env : Object.keys(env));
	}
	return { kind: 'none' };
};
