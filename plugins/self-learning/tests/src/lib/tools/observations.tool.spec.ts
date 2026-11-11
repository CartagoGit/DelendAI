/**
 * observations.tool.spec.ts — q00014 S4.
 *
 * The tool is the only way an agent ever touches the store, so the
 * properties worth pinning are the ones a caller depends on and cannot
 * see: that `collect` is what folds the journal in (and that a second
 * collect does not double-count), that a read without it answers from
 * what is already there, and that the filters are applied by the store
 * rather than by the caller.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import { buildObservationsToolRegistration } from '../../../../src/lib/tools/observations.tool';
import { appendObservations } from '../../../../src/lib/store/observation-store.service';
import type { IObservation } from '../../../../src/lib/contracts/interfaces/observation.interface';

interface IToolResult {
	readonly content: readonly { readonly text: string }[];
}

type ToolHandler = (args: Record<string, unknown>) => Promise<IToolResult>;

interface IObservationsBody {
	readonly collected: number;
	readonly skipped: number;
	readonly total: number;
	readonly observations: readonly IObservation[];
}

/** A spec may touch the filesystem; the plugin reads through the host. */
const readText = async (path: string): Promise<string | null> =>
	readFile(path, 'utf8').catch(() => null);

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeWorkspace = (): { storePath: string; journalPath: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'self-learning-tool-'));
	dirs.push(dir);
	return {
		storePath: join(dir, 'observations.jsonl'),
		journalPath: join(dir, 'test-runs.jsonl'),
	};
};

/** Register against a fake server and capture the handler it publishes. */
const capture = async (paths: {
	storePath: string;
	journalPath: string;
}): Promise<{ handler: ToolHandler; name: string }> => {
	let handler: ToolHandler | undefined;
	let name = '';
	const server = createFakeToolServer({
		onRegisterTool: (call) => {
			name = call.name;
			handler = call.handler as ToolHandler;
		},
	});
	const registration = buildObservationsToolRegistration({
		namespacePrefix: 'delendai',
		storePathAbs: paths.storePath,
		testJournalPathAbs: paths.journalPath,
		readText,
	});
	await registration.register(server);
	if (handler === undefined) {
		throw new Error('the observations tool registered no handler');
	}
	return { handler, name };
};

/**
 * The payload as a CALLER sees it: parsed back out of the text content,
 * because that is the wire an MCP client reads — not the in-process
 * object the handler happened to build.
 */
const bodyOf = (result: IToolResult): IObservationsBody => {
	const parsed: unknown = JSON.parse(result.content[0]?.text ?? '{}');
	return parsed as IObservationsBody;
};

const journalLine = (entry: Record<string, unknown>): string =>
	`${JSON.stringify(entry)}\n`;

describe('the observations tool', () => {
	it('publishes one tool under the host namespace', async () => {
		const { name } = await capture(makeWorkspace());
		expect(name).toBe('delendai_observations');
	});

	it('answers from the store without collecting when not asked to', async () => {
		const paths = makeWorkspace();
		writeFileSync(
			paths.journalPath,
			journalLine({
				timestamp: '2026-09-01T10:00:00.000Z',
				result: 'pass',
				command: 'bun run test',
			}),
			'utf8',
		);
		const { handler } = await capture(paths);

		const body = bodyOf(await handler({}));

		// The journal is on disk and says something; a plain read is still
		// allowed to answer "nothing yet", because collecting is a write.
		expect(body.collected).toBe(0);
		expect(body.total).toBe(0);
	});

	it('folds the journal in on collect and does not count it twice', async () => {
		const paths = makeWorkspace();
		writeFileSync(
			paths.journalPath,
			[
				journalLine({
					timestamp: '2026-09-01T10:00:00.000Z',
					result: 'fail',
					command: 'bun run test',
					failures: [
						{
							file: 'packages/core/tests/a.spec.ts',
							fullName: 'a > fails',
							kind: 'assertion',
						},
					],
				}),
				journalLine({
					timestamp: '2026-09-01T11:00:00.000Z',
					result: 'pass',
					command: 'bun run test',
				}),
			].join(''),
			'utf8',
		);
		const { handler } = await capture(paths);

		const first = bodyOf(await handler({ collect: true }));
		expect(first.collected).toBe(3);
		expect(first.total).toBe(3);

		const second = bodyOf(await handler({ collect: true }));
		// Same journal, same observations: the store recognises them and
		// the count an agent reads does not inflate every time it asks.
		expect(second.collected).toBe(0);
		expect(second.skipped).toBe(3);
		expect(second.total).toBe(3);
	});

	it('filters by kind, by subject and by time', async () => {
		const paths = makeWorkspace();
		const base: IObservation = {
			kind: 'command-outcome',
			subject: 'bun run test',
			outcome: 'ok',
			atMs: 1_700_000_000_000,
			source: 'test-journal',
		};
		await appendObservations({ filePath: paths.storePath, readText }, [
			base,
			{ ...base, atMs: base.atMs + 1_000 },
			{
				...base,
				kind: 'test-failure',
				subject: 'a > fails',
				outcome: 'fail',
				atMs: base.atMs + 2_000,
			},
		]);
		const { handler } = await capture(paths);

		const failures = bodyOf(await handler({ kind: 'test-failure' }));
		expect(failures.total).toBe(1);
		expect(failures.observations[0]?.subject).toBe('a > fails');

		const bySubject = bodyOf(await handler({ subject: 'bun run test' }));
		expect(bySubject.total).toBe(2);

		const recent = bodyOf(await handler({ sinceMs: base.atMs + 1_500 }));
		expect(recent.total).toBe(1);
		expect(recent.observations[0]?.kind).toBe('test-failure');
	});

	it('honours an explicit limit', async () => {
		const paths = makeWorkspace();
		const many: IObservation[] = Array.from({ length: 5 }, (_, index) => ({
			kind: 'command-outcome',
			subject: `command ${String(index)}`,
			outcome: 'ok',
			atMs: 1_700_000_000_000 + index,
			source: 'test-journal',
		}));
		await appendObservations({ filePath: paths.storePath, readText }, many);
		const { handler } = await capture(paths);

		const body = bodyOf(await handler({ limit: 2 }));
		expect(body.total).toBe(2);
	});

	it('treats an absent journal as a project that has not run tests yet', async () => {
		const paths = makeWorkspace();
		const { handler } = await capture(paths);

		const body = bodyOf(await handler({ collect: true }));

		expect(body.collected).toBe(0);
		expect(body.total).toBe(0);
	});
});
