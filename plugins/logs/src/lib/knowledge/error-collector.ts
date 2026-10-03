/**
 * error-collector.ts — f00251 S5.
 *
 * Knowledge body the `logs` plugin publishes so agents can discover
 * how the error-collector engine routes captured events into the
 * existing JSONL streams — no new schema, no extra storage layer.
 */

export interface IErrorCollectorKnowledgeOptions {
	readonly prefix: string;
}

export const buildErrorCollectorKnowledge = (
	options: IErrorCollectorKnowledgeOptions,
): string => {
	const p = options.prefix;
	return [
		'# Error-collector sink adapter (f00251)',
		'',
		'The `logs` plugin registers an `IErrorSink` adapter that forwards every',
		'`ICapturedError` event fanned out by the core error-collector into the',
		'same JSONL streams used by lifecycle hooks — no new schema or files.',
		'',
		'## Quick usage',
		'',
		'```ts',
		'// Inside any plugin handler (errors thrown here are caught by withErrorCollection):',
		'await ctx.errorCollector.record(thrown, {',
		'  toolName: ctx.namespacePrefix + "_my_tool",',
		'  packageId: "@scope/my-package",',
		'  pluginName: "my-plugin",',
		'});',
		'```',
		'',
		'## Where events land',
		'',
		'The adapter routes each `ICapturedError` to the **`results/logs-errors/*.jsonl`** stream',
		'(same destination as lifecycle events with a non-`ok` outcome). No new schema is',
		'introduced: the event is translated to a `log-warning` / `failed` `ILogEvent` and',
		'written by the same `appendEvent` path. The `meta.sink` field is set to',
		'`"logs-error"` so the event is distinguishable from organic tool-failure lines.',
		'',
		'## Surfacing collected errors',
		'',
		'```',
		`${p}_errors_tail()`,
		'// → newest N entries from the curated error stream; includes meta by default.',
		'',
		`${p}_query({ kind: "log-warning", meta: { sink: "logs-error" } })`,
		'// → all entries written by the error-collector adapter.',
		'```',
		'',
		'## Privacy guarantee',
		'',
		'Secrets are redacted **twice** before any sink sees the event:',
		'1. The core collector applies `createDefaultRedactionPolicy` once, producing a',
		'   single redacted copy shared across all sinks.',
		'2. The logs adapter applies `redactSecrets` again to `summary` as defense-in-depth.',
		'',
		'Neither pass throws on failure — the adapter catches any `appendEvent` error,',
		'counts it in `recordsRejected`, and writes a single stderr line without',
		'propagating the exception to the collector or the caller.',
		'',
		'## Multi-sink fan-out',
		'',
		'This adapter is one of several sinks the collector fans out to in parallel',
		'(`Promise.allSettled`). The `issues` plugin adapter may run concurrently and',
		'write a markdown draft (or open a live issue when `autoReport` is enabled).',
		'A failure in one sink never cancels the others.',
	].join('\n');
};
