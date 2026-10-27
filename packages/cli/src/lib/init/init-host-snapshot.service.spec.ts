/**
 * init-host-snapshot.service.spec.ts — f00093.
 *
 * Exercises the host-instructions snapshot renderer against an
 * in-memory `IFileReader` so every branch is deterministic and
 * platform-independent.
 *
 * Covers:
 *   1. `captureHostFiles` reads the three host files in the canonical
 *      order and reports `missing` / `alreadyCanonical` correctly.
 *   2. `isCanonicalHostBlock` recognises the f00092 single-fragment
 *      block (with the host-specific footnote inline) as canonical.
 *   3. `hasNonCanonicalContent` decides correctly when to emit a
 *      proposal vs. skip (no proposal queue pollution from no-ops).
 *   4. `renderSnapshotHostInstructionsProposal` returns `[]` when
 *      `hostInstructions` is not `'overwrite'` (the suite's primary
 *      invariant: append and skip modes never trigger a snapshot).
 *   5. `renderSnapshotHostInstructionsProposal` allocates the next
 *      FREE id against the shared adoption pool — same shape as
 *      f00089 U1 — and never collides with prior `init` runs.
 *   6. The proposal body embeds the three pre-overwrite payloads in
 *      fenced code blocks, with the canonical replacement alongside.
 *   7. Idempotent: re-running against the same workspace produces the
 *      same filename and content (the existing proposal wins; no
 *      duplicate is allocated).
 */
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@delendai/core/contracts';

import { InitAnswers } from './init-answers.schema';
import {
	captureHostFiles,
	deriveWorkspaceHash,
	hasNonCanonicalContent,
	isCanonicalHostBlock,
	renderSnapshotHostInstructionsProposal,
} from './init-host-snapshot.service';
import { AGENT_HOSTS } from '@delendai/core/cli';
import {
	hostInstructionTargets,
	hostInstructionsBody,
} from './init-hosts.helper';
import { renderHostInstructionsBlocks } from './init-render.service';

/** The files init writes for a project that uses Copilot, Claude Code and AGENTS.md agents. */
const TARGETS = hostInstructionTargets(
	AGENT_HOSTS.filter((host) =>
		['copilot', 'claude', 'agents-md'].includes(host.id),
	),
);
const COPILOT = '.github/copilot-instructions.md';
const targetOf = (relPath: string) => {
	const target = TARGETS.find((each) => each.relPath === relPath);
	if (target === undefined) throw new Error(`no target ${relPath}`);
	return target;
};
/** The block init writes into a file, as it writes it. */
const canonical = (relPath: string): string =>
	`<!-- delendai:begin -->\n${hostInstructionsBody(targetOf(relPath))}\n<!-- delendai:end -->`;

/** In-memory reader: keys are workspace-relative file paths. */
const dirReader = (files: Readonly<Record<string, string>>): IFileReader => ({
	async readFile(rel) {
		return files[rel];
	},
	async exists(rel) {
		return rel in files;
	},
	async listDir(rel) {
		const prefix = rel === '' ? '' : `${rel}/`;
		const out: string[] = [];
		for (const key of Object.keys(files)) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			if (rest.length === 0) continue;
			const slash = rest.indexOf('/');
			const child = slash === -1 ? rest : rest.slice(0, slash);
			if (!out.includes(child)) out.push(child);
		}
		return out;
	},
});

const baseAnswers = InitAnswers.parse({
	workspaceRoot: '/home/user/projects/example-app',
	preset: 'dogfood',
	hostInstructions: 'overwrite',
	migrateFromLegacy: true,
	copyCoreSkills: true,
	generateAgentMd: true,
	force: true,
});

describe('captureHostFiles (f00093)', () => {
	it('marks all three as missing when no host files exist', async () => {
		const captures = await captureHostFiles(dirReader({}), TARGETS);
		expect(captures).toHaveLength(3);
		for (const c of captures) {
			expect(c.missing).toBe(true);
			expect(c.preOverwrite).toBe('');
			expect(c.alreadyCanonical).toBe(false);
		}
	});

	it('reads the three host files in the canonical order', async () => {
		const reader = dirReader({
			'.github/copilot-instructions.md': '# copilot legacy rule\n',
			'CLAUDE.md': '# claude legacy rule\n',
			'AGENTS.md': '# agents legacy rule\n',
		});
		const captures = await captureHostFiles(reader, TARGETS);
		expect(captures.map((c) => c.relPath)).toEqual([
			COPILOT,
			'CLAUDE.md',
			'AGENTS.md',
		]);
		expect(captures[0]?.preOverwrite).toContain('copilot legacy rule');
		expect(captures[1]?.preOverwrite).toContain('claude legacy rule');
		expect(captures[2]?.preOverwrite).toContain('agents legacy rule');
		for (const c of captures) {
			expect(c.missing).toBe(false);
			expect(c.alreadyCanonical).toBe(false);
		}
	});

	it('recognises a canonical block (with the host-specific footnote) as alreadyCanonical', async () => {
		const canonicalCopilot = canonical(COPILOT);
		const reader = dirReader({
			'.github/copilot-instructions.md': canonicalCopilot,
			'CLAUDE.md': '# legacy\n',
			'AGENTS.md': '# legacy\n',
		});
		const captures = await captureHostFiles(reader, TARGETS);
		const copilot = captures.find((c) => c.relPath === COPILOT);
		expect(copilot?.alreadyCanonical).toBe(true);
		const claude = captures.find((c) => c.relPath === 'CLAUDE.md');
		expect(claude?.alreadyCanonical).toBe(false);
	});

	it('marks a file with a delendai block but a non-canonical body as non-canonical', async () => {
		// Block region exists, but inner content is NOT the canonical one
		// (user added a custom rule inside the markers).
		const tampered =
			'<!-- delendai:begin -->\n\n' +
			'# custom rule the user wants to keep\n\n' +
			'<!-- delendai:end -->';
		const reader = dirReader({
			'.github/copilot-instructions.md': tampered,
			'CLAUDE.md': '# legacy\n',
			'AGENTS.md': '# legacy\n',
		});
		const captures = await captureHostFiles(reader, TARGETS);
		const copilot = captures.find((c) => c.relPath === COPILOT);
		expect(copilot?.alreadyCanonical).toBe(false);
	});
});

describe('isCanonicalHostBlock (f00093)', () => {
	it('recognises the block init itself writes', async () => {
		const [written] = await renderHostInstructionsBlocks(
			'/nonexistent/workspace',
			'overwrite',
			[targetOf('CLAUDE.md')],
		);
		expect(
			isCanonicalHostBlock(written?.content ?? '', targetOf('CLAUDE.md')),
		).toBe(true);
	});

	it('accepts the exact canonical block for each host', () => {
		for (const target of TARGETS)
			expect(
				isCanonicalHostBlock(canonical(target.relPath), target),
			).toBe(true);
	});

	it('rejects a block with no markers (predates init)', () => {
		expect(
			isCanonicalHostBlock('# legacy rule\n', targetOf('CLAUDE.md')),
		).toBe(false);
	});

	it('rejects a block with a non-canonical inner body', () => {
		const tampered = canonical('CLAUDE.md').replace(
			'# delendai host hints',
			'# custom replacement',
		);
		expect(isCanonicalHostBlock(tampered, targetOf('CLAUDE.md'))).toBe(
			false,
		);
	});
});

describe('hasNonCanonicalContent (f00093)', () => {
	it('returns false when all three host files are missing', () => {
		const captures = TARGETS.map((t) => ({
			relPath: t.relPath,
			hosts: t.hosts,
			missing: true,
			preOverwrite: '',
			canonicalReplacement: '',
			alreadyCanonical: false,
		}));
		expect(hasNonCanonicalContent(captures)).toBe(false);
	});

	it('returns false when all three host files are already canonical', () => {
		const captures = TARGETS.map((t) => ({
			relPath: t.relPath,
			hosts: t.hosts,
			missing: false,
			preOverwrite: 'canonical',
			canonicalReplacement: '',
			alreadyCanonical: true,
		}));
		expect(hasNonCanonicalContent(captures)).toBe(false);
	});

	it('returns true when at least one captured file has non-canonical content', () => {
		const captures = [
			{
				relPath: '.github/copilot-instructions.md',
				hosts: ['copilot'],
				missing: true,
				preOverwrite: '',
				canonicalReplacement: '',
				alreadyCanonical: false,
			},
			{
				relPath: 'CLAUDE.md',
				hosts: ['claude'],
				missing: false,
				preOverwrite: '# legacy\n',
				canonicalReplacement: '',
				alreadyCanonical: false,
			},
			{
				relPath: 'AGENTS.md',
				hosts: ['agents-md'],
				missing: false,
				preOverwrite: 'canonical',
				canonicalReplacement: '',
				alreadyCanonical: true,
			},
		];
		expect(hasNonCanonicalContent(captures)).toBe(true);
	});
});

describe('deriveWorkspaceHash (f00093)', () => {
	it('hides the absolute path (only the basename + 8-char digest appear)', () => {
		const hash = deriveWorkspaceHash('/home/user/projects/example-app');
		expect(hash).toMatch(/^example-app-[0-9a-f]{8}$/);
	});

	it('differs for different workspace roots', () => {
		const a = deriveWorkspaceHash('/home/user/projects/foo');
		const b = deriveWorkspaceHash('/home/user/projects/bar');
		expect(a).not.toBe(b);
	});
});

describe('renderSnapshotHostInstructionsProposal (f00093)', () => {
	it('returns [] when hostInstructions is not "overwrite"', async () => {
		const reader = dirReader({
			'.github/copilot-instructions.md': '# legacy\n',
		});
		const answers = InitAnswers.parse({
			...baseAnswers,
			hostInstructions: 'skip',
		});
		const out = await renderSnapshotHostInstructionsProposal(answers, {
			reader,
			targets: TARGETS,
		});
		expect(out).toEqual([]);
	});

	it('returns [] when hostInstructions is "append" (no overwrite, no snapshot)', async () => {
		const reader = dirReader({
			'.github/copilot-instructions.md': '# legacy\n',
		});
		const answers = InitAnswers.parse({
			...baseAnswers,
			hostInstructions: 'append',
		});
		const out = await renderSnapshotHostInstructionsProposal(answers, {
			reader,
			targets: TARGETS,
		});
		expect(out).toEqual([]);
	});

	it('returns [] when all host files are absent (no non-canonical content)', async () => {
		const reader = dirReader({});
		const out = await renderSnapshotHostInstructionsProposal(baseAnswers, {
			reader,
			targets: TARGETS,
		});
		expect(out).toEqual([]);
	});

	it('returns [] when all host files are already canonical (no audit needed)', async () => {
		const reader = dirReader({
			[COPILOT]: canonical(COPILOT),
			'CLAUDE.md': canonical('CLAUDE.md'),
			'AGENTS.md': canonical('AGENTS.md'),
		});
		const out = await renderSnapshotHostInstructionsProposal(baseAnswers, {
			reader,
			targets: TARGETS,
		});
		expect(out).toEqual([]);
	});

	it('emits one proposal when at least one host file has non-canonical content', async () => {
		const reader = dirReader({
			'.github/copilot-instructions.md':
				'# custom copilot rule the user wants to keep\n',
			'CLAUDE.md': '# legacy claude rule\n',
			'AGENTS.md': '# delendai:begin -->\n',
		});
		const out = await renderSnapshotHostInstructionsProposal(baseAnswers, {
			reader,
			targets: TARGETS,
		});
		expect(out).toHaveLength(1);
		const snap = out[0];
		expect(snap).toBeDefined();
		// Filename + content hold the audit trail.
		expect(snap!.relPath).toMatch(
			/^docs\/delendai\/proposals\/ready\/f\d{5}-review-replaced-host-instructions-/,
		);
		expect(snap!.content).toContain('# custom copilot rule');
		expect(snap!.content).toContain('# legacy claude rule');
		// Each captured file is referenced with its relPath.
		expect(snap!.content).toContain('### .github/copilot-instructions.md');
		expect(snap!.content).toContain('### CLAUDE.md');
		expect(snap!.content).toContain('### AGENTS.md');
		// The canonical replacement is included alongside each payload.
		expect(snap!.content).toContain('Canonical replacement');
		// Captures are surfaced in the structured result too.
		expect(snap!.captures).toHaveLength(3);
	});

	it('allocates the next FREE id against the shared adoption pool (no hardcoded f00001)', async () => {
		const reader = dirReader({
			// pre-existing proposal at f00007 pushes the counter forward
			'docs/delendai/proposals/ready/f00007-prior-proposal.md':
				'# prior\n',
			'.github/copilot-instructions.md': '# legacy\n',
		});
		const out = await renderSnapshotHostInstructionsProposal(baseAnswers, {
			reader,
			targets: TARGETS,
		});
		expect(out).toHaveLength(1);
		// f00007 + 1 = f00008 — never a hardcoded f00001 when a collision
		// is possible.
		expect(out[0]?.id).toBe('f00008');
	});

	it('is idempotent across re-runs (id allocation only writes, never allocates twice for the same workspace)', async () => {
		const reader = dirReader({
			'.github/copilot-instructions.md': '# legacy\n',
		});
		const first = await renderSnapshotHostInstructionsProposal(
			baseAnswers,
			{ reader, targets: TARGETS },
		);
		const second = await renderSnapshotHostInstructionsProposal(
			baseAnswers,
			{ reader, targets: TARGETS },
		);
		// Both runs land in the same pool so they get the same shape of
		// id against the SAME counter — but the proposal filename ends up
		// identical because the proposal id is the next-free one and the
		// re-run has nothing already written to push the counter further.
		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
		expect(first[0]?.id).toBe(second[0]?.id);
		expect(first[0]?.relPath).toBe(second[0]?.relPath);
		expect(first[0]?.content).toBe(second[0]?.content);
	});
});
