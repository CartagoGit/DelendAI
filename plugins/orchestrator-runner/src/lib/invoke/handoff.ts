/**
 * handoff.ts — format a routing decision into a ready-to-run command (S6).
 *
 * `<prefix>_format_handoff` turns an `IRoutingDecision` into a copy-pasteable
 * `cli` command or `curl` template the user can run themselves — the safe
 * path when `executeApi:false`. Pure over its input.
 *
 * SECURITY: an `api` handoff NEVER embeds the secret. It emits a
 * `$ENV_VAR` reference (e.g. `Authorization: Bearer $ANTHROPIC_API_KEY`) so
 * the rendered template is safe to log, paste and share.
 */
import type { IRoutingDecision } from '@mcp-vertex/core/public';

export type HandoffKind = 'cli' | 'curl' | 'mcp-tool' | 'passthrough' | 'none';

export interface IFormattedHandoff {
	readonly kind: HandoffKind;
	readonly command: string;
	readonly note: string;
}

/** Single-quote a shell argument, escaping embedded single quotes. */
const shellQuote = (arg: string): string =>
	`'${arg.replace(/'/g, `'\\''`)}'`;

export const formatHandoff = (
	decision: IRoutingDecision,
): IFormattedHandoff => {
	const invoke = decision.invoke;
	switch (invoke.kind) {
		case 'cli': {
			const parts = [
				invoke.command,
				...(invoke.args ?? []),
				shellQuote(decision.prompt),
			];
			return {
				kind: 'cli',
				command: parts.join(' '),
				note: `Run this ${decision.mode} task with ${decision.targetProvider.id} (${decision.targetProvider.modelId}). No API money is spent by the runner.`,
			};
		}
		case 'api': {
			const method = invoke.method ?? 'POST';
			const command = [
				`curl -sS -X ${method} ${shellQuote(invoke.url)}`,
				`  -H ${shellQuote(`Authorization: Bearer $${invoke.envVar}`)}`,
				`  -H ${shellQuote('Content-Type: application/json')}`,
				`  -d ${shellQuote(JSON.stringify({ prompt: decision.prompt }))}`,
			].join(' \\\n');
			return {
				kind: 'curl',
				command,
				note: `Spends against $${invoke.envVar}. The key is referenced, never embedded — safe to paste. Estimated cost tier ${decision.estimatedCostTier}.`,
			};
		}
		case 'mcp-server': {
			return {
				kind: 'mcp-tool',
				command: `${invoke.server} → tools/call ${invoke.tool} ${JSON.stringify(
					{ ...invoke.args, prompt: decision.prompt },
				)}`,
				note: `Call the ${invoke.server} MCP server's ${invoke.tool} tool. Uses your subscription, not an API key.`,
			};
		}
		case 'subscription': {
			return {
				kind: 'passthrough',
				command: `# handle in-context with ${invoke.tool}`,
				note: 'Passthrough: your current agent handles the task with its own subscription model. Zero extra spend.',
			};
		}
		default: {
			return {
				kind: 'none',
				command: '',
				note: 'No runnable handoff for this decision.',
			};
		}
	}
};
