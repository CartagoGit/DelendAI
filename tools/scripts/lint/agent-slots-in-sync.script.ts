#!/usr/bin/env bun
/**
 * agent-slots-in-sync.script.ts — fail `bun run validate` the moment
 * `SUBAGENT_SLOTS` (scaffold-host.ts) or `AGENT_CANONICAL_ROLES`
 * (agent-conventions.ts) drifts from the single source of truth
 * `AGENT_SLOTS` (packages/core/src/lib/agents/agent-slots.ts).
 *
 * Why a text-based check instead of an AST import:
 *
 *   - `packages/core/src/public/index.ts` is mid-refactor (x00199) and
 *     cannot yet re-export `AGENT_SLOTS`. Until that lands, the three
 *     declarations live in three different workspaces with no shared
 *     compile-time graph between them.
 *   - The check below reads each array literal as text via regex,
 *     normalises it, and asserts that the union of declared slots equals
 *     `AGENT_SLOTS` and that no slot from outside `AGENT_SLOTS` appears
 *     in the duplicates. The duplication is intentional and allowed;
 *     silent drift is what we forbid.
 *
 * Exits 0 when all three arrays are in sync, 1 otherwise. Integrates
 * with `bun run lint:agents` so it runs as part of `bun run validate`.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

type Target = {
	readonly label: string;
	readonly path: string;
	readonly pattern: RegExp;
	readonly expectedSize: number;
	readonly includeOrchestrator: boolean;
};

const TARGETS: readonly Target[] = [
	{
		label: 'SUBAGENT_SLOTS in packages/core/src/lib/scaffold/scaffold-host.ts',
		path: 'packages/core/src/lib/scaffold/scaffold-host.ts',
		// Capture the body of `const SUBAGENT_SLOTS = [ … ] as const;`.
		// Non-greedy match so trailing semicolons / other constants don't
		// bleed into the capture.
		pattern: /const SUBAGENT_SLOTS\s*=\s*\[([\s\S]*?)\]\s*as const/u,
		expectedSize: 4,
		includeOrchestrator: false,
	},
	{
		label: 'AGENT_CANONICAL_ROLES in plugins/proposals/src/lib/shared/agent-conventions.ts',
		path: 'plugins/proposals/src/lib/shared/agent-conventions.ts',
		pattern:
			/export const AGENT_CANONICAL_ROLES\s*=\s*\[([\s\S]*?)\]\s*as const/u,
		expectedSize: 5,
		includeOrchestrator: true,
	},
] as const;

const parseSlots = (raw: string): readonly string[] =>
	raw
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.map((part) => part.replace(/^['"]|['"]$/g, ''));

const fail = (message: string): never => {
	console.error(`agent-slots-in-sync: ${message}`);
	process.exit(1);
};

const main = async (): Promise<void> => {
	const sourceOfTruthPath = resolve(
		ROOT,
		'packages/core/src/lib/contracts/constants/agent-slots.constant.ts',
	);
	const sourceOfTruthSource = await readFile(sourceOfTruthPath, 'utf-8');
	const sourceOfTruthMatch = sourceOfTruthSource.match(
		/export const AGENT_SLOTS\s*=\s*\[([\s\S]*?)\]\s*as const/u,
	);
	if (sourceOfTruthMatch === null) {
		fail(
			`could not locate AGENT_SLOTS array in ${sourceOfTruthPath}; the single source of truth file may be malformed.`,
		);
		return;
	}
	const sourceOfTruth = parseSlots(sourceOfTruthMatch[1] ?? '');
	if (sourceOfTruth.length === 0) {
		fail(`AGENT_SLOTS in ${sourceOfTruthPath} is empty.`);
	}
	if (!sourceOfTruth.includes('orchestrator')) {
		fail(
			`AGENT_SLOTS in ${sourceOfTruthPath} must include 'orchestrator' as the root slot.`,
		);
	}

	const sourceOfTruthSet = new Set(sourceOfTruth);

	for (const target of TARGETS) {
		const filePath = resolve(ROOT, target.path);
		const source = await readFile(filePath, 'utf-8');
		const match = source.match(target.pattern);
		if (match === null) {
			fail(
				`could not locate the slot array in ${target.label}; the file may have been refactored and this lint needs an update.`,
			);
			return;
		}
		const slots = parseSlots(match[1] ?? '');
		if (slots.length !== target.expectedSize) {
			fail(
				`${target.label}\n    expected ${target.expectedSize} slots, found ${slots.length}: [${slots.join(', ')}]`,
			);
		}
		const includesOrchestrator = slots.includes('orchestrator');
		if (includesOrchestrator !== target.includeOrchestrator) {
			fail(
				`${target.label}\n    expected to ${target.includeOrchestrator ? 'include' : 'exclude'} 'orchestrator', found [${slots.join(', ')}]`,
			);
		}
		const drift = slots.filter((slot) => !sourceOfTruthSet.has(slot));
		if (drift.length > 0) {
			fail(
				`${target.label}\n    contains slots not in AGENT_SLOTS: [${drift.join(', ')}]\n    AGENT_SLOTS is: [${sourceOfTruth.join(', ')}]`,
			);
		}
		console.log(
			`agent-slots-in-sync: OK — ${target.label} (${slots.length} slots, ${includesOrchestrator ? 'with' : 'without'} orchestrator)`,
		);
	}

	console.log(
		`agent-slots-in-sync: OK — all ${TARGETS.length} duplicates are in sync with AGENT_SLOTS.`,
	);
};

await main();
