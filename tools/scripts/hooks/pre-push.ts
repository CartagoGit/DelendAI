#!/usr/bin/env bun
/**
 * pre-push.ts — agent-claim guard.
 *
 * Reads the same `.cache/mcp-vertex/agents.lock.json` as
 * `pre-commit.ts` but inspects the full set of files touched by the
 * push (every commit's diff against the remote ref). Installed by
 * `tools/scripts/install-claim-hooks.script.ts`. AGENTS.md rule
 * §tools TypeScript-only.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILE = join(
	process.cwd(),
	'.cache/mcp-vertex/agents.lock.json',
);

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
		committer = execSync('git config user.email', { encoding: 'utf8' }).trim();
	} catch {
		// git user.email is unset; fall through to the empty-check below.
	}
}

if (!committer) {
	console.error(
		'pre-push: blocked — no committer email found. Please configure git user.email.',
	);
	process.exit(1);
}

const stdinBuffer = readFileSync(0);
const lines = stdinBuffer
	.toString()
	.split('\n')
	.map((l) => l.trim())
	.filter(Boolean);

const filesToCheck = new Set<string>();

for (const line of lines) {
	const [, localSha, , remoteSha] = line.split(/\s+/);
	if (!localSha || localSha === '0000000000000000000000000000000000000000') {
		continue;
	}

	const diffCmd = `git diff --name-only ${
		remoteSha === '0000000000000000000000000000000000000000'
			? 'origin/develop...HEAD'
			: `${remoteSha}...${localSha}`
	}`;
	try {
		const filesStr = execSync(diffCmd, { encoding: 'utf8' });
		filesStr
			.split('\n')
			.map((f) => f.trim())
			.filter(Boolean)
			.forEach((f) => {
				filesToCheck.add(f);
			});
	} catch {
		try {
			const filesStr = execSync('git diff --name-only origin/develop...HEAD', {
				encoding: 'utf8',
			});
			filesStr
				.split('\n')
				.map((f) => f.trim())
				.filter(Boolean)
				.forEach((f) => {
					filesToCheck.add(f);
				});
		} catch {
			// Both diff invocations failed; nothing to add.
		}
	}
}

if (filesToCheck.size === 0) {
	process.exit(0);
}

let lockData: ILockFile;
try {
	lockData = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as ILockFile;
} catch {
	console.error(
		'pre-push: warning — agents.lock.json is corrupt or unreadable. Skipping checks.',
	);
	process.exit(0);
}

const inFlight = lockData.in_flight ?? [];
let blocked = false;

for (const file of filesToCheck) {
	const entry = inFlight.find((e) => e.ownership?.includes(file));
	if (entry?.agent && entry.agent !== committer) {
		console.error(
			`pre-push: blocked — '${file}' is claimed by '${entry.agent}', but you are '${committer}'.`,
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
