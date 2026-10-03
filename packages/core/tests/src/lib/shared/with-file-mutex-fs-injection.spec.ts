/**
 * with-file-mutex-fs-injection.spec.ts
 *
 * The remaining uncovered branches in `with-file-mutex.ts` are all races
 * against another process: the sidecar disappearing between calls, a
 * competitor recreating it mid-reclaim, or a filesystem operation on the
 * cleanup path failing for a reason that must not surface as an
 * acquisition failure. None of these reproduce reliably from a single
 * process without help, so — following `with-file-mutex-errno.spec.ts`'s
 * lead — this file mocks `node:fs/promises` to inject exactly one failure
 * (or count calls) at the precise call site under test, leaving every
 * other call to pass straight through to the real filesystem.
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitUntil } from '@delendai/test-kit';

interface IInjectionState {
	openWxFailAt: number;
	openWxFailCode: string;
	openWxCallCount: number;
	openRPlusFailCode: string | undefined;
	openRPlusCallCount: number;
	readFileFailOnce: boolean;
	renameRestoreFailOnce: boolean;
	rmMarkerFailOnce: boolean;
	rmReclaimCopyFailOnce: boolean;
	rmExactPathToFail: string | undefined;
}

const state = vi.hoisted(
	(): IInjectionState => ({
		openWxFailAt: 0,
		openWxFailCode: '',
		openWxCallCount: 0,
		openRPlusFailCode: undefined,
		openRPlusCallCount: 0,
		readFileFailOnce: false,
		renameRestoreFailOnce: false,
		rmMarkerFailOnce: false,
		rmReclaimCopyFailOnce: false,
		rmExactPathToFail: undefined,
	}),
);

const makeErrnoError = (
	code: string,
	message: string,
): NodeJS.ErrnoException => {
	const error = new Error(message) as NodeJS.ErrnoException;
	error.code = code;
	return error;
};

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return {
		...actual,
		open: vi.fn(
			async (
				path: Parameters<typeof actual.open>[0],
				flags?: Parameters<typeof actual.open>[1],
				mode?: Parameters<typeof actual.open>[2],
			) => {
				if (flags === 'wx') {
					state.openWxCallCount += 1;
					if (state.openWxCallCount === state.openWxFailAt) {
						throw makeErrnoError(
							state.openWxFailCode,
							`open 'wx' failed (injected, call #${String(state.openWxCallCount)})`,
						);
					}
				}
				if (flags === 'r+') {
					state.openRPlusCallCount += 1;
					if (state.openRPlusFailCode !== undefined) {
						throw makeErrnoError(
							state.openRPlusFailCode,
							"open 'r+' failed (injected heartbeat reopen)",
						);
					}
				}
				return actual.open(path, flags, mode);
			},
		),
		readFile: vi.fn(
			async (
				path: Parameters<typeof actual.readFile>[0],
				options: BufferEncoding,
			) => {
				if (state.readFileFailOnce) {
					state.readFileFailOnce = false;
					throw makeErrnoError(
						'EACCES',
						'readFile failed (injected lease observation)',
					);
				}
				return actual.readFile(path, options);
			},
		),
		rename: vi.fn(
			async (
				src: Parameters<typeof actual.rename>[0],
				dest: Parameters<typeof actual.rename>[1],
			) => {
				const isRestoreDirection =
					typeof src === 'string' &&
					src.includes('.reclaim.') &&
					typeof dest === 'string' &&
					!dest.includes('.reclaim.');
				if (state.renameRestoreFailOnce && isRestoreDirection) {
					state.renameRestoreFailOnce = false;
					throw makeErrnoError(
						'EEXIST',
						'rename failed (injected reclaim restore)',
					);
				}
				return actual.rename(src, dest);
			},
		),
		rm: vi.fn(
			async (
				path: Parameters<typeof actual.rm>[0],
				options?: Parameters<typeof actual.rm>[1],
			) => {
				const pathStr = typeof path === 'string' ? path : '';
				if (
					state.rmMarkerFailOnce &&
					pathStr.includes('.reclaim-marker.')
				) {
					state.rmMarkerFailOnce = false;
					throw makeErrnoError(
						'EACCES',
						'rm failed (injected marker cleanup)',
					);
				}
				if (
					state.rmReclaimCopyFailOnce &&
					pathStr.includes('.reclaim.') &&
					!pathStr.includes('.reclaim-marker.')
				) {
					state.rmReclaimCopyFailOnce = false;
					throw makeErrnoError(
						'EACCES',
						'rm failed (injected reclaim-copy cleanup)',
					);
				}
				if (
					state.rmExactPathToFail !== undefined &&
					pathStr === state.rmExactPathToFail
				) {
					state.rmExactPathToFail = undefined;
					throw makeErrnoError(
						'EACCES',
						'rm failed (injected exact-path cleanup)',
					);
				}
				return actual.rm(path, options);
			},
		),
	};
});

const {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	LockContentionError,
	withFileMutex,
} = await import('../../../../src/lib/shared/with-file-mutex');

interface IStructuredLease {
	readonly acquiredAt: number;
	readonly generation: number;
	readonly heartbeatAt: number;
	readonly token: string;
}

const writeStructuredLease = (path: string, lease: IStructuredLease): void => {
	writeFileSync(path, JSON.stringify(lease));
};

describe('withFileMutex — injected filesystem failures on rare cleanup/race paths', () => {
	let dir = '';
	let target = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-fs-injection-'));
		target = join(dir, 'state.json');
		lockPath = `${target}.mutex`;
		state.openWxFailAt = 0;
		state.openWxFailCode = '';
		state.openWxCallCount = 0;
		state.openRPlusFailCode = undefined;
		state.openRPlusCallCount = 0;
		state.readFileFailOnce = false;
		state.renameRestoreFailOnce = false;
		state.rmMarkerFailOnce = false;
		state.rmReclaimCopyFailOnce = false;
		state.rmExactPathToFail = undefined;
	});

	afterEach(() => {
		__resetWithFileMutexTestHooks();
		vi.clearAllMocks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('surfaces a non-EEXIST failure on the very first attempt without retrying', async () => {
		state.openWxFailAt = 1;
		state.openWxFailCode = 'EACCES';

		const start = Date.now();
		await expect(
			withFileMutex(target, async () => undefined, {
				timeoutMs: 500,
				pollMs: 10,
			}),
		).rejects.toMatchObject({ code: 'EACCES' });

		expect(Date.now() - start).toBeLessThan(300);
		expect(state.openWxCallCount).toBe(1);
	});

	it('propagates a non-ENOENT error from the very first lease observation', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now(),
			generation: 0,
			heartbeatAt: Date.now(),
			token: 'live',
		});
		state.readFileFailOnce = true;

		await expect(
			withFileMutex(target, async () => undefined, {
				onContention: 'fail',
				staleMs: 60_000,
				timeoutMs: 500,
				pollMs: 10,
			}),
		).rejects.toMatchObject({ code: 'EACCES' });
	});

	it('discards the reclaim copy and retries when a competitor recreates the lock during the guard write', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 1,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});
		state.openWxFailAt = 2;
		state.openWxFailCode = 'EEXIST';
		// The discarded reclaim copy's own cleanup also fails once: the
		// EEXIST branch's `rm(reclaimPath).catch(() => undefined)` must
		// swallow that too, not just the EEXIST itself.
		state.rmReclaimCopyFailOnce = true;

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ staleMs: 20, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
		expect(state.openWxCallCount).toBeGreaterThanOrEqual(3);
		expect(state.rmReclaimCopyFailOnce).toBe(false);
	});

	it('retries when the guard write itself reports the lock briefly vanished', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 1,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});
		state.openWxFailAt = 2;
		state.openWxFailCode = 'ENOENT';

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ staleMs: 20, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
	});

	it('discards its reclaim copy when the restore rename finds the canonical path already recreated', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 4,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});
		state.renameRestoreFailOnce = true;

		let capturedReclaimPath: string | undefined;
		__setWithFileMutexTestHooks({
			afterReclaimRename: ({ reclaimPath }) => {
				capturedReclaimPath = reclaimPath;
				// Force the revalidation mismatch that routes into
				// `restoreReclaimPath`, whose rename we've sabotaged above.
				writeStructuredLease(reclaimPath, {
					acquiredAt: Date.now(),
					generation: 999,
					heartbeatAt: Date.now(),
					token: 'someone-else',
				});
				// A real competitor really did recreate the canonical path
				// with a live lease — otherwise `restoreReclaimPath`
				// swallowing the injected EEXIST would just leave the path
				// free for our own next retry to win.
				writeStructuredLease(lockPath, {
					acquiredAt: Date.now(),
					generation: 0,
					heartbeatAt: Date.now(),
					token: 'fresh-competitor',
				});
			},
		});

		await expect(
			withFileMutex(target, async () => 'stolen', {
				onContention: 'fail',
				// Large enough that the freshly-recreated competitor lease
				// (written moments ago, inside the hook) is never itself
				// judged stale within this short timeout — only the
				// original 60s-old lease must trip the stale check.
				staleMs: 5_000,
				timeoutMs: 150,
				pollMs: 10,
			}),
		).rejects.toBeInstanceOf(LockContentionError);

		expect(capturedReclaimPath).toBeDefined();
		if (capturedReclaimPath !== undefined) {
			expect(existsSync(capturedReclaimPath)).toBe(false);
		}
	});

	it('keeps the critical section alive when a heartbeat refresh fails to reopen the lease', async () => {
		state.openRPlusFailCode = 'EACCES';

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
				await waitUntil(
					'a heartbeat refresh attempt has fired',
					() => state.openRPlusCallCount >= 1,
					{ timeoutMs: 2_000, intervalMs: 5 },
				);
			},
			{ heartbeatMs: 10, staleMs: 60_000, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
		expect(state.openRPlusCallCount).toBeGreaterThanOrEqual(1);
	});

	it('lets its own heartbeat find the lock genuinely gone without throwing', async () => {
		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
				rmSync(lockPath, { force: true });
				await waitUntil(
					'a heartbeat refresh attempt ran against the vanished lock',
					() => state.openRPlusCallCount >= 1,
					{ timeoutMs: 2_000, intervalMs: 5 },
				);
			},
			{ heartbeatMs: 10, staleMs: 60_000, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
	});

	it('lets its own heartbeat find a foreign token without throwing', async () => {
		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
				writeStructuredLease(lockPath, {
					acquiredAt: Date.now(),
					generation: 0,
					heartbeatAt: Date.now(),
					token: 'someone-else',
				});
				await waitUntil(
					'a heartbeat refresh attempt saw the foreign token',
					() => state.openRPlusCallCount >= 1,
					{ timeoutMs: 2_000, intervalMs: 5 },
				);
			},
			{ heartbeatMs: 10, staleMs: 60_000, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
		// Release must not delete a lock it no longer owns.
		expect(existsSync(lockPath)).toBe(true);
		const foreign = JSON.parse(
			readFileSync(lockPath, 'utf8'),
		) as IStructuredLease;
		expect(foreign.token).toBe('someone-else');
	});

	it('does not fail an acquisition when cleaning up its own stale-marker fails', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 1,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});
		state.rmMarkerFailOnce = true;

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ staleMs: 20, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
	});

	it('does not fail a successful steal when discarding the reclaim copy itself fails', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 1,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});
		state.rmReclaimCopyFailOnce = true;

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{ staleMs: 20, timeoutMs: 2_000, pollMs: 10 },
		);

		expect(entered).toBe(true);
	});

	it('eventually steals a live lock even when discarding its sidecar first fails', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now(),
			generation: 0,
			heartbeatAt: Date.now(),
			token: 'live-elsewhere',
		});
		state.rmExactPathToFail = lockPath;

		let entered = false;
		await withFileMutex(
			target,
			async () => {
				entered = true;
			},
			{
				onContention: 'steal',
				timeoutMs: 40,
				staleMs: 60_000,
				pollMs: 5,
			},
		);

		expect(entered).toBe(true);
		expect(state.rmExactPathToFail).toBeUndefined();
	});

	it('swallows its own cleanup failure while unwinding a commit-step error', async () => {
		writeStructuredLease(lockPath, {
			acquiredAt: Date.now() - 60_000,
			generation: 1,
			heartbeatAt: Date.now() - 60_000,
			token: 'stale-holder',
		});
		state.rmExactPathToFail = lockPath;

		await expect(
			withFileMutex(target, async () => undefined, {
				staleMs: 20,
				timeoutMs: 500,
				pollMs: 10,
				metrics: {
					recordWaitMs: () => undefined,
					recordContention: () => undefined,
					recordFailedAcquisition: () => undefined,
					recordStaleReclaim: () => {
						throw new Error('metrics sink is down');
					},
				},
			}),
		).rejects.toThrow('metrics sink is down');
	});

	it('logs to stderr instead of throwing when release cannot remove its own lock for a non-ENOENT reason', async () => {
		const stderrSpy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		try {
			state.rmExactPathToFail = lockPath;

			await expect(
				withFileMutex(target, async () => 'ok', {
					staleMs: 60_000,
					timeoutMs: 2_000,
					pollMs: 10,
				}),
			).resolves.toBe('ok');

			expect(stderrSpy).toHaveBeenCalledTimes(1);
			const [firstCallFirstArg] = stderrSpy.mock.calls[0] ?? [];
			expect(String(firstCallFirstArg)).toContain(
				'withFileMutex: release failed',
			);
		} finally {
			stderrSpy.mockRestore();
		}
	});
});
