/**
 * Durable, machine-readable journal of vitest runs.
 *
 * THE PROBLEM this closes: `bun run test` prints its failures once, to a
 * terminal that scrolls (and that an agent harness truncates). To learn
 * what actually broke, the next step was to run the whole suite AGAIN —
 * six minutes and a machine-wide compute lock for information the first
 * run already had in memory.
 *
 * So the run itself writes what it knows to
 * `.cache/mcp-vertex/results/logs/test-runs.jsonl` — the established home
 * for accumulated results, alongside `validate.jsonl`, and written with
 * the same conventions: JSONL, append, atomic, bounded.
 *
 * This module is the pure/IO core. `journal-reporter.ts` is the vitest
 * reporter that feeds it; `read-test-journal.script.ts` is the reader.
 *
 * Nothing here may ever throw into the test run — see `safeAppendRun`.
 */
import { createHash } from 'node:crypto';
import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

/**
 * Kept in the same directory as `validate.jsonl`
 * (`VALIDATE_JOURNAL_RELATIVE_PATH` in
 * `tools/scripts/proposals/record-validate-evidence.script.ts`). That
 * directory is `results/`, not `cache/`: it accumulates outcomes that are
 * not derivable by re-deriving anything cheap.
 */
export const TEST_JOURNAL_RELATIVE_PATH = join(
	'.cache',
	'mcp-vertex',
	'results',
	'logs',
	'test-runs.jsonl',
);

/** Bounds. A journal that grows without limit is a second problem. */
export const JOURNAL_BOUNDS = {
	/** Runs retained. The reader only ever needs the last one; the rest
	 * are for "did this start failing today or last week?". */
	maxRuns: 50,
	/** Hard byte ceiling, applied after `maxRuns`. */
	maxBytes: 4 * 1024 * 1024,
	/** Failures recorded per run. A run with 400 failures is one bug. */
	maxFailuresPerRun: 60,
	/** Per-field character caps, so one enormous object diff cannot
	 * dominate the file. */
	maxMessageChars: 4000,
	maxDiffChars: 4000,
	maxValueChars: 2000,
	maxStackChars: 4000,
} as const;

export interface ISourceFrame {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly method?: string | undefined;
}

export interface ITestFailureRecord {
	/** Repo-relative path of the test file. */
	readonly file: string;
	/** Vitest project name (`link-check`, `core`, …), when there is one. */
	readonly project?: string;
	/** Leaf test name. */
	readonly name: string;
	/** Full name including parent suites, `>`-separated. */
	readonly fullName: string;
	readonly errorName?: string;
	readonly message: string;
	readonly expected?: string;
	readonly actual?: string;
	readonly diff?: string;
	/**
	 * The first stack frame inside the repo and outside `node_modules` —
	 * i.e. the line an agent should open. Vitest internals are dropped.
	 */
	readonly sourceFrame?: ISourceFrame;
	/** Remaining repo frames, for when the top one is a helper. */
	readonly stack?: readonly ISourceFrame[];
	readonly durationMs?: number;
	/** `test` for an assertion failure, `module` for a collection/import
	 * failure (the whole file never ran), `unhandled` for run-level. */
	readonly kind: 'test' | 'module' | 'unhandled';
}

export interface ITestRunEntry {
	readonly schema: 1;
	readonly runId: string;
	readonly timestamp: string;
	readonly result: 'pass' | 'fail';
	readonly reason: string;
	readonly command: string;
	readonly cwd: string;
	readonly durationMs: number;
	readonly gitHead?: string;
	readonly gitBranch?: string;
	readonly totals: {
		readonly files: number;
		readonly tests: number;
		readonly passed: number;
		readonly failed: number;
		readonly skipped: number;
	};
	readonly failures: readonly ITestFailureRecord[];
	/** Set when `failures` was capped by `maxFailuresPerRun`. */
	readonly failuresOmitted?: number;
}

/* ------------------------------------------------------------------ */
/* pure helpers                                                        */
/* ------------------------------------------------------------------ */

export const truncate = (
	value: string | undefined,
	max: number,
): string | undefined => {
	if (value === undefined) return undefined;
	if (value.length <= max) return value;
	return `${value.slice(0, max)}\n… [truncated ${value.length - max} chars]`;
};

export const toRepoRelative = (
	filePath: string,
	workspaceRoot: string,
): string => {
	if (!isAbsolute(filePath)) return filePath.split(sep).join('/');
	const rel = relative(workspaceRoot, filePath);
	if (rel === '' || rel.startsWith('..'))
		return filePath.split(sep).join('/');
	return rel.split(sep).join('/');
};

const NOISE_FRAGMENTS = [
	'/node_modules/',
	'\\node_modules\\',
	'node:internal',
	'/vitest/dist/',
	'/@vitest/',
];

const isNoiseFrame = (file: string): boolean =>
	file === '' || NOISE_FRAGMENTS.some((fragment) => file.includes(fragment));

/** Parse `at fn (/abs/path.ts:12:3)` / `at /abs/path.ts:12:3` lines. */
export const parseStackText = (stack: string): ISourceFrame[] => {
	const frames: ISourceFrame[] = [];
	for (const rawLine of stack.split('\n')) {
		const line = rawLine.trim();
		if (!line.startsWith('at ')) continue;
		const match =
			/^at\s+(?:(.*?)\s+\()?(?:file:\/\/)?(\/[^\s()]+?|[A-Za-z]:[^\s()]+?):(\d+):(\d+)\)?$/.exec(
				line,
			);
		if (match === null) continue;
		frames.push({
			method: match[1] ?? undefined,
			file: match[2] ?? '',
			line: Number(match[3]),
			column: Number(match[4]),
		});
	}
	return frames;
};

/**
 * Choose the stack frames worth keeping: inside the workspace, outside
 * `node_modules` and outside vitest itself. The test file's own frames
 * sort first — that is nearly always the line the agent must open.
 */
export const selectSourceFrames = (input: {
	readonly stacks?: readonly ISourceFrame[] | undefined;
	readonly stackText?: string | undefined;
	readonly workspaceRoot: string;
	readonly testFile?: string | undefined;
}): ISourceFrame[] => {
	const raw =
		input.stacks !== undefined && input.stacks.length > 0
			? [...input.stacks]
			: parseStackText(input.stackText ?? '');
	const inRepo = raw.filter(
		(frame) =>
			!isNoiseFrame(frame.file) &&
			(isAbsolute(frame.file)
				? frame.file.startsWith(input.workspaceRoot)
				: true),
	);
	const normalized = inRepo.map((frame) => ({
		...frame,
		file: toRepoRelative(frame.file, input.workspaceRoot),
	}));
	const testRelative =
		input.testFile === undefined
			? undefined
			: toRepoRelative(input.testFile, input.workspaceRoot);
	if (testRelative === undefined) return normalized.slice(0, 6);
	const own = normalized.filter((frame) => frame.file === testRelative);
	const rest = normalized.filter((frame) => frame.file !== testRelative);
	return [...own, ...rest].slice(0, 6);
};

const stringifyValue = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

export interface IRawTestError {
	readonly name?: string | undefined;
	readonly message?: string | undefined;
	readonly stack?: string | undefined;
	readonly stacks?: readonly ISourceFrame[] | undefined;
	readonly diff?: string | undefined;
	readonly expected?: unknown;
	readonly actual?: unknown;
}

export const buildFailureRecord = (input: {
	readonly error: IRawTestError;
	readonly file: string;
	readonly workspaceRoot: string;
	readonly name: string;
	readonly fullName: string;
	readonly project?: string | undefined;
	readonly durationMs?: number | undefined;
	readonly kind: ITestFailureRecord['kind'];
}): ITestFailureRecord => {
	const frames = selectSourceFrames({
		stacks: input.error.stacks,
		stackText: truncate(input.error.stack, JOURNAL_BOUNDS.maxStackChars),
		workspaceRoot: input.workspaceRoot,
		testFile: input.file,
	});
	const expected = truncate(
		stringifyValue(input.error.expected),
		JOURNAL_BOUNDS.maxValueChars,
	);
	const actual = truncate(
		stringifyValue(input.error.actual),
		JOURNAL_BOUNDS.maxValueChars,
	);
	const diff = truncate(input.error.diff, JOURNAL_BOUNDS.maxDiffChars);
	return {
		file: toRepoRelative(input.file, input.workspaceRoot),
		...(input.project !== undefined ? { project: input.project } : {}),
		name: input.name,
		fullName: input.fullName,
		...(input.error.name !== undefined
			? { errorName: input.error.name }
			: {}),
		message:
			truncate(input.error.message, JOURNAL_BOUNDS.maxMessageChars) ??
			'(no message)',
		...(expected !== undefined ? { expected } : {}),
		...(actual !== undefined ? { actual } : {}),
		...(diff !== undefined ? { diff } : {}),
		...(frames[0] !== undefined ? { sourceFrame: frames[0] } : {}),
		...(frames.length > 1 ? { stack: frames.slice(1) } : {}),
		...(input.durationMs !== undefined
			? { durationMs: input.durationMs }
			: {}),
		kind: input.kind,
	};
};

/**
 * Keep the tail of the journal within both bounds. Oldest runs go first;
 * the last line is always the most recent run.
 */
export const boundJournalLines = (
	lines: readonly string[],
	bounds: {
		readonly maxRuns: number;
		readonly maxBytes: number;
	} = JOURNAL_BOUNDS,
): string[] => {
	let kept = lines
		.filter((line) => line.trim() !== '')
		.slice(-bounds.maxRuns);
	while (
		kept.length > 1 &&
		Buffer.byteLength(`${kept.join('\n')}\n`, 'utf8') > bounds.maxBytes
	) {
		kept = kept.slice(1);
	}
	return kept;
};

export const makeRunId = (timestamp: string, command: string): string =>
	`${timestamp.replace(/[-:.TZ]/g, '').slice(0, 14)}-${createHash('sha1')
		.update(`${timestamp}${command}${process.pid}`)
		.digest('hex')
		.slice(0, 8)}`;

/* ------------------------------------------------------------------ */
/* IO                                                                  */
/* ------------------------------------------------------------------ */

const writeFileAtomicSync = (path: string, contents: string): void => {
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	const fd = openSync(tmp, 'w');
	try {
		writeSync(fd, contents);
	} finally {
		closeSync(fd);
	}
	renameSync(tmp, path);
};

const LOCK_STALE_MS = 15_000;

/**
 * Best-effort exclusive lock via `mkdir`. Two concurrent vitest runs are
 * already serialised by the repo compute lock, so contention here is a
 * corner case — but a read-modify-write without one can truncate the
 * other run's line, and a silently corrupted journal is worse than none.
 */
const withDirLock = <T>(path: string, work: () => T): T => {
	const lockPath = `${path}.lock`;
	const deadline = Date.now() + LOCK_STALE_MS;
	let held = false;
	while (Date.now() < deadline) {
		try {
			mkdirSync(lockPath);
			held = true;
			break;
		} catch {
			try {
				const age = Date.now() - statSync(lockPath).mtimeMs;
				if (age > LOCK_STALE_MS)
					rmSync(lockPath, { recursive: true, force: true });
			} catch {
				/* the lock vanished under us; retry */
			}
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
		}
	}
	try {
		return work();
	} finally {
		if (held) {
			try {
				rmSync(lockPath, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	}
};

export const journalPath = (workspaceRoot: string): string =>
	join(workspaceRoot, TEST_JOURNAL_RELATIVE_PATH);

export const appendRunEntry = (input: {
	readonly workspaceRoot: string;
	readonly entry: ITestRunEntry;
}): string => {
	const path = journalPath(input.workspaceRoot);
	mkdirSync(dirname(path), { recursive: true });
	withDirLock(path, () => {
		let existing = '';
		try {
			existing = readFileSync(path, 'utf8');
		} catch {
			existing = '';
		}
		const lines = boundJournalLines([
			...existing.split('\n'),
			JSON.stringify(input.entry),
		]);
		writeFileAtomicSync(path, `${lines.join('\n')}\n`);
	});
	return path;
};

/**
 * The only entry point the reporter calls. A journal is a convenience;
 * it must never be the reason a green suite goes red, and it must never
 * turn a red suite into an unexplained crash. Every failure is swallowed
 * to stderr.
 */
export const safeAppendRunEntry = (input: {
	readonly workspaceRoot: string;
	readonly entry: ITestRunEntry;
}): string | undefined => {
	try {
		return appendRunEntry(input);
	} catch (error) {
		try {
			process.stderr.write(
				`[test-journal] could not record this run: ${
					error instanceof Error ? error.message : String(error)
				}\n`,
			);
		} catch {
			/* stderr is gone too; there is nothing left to do */
		}
		return undefined;
	}
};

export const readRunEntries = (workspaceRoot: string): ITestRunEntry[] => {
	const path = journalPath(workspaceRoot);
	let raw = '';
	try {
		raw = readFileSync(path, 'utf8');
	} catch {
		return [];
	}
	const entries: ITestRunEntry[] = [];
	for (const line of raw.split('\n')) {
		if (line.trim() === '') continue;
		try {
			entries.push(JSON.parse(line) as ITestRunEntry);
		} catch {
			/* a torn line from an older writer — skip it, do not fail */
		}
	}
	return entries;
};

export const readLastRunEntry = (
	workspaceRoot: string,
): ITestRunEntry | undefined => readRunEntries(workspaceRoot).at(-1);
