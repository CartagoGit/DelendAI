/**
 * run-external-tool.ts — r00012 S3: the shared, bounded, redacted runner
 * every scanner uses to invoke its external CLI. Wraps the argv-first
 * `runArgv` (no shell, timeout, capped output) and adds output redaction +
 * a normalized `IExternalToolRun`. `exec` is injected (defaults to
 * `runArgv`), so callers are unit-testable without spawning.
 */
import type {
	IArgvExec,
	IExternalToolRun,
	IRunExternalToolInput,
} from '../contracts/interfaces/external-tool.interface';
import { runArgv } from '../shared/run-command';

const escapeRegExp = (literal: string): string =>
	literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a redactor replacing every provided literal/regex with `***`.
 * Regexes are forced global so every occurrence is masked. With no
 * patterns it returns the identity function (zero cost).
 */
export const makeRedactor = (
	patterns: readonly (string | RegExp)[] | undefined,
): ((text: string) => string) => {
	if (patterns === undefined || patterns.length === 0) return (text) => text;
	const regexes = patterns.map((pattern) =>
		typeof pattern === 'string'
			? new RegExp(escapeRegExp(pattern), 'g')
			: new RegExp(
					pattern.source,
					pattern.flags.includes('g')
						? pattern.flags
						: `${pattern.flags}g`,
				),
	);
	return (text) =>
		regexes.reduce(
			(accumulator, regex) => accumulator.replace(regex, '***'),
			text,
		);
};

/**
 * Run an external tool's argv, never throwing. Returns a normalized
 * outcome: `ok` (exit 0), `unavailable` (127 = binary missing), `timedOut`,
 * and redacted stdout/stderr.
 */
export const runExternalTool = async (
	input: IRunExternalToolInput,
	exec: IArgvExec = runArgv,
): Promise<IExternalToolRun> => {
	const outcome = await exec([input.tool.bin, ...input.args], {
		...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
		timeoutMs: input.timeoutMs ?? 60_000,
		maxOutputBytes: input.maxOutputBytes ?? 1024 * 1024,
		...(input.maxStdoutBytes !== undefined
			? { maxStdoutBytes: input.maxStdoutBytes }
			: {}),
		...(input.maxStderrBytes !== undefined
			? { maxStderrBytes: input.maxStderrBytes }
			: {}),
		...(input.stdin !== undefined ? { stdin: input.stdin } : {}),
	});
	const redact = makeRedactor(input.redact);
	return {
		ok: outcome.code === 0,
		code: outcome.code,
		stdout: redact(outcome.stdout),
		stderr: redact(outcome.stderr),
		timedOut: outcome.timedOut,
		unavailable: outcome.code === 127,
	};
};
