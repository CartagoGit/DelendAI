#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const LOCK_FILE = path.join(process.cwd(), '.cache/mcp-vertex/agents.lock.json');

if (!fs.existsSync(LOCK_FILE)) {
	process.exit(0);
}

let committer = process.env.GIT_AUTHOR_EMAIL;
if (!committer) {
	try {
		committer = execSync('git config user.email', { encoding: 'utf8' }).trim();
	} catch (e) {
		// Ignore
	}
}

if (!committer) {
	console.error('pre-commit: blocked — no committer email found. Please configure git user.email.');
	process.exit(1);
}

let stagedFilesStr = '';
try {
	stagedFilesStr = execSync('git diff --cached --name-only', { encoding: 'utf8' });
} catch (e) {
	console.error('pre-commit: failed to run git diff.');
	process.exit(1);
}

const stagedFiles = stagedFilesStr.split('\n').map(f => f.trim()).filter(Boolean);
if (stagedFiles.length === 0) {
	process.exit(0);
}

let lockData;
try {
	lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
} catch (e) {
	console.error('pre-commit: warning — agents.lock.json is corrupt or unreadable. Skipping checks.');
	process.exit(0);
}

const inFlight = lockData.in_flight || [];

let blocked = false;
for (const file of stagedFiles) {
	const entry = inFlight.find(e => e.ownership && e.ownership.includes(file));
	if (entry && entry.agent && entry.agent !== committer) {
		console.error(`pre-commit: blocked — '${file}' is claimed by '${entry.agent}', but you are '${committer}'.`);
		blocked = true;
	}
}

if (blocked) {
	console.error('  Please ask the lock holder to release the lock, or claim it after they release.');
	process.exit(1);
}

process.exit(0);
