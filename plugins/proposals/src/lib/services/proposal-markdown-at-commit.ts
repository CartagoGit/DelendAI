// effect-boundary-authorized: the git read half of proposals_db_reconcile,
// which is the filesystem boundary for the proposals database. It runs git
// with an argv (no shell) to read one commit's tree out of the object store.
/**
 * The proposal markdown tree as a commit holds it, not as the worktree
 * happens to be while a reconcile reads it.
 *
 * A reconcile that walks the worktree reads whatever the files are at
 * each moment: a checkout, a pull or an agent writing in the middle of
 * the run leaves a projection no single commit ever held, attributed to
 * a HEAD that did not contain it. Reading the tree out of the object
 * store at one resolved SHA makes the projection a function of that SHA:
 * two runs at the same commit see the same bytes, whatever the branch or
 * the worktree did in between.
 *
 * The worktree stays the default elsewhere: a person's uncommitted edit
 * of a proposal is what the next read must return, and only the
 * worktree has it.
 */
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, sep } from 'node:path';

import type {
	IProposalMarkdownAtCommit,
	IRefDrift,
} from '../contracts/interfaces/proposal-markdown-at-commit.interface';

/** Room for the whole proposal tree in one `cat-file --batch` answer. */
const GIT_OUTPUT_LIMIT_BYTES = 268_435_456;

const git = (
	workspaceRoot: string,
	args: readonly string[],
	input?: Buffer,
): Buffer =>
	execFileSync('git', args, {
		cwd: workspaceRoot,
		maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
		stdio: ['pipe', 'pipe', 'pipe'],
		...(input === undefined ? {} : { input }),
	});

/**
 * The commit `ref` names, resolved once. A ref that looks like an option
 * is refused rather than passed to git, and `--end-of-options` keeps any
 * other spelling from being read as one.
 */
export const resolveCommit = (workspaceRoot: string, ref: string): string => {
	if (ref.trim() === '' || ref.startsWith('-')) {
		throw new Error(`not a commit reference: "${ref}"`);
	}
	return git(workspaceRoot, [
		'rev-parse',
		'--verify',
		'--quiet',
		'--end-of-options',
		`${ref}^{commit}`,
	])
		.toString('utf8')
		.trim();
};

/**
 * Split `git cat-file --batch` output into the blobs it carries, in
 * order. Each record is `<sha> <type> <size>\n<size bytes>\n`; sizes are
 * bytes, so the parse walks the buffer, never a decoded string.
 */
const splitBatch = (output: Buffer): readonly Buffer[] => {
	const blobs: Buffer[] = [];
	let at = 0;
	while (at < output.length) {
		const headerEnd = output.indexOf(0x0a, at);
		if (headerEnd === -1) break;
		const header = output.subarray(at, headerEnd).toString('utf8');
		const size = Number(header.split(' ')[2]);
		if (!Number.isInteger(size)) {
			throw new Error(`unexpected git cat-file header: ${header}`);
		}
		blobs.push(output.subarray(headerEnd + 1, headerEnd + 1 + size));
		at = headerEnd + 1 + size + 1;
	}
	return blobs;
};

/**
 * Every `*.md` under `proposalsDirAbs` as commit `ref` holds it, with
 * paths relative to that directory and sorted the way the worktree walk
 * sorts them, so the two sources project identically when they agree.
 */
export const collectProposalMarkdownAtCommit = (
	workspaceRoot: string,
	proposalsDirAbs: string,
	ref: string,
): IProposalMarkdownAtCommit => {
	const dir = relative(workspaceRoot, proposalsDirAbs).split(sep).join('/');
	if (dir === '' || dir.startsWith('..') || isAbsolute(dir)) {
		throw new Error(
			`the proposals directory ${proposalsDirAbs} is not inside ${workspaceRoot}`,
		);
	}
	const sha = resolveCommit(workspaceRoot, ref);
	const entries = git(workspaceRoot, [
		'ls-tree',
		'-r',
		'-z',
		'--full-tree',
		sha,
		'--',
		dir,
	])
		.toString('utf8')
		.split('\0')
		.filter((entry) => entry.length > 0)
		.map((entry) => {
			const tab = entry.indexOf('\t');
			const [, type, object] = entry.slice(0, tab).split(' ');
			return { type, object, path: entry.slice(tab + 1) };
		})
		.filter(
			(entry): entry is { type: string; object: string; path: string } =>
				entry.type === 'blob' &&
				entry.object !== undefined &&
				entry.path.endsWith('.md'),
		);
	if (entries.length === 0) return { sha, files: [] };
	const blobs = splitBatch(
		git(
			workspaceRoot,
			['cat-file', '--batch'],
			Buffer.from(`${entries.map((entry) => entry.object).join('\n')}\n`),
		),
	);
	const files = entries.map((entry, index) => ({
		path: entry.path.slice(dir.length + 1),
		raw: (blobs[index] ?? Buffer.alloc(0)).toString('utf8'),
	}));
	return {
		sha,
		files: files.sort((a, b) => a.path.localeCompare(b.path)),
	};
};

/**
 * Whether `ref` still names `sha`, asked once the reconcile is done. A
 * SHA names itself for ever, so it never drifts; a branch or a tag that
 * moved, or was deleted, while the run read `sha` is reported.
 */
export const refDrift = (
	workspaceRoot: string,
	ref: string,
	sha: string,
): IRefDrift | null => {
	if (ref === sha) return null;
	let now: string | null;
	try {
		now = resolveCommit(workspaceRoot, ref);
	} catch {
		now = null;
	}
	if (now === sha) return null;
	return {
		from: sha,
		to: now,
		reason: now === null ? 'ref-gone' : 'ref-moved',
	};
};
