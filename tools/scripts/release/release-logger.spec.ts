import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createConsoleLogger,
	createQuietLogger,
	createRecordingLogger,
	type IReleaseLogger,
} from './release-logger';

/**
 * Solid contract test: every implementation of `IReleaseLogger` must
 * expose the same three channels. We verify the contract by exhaustively
 * satisfying each interface field with a spy, then asserting on what the
 * recording logger captured.
 */
const exhaustInterface = (l: IReleaseLogger): void => {
	l.info('i');
	l.warn('w');
	l.error('e');
};

describe('release-logger (Solid SRP/OCP extraction)', () => {
	describe('createConsoleLogger', () => {
		let infoSpy: ReturnType<typeof vi.spyOn>;
		let warnSpy: ReturnType<typeof vi.spyOn>;
		let errorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('routes info → console.log, warn → console.warn, error → console.error', () => {
			const logger = createConsoleLogger();
			logger.info('hello');
			logger.warn('careful');
			logger.error('boom');
			expect(infoSpy).toHaveBeenCalledWith('hello');
			expect(warnSpy).toHaveBeenCalledWith('careful');
			expect(errorSpy).toHaveBeenCalledWith('boom');
		});
	});

	describe('createQuietLogger', () => {
		let infoSpy: ReturnType<typeof vi.spyOn>;
		let warnSpy: ReturnType<typeof vi.spyOn>;
		let errorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('drops info but keeps warn/error (so genuine failures are not silenced)', () => {
			const logger = createQuietLogger();
			logger.info('banner');
			logger.warn('careful');
			logger.error('boom');
			expect(infoSpy).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith('careful');
			expect(errorSpy).toHaveBeenCalledWith('boom');
		});
	});

	describe('createRecordingLogger', () => {
		it('records every call with its channel tag in order', () => {
			const logger = createRecordingLogger();
			logger.info('a');
			logger.warn('b');
			logger.error('c');
			logger.info('d');
			expect(logger.calls).toEqual([
				['info', 'a'],
				['warn', 'b'],
				['error', 'c'],
				['info', 'd'],
			]);
		});

		it('passes the LSP test: any consumer that only knows IReleaseLogger works', () => {
			// Solid LSP guard: a function typed against the interface must
			// work for every concrete implementation without casts.
			const driver = (l: IReleaseLogger): void => exhaustInterface(l);
			const rec = createRecordingLogger();
			driver(rec);
			expect(rec.calls.map((c) => c[0])).toEqual([
				'info',
				'warn',
				'error',
			]);
		});
	});
});
