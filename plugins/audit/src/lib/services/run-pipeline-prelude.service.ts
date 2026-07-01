/**
 * run-pipeline-prelude.service.ts — the synchronous-ish prelude to
 * `<prefix>_audit_run` (alcance B of the audit plugin, f00077).
 *
 * Why draw the boundary here (x00091 / s2):
 *
 *   1. **Fail fast, before any I/O.** Mode / scope / projects
 *      inference, path validation, and `mkdir` are all
 *      "before any HTTP call" steps. Extracting them into a
 *      pure service lets us fail with a `toolError` envelope
 *      before we ever send a brief to a provider, and keeps the
 *      rest of the handler (LLM fan-out, markdown save,
 *      consolidation, scaffold) focused on the I/O surface.
 *
 *   2. **Path containment is a SECURITY gate.** A `../` escape on
 *      `auditDir` or `proposalsDir` must be rejected before we
 *      write anything to disk (and ideally before we send
 *      anything to a provider, so the brief itself can never be
 *      weaponised as a side channel). The prelude owns the only
 *      call to `resolveWorkspaceContained` for the run tool.
 *
 *   3. **Brief assembly is a PURE function.** `buildBrief` is the
 *      same renderer the `audit_plan` tool uses, so pulling it
 *      into the prelude makes the "what the model sees" surface
 *      testable in isolation later. (Today the tests still go
 *      through the e2e, but the boundary is drawn so a unit test
 *      could call `runPipelinePrelude` directly with a stub
 *      `IRunToolOptions` and inspect the produced `brief`
 *      string.)
 *
 *   4. **After the prelude every step is genuinely I/O:** HTTP
 *      fan-out via the injected transport, file writes via
 *      `writeFileAtomic`, consolidation, and proposal scaffolding.
 *      Those stay in the tool so the existing e2e spec (which
 *      uses the real `registerTool` hook and a mocked HTTP
 *      transport) keeps working unchanged.
 *
 * Side effects: the prelude calls `mkdir({ recursive: true })` on
 * the validated `auditDir` and `proposalsDir` — both writes are
 * idempotent and required for every downstream step, so they
 * belong here.
 *
 * Internal module: the only exports are the two interfaces
 * (`IRunPreludeInput`, `IRunPreludeResult`) and the
 * `runPipelinePrelude` function. Nothing on the audit-run tool's
 * public barrel changes.
 */

import { mkdir } from 'node:fs/promises';

import {
	resolveWorkspaceContained,
	toolError,
	type IToolTextResult,
} from '@mcp-vertex/core/public';

import {
	buildBrief,
	type AuditMode,
	type ILayerConfig,
} from './audit-brief.service';

/**
 * Subset of the `audit_run` input the prelude consumes plus the
 * host configuration it needs to validate and render the brief.
 * Built once at handler-invocation time by the tool from its
 * `IRunToolOptions` + the tool's `args`.
 */
export interface IRunPreludeInput {
	/** Caller's tool input — only the prelude-relevant fields. */
	readonly args: {
		readonly scope?: string | undefined;
		readonly mode?: AuditMode | undefined;
		readonly projects?: readonly string[] | undefined;
		readonly auditDir?: string | undefined;
		readonly proposalsDir?: string | undefined;
	};
	/** Default `auditDir` (workspace-relative), wired from `IRunToolOptions`. */
	readonly defaultAuditDir: string;
	/** Default `proposalsDir` (workspace-relative), wired from `IRunToolOptions`. */
	readonly defaultProposalsDir: string;
	/** Absolute workspace root, used to resolve relative paths. */
	readonly workspaceRoot: string;
	/**
	 * Universal scopes + every configured layer's name. Pre-computed
	 * by the tool at registration time so the prelude is a pure
	 * function of its input.
	 */
	readonly allAvailableScopes: readonly string[];
	/** Set of configured layer names, used to validate the `projects` filter. */
	readonly configuredLayerNames: ReadonlySet<string>;
	/** Configured layers, forwarded to `buildBrief` for layer-scoped briefs. */
	readonly configuredLayers: readonly ILayerConfig[];
	/** Brief scoring dimensions (default: `SCORE_DIMENSIONS`). */
	readonly dimensions: readonly string[];
	/** Human-readable project name, rendered in the brief header. */
	readonly projectName?: string;
	/** Config-file hint, rendered in the no-layers fallback. */
	readonly configFileName?: string;
	/** Host-specific cross-cutting invariants appended to the brief. */
	readonly crossCuttingAdditions?: readonly string[];
}

/**
 * Discriminated outcome of the prelude.
 *
 *  - `ok: true`  — the run context is fully resolved and the
 *    directories exist on disk; the handler can proceed to the
 *    LLM fan-out.
 *  - `ok: false` — a `toolError` envelope is returned unchanged.
 *    The handler short-circuits with `return prelude.error`.
 *
 * The error type is `IToolTextResult` (the literal return type of
 * `toolError`) so the handler's `Promise<IToolTextResult>`
 * signature stays intact across the `return` boundary.
 */
export type IRunPreludeResult =
	| {
			readonly ok: true;
			readonly scope: string;
			readonly mode: AuditMode;
			readonly projects: readonly string[];
			/** Absolute `auditDir` — used for `path.join` and `writeFileAtomic`. */
			readonly auditDirAbs: string;
			/**
			 * Workspace-relative `auditDir` — used to populate the
			 * `path` field of each saved audit in the tool's
			 * response (so the response is workspace-relative
			 * end-to-end, never absolute).
			 */
			readonly auditDirRel: string;
			/** Absolute `proposalsDir` — used by the scaffolder. */
			readonly proposalsDirAbs: string;
			/** Workspace-relative `proposalsDir` — used by the scaffolder's options. */
			readonly proposalsDirRel: string;
			/** The fully-rendered brief the prelude hands to the LLM fan-out. */
			readonly brief: string;
	  }
	| { readonly ok: false; readonly error: IToolTextResult };

/** Strip a leading `./` from a workspace-relative path. */
const sanitizeRel = (rel: string): string => rel.replace(/^\.\//u, '');

/**
 * Resolve a workspace-relative directory against `workspaceRoot`
 * and confirm the result stays inside the root. Returns the
 * absolute path on success or a `reason` string on failure —
 * matching the shape `resolveWorkspaceContained` uses internally
 * so the caller can surface the original `reason` as the
 * `nextAction` of a `toolError` envelope.
 */
const resolveDir = (
	workspaceRoot: string,
	relDir: string,
):
	| { readonly ok: true; readonly abs: string }
	| { readonly ok: false; readonly reason: string } => {
	const contained = resolveWorkspaceContained(workspaceRoot, relDir);
	if (!contained.ok) {
		return {
			ok: false,
			reason:
				contained.reason ?? 'Path must stay inside the workspace root.',
		};
	}
	return { ok: true, abs: contained.abs };
};

/**
 * Run the `audit_run` prelude. Returns a discriminated result so
 * the tool can `return prelude.error` unchanged on failure and
 * destructure the resolved run context on success. Never throws —
 * every failure is encoded as `{ ok: false, error: IToolTextResult }`.
 */
export const runPipelinePrelude = async (
	input: IRunPreludeInput,
): Promise<IRunPreludeResult> => {
	const { args } = input;

	// 1. Scope inference + unknown-scope guard.
	const scope = args.scope ?? 'full';
	if (!input.allAvailableScopes.includes(scope)) {
		return {
			ok: false,
			error: toolError(
				`unknown scope "${scope}"`,
				`Available scopes: ${input.allAvailableScopes.join(', ')}.`,
			),
		};
	}

	// 2. Projects filter + unknown-projects guard. Empty `projects`
	//    means "audit every configured layer" — the call is
	//    accepted unchanged and `buildBrief` decides what to
	//    render.
	const projects = args.projects ?? [];
	if (projects.length > 0) {
		const unknown = projects.filter(
			(p) => !input.configuredLayerNames.has(p),
		);
		if (unknown.length > 0) {
			return {
				ok: false,
				error: toolError(
					`unknown project(s): ${unknown.join(', ')}`,
					`Available layer projects for monorepo mode: ${[...input.configuredLayerNames].join(', ') || '(none configured)'}.`,
				),
			};
		}
	}

	// 3. Mode inference. Mirrors the rule in `brief-modes.service`'s
	//    `inferMode` so the tool short-circuits invalid combinations
	//    BEFORE the LLM fan-out (without duplicating the
	//    derivation in two places — the brief builder also calls
	//    `inferMode`, which is the canonical implementation).
	const mode: AuditMode =
		args.mode ??
		(projects.length > 0
			? 'monorepo'
			: scope === 'full'
				? 'general'
				: 'specific');

	// 4. Resolve + validate the audit + proposals directories.
	//    Path containment MUST happen before any HTTP call or
	//    file write — see this file's header for the rationale.
	const auditRel = sanitizeRel(args.auditDir ?? input.defaultAuditDir);
	const proposalsRel = sanitizeRel(
		args.proposalsDir ?? input.defaultProposalsDir,
	);
	const auditDirResult = resolveDir(input.workspaceRoot, auditRel);
	if (!auditDirResult.ok) {
		return {
			ok: false,
			error: toolError(
				`audit dir "${auditRel}" is not allowed`,
				auditDirResult.reason,
			),
		};
	}
	const proposalsDirResult = resolveDir(input.workspaceRoot, proposalsRel);
	if (!proposalsDirResult.ok) {
		return {
			ok: false,
			error: toolError(
				`proposals dir "${proposalsRel}" is not allowed`,
				proposalsDirResult.reason,
			),
		};
	}
	const auditDirAbs = auditDirResult.abs;
	const proposalsDirAbs = proposalsDirResult.abs;

	// 5. Create the directories. `recursive: true` is idempotent
	//    — a re-run with the same inputs is a no-op for this
	//    step, and a partially-existing dir (e.g. one the user
	//    just removed) is recreated transparently.
	await mkdir(auditDirAbs, { recursive: true });
	await mkdir(proposalsDirAbs, { recursive: true });

	// 6. Build the brief. Same renderer the `audit_plan` tool
	//    uses — a host can paste the result into a fresh model
	//    session and get the same format the `audit_run` tool
	//    would have sent.
	const brief = buildBrief(scope, {
		dimensions: input.dimensions,
		layers: input.configuredLayers,
		mode,
		projects,
		...(input.projectName !== undefined
			? { projectName: input.projectName }
			: {}),
		...(input.configFileName !== undefined
			? { configFileName: input.configFileName }
			: {}),
		...(input.crossCuttingAdditions !== undefined
			? { crossCuttingAdditions: input.crossCuttingAdditions }
			: {}),
	});

	return {
		ok: true,
		scope,
		mode,
		projects,
		auditDirAbs,
		auditDirRel: auditRel,
		proposalsDirAbs,
		proposalsDirRel: proposalsRel,
		brief,
	};
};
