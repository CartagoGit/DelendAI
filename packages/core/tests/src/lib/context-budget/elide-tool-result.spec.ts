/**
 * elide-tool-result.spec.ts — f00536 S2: a tool result over its cap comes
 * back elided, says so, and names where the whole of it was kept — a
 * path that exists by the time the result leaves the handler wrapper.
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	configureToolOutputArtifacts,
	keepFullToolOutput,
	settleToolOutputArtifacts,
} from '../../../../src/lib/context-budget/elide-tool-result.service';
import { toolJsonBounded } from '../../../../src/lib/shared/tool-response';

const dirs: string[] = [];
afterEach(async () => {
	await settleToolOutputArtifacts(undefined);
	configureToolOutputArtifacts(undefined);
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const artefactDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'tool-output-'));
	dirs.push(dir);
	return dir;
};

/** What the caller receives: the result after the wrapper settled it. */
const delivered = async (value: unknown, maxBytes: number) => {
	const result = await settleToolOutputArtifacts(
		toolJsonBounded(value, maxBytes),
	);
	return {
		text: result.content[0]?.text ?? '',
		body: JSON.parse(result.content[0]?.text ?? '{}') as Record<
			string,
			unknown
		>,
	};
};

const bigLog = {
	job: 'tests: core 1/2',
	lines: Array.from(
		{ length: 2_000 },
		(_, i) => `line ${String(i)} of the log`,
	),
};

describe('an elided tool result stays addressable', () => {
	it('states the elision and names the file holding the whole output', async () => {
		configureToolOutputArtifacts(artefactDir());
		const { body } = await delivered(bigLog, 4_096);
		expect(body.__truncated).toBe(true);
		expect(body.originalBytes).toBeGreaterThan(4_096);
		expect(JSON.parse(readFileSync(String(body.artifact), 'utf8'))).toEqual(
			bigLog,
		);
	});

	it('stays inside the cap with the path included', async () => {
		configureToolOutputArtifacts(artefactDir());
		const { text } = await delivered(bigLog, 4_096);
		expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(4_096);
	});

	it('keeps each output once, under its content hash', () => {
		configureToolOutputArtifacts(artefactDir());
		expect(keepFullToolOutput('{"a":1}')).toBe(
			keepFullToolOutput('{"a":1}'),
		);
		expect(keepFullToolOutput('{"a":1}')).not.toBe(
			keepFullToolOutput('{"a":2}'),
		);
	});

	it('is still a stated elision where no directory is kept', async () => {
		const { body } = await delivered(bigLog, 4_096);
		expect(body.__truncated).toBe(true);
		expect(body.artifact).toBeUndefined();
	});

	it('leaves a result under the cap untouched', async () => {
		configureToolOutputArtifacts(artefactDir());
		expect((await delivered({ ok: true }, 4_096)).body).toEqual({
			ok: true,
		});
	});

	it('takes the path back out when the output could not be written, and does not fail', async () => {
		// A directory whose parent is a file cannot be created.
		const blocker = join(artefactDir(), 'a-file');
		writeFileSync(blocker, 'not a directory');
		configureToolOutputArtifacts(join(blocker, 'tool-output'));
		const { body } = await delivered(bigLog, 4_096);
		expect(body.__truncated).toBe(true);
		expect(body.artifact).toBeUndefined();
	});

	it('finishes the write before the result is delivered', async () => {
		configureToolOutputArtifacts(artefactDir());
		const result = toolJsonBounded(bigLog, 4_096);
		const path = String(
			(
				JSON.parse(result.content[0]?.text ?? '{}') as {
					artifact?: string;
				}
			).artifact,
		);
		await settleToolOutputArtifacts(result);
		expect(existsSync(path)).toBe(true);
	});
});
