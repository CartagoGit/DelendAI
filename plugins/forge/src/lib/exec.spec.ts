import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { MissingCliError, runGh } from './exec';

class FakeChild extends EventEmitter {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	kill(): boolean {
		this.emit('close', 1);
		return true;
	}
}

describe('forge exec', async () => {
	it('returns redacted stdout/stderr on success', async () => {
		const spawnFn = () => {
			const child = new FakeChild();
			queueMicrotask(() => {
				child.stdout.write('safe line\n');
				child.stdout.write(
					'ghp_abcdefghijklmnopqrstuvwxyz1234567890\n',
				);
				child.stderr.write('glpat-abcdefghijklmnopqrstuvwxyz\n');
				child.emit('close', 0);
			});
			return child;
		};
		const result = await runGh(['pr', 'list'], {
			spawnFn,
			timeoutMs: 1000,
		});
		expect(result.stdout).toContain('safe line');
		expect(result.stdout).not.toContain('ghp_');
		expect(result.stderr).not.toContain('glpat-');
	});

	it('throws MissingCliError on ENOENT', async () => {
		const spawnFn = () => {
			const child = new FakeChild();
			queueMicrotask(() => {
				const error = new Error(
					'spawn gh ENOENT',
				) as NodeJS.ErrnoException;
				error.code = 'ENOENT';
				child.emit('error', error);
			});
			return child;
		};
		await expect(
			runGh(['pr', 'list'], { spawnFn, timeoutMs: 1000 }),
		).rejects.toBeInstanceOf(MissingCliError);
	});
});
