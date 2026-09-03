#!/usr/bin/env bun
/**
 * generated-determinism.script.ts — q00016 S3.
 *
 * Run every generator twice and require the artifacts to come out
 * byte-identical.
 *
 * A generator whose output depends on anything but the repository —
 * directory iteration order, a wall clock, a locale's collation — can
 * never pass its own drift check. `agent-md` did exactly that: it
 * walked `readdir()` unsorted and cut at four, so the filesystem chose
 * which four tests each AGENT.md advertised. 42 files drifted per run,
 * `drift` went red on every push, and the outage read as a broken build
 * for days.
 *
 * Why this compares two RUNS instead of comparing against git, which is
 * what `gen-all --check` does: `git diff` cannot tell a non-deterministic
 * generator apart from an artifact somebody simply has not committed
 * yet. In a swarm the working tree is essentially never clean, so that
 * check answers a different question than the one being asked here. Two
 * runs against the same tree isolate the generator itself, and this gate
 * is therefore usable while other agents are mid-edit — the exact
 * condition under which the bug was introduced.
 *
 * Exit codes: 0 — every artifact is stable. 1 — at least one differs
 * between runs. 2 — a generator failed to run at all.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { STEPS } from '../gen-all.script';
import { repoRoot } from '../lib/monorepo-paths';

const exec = promisify(execFile);

export interface IUnstableArtifact {
	readonly path: string;
	readonly firstDigest: string;
	readonly secondDigest: string;
}

/** Which files the generators are allowed to touch. */
const ARTIFACT_GLOBS = [
	'docs/mcp-vertex/agent-catalog.generated.json',
	'docs/mcp-vertex/security/capability-matrix.md',
	'docs/mcp-vertex/TOKEN-BUDGETS.md',
	'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
] as const;

const digestOf = async (abs: string): Promise<string> => {
	try {
		return createHash('sha256')
			.update(await readFile(abs))
			.digest('hex');
	} catch {
		// A generator that produced nothing this run is itself a
		// difference worth reporting, so absence gets its own marker
		// rather than being skipped.
		return 'absent';
	}
};

const listArtifacts = async (root: string): Promise<readonly string[]> => {
	const { stdout } = await exec(
		'git',
		['ls-files', '--', '*/AGENT.md', 'AGENT.md', ...ARTIFACT_GLOBS],
		{ cwd: root, maxBuffer: 16 * 1024 * 1024 },
	).catch(() => ({ stdout: '' }));
	return stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

export const snapshotArtifacts = async (
	root: string,
	paths: readonly string[],
): Promise<ReadonlyMap<string, string>> => {
	const out = new Map<string, string>();
	for (const path of paths) {
		out.set(path, await digestOf(`${root}/${path}`));
	}
	return out;
};

export const diffSnapshots = (
	first: ReadonlyMap<string, string>,
	second: ReadonlyMap<string, string>,
): readonly IUnstableArtifact[] => {
	const out: IUnstableArtifact[] = [];
	for (const [path, firstDigest] of first) {
		const secondDigest = second.get(path) ?? 'absent';
		if (firstDigest !== secondDigest) {
			out.push({ path, firstDigest, secondDigest });
		}
	}
	return out;
};

const runGenerators = async (root: string): Promise<void> => {
	for (const step of STEPS) {
		const [bin, ...args] = step.cmd;
		if (bin === undefined) continue;
		await exec(bin, args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
	}
};

export const main = async (): Promise<number> => {
	const root = repoRoot();
	try {
		await runGenerators(root);
	} catch (error) {
		console.error(
			`✖ generated-determinism: a generator failed to run — ${String(error)}`,
		);
		return 2;
	}
	const paths = await listArtifacts(root);
	const first = await snapshotArtifacts(root, paths);

	try {
		await runGenerators(root);
	} catch (error) {
		console.error(
			`✖ generated-determinism: a generator failed on the second run — ${String(error)}`,
		);
		return 2;
	}
	const second = await snapshotArtifacts(root, paths);

	const unstable = diffSnapshots(first, second);
	if (unstable.length === 0) {
		console.log(
			`✓ generated-determinism: ${String(paths.length)} artifact(s) identical across two runs.`,
		);
		return 0;
	}

	console.error(
		`✖ generated-determinism: ${String(unstable.length)} artifact(s) changed between two runs of the same generators:`,
	);
	for (const artifact of unstable) {
		console.error(
			`  ${artifact.path}  ${artifact.firstDigest.slice(0, 12)} → ${artifact.secondDigest.slice(0, 12)}`,
		);
	}
	console.error('');
	console.error(
		'  Nothing changed in the repository between those runs, so the difference',
	);
	console.error(
		'  comes from the generator: unordered directory iteration, a wall clock, or',
	);
	console.error(
		'  locale-dependent sorting. Collect everything, sort it, THEN cut — a',
	);
	console.error(
		'  generator that disagrees with itself can never pass its own drift check.',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
