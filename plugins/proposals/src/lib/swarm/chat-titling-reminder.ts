/**
 * chat-titling-reminder.ts
 *
 * Fallback path: render a markdown reminder that the user
 * must rename their chat session manually because the orchestrator
 * cannot perform the rename programmatically on this build.
 *
 * Background:
 *   T2 (technical_investigator) confirmed that
 *   `workbench.action.chat.rename` is **not** registered in VS Code
 *   1.123 / Copilot Chat 0.43. The T3 *integrate* branch is therefore
 *   dead on arrival and the T3 *fallback* branch is active: the gate
 *   must emit a visible reminder block that tells the user how to
 *   apply the prefix convention to the current chat session by
 *   hand.
 *
 *   The block is a pure-data string with no executable content; it is
 *   safe to concatenate to any markdown payload and to copy/paste into
 *   a chat reply. The helper never throws and accepts an
 *   `IAgentClosureReport` with any shape: missing `proposalId` /
 *   `taskId` / `summary` are tolerated and degrade to the `[FREE]`
 *   branch.
 *
 *   The T1 helper `parseChatTitlingPrefix` is imported so we can
 *   validate the resolved proposal template against the same length
 *   cap (`CHAT_TITLING_PREFIX_MAX_LENGTH = 40`) that the T1 spec
 *   locks. This keeps the two helpers coherent: the reminder never
 *   asks the user to paste a string the prefix parser would reject.
 *
 * Relationship with the rest of the project:
 *   - `libs/mcp-project/src/lib/swarm/chat-titling-prefix.ts` (T1)
 *   - `libs/mcp-project/src/lib/swarm/host-capabilities.ts` (host
 *     capabilities abstraction; r00003 S8 / F3)
 *   - `libs/mcp-project/src/lib/agents/agent-closure-report.ts`
 *     (consumed by `<prefix>_self_review_gate`).
 *   - the host self-review gate tool
 *     (concatenates the output of this helper to the gate's response).
 *
 * r00003 S8 (F3, O + D): the IDE name, the action id, and the
 * "blocked" reason used to be hardcoded literals sprinkled through
 * this file. They now live in `host-capabilities.ts` as a small data
 * interface. When Copilot Chat ships a release that *does* register
 * the rename action, hosts flip `programmaticRenameActionId` on the
 * capabilities object — no code change here.
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import type { IAgentClosureReport } from '../agents/agent-closure-report';
import {
	CHAT_TITLING_PREFIX_MAX_LENGTH,
	parseChatTitlingPrefix,
} from './chat-titling-prefix';
import {
	createDefaultHostCapabilities,
	type IHostCapabilities,
} from './host-capabilities';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Optional chat-titling context attached to a closure report.
 *
 * The T1 prefix parser lives on the FIRST prompt of the chat, which
 * the gate does not have access to. We instead accept a *summary* of
 * that context on the report (filled in by the orchestrator that
 * generated the report) so the reminder can be precise.
 *
 *   - `proposalId`: e.g. "p12", "f3". When `null` or `undefined`,
 *     the `[FREE]` branch is rendered.
 *   - `taskId`:     e.g. "T1", "T2.3". Ignored when `proposalId` is
 *     missing.
 *   - `summary`:    e.g. "rename probe". The free-text portion of
 *     the title; shown to the user so they know what to paste.
 */
export interface IChatTitlingReminderContext {
	readonly proposalId?: string | null;
	readonly taskId?: string | null;
	readonly summary?: string | null;
}

/**
 * The shape this helper actually accepts. We intentionally keep the
 * input shape permissive (the gate does not need to extend the
 * `IAgentClosureReport` interface to add these fields): the helper
 * just READS optional fields and tolerates their absence.
 *
 * Using `IAgentClosureReport & IChatTitlingReminderContext` keeps the
 * type honest — callers that pass a plain `IAgentClosureReport` are
 * also accepted (the reminder falls back to the `[FREE]` branch).
 */
export type IChatTitlingReminderInput = Omit<
	IAgentClosureReport,
	keyof IChatTitlingReminderContext
> &
	Partial<IChatTitlingReminderContext>;

/**
 * Options that affect the rendered reminder without changing its
 * contract. Currently only `hostCapabilities` — callers that want a
 * host-agnostic reminder (or a different IDE) inject their own.
 */
export interface IChatTitlingReminderOptions {
	readonly hostCapabilities?: IHostCapabilities;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders the fallback reminder block as a markdown string.
 *
 * Branches:
 *   - If the report has a non-empty `proposalId`:
 *       Renders the proposal-bound template
 *       `[<proposalId>] T<taskId>: <summary>` and omits the
 *       `[FREE]` branch. When `taskId` or `summary` are missing,
 *       a `<missing T<taskId>>` / `<short summary>` placeholder is
 *       inserted so the block still parses visually.
 *   - If the report has `proposalId === null` / `undefined` (or the
 *     field is absent):
 *       Renders the `[FREE] <short summary>` branch only.
 *
 * The output always:
 *   - Opens with `## Rename chat session reminder`.
 *   - Mentions the technical limitation
 *     "no `workbench.action.chat.rename`" (or the action id provided
 *     by the host's `IHostCapabilities.programmaticRenameActionId`).
 *   - Tells the user how to perform the rename manually, using the
 *     phrase provided by `IHostCapabilities.manualRenameInstruction`.
 *   - Calls out the prefix length cap to avoid sidebar truncation.
 *   - Ends with a trailing newline so it can be safely concatenated
 *     to a markdown payload.
 */
export function buildChatTitlingReminder(
	report: IChatTitlingReminderInput,
	options: IChatTitlingReminderOptions = {},
): string {
	const proposalId = normaliseOptionalString(report.proposalId);
	const taskId = normaliseOptionalString(report.taskId);
	const summary = normaliseOptionalString(report.summary);

	const caps = options.hostCapabilities ?? createDefaultHostCapabilities();
	const actionId =
		caps.programmaticRenameActionId ?? 'workbench.action.chat.rename';
	const blockedReason =
		caps.programmaticRenameBlockedReason ?? `not available on this host`;

	const heading = '## Rename chat session reminder';
	const capNote = `The prefix must fit in ${caps.prefixCharCap} characters to avoid truncation.`;
	const sidebar = `The chat title in the ${caps.ideDisplayName} ${caps.chatPanelLocation} is auto-derived from the first`;
	const blocked = `rename it programmatically (no \`${actionId}\` — ${blockedReason}). To give this chat a meaningful`;
	const manual = `title, ${caps.manualRenameInstruction}, and set:`;

	if (proposalId !== null) {
		const safeTaskId = taskId ?? '<T-taskId>';
		const safeSummary = summary ?? '<short summary>';
		const resolvedProposalTemplate = `[${proposalId}] T${stripLeadingT(
			safeTaskId,
		)}: ${safeSummary}`;

		// Run the resolved template through the T1 parser to make sure
		// we are not asking the user to paste a string the prefix
		// spec would reject. If it is rejected (e.g. the proposalId
		// contains characters outside the T1 regex), we fall through
		// to the [FREE] branch — the manual rename can still proceed
		// with a free title and the orchestrator can fix the proposal
		// id later.
		const probe = parseChatTitlingPrefix(resolvedProposalTemplate);
		if (probe.valid) {
			return [
				heading,
				'',
				sidebar,
				'prompt. This conversation is not in a state where the orchestrator can',
				blocked,
				manual,
				'',
				`    ${resolvedProposalTemplate}`,
				'',
				capNote,
				'',
			].join('\n');
		}
		// Intentionally fall through to the [FREE] branch when the
		// proposal-bound template would be rejected by the T1 parser.
	}

	return [
		heading,
		'',
		sidebar,
		'prompt. This conversation is not in a state where the orchestrator can',
		blocked,
		manual,
		'',
		'    [FREE] <short summary>',
		'',
		'(proposal-free sessions — use this branch when no active proposal is',
		'open. The orchestrator will pick it up from the first prompt.)',
		'',
		capNote,
		'',
	].join('\n');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Coerces an optional string-y value into either a non-empty trimmed
 * string or `null`. Centralises the "missing / null / undefined /
 * empty / whitespace-only" decision so the branching above stays
 * readable.
 */
function normaliseOptionalString(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	return trimmed;
}

/**
 * The reminder template renders `[<proposalId>] T<taskId>: <summary>`,
 * i.e. the literal `T` is hard-coded. If the caller already supplied
 * a `taskId` that includes the leading `T` (e.g. `"T2"`), we strip
 * it to avoid the double-letter `[p12] TT2: ...`.
 *
 * This helper is a no-op when the value does not start with `T`,
 * which keeps the function safe for free-form or malformed input.
 */
function stripLeadingT(value: string): string {
	if (value.length > 0 && value.charAt(0) === 'T') {
		return value.slice(1);
	}
	return value;
}
