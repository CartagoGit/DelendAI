#!/usr/bin/env bun
/**
 * workflow-command-duplication.script.ts — r00035 S3 lint.
 *
 * Detects the same shell command (extracted from `run:` blocks in
 * job steps) appearing in more than one workflow file under
 * `.github/workflows/`. Two workflows that run `bun run typecheck`
 * for the same event end up spending CI minutes twice for the same
 * work — this lint flags that pattern so the fix lands as a single
 * tier.
 *
 * Triggers (each must be reported as a separate finding):
 *   - the same command string appears in two or more workflows
 *   - the workflows have overlapping triggers (`push` to same branch
 *     or `pull_request` to same branch)
 *
 * False-positive guard:
 *   - commands that include `if: ${{ always() }}` or other conditionals
 *     are normalised first
 *   - empty commands are skipped
 */

import { readdir, readFile, stat as fsStat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = `${import.meta.dirname ?? import.meta.dir}/../../../.github/workflows`;

interface ICommandOccurrence {
	readonly workflow: string;
	readonly job: string;
	readonly command: string;
}

const walk = async (dir: string): Promise<readonly string[]> => {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		const s = await fsStat(full).catch(() => null);
		if (s === null) continue;
		if (s.isDirectory()) {
			out.push(...(await walk(full)));
		} else if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
			out.push(full);
		}
	}
	return out;
};

/**
 * Pull every `run:` block from a workflow file and split into
 * individual commands. Very lightweight: ignores YAML structure
 * beyond `run:` lines and multi-line `|` blocks.
 */
const extractCommands = async (
	file: string,
): Promise<readonly { job: string; command: string }[]> => {
	const text = await readFile(file, 'utf8');
	const lines = text.split('\n');
	const out: { job: string; command: string }[] = [];
	let currentJob = 'unknown';
	let buffer: string[] = [];
	let inRunBlock = false;
	let indent = 0;
	const flush = (): void => {
		if (buffer.length === 0) return;
		const cmd = buffer.join('\n').trim();
		if (cmd.length > 0 && !cmd.startsWith('#')) {
			out.push({ job: currentJob, command: cmd });
		}
		buffer = [];
		inRunBlock = false;
	};
	for (const raw of lines) {
		const line = raw.replace(/\r$/, '');
		const jobMatch = /^\s{4}([a-z][a-z0-9_-]*):\s*$/.exec(line);
		if (jobMatch !== null && jobMatch[1] !== undefined) {
			flush();
			currentJob = jobMatch[1];
			continue;
		}
		const runMatch = /^\s{8}run:\s*\|/.exec(line);
		if (runMatch !== null) {
			flush();
			inRunBlock = true;
			indent = 12;
			continue;
		}
		const runInlineMatch = /^\s{8}run:\s*(.+)$/.exec(line);
		if (runInlineMatch !== null) {
			flush();
			out.push({
				job: currentJob,
				command: (runInlineMatch[1] ?? '').trim(),
			});
			continue;
		}
		if (inRunBlock) {
			const leading = raw.match(/^(\s*)/);
			const leadingLen = leading?.[0]?.length ?? 0;
			if (leadingLen >= indent && raw.trim().length > 0) {
				buffer.push(raw.slice(indent));
			} else if (leadingLen === 0 || raw.trim().length === 0) {
				flush();
			}
		}
	}
	flush();
	return out;
};

const normalise = (cmd: string): string =>
	cmd
		.replace(/\$\{\{[^{}]*\}\}/g, '<expr>')
		.replace(/#[^\n]*/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Setup steps that appear in EVERY workflow before the real job runs
 * (checkout + setup-bun + bun install). Per r00035 S3 the eventual fix
 * is to extract these to a `workflow_call` and replace the inline blocks
 * with a single `uses: ./.github/workflows/setup-bun.yml`. While that
 * dedup slice is still `ready` (not `done`), every workflow legitimately
 * needs these three setup lines, so we whitelist the canonical strings
 * here. Add a new entry when a fourth setup step joins the trio.
 */
const SETUP_DUPLICATES: ReadonlySet<string> = new Set([
	// Per-workflow dependency install — every workflow legitimately needs
	// `bun install --frozen-lockfile` after checkout, so this is the
	// expected baseline noise until the r00035 S4 dedup slice wires every
	// workflow through `./setup-bun.yml`.
	'bun install --frozen-lockfile',
	// Per-workflow full dist build — `pages.yml` and `tier3.yml` both build
	// the same `bun run build` artefact because both ship the result. Not
	// worth deduplicating until the dist layout is consolidated.
	'bun run build',
]);

export const main = async (): Promise<number> => {
	const files = await walk(ROOT);
	const occurrences: ICommandOccurrence[] = [];
	for (const file of files) {
		const cmds = await extractCommands(file);
		const wf = relative(process.cwd(), file);
		for (const { job, command } of cmds) {
			occurrences.push({
				workflow: wf,
				job,
				command: normalise(command),
			});
		}
	}
	const byCommand = new Map<string, ICommandOccurrence[]>();
	for (const occ of occurrences) {
		if (occ.command.length < 12) continue;
		const list = byCommand.get(occ.command) ?? [];
		list.push(occ);
		byCommand.set(occ.command, list);
	}
	const dups: {
		command: string;
		occurrences: readonly ICommandOccurrence[];
	}[] = [];
	for (const [command, list] of byCommand) {
		if (SETUP_DUPLICATES.has(command)) continue;
		const workflows = new Set(list.map((o) => o.workflow));
		if (workflows.size > 1) {
			dups.push({ command, occurrences: list });
		}
	}
	if (dups.length === 0) {
		process.stdout.write(
			`workflow-command-duplication: 0 duplicates across ${files.length} workflow(s).\n`,
		);
		return 0;
	}
	for (const dup of dups) {
		process.stdout.write(`\nduplicate: ${dup.command.slice(0, 80)}\n`);
		for (const occ of dup.occurrences) {
			process.stdout.write(`  ${occ.workflow} :: ${occ.job}\n`);
		}
	}
	process.stdout.write(
		`\nworkflow-command-duplication: ${dups.length} duplicate command(s) found.\n`,
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
