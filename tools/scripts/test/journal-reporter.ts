/**
 * Vitest reporter that records every run into the test journal.
 *
 * Why a reporter and not a log parser: the formatted terminal output is
 * a presentation format that changes between vitest minors, drops the
 * expected/received block once it scrolls, and cannot be re-read after
 * the fact. The reporter API hands us the same failures as structured
 * objects — `TestCase.result().errors[]` carries `message`, `expected`,
 * `actual`, `diff` and parsed stack frames — so the journal is derived
 * from data, not from text that happened to be printed.
 *
 * Contract: this reporter must never influence the run's outcome. Every
 * hook body is wrapped; a throw in here would otherwise surface as a
 * vitest internal error and take a green suite down with it.
 */
import { execFileSync } from 'node:child_process';

import type { Reporter } from 'vitest/reporters';
import type { SerializedError, TestCase, TestModule } from 'vitest/node';

import {
	buildFailureRecord,
	type ITestFailureRecord,
	type ITestRunEntry,
	JOURNAL_BOUNDS,
	makeRunId,
	safeAppendRunEntry,
} from './test-journal.ts';

const gitInfo = (cwd: string): { head?: string; branch?: string } => {
	const run = (args: string[]): string | undefined => {
		try {
			return execFileSync('git', args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
				timeout: 3000,
			}).trim();
		} catch {
			return undefined;
		}
	};
	const head = run(['rev-parse', 'HEAD']);
	const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
	return {
		...(head !== undefined ? { head } : {}),
		...(branch !== undefined ? { branch } : {}),
	};
};

const describeCommand = (): string => {
	const args = process.argv.slice(2);
	return `vitest ${args.join(' ')}`.trim();
};

interface IVitestLike {
	readonly config?: { readonly root?: string };
}

export default class TestJournalReporter implements Reporter {
	private workspaceRoot = process.cwd();
	private startedAt = Date.now();

	onInit(vitest: unknown): void {
		try {
			this.startedAt = Date.now();
			const root = (vitest as IVitestLike | undefined)?.config?.root;
			// A project run reports its own root; the journal always belongs
			// to the repository root that owns `.cache/mcp-vertex`.
			this.workspaceRoot =
				typeof root === 'string' && root !== '' ? root : process.cwd();
		} catch {
			/* keep the default */
		}
	}

	onTestRunEnd(
		testModules: ReadonlyArray<TestModule>,
		unhandledErrors: ReadonlyArray<SerializedError>,
		reason: string,
	): void {
		try {
			this.record(testModules, unhandledErrors, reason);
		} catch (error) {
			try {
				process.stderr.write(
					`[test-journal] reporter error (run unaffected): ${
						error instanceof Error ? error.message : String(error)
					}\n`,
				);
			} catch {
				/* nothing left to do */
			}
		}
	}

	private record(
		testModules: ReadonlyArray<TestModule>,
		unhandledErrors: ReadonlyArray<SerializedError>,
		reason: string,
	): void {
		const workspaceRoot = this.workspaceRoot;
		const failures: ITestFailureRecord[] = [];
		let tests = 0;
		let passed = 0;
		let failed = 0;
		let skipped = 0;

		for (const testModule of testModules) {
			const project = testModule.project?.name;
			// Collection / import failures: the file never produced tests, so
			// its errors live on the module, not on any test case.
			for (const moduleError of testModule.errors()) {
				failures.push(
					buildFailureRecord({
						error: moduleError,
						file: testModule.moduleId,
						workspaceRoot,
						name: '(module failed to collect)',
						fullName: '(module failed to collect)',
						...(project !== undefined ? { project } : {}),
						kind: 'module',
					}),
				);
			}
			for (const testCase of testModule.children.allTests()) {
				tests += 1;
				const result = testCase.result();
				if (result.state === 'passed') passed += 1;
				else if (result.state === 'skipped') skipped += 1;
				else if (result.state === 'failed') {
					failed += 1;
					const errors =
						result.errors.length > 0
							? result.errors
							: [
									{
										message:
											'test failed with no reported error',
									},
								];
					for (const error of errors) {
						failures.push(
							buildFailureRecord({
								error,
								file: testModule.moduleId,
								workspaceRoot,
								name: testCase.name,
								fullName: testCase.fullName,
								...(project !== undefined ? { project } : {}),
								...(testCase.diagnostic()?.duration !==
								undefined
									? {
											durationMs:
												testCase.diagnostic()?.duration,
										}
									: {}),
								kind: 'test',
							}),
						);
					}
				}
			}
		}

		for (const error of unhandledErrors) {
			failures.push(
				buildFailureRecord({
					error,
					file: workspaceRoot,
					workspaceRoot,
					name: '(unhandled error)',
					fullName: '(unhandled error)',
					kind: 'unhandled',
				}),
			);
		}

		const capped = failures.slice(0, JOURNAL_BOUNDS.maxFailuresPerRun);
		const timestamp = new Date().toISOString();
		const command = describeCommand();
		const git = gitInfo(workspaceRoot);
		const entry: ITestRunEntry = {
			schema: 1,
			runId: makeRunId(timestamp, command),
			timestamp,
			// `reason` can be `interrupted`; anything that is not a clean pass
			// with zero failures must NOT read as green to the next agent.
			result:
				failures.length === 0 && failed === 0 && reason === 'passed'
					? 'pass'
					: 'fail',
			reason,
			command,
			cwd: process.cwd(),
			durationMs: Date.now() - this.startedAt,
			...(git.head !== undefined ? { gitHead: git.head } : {}),
			...(git.branch !== undefined ? { gitBranch: git.branch } : {}),
			totals: {
				files: testModules.length,
				tests,
				passed,
				failed,
				skipped,
			},
			failures: capped,
			...(failures.length > capped.length
				? { failuresOmitted: failures.length - capped.length }
				: {}),
		};
		safeAppendRunEntry({ workspaceRoot, entry });
	}
}

export { TestJournalReporter };
