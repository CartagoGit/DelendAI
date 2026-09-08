#!/usr/bin/env bun
/**
 * workflow-yaml.script.ts — i00004 S1.
 *
 * No GitHub Actions workflow may be syntactically broken without a
 * check saying so.
 *
 * Audit 2026-09-08 found `.github/workflows/quality-gate.yml`
 * syntactically invalid: inside the `Run integrated quality gate`
 * step the `env` and `run` keys were indented to 28 spaces instead of
 * 14, so any YAML loader failed on line 49. It was the ONLY invalid
 * workflow of the repository's set — and it was precisely the one
 * that claims to be the integrated quality gate. A validation
 * workflow could be broken and no other check would ever say it.
 * The file is fixed; this script is the guardrail so it cannot
 * silently regress.
 *
 * What it does:
 *   1. Walks `.github/workflows/*.yml` and `*.yaml`.
 *   2. Parses each with the `yaml` package (a real YAML 1.2 parser,
 *      already a root devDependency — no new install), reporting
 *      file + line + column for every parse error.
 *   3. Checks the minimal expected shape: top-level `name`, `on` and
 *      `jobs` exist, and every job carries `runs-on` and `steps`.
 *      Shape findings also carry a line/column, resolved from the
 *      offending node's own source offset via the parser's
 *      `LineCounter`, so the message points at the real line rather
 *      than at the top of the file.
 *
 * Architecture (SOLID / testability):
 *   - `checkWorkflowSource(file)` — pure: raw text in, findings out.
 *   - `lintWorkflowYaml(files)` — pure over a list of sources.
 *   - `readWorkflowFiles(dir)` — the only I/O, injectable, so the
 *     spec never touches the real `.github/` tree.
 *   - `formatReport(...)` — pure formatter.
 *   - `main()` — CLI shell.
 *
 * Exit codes:
 *   0 — every workflow parses and has the expected shape.
 *   1 — at least one workflow is invalid; see the report.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';

import { repoRoot } from '../lib/monorepo-paths';

export const WORKFLOWS_DIR = '.github/workflows';

/** One workflow source, addressed by a repo-relative path. */
export interface IWorkflowSource {
	readonly relPath: string;
	readonly raw: string;
}

/** A single problem, always positioned at a line and column (1-based). */
export interface IWorkflowYamlFinding {
	readonly relPath: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
	readonly kind: 'syntax' | 'shape';
}

export interface IWorkflowYamlResult {
	readonly checked: readonly string[];
	readonly findings: readonly IWorkflowYamlFinding[];
	readonly ok: boolean;
}

/** Reads workflow sources from a directory. Injectable for tests. */
export type IWorkflowSourceReader = (
	workflowsDir: string,
) => readonly IWorkflowSource[];

const isWorkflowFileName = (name: string): boolean =>
	name.endsWith('.yml') || name.endsWith('.yaml');

/** Default reader: the real `.github/workflows` tree (non-recursive). */
export const readWorkflowFiles: IWorkflowSourceReader = (workflowsDir) => {
	const entries = readdirSync(workflowsDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && isWorkflowFileName(entry.name))
		.map((entry) => entry.name)
		.sort()
		.map((name) => ({
			relPath: `${WORKFLOWS_DIR}/${name}`,
			raw: readFileSync(join(workflowsDir, name), 'utf8'),
		}));
};

/**
 * Resolve a source offset to a 1-based line/column, falling back to
 * the top of the file when the node carries no range (synthetic or
 * merged nodes).
 */
const positionOf = (
	counter: LineCounter,
	offset: number | undefined,
): { readonly line: number; readonly column: number } => {
	if (offset === undefined || offset < 0) return { line: 1, column: 1 };
	const pos = counter.linePos(offset);
	return { line: pos.line, column: pos.col };
};

const REQUIRED_TOP_LEVEL = ['name', 'on', 'jobs'] as const;
const REQUIRED_JOB_KEYS = ['runs-on', 'steps'] as const;

/**
 * Parse one workflow and report every syntax error plus every
 * minimal-shape violation. Pure: no I/O.
 */
export const checkWorkflowSource = (
	file: IWorkflowSource,
): readonly IWorkflowYamlFinding[] => {
	const counter = new LineCounter();
	const doc = parseDocument(file.raw, { lineCounter: counter });

	if (doc.errors.length > 0) {
		return doc.errors.map((error) => {
			const start = error.linePos?.[0];
			return {
				relPath: file.relPath,
				line: start?.line ?? positionOf(counter, error.pos[0]).line,
				column: start?.col ?? positionOf(counter, error.pos[0]).column,
				message: `invalid YAML: ${error.message.split('\n')[0]}`,
				kind: 'syntax' as const,
			};
		});
	}

	const findings: IWorkflowYamlFinding[] = [];
	const root = doc.contents;
	if (!isMap(root)) {
		return [
			{
				relPath: file.relPath,
				line: 1,
				column: 1,
				message:
					'invalid workflow: the document root must be a mapping',
				kind: 'shape',
			},
		];
	}

	for (const key of REQUIRED_TOP_LEVEL) {
		if (!root.has(key)) {
			findings.push({
				relPath: file.relPath,
				line: 1,
				column: 1,
				message: `missing top-level \`${key}\``,
				kind: 'shape',
			});
		}
	}

	const jobs = root.get('jobs', true);
	if (root.has('jobs') && !isMap(jobs)) {
		findings.push({
			relPath: file.relPath,
			...positionOf(counter, jobs?.range?.[0]),
			message: '`jobs` must be a mapping of job id to job',
			kind: 'shape',
		});
		return findings;
	}
	if (!isMap(jobs)) return findings;

	if (jobs.items.length === 0) {
		findings.push({
			relPath: file.relPath,
			...positionOf(counter, jobs.range?.[0]),
			message: '`jobs` declares no job',
			kind: 'shape',
		});
	}

	for (const pair of jobs.items) {
		const jobId =
			typeof pair.key === 'object' &&
			pair.key !== null &&
			'value' in pair.key
				? String((pair.key as { value: unknown }).value)
				: String(pair.key);
		const keyOffset = (
			pair.key as { range?: readonly [number, number, number] } | null
		)?.range?.[0];
		const at = positionOf(counter, keyOffset);
		const job = pair.value;
		if (!isMap(job)) {
			findings.push({
				relPath: file.relPath,
				...at,
				message: `job \`${jobId}\` must be a mapping`,
				kind: 'shape',
			});
			continue;
		}
		for (const required of REQUIRED_JOB_KEYS) {
			if (!job.has(required)) {
				findings.push({
					relPath: file.relPath,
					...at,
					message: `job \`${jobId}\` is missing \`${required}\``,
					kind: 'shape',
				});
			}
		}
		const steps = job.get('steps', true);
		if (job.has('steps') && !isSeq(steps)) {
			findings.push({
				relPath: file.relPath,
				...positionOf(counter, steps?.range?.[0] ?? keyOffset),
				message: `job \`${jobId}\`: \`steps\` must be a sequence`,
				kind: 'shape',
			});
		}
	}

	return findings;
};

/** Pure engine over already-read sources. */
export const lintWorkflowYaml = (
	files: readonly IWorkflowSource[],
): IWorkflowYamlResult => {
	const findings = files.flatMap((file) => checkWorkflowSource(file));
	return {
		checked: files.map((file) => file.relPath),
		findings,
		ok: findings.length === 0,
	};
};

export const formatReport = (result: IWorkflowYamlResult): string => {
	if (result.ok) {
		return `✓ workflow-yaml: ${result.checked.length} workflow file(s) parse and have the expected shape.`;
	}
	return [
		`✖ workflow-yaml: ${result.findings.length} problem(s) in ${result.checked.length} workflow file(s):`,
		...result.findings.map(
			(finding) =>
				`  ${finding.relPath}:${finding.line}:${finding.column} — ${finding.message}`,
		),
		'  fix: repair the YAML above. Every workflow must parse and declare',
		'       `name`, `on`, `jobs`, and every job `runs-on` + `steps`.',
	].join('\n');
};

/** CLI shell. Returns the process exit code. */
export const main = (
	rootDir: string = repoRoot(),
	read: IWorkflowSourceReader = readWorkflowFiles,
): number => {
	const result = lintWorkflowYaml(read(join(rootDir, WORKFLOWS_DIR)));
	process.stdout.write(`${formatReport(result)}\n`);
	return result.ok ? 0 : 1;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) process.exit(main());
