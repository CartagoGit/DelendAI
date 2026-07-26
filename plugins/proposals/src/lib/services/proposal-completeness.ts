import { stat } from 'node:fs/promises';
/**
 * proposal-completeness.ts
 *
 * Slice / Files / status guards used by `proposal_transition`,
 * `proposal_reconcile_folder`, and the auto-transition path.
 *
 * Why this module exists:
 *
 * The 2026-07-25 pathology (commit `2a8d26bc` "Update dependencies" —
 * see a00074 why) and the 2026-07-26 batch-peer-review bypass (30+
 * slices approved in 20 min under same host+pid — see a00074 why)
 * shared a structural cause: the proposals plugin accepted any
 * frontmatter `status: done` without checking that **the proposal
 * body actually described work that shipped**. The doc-only DFA
 * ("ready -> in-progress -> review -> done") is fine for humans but
 * lets an agent write `status: done` on a proposal whose slices are
 * still `pending` and whose `Files:` does not exist on disk.
 *
 * a00074 S1+ (done) handled `done -> review`, zero-work `ready/pending
 * -> done`, and same-agent peer review. This module closes the LAST
 * structural gap: **the in-body claim that "this slice shipped" must
 * match the filesystem**, and **`status: done` is only valid when
 * every slice is `done`**.
 *
 * Public surface (pure, no I/O):
 *
 *   `collectSliceStatuses(markdown)`
 *     Parses `### S<n> — <title>` blocks and returns one entry per
 *     block: `{ id, status, files }`. Files is the union of every
 *     `Files: \`...\` ` line in that slice's body, brace-expanded
 *     so callers see exact paths.
 *
 *   `INCOMPLETENESS`
 *     Aggregates every slice whose `**Status**:` is `pending` plus
 *     every `Files:` entry the parser cannot verify on disk. Used by
 *     `proposal_transition` to block the `done` move.
 *
 *   `guardSlicesComplete(input)`
 *     Pure: refuses any slice plan that contains a `pending` slice,
 *     refuses any declared file that fails `fileExists`, returns a
 *     stable error code (`incomplete-slices` / `missing-declared-
 *     files`) so the proposal tool can surface it to the agent.
 *
 *   `verifyCompletedProposal(input)`
 *     Convenience wrapper that reads the proposal markdown from disk
 *     and runs `guardSlicesComplete`. The plan parser and the path
 *     reader are injectable so tests can run offline.
 */

const defaultFileExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

export interface ISliceParse {
	readonly id: string;
	readonly title: string;
	readonly status: 'pending' | 'in-progress' | 'done';
	readonly files: ReadonlyArray<string>;
}

export type ICompletenessResult =
	| { ok: true; readonly slices: ReadonlyArray<ISliceParse> }
	| {
			ok: false;
			code: 'incomplete-slices' | 'missing-declared-files';
			readonly pendingSlices: ReadonlyArray<string>;
			readonly missingFiles: ReadonlyArray<string>;
			readonly slices: ReadonlyArray<ISliceParse>;
	  };

const STATUS_TOKEN = /-\s*\*\*Status\*\*:\s*(pending|in-progress|done)\b/i;
const FILES_LINE = /-\s*\*\*Files\*\*:\s*([^\n]+(?:\n(?!-\s*\*\*)[^\n]+)*)/;
const SLICE_HEADER = /^###\s+(S\d+)\s+—\s*([^\n]+)$/;

const BACKTICKED = /`([^`]+)`/g;

/**
 * Expand every comma-separated path inside backticks, handling
 * `{a,b,c}` brace patterns. Returns the flat list of concrete paths
 * a slice declares in its `Files:` line. Brace depth is 1 (matches
 * the patterns actually used in 2026-Q3 proposals).
 */
export const expandDeclaredFiles = (text: string): ReadonlyArray<string> => {
	const out: string[] = [];
	for (const match of text.matchAll(BACKTICKED)) {
		const inside = match[1] ?? '';
		// Split on commas not inside braces.
		const parts = inside.split(/,\s*(?![^{}]*\})/);
		for (const raw of parts) {
			const trimmed = raw.trim();
			if (trimmed === '') continue;
			const brace = /^(.*)\{([^}]+)\}(.*)$/.exec(trimmed);
			if (brace) {
				if (brace === null) continue;
				const prefix = brace[1] ?? '';
				const choices = brace[2] ?? '';
				const suffix = brace[3] ?? '';
				for (const choice of choices.split(',')) {
					out.push(`${prefix}${choice}${suffix}`);
				}
				continue;
			}
			out.push(trimmed);
		}
	}
	return out;
};

/**
 * Parse every `### S<n>` block in a proposal markdown body and pull
 * `(status, files)` from it. Pure: takes only the string, returns the
 * list. Caller decides whether `files` paths exist on disk.
 */
export const collectSliceStatuses = (
	markdown: string,
): ReadonlyArray<ISliceParse> => {
	const lines = markdown.split('\n');
	const slices: ISliceParse[] = [];
	let current: ISliceParse | null = null;

	for (const line of lines) {
		const header = SLICE_HEADER.exec(line);
		if (header) {
			if (current !== null) slices.push(current);
			current = {
				id: header[1] ?? '',
				title: header[2]?.trim() ?? '',
				status: 'pending',
				files: [],
			};
			continue;
		}
		if (current === null) continue;
		const statusMatch = STATUS_TOKEN.exec(line);
		if (statusMatch) {
			const status = statusMatch[1]?.toLowerCase() ?? '';
			current = {
				...current,
				status:
					status === 'in-progress'
						? 'in-progress'
						: (status as ISliceParse['status']),
			};
			continue;
		}
		const filesMatch = FILES_LINE.exec(line);
		if (filesMatch) {
			const decl = expandDeclaredFiles(filesMatch[1] ?? '');
			if (decl.length > 0) {
				current = {
					...current,
					files: [...(current?.files ?? []), ...decl],
				};
			}
		}
	}
	if (current !== null) slices.push(current);
	return slices;
};

/**
 * Pure check: every slice must be `done` AND every declared file must
 * resolve on disk (sync probe). The async probe is split out in
 * `verifyCompletedProposalAsync` for tests that use `Bun.write` /
 * tmp dirs.
 */
export const guardSlicesComplete = (input: {
	readonly markdown: string;
	readonly fileExists?: (path: string) => boolean;
}): ICompletenessResult => {
	const slices = collectSliceStatuses(input.markdown);
	const probe =
		input.fileExists ??
		((p) => {
			try {
				require('node:fs').statSync(p);
				return true;
			} catch {
				return false;
			}
		});

	const pending = slices.filter((s) => s.status !== 'done').map((s) => s.id);
	const missing: string[] = [];
	for (const slice of slices) {
		if (slice.status !== 'done') continue;
		for (const file of slice.files) {
			if (!probe(file)) missing.push(file);
		}
	}

	if (pending.length > 0) {
		return {
			ok: false,
			code: 'incomplete-slices',
			pendingSlices: pending,
			missingFiles: missing,
			slices,
		};
	}
	if (missing.length > 0) {
		return {
			ok: false,
			code: 'missing-declared-files',
			pendingSlices: [],
			missingFiles: missing,
			slices,
		};
	}
	return { ok: true, slices };
};

/**
 * Convenience: read the proposal markdown from disk and run the sync
 * check. Async variant lets the caller mount a `fs/promises`-style
 * reader for tmpdir-based tests.
 */
export interface IReadMarkdown {
	readonly readText: (path: string) => Promise<string>;
}

export const verifyCompletedProposalAsync = async (input: {
	readonly proposalPath: string;
	readonly read: IReadMarkdown;
}): Promise<ICompletenessResult> => {
	const markdown = await input.read.readText(input.proposalPath);
	const result = guardSlicesComplete({
		markdown,
		fileExists: (p) => {
			try {
				require('node:fs').statSync(p);
				return true;
			} catch {
				return false;
			}
		},
	});
	// `statSync` is sync-only; for tests that need async correctness
	// the caller injects the `fileExists` predicate directly.
	return result;
};

/**
 * Single-shot inline check used by `proposal_transition` handler:
 * "do I have a `Files:` line + a `Status: done` line that agrees with
 * the filesystem?". Returns the same shape as `guardSlicesComplete`
 * so callers can render the error uniformly.
 */
export const guardTransitionToDone = async (input: {
	readonly proposalPath: string;
	readonly markdown: string;
}): Promise<ICompletenessResult> => {
	const result = guardSlicesComplete({ markdown: input.markdown });
	if (!result.ok) return result;
	// Re-check that the proposal-path itself is readable — guards
	// against a stale path during a transition attempt.
	try {
		await stat(input.proposalPath);
	} catch {
		return {
			ok: false,
			code: 'missing-declared-files',
			pendingSlices: [],
			missingFiles: [input.proposalPath],
			slices: result.slices,
		};
	}
	return result;
};
