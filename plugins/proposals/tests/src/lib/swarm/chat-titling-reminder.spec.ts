/**
 * chat-titling-reminder.spec.ts
 *
 * TDD specs for `buildChatTitlingReminder` (p41, T3 fallback).
 *
 * Context:
 *   T2 (workbench.action.chat.rename probe) returned verdict
 *   `not_available` in this build of VS Code / Copilot Chat. T3 is
 *   therefore the FALLBACK branch: instead of performing the rename
 *   programmatically, the gate must emit a visible reminder block
 *   telling the user to rename the chat manually with the p41
 *   prefix convention.
 *
 *   The reminder is rendered as a markdown block that is appended to
 *   the `affairs_self_review_gate` response payload, and is always
 *   safe to render (it contains no executable code, only guidance).
 *
 *   The helper lives in
 *   `libs/mcp-server/src/lib/swarm/chat-titling-reminder.ts` and
 *   reuses the parser from T1 (`parseChatTitlingPrefix`) only to
 *   guard against the legacy alias "FREE" appearing in places where
 *   the proposal id is missing.
 *
 * Contract (this spec locks):
 *   1. The block always opens with the heading
 *      `## Rename chat session reminder`.
 *   2. The block always contains a sentence naming the technical
 *      limitation: the literal substring "no `workbench.action.chat.rename`"
 *      must appear.
 *   3. The block always tells the user how to perform the rename
 *      manually; the literal substring
 *      "right-click the editor tab → **Rename**" must appear.
 *   4. The block must call out the 40-character cap on the visible
 *      prefix, so the user does not paste a too-long string.
 *   5. If the report has a `proposalId`, the rendered block contains
 *      the resolved `[<proposalId>] T<taskId>: <summary>` template
 *      and the branch starting with `[FREE] ...` is NOT rendered.
 *   6. If the report has `proposalId === null` (or the field is
 *      absent), the block renders the `[FREE] <short summary>`
 *      template only.
 *   7. The helper never throws; an empty / minimal report is
 *      rendered as a best-effort reminder that still points the user
 *      at the right UI action.
 */

import { describe, expect, it } from 'vitest';

import { buildChatTitlingReminder } from '@mcp-vertex/proposals/lib/swarm/chat-titling-reminder';
import type { IChatTitlingReminderInput } from '@mcp-vertex/proposals/lib/swarm/chat-titling-reminder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal valid `IAgentClosureReport` for tests. The gate's
 * `parseAgentClosureReport` enforces `selfReview === 'pass' &&
 * filesReRead >= 1 && reviewEvidence.length >= 1`; the helper here
 * keeps that invariant. The optional `proposalId` / `taskId` /
 * `summary` are spread in only when the test needs them, so the
 * default is "no proposal context".
 */
const makeReport = (
	overrides: Partial<IChatTitlingReminderInput> = {}
): IChatTitlingReminderInput => ({
	agentName: 'forza_motorsport_2023',
	agentSlot: 'implementation_runner',
	model: 'MiniMax-M3 (customendpoint)',
	selfReview: 'pass',
	filesReRead: 1,
	reviewEvidence: ['vitest run libs/mcp-server'],
	...overrides,
});

// ---------------------------------------------------------------------------
// Heading + technical limitation
// ---------------------------------------------------------------------------

describe('buildChatTitlingReminder — heading and technical limitation', () => {
	it('renders the canonical heading "## Rename chat session reminder"', () => {
		const reminder = buildChatTitlingReminder(makeReport());
		expect(reminder).toContain('## Rename chat session reminder');
	});

	it('documents the technical limitation by mentioning "no `workbench.action.chat.rename`"', () => {
		const reminder = buildChatTitlingReminder(makeReport());
		expect(reminder).toContain('no `workbench.action.chat.rename`');
	});

	it('tells the user to perform the rename manually via the UI ("right-click the editor tab → **Rename**")', () => {
		const reminder = buildChatTitlingReminder(makeReport());
		expect(reminder).toContain('right-click the editor tab → **Rename**');
	});

	it('warns the user about the 40-character cap to avoid sidebar truncation', () => {
		const reminder = buildChatTitlingReminder(makeReport());
		// The reminder must mention BOTH the number 40 and the word
		// "truncat" (covers "truncation" / "truncated" / "truncate").
		expect(reminder).toMatch(/\b40\b/);
		expect(reminder).toMatch(/truncat/i);
	});
});

// ---------------------------------------------------------------------------
// Proposal-bound rendering
// ---------------------------------------------------------------------------

describe('buildChatTitlingReminder — proposal-bound rendering', () => {
	it('substitutes the resolved template "[p41] T2: rename probe" for p41/T2', () => {
		const reminder = buildChatTitlingReminder(
			makeReport({
				proposalId: 'p41',
				taskId: 'T2',
				summary: 'rename probe',
			})
		);
		expect(reminder).toContain('[p41] T2: rename probe');
	});

	it('substitutes the resolved template "[p41] T1: titling prefix" for p41/T1', () => {
		const reminder = buildChatTitlingReminder(
			makeReport({
				proposalId: 'p41',
				taskId: 'T1',
				summary: 'titling prefix',
			})
		);
		expect(reminder).toContain('[p41] T1: titling prefix');
	});

	it('substitutes the resolved template "[p40c] T3: persistent queue smoke" for p40c/T3', () => {
		const reminder = buildChatTitlingReminder(
			makeReport({
				proposalId: 'p40c',
				taskId: 'T3',
				summary: 'persistent queue smoke',
			})
		);
		expect(reminder).toContain('[p40c] T3: persistent queue smoke');
	});

	it('accepts a short prefix well below the 40-char cap without erroring', () => {
		// "[p41] T2: rename" is 8 chars in the visible prefix (counted
		// from the first '[' to just before the first ':') — well
		// below 40, so the cap note should still appear (it always
		// does) but no error / warning must be raised.
		const reminder = buildChatTitlingReminder(
			makeReport({
				proposalId: 'p41',
				taskId: 'T2',
				summary: 'rename',
			})
		);
		expect(reminder).toContain('[p41] T2: rename');
		expect(reminder).toContain('## Rename chat session reminder');
	});

	it('does NOT render the [FREE] branch when a proposalId is present', () => {
		// "proposal-free sessions" is the exact phrase the [FREE]
		// branch uses; the spec asserts it is absent in the proposal
		// branch.
		const reminder = buildChatTitlingReminder(
			makeReport({
				proposalId: 'p41',
				taskId: 'T2',
				summary: 'rename probe',
			})
		);
		expect(reminder).not.toContain('proposal-free sessions');
	});
});

// ---------------------------------------------------------------------------
// [FREE] branch
// ---------------------------------------------------------------------------

describe('buildChatTitlingReminder — [FREE] branch', () => {
	it('renders the [FREE] branch when proposalId is null', () => {
		const reminder = buildChatTitlingReminder(
			makeReport({ proposalId: null, summary: 'ad-hoc debug' })
		);
		expect(reminder).toContain('[FREE]');
		expect(reminder).toContain('proposal-free sessions');
	});

	it('renders the [FREE] branch when proposalId is undefined (field absent)', () => {
		const reminder = buildChatTitlingReminder(makeReport({}));
		expect(reminder).toContain('[FREE]');
		expect(reminder).toContain('proposal-free sessions');
	});

	it('does NOT render the [pNN] template when proposalId is null', () => {
		const reminder = buildChatTitlingReminder(
			makeReport({ proposalId: null, summary: 'ad-hoc debug' })
		);
		// A proposal-bound template would look like "[pNN] T<id>:" with
		// a colon right after the task id. The [FREE] branch does not
		// contain a colon at that position.
		expect(reminder).not.toMatch(/^\s*\[p\d+[a-z0-9-]*\]\s+T[^:]+:\s*$/m);
	});
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

describe('buildChatTitlingReminder — robustness', () => {
	it('never throws on a minimal report (no optional context)', () => {
		expect(() => buildChatTitlingReminder(makeReport())).not.toThrow();
	});

	it('never throws when taskId / summary are missing on a proposal-bound report', () => {
		expect(() =>
			buildChatTitlingReminder(
				makeReport({ proposalId: 'p41', taskId: null, summary: null })
			)
		).not.toThrow();
	});

	it('the rendered block always ends with a trailing newline (safe to concat)', () => {
		const reminder = buildChatTitlingReminder(
			makeReport({
				proposalId: 'p41',
				taskId: 'T2',
				summary: 'rename probe',
			})
		);
		expect(reminder.endsWith('\n')).toBe(true);
	});
});
