/**
 * write-root.spec.ts — a tool's writes land where its declared root says,
 * from the server's checkout and from a linked worktree alike.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	callerCheckout,
	resolveWriteRoot,
} from '../../../../src/lib/shared/shared-checkout';

const SERVER = '/repo';
const WORKTREE = '/tmp/worktrees/agent';
const sameRepository = (from: string): string | undefined =>
	from === SERVER || from === WORKTREE ? SERVER : undefined;

describe('resolveWriteRoot, decided per declared root', () => {
	it('sends a caller-checkout write to the checkout the request names', () => {
		expect(
			resolveWriteRoot({
				root: 'caller-checkout',
				serverRoot: SERVER,
				requested: WORKTREE,
				checkoutOf: sameRepository,
			}),
		).toEqual({ ok: true, root: WORKTREE, source: 'request' });
	});

	it('keeps a caller-checkout write on the server root when none is named', () => {
		expect(
			resolveWriteRoot({
				root: 'caller-checkout',
				serverRoot: SERVER,
				checkoutOf: sameRepository,
			}),
		).toMatchObject({ ok: true, root: SERVER });
	});

	it('refuses a caller checkout from another repository', () => {
		expect(
			resolveWriteRoot({
				root: 'caller-checkout',
				serverRoot: SERVER,
				requested: '/elsewhere',
				checkoutOf: sameRepository,
			}),
		).toMatchObject({ ok: false });
	});

	it('never lets a request move a repository or host-state write', () => {
		for (const root of ['repository', 'host-state'] as const) {
			expect(
				resolveWriteRoot({
					root,
					serverRoot: WORKTREE,
					requested: WORKTREE,
					checkoutOf: sameRepository,
				}),
			).toEqual({ ok: true, root: SERVER, source: 'server' });
		}
	});

	it('keeps a server write on the server root', () => {
		expect(
			resolveWriteRoot({
				root: 'server',
				serverRoot: WORKTREE,
				requested: SERVER,
				checkoutOf: sameRepository,
			}),
		).toEqual({ ok: true, root: WORKTREE, source: 'server' });
	});

	it('refuses repository state when the server is not in a working tree', () => {
		expect(
			resolveWriteRoot({
				root: 'repository',
				serverRoot: '/nowhere',
				checkoutOf: () => undefined,
			}),
		).toMatchObject({ ok: false });
	});

	it('is what the published facade hands out', () => {
		expect(callerCheckout.writeRoot).toBe(resolveWriteRoot);
	});
});

describe('resolveWriteRoot against a real linked worktree', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

	it('puts repository state in the shared checkout and caller writes in the worktree', () => {
		const main = realpathSync(
			mkdtempSync(join(tmpdir(), 'write-root-main-')),
		);
		const linked = join(
			realpathSync(mkdtempSync(join(tmpdir(), 'write-root-wt-'))),
			'agent',
		);
		dirs.push(main, join(linked, '..'));
		git(main, 'init', '-q', '-b', 'develop');
		git(main, 'config', 'user.email', 'w@example.com');
		git(main, 'config', 'user.name', 'W');
		git(main, 'config', 'commit.gpgsign', 'false');
		writeFileSync(join(main, 'a.txt'), 'a\n');
		git(main, 'add', '-A');
		git(main, 'commit', '-q', '-m', 'base');
		git(main, 'worktree', 'add', '-q', '--detach', linked);

		// The server was started inside the agent's worktree.
		expect(
			resolveWriteRoot({ root: 'repository', serverRoot: linked }),
		).toEqual({ ok: true, root: main, source: 'server' });
		expect(
			resolveWriteRoot({
				root: 'caller-checkout',
				serverRoot: main,
				requested: linked,
			}),
		).toEqual({ ok: true, root: linked, source: 'request' });
	});
});
