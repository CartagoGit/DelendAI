/**
 * transition-landing.service.ts — where a transition actually left a
 * proposal's document (x00676).
 *
 * The move keeps the file's name, and the index sync that follows may
 * rename it to the canonical slug of its title (`project's` becomes
 * `project-s`). The step after — opening the review rounds — then opened
 * the name the move reported and failed with ENOENT, leaving a hand-off
 * half done: the file in `review/`, no rounds for the reviewer.
 */
import { basename, dirname, join } from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/public';

/**
 * The document's path relative to `proposalsDirAbs`: the reported one
 * when it exists, else the file in the same folder that carries the
 * proposal's id, else the reported one unchanged. Read through the
 * workspace reader, like every other plugin read.
 */
export const landedPath = async (
	proposalsDirAbs: string,
	reported: string,
	id: string,
): Promise<string> => {
	const reader = new SafeWorkspaceReader(proposalsDirAbs);
	if ((await reader.exists(reported)) !== null) return reported;
	const folder = dirname(reported);
	let names: readonly string[];
	try {
		names = (await reader.list(folder)).entries.map((entry) =>
			basename(entry.path.absolutePath),
		);
	} catch {
		return reported;
	}
	const found = names.find(
		(name) =>
			name.toLowerCase().startsWith(`${id.toLowerCase()}-`) &&
			name.endsWith('.md'),
	);
	return found === undefined ? reported : join(folder, found);
};
