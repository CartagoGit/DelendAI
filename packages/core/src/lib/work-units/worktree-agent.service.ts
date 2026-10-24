/**
 * worktree-agent.service.ts — an agent is known by the worktree delendai
 * made for it (x00688).
 *
 * The guard applies its rules to agents, and an agent was recognised only
 * by a variable its runtime sets in the shell (`DELENDAI_AGENT_ID`,
 * `AI_AGENT`, `CLAUDECODE`). Only Claude Code sets one by itself, so
 * every other runtime was judged as a person and skipped every rule. That
 * is why agents of different models worked in different ways.
 *
 * Every agent works in the worktree `delendai work enter` made for its
 * unit. That command writes the agent's id into the worktree's own git
 * directory, which no other worktree shares, and the guard reads it back.
 * Whatever runtime drives git there is that agent. The shared checkout is
 * never stamped: it is where a person works.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORKTREE_AGENT_FILE } from '../contracts/constants/worktree-agent.constant';

const gitPath = (dir: string, flag: string): string | undefined => {
	try {
		return execFileSync(
			'git',
			['rev-parse', '--path-format=absolute', flag],
			{
				cwd: dir,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		).trim();
	} catch {
		return undefined;
	}
};

/** A linked worktree's own git directory; undefined for the main one. */
const linkedGitDir = (dir: string): string | undefined => {
	const own = gitPath(dir, '--git-dir');
	const common = gitPath(dir, '--git-common-dir');
	return own === undefined || own === common ? undefined : own;
};

/**
 * Record `agent`, and the session of that agent (x00699), as the owner of
 * the linked worktree at `dir`. Two instances of one model share an agent
 * id; the session is what tells them apart.
 */
export const stampWorktreeAgent = (
	dir: string,
	agent: string,
	session?: string,
): boolean => {
	const gitDir = linkedGitDir(dir);
	if (gitDir === undefined) return false;
	writeFileSync(
		join(gitDir, WORKTREE_AGENT_FILE),
		`${agent}\n${session ?? ''}\n`,
	);
	return true;
};

const stampLines = (dir: string): readonly string[] => {
	const gitDir = linkedGitDir(dir);
	if (gitDir === undefined) return [];
	try {
		return readFileSync(join(gitDir, WORKTREE_AGENT_FILE), 'utf8')
			.split('\n')
			.map((line) => line.trim());
	} catch {
		return [];
	}
};

/** The agent the worktree at `dir` was made for, if delendai made it. */
export const worktreeAgent = (dir: string): string | undefined => {
	const agent = stampLines(dir)[0];
	return agent !== undefined && agent.length > 0 ? agent : undefined;
};

/** The session that holds the worktree at `dir`, if one was recorded. */
export const worktreeSession = (dir: string): string | undefined => {
	const session = stampLines(dir)[1];
	return session !== undefined && session.length > 0 ? session : undefined;
};
