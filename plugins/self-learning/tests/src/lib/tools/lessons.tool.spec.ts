/**
 * lessons.tool.spec.ts — q00014 S5.
 *
 * What a caller of `self_learning_lessons` is entitled to assume: that
 * the lessons come from the store and nowhere else, that `goal` narrows
 * rather than re-derives, that the evidence is counted and not shipped,
 * and that a `minimumSupport` the caller states is the one applied —
 * which is the knob that decides whether a coincidence is reported as
 * knowledge.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import { buildLessonsToolRegistration } from '../../../../src/lib/tools/lessons.tool';
import { appendObservations } from '../../../../src/lib/store/observation-store.service';
import type { IObservation } from '../../../../src/lib/contracts/interfaces/observation.interface';

interface IToolResult {
	readonly content: readonly { readonly text: string }[];
}

type ToolHandler = (args: Record<string, unknown>) => Promise<IToolResult>;

interface ILessonRow {
	readonly kind: string;
	readonly subject: string;
	readonly claim: string;
	readonly confidence: {
		readonly score: number;
		readonly band: string;
		readonly support: number;
		readonly counterExamples: number;
		readonly recentSupport: number;
	};
	readonly lastSeenMs: number;
	readonly evidenceCount: number;
}

interface ILessonsBody {
	readonly total: number;
	readonly lessons: readonly ILessonRow[];
}

const readText = async (path: string): Promise<string | null> =>
	readFile(path, 'utf8').catch(() => null);

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeStore = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'self-learning-lessons-'));
	dirs.push(dir);
	return join(dir, 'observations.jsonl');
};

const capture = async (
	storePath: string,
): Promise<{ handler: ToolHandler; name: string }> => {
	let handler: ToolHandler | undefined;
	let name = '';
	const server = createFakeToolServer({
		onRegisterTool: (call) => {
			name = call.name;
			handler = call.handler as ToolHandler;
		},
	});
	const registration = buildLessonsToolRegistration({
		namespacePrefix: 'delendai',
		storePathAbs: storePath,
		testJournalPathAbs: join(storePath, '..', 'test-runs.jsonl'),
		readText,
	});
	await registration.register(server);
	if (handler === undefined) {
		throw new Error('the lessons tool registered no handler');
	}
	return { handler, name };
};

/**
 * The payload as a CALLER sees it: parsed back out of the text content,
 * because that is the wire an MCP client reads — not the in-process
 * object the handler happened to build.
 */
const bodyOf = (result: IToolResult): ILessonsBody => {
	const parsed: unknown = JSON.parse(result.content[0]?.text ?? '{}');
	return parsed as ILessonsBody;
};

/** Recent on purpose: recency is half of what makes a lesson score. */
const NOW_MS = Date.now();

const seed = async (
	storePath: string,
	observations: readonly IObservation[],
): Promise<void> => {
	await appendObservations({ filePath: storePath, readText }, observations);
};

const failingCommand = (index: number): IObservation => ({
	kind: 'command-outcome',
	subject: 'bun run verify:external-install',
	outcome: 'fail',
	atMs: NOW_MS - index * 60_000,
	source: 'test-journal',
});

describe('the lessons tool', () => {
	it('publishes one tool under the host namespace', async () => {
		const { name } = await capture(makeStore());
		expect(name).toBe('delendai_lessons');
	});

	it('answers nothing at all from an empty store', async () => {
		const { handler } = await capture(makeStore());

		const body = bodyOf(await handler({}));

		expect(body.total).toBe(0);
		expect(body.lessons).toEqual([]);
	});

	it('derives a lesson once the store supports it, with its evidence counted', async () => {
		const storePath = makeStore();
		await seed(storePath, [
			failingCommand(0),
			failingCommand(1),
			failingCommand(2),
		]);
		const { handler } = await capture(storePath);

		const body = bodyOf(await handler({}));

		expect(body.total).toBe(1);
		const lesson = body.lessons[0];
		expect(lesson?.kind).toBe('command-reliability');
		expect(lesson?.subject).toBe('bun run verify:external-install');
		expect(lesson?.confidence.support).toBe(3);
		expect(lesson?.confidence.counterExamples).toBe(0);
		expect(lesson?.confidence.score).toBeGreaterThan(0);
		// The evidence is COUNTED, never returned: it is what makes the
		// claim checkable and also the part that grows without bound.
		expect(lesson?.evidenceCount).toBe(3);
		expect(lesson).not.toHaveProperty('evidence');
	});

	it('reports nothing when a pattern has too little support', async () => {
		const storePath = makeStore();
		await seed(storePath, [failingCommand(0), failingCommand(1)]);
		const { handler } = await capture(storePath);

		expect(bodyOf(await handler({})).total).toBe(0);
		// ...and the caller may lower the bar deliberately, which is the
		// only way two sightings ever become a claim.
		expect(bodyOf(await handler({ minimumSupport: 2 })).total).toBe(1);
	});

	it('narrows to what bears on a stated goal', async () => {
		const storePath = makeStore();
		await seed(storePath, [
			failingCommand(0),
			failingCommand(1),
			failingCommand(2),
			...[0, 1, 2].map(
				(index): IObservation => ({
					kind: 'test-failure',
					subject: 'the catalog > pins the swarm row',
					outcome: 'fail',
					atMs: NOW_MS - index * 60_000,
					source: 'test-journal',
				}),
			),
		]);
		const { handler } = await capture(storePath);

		expect(bodyOf(await handler({})).total).toBe(2);

		const matched = bodyOf(await handler({ goal: 'the catalog' }));
		expect(matched.total).toBe(1);
		expect(matched.lessons[0]?.kind).toBe('fragile-test');
	});

	it('caps what it returns without lying about the total', async () => {
		const storePath = makeStore();
		await seed(
			storePath,
			[0, 1, 2, 3, 4, 5].flatMap((subjectIndex) =>
				[0, 1, 2].map(
					(index): IObservation => ({
						kind: 'refusal',
						subject: `refusal-${String(subjectIndex)}`,
						outcome: 'fail',
						atMs: NOW_MS - index * 60_000,
						source: 'test-journal',
					}),
				),
			),
		);
		const { handler } = await capture(storePath);

		const body = bodyOf(await handler({ limit: 2 }));

		expect(body.total).toBe(6);
		expect(body.lessons).toHaveLength(2);
		expect(
			body.lessons.every((lesson) => lesson.kind === 'recurring-refusal'),
		).toBe(true);
	});
});
