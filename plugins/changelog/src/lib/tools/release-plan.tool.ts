/**
 * f00131 S2.b — `release_plan` tool.
 *
 * Read-only preview of the internal mcp-vertex publish-order. The plugin
 * exposes the same `PUBLISH_ORDER` + `computeReleasePlan` semantics the
 * project's own release script uses, so an adopter can ask "what would my
 * release look like?" without granting consent for npm publish.
 *
 * The tool accepts an injected `publishOrder` (defaults to the canonical
 * `PUBLISH_ORDER` snapshot the project ships with) plus an injected
 * `inferBump` (the pure function from `./bump`). Tests inject both.
 *
 * Output is `{ ok, kind, from, to, entries[] }` mirroring
 * `computeReleasePlan`'s `IReleasePlan`. Never throws on unknown commit
 * types or empty ranges — returns the corresponding typed envelope.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import {
	inferBump,
	type IBumpInference,
	type IBumpKind,
} from '../bump/infer-bump';
import type { IConventionalCommit } from '../render';

export interface IPublishOrderEntry {
	readonly dir: string;
	readonly name: string;
	readonly version: string;
}

export interface IReleasePlanOutput {
	readonly dir: string;
	readonly name: string;
	readonly from: string;
	readonly to: string;
}

export interface IReleasePlanToolOptions {
	readonly namespacePrefix: string;
	/** Injectable publish-order snapshot. Defaults to the canonical project order. */
	readonly publishOrder?: readonly IPublishOrderEntry[];
	/** Injectable bump inference (defaults to the bundled `inferBump`). */
	readonly inferBump?: (
		commits: readonly IConventionalCommit[],
	) => IBumpInference;
}

const COMMIT_TYPE = z.enum([
	'feat',
	'fix',
	'docs',
	'refactor',
	'perf',
	'test',
	'build',
	'ci',
	'chore',
	'style',
	'revert',
	'breaking',
	'other',
]);

const COMMIT_INPUT = z.object({
	type: COMMIT_TYPE,
	scope: z.string().optional(),
	subject: z.string(),
	body: z.string().optional(),
	breaking: z.boolean(),
	hash: z.string(),
});

const PLAN_ENTRY = z.object({
	dir: z.string(),
	name: z.string(),
	from: z.string(),
	to: z.string(),
});

const OUTPUT = z.object({
	ok: z.literal(true),
	bump: z.enum(['major', 'minor', 'patch', 'none']),
	reason: z.string(),
	considered: z.number().int().min(0),
	from: z.string().optional(),
	to: z.string().optional(),
	entries: z.array(PLAN_ENTRY),
});

const ERROR_OUTPUT = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.string(),
		nextAction: z.string().optional(),
	}),
});

const ALL_OUTPUT = z.union([OUTPUT, ERROR_OUTPUT]);

const INPUT = z.object({
	commits: z.array(COMMIT_INPUT).optional(),
});

const nextVersion = (current: string, kind: IBumpKind): string => {
	const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
	if (m === null) return current;
	let major = Number(m[1]);
	let minor = Number(m[2]);
	let patch = Number(m[3]);
	switch (kind) {
		case 'major':
			major += 1;
			minor = 0;
			patch = 0;
			break;
		case 'minor':
			minor += 1;
			patch = 0;
			break;
		case 'patch':
			patch += 1;
			break;
		case 'none':
			break;
	}
	return `${major}.${minor}.${patch}`;
};

export const buildReleasePlan = (
	publishOrder: readonly IPublishOrderEntry[],
	bump: IBumpInference,
): IReleasePlanOutput[] => {
	// Lockstep: every package moves to the same target as the FIRST
	// publish-order entry (the core anchor). Mirrors the canonical
	// `computeReleasePlan` semantics in `tools/scripts/release/release-plan.ts`
	// so the plugin's preview matches the engine that actually publishes the
	// monorepo. Computing `to` per entry would silently break a 0.x release
	// (e.g. an anchor bump-from-0.1.0 + a plugin pinned at 0.0.1 would
	// otherwise land on 0.1.0 instead of 0.1.1).
	const anchor = publishOrder[0];
	if (anchor === undefined) return [];
	const to = nextVersion(anchor.version, bump.kind);
	return publishOrder.map((p) => ({
		dir: p.dir,
		name: p.name,
		from: p.version,
		to,
	}));
};

export const buildReleasePlanToolRegistration = (
	options: IReleasePlanToolOptions,
): IToolRegistration => {
	const publishOrder = options.publishOrder ?? [];
	const infer = options.inferBump ?? inferBump;

	return {
		id: 'release_plan',
		summary:
			'Preview the ordered release plan (mirrors PUBLISH_ORDER + computeReleasePlan); read-only — no publish.',
		tags: ['changelog', 'release', 'read-only'],
		effects: [],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_release_plan`,
				{
					description:
						'Read-only preview of the next release: infers the semver bump from the supplied commit range, then walks the publish-order list to compute the per-package version transitions. No network, no git side-effects; never publishes.',
					inputSchema: INPUT,
					outputSchema: ALL_OUTPUT,
				},
				async (args) => {
					if (publishOrder.length === 0) {
						return toolError(
							'publish-order-missing',
							'The plugin must be configured with a non-empty `publishOrder` snapshot. Inject one via `options.publishOrder` in tests.',
						);
					}
					const parsed = INPUT.safeParse(args);
					if (!parsed.success) {
						return toolError(
							'invalid-arguments',
							parsed.error.issues
								.map((i) => `${i.path.join('.')}: ${i.message}`)
								.join('; ') || 'Invalid input.',
						);
					}
					const commits = parsed.data.commits ?? [];
					const bump = infer(commits);
					const entries = buildReleasePlan(publishOrder, bump);
					return toolJson(
						OUTPUT.parse({
							ok: true,
							bump: bump.kind,
							reason: bump.reason,
							considered: bump.considered,
							from: entries[0]?.from,
							to: entries[0]?.to,
							entries,
						}),
					);
				},
			);
		},
	};
};
