/**
 * style-workspace.service.ts — a project's styles, read from where its
 * profile says they are.
 *
 * Every read goes through the safe reader: inside the workspace, where
 * the file really is, never a reserved path. A root the project declared
 * and that is not there contributes nothing rather than failing the call.
 */
import { SafeWorkspaceReader } from '@delendai/core/public';

import { designTokensOf } from '../check/style-check.service';
import {
	MARKUP_EXTENSIONS,
	STYLESHEET_EXTENSIONS,
	UTILITY_FRAMEWORK_PACKAGE,
} from '../contracts/constants/style-profile.constant';
import type {
	IStyleProfile,
	IStyleSource,
} from '../contracts/interfaces/selector-graph.interface';
import type { IStyleWorkspace } from '../contracts/interfaces/style-workspace.interface';
import { buildSelectorGraph } from '../graph/selector-graph.service';
import { majorOf } from './style-profile.service';

/** How deep under a declared root files are looked for. */
const MAX_DEPTH = 12;

const readOrNothing = async (
	reader: SafeWorkspaceReader,
	path: string,
): Promise<string | undefined> => {
	try {
		return (await reader.readText(path)).content;
	} catch {
		return undefined;
	}
};

/** Every file under `roots` with one of `extensions`, as sources. */
const sourcesUnder = async (
	reader: SafeWorkspaceReader,
	roots: readonly string[],
	extensions: readonly string[],
): Promise<readonly IStyleSource[]> => {
	const sources: IStyleSource[] = [];
	for (const root of roots) {
		let paths: readonly string[];
		try {
			const listed = await reader.list(root, {
				recursive: true,
				maxDepth: MAX_DEPTH,
			});
			paths = listed.entries
				.filter((entry) => entry.stats.isFile())
				.map((entry) => entry.path.relativePath);
		} catch {
			continue;
		}
		for (const path of [...paths].sort()) {
			if (!extensions.some((extension) => path.endsWith(extension)))
				continue;
			const text = await readOrNothing(reader, path);
			if (text !== undefined) sources.push({ path, text });
		}
	}
	return sources;
};

/** The installed major of the utility framework, from the project's own manifest. */
const utilityMajorOf = async (
	reader: SafeWorkspaceReader,
): Promise<number | undefined> => {
	const manifest = await readOrNothing(reader, 'package.json');
	if (manifest === undefined) return undefined;
	try {
		const parsed = JSON.parse(manifest) as {
			readonly dependencies?: Readonly<Record<string, string>>;
			readonly devDependencies?: Readonly<Record<string, string>>;
		};
		return majorOf(
			parsed.dependencies?.[UTILITY_FRAMEWORK_PACKAGE] ??
				parsed.devDependencies?.[UTILITY_FRAMEWORK_PACKAGE],
		);
	} catch {
		return undefined;
	}
};

export const openStyleWorkspace = async (
	workspaceRoot: string,
	profile: IStyleProfile,
): Promise<IStyleWorkspace> => {
	const reader = new SafeWorkspaceReader(workspaceRoot);
	const stylesheets = await sourcesUnder(
		reader,
		profile.styleRoots,
		STYLESHEET_EXTENSIONS,
	);
	const markup = await sourcesUnder(
		reader,
		profile.markupRoots,
		MARKUP_EXTENSIONS,
	);
	const tokens = [];
	for (const file of profile.tokenFiles) {
		const text = await readOrNothing(reader, file);
		if (text !== undefined)
			tokens.push(...designTokensOf({ path: file, text }));
	}
	return {
		profile,
		graph: buildSelectorGraph({ stylesheets, markup }),
		tokens,
		utilityMajor: await utilityMajorOf(reader),
		read: (path) => readOrNothing(reader, path),
	};
};
