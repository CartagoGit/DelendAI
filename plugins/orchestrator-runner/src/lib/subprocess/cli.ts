/**
 * cli.ts — spawn a CLI provider + parse its stream-json output (S6).
 *
 * A `cli` provider (e.g. `claude -p --output-format=stream-json`, `codex
 * exec`, `aider --message`) is spawned per invocation. Its stdout is a
 * JSONL stream of `{type, ...}` events; we accumulate assistant text and the
 * final usage record.
 *
 * The subprocess is reached through an INJECTED spawner seam so tests never
 * fork a real process. The default seam wraps `node:child_process.spawn`.
 *
 * Cancellation (CRITICAL I8): `cancel()` runs the ladder — SIGTERM now, then
 * SIGKILL after `sigkillGraceMs` (default 5000) if the process has not
 * exited. Both the grace timer is `unref()`'d and cleared on exit, so a
 * cancelled invocation never leaks a handle.
 */
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IInvokeUsage,
	IKindInvoker,
} from '../invoke/types';

/** The slice of a child process the CLI invoker actually uses. */
export interface ICliChildProcess {
	on(event: 'exit', listener: (code: number | null) => void): void;
	onStdout(listener: (chunk: string) => void): void;
	onStderr(listener: (chunk: string) => void): void;
	kill(signal: 'SIGTERM' | 'SIGKILL'): void;
}

/** Spawns a CLI process. Injected so tests never fork a real one. */
export type CliSpawner = (
	command: string,
	args: readonly string[],
) => ICliChildProcess;

export interface ICliInvokerOptions {
	readonly spawner: CliSpawner;
	/** ms between SIGTERM and the escalating SIGKILL. Default 5000. */
	readonly sigkillGraceMs?: number;
	/** Injectable timer (tests). Default real `setTimeout` (unref'd). */
	readonly setTimer?: (fn: () => void, ms: number) => { clear(): void };
}

const defaultSetTimer = (fn: () => void, ms: number): { clear(): void } => {
	const handle = setTimeout(fn, ms);
	handle.unref?.();
	return { clear: () => clearTimeout(handle) };
};

/**
 * Parse one stream-json line into a text delta + optional usage. Unknown or
 * malformed lines are ignored (a provider may emit keep-alive noise).
 */
export const parseStreamJsonLine = (
	line: string,
): { readonly text?: string; readonly usage?: IInvokeUsage } => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return {};
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return {};
	}
	const out: { text?: string; usage?: IInvokeUsage } = {};
	// Text can arrive as {type:'assistant'|'text', text} or {delta:{text}}.
	const text =
		typeof obj.text === 'string'
			? obj.text
			: typeof (obj.delta as { text?: unknown } | undefined)?.text ===
					'string'
				? (obj.delta as { text: string }).text
				: undefined;
	if (text !== undefined) out.text = text;
	const usageRaw = obj.usage as Record<string, unknown> | undefined;
	if (usageRaw !== undefined) {
		const input = Number(
			usageRaw.input_tokens ?? usageRaw.inputTokens ?? 0,
		);
		const output = Number(
			usageRaw.output_tokens ?? usageRaw.outputTokens ?? 0,
		);
		out.usage = {
			inputTokens: Number.isFinite(input) ? input : 0,
			outputTokens: Number.isFinite(output) ? output : 0,
			totalTokens:
				(Number.isFinite(input) ? input : 0) +
				(Number.isFinite(output) ? output : 0),
		};
	}
	return out;
};

/** Build the argv for a cli decision, forwarding `--allowedTools`. */
export const buildCliArgs = (
	baseArgs: readonly string[],
	prompt: string,
	toolsAllow?: readonly string[],
): readonly string[] => {
	const args = [...baseArgs, prompt];
	if (toolsAllow !== undefined && toolsAllow.length > 0) {
		args.push('--allowedTools', toolsAllow.join(','));
	}
	return args;
};

export const createCliInvoker = (options: ICliInvokerOptions): IKindInvoker => {
	const graceMs = options.sigkillGraceMs ?? 5000;
	const setTimer = options.setTimer ?? defaultSetTimer;

	return {
		start(request: IInvokeRequest): IActiveInvocation {
			if (request.invoke.kind !== 'cli') {
				return {
					promise: Promise.reject(
						new Error(
							`cli invoker got a ${request.invoke.kind} decision`,
						),
					),
					cancel: () => undefined,
				};
			}
			const args = buildCliArgs(
				request.invoke.args ?? [],
				request.prompt,
				request.toolsAllow,
			);
			const child = options.spawner(request.invoke.command, args);

			let killTimer: { clear(): void } | undefined;
			let cancelled = false;
			let exited = false;
			let text = '';
			let usage: IInvokeUsage | undefined;
			let buffer = '';

			const promise = new Promise<IInvokeResult>((resolve, reject) => {
				const drainLine = (line: string): void => {
					const parsed = parseStreamJsonLine(line);
					if (parsed.text !== undefined) text += parsed.text;
					if (parsed.usage !== undefined) usage = parsed.usage;
				};
				child.onStdout((chunk) => {
					buffer += chunk;
					let idx = buffer.indexOf('\n');
					while (idx !== -1) {
						drainLine(buffer.slice(0, idx));
						buffer = buffer.slice(idx + 1);
						idx = buffer.indexOf('\n');
					}
				});
				child.onStderr(() => undefined);
				child.on('exit', (code) => {
					exited = true;
					killTimer?.clear();
					if (buffer.length > 0) drainLine(buffer);
					if (cancelled) {
						reject(new Error('invocation-cancelled'));
						return;
					}
					if (code !== 0 && code !== null) {
						reject(new Error(`cli exited with code ${code}`));
						return;
					}
					resolve({
						text,
						...(usage !== undefined ? { usage } : {}),
					});
				});
			});

			return {
				promise,
				cancel: () => {
					if (cancelled || exited) return;
					cancelled = true;
					child.kill('SIGTERM');
					killTimer = setTimer(() => {
						if (!exited) child.kill('SIGKILL');
					}, graceMs);
				},
			};
		},
	};
};
