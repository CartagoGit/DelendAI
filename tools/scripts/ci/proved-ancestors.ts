/**
 * proved-ancestors.ts — which commit a proof measures its change from.
 *
 * A unit that merged the unmerged branches of sibling slices diffs against
 * `merge-base(develop, HEAD)`, so every spec those already-proved slices
 * touched is selected again. A proof that passed leaves a record; the next
 * proof measures from the closest recorded commit that is still an ancestor
 * of HEAD, when that leaves fewer files to judge than the merge base does.
 *
 * Pure: git is read through `IProofGitReader`, the store's text is parsed
 * here and written elsewhere (`proved-ancestors.store.ts`).
 */

/** How much of the proof a record vouches for. */
export type IProofScope = 'fast' | 'full';

/** One passed proof: the commit it judged and where its change began. */
export interface IProvedCommit {
	readonly commit: string;
	readonly tree: string;
	readonly base: string;
	readonly scope: IProofScope;
	readonly at: string;
}

/** What the choice asks git, so a spec can answer from memory. */
export interface IProofGitReader {
	/** Whether the commit is still in the repository. */
	exists(commit: string): boolean;
	/** Whether the commit is an ancestor of HEAD (HEAD itself counts). */
	isAncestorOfHead(commit: string): boolean;
	/** How many files differ between the commit and HEAD. */
	changedFileCount(commit: string): number;
}

/** The base a proof selects by, and the sentence that says why. */
export interface IBaseChoice {
	readonly base: string;
	readonly proved: boolean;
	readonly files: number;
	readonly message: string;
}

/** Candidates considered, the most recent first. */
export const MAX_PROVED_CANDIDATES = 20;

/** Records kept in the store; older ones carry no weight past the candidates. */
export const MAX_STORED_PROOFS = 200;

const SHORT = 9;

const isProvedCommit = (value: unknown): value is IProvedCommit => {
	if (typeof value !== 'object' || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.commit === 'string' &&
		typeof entry.tree === 'string' &&
		typeof entry.base === 'string' &&
		(entry.scope === 'fast' || entry.scope === 'full') &&
		typeof entry.at === 'string'
	);
};

/** The records in a store's text; an unreadable store holds none. */
export const parseProofStore = (text: string): readonly IProvedCommit[] => {
	try {
		const parsed: unknown = JSON.parse(text);
		return Array.isArray(parsed) ? parsed.filter(isProvedCommit) : [];
	} catch {
		return [];
	}
};

/** The store's text for these records. */
export const serializeProofStore = (proofs: readonly IProvedCommit[]): string =>
	`${JSON.stringify(proofs, undefined, '\t')}\n`;

/** The record added, newest first, one per commit and scope, capped. */
export const recordProof = (
	proofs: readonly IProvedCommit[],
	proof: IProvedCommit,
): readonly IProvedCommit[] =>
	[
		proof,
		...proofs.filter(
			(each) =>
				each.commit !== proof.commit || each.scope !== proof.scope,
		),
	].slice(0, MAX_STORED_PROOFS);

/** The records whose commit still exists, and how many were dropped. */
export const livingProofs = (
	proofs: readonly IProvedCommit[],
	git: Pick<IProofGitReader, 'exists'>,
): { readonly kept: readonly IProvedCommit[]; readonly pruned: number } => {
	const kept = proofs.filter((each) => git.exists(each.commit));
	return { kept, pruned: proofs.length - kept.length };
};

const sentenceOf = (
	choice: Omit<IBaseChoice, 'message'>,
	mergeBase: string,
	mergeBaseFiles: number,
): string =>
	choice.proved
		? `proved ancestor ${choice.base.slice(0, SHORT)} (${String(choice.files)} files) instead of develop merge-base (${String(mergeBaseFiles)} files)`
		: `develop merge-base ${mergeBase.slice(0, SHORT)} (${String(mergeBaseFiles)} files); no proved ancestor leaves fewer`;

/**
 * The base to select by: the merge base, or the proved ancestor of HEAD
 * that leaves the fewest changed files. A tie keeps the merge base, so a
 * record is only trusted where it narrows the work. `accepts` names the
 * scopes that vouch for the proof asked for: a fast proof trusts a full one.
 */
export const chooseSelectionBase = (
	mergeBase: string,
	proofs: readonly IProvedCommit[],
	git: IProofGitReader,
	accepts: readonly IProofScope[] = ['fast', 'full'],
): IBaseChoice => {
	const mergeBaseFiles = git.changedFileCount(mergeBase);
	let best: Omit<IBaseChoice, 'message'> = {
		base: mergeBase,
		proved: false,
		files: mergeBaseFiles,
	};
	const seen = new Set<string>();
	const candidates = proofs
		.filter((each) => accepts.includes(each.scope))
		.filter((each) => !seen.has(each.commit) && !!seen.add(each.commit))
		.slice(0, MAX_PROVED_CANDIDATES);
	for (const each of candidates) {
		if (!git.isAncestorOfHead(each.commit)) continue;
		const files = git.changedFileCount(each.commit);
		if (files < best.files)
			best = { base: each.commit, proved: true, files };
	}
	return { ...best, message: sentenceOf(best, mergeBase, mergeBaseFiles) };
};
