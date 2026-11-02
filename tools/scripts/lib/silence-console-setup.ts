#!/usr/bin/env bun
/**
 * silence-console-setup.ts — vitest setup file.
 *
 * Why this exists
 * ---------------
 * `bun run validate` runs ~1200 tests across 167 files. Several of
 * those tests exercise production scripts (release, lint-proposals,
 * gen-skills, check-tutorials-i18n) which are *supposed* to log to
 * the terminal in production. When invoked from a test, that output
 * leaks into the validate stream and drowns the real signal (pass/
 * fail/test name/duration).
 *
 * This setup silences `console.log`/`info`/`warn`/`error`/`debug`
 * and `process.stdout.write`/`stderr.write` for the whole test run
 * — except when a test explicitly opts back in via the `ALLOW_TEST_OUTPUT`
 * env var (used by the 3 fault-injection suites that need to verify
 * the production log appeared: `host-graceful-shutdown`,
 * `loop-detector-service`, `closed-tasks-log`).
 *
 * Tests that DO want to assert on what code would have logged should
 * use `vi.spyOn(console, 'log').mockImplementation(() => {})` and
 * inspect `mock.calls` — that's the explicit contract.
 *
 * Wired into every project via `vitest.shared.ts#sharedSetupFiles`.
 */
import { afterEach, beforeEach, vi } from 'vitest';

const ALLOW = process.env.ALLOW_TEST_OUTPUT === '1';

type LogMethod = (...args: unknown[]) => void;
type ConsoleLike = Record<
	'log' | 'info' | 'warn' | 'error' | 'debug',
	LogMethod
>;

const realConsole: ConsoleLike = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
	debug: console.debug.bind(console),
};

const silentConsole: ConsoleLike = {
	log: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

// a00060: the docstring above has always claimed this silences
// `process.stdout.write`/`stderr.write` too, but until now only
// `console.*` was ever patched — a real code/doc mismatch (the same
// class a00057-a00059 found elsewhere). CLI commands that print their
// own human recap directly via `process.stderr.write` (e.g. `doctor`,
// `init`) leaked real output into the validate test stream with zero
// warning. `write` keeps the real Node signature (optional encoding,
// optional callback) so a caller awaiting the callback doesn't hang.
type WriteMethod = typeof process.stdout.write;
const realStdoutWrite = process.stdout.write.bind(process.stdout);
const realStderrWrite = process.stderr.write.bind(process.stderr);
const silentWrite: WriteMethod = ((
	_chunk: unknown,
	encodingOrCb?: unknown,
	cb?: unknown,
): boolean => {
	const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
	if (typeof callback === 'function') callback();
	return true;
}) as WriteMethod;

let installed = false;
let active = false;

const install = (): void => {
	if (installed) return;
	installed = true;
	// Replace the methods globally so production code (which does not
	// capture `console` at import time) sees the silent versions.
	for (const method of Object.keys(silentConsole) as Array<
		keyof ConsoleLike
	>) {
		console[method] = silentConsole[method];
	}
	process.stdout.write = silentWrite;
	process.stderr.write = silentWrite;
};

const uninstall = (): void => {
	if (!installed) return;
	for (const method of Object.keys(realConsole) as Array<keyof ConsoleLike>) {
		console[method] = realConsole[method];
	}
	process.stdout.write = realStdoutWrite;
	process.stderr.write = realStderrWrite;
};

// Run before/after each test so an opt-in test can flip the switch
// for its own scope without leaking into the next test.
beforeEach(() => {
	if (ALLOW) {
		uninstall();
		active = true;
	} else {
		install();
		active = false;
	}
});

afterEach(() => {
	if (active) {
		// Restore the real console so the next test starts clean.
		uninstall();
		active = false;
	}
	// Always clear any test-local vi spies (e.g. an individual test that
	// used `vi.spyOn(console, 'log')` to inspect mock.calls). Without
	// this, the next test inherits a dangling spy on the silent shim.
	vi.restoreAllMocks();
});
