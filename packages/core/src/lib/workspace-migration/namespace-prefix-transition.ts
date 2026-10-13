/**
 * namespace-prefix-transition.ts — `namespacePrefix` changed: the agents
 * delendai wrote follow it.
 *
 * The prefix names every tool (`<prefix>_overview`) and the agents `init`
 * writes (`<prefix>-orchestrator`). Changing it in the configuration left
 * the agents calling tools that no longer existed. The agents delendai
 * named are rewritten to the new prefix and renamed with it; any other
 * agent is left as it is.
 */
import { readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import type { IConfigTransition } from '../contracts/interfaces/config-transition.interface';
import {
	frontMatter,
	namedByDelendai,
} from '../scaffold/agent-grant-reconcile.service';
import { escapeRegex } from '../scaffold/wire-plugin-structure.service';
import { writeFileAtomic } from '../shared/atomic-write';

const AGENT_DIRS = [
	'.github/agents',
	'.claude/agents',
	'.codex/agents',
] as const;

/** The prefix pair when it changed from a known one, else nothing. */
const prefixChange = (
	previous: string | undefined,
	next: string | undefined,
): { readonly from: string; readonly to: string } | undefined =>
	previous === undefined || next === undefined || previous === next
		? undefined
		: { from: previous, to: next };

/** Rewrites one agent delendai named to the new prefix, and renames its file. */
const followPrefix = async (
	dir: string,
	file: string,
	from: string,
	to: string,
): Promise<void> => {
	const path = join(dir, file);
	const text = await readFile(path, 'utf8');
	if (!namedByDelendai(frontMatter(text).name, from)) return;
	const rewritten = text
		.replace(new RegExp(`\\b${escapeRegex(from)}_`, 'gu'), `${to}_`)
		.replace(
			new RegExp(`^name: ${escapeRegex(from)}(-|$)`, 'mu'),
			`name: ${to}$1`,
		);
	if (rewritten !== text) await writeFileAtomic(path, rewritten);
	if (
		file === `${from}.agent.md` ||
		file === `${from}.md` ||
		file.startsWith(`${from}-`)
	)
		await rename(path, join(dir, `${to}${file.slice(from.length)}`));
};

export const namespacePrefixTransition = (): IConfigTransition => ({
	id: 'config:namespace-prefix',
	plan: (previous, next) => {
		const change = prefixChange(
			previous.namespacePrefix,
			next.namespacePrefix,
		);
		return change === undefined
			? []
			: [
					{
						kind: 'rewrite-agents',
						detail: `namespacePrefix ${change.from} -> ${change.to}: the agents delendai wrote call and are named after the new prefix`,
					},
				];
	},
	apply: async (previous, next, ctx) => {
		const change = prefixChange(
			previous.namespacePrefix,
			next.namespacePrefix,
		);
		if (change === undefined) return;
		for (const relative of AGENT_DIRS) {
			const dir = join(ctx.workspaceRoot, relative);
			const files = await readdir(dir).catch(() => [] as string[]);
			for (const file of files.filter((name) => name.endsWith('.md')))
				await followPrefix(dir, file, change.from, change.to);
		}
	},
});
