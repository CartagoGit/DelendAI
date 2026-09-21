#!/usr/bin/env bun
/**
 * workflow-history-depth.script.ts — a job that needs history must ask
 * for it.
 *
 * `actions/checkout` clones one commit by default, and this repository's
 * `setup-bun-repo` passes that default through. A job that then runs
 * `git merge`, `git merge-base` or a two/three-dot `git diff` against a
 * base ref has no common ancestor in its object store, and git answers
 * `fatal: refusing to merge unrelated histories`.
 *
 * Measured: `keep-the-queue-moving` did exactly that for days. Every
 * refresh reported `0 refreshed`, every candidate was called
 * "conflicted", and the message sent a person to resolve a disagreement
 * that did not exist. Nine workflow lints existed at the time and none of
 * them looked at this.
 *
 * So the rule is stated here rather than remembered: a job whose commands
 * read history declares `fetch-depth: '0'`, or says why it does not need
 * to. The failure mode of forgetting is a job that silently accomplishes
 * nothing while reporting success.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	HISTORY_HUNGRY,
	WAIVER_MARKER,
	WORKFLOWS_DIR,
} from './workflow-history-depth.constant';
import type { IDepthFinding } from './workflow-history-depth.interface';

/** Every command in this text that cannot work on a one-commit clone. */
export const historyCommandsIn = (text: string): readonly string[] =>
	HISTORY_HUNGRY.filter((pattern) => pattern.test(text)).map(
		(pattern) => pattern.source,
	);

/**
 * Split a workflow into its jobs, as text.
 *
 * Text rather than a parsed tree, deliberately: the question is what the
 * job's `run:` blocks will execute, and those are shell, not YAML. A
 * parser would have to re-join them anyway, and would refuse files this
 * check should still be able to read.
 */
export const jobsOf = (
	source: string,
): readonly { readonly name: string; readonly body: string }[] => {
	const lines = source.split('\n');
	const start = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
	if (start === -1) return [];
	const jobs: { name: string; body: string }[] = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const header = /^ {4}([A-Za-z0-9_-]+):\s*$/u.exec(line);
		if (header?.[1] !== undefined) {
			jobs.push({ name: header[1], body: '' });
			continue;
		}
		const current = jobs.at(-1);
		if (current !== undefined) current.body += `${line}\n`;
	}
	return jobs;
};

/** Whether a job's text asks for the whole history. */
export const asksForHistory = (body: string): boolean =>
	/fetch-depth:\s*['"]?0['"]?/u.test(body);

/**
 * The repository scripts a job invokes, resolved to their sources.
 *
 * Without this the check sees only what the YAML runs directly — and the
 * failure that prompted it ran `git merge` inside `forge:refresh`, two
 * levels away from the workflow. A rule that would not have caught its
 * own motivating example is not worth adding.
 *
 * One level deep, deliberately: it answers "does this job reach a merge"
 * without becoming a call-graph analysis that nobody can predict.
 */
export const invokedSources = (
	body: string,
	readScript: (name: string) => string | undefined,
): readonly string[] => {
	const names = new Set<string>();
	for (const match of body.matchAll(/bun\s+run\s+([A-Za-z0-9:_-]+)/gu)) {
		if (match[1] !== undefined) names.add(match[1]);
	}
	for (const match of body.matchAll(
		/bun\s+(tools\/[A-Za-z0-9/._-]+\.ts)/gu,
	)) {
		if (match[1] !== undefined) names.add(match[1]);
	}
	return [...names]
		.map((name) => readScript(name))
		.filter((source): source is string => source !== undefined);
};

/** Every job that reads history without asking for it. */
export const findShallowHistoryJobs = (
	files: readonly { readonly file: string; readonly source: string }[],
	readScript: (name: string) => string | undefined = () => undefined,
): readonly IDepthFinding[] => {
	const findings: IDepthFinding[] = [];
	for (const { file, source } of files) {
		for (const job of jobsOf(source)) {
			if (job.body.includes(WAIVER_MARKER)) continue;
			if (asksForHistory(job.body)) continue;
			const direct = historyCommandsIn(job.body);
			const reached = invokedSources(job.body, readScript).flatMap(
				(each) => historyCommandsIn(each),
			);
			const commands = [...new Set([...direct, ...reached])];
			if (commands.length === 0) continue;
			findings.push({ file, job: job.name, commands });
		}
	}
	return findings;
};

const read = (dir: string) =>
	readdirSync(dir)
		.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
		.map((name) => ({
			file: `${WORKFLOWS_DIR}/${name}`,
			source: readFileSync(join(dir, name), 'utf8'),
		}));

if (import.meta.main) {
	const root = process.cwd();
	// `bun run <name>` resolves through package.json; `bun tools/...` is
	// already a path. Either way the script's own source is scanned.
	const manifest = JSON.parse(
		readFileSync(join(root, 'package.json'), 'utf8'),
	) as { readonly scripts?: Record<string, string> };
	const readScript = (name: string): string | undefined => {
		const command = manifest.scripts?.[name] ?? name;
		const path = /(tools\/[A-Za-z0-9/._-]+\.ts)/u.exec(command)?.[1];
		if (path === undefined) return undefined;
		try {
			return readFileSync(join(root, path), 'utf8');
		} catch {
			return undefined;
		}
	};
	const findings = findShallowHistoryJobs(
		read(join(root, WORKFLOWS_DIR)),
		readScript,
	);
	if (findings.length === 0) {
		console.log(
			'✓ workflow-history-depth: every job that reads history asks for it.',
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ workflow-history-depth: ${String(findings.length)} job(s) read history on a shallow checkout.`,
			'',
			...findings.flatMap((finding) => [
				`  ${finding.file} › ${finding.job}`,
				`    runs: ${finding.commands.join(', ')}`,
			]),
			'',
			'  `actions/checkout` clones ONE commit by default. A job that merges or',
			'  diffs against a base ref then has no common ancestor, and git answers',
			'  `fatal: refusing to merge unrelated histories` — which reads like a',
			'  conflict and is not one.',
			'',
			`  fix: pass \`fetch-depth: '0'\` to the checkout, or add \`${WAIVER_MARKER}\``,
			'  to the job with the reason it genuinely does not need history.',
		].join('\n'),
	);
	process.exit(1);
}
