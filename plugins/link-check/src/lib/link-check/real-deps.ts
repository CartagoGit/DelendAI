/**
 * real-deps.ts — production I/O adapter: read markdown docs and enumerate every
 * existing repo path (files + ancestor dirs) so relative links can be resolved.
 * The only module here that touches the OS. Never throws.
 */
import { SafeWorkspaceReader } from '@delendai/core/public';

import type {
	ILinkScanDeps,
	ISourceDoc,
} from '../contracts/interfaces/link-check.interface';

/** Path fragments whose presence excludes a path from the scan. */
const EXCLUDED = [
	'/node_modules/',
	'/dist/',
	'/build/',
	'/.cache/',
	'/.git/',
	'/coverage/',
	'/.astro/',
];

const MAX_DOCS = 5000;
const MAX_DOC_BYTES = 1024 * 1024;

const isExcluded = (rel: string): boolean =>
	EXCLUDED.some((fragment) => `/${rel}`.includes(fragment));

/** Add a path plus each of its ancestor directories to the set. */
const addWithAncestors = (set: Set<string>, rel: string): void => {
	set.add(rel);
	let dir = rel;
	let slash = dir.lastIndexOf('/');
	while (slash > 0) {
		dir = dir.slice(0, slash);
		set.add(dir);
		slash = dir.lastIndexOf('/');
	}
};

/** Production link-check deps rooted at `workspaceRootAbs`, via Bun.Glob. */
export const realLinkScanDeps = (workspaceRootAbs: string): ILinkScanDeps => ({
	listDocs: async () => {
		const reader = new SafeWorkspaceReader(workspaceRootAbs);
		const out: ISourceDoc[] = [];
		const glob = new Bun.Glob('**/*.md');
		for await (const rel of glob.scan({
			cwd: workspaceRootAbs,
			onlyFiles: true,
			dot: false,
		})) {
			if (out.length >= MAX_DOCS) break;
			if (isExcluded(rel)) continue;
			try {
				const content = (await reader.readText(rel)).content;
				if (content.length <= MAX_DOC_BYTES) {
					out.push({ path: rel, content });
				}
			} catch {
				// unreadable or vanished — skip it
			}
		}
		return out;
	},
	listKnownPaths: async () => {
		const known = new Set<string>();
		const glob = new Bun.Glob('**/*');
		for await (const rel of glob.scan({
			cwd: workspaceRootAbs,
			onlyFiles: true,
			dot: true,
		})) {
			if (isExcluded(rel)) continue;
			addWithAncestors(known, rel);
		}
		return known;
	},
});
