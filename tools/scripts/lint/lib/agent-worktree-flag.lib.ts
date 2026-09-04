/**
 * Shared resolver for the host-scoped `agentWorktree` capability gate.
 *
 * The same precedence rule is used by every lint that needs to know
 * whether per-agent worktrees/branches are allowed in this repo:
 *
 *   `--agent-worktree` CLI flag > `delendai.config.json#agentWorktree`
 *   > `false` (default off).
 *
 * The callers pass the already-resolved CLI value (from their own
 * `--agent-worktree` flag parsing) when present; this helper only reads
 * the config file so the precedence stays in one place.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const readAgentWorktreeFlag = (cwd: string): boolean => {
	const candidates = [
		join(cwd, 'delendai.config.json'),
		join(cwd, '.delendai.config.json'),
	];
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const raw = JSON.parse(readFileSync(path, 'utf8')) as {
				agentWorktree?: unknown;
			};
			return raw.agentWorktree === true;
		} catch {
			// ignore parse errors — treat as default false
		}
	}
	return false;
};
