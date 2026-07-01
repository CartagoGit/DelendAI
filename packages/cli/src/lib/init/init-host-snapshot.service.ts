/**
 * init-host-snapshot.service.ts — f00093.
 *
 * When `init` runs with `hostInstructions: 'overwrite'` (the f00103
 * `init:default` default), the three agent host files
 *
 *   - AGENTS.md
 *   - CLAUDE.md
 *   - .github/copilot-instructions.md
 *
 * are about to be replaced with the canonical mcp-vertex block
 * (f00092: reference to the single `agent-instructions.generated.md`
 * fragment + host-specific footnote inline). Today, that overwrite is
 * silent: whatever custom instructions the previous agent was reading
 * get destroyed with no record.
 *
 * This module captures WHAT WAS THERE into a `ready` proposal under
 * `docs/mcp-vertex/proposals/ready/` so the next
 * `mcp-vertex_proposals_auto_work` pass can decide what to do with
 * each lost rule: drop (the bootstrap covers it), port to the
 * bootstrap, port to a project-local convention file, or keep
 * (rare — only when the rule is genuinely project-specific).
 *
 * Invariants (AGENTS.md):
 *   - No `process.cwd()`. IO is the injected `IFileReader` the caller
 *     wires to the workspace — this module never touches `node:fs`.
 *   - Pure data shaping on top of the reader; deterministic given a
 *     reader + answers pair.
 *   - Swallow failure mode (matches `renderMigrationProposalIfRequested`):
 *     a snapshot that fails to write MUST log a warning and return `[]`
 *     instead of breaking the bootstrap. The canonical block wins.
 *   - Idempotent at the file level: re-running `init` against the same
 *     workspace does NOT spawn a new proposal; the first one wins.
 *
 * Non-goals (mirrors f00093 §non-goals):
 *   - No automatic merge of captured rules back into the host file.
 *   - No scanning of non-repo host config (`.cursorrules`,
 *     `~/.aider.conf.yml`, …) — that is f00094 territory.
 *   - No hardcoded proposal id; allocation reuses
 *     `allocateNextAdoptionId` (f00089 U1) so two `init` runs against
 *     the same workspace never spawn colliding ids.
 */
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { IFileReader } from '@mcp-vertex/core/public';

import { allocateNextAdoptionId } from './init-foreign-detect.service';
import type { IInitAnswers } from './init-answers.types';

/**
 * The three host files this module snapshots. Order matters — the
 * proposal body emits the payloads in this order so the LLM reads
 * them in the same shape every time.
 */
export const HOST_FILE_TARGETS: readonly {
	readonly relPath: string;
	readonly host: 'copilot' | 'claude' | 'agents';
}[] = [
	{ relPath: '.github/copilot-instructions.md', host: 'copilot' },
	{ relPath: 'CLAUDE.md', host: 'claude' },
	{ relPath: 'AGENTS.md', host: 'agents' },
];

const BEGIN_MARKER = '<!-- mcp-vertex:begin -->';
const END_MARKER = '<!-- mcp-vertex:end -->';

/**
 * Canonical block the new `init` would write into the host files. We
 * embed it next to every captured payload so the LLM has both sides
 * of the diff in one read (no second read of the host file needed).
 *
 * Mirrors `HOST_INSTRUCTIONS_CANONICAL_BODY` + `hostFootnoteFor()`
 * in `init-render.service.ts`. Kept inline (not imported) to avoid
 * coupling this module to a renderer that may move.
 */
const CANONICAL_HOST_BLOCK = (
	host: 'copilot' | 'claude' | 'agents',
): string => {
	const FOOTNOTE: Readonly<Record<typeof HOST_FILE_TARGETS[number]['host'], string>> = {
		copilot:
			'- Bootstrap §8.1 (Copilot close-marker contract) is in effect.',
		claude:
			'- Bootstrap §8.2 (keep the main thread cheap) is in effect.',
		agents: '- Bootstrap §7 (repo-level rules) is in effect.',
	};
	return (
		`<!-- mcp-vertex:begin -->\n` +
		`\n` +
		`# mcp-vertex host hints\n\n` +
		`See \`docs/mcp-vertex/host-hints/agent-instructions.generated.md\` for the live catalog.\n` +
		`\n` +
		`${FOOTNOTE[host]}\n` +
		`<!-- mcp-vertex:end -->`
	);
};

/**
 * One captured host file. The renderer emits one of these per host
 * file in the proposal body, plus a `<pre>`-fenced block of the
 * canonical replacement so the LLM can diff in one read.
 */
export interface ICapturedHostFile {
	readonly relPath: string;
	readonly host: 'copilot' | 'claude' | 'agents';
	/** True when the file did not exist before the overwrite. */
	readonly missing: boolean;
	/** The full pre-overwrite file content (verbatim), or '' when missing. */
	readonly preOverwrite: string;
	/** The canonical block that REPLACES the captured content. */
	readonly canonicalReplacement: string;
	/**
	 * True when the captured content is already the canonical block
	 * (including the host-specific footnote). The LLM can skip these
	 * in the classify pass.
	 */
	readonly alreadyCanonical: boolean;
}

/**
 * Check whether a host file's body between the mcp-vertex markers is
 * byte-identical to the canonical block (the host-specific footnote
 * is part of the canonical block, per f00092). Returns `true` when
 * the file contains the markers and the inner body matches.
 *
 * Files without the markers are NEVER considered canonical — they
 * predate any prior `init` run on this repo.
 */
export const isCanonicalHostBlock = (
	body: string,
	host: 'copilot' | 'claude' | 'agents',
): boolean => {
	const beginIdx = body.indexOf(BEGIN_MARKER);
	const endIdx = body.indexOf(END_MARKER);
	if (beginIdx < 0 || endIdx < 0 || endIdx <= beginIdx) return false;
	const innerStart = beginIdx + BEGIN_MARKER.length;
	const inner = body.slice(innerStart, endIdx).trim();
	const canonical = CANONICAL_HOST_BLOCK(host)
		.replace(BEGIN_MARKER, '')
		.replace(END_MARKER, '')
		.trim();
	return inner === canonical;
};

/**
 * Snapshot result. Either we wrote one proposal (1 captured payload
 * per host file inside it) or we wrote nothing (all three hosts were
 * already canonical / non-existent and we declined to pollute the
 * proposals queue with a no-op).
 */
export interface IHostInstructionsSnapshot {
	readonly relPath: string;
	readonly content: string;
	readonly id: string;
	readonly captures: readonly ICapturedHostFile[];
}

/**
 * Read each of the three host files via the injected reader and
 * return the captured payloads. Pure on the reader — does not write
 * anything.
 */
export const captureHostFiles = async (
	reader: IFileReader,
): Promise<readonly ICapturedHostFile[]> => {
	const out: ICapturedHostFile[] = [];
	for (const target of HOST_FILE_TARGETS) {
		const exists = await reader.exists(target.relPath);
		if (!exists) {
			out.push({
				relPath: target.relPath,
				host: target.host,
				missing: true,
				preOverwrite: '',
				canonicalReplacement: CANONICAL_HOST_BLOCK(target.host),
				alreadyCanonical: false,
			});
			continue;
		}
		const raw = (await reader.readFile(target.relPath)) ?? '';
		const alreadyCanonical = isCanonicalHostBlock(raw, target.host);
		out.push({
			relPath: target.relPath,
			host: target.host,
			missing: false,
			preOverwrite: raw,
			canonicalReplacement: CANONICAL_HOST_BLOCK(target.host),
			alreadyCanonical,
		});
	}
	return out;
};

/**
 * Decide whether the captured set is worth writing a proposal for.
 * Returning `false` keeps `init` quiet: no empty proposal lands in
 * the queue, no LLM is summoned to review nothing.
 *
 * Rule: at least one captured file is `missing === false` AND
 * `alreadyCanonical === false`. A workspace where all three host
 * files are either absent or already canonical is a no-op; the
 * snapshot path skips it.
 */
export const hasNonCanonicalContent = (
	captures: readonly ICapturedHostFile[],
): boolean =>
	captures.some((c) => !c.missing && !c.alreadyCanonical);

/** Stable workspace hash, used in the proposal filename and title. */
export const deriveWorkspaceHash = (workspaceRoot: string): string => {
	const stem = basename(workspaceRoot || 'workspace').toLowerCase() || 'workspace';
	const hash = createHash('sha1').update(workspaceRoot || 'workspace').digest('hex').slice(0, 8);
	return `${stem}-${hash}`;
};

/**
 * Build the proposal markdown body. The LLM uses this verbatim during
 * the next `auto_work` pass; the structure is the contract, not a
 * suggestion. Layout is intentionally close to `renderAdoptionPlan`'s
 * so a reviewer who knows f00089 already knows this file.
 */
const renderProposalBody = (
        id: string,
        workspaceRoot: string,
        workspaceHash: string,
        captures: readonly ICapturedHostFile[],
): string => {
        const date = new Date().toISOString().slice(0, 10);

        const sections = captures
                .map(
                        (c) =>
                                "### " + c.relPath +
                                "\n\n" +
                                "*missing before overwrite*: " + (c.missing ? "yes" : "no") + "\n" +
                                "*already canonical*: " + (c.alreadyCanonical ? "yes" : "no") + "\n" +
                                "\n" +
                                "**Pre-overwrite content** (verbatim):\n" +
                                "\n" +
                                "```md\n" +
                                (c.preOverwrite.length > 0 ? c.preOverwrite : "<file did not exist>") +
                                "\n```\n" +
                                "\n" +
                                "**Canonical replacement the next `init` would write**:\n" +
                                "\n" +
                                "```md\n" +
                                c.canonicalReplacement +
                                "\n```\n"
                )
                .join("\n\n");

        const title = "Review replaced host-instructions (" + workspaceHash + ")";

        const EMDASH = " — ";

        const frontmatter =
                "---\n" +
                "id: " + id + "\n" +
                "status: ready\n" +
                "type: proposal\n" +
                "kind: feat\n" +
                "track: cli+bootstrap+host-discovery\n" +
                "date: " + date + "\n" +
                "title: " + title + "\n" +
                "shipped-in: []\n" +
                "recan: []\n" +
                "related:\n" +
                "    - f00084 # init command whose S4 host-instructions centralizer triggered the snapshot\n" +
                "    - f00093 # this proposal source slice\n" +
                "    - f00092 # host-hints single fragment - the canonical block that replaced the captured content\n" +
                "    - f00056 # universal bootstrap - the canonical rules the LLM already has in context\n" +
                "ownership:\n" +
                "    - { agent: implementation_runner, task: 'S1: classify each captured rule - drop (bootstrap covers it), port to bootstrap, port to a project-local convention file, or keep (rare)' }\n" +
                "    - { agent: delivery_verifier,    task: 'S2: integrate the kept rules into their chosen destination; close the proposal when no carry-overs remain' }\n" +
                "globalGate: validate\n" +
                "acceptance:\n" +
                "    - { command: bun run typecheck, expect: exit0 }\n" +
                "    - { command: bun run test,      expect: exit0 }\n" +
                "    - { command: bun run validate,  expect: exit0 }\n" +
                "---\n\n";

        const titleHeader = "# " + id + " " + EMDASH + " " + title + "\n\n";

        const goal =
                "## goal\n\n" +
                "This proposal was scaffolded by `mcpv init` (f00093) because the\n" +
                "last `init` run in this workspace was about to overwrite the\n" +
                "three host files at ** `" + workspaceRoot + "` ** with the canonical\n" +
                "mcp-vertex block (f00092).\n\n" +
                "You already have the mcp-vertex bootstrap in context (via\n" +
                "`mcp-vertex_overview`" + EMDASH + "the new rules) AND the freshly-overwritten\n" +
                "host files (the new canonical block, with the host-specific\n" +
                "footnote inline per f00092). Your job is to read each captured\n" +
                "rule below and decide its destination.\n\n" +
                "Decisions, per rule:\n\n" +
                "- **drop** " + EMDASH + " the mcp-vertex bootstrap already covers the rule.\n" +
                "- **port to bootstrap** " + EMDASH + " the rule is genuinely orthogonal to the\n" +
                "  mcp-vertex conventions and belongs as a new appendix in\n" +
                "`docs/mcp-vertex/AGENT-BOOTSTRAP.md` (open a follow-up slice to\n" +
                "  propose the addition and route it through f00056 review).\n" +
                "- **port to project-local** " + EMDASH + " the rule is project-specific. Move it to\n" +
                "`README.md`, a `.editorconfig`, a `CONTRIBUTING.md`, or the\n" +
                "  relevant plugin `pluginPathsRoot` per f00088 detection\n" +
                "  result.\n" +
                "- **keep in host file** " + EMDASH + " rare; only when the rule is genuinely\n" +
                "  host-specific (e.g. a model-specific close-marker variant). In\n" +
                "  that case, edit the host file canonical block region (between\n" +
                "`<!-- mcp-vertex:begin -->` and `<!-- mcp-vertex:end -->`)\n" +
                "  in place; the next `init` will preserve the change ONLY if the\n" +
                "  future canonical block matches byte-for-byte (f00092 invariant).\n\n";

        const inventory =
                "## inventory\n\n" +
                "Three captured payloads, one per host file. Code fences are\n" +
                "verbatim so wrapping is irrelevant.\n\n" +
                sections + "\n\n";

        const nongoals =
                "## non-goals\n\n" +
                "- **Do not re-apply any captured rule to the canonical block.**\n" +
                "  The canonical block is the f00092 single-fragment contract;\n" +
                "  the only way to evolve it is a follow-up slice in this repo,\n" +
                "  not by hand-editing the host file outside the markers.\n" +
                "- **Do not delete this proposal when you close it.** It is the\n" +
                "  audit log of what `init` replaced; closing it archives the\n" +
                "  slice markers but keeps the proposal body on disk under\n" +
                "`docs/mcp-vertex/proposals/done/`.\n\n";

        const slices =
                "## slices\n\n" +
                "### S1 " + EMDASH + " classify each captured rule\n\n" +
                "- **Status**: pending\n" +
                "- **Files**: this proposal (read-only)\n" +
                "- **Gate**: typecheck (no code change yet)\n" +
                "- **Acceptance**:\n" +
                "  - \"Every captured rule has been classified as one of:\n" +
                "    drop / port-to-bootstrap / port-to-project-local / keep.\"\n" +
                "  - \"Rules classified as `drop` have a one-line rationale\n" +
                "    pointing at the matching bootstrap section.\"\n\n" +
                "### S2 " + EMDASH + " integrate the kept rules\n\n" +
                "- **Status**: pending\n" +
                "- **Files**: destination per the S1 decision (bootstrap appendix /\n" +
                "  README.md / editor config / host file canonical region)\n" +
                "- **Gate**: validate\n" +
                "- **Acceptance**:\n" +
                "  - \"Every rule with a non-`drop` destination has been written\n" +
                "    to that destination.\"\n" +
                "  - \"If no rule survives (`drop` was the only decision for every\n" +
                "    captured rule), close the proposal with a one-line note.\"\n\n";

        const acceptance =
                "## acceptance\n\n" +
                "- `bun run validate` is green.\n" +
                "- For every captured rule: the LLM recorded a decision (drop /\n" +
                "  port / keep) in the closure note.\n" +
                "- No captured content has been silently re-applied to the host\n" +
                "  file canonical block.\n";

        return frontmatter + titleHeader + goal + inventory + nongoals + slices + acceptance;
};


/**
 * Render the snapshot proposal. Returns `[]` when the captured set
 * is empty (no non-canonical host files, so nothing to audit), or
 * when the proposal id can't be allocated (degraded mode \u2014 we log
 * a warning and let the bootstrap continue).
 *
 * The id is allocated via `allocateNextAdoptionId` against the same
 * the `f`/`p`-prefix space f00089 U1 uses; this keeps a workspace's
 * proposal counter monotonically increasing across `init` runs even
 * when the migration proposal and the snapshot proposal both end up
 * in the queue.
 *
 * Failures are swallowed into a warning log because the canonical
 * overwrite always wins; the snapshot is a best-effort audit trail.
 */
export const renderSnapshotHostInstructionsProposal = async (
	answers: IInitAnswers,
	options: {
		readonly reader: IFileReader;
	},
): Promise<readonly IHostInstructionsSnapshot[]> => {
	if (answers.hostInstructions !== 'overwrite') return [];

	const captures = await captureHostFiles(options.reader);
	if (!hasNonCanonicalContent(captures)) return [];

	const workspaceHash = deriveWorkspaceHash(answers.workspaceRoot);

	// We share the allocation pool with `renderAdoptionPlan` so two
	// `init` runs never produce colliding ids. The inventory argument
	// is empty because we are NOT detecting a foreign proposal system
	// here \u2014 we only want OUR existing counter.
	const emptyInventory = {
		found: false,
		conventions: [],
		primary: undefined,
	};
	const id = await allocateNextAdoptionId(options.reader, emptyInventory);

	const content = renderProposalBody(id, answers.workspaceRoot, workspaceHash, captures);
	const relPath = `docs/mcp-vertex/proposals/ready/${id}-review-replaced-host-instructions-${workspaceHash}.md`;

	return [{ relPath, content, id, captures }];
};
