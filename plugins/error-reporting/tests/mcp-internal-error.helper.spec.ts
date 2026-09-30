import { describe, expect, it } from 'vitest';

import {
	DelendaiInternalError,
	isSafeScalar,
} from '../src/lib/mcp-internal-error.helper';
import type { SafeScalar } from '../src/lib/contracts/interfaces/reporter.interface';

describe('isSafeScalar — what a report may carry', () => {
	it('accepts strings, numbers, booleans and null', () => {
		for (const value of ['x', 0, 1.5, true, false, null]) {
			expect(isSafeScalar(value)).toBe(true);
		}
	});

	it('accepts arrays and plain objects made only of safe values', () => {
		expect(isSafeScalar(['a', 1, null, [true]])).toBe(true);
		expect(isSafeScalar({ a: 1, b: { c: 'd' }, e: [null] })).toBe(true);
	});

	it('refuses anything that could smuggle more than a value', () => {
		expect(isSafeScalar(undefined)).toBe(false);
		expect(isSafeScalar(() => 1)).toBe(false);
		expect(isSafeScalar(Symbol('s'))).toBe(false);
		expect(isSafeScalar(10n)).toBe(false);
		expect(isSafeScalar(new Error('secret'))).toBe(false);
		expect(isSafeScalar(Buffer.from('secret'))).toBe(false);
		expect(isSafeScalar(['a', undefined])).toBe(false);
		expect(isSafeScalar({ nested: { fn: () => 1 } })).toBe(false);
	});
});

describe('DelendaiInternalError', () => {
	it('carries its code, owner and safe context, and defaults the message to the code', () => {
		const cause = new Error('underlying');
		const error = new DelendaiInternalError({
			code: 'TOOL_EXECUTION_FAILED',
			packageId: '@delendai/core',
			componentId: 'tools',
			safeContext: { attempt: 2 },
			cause,
		});
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('DelendaiInternalError');
		expect(error.message).toBe('TOOL_EXECUTION_FAILED');
		expect(error.code).toBe('TOOL_EXECUTION_FAILED');
		expect(error.delendaiErrorCode).toBe('TOOL_EXECUTION_FAILED');
		expect(error.packageId).toBe('@delendai/core');
		expect(error.componentId).toBe('tools');
		expect(error.safeContext).toEqual({ attempt: 2 });
		expect(error.cause).toBe(cause);
	});

	it('keeps a given message and has no cause when none is given', () => {
		const error = new DelendaiInternalError({
			code: 'HOOK_FAILED',
			packageId: 'p',
			componentId: 'c',
			message: 'the hook failed',
		});
		expect(error.message).toBe('the hook failed');
		expect('cause' in error).toBe(false);
		expect(error.safeContext).toBeUndefined();
	});

	it('refuses a context that is not made of safe values', () => {
		// What an untyped caller (plain JavaScript, parsed input) can hand in.
		const fromOutside: unknown = new Error('x');
		expect(
			() =>
				new DelendaiInternalError({
					code: 'HOOK_FAILED',
					packageId: 'p',
					componentId: 'c',
					safeContext: { leak: fromOutside as SafeScalar },
				}),
		).toThrow(TypeError);
	});
});
