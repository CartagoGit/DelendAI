/**
 * checkout-for-request.spec.ts
 *
 * x00608 S1: which working copy a request's writes belong to, and what
 * has to move with them.
 */
import { describe, expect, it } from 'vitest';

import {
	checkoutForRequest,
	rebaseOntoCheckout,
	scopePathsToCheckout,
} from '../../../../src/lib/shared/shared-checkout';

const SERVER = '/repo';
const WORKTREE = '/tmp/worktrees/x608';

/** A fake `sharedCheckout`: both trees answer the same repository. */
const sameRepository = (from: string): string | undefined =>
	from === SERVER || from === WORKTREE ? SERVER : undefined;

describe('checkoutForRequest', () => {
	it('keeps the server root when the request names no checkout', () => {
		const resolved = checkoutForRequest({
			serverRoot: SERVER,
			checkoutOf: sameRepository,
		});
		expect(resolved).toEqual({
			ok: true,
			root: SERVER,
			source: 'server',
		});
	});

	it('treats an empty checkout as no checkout at all', () => {
		const resolved = checkoutForRequest({
			serverRoot: SERVER,
			requested: '   ',
			checkoutOf: sameRepository,
		});
		expect(resolved).toEqual({
			ok: true,
			root: SERVER,
			source: 'server',
		});
	});

	it('accepts a worktree of the same repository', () => {
		const resolved = checkoutForRequest({
			serverRoot: SERVER,
			requested: WORKTREE,
			checkoutOf: sameRepository,
		});
		expect(resolved).toEqual({
			ok: true,
			root: WORKTREE,
			source: 'request',
		});
	});

	it('refuses a path that is not in a working tree, naming what was checked', () => {
		const resolved = checkoutForRequest({
			serverRoot: SERVER,
			requested: '/somewhere/else',
			checkoutOf: sameRepository,
		});
		expect(resolved.ok).toBe(false);
		if (resolved.ok) return;
		expect(resolved.refusal).toContain('/somewhere/else');
		expect(resolved.refusal).toContain('common directory');
	});

	it('refuses a working tree of a different repository, naming both', () => {
		const resolved = checkoutForRequest({
			serverRoot: SERVER,
			requested: '/other/clone',
			checkoutOf: (from) =>
				from === '/other/clone' ? '/other' : sameRepository(from),
		});
		expect(resolved.ok).toBe(false);
		if (resolved.ok) return;
		expect(resolved.refusal).toContain('/other/clone');
		expect(resolved.refusal).toContain('/other');
		expect(resolved.refusal).toContain(SERVER);
	});

	it('refuses when the server root itself is not a working tree', () => {
		const resolved = checkoutForRequest({
			serverRoot: '/not/a/repo',
			requested: WORKTREE,
			checkoutOf: sameRepository,
		});
		expect(resolved.ok).toBe(false);
		if (resolved.ok) return;
		expect(resolved.refusal).toContain('/not/a/repo');
	});
});

describe('rebaseOntoCheckout', () => {
	it('moves a path inside the old root onto the new one', () => {
		expect(
			rebaseOntoCheckout(`${SERVER}/docs/proposals`, SERVER, WORKTREE),
		).toBe(`${WORKTREE}/docs/proposals`);
	});

	it('leaves a path outside the old root alone', () => {
		expect(rebaseOntoCheckout('/var/log/x.jsonl', SERVER, WORKTREE)).toBe(
			'/var/log/x.jsonl',
		);
	});

	it('leaves the root itself alone rather than returning the new root', () => {
		expect(rebaseOntoCheckout(SERVER, SERVER, WORKTREE)).toBe(SERVER);
	});

	it('is the identity when both roots are the same tree', () => {
		expect(rebaseOntoCheckout(`${SERVER}/a`, SERVER, `${SERVER}/`)).toBe(
			`${SERVER}/a`,
		);
	});
});

describe('scopePathsToCheckout', () => {
	const options = {
		workspaceRoot: SERVER,
		proposalsDirAbs: `${SERVER}/docs/delendai/proposals`,
		indexPathAbs: `${SERVER}/.cache/delendai/proposals/index.json`,
		counterPathAbs: `${SERVER}/.cache/delendai/counter.json`,
		journalPathAbs: '',
		elsewhere: '/var/lib/delendai/x.json',
	} as const;

	it('moves only the fields it is told to move', () => {
		const scoped = scopePathsToCheckout(options, WORKTREE, [
			'proposalsDirAbs',
			'indexPathAbs',
		]);
		expect(scoped.workspaceRoot).toBe(WORKTREE);
		expect(scoped.proposalsDirAbs).toBe(
			`${WORKTREE}/docs/delendai/proposals`,
		);
		expect(scoped.indexPathAbs).toBe(
			`${WORKTREE}/.cache/delendai/proposals/index.json`,
		);
		// The id counter is a fact about the repository, not about one
		// working tree: a per-worktree copy hands out the same id twice.
		expect(scoped.counterPathAbs).toBe(options.counterPathAbs);
	});

	it('leaves an empty field and a path outside the root untouched', () => {
		const scoped = scopePathsToCheckout(options, WORKTREE, [
			'journalPathAbs',
			'elsewhere',
		]);
		expect(scoped.journalPathAbs).toBe('');
		expect(scoped.elsewhere).toBe('/var/lib/delendai/x.json');
	});

	it('returns the very same object when the checkout is the server root', () => {
		expect(scopePathsToCheckout(options, SERVER, ['proposalsDirAbs'])).toBe(
			options,
		);
	});
});
