/**
 * proposal-state.ts
 *
 * Local transition guards and audit logging that sit above the raw DFA.
 *
 * These rules intentionally do not redefine the full lifecycle graph.
 * They only harden the exceptional paths that the transition/recovery tools
 * must treat specially.
 */

import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

export type IDoneToReviewRegressionResult =
	| { ok: true }
	| { ok: false; code: 'invalid-regression'; reason: string };

export const guardDoneToReviewRegression = (input: {
	readonly from: string;
	readonly to: string;
	readonly force?: boolean | undefined;
	readonly reason?: string | undefined;
}): IDoneToReviewRegressionResult => {
	if (input.from !== 'done' || input.to !== 'review') return { ok: true };
	if (input.force !== true) {
		return {
			ok: false,
			code: 'invalid-regression',
			reason: 'cannot move done -> review without force: true',
		};
	}
	if ((input.reason ?? '').trim() === '') {
		return {
			ok: false,
			code: 'invalid-regression',
			reason: 'force: true requires a non-empty reason',
		};
	}
	return { ok: true };
};

export type IShippedInGuardResult =
	| { ok: true }
	| {
			ok: false;
			code: 'missing-shipped-in';
			reason: string;
			/** Next action the agent must take to satisfy the gate. */
			nextAction: string;
			/** The exact frontmatter field the agent must add or repair. */
			fix: string;
	  };

/** Single-line summary of the shipped-in gate. Kept short so it shows up
 *  verbatim in the agent transcript. */
const SHIPPED_IN_MISSING_REASON =
	'frontmatter `shipped-in` is required to move a proposal to `done`; the gate is enforced by `guardShippedInPresent` (`plugins/proposals/src/lib/services/proposal-state.ts`).';

/** Concrete next-action text the orchestrator can echo. Built so an agent
 *  can run `git log <id> --format=%H` and paste the SHA into the
 *  frontmatter without reading further docs. */
const SHIPPED_IN_MISSING_NEXT_ACTION =
	'Add `shipped-in: ["<sha>"]` to the proposal\'s top-level YAML frontmatter (the block between the first two `---` lines) — NOT inside a `resolution:` block. The SHA must be a 7-40 char hex commit that introduced the slice\'s `**Files**`. Find it with: `git log --all --oneline -- <file> | head -3`. A real SHA is preferred; for placeholder-only close-loops, HEAD also satisfies the gate.';

/** Single-line fix instruction; the orchestrator renders this inside the
 *  `code: 'missing-shipped-in'` envelope so the failure is unmissable. */
const SHIPPED_IN_MISSING_FIX =
	'edit frontmatter: append `shipped-in: ["<sha>"]` (replace `<sha>` with the commit that landed the slice).';

/** 7-40 hex chars: short SHA (7) to full SHA-1 (40). The window covers
 *  any reasonable commit identifier without accepting noisy strings. */
const SHIPPED_IN_SHA_LENGTH_MAX = 40;

export const guardShippedInPresent = (
	proposalFrontmatter: Record<string, unknown>,
): IShippedInGuardResult => {
	const raw = proposalFrontmatter['shipped-in'];
	// Accept three shapes the repo has historically used:
	//   1. List form (canonical):
	//        shipped-in:\n  - abc1234
	//        shipped-in: [abc1234]
	//   2. Scalar string form (legacy test fixtures + some proposals):
	//        shipped-in: abc1234
	//   3. Bracketed scalar string form (legacy string-typed fixtures):
	//        shipped-in: '[abc1234]'
	// The shape-check downstream tolerates any of these by extracting
	// every 7-40 char hex run.
	const shaRe = new RegExp(`^[0-9a-f]{7,${SHIPPED_IN_SHA_LENGTH_MAX}}$`);
	// YAML allows a trailing `# ...` comment after a value, and authors
	// use it constantly to say what the SHA landed:
	//   shipped-in: ["525a3bdc # feat(ci): verify CI local reproduce"]
	// The comment is part of the string once parsed, and the anchored
	// SHA test then rejected an otherwise perfectly good SHA — the note
	// explaining the commit was enough to block the proposal from
	// closing. Strip it, which is also what this function's own doc
	// comment above already promises ("extracting every 7-40 char hex
	// run").
	const stripInlineComment = (value: string): string =>
		value.split('#')[0]?.trim() ?? '';
	// When the frontmatter is read as a raw line rather than parsed YAML,
	// a list value arrives as the literal text `["abc1234"]` — brackets
	// stripped below, but the quotes survive into the candidate and the
	// anchored SHA test then rejects a perfectly good SHA. The quoting is
	// how everyone writes this field, so accept it.
	const stripQuotes = (value: string): string =>
		value
			.replace(/^['"]+/, '')
			.replace(/['"]+$/, '')
			.trim();
	const candidates: string[] = [];
	if (Array.isArray(raw)) {
		for (const entry of raw) {
			if (typeof entry === 'string' && entry.trim().length > 0) {
				candidates.push(stripQuotes(stripInlineComment(entry)));
			} else if (typeof entry === 'number' && Number.isFinite(entry)) {
				candidates.push(String(entry));
			}
		}
	} else if (typeof raw === 'string' && raw.trim().length > 0) {
		const trimmed = stripInlineComment(raw);
		// Strip matching [] to handle the legacy `'[abc1234]'` form.
		const inner =
			trimmed.startsWith('[') && trimmed.endsWith(']')
				? trimmed.slice(1, -1)
				: trimmed;
		// If the bracket-stripped string is itself a valid 7-40 hex SHA,
		// keep it as a single candidate (e.g. `[ship123]` is one SHA,
		// not three tokens to split). Otherwise split on whitespace /
		// commas to extract every individual SHA.
		if (shaRe.test(stripQuotes(inner))) {
			candidates.push(stripQuotes(inner));
		} else {
			for (const token of inner.split(/[\s,]+/u)) {
				const t = stripQuotes(token.replace(/^[-\s]+/u, '').trim());
				if (t.length > 0) candidates.push(t);
			}
		}
	} else if (typeof raw === 'number' && Number.isFinite(raw)) {
		candidates.push(String(raw));
	} else if (raw !== undefined && raw !== null) {
		// Any non-string/non-array value (number, boolean, object) is
		// malformed.
		return {
			ok: false,
			code: 'missing-shipped-in',
			reason: `${SHIPPED_IN_MISSING_REASON} Got malformed value of type ${typeof raw}.`,
			nextAction: SHIPPED_IN_MISSING_NEXT_ACTION,
			fix: SHIPPED_IN_MISSING_FIX,
		};
	}
	const nonEmptyCandidates = candidates.filter(
		(entry) => entry.trim().length > 0,
	);
	candidates.length = 0;
	candidates.push(...nonEmptyCandidates);
	if (candidates.length === 0) {
		return {
			ok: false,
			code: 'missing-shipped-in',
			reason: SHIPPED_IN_MISSING_REASON,
			nextAction: SHIPPED_IN_MISSING_NEXT_ACTION,
			fix: SHIPPED_IN_MISSING_FIX,
		};
	}
	// Validate shape: every candidate must look like a short or full
	// SHA (7-40 lowercase hex). A non-SHA like "TBD" or "n/a" used to
	// pass silently and was the root cause of the in-progress/backlog
	// regression (agents wrote `shipped-in: [TBD]` and the proposal got
	// stuck). Cheap shape-check stops that failure mode before the
	// validator runs downstream.
	const invalid = candidates.filter(
		(value) =>
			!new RegExp(`^[0-9a-f]{7,${SHIPPED_IN_SHA_LENGTH_MAX}}$`).test(
				value,
			),
	);
	if (invalid.length > 0) {
		return {
			ok: false,
			code: 'missing-shipped-in',
			reason: `${SHIPPED_IN_MISSING_REASON} Got non-SHA entries: [${invalid.map((s) => JSON.stringify(s)).join(', ')}].`,
			nextAction: SHIPPED_IN_MISSING_NEXT_ACTION,
			fix: SHIPPED_IN_MISSING_FIX,
		};
	}
	return { ok: true };
};

export interface IForcedRegressionCaller {
	readonly host: string;
	readonly pid: number;
	readonly agent: string;
}

export const buildForcedRegressionCaller = (
	agent?: string | undefined,
): IForcedRegressionCaller => ({
	host: process.env.MCP_HOST ?? hostname(),
	pid: process.pid,
	agent: agent?.trim() || 'unknown',
});

export const logForcedRegression = async (input: {
	readonly workspaceRoot: string;
	readonly proposalId: string;
	readonly from: string;
	readonly to: string;
	readonly reason: string;
	readonly ts: string;
	readonly caller: IForcedRegressionCaller;
}): Promise<void> => {
	const logPath = join(
		input.workspaceRoot,
		'.cache',
		'mcp-vertex',
		'proposals-state.log',
	);
	const line = JSON.stringify({
		proposalId: input.proposalId,
		from: input.from,
		to: input.to,
		reason: input.reason,
		ts: input.ts,
		caller: input.caller,
	});

	await mkdir(dirname(logPath), { recursive: true });
	await withFileMutex(logPath, async () => {
		const existing = await new SafeWorkspaceReader(dirname(logPath))
			.readText(basename(logPath))
			.then((value) => value.content)
			.catch((error: unknown) => {
				if (
					error &&
					typeof error === 'object' &&
					'code' in error &&
					error.code === 'ENOENT'
				) {
					return '';
				}
				throw error;
			});
		const prefix =
			existing === '' || existing.endsWith('\n')
				? existing
				: `${existing}\n`;
		await writeFileAtomic(logPath, `${prefix}${line}\n`);
	});
};
