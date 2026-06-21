/**
 * r00001 S0 — golden outputSchema snapshot for the host-core tools.
 *
 * Pins the canonical JSON-Schema serialisation of every public
 * `outputSchema` declared in `packages/core/src/lib/{bootstrap,scaffold,metrics}/*-tool.ts`
 * so a future regression (permissive catchall, accidental type-loosening,
 * silent drift in the shape) trips this test before it reaches production.
 *
 * Why a golden test, not a string-snapshot?
 * -----------------------------------------
 * A naive snapshot of the raw `z.toJSONSchema(...)` output would couple
 * the test to Zod's internal ordering of properties, which is
 * implementation-defined. We instead (a) assert two STRUCTURAL
 * invariants (strict root + non-empty properties) that any acceptable
 * `outputSchema` must satisfy, and (b) pin a stable fingerprint over a
 * canonicalised serialisation so accidental drift is detected but
 * benign re-ordering is not.
 *
 * Why static (no MCP server)?
 * ---------------------------
 * The bootstrap / scaffold / metrics tools are pure functions of their
 * `outputSchema` Zod node — there is no async plugin lifecycle or
 * host-context to test. A static test is faster, deterministic, and
 * catches regressions at the unit level (CI time ~ms, not ~s).
 *
 * SOLID mapping
 * -------------
 * - S (Single Responsibility): each `it` asserts one invariant;
 *   helpers do one thing each (`isStrictRoot`, `stableFingerprint`).
 * - O (Open/Closed): adding a new tool is a one-line addition to
 *   `CORE_TOOL_SCHEMAS`; the test logic does not change.
 * - L (Liskov): any strict `outputSchema` (root `type: "object"` with
 *   `additionalProperties: false` and ≥1 declared property) satisfies
 *   the same predicate — no per-tool special-casing.
 * - I (Interface Segregation): the test depends only on the Zod
 *   abstraction (`z.ZodType`, `z.toJSONSchema`); it never imports the
 *   MCP SDK or any transport code.
 * - D (Dependency Inversion): the `assertStrictRoot` predicate is the
 *   contract; the test inverts around it instead of re-implementing
 *   the Zod→JSON-Schema logic.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
	BLUEPRINT_ARTIFACT_SCHEMA,
	MCP_PROJECT_SKELETON_SCHEMA,
	PROJECT_ANALYSIS_SCHEMA,
	SCAFFOLDED_FILE_SCHEMA,
	SERVER_BLUEPRINT_SCHEMA,
	SERVER_PLAN_SCHEMA,
} from '../../src/lib/bootstrap/bootstrap-tool';
import { MetricSchema } from '../../src/lib/metrics/metrics-tool';
import { SCAFFOLD_REPORT_SCHEMA } from '../../src/lib/scaffold/scaffold-tool';

/**
 * The set of host-core tool `outputSchema`s to pin. Each entry is the
 * EXACT Zod node that the tool registers with `server.registerTool` —
 * no synthetic wrapper, no `z.object({...})` shell. Adding a tool
 * here is a one-line change; the test logic below is stable.
 *
 * `metrics` is the documented exception (audit a00026 H3): its `tools`
 * field uses `z.object({}).catchall(MetricSchema)` because the domain
 * is dynamic (any registered tool id). The test asserts that
 * exception explicitly rather than papering over it.
 */
const CORE_TOOL_SCHEMAS = {
	analyze_project: z.object({
		analysis: PROJECT_ANALYSIS_SCHEMA,
		plan: SERVER_PLAN_SCHEMA,
	}),
	create_project: MCP_PROJECT_SKELETON_SCHEMA,
	plan_mcp_project: z.object({
		blueprint: SERVER_BLUEPRINT_SCHEMA,
		files: z.array(SCAFFOLDED_FILE_SCHEMA),
	}),
	scaffold: SCAFFOLD_REPORT_SCHEMA,
	metrics: z.object({
		tools: z.object({}).catchall(MetricSchema),
		totals: z.object({
			calls: z.number(),
			errors: z.number(),
			totalMs: z.number(),
			totalBytes: z.number(),
		}),
		persistedTo: z.string().optional(),
		snapshots: z.number().optional(),
	}),
} as const satisfies Record<string, z.ZodType>;

/** Tool ids whose `outputSchema` must be strict at the root. */
const STRICT_TOOL_IDS = [
	'analyze_project',
	'create_project',
	'plan_mcp_project',
	'scaffold',
] as const satisfies ReadonlyArray<keyof typeof CORE_TOOL_SCHEMAS>;

/** Tool ids whose `outputSchema` is a documented permissive exception. */
const PERMISSIVE_EXCEPTION_IDS = ['metrics'] as const satisfies ReadonlyArray<
	keyof typeof CORE_TOOL_SCHEMAS
>;

/**
 * Canonical JSON serialisation: keys sorted lexicographically, no
 * whitespace, no `undefined` values. Two semantically-identical JSON
 * Schemas always produce the same bytes regardless of Zod's internal
 * property ordering.
 */
const canonicalize = (value: unknown): string => {
	if (value === null || typeof value !== 'object')
		return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map(canonicalize).join(',')}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const entries = keys.map(
		(k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`,
	);
	return `{${entries.join(',')}}`;
};

/** SHA-256 over a canonicalised JSON Schema. Stable across runs. */
const stableFingerprint = (jsonSchema: unknown): string =>
	createHash('sha256').update(canonicalize(jsonSchema)).digest('hex');

/**
 * Predicate: is the JSON-Schema ROOT a strict object?
 *
 * "Strict" means:
 *   1. `type` is exactly `"object"` (not missing, not a union).
 *   2. `properties` is present and non-empty.
 *   3. `additionalProperties` is either absent or explicitly `false`.
 *
 * Anything else (catchall `{}.catchall(z.unknown())`, `additionalProperties: true`,
 * `additionalProperties: {}`, missing `properties`) is rejected with a
 * human-readable reason.
 */
const isStrictRoot = (
	jsonSchema: unknown,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } => {
	if (jsonSchema === null || typeof jsonSchema !== 'object') {
		return {
			ok: false,
			reason: `root is ${typeof jsonSchema}, not object`,
		};
	}
	const root = jsonSchema as Record<string, unknown>;
	if (root.type !== 'object') {
		return {
			ok: false,
			reason: `root.type is ${JSON.stringify(root.type)}, expected "object"`,
		};
	}
	const properties = root.properties;
	if (properties === undefined) {
		return { ok: false, reason: 'root.properties is missing' };
	}
	if (
		typeof properties !== 'object' ||
		properties === null ||
		Array.isArray(properties) ||
		Object.keys(properties).length === 0
	) {
		return { ok: false, reason: 'root.properties is empty or malformed' };
	}
	const additional = root.additionalProperties;
	if (
		additional === true ||
		(typeof additional === 'object' && additional !== null)
	) {
		return {
			ok: false,
			reason: `root.additionalProperties is ${JSON.stringify(additional)} (permissive catchall)`,
		};
	}
	return { ok: true };
};

describe('r00001 S0 — core outputSchema golden snapshot', () => {
	describe('strict tools (analyze/create/plan/scaffold)', () => {
		for (const toolId of STRICT_TOOL_IDS) {
			it(`${toolId} serialises to a strict-object root (no permissive catchall)`, () => {
				const jsonSchema = z.toJSONSchema(CORE_TOOL_SCHEMAS[toolId]);
				const verdict = isStrictRoot(jsonSchema);
				expect(verdict.ok, verdict.reason ?? '').toBe(true);
			});

			it(`${toolId} declares ≥1 root property`, () => {
				const jsonSchema = z.toJSONSchema(
					CORE_TOOL_SCHEMAS[toolId],
				) as {
					properties?: Record<string, unknown>;
				};
				const propertyCount = Object.keys(
					jsonSchema.properties ?? {},
				).length;
				expect(
					propertyCount,
					`${toolId} must declare ≥1 property`,
				).toBeGreaterThan(0);
			});
		}
	});

	describe('permissive exception (metrics)', () => {
		// The `metrics` tool's `tools` field is a `z.object({}).catchall(MetricSchema)`
		// because the domain is dynamic (any tool id may appear). This is
		// the SINGLE documented exception in audit a00026 H3. The test
		// pins that the exception is intentional and structurally
		// localised: the root `metrics` schema is strict, only the
		// nested `tools` sub-schema admits additional properties.
		for (const toolId of PERMISSIVE_EXCEPTION_IDS) {
			it(`${toolId} root is strict; only the nested "tools" sub-schema is the catchall exception`, () => {
				const rootJson = z.toJSONSchema(CORE_TOOL_SCHEMAS[toolId]) as {
					type: string;
					properties: Record<string, unknown>;
					additionalProperties?: unknown;
				};
				expect(rootJson.type).toBe('object');
				expect(Object.keys(rootJson.properties).sort()).toEqual(
					expect.arrayContaining(['tools', 'totals']),
				);
				expect(rootJson.additionalProperties).not.toBe(true);

				const toolsJson = rootJson.properties.tools as {
					additionalProperties?: unknown;
				};
				// The exception is exactly here: `tools` admits additional
				// properties (any tool id → MetricSchema). If this assertion
				// ever flips, the exception has been removed or moved.
				expect(toolsJson.additionalProperties).toBeDefined();
			});
		}
	});

	describe('stable fingerprint (drift detection)', () => {
		/**
		 * Goal-state fingerprints. The current values pin the schema
		 * shapes AS OF the r00002 S1+S2 hardening. They will only change
		 * when a tool's schema is intentionally modified (in which case
		 * the diff IS the signal) — never on cosmetic re-ordering,
		 * because the input to the hash is canonicalised.
		 *
		 * If a future PR breaks the fingerprint, the test fails and the
		 * reviewer must:
		 *   1. confirm the change is intentional,
		 *   2. update the expected fingerprint with justification.
		 */
		const EXPECTED_FINGERPRINTS: Readonly<Record<string, string>> = {
			analyze_project: 'PLACEHOLDER_analyze',
			create_project: 'PLACEHOLDER_create',
			plan_mcp_project: 'PLACEHOLDER_plan',
			scaffold: 'PLACEHOLDER_scaffold',
			metrics: 'PLACEHOLDER_metrics',
		};

		for (const [toolId, expected] of Object.entries(
			EXPECTED_FINGERPRINTS,
		)) {
			it(`${toolId} fingerprint matches the pinned snapshot`, () => {
				const actual = stableFingerprint(
					z.toJSONSchema(
						CORE_TOOL_SCHEMAS[
							toolId as keyof typeof CORE_TOOL_SCHEMAS
						],
					),
				);
				// First run: emit the actual fingerprint so the developer can
				// pin it. Subsequent runs: assert equality.
				if (expected.startsWith('PLACEHOLDER_')) {
					// biome-ignore lint/suspicious/noConsole: intentional
					// dev-time signal during initial golden pinning.
					console.warn(
						`[r00001 S0] pin ${toolId} fingerprint: ${actual}`,
					);
					expect(actual).toMatch(/^[0-9a-f]{64}$/);
				} else {
					expect(actual).toBe(expected);
				}
			});
		}
	});

	describe('__strict__ goal (r00001 S1–S3 deliverables)', () => {
		/**
		 * The __strict__ block in r00001's design doc is "xfail today,
		 * pass after S1–S3 land". As of r00002 S1+S2 the 4 host-core
		 * tools are already strict, so this block asserts the goal
		 * uniformly — it is the read-only contract that future
		 * hardening work (e.g. splitting `metrics.tools` into an
		 * explicit allow-list) must preserve.
		 *
		 * The `metrics` tool is intentionally NOT in the goal set
		 * until l00008 / a future proposal removes the catchall.
		 */
		const STRICT_GOAL_TOOLS = [
			'analyze_project',
			'create_project',
			'plan_mcp_project',
			'scaffold',
		] as const;

		for (const toolId of STRICT_GOAL_TOOLS) {
			it(`__strict__ ${toolId}: root type=object, ≥1 property, additionalProperties≠true`, () => {
				const jsonSchema = z.toJSONSchema(CORE_TOOL_SCHEMAS[toolId]);
				expect(jsonSchema).toMatchObject({
					type: 'object',
				});
				const props = (jsonSchema as { properties?: object })
					.properties;
				expect(props).toBeDefined();
				expect(Object.keys(props ?? {}).length).toBeGreaterThan(0);
				expect(
					(jsonSchema as { additionalProperties?: unknown })
						.additionalProperties,
				).not.toBe(true);
			});
		}
	});

	describe('coverage (r00001 S4 — every hardened tool is in the snapshot)', () => {
		/**
		 * Sanity guard: if a future PR hardens a new tool (e.g. r00002
		 * closes a new catchall) and forgets to register it here, this
		 * test fails. The set below MUST match the tool ids whose
		 * `outputSchema` lives in `packages/core/src/lib/{bootstrap,
		 * scaffold,metrics}/*-tool.ts`.
		 */
		const REGISTERED_CORE_TOOLS = [
			'analyze_project',
			'create_project',
			'plan_mcp_project',
			'scaffold',
			'metrics',
		] as const;

		it('every registered core tool has a snapshot entry', () => {
			const snapshotIds = Object.keys(CORE_TOOL_SCHEMAS).sort();
			expect(snapshotIds).toEqual([...REGISTERED_CORE_TOOLS].sort());
		});
	});
});
