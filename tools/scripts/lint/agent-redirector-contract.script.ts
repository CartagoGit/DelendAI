#!/usr/bin/env bun
/**
 * agent-redirector-contract.script.ts — f00031 S3: warn (never block —
 * matches lefthook.yml's "warn but never block" policy) when an
 * `*.agent.md` under `.github/agents/` or `.claude/agents/` is neither:
 *
 *  1. a **redirector** — body is the canonical tiny contract that loads
 *     `mcp-vertex_overview` / `recommendedNextAction` and restates
 *     nothing else (the shape `.github/agents/mcp-vertex.agent.md`
 *     and `.claude/agents/mcp-vertex-orchestrator.cc.md` already use),
 *     nor
 *  2. a **bounded subagent** — `name:` is one of the four scaffolded
 *     slots (`proposal_guardian`, `implementation_runner`,
 *     `delivery_verifier`, `technical_investigator`, see
 *     `packages/core/src/lib/scaffold/scaffold-host.ts`'s
 *     `SUBAGENT_SLOTS`) and the body opens with the Copilot-adapter
 *     disclaimer ("This file is only the Copilot adapter; the agent
 *     contract lives in ...").
 *
 * Rationale for the two-shape allowlist (not just the literal
 * redirector body): f00031's own Non-goals says the four bounded
 * subagents "are already redirector-style; this proposal only
 * formalises the pattern" — they intentionally carry a short
 * "Compact lane" checklist (~21 lines) that is *not* the same prose as
 * the single-orchestrator redirector body, so a naive "body must be
 * the literal redirector template" rule would false-positive on
 * exactly the files the proposal says are already compliant.
 *
 * `.claude/agents/*.cc.md` files are excluded entirely from the scan:
 * the `.cc.md` suffix (vs. `.md`) is the project's own convention for
 * "this agent file is not meant to surface in the Claude Code /
 * Copilot per-folder agent index" — see
 * `.claude/agents/mcp-vertex-orchestrator.cc.md`.
 *
 *   bun tools/scripts/lint/agent-redirector-contract.script.ts
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const SUBAGENT_SLOTS = [
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
] as const;

export type ISubagentSlot = (typeof SUBAGENT_SLOTS)[number];

const SUBAGENT_DISCLAIMER =
	'This file is only the Copilot adapter; the agent contract lives in';

/** Body line budget for a hand-rolled `.github/agents/*.agent.md` workflow. */
const MAX_REDIRECTOR_PROSE_LINES = 12;

export interface IAgentFileFinding {
	readonly path: string;
	readonly kind: 'not-a-redirector' | 'mcp-vertex-name-not-redirector';
	readonly detail: string;
}

/** Splits `---\nfrontmatter\n---\nbody` into its two halves. Returns the whole text as body if there is no frontmatter fence. */
const splitFrontmatter = (
	text: string,
): { frontmatter: string; body: string } => {
	if (!text.startsWith('---')) return { frontmatter: '', body: text };
	const end = text.indexOf('\n---', 3);
	if (end === -1) return { frontmatter: '', body: text };
	const frontmatter = text.slice(3, end).trim();
	const body = text.slice(end + 4).trim();
	return { frontmatter, body };
};

const frontmatterField = (
	frontmatter: string,
	field: string,
): string | undefined => {
	const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
	const match = re.exec(frontmatter);
	return match?.[1]?.trim();
};

const isBoundedSubagent = (frontmatter: string, body: string): boolean => {
	const name = frontmatterField(frontmatter, 'name');
	if (name === undefined) return false;
	if (!SUBAGENT_SLOTS.includes(name as ISubagentSlot)) return false;
	return body.includes(SUBAGENT_DISCLAIMER);
};

const isRedirectorBody = (body: string): boolean => {
	// Canonical shape: a short heading, then prose that defers entirely
	// to mcp-vertex / AGENTS.md / skills — never restates a workflow.
	// We don't pin the exact wording (it varies slightly per client),
	// only the budget: short, and it must not contain numbered-step
	// "## Compact lane" / "## Working loop" style restatements that
	// belong to a hand-rolled workflow instead of a redirector.
	const lines = body.split('\n').filter((l) => l.trim().length > 0);
	if (lines.length > MAX_REDIRECTOR_PROSE_LINES) return false;
	const hasNumberedWorkflow = /^\s*\d+\.\s/m.test(body);
	return !hasNumberedWorkflow;
};

/**
 * Inspects one `.github/agents/*.agent.md` file. Pure over its text
 * input so it is unit-testable with fixtures instead of real files.
 */
export const checkGithubAgentFile = (
	path: string,
	text: string,
): IAgentFileFinding | undefined => {
	const { frontmatter, body } = splitFrontmatter(text);
	if (isBoundedSubagent(frontmatter, body)) return undefined;
	if (isRedirectorBody(body)) return undefined;
	return {
		path,
		kind: 'not-a-redirector',
		detail: `${path} is neither a redirector (<= ${MAX_REDIRECTOR_PROSE_LINES} prose lines, no numbered workflow) nor a bounded subagent (name in [${SUBAGENT_SLOTS.join(', ')}] + Copilot-adapter disclaimer)`,
	};
};

/**
 * Inspects one `.claude/agents/*.md` file (non-`.cc.md`). Warns only
 * when its `name:` starts with `mcp-vertex` but the body is not the
 * canonical redirector shape.
 */
export const checkClaudeAgentFile = (
	path: string,
	text: string,
): IAgentFileFinding | undefined => {
	const { frontmatter, body } = splitFrontmatter(text);
	const name = frontmatterField(frontmatter, 'name');
	if (name === undefined || !name.startsWith('mcp-vertex')) return undefined;
	if (isRedirectorBody(body)) return undefined;
	return {
		path,
		kind: 'mcp-vertex-name-not-redirector',
		detail: `${path} has name: "${name}" (mcp-vertex*) but its body is not the redirector shape (<= ${MAX_REDIRECTOR_PROSE_LINES} prose lines, no numbered workflow)`,
	};
};

const listMarkdownFiles = async (
	dirAbs: string,
	extension: string,
): Promise<string[]> => {
	const entries = await readdir(dirAbs).catch(() => []);
	return entries
		.filter((e) => e.endsWith(extension))
		.sort((a, b) => a.localeCompare(b));
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const root = resolve(import.meta.dirname, '..', '..', '..');
	const githubAgentsDir = join(root, '.github', 'agents');
	const claudeAgentsDir = join(root, '.claude', 'agents');

	void (async () => {
		const findings: IAgentFileFinding[] = [];

		for (const file of await listMarkdownFiles(
			githubAgentsDir,
			'.agent.md',
		)) {
			const path = `.github/agents/${file}`;
			const text = await readFile(join(githubAgentsDir, file), 'utf8');
			const finding = checkGithubAgentFile(path, text);
			if (finding) findings.push(finding);
		}

		for (const file of await listMarkdownFiles(claudeAgentsDir, '.md')) {
			if (file.endsWith('.cc.md')) continue; // opted out of the index by convention
			const path = `.claude/agents/${file}`;
			const text = await readFile(join(claudeAgentsDir, file), 'utf8');
			const finding = checkClaudeAgentFile(path, text);
			if (finding) findings.push(finding);
		}

		if (findings.length > 0) {
			console.warn(
				`⚠ agent-redirector-contract: ${findings.length} warning(s) (advisory, does not fail the build):`,
			);
			for (const f of findings) console.warn(`  [${f.kind}] ${f.detail}`);
			return;
		}
		console.log(
			'✓ agent-redirector-contract: every agent file is a redirector or a bounded subagent.',
		);
	})();
}
