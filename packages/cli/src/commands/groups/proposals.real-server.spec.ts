/**
 * proposals.real-server.spec.ts — the lifecycle commands a CLI-only agent
 * relies on, against a REAL spawned server.
 *
 * The group specs next to this one stub `ctx.request`, so they prove the
 * flags map to the right tool arguments and nothing about what the tool
 * does with them. What an agent driving only the CLI needs is that
 * `close-slice` and `transition` land where its unit is, and not in the
 * shared checkout — and that is a property of the server, the work
 * profile and the working tree together.
 *
 * Every call spawns the real CLI (`bun packages/cli/src/index.ts`), which
 * spawns the real server, in a throwaway repository with a shared
 * checkout on `develop` and a unit worktree on a work ref. Both profiles
 * that keep work off the integration branch are run.
 */
import { execFile, execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, '../../../../..');
const CLI = join(REPOSITORY, 'packages/cli/src/index.ts');

const PROPOSAL = 'x00001';
const AGENT = 'claude-sonnet-5-5';
const UNIT_BRANCH = `wip/${AGENT}/implement/${PROPOSAL}-S1-g1/the-topic`;
const PROPOSAL_FILE = `docs/delendai/proposals/in-progress/fixes/${PROPOSAL}-demo.md`;

const PROPOSAL_TEXT = `---
id: ${PROPOSAL}
title: "Demo"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-01
---

# ${PROPOSAL} — Demo

## Goal

Exercise the lifecycle commands.

## Slices

- global_gate: none

### S1 — one
- **Status**: pending
- **Files**: \`src/a.ts\`
- **Gate**: none

### S2 — two
- **Status**: pending
- **Files**: \`src/b.ts\`
- **Gate**: none

## acceptance

- the slice closes
`;

const PROFILES = {
	'shared-checkout-pr': {
		profile: 'shared-checkout-pr',
		branches: { integration: 'develop' },
		integration: { requiredChecks: ['ci'] },
	},
	'shared-checkout-merge': {
		profile: 'shared-checkout-merge',
		branches: { integration: 'develop' },
	},
} as const;

type IProfile = keyof typeof PROFILES;

interface IFixture {
	/** The shared checkout, on `develop`. */
	readonly shared: string;
	/** A worktree on the unit's work ref. */
	readonly unit: string;
}

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

const fixture = (profile: IProfile, requirePeerReview = false): IFixture => {
	const root = mkdtempSync(join(tmpdir(), 'cli-real-server-'));
	roots.push(root);
	const shared = join(root, 'shared');
	const unit = join(root, 'unit');
	mkdirSync(join(shared, dirname(PROPOSAL_FILE)), { recursive: true });
	mkdirSync(join(shared, 'src'));
	writeFileSync(join(shared, PROPOSAL_FILE), PROPOSAL_TEXT);
	writeFileSync(join(shared, 'src/a.ts'), 'export const a = 1;\n');
	writeFileSync(join(shared, 'src/b.ts'), 'export const b = 1;\n');
	writeFileSync(join(shared, '.gitignore'), 'node_modules\n.cache\n');
	writeFileSync(
		join(shared, 'delendai.config.json'),
		JSON.stringify({
			development: PROFILES[profile],
			plugins: { proposals: { options: { requirePeerReview } } },
		}),
	);
	git(shared, 'init', '-q', '-b', 'develop');
	git(shared, 'config', 'user.email', 'author@example.com');
	git(shared, 'config', 'user.name', 'Author');
	git(shared, 'config', 'commit.gpgsign', 'false');
	git(shared, 'add', '-A');
	git(shared, 'commit', '-q', '--no-verify', '-m', 'base');
	git(shared, 'worktree', 'add', '-q', '-b', UNIT_BRANCH, unit);
	// The server imports its plugins from the repository's own modules.
	for (const checkout of [shared, unit]) {
		symlinkSync(
			join(REPOSITORY, 'node_modules'),
			join(checkout, 'node_modules'),
		);
	}
	return { shared, unit };
};

/** The unit's work, committed on its ref: what a hand-off to review needs. */
const deliver = (unit: string): void => {
	writeFileSync(join(unit, 'src/a.ts'), 'export const a = 2;\n');
	writeFileSync(join(unit, 'src/b.ts'), 'export const b = 2;\n');
	git(unit, 'add', '-A');
	git(unit, 'commit', '-q', '--no-verify', '-m', 'the work');
};

/**
 * One CLI call against a real server rooted at `workspace`. The caller
 * is a person at a terminal: no agent marker, so the guards that treat an
 * agent differently do not fire.
 */
const cli = async (
	workspace: string,
	...args: string[]
): Promise<{
	readonly code: number;
	readonly out: Record<string, unknown>;
	readonly raw: string;
}> => {
	// Nobody declares who is working: what the CLI knows of the agent
	// comes from the flag or from the unit's ref, which is what is proved.
	const environment = { ...process.env };
	delete environment.DELENDAI_AGENT_ID;
	delete environment.CLAUDECODE;
	delete environment.AI_AGENT;
	try {
		const { stdout } = await run(
			'bun',
			[CLI, ...args, '--json', `--workspace=${workspace}`],
			{ cwd: workspace, env: environment, timeout: 90_000 },
		);
		return { code: 0, out: JSON.parse(stdout), raw: stdout };
	} catch (error) {
		const failure = error as {
			readonly code?: number;
			readonly stdout?: string;
			readonly stderr?: string;
		};
		const raw = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
		return {
			code: typeof failure.code === 'number' ? failure.code : 1,
			out: parseOrEmpty(failure.stdout ?? ''),
			raw,
		};
	}
};

const parseOrEmpty = (text: string): Record<string, unknown> => {
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return {};
	}
};

/** The proposal's file in a checkout, wherever its status keeps it. */
const proposalIn = (checkout: string): string => {
	const file = readdirSync(join(checkout, 'docs/delendai/proposals'), {
		recursive: true,
		encoding: 'utf8',
	}).find((entry) => entry.endsWith(`${PROPOSAL}-demo.md`));
	if (file === undefined) return '';
	return readFileSync(
		join(checkout, 'docs/delendai/proposals', file),
		'utf8',
	);
};

const sliceStatusIn = (checkout: string, slice = 'S1'): string =>
	new RegExp(`### ${slice} [^]*?\\*\\*Status\\*\\*: (\\S+)`, 'u').exec(
		proposalIn(checkout),
	)?.[1] ?? 'missing';

const proposalStatusIn = (checkout: string): string =>
	/^status: (\S+)$/mu.exec(proposalIn(checkout))?.[1] ?? 'missing';

describe.each(Object.keys(PROFILES) as IProfile[])(
	'the proposals CLI against a real server under %s',
	(profile) => {
		it('close-slice from the unit worktree closes it there and leaves the shared checkout alone', async () => {
			const { shared, unit } = fixture(profile);
			await cli(unit, 'proposals', 'sync');

			const closed = await cli(
				unit,
				'proposals',
				'close-slice',
				PROPOSAL,
				'S1',
			);

			expect(closed.raw).toContain('"closed": true');
			expect(sliceStatusIn(unit)).toBe('done');
			expect(sliceStatusIn(shared)).toBe('pending');
		}, 180_000);

		it('close-slice from the shared checkout binds to the live unit that carries the proposal', async () => {
			const { shared, unit } = fixture(profile);
			await cli(unit, 'proposals', 'sync');

			const closed = await cli(
				shared,
				'proposals',
				'close-slice',
				PROPOSAL,
				'S1',
			);

			expect(closed.raw).toContain('"closed": true');
			expect(sliceStatusIn(unit)).toBe('done');
			expect(sliceStatusIn(shared)).toBe('pending');
		}, 180_000);

		it('keeps a claim made by delegate or continue after the CLI process that made it has exited', async () => {
			const { unit } = fixture(profile);
			await cli(unit, 'proposals', 'sync');

			const delegated = await cli(
				unit,
				'proposals',
				'delegate',
				'task-one',
				'--slot=implementation_runner',
				'--files=src/a.ts',
			);
			const claimed = await cli(
				unit,
				'proposals',
				'continue',
				PROPOSAL,
				'--mode=claim',
				'--slice=S2',
				`--agent=${AGENT}`,
			);
			// A later process: the claims were made by processes now gone.
			const status = await cli(
				unit,
				'proposals',
				'lock',
				'--action=status',
			);

			expect(delegated.raw).toContain('"locked": true');
			expect(claimed.raw).toContain('slice-claim');
			expect(status.raw).toContain('task-one');
			expect(status.raw).toContain(`${PROPOSAL}-S2`);
		}, 180_000);

		it('transition to review from the unit takes the agent from its ref and opens the round there', async () => {
			const { shared, unit } = fixture(profile, true);
			await cli(unit, 'proposals', 'sync');
			deliver(unit);

			// No --agent and no environment: the unit's ref names the agent.
			const moved = await cli(
				unit,
				'proposals',
				'transition',
				PROPOSAL,
				'review',
				'--reason=ready for review',
			);

			expect(moved.raw).toContain('"ok": true');
			expect(proposalStatusIn(unit)).toBe('review');
			const queue = await cli(
				unit,
				'proposals',
				'review-queue',
				`--proposal=${PROPOSAL}`,
				'--detail',
			);
			expect(queue.raw).toContain(`"implementer": "${AGENT}"`);
			expect(queue.raw).toContain('"implementerSource": "round"');
			expect(proposalStatusIn(shared)).toBe('in-progress');
			expect(sliceStatusIn(shared)).toBe('pending');
		}, 180_000);

		it('transition from the shared checkout binds to the unit and writes nothing in the shared tree', async () => {
			const { shared, unit } = fixture(profile, true);
			await cli(unit, 'proposals', 'sync');
			deliver(unit);

			const moved = await cli(
				shared,
				'proposals',
				'transition',
				PROPOSAL,
				'review',
				`--agent=${AGENT}`,
				'--reason=ready for review',
			);

			expect(moved.raw).toContain('"ok": true');
			expect(proposalStatusIn(unit)).toBe('review');
			const queue = await cli(
				unit,
				'proposals',
				'review-queue',
				`--proposal=${PROPOSAL}`,
				'--detail',
			);
			expect(queue.raw).toContain('"implementerSource": "round"');
			expect(proposalStatusIn(shared)).toBe('in-progress');
			expect(
				execFileSync('git', ['status', '--short'], {
					cwd: shared,
					encoding: 'utf8',
				}).trim(),
			).toBe('');
		}, 180_000);

		it('refuses a hand-off to review that names nobody, rather than opening no round', async () => {
			const { shared, unit } = fixture(profile, true);
			await cli(unit, 'proposals', 'sync');
			deliver(unit);

			// The shared checkout is on `develop`: no unit, so no agent to derive.
			const refused = await cli(
				shared,
				'proposals',
				'transition',
				PROPOSAL,
				'review',
				'--reason=ready for review',
			);

			expect(refused.code).not.toBe(0);
			expect(proposalStatusIn(unit)).toBe('in-progress');
		}, 180_000);
	},
);
