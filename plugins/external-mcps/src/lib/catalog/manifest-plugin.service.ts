/**
 * manifest-plugin.service.ts — an MCP server with a `delendai.plugin.json`
 * beside it is a delendai plugin, written in whatever language the server
 * is. Its manifest is validated against the published schema, and what it
 * declares bounds what the server is given: a server that asks for host
 * environment variables must declare a permission that grants them.
 */
import { dirname, join, resolve } from 'node:path';

import { parsePluginManifest } from '@delendai/core/runtime';

import {
	ENV_PERMISSIONS,
	MANIFEST_PLUGIN_FILE,
} from '../contracts/constants/manifest-plugin.constant';

/** What a server's manifest made of it. */
export type IManifestPlugin =
	| { readonly kind: 'none' }
	| {
			readonly kind: 'plugin';
			readonly path: string;
			readonly manifest: ReturnType<typeof parsePluginManifest>;
	  }
	| {
			readonly kind: 'refused';
			readonly path: string;
			readonly reason: string;
	  };

export interface IManifestPluginInput {
	readonly workspaceRoot: string;
	readonly entry: {
		readonly command: string;
		readonly args: readonly string[];
		readonly env?: readonly string[] | undefined;
	};
	/** The file's text, or `undefined` when there is none. */
	readonly read: (path: string) => string | undefined;
}

const looksLikePath = (value: string): boolean => /[\\/]/u.test(value);

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
export const manifestPluginOf = (
	input: IManifestPluginInput,
): IManifestPlugin => {
	const { entry, workspaceRoot } = input;
	for (const candidate of [entry.command, ...entry.args]) {
		if (!looksLikePath(candidate)) continue;
		const path = join(
			dirname(resolve(workspaceRoot, candidate)),
			MANIFEST_PLUGIN_FILE,
		);
		const text = input.read(path);
		if (text !== undefined) return judged(path, text, entry.env ?? []);
	}
	return { kind: 'none' };
};
