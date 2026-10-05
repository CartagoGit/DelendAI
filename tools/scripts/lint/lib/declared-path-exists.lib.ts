/**
 * declared-path-exists.lib.ts — whether a path a proposal declares is
 * on disk, where a proposal document counts wherever it lives now.
 *
 * A proposal cites another by its path, and that path names the folder
 * of its status at the time. Every transition moves the file, so each
 * closed proposal that cited it started failing the existence lints the
 * day the other one moved on, with nothing wrong in either: one id is one
 * document, whichever folder its status puts it in.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const PROPOSALS_ROOT = 'docs/delendai/proposals';

const documentsUnder = (directory: string): readonly string[] => {
	const found: string[] = [];
	const walk = (path: string): void => {
		let entries;
		try {
			entries = readdirSync(path, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) walk(join(path, entry.name));
			else if (entry.name.endsWith('.md')) found.push(entry.name);
		}
	};
	walk(directory);
	return found;
};

const cache = new Map<string, ReadonlySet<string>>();

/** Whether `path`, relative to `root`, exists, or names a proposal that does. */
export const declaredPathExists = (root: string, path: string): boolean => {
	if (existsSync(join(root, path))) return true;
	if (!path.startsWith(`${PROPOSALS_ROOT}/`) || !path.endsWith('.md'))
		return false;
	let names = cache.get(root);
	if (names === undefined) {
		names = new Set(documentsUnder(join(root, PROPOSALS_ROOT)));
		cache.set(root, names);
	}
	return names.has(basename(path));
};
