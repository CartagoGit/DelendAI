import { describe, it, expect } from 'vitest';

import { FakeDispatchPort } from '../../../../src/lib/dispatch/fake-port.js';
import {
	InvalidDispatchPortFactoryError,
	MissingDispatchPortError,
	resolveDispatchPort,
} from '../../../../src/lib/dispatch/port-resolution.helper.js';
import type { IDispatchPort } from '../../../../src/lib/dispatch/contracts.js';

const REAL_PORT: IDispatchPort = {
	spawnSubagent: async () => ({
		subagentId: 'real#1',
		tokensUsed: 42,
		output: 'done',
		schemaOk: true,
		hadError: false,
	}),
};

describe('resolveDispatchPort', () => {
	it('throws MissingDispatchPortError when no portFactory and no opt-in are given', () => {
		expect(() => resolveDispatchPort({})).toThrow(MissingDispatchPortError);
	});

	it('never silently substitutes FakeDispatchPort for a missing portFactory', () => {
		// Regression guard for the original bug: a production caller that
		// forgets `portFactory` must get a loud failure, not a working-
		// looking fake port.
		try {
			resolveDispatchPort({});
			expect.unreachable('resolveDispatchPort should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(MissingDispatchPortError);
			expect(err).not.toBeInstanceOf(FakeDispatchPort);
		}
	});

	it('returns a FakeDispatchPort only via the explicit allowFakeDispatchPort opt-in', () => {
		const port = resolveDispatchPort({ allowFakeDispatchPort: true });
		expect(port).toBeInstanceOf(FakeDispatchPort);
	});

	it('returns the exact port produced by a valid portFactory', () => {
		const port = resolveDispatchPort({ portFactory: () => REAL_PORT });
		expect(port).toBe(REAL_PORT);
	});

	it('a valid portFactory wins even when allowFakeDispatchPort is also set', () => {
		const port = resolveDispatchPort({
			portFactory: () => REAL_PORT,
			allowFakeDispatchPort: true,
		});
		expect(port).toBe(REAL_PORT);
	});

	it('throws InvalidDispatchPortFactoryError when the factory returns a shape with no spawnSubagent', () => {
		expect(() =>
			resolveDispatchPort({ portFactory: () => ({ notAPort: true }) }),
		).toThrow(InvalidDispatchPortFactoryError);
	});

	it('throws InvalidDispatchPortFactoryError when the factory returns null', () => {
		expect(() => resolveDispatchPort({ portFactory: () => null })).toThrow(
			InvalidDispatchPortFactoryError,
		);
	});

	it('throws InvalidDispatchPortFactoryError (wrapping the message) when the factory itself throws', () => {
		expect(() =>
			resolveDispatchPort({
				portFactory: () => {
					throw new Error('boom');
				},
			}),
		).toThrow(/boom/);
	});

	it('stringifies a non-Error throw from the factory into the wrapped message', () => {
		expect(() =>
			resolveDispatchPort({
				portFactory: () => {
					throw 'not an Error instance';
				},
			}),
		).toThrow(/not an Error instance/);
	});

	it('throws InvalidDispatchPortFactoryError when portFactory is present but not a function', () => {
		expect(() =>
			resolveDispatchPort({
				portFactory: { spawnSubagent: async () => REAL_PORT },
			}),
		).toThrow(InvalidDispatchPortFactoryError);
	});
});
