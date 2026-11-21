/**
 * error-collector.ts — f00251 S5.
 *
 * Knowledge body the `issues` plugin publishes so agents can discover
 * how the error-collector engine creates issue drafts (and optionally
 * live issues) from `ICapturedError` events.
 */

export interface IIssuesErrorCollectorKnowledgeOptions {
	readonly prefix: string;
}

export const buildIssuesErrorCollectorKnowledge = (
	_options: IIssuesErrorCollectorKnowledgeOptions,
): string =>
	[
		'# Error-collector sink adapter — issues plugin (f00251)',
		'',
		'The `issues` plugin registers an `IErrorSink` adapter that converts every',
		'`ICapturedError` event into a redacted markdown draft or a live GitHub issue.',
		'',
		'## Quick usage',
		'',
		'```ts',
		'// Record from any plugin handler:',
		'await ctx.errorCollector.record(thrown, {',
		'  toolName: ctx.namespacePrefix + "_my_tool",',
		'  packageId: "@scope/my-package",',
		'  pluginName: "my-plugin",',
		'});',
		'```',
		'',
		'## Two modes',
		'',
		'**Safe-mode (default, `autoReport: false`)**',
		'A redacted markdown file is written to',
		'`docs/delendai/proposals/retired/issues/_errors/<fingerprint>.md`.',
		'No network call is made. This is the privacy-by-construction default.',
		'',
		'**Live-mode (`autoReport: true`)**',
		'A live GitHub issue is opened **only** when all of the following are true:',
		'1. `plugins.issues.options.autoReport: true` is set in the config file.',
		'2. The event severity is `critical`, `alert`, or `emergency`.',
		'3. The per-fingerprint dedup guard has not seen this exact error in the',
		'   current rolling-hour window.',
		'4. The hourly rate limit (`maxReportsPerHour`, default 5) has not been',
		'   reached.',
		'',
		'## Rate-limit & dedup semantics',
		'',
		'- `maxReportsPerHour` (default 5): maximum live issues opened per rolling hour.',
		'  Drafts are always written regardless of this limit.',
		'- Fingerprint dedup: within a rolling hour, the same fingerprint (SHA-256 of',
		'  `packageId|toolName|errorCode|stackHead`) is reported at most once as a live issue.',
		'  Subsequent occurrences still produce drafts.',
		'',
		'## How to opt in to live-mode',
		'',
		'```jsonc',
		'{',
		'  "plugins": {',
		'    "issues": {',
		'      "options": {',
		'        "repo": "owner/name",',
		'        "autoReport": true,',
		'        "maxReportsPerHour": 3',
		'      }',
		'    }',
		'  }',
		'}',
		'```',
		'',
		'Restart the server after editing the config file.',
		'',
		'## Warning',
		'',
		'**Safe-mode is the privacy-by-construction default.** Live issue creation',
		'requires an explicit operator decision because it writes to the network.',
		'Never enable `autoReport` without verifying that the captured events',
		'do not contain sensitive workspace context.',
	].join('\n');
