/**
 * The real host entry, booted in a throwaway project whose only remote is a
 * local bare repository reached through git's own ssh transport.
 *
 * The startup reconciler's specs inject fakes for the forge and the
 * journal; this one asserts what a user's boot does: the host binds a
 * collaborator for both phases (the boot report names none as NOT
 * EXECUTED), the first boot publishes the coordination journal to its
 * ref, and a second machine's first boot replays it.
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUPERVISED_ENV } from './host-supervisor-process';

const BOOT_TIMEOUT_MS = 120_000;
const HOST_ENTRY = join(import.meta.dirname, 'host-server.script.ts');
const REMOTE_URL = 'ssh://git@localhost/acme/widgets.git';
const JOURNAL_REF = 'refs/delendai/journal';
const GATE_LINE = /Phases NOT EXECUTED \(no collaborator bound[^)]*\): (.*)/u;

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, GIT_SSH_COMMAND: join(cwd, '..', 'fakessh') },
	}).trim();

interface IBoot {
	readonly stderr: string;
	readonly notExecuted: string;
}

describe('the real host boot with a journal remote', () => {
	let root: string;
	let bare: string;

	/** Boots the host in `project` and stops it once the gate has spoken. */
	const boot = (project: string): Promise<IBoot> =>
		new Promise((resolve, reject) => {
			const child = spawn(
				'bun',
				[HOST_ENTRY, `--workspace=${project}`, '--preset=minimal'],
				{
					env: {
						...process.env,
						[SUPERVISED_ENV]: '1',
						GIT_SSH_COMMAND: join(root, 'fakessh'),
						DELENDAI_HYDRATION_INTERVAL_MS: '0',
						DELENDAI_CANDIDATE_REFRESH_INTERVAL_MS: '0',
						CLAUDECODE: '',
						AI_AGENT: '',
						DELENDAI_AGENT_ID: '',
					},
					stdio: ['pipe', 'ignore', 'pipe'],
				},
			);
			let stderr = '';
			let stopping = false;
			child.on('error', reject);
			child.stderr.on('data', (chunk: Buffer) => {
				stderr += chunk.toString();
				const gate = GATE_LINE.exec(stderr);
				// The gate prints before the server starts serving; the host
				// is done being booted once its line is out.
				if (gate !== null && stderr.endsWith('\n') && !stopping) {
					stopping = true;
					child.once('exit', () =>
						resolve({ stderr, notExecuted: gate[1] ?? '' }),
					);
					child.kill('SIGTERM');
				}
			});
			child.on('exit', () =>
				stopping
					? undefined
					: reject(new Error(`host exited early:\n${stderr}`)),
			);
		});

	const clone = (name: string): string => {
		const target = join(root, name);
		execFileSync(
			'git',
			['clone', '-q', '-b', 'develop', REMOTE_URL, target],
			{
				env: { ...process.env, GIT_SSH_COMMAND: join(root, 'fakessh') },
			},
		);
		git(target, 'config', 'user.name', 't');
		git(target, 'config', 'user.email', 't@t');
		return target;
	};

	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), 'host-boot-journal-'));
		bare = join(root, 'srv', 'acme', 'widgets.git');
		execFileSync('git', ['init', '-q', '--bare', bare]);
		// git's ssh transport, answered by the local bare repository.
		writeFileSync(
			join(root, 'fakessh'),
			[
				'#!/bin/sh',
				'for last; do :; done',
				`exec sh -c "$(printf '%s' "$last" | sed "s#'/#'${root}/srv/#")"`,
				'',
			].join('\n'),
		);
		chmodSync(join(root, 'fakessh'), 0o755);
		const seed = join(root, 'seed');
		execFileSync('git', ['init', '-q', '-b', 'develop', seed]);
		git(seed, 'config', 'user.name', 't');
		git(seed, 'config', 'user.email', 't@t');
		execFileSync('mkdir', ['-p', join(seed, 'docs', 'delendai')]);
		writeFileSync(join(seed, 'delendai.config.json'), '{}\n');
		writeFileSync(join(seed, 'README.md'), 'seed\n');
		git(seed, 'add', '-A');
		git(seed, 'commit', '-q', '-m', 'init');
		git(seed, 'remote', 'add', 'origin', REMOTE_URL);
		git(seed, 'push', '-q', 'origin', 'develop');
	});

	afterAll(() => rmSync(root, { recursive: true, force: true }));

	it(
		'binds a forge and a journal collaborator, and publishes the journal to its ref',
		async () => {
			const first = await boot(clone('machine-one'));
			expect(first.notExecuted).toBe('none');
			const published = execFileSync(
				'git',
				['show', `${JOURNAL_REF}:journal.ndjson`],
				{ cwd: bare, encoding: 'utf8' },
			);
			const events = published
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line) as { eventKind: string });
			expect(events.map((event) => event.eventKind)).toContain(
				'reconciliation-outcome',
			);
		},
		BOOT_TIMEOUT_MS,
	);

	it(
		'lets a second machine replay what the first published, once',
		async () => {
			const published = (): { occurredAt: number }[] =>
				execFileSync('git', ['show', `${JOURNAL_REF}:journal.ndjson`], {
					cwd: bare,
					encoding: 'utf8',
				})
					.trim()
					.split('\n')
					.map((line) => JSON.parse(line) as { occurredAt: number });
			const byFirst = published().map((event) => event.occurredAt);
			const project = clone('machine-two');
			const second = await boot(project);
			expect(second.notExecuted).toBe('none');
			const rows = execFileSync(
				'bun',
				[
					'-e',
					`import { Database } from 'bun:sqlite';
const db = new Database(${JSON.stringify(
						join(project, '.cache/delendai/state/proposals.sqlite'),
					)}, { readonly: true });
console.log(JSON.stringify(db.query('SELECT occurred_at AS at FROM coordination_journal').all()));`,
				],
				{ encoding: 'utf8' },
			);
			const held = (JSON.parse(rows.trim()) as { at: number }[]).map(
				(row) => row.at,
			);
			// Everything machine one published is in machine two's database
			// exactly once, and what machine two added went back to the ref.
			for (const at of byFirst)
				expect(held.filter((seen) => seen === at)).toHaveLength(1);
			expect(new Set(held).size).toBe(held.length);
			expect(
				published()
					.map((event) => event.occurredAt)
					.sort(),
			).toEqual([...held].sort());
		},
		BOOT_TIMEOUT_MS,
	);
});
