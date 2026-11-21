import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
	diffSnapshots,
	fingerprintInputs,
} from './generated-determinism.script';

describe('generated-determinism', () => {
	it('reports an artifact whose digest moved between two runs', () => {
		// Nothing changed in the repository between the runs, so a
		// difference can only come from the generator itself.
		const unstable = diffSnapshots(
			new Map([
				['packages/core/AGENT.md', 'aaa'],
				['packages/cli/AGENT.md', 'bbb'],
			]),
			new Map([
				['packages/core/AGENT.md', 'zzz'],
				['packages/cli/AGENT.md', 'bbb'],
			]),
		);
		expect(unstable).toEqual([
			{
				path: 'packages/core/AGENT.md',
				firstDigest: 'aaa',
				secondDigest: 'zzz',
			},
		]);
	});

	it('says nothing when both runs agree', () => {
		const snapshot = new Map([['a', 'x']]);
		expect(diffSnapshots(snapshot, snapshot)).toEqual([]);
	});

	it('treats an artifact that vanished on the second run as unstable', () => {
		// A generator that produced a file once and not again is not
		// deterministic either, so absence is a difference rather than
		// something to skip.
		const unstable = diffSnapshots(new Map([['a', 'x']]), new Map());
		expect(unstable).toEqual([
			{ path: 'a', firstDigest: 'x', secondDigest: 'absent' },
		]);
	});
});

describe('generated-determinism input fingerprint', () => {
	it('moves when a tracked file is edited, and holds still otherwise', async () => {
		// The gate's whole "the generator is broken" verdict rests on
		// the premise that nothing else moved. On 2026-09-03 that
		// premise was false the first time the gate fired — a
		// concurrent agent edited a plugin's output schema, so the
		// measured bytes in TOKEN-BUDGETS.md changed for a perfectly
		// legitimate reason and the gate blamed the generator. The
		// fingerprint is what lets it tell those two worlds apart.
		const repo = await mkdtemp(join(tmpdir(), 'gen-determinism-'));
		try {
			const run = promisify(execFile);
			await run('git', ['init', '-q', '-b', 'main'], { cwd: repo });
			await writeFile(join(repo, 'src.ts'), 'export const a = 1;\n');
			await writeFile(join(repo, 'OUT.md'), 'generated\n');
			await run('git', ['add', '.'], { cwd: repo });

			const artifacts = new Set(['OUT.md']);
			const before = await fingerprintInputs(repo, artifacts);
			expect(await fingerprintInputs(repo, artifacts)).toBe(before);

			// Regenerating the artifact must NOT read as input movement,
			// or every run would be inconclusive and the gate would
			// never say anything at all.
			await writeFile(join(repo, 'OUT.md'), 'generated again\n');
			expect(await fingerprintInputs(repo, artifacts)).toBe(before);

			// A real source edit must move it.
			await writeFile(join(repo, 'src.ts'), 'export const a = 2222;\n');
			expect(await fingerprintInputs(repo, artifacts)).not.toBe(before);
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
