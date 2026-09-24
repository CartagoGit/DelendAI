/**
 * elide-tool-result.spec.ts — f00536 S2: a tool result over its cap comes
 * back elided, says so, and names where the whole of it was kept.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	configureToolOutputArtifacts,
	keepFullToolOutput,
} from '../../../../src/lib/context-budget/elide-tool-result';
import { toolJsonBounded } from '../../../../src/lib/shared/tool-response';

const dirs: string[] = [];
afterEach(() => {
	configureToolOutputArtifacts(undefined);
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const artefactDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'tool-output-'));
	dirs.push(dir);
	return dir;
};

const bodyOf = (result: ReturnType<typeof toolJsonBounded>) =>
	JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

const bigLog = {
	job: 'tests: core 1/2',
	lines: Array.from(
		{ length: 2_000 },
		(_, i) => `line ${String(i)} of the log`,
	),
};

describe('an elided tool result stays addressable', () => {
	it('states the elision and names the file holding the whole output', () => {
		configureToolOutputArtifacts(artefactDir());
		const body = bodyOf(toolJsonBounded(bigLog, 4_096));
		expect(body.__truncated).toBe(true);
		expect(body.originalBytes).toBeGreaterThan(4_096);
		expect(typeof body.artifact).toBe('string');
		expect(JSON.parse(readFileSync(String(body.artifact), 'utf8'))).toEqual(
			bigLog,
		);
	});

	it('stays inside the cap with the path included', () => {
		configureToolOutputArtifacts(artefactDir());
		const text = toolJsonBounded(bigLog, 4_096).content[0]?.text ?? '';
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

	it('is still a stated elision where no directory is kept', () => {
		const body = bodyOf(toolJsonBounded(bigLog, 4_096));
		expect(body.__truncated).toBe(true);
		expect(body.artifact).toBeUndefined();
	});

	it('leaves a result under the cap untouched and keeps nothing', () => {
		const dir = artefactDir();
		configureToolOutputArtifacts(dir);
		expect(bodyOf(toolJsonBounded({ ok: true }, 4_096))).toEqual({
			ok: true,
		});
		expect(keepFullToolOutput).toBeDefined();
	});

	it('never fails the tool when the output cannot be kept', () => {
		// A directory whose parent is a file cannot be created.
		const blocker = join(artefactDir(), 'a-file');
		writeFileSync(blocker, 'not a directory');
		configureToolOutputArtifacts(join(blocker, 'tool-output'));
		const body = bodyOf(toolJsonBounded(bigLog, 4_096));
		expect(body.__truncated).toBe(true);
		expect(body.artifact).toBeUndefined();
	});
});
