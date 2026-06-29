#!/usr/bin/env bun
/**
 * pre-commit.ts — agent-claim guard.
 *
 * Runs as a Git `pre-commit` hook (installed by
 * `tools/scripts/install-claim-hooks.script.ts`). Reads
 * `.cache/mcp-vertex/agents.lock.json` and refuses to proceed if a
 * staged file is already claimed by a different committer. Advisory
 * to `bun run validate`; see AGENTS.md rule §tools TypeScript-only.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = join(process.cwd(), '.cache/mcp-vertex/agents.lock.json');

interface ILockEntry {
	readonly task_id?: string;
	readonly agent?: string;
	readonly ownership?: readonly string[];
}

interface ILockFile {
	readonly in_flight?: readonly ILockEntry[];
}

if (!existsSync(LOCK_FILE)) {
	process.exit(0);
}

let committer = process.env.GIT_AUTHOR_EMAIL;
if (!committer) {
	try {
		committer = execSync('git config user.email', {
			encoding: 'utf8',
		}).trim();
	} catch {
		// git user.email is unset; fall through to the empty-check below.
	}
}

if (!committer) {
	console.error(
		'pre-commit: blocked — no committer email found. Please configure git user.email.',
	);
	process.exit(1);
}

let stagedFilesStr = '';
try {
	stagedFilesStr = execSync('git diff --cached --name-only', {
		encoding: 'utf8',
	});
} catch {
	console.error('pre-commit: failed to run git diff.');
	process.exit(1);
}

const stagedFiles = stagedFilesStr
	.split('\n')
	.map((f) => f.trim())
	.filter(Boolean);
if (stagedFiles.length === 0) {
	process.exit(0);
}

let lockData: ILockFile;
try {
	lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as ILockFile;
} catch {
	console.error(
		'pre-commit: warning — agents.lock.json is corrupt or unreadable. Skipping checks.',
	);
	process.exit(0);
}

const inFlight = lockData.in_flight ?? [];

let blocked = false;
for (const file of stagedFiles) {
	const entry = inFlight.find((e) => e.ownership?.includes(file));
	if (entry?.agent && entry.agent !== committer) {
		console.error(
			`pre-commit: blocked — '${file}' is claimed by '${entry.agent}', but you are '${committer}'.`,
		);
		blocked = true;
	}
}

if (blocked) {
	console.error(
		'  Please ask the lock holder to release the lock, or claim it after they release.',
	);
	process.exit(1);
}

process.exit(0);
