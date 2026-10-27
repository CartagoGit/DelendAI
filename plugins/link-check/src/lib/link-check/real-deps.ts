/**
 * real-deps.ts — production I/O adapter: read markdown docs and enumerate every
 * existing repo path (files + ancestor dirs) so relative links can be resolved.
 * The only module here that touches the OS. Never throws.
 */
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import {
	LINK_CHECK_DOC_GLOB,
	LINK_CHECK_MAX_DOC_BYTES,
	LINK_CHECK_MAX_DOCS,
} from '../contracts/constants/link-check.constant';
import type {
	IDocScan,
	ILinkScanDeps,
	ISkippedDoc,
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
	listDocs: async (): Promise<IDocScan> => {
		const reader = new SafeWorkspaceReader(workspaceRootAbs);
		const docs: ISourceDoc[] = [];
		const skipped: ISkippedDoc[] = [];
		let capped = false;
		const glob = new Bun.Glob(LINK_CHECK_DOC_GLOB);
		for await (const rel of glob.scan({
			cwd: workspaceRootAbs,
			onlyFiles: true,
			dot: false,
		})) {
			if (isExcluded(rel)) continue;
			if (docs.length >= LINK_CHECK_MAX_DOCS) {
				capped = true;
				break;
			}
			try {
				const content = (await reader.readText(rel)).content;
				if (content.length <= LINK_CHECK_MAX_DOC_BYTES) {
					docs.push({ path: rel, content });
				} else {
					skipped.push({ path: rel, reason: 'too-large' });
				}
			} catch {
				skipped.push({ path: rel, reason: 'unreadable' });
			}
		}
		return { docs, skipped, capped };
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
