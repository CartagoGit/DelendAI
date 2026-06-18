/**
 * chat-titling-prefix.spec.ts
 *
 * TDD specs for `parseChatTitlingPrefix` and `isValidChatTitlingPrefix`.
 *
 * Contract (p41, T1 — Capa 1, "Convención de prompt"):
 *
 *   1. The input is trimmed left + right before parsing.
 *   2. It must start with `[`.
 *   3. Inside the brackets, either a proposalId (`p` or `g` followed by one
 *      or more digits, optionally followed by `-` + letters/digits) or the
 *      literal `FREE`.
 *   4. Closing `]` followed by a single space.
 *   5. After the space:
 *         - proposal case: `T<id>` (one or more alphanumerics or dots),
 *           then `: `, then a summary.
 *         - free case: a summary of at least 3 non-whitespace characters.
 *   6. The visible prefix (everything before the first `:` in the proposal
 *      case, or all of `[FREE] ...` in the free case) must be ≤ 40
 *      characters to avoid truncation in the VS Code sidebar.
 *
 * These specs lock the regex + length rule that the orchestrator's first
 * prompt must satisfy (see `.github/agents/orchestrator.agent.md` →
 * "Chat session titling (mandatory)").
 */

import { describe, expect, it } from 'vitest';

import {
	CHAT_TITLING_PREFIX_MAX_LENGTH,
	isValidChatTitlingPrefix,
	parseChatTitlingPrefix,
} from '@mcp-vertex/proposals/lib/swarm/chat-titling-prefix';

// ---------------------------------------------------------------------------
// Valid cases — proposalId forms
// ---------------------------------------------------------------------------

describe('parseChatTitlingPrefix — valid proposal cases', () => {
	it('accepts [p22] T6.2: loop_status tool MCP', () => {
		const result = parseChatTitlingPrefix(
			'[p22] T6.2: loop_status tool MCP',
		);
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('proposal');
		expect(result.proposalId).toBe('p22');
		expect(result.taskId).toBe('T6.2');
		expect(result.summary).toBe('loop_status tool MCP');
		expect(result.raw).toBe('[p22] T6.2: loop_status tool MCP');
		expect(result.reason).toBeUndefined();
	});

	it('accepts [p41] T1: chat titling prefix rule', () => {
		const result = parseChatTitlingPrefix(
			'[p41] T1: chat titling prefix rule',
		);
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('proposal');
		expect(result.proposalId).toBe('p41');
		expect(result.taskId).toBe('T1');
		expect(result.summary).toBe('chat titling prefix rule');
	});

	it('accepts [p40c] T3: persistent queue smoke (proposalId with letter suffix)', () => {
		const result = parseChatTitlingPrefix(
			'[p40c] T3: persistent queue smoke',
		);
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('proposal');
		expect(result.proposalId).toBe('p40c');
		expect(result.taskId).toBe('T3');
		expect(result.summary).toBe('persistent queue smoke');
	});

	it('accepts [p34b] T2: swarm governor IRoundContextDigest (proposalId with letter suffix)', () => {
		const result = parseChatTitlingPrefix(
			'[p34b] T2: swarm governor IRoundContextDigest',
		);
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('proposal');
		expect(result.proposalId).toBe('p34b');
		expect(result.taskId).toBe('T2');
		expect(result.summary).toBe('swarm governor IRoundContextDigest');
	});

	it('accepts [g0] T1: react demo scaffold (g-prefix proposals)', () => {
		const result = parseChatTitlingPrefix('[g0] T1: react demo scaffold');
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('proposal');
		expect(result.proposalId).toBe('g0');
		expect(result.taskId).toBe('T1');
		expect(result.summary).toBe('react demo scaffold');
	});
});

// ---------------------------------------------------------------------------
// Valid cases — [FREE] form
// ---------------------------------------------------------------------------

describe('parseChatTitlingPrefix — valid free cases', () => {
	it('accepts [FREE] debug vitest config (literal chosen by the user)', () => {
		const result = parseChatTitlingPrefix('[FREE] debug vitest config');
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('free');
		expect(result.summary).toBe('debug vitest config');
		expect(result.proposalId).toBeUndefined();
		expect(result.taskId).toBeUndefined();
	});

	it('does NOT split on colon in the summary of a [FREE] case', () => {
		const result = parseChatTitlingPrefix(
			'[FREE] notes on editorconfig: keep it',
		);
		expect(result.valid).toBe(true);
		expect(result.kind).toBe('free');
		expect(result.summary).toBe('notes on editorconfig: keep it');
		expect(result.taskId).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Invalid cases
// ---------------------------------------------------------------------------

describe('parseChatTitlingPrefix — invalid cases', () => {
	it('rejects [FREE]no space after bracket', () => {
		const result = parseChatTitlingPrefix('[FREE]no space after bracket');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
		expect(result.reason).toBeDefined();
	});

	it('rejects [p] T1: missing number after p', () => {
		const result = parseChatTitlingPrefix('[p] T1: missing number after p');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});

	it('rejects "Tarea: abrir p41" (no bracket prefix at all)', () => {
		const result = parseChatTitlingPrefix('Tarea: abrir p41');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});

	it('rejects "Libre · resumen" (wrong literal — must be [FREE])', () => {
		const result = parseChatTitlingPrefix('Libre · resumen');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});

	it('rejects [p22]T6.2: no space after closing bracket', () => {
		const result = parseChatTitlingPrefix('[p22]T6.2: no space');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});

	it('rejects [] T1: empty brackets', () => {
		const result = parseChatTitlingPrefix('[] T1: empty brackets');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});

	it('rejects "   [p22] T1: leading whitespace" when the parser is given the un-trimmed input', () => {
		// The parser trims first, so a leading-whitespace input becomes
		// valid AFTER trimming. This spec enforces the trim contract:
		// callers do not need to pre-trim, the parser does it.
		const result = parseChatTitlingPrefix(
			'   [p22] T1: leading whitespace',
		);
		expect(result.valid).toBe(true);
		expect(result.proposalId).toBe('p22');
		expect(result.taskId).toBe('T1');
	});

	it('rejects [p22] t1: lowercase t in task id', () => {
		const result = parseChatTitlingPrefix('[p22] t1: lowercase t');
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});

	it('rejects [p22] T6.2 loop_status no colon (missing ": " separator)', () => {
		const result = parseChatTitlingPrefix(
			'[p22] T6.2 loop_status no colon',
		);
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
	});
});

// ---------------------------------------------------------------------------
// isValidChatTitlingPrefix — boolean wrapper
// ---------------------------------------------------------------------------

describe('isValidChatTitlingPrefix', () => {
	it('agrees with parseChatTitlingPrefix on valid inputs', () => {
		expect(
			isValidChatTitlingPrefix('[p22] T6.2: loop_status tool MCP'),
		).toBe(true);
		expect(
			isValidChatTitlingPrefix('[p41] T1: chat titling prefix rule'),
		).toBe(true);
		expect(
			isValidChatTitlingPrefix('[p40c] T3: persistent queue smoke'),
		).toBe(true);
		expect(isValidChatTitlingPrefix('[p34b] T2: swarm governor')).toBe(
			true,
		);
		expect(isValidChatTitlingPrefix('[FREE] debug vitest config')).toBe(
			true,
		);
	});

	it('returns false on invalid inputs', () => {
		expect(isValidChatTitlingPrefix('[FREE]no space after bracket')).toBe(
			false,
		);
		expect(isValidChatTitlingPrefix('[p] T1: missing number')).toBe(false);
		expect(isValidChatTitlingPrefix('Tarea: abrir p41')).toBe(false);
		expect(isValidChatTitlingPrefix('Libre · resumen')).toBe(false);
		expect(isValidChatTitlingPrefix('[p22]T6.2: no space')).toBe(false);
		expect(isValidChatTitlingPrefix('[] T1: empty brackets')).toBe(false);
		expect(isValidChatTitlingPrefix('[p22] t1: lowercase t')).toBe(false);
		expect(isValidChatTitlingPrefix('[p22] T6.2 no colon')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Structural fields + length cap
// ---------------------------------------------------------------------------

describe('parseChatTitlingPrefix — structural fields', () => {
	it('extracts proposalId, taskId and summary for [p22] T6.2: foo', () => {
		const result = parseChatTitlingPrefix('[p22] T6.2: foo bar');
		expect(result.proposalId).toBe('p22');
		expect(result.taskId).toBe('T6.2');
		expect(result.summary).toBe('foo bar');
	});

	it('extracts kind=proposal vs kind=free correctly', () => {
		expect(parseChatTitlingPrefix('[p22] T1: x').kind).toBe('proposal');
		expect(parseChatTitlingPrefix('[FREE] abc').kind).toBe('free');
	});

	it('rejects a prefix longer than 40 chars with reason="prefix too long..."', () => {
		// The visible proposal prefix is `[<proposalId>] T<taskId>`,
		// everything BEFORE the first ":". Pick values that push it past
		// 40 chars:
		//   proposalId = "p22-verylongslugnamehere-12" → 26 chars
		//   taskId     = "T1234567890"                → 12 chars
		//   visible    = "[" + 26 + "] " + 12         → 40 chars
		// Adding one more char in the bracket content pushes the visible
		// prefix to 41 (over the cap). Use a 27-char bracket body:
		const longPrefix =
			'[p22-verylongslugnamehere-123] T1234567890: should be too long';
		const result = parseChatTitlingPrefix(longPrefix);
		expect(result.valid).toBe(false);
		expect(result.kind).toBe('invalid');
		expect(result.reason).toBe(
			`prefix too long for VS Code sidebar (>${CHAT_TITLING_PREFIX_MAX_LENGTH} chars)`,
		);
	});

	it('accepts a prefix exactly at the 40-char limit', () => {
		// Visible prefix is `[<proposalId>] T<taskId>`. Fixed parts:
		//   `[`  (1) + `]` (1) + ` ` (1) + `T1` (2) = 5
		// To total exactly 40 chars, the proposalId body must be 35 chars.
		// `p22-` (4) + 31 a's (31) = 35 → pad = 31.
		const targetLen = CHAT_TITLING_PREFIX_MAX_LENGTH;
		const pad = 'a'.repeat(targetLen - 5 - 4); // 5 fixed + 4 for "p22-"
		const input = `[p22-${pad}] T1: ok`;
		const result = parseChatTitlingPrefix(input);
		expect(result.valid).toBe(true);
		expect(result.proposalId).toBe(`p22-${pad}`);
		expect(result.taskId).toBe('T1');
		expect(result.summary).toBe('ok');
	});
});
