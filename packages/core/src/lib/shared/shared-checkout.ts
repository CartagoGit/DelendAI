/**
 * shared-checkout.ts — which working copy the project's facts belong to.
 *
 * A project has ONE pinned checkout and any number of worktrees hanging
 * off it. Facts about the project — which branch integrates, whether the
 * checkout is clean, where the refs live — are facts about that one
 * checkout, and asking the worktree you happen to be standing in gives
 * the wrong answer for every one of them.
 *
 * `--show-toplevel` answers the worktree. `--git-common-dir` is the one
 * path that is the same from either, so its parent is always the shared
 * checkout.
 *
 * ## Why here
 *
 * This was written four times — in the guard, in the workflow doctor, in
 * the proposals reconciler and in the id-counter source — each with its
 * own spelling and its own failure mode. One of them read `.git` as a
 * directory and silently degraded in every worktree, which is the
 * ordinary case. A question with one answer should have one
 * implementation.
 */
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import {
	CHECKOUT_ARG_DESCRIPTION,
	CHECKOUT_ARG_SCHEMA,
} from '../contracts/constants/checkout-arg.constant';
import type { ICheckoutForRequest } from '../contracts/interfaces/shared-checkout.interface';
import type { IToolWriteRoot } from '../contracts/interfaces/tool-registration.interface';
import { executionRootOr } from './execution-root';

/**
 * The git directory shared by a checkout and all of its worktrees, or
 * `undefined` when `from` is not inside a git working tree.
 *
 * Not published: `sharedCheckout` is the question callers ask, and a
 * published export is a compatibility commitment nobody has asked for.
 */
const commonGitDir = (from: string): string | undefined => {
	try {
		const answer = execFileSync(
			'git',
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			{
				cwd: from,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		).trim();
		return answer.length === 0 ? undefined : answer;
	} catch {
		return undefined;
	}
};

/**
 * The pinned checkout, from anywhere inside the repository — including
 * from a linked worktree, which is where agents work.
 */
export const sharedCheckout = (from: string): string | undefined => {
	const common = commonGitDir(from);
	return common === undefined ? undefined : dirname(common);
};

/**
 * Which working copy a request's writes belong to.
 *
 * The server resolves its root once, from the process that started it.
 * That is right for a server and wrong for a request: with a shared
 * checkout plus per-agent worktrees — the model this project recommends
 * — the caller's working tree is routinely not the server's, and a write
 * that lands in the server's root lands on the integration branch, which
 * every profile here exists to prevent.
 *
 * So a request may name its checkout. What it names is accepted only
 * when it is a working tree of *this* repository, which is the same
 * question `sharedCheckout` already answers: two working trees belong to
 * one repository exactly when they share a git common directory.
 * Comparing paths would not do — a worktree may live anywhere on disk,
 * including outside the checkout it hangs off.
 *
 * Omitting `requested` keeps the server's root, so nothing that calls
 * from the server's own root changes.
 */
export const checkoutForRequest = (input: {
	readonly serverRoot: string;
	readonly requested?: string | undefined;
	/** Injectable for tests; defaults to the real `sharedCheckout`. */
	readonly checkoutOf?: (from: string) => string | undefined;
}): ICheckoutForRequest => {
	const { serverRoot, requested } = input;
	const checkoutOf = input.checkoutOf ?? sharedCheckout;
	if (requested === undefined || requested.trim() === '') {
		// Returned as given, deliberately: a caller that names no
		// checkout must be left byte-identical to before this existed,
		// including one whose options never carried a root because the
		// path it takes never reads one.
		return { ok: true, root: serverRoot, source: 'server' };
	}
	const candidate = resolve(requested);
	const theirs = checkoutOf(candidate);
	if (theirs === undefined) {
		return {
			ok: false,
			refusal: `checkout "${candidate}" is not inside a git working tree (asked git for its common directory)`,
		};
	}
	const ours = checkoutOf(resolve(serverRoot));
	if (ours === undefined) {
		return {
			ok: false,
			refusal: `this server's root "${resolve(serverRoot)}" is not inside a git working tree, so no checkout can be proved to match it`,
		};
	}
	if (theirs !== ours) {
		return {
			ok: false,
			refusal: `checkout "${candidate}" belongs to a different repository (its shared checkout is "${theirs}", this server's is "${ours}")`,
		};
	}
	return { ok: true, root: candidate, source: 'request' };
};

/**
 * The same path, seen from another working tree of the same repository.
 *
 * A tool is handed absolute paths that were resolved against the
 * server's root — the proposals directory, the registry index, a
 * journal. When the write belongs to another checkout, every one of them
 * has to move with it, or the tool reads one tree and writes another.
 *
 * A path that is not inside `from` is returned unchanged: it is not a
 * fact about the checkout, so it does not move.
 */
export const rebaseOntoCheckout = (
	pathAbs: string,
	from: string,
	to: string,
): string => {
	const fromRoot = resolve(from);
	const toRoot = resolve(to);
	if (fromRoot === toRoot) return pathAbs;
	const rel = relative(fromRoot, resolve(pathAbs));
	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return pathAbs;
	return join(toRoot, rel);
};

/**
 * A tool's options, with every repository path moved onto `checkout`.
 *
 * Handing a tool a different `workspaceRoot` is not enough: the same
 * options object carries absolute paths that were resolved against the
 * old root — the content directory it reads, the index it consults, the
 * journal it appends to. Moving the root and leaving those behind is the
 * worst of the three states, because the tool then reads one tree and
 * writes another.
 *
 * `keys` names the option fields holding such paths. Fields the caller
 * does not name, and paths that are not inside the old root, are left
 * exactly as they were.
 */
export const scopePathsToCheckout = <
	T extends { readonly workspaceRoot: string },
>(
	options: T,
	checkout: string,
	keys: readonly Extract<keyof T, string>[],
): T => {
	const from = resolve(options.workspaceRoot);
	const to = resolve(checkout);
	if (from === to) return options;
	const moved: Record<string, unknown> = { ...options, workspaceRoot: to };
	for (const key of keys) {
		const value = moved[key];
		if (typeof value !== 'string' || value === '') continue;
		moved[key] = rebaseOntoCheckout(value, from, to);
	}
	return moved as T;
};

/**
 * A tool's options, moved onto the checkout the current call is bound
 * to (`bind-write-root.ts`). Outside a bound call, or when the call
 * named no checkout, the options come back unchanged.
 *
 * `keys` are the paths that belong to the working tree — the content a
 * tool reads and writes. Paths that describe the repository as a whole
 * (an id counter, a lock) are left out so every worktree shares them.
 */
export const scopePathsToCall = <T extends { readonly workspaceRoot: string }>(
	options: T,
	keys: readonly Extract<keyof T, string>[],
): T =>
	scopePathsToCheckout(options, executionRootOr(options.workspaceRoot), keys);

/**
 * The directory a tool's writes go to, from the root it declared.
 *
 * One resolver for every root, so "a working tree of this repository" and
 * "the repository's shared state" are each defined once:
 *
 * - `caller-checkout` is the caller's working tree when the request names
 *   one and it belongs to this repository (`checkoutForRequest`),
 *   otherwise the server's root;
 * - `repository` and `host-state` are the shared checkout, the same from
 *   every worktree, whatever the request says: an id counter rooted per
 *   worktree hands out the same id twice;
 * - `server` is the server's root;
 * - `remote` writes nothing locally; it resolves to the shared checkout
 *   only as the repository whose remote it is, for reading its config.
 */
export const resolveWriteRoot = (input: {
	readonly root: IToolWriteRoot;
	readonly serverRoot: string;
	readonly requested?: string | undefined;
	/** Injectable for tests; defaults to the real `sharedCheckout`. */
	readonly checkoutOf?: (from: string) => string | undefined;
}): ICheckoutForRequest => {
	const checkoutOf = input.checkoutOf ?? sharedCheckout;
	if (input.root === 'caller-checkout') {
		return checkoutForRequest({
			serverRoot: input.serverRoot,
			requested: input.requested,
			checkoutOf,
		});
	}
	if (input.root === 'server') {
		return { ok: true, root: input.serverRoot, source: 'server' };
	}
	const shared = checkoutOf(resolve(input.serverRoot));
	if (shared === undefined) {
		return {
			ok: false,
			refusal: `this server's root "${resolve(input.serverRoot)}" is not inside a git working tree, so it has no ${input.root} to write to`,
		};
	}
	return { ok: true, root: shared, source: 'server' };
};

/**
 * The whole answer to "which working copy is this request for", as one
 * published name.
 *
 * Five separate exports would have been five things a consumer may take
 * a copy of and five entries on core's public surface, which has a
 * ceiling for the same reason this module exists: a question with one
 * answer should have one place to ask it. `arg` declares the argument,
 * `resolve` decides whether the path may be written to, and `scopePaths`
 * moves the tool's other paths with it. Nothing here is useful without
 * the other two.
 */
export const callerCheckout = {
	/** The `checkout` argument, one spelling for every tool's schema. */
	arg: CHECKOUT_ARG_SCHEMA,
	/** Its description, for a tool that composes its own wording. */
	argDescription: CHECKOUT_ARG_DESCRIPTION,
	resolve: checkoutForRequest,
	scopePaths: scopePathsToCheckout,
	/** `scopePaths` onto the checkout the current call is bound to. */
	scopeToCall: scopePathsToCall,
	rebase: rebaseOntoCheckout,
	/** The directory for a declared `IToolWriteRoot`. */
	writeRoot: resolveWriteRoot,
	/**
	 * Where a runner spawns: the checkout the current call is bound to,
	 * or the runner's own root outside a bound call.
	 */
	executionRootOr,
} as const;
