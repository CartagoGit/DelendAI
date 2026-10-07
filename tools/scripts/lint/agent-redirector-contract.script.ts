#!/usr/bin/env bun
/**
 * agent-redirector-contract.script.ts — f00031 S3: warns (advisory,
 * matches lefthook.yml's "warn but never block" policy) when an
 * `*.agent.md` under `.github/agents/` or `.claude/agents/` is neither:
 *
 *  1. a **redirector** — body is the canonical tiny contract that loads
 *     `delendai_overview` / `recommendedNextAction` and restates
 *     nothing else (the shape `.github/agents/delendai.agent.md`
 *     already uses),
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
 * x00201 S3: two finding kinds are the exception to "warn, never block" —
 * `missing-redirector` and `subagent-user-invocable-not-false` fail the
 * build (`isFatalFinding`). Both guard the one property this whole
 * contract exists for (exactly one visible orchestrator entry); every
 * other kind stays advisory, unchanged from f00031.
 *
 * `.claude/agents/*.cc.md` files are excluded entirely from the scan:
 * the `.cc.md` suffix (vs. `.md`) is the project's own convention for
 * "this agent file is not meant to surface in the Claude Code
 * per-folder agent index". (Note: VS Code Copilot does NOT honour the
 * `.cc.md` suffix — it scans every `.md` under `.claude/agents/`, so
 * the file deletion in commit 20629849 was necessary in addition to
 * the suffix to keep VS Code's agent picker clean. See f00031.)
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

/**
 * Per-slot expected filename under `.github/agents/`. Bounded subagents
 * in this repo are namespaced as `delendai-<slot>.agent.md` to avoid
 * collisions in workspaces that host multiple MCP servers (e.g.
 * `delendai` + `mcp-other`). The slot id (frontmatter `name:`) stays
 * unprefixed because that is the key the swarm uses for agent_lock,
 * task_queue, and the agent-registry store.
 */
export const SUBAGENT_FILE_BY_SLOT: Readonly<Record<ISubagentSlot, string>> = {
	proposal_guardian: 'delendai-proposal-guardian.agent.md',
	implementation_runner: 'delendai-implementation-runner.agent.md',
	delivery_verifier: 'delendai-delivery-verifier.agent.md',
	technical_investigator: 'delendai-technical-investigator.agent.md',
};

const SUBAGENT_DISCLAIMER =
	'This file is only the Copilot adapter; the agent contract lives in';

/** Body line budget for a hand-rolled `.github/agents/*.agent.md` workflow. */
const MAX_REDIRECTOR_PROSE_LINES = 12;

/**
 * x00201 S3: the canonical redirector filename for THIS repo's own
 * dogfood — the single Copilot-visible entry point f00031 established.
 * A project adopting delendai under a different namespace has its own
 * `<namespacePrefix>.agent.md`; this constant only governs delendai's
 * own self-check (`isMainModule()` block below), not the reusable
 * `checkGithubAgentFile` / `checkClaudeAgentFile` functions other
 * projects' tooling could call with their own filename.
 */
const CANONICAL_REDIRECTOR_FILE = 'delendai.agent.md';

export interface IAgentFileFinding {
	readonly path: string;
	readonly kind:
		| 'not-a-redirector'
		| 'delendai-name-not-redirector'
		| 'subagent-filename-mismatch'
		| 'missing-redirector'
		| 'subagent-user-invocable-not-false';
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

/**
 * x00201 S3: `scaffoldAgentFile` (scaffold-host.ts) emits
 * `user-invocable: false` for every bounded subagent so it never
 * duplicates the orchestrator in the Copilot agent picker — the whole
 * point of the redirector contract (f00031). Nothing previously verified
 * a hand-authored `.github/agents/*.agent.md` actually kept that flag;
 * delendai's own dogfood files drifted to `user-invocable: true` on
 * all four without this check ever catching it.
 */
const hasUserInvocableFalse = (frontmatter: string): boolean =>
	frontmatterField(frontmatter, 'user-invocable') === 'false';

const isRedirectorBody = (body: string): boolean => {
	// Canonical shape: a short heading, then prose that defers entirely
	// to delendai / AGENTS.md / skills — never restates a workflow.
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
 *
 * For bounded subagents (name in SUBAGENT_SLOTS) the filename must
 * match the namespaced shape `delendai-<slot>.agent.md` — see
 * SUBAGENT_FILE_BY_SLOT. Filename drift is the historical regression
 * that produced the 5+ duplicate entries in the VS Code agent
 * picker; the lint keeps it from coming back.
 */
export const checkGithubAgentFile = (
	path: string,
	text: string,
): IAgentFileFinding | undefined => {
	const { frontmatter, body } = splitFrontmatter(text);
	const name = frontmatterField(frontmatter, 'name');
	const expectedFile =
		name === undefined
			? undefined
			: SUBAGENT_SLOTS.includes(name as ISubagentSlot)
				? SUBAGENT_FILE_BY_SLOT[name as ISubagentSlot]
				: undefined;
	if (
		expectedFile !== undefined &&
		!path.endsWith(`.github/agents/${expectedFile}`)
	) {
		return {
			path,
			kind: 'subagent-filename-mismatch',
			detail: `${path} has name: "${name}" (a bounded subagent slot) but the filename should be ".github/agents/${expectedFile}" (the namespaced shape)`,
		};
	}
	if (isBoundedSubagent(frontmatter, body)) {
		if (hasUserInvocableFalse(frontmatter)) return undefined;
		return {
			path,
			kind: 'subagent-user-invocable-not-false',
			detail: `${path} is a bounded subagent (name: "${name}") but does not declare "user-invocable: false" — it will duplicate the orchestrator in the Copilot agent picker, the exact thing the redirector contract (f00031) exists to prevent`,
		};
	}
	if (isRedirectorBody(body)) return undefined;
	return {
		path,
		kind: 'not-a-redirector',
		detail: `${path} is neither a redirector (<= ${MAX_REDIRECTOR_PROSE_LINES} prose lines, no numbered workflow) nor a bounded subagent (name in [${SUBAGENT_SLOTS.join(', ')}] + Copilot-adapter disclaimer)`,
	};
};

/**
 * Inspects one `.claude/agents/*.md` file (non-`.cc.md`). Warns only
 * when its `name:` starts with `delendai` but the body is not the
 * canonical redirector shape.
 */
export const checkClaudeAgentFile = (
	path: string,
	text: string,
): IAgentFileFinding | undefined => {
	const { frontmatter, body } = splitFrontmatter(text);
	const name = frontmatterField(frontmatter, 'name');
	if (name === undefined || !name.startsWith('delendai')) return undefined;
	if (isRedirectorBody(body)) return undefined;
	return {
		path,
		kind: 'delendai-name-not-redirector',
		detail: `${path} has name: "${name}" (delendai*) but its body is not the redirector shape (<= ${MAX_REDIRECTOR_PROSE_LINES} prose lines, no numbered workflow)`,
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

/**
 * x00201 S3: findings whose absence is the whole point of the check
 * (a missing redirector, a subagent that WILL duplicate it in the
 * picker) fail the build. Everything else stays advisory, matching the
 * "warn but never block" policy this script has always documented —
 * this is a deliberate, narrow exception for the two regressions this
 * proposal was written to close, not a blanket tightening of every
 * finding kind.
 */
const FATAL_FINDING_KINDS: ReadonlySet<IAgentFileFinding['kind']> = new Set([
	'missing-redirector',
	'subagent-user-invocable-not-false',
]);

export const isFatalFinding = (kind: IAgentFileFinding['kind']): boolean =>
	FATAL_FINDING_KINDS.has(kind);

/**
 * x00201 S3: `agent-redirector-contract`'s own checks only ever inspect
 * files that exist — 271c7cf5 deleted `delendai.agent.md` (f00031's
 * single-orchestrator redirector) and nothing caught it, because an
 * absence was invisible to a check that only walks present files. This
 * closes that blind spot for delendai's own dogfood only (a generic
 * adopter project has its own differently-named redirector).
 */
export const checkCanonicalRedirectorPresent = (
	githubAgentFiles: readonly string[],
): IAgentFileFinding | undefined => {
	if (githubAgentFiles.includes(CANONICAL_REDIRECTOR_FILE)) return undefined;
	const path = `.github/agents/${CANONICAL_REDIRECTOR_FILE}`;
	return {
		path,
		kind: 'missing-redirector',
		detail: `${path} is missing — f00031's single-orchestrator redirector contract requires it to exist so the Copilot agent picker shows exactly one delendai entry. Restore it (see develop, or git log -- ${path}) instead of adding a new one.`,
	};
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
		const githubAgentFiles = await listMarkdownFiles(
			githubAgentsDir,
			'.agent.md',
		);

		for (const file of githubAgentFiles) {
			const path = `.github/agents/${file}`;
			const text = await readFile(join(githubAgentsDir, file), 'utf8');
			const finding = checkGithubAgentFile(path, text);
			if (finding) findings.push(finding);
		}

		const missingRedirector =
			checkCanonicalRedirectorPresent(githubAgentFiles);
		if (missingRedirector) findings.push(missingRedirector);

		for (const file of await listMarkdownFiles(claudeAgentsDir, '.md')) {
			if (file.endsWith('.cc.md')) continue; // opted out of the index by convention
			const path = `.claude/agents/${file}`;
			const text = await readFile(join(claudeAgentsDir, file), 'utf8');
			const finding = checkClaudeAgentFile(path, text);
			if (finding) findings.push(finding);
		}

		const fatal = findings.filter((f) => isFatalFinding(f.kind));
		const advisory = findings.filter((f) => !isFatalFinding(f.kind));

		if (advisory.length > 0) {
			console.warn(
				`⚠ agent-redirector-contract: ${advisory.length} warning(s) (advisory, does not fail the build):`,
			);
			for (const f of advisory) console.warn(`  [${f.kind}] ${f.detail}`);
		}

		if (fatal.length > 0) {
			console.error(
				`✖ agent-redirector-contract: ${fatal.length} FATAL finding(s) — the single-orchestrator contract (f00031) is broken:`,
			);
			for (const f of fatal) console.error(`  [${f.kind}] ${f.detail}`);
			process.exit(1);
		}

		if (advisory.length === 0) {
			console.log(
				'✓ agent-redirector-contract: every agent file is a redirector or a bounded subagent.',
			);
		}
	})();
}
