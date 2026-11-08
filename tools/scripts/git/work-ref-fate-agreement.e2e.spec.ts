/**
 * work-ref-fate-agreement.spec.ts — the checkout publisher and the ref
 * maintenance cannot disagree about whether a work ref belongs on the
 * forge.
 *
 * One unit's ref was taken off the forge and put back thirty times in a
 * day: the publisher judged `landed` against the local integration branch
 * (a ref at its tip counted as landed) and the maintenance against the
 * forge's (it did not). Both now read workRefLanded, and this drives both
 * on a real repository over every state where they used to part.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createWriteGitRunner,
	resolveDevelopmentPolicy,
} from '@delendai/core/public';
import { settleLanded } from '@delendai/core/runtime';

import { maintainRefNamespace } from './maintain-ref-namespace.script';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const REF = 'delendai/wip/claude-opus-5-5/implement/q00038-S10-g1/ref-loop';
const LONG_AGO = '2026-01-01T00:00:00Z';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_AUTHOR_DATE: LONG_AGO,
			GIT_COMMITTER_DATE: LONG_AGO,
		},
	}).trim();

const commit = (root: string, file: string): void => {
	writeFileSync(join(root, file), `${file}\n`);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', file);
};

/** A clone whose develop declares proposal q00038 in progress; long quiet. */
const repo = (): string => {
	const base = mkdtempSync(join(tmpdir(), 'ref-fate-'));
	roots.push(base);
	const remote = join(base, 'origin.git');
	const root = join(base, 'work');
	mkdirSync(remote);
	mkdirSync(root);
	git(remote, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'f@example.com');
	git(root, 'config', 'user.name', 'F');
	git(root, 'config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'docs/delendai/proposals/in-progress'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'docs/delendai/proposals/in-progress/q00038-x.md'),
		'# q00038\n',
	);
	commit(root, 'a.ts');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');
	return root;
};

const publishRef = (root: string): void => {
	git(root, 'push', '-q', 'origin', `refs/heads/${REF}:refs/heads/${REF}`);
	git(root, 'fetch', '-q', 'origin');
};

type IState = (root: string) => void;

const STATES: Readonly<Record<string, IState>> = {
	'at the integration tip': (root) => {
		git(root, 'branch', REF);
		publishRef(root);
	},
	'contained in a moved integration branch': (root) => {
		git(root, 'branch', REF);
		commit(root, 'b.ts');
		git(root, 'push', '-q', 'origin', 'develop');
		publishRef(root);
	},
	'ahead of the integration branch': (root) => {
		git(root, 'checkout', '-q', '-b', REF);
		commit(root, 'own.ts');
		git(root, 'checkout', '-q', 'develop');
		publishRef(root);
	},
	'contained while the local integration branch lags the forge': (root) => {
		git(root, 'branch', REF);
		git(root, 'checkout', '-q', REF);
		commit(root, 'c.ts');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'merge', '-q', '--ff-only', REF);
		git(root, 'push', '-q', 'origin', 'develop');
		publishRef(root);
		// The local branch falls behind: the forge has moved on.
		git(root, 'reset', '-q', '--hard', 'HEAD~1');
	},
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('what the publisher and the maintenance do with one work ref', () => {
	for (const [name, arrange] of Object.entries(STATES)) {
		it(`agree when the ref is ${name}`, async () => {
			const root = repo();
			arrange(root);
			const maintenance = maintainRefNamespace({
				root,
				policy,
				remote: 'origin',
				apply: false,
			}).actions.find((action) => action.ref === REF);
			const publisher = await settleLanded(
				createWriteGitRunner(root),
				policy,
				'origin',
				`refs/heads/${REF}`,
			);
			const maintenanceTakesOff = maintenance?.kind === 'reap';
			const publisherTakesOff = publisher.outcome === 'withdrawn';
			expect(
				publisherTakesOff,
				`publisher: ${JSON.stringify(publisher)}, maintenance: ${JSON.stringify(maintenance)}`,
			).toBe(maintenanceTakesOff);
		});
	}
});
