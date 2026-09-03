/**
 * Progressive disclosure for the proposals tool surface.
 *
 * Progressive disclosure for the 34 `proposals` tools. The plugin puts
 * 50.9 KB of static `tools/list` bytes on the wire in `native` surface
 * mode, even though a session typically uses four or five of them. The
 * fix the plan calls for is explicit discoverability, not a mega-tool:
 * merging 34 tools into one with a `z.discriminatedUnion` only moves the
 * weight from names/descriptions into `inputSchema` and saves nothing
 * (see the plan's "why this design" section).
 *
 * Three levels, assigned to EVERY registration id the plugin ships:
 *
 *  - `essential`     — the flow an agent needs to start and finish work
 *                       with zero prior knowledge: `auto_work`,
 *                       status/continue, claim/close. Always exposed.
 *  - `contextual`     — actions relevant after the essential workflow
 *                       returns them as its exact next action (review,
 *                       transition, board, sync, delegation...). Hidden
 *                       from the static list but callable through the router (see
 *                       `IToolAccessState` in
 *                       packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts —
 *                       `hidden` is "a legitimate, desirable state").
 *  - `administrative` — repair/diagnose/GC/orphan-recovery. Real tools,
 *                       rarely the next step. Always discoverable
 *                       (`searchTools`/`resolveRoute`), never a static
 *                       `tools/list` line item.
 *
 * `PROPOSALS_TOOL_DISCLOSURE` is typed as `Record<IProposalsToolId,
 * IProposalsDisclosureLevel>` over the closed union of every real
 * registration id below — an id added to the plugin's tool list without
 * a corresponding union member (and a decision in this map) is a
 * compile error, not a silent gap. `disclosure.spec.ts` additionally
 * compares the map with the generated eager-assembly catalog, so the
 * runtime test fails if a newly registered tool is not classified.
 *
 * Pure, no I/O: this module never touches `node:fs`, the lock file, or
 * proposal state directly. State-aware guidance comes from `auto_work`;
 * this file owns only the stable wire-level disclosure policy.
 */

export type IProposalsDisclosureLevel =
	| 'essential'
	| 'contextual'
	| 'administrative';

/** Every registration id the `proposals` plugin ships (34, kept in sync
 * with `plugins/proposals/src/index.ts`'s `tools: [...]` array). */
export type IProposalsToolId =
	| 'agent_lock'
	| 'create_proposal'
	| 'close_slice'
	| 'proposal_review'
	| 'proposal_board'
	| 'branch_gc'
	| 'auto_fix_queue'
	| 'agent_worktree'
	| 'get_proposal_workflow'
	| 'proposals_close_plan'
	| 'continue_proposal'
	| 'agents_lock_diagnose'
	| 'round_context'
	| 'proposal_get'
	| 'sync_proposals'
	| 'proposal_adopt'
	| 'auto_work'
	| 'compact_status'
	| 'branch_status'
	| 'incident_proposals'
	| 'plan'
	| 'delegate'
	| 'inherit_host_instructions'
	| 'proposal_stale_list'
	| 'agent_lock_release_orphan'
	| 'proposal_force_transition'
	| 'proposal_reconcile_folder'
	| 'proposal_diagnose'
	| 'proposal_transition'
	| 'task_queue'
	| 'swarm_hygiene'
	| 'state_health'
	| 'state_repair'
	| 'agent_names';

/**
 * The essential flow (plan wording: "4–8 tools according to the state
 * of work"): the tools an agent needs to start and finish work with no
 * prior knowledge. `get_proposal_workflow` explains the workflow
 * itself, so it stays essential alongside the actual verbs.
 */
export const PROPOSALS_TOOL_DISCLOSURE: Readonly<
	Record<IProposalsToolId, IProposalsDisclosureLevel>
> = {
	// --- essential (8): start/status/continue/claim/close ---
	auto_work: 'essential',
	get_proposal_workflow: 'essential',
	compact_status: 'essential',
	continue_proposal: 'essential',
	proposal_adopt: 'essential',
	close_slice: 'essential',
	create_proposal: 'essential',
	agent_lock: 'essential',

	// --- contextual (15): relevant once a proposal is active ---
	proposal_review: 'contextual',
	proposal_board: 'contextual',
	agent_worktree: 'contextual',
	proposals_close_plan: 'contextual',
	round_context: 'contextual',
	proposal_get: 'contextual',
	sync_proposals: 'contextual',
	branch_status: 'contextual',
	incident_proposals: 'contextual',
	plan: 'contextual',
	delegate: 'contextual',
	proposal_transition: 'contextual',
	task_queue: 'contextual',
	swarm_hygiene: 'contextual',
	agent_names: 'contextual',

	// --- administrative (11): repair/diagnose/GC/orphan-recovery ---
	branch_gc: 'administrative',
	auto_fix_queue: 'administrative',
	agents_lock_diagnose: 'administrative',
	proposal_stale_list: 'administrative',
	agent_lock_release_orphan: 'administrative',
	proposal_force_transition: 'administrative',
	proposal_reconcile_folder: 'administrative',
	proposal_diagnose: 'administrative',
	inherit_host_instructions: 'administrative',
	state_health: 'administrative',
	state_repair: 'administrative',
};

/** Every id declared in the map, order-stable (declaration order). */
export const PROPOSALS_TOOL_IDS: readonly IProposalsToolId[] = Object.keys(
	PROPOSALS_TOOL_DISCLOSURE,
) as IProposalsToolId[];

export const proposalsDisclosureLevelOf = (
	id: IProposalsToolId,
): IProposalsDisclosureLevel => PROPOSALS_TOOL_DISCLOSURE[id];

const idsWithLevel = (
	level: IProposalsDisclosureLevel,
): readonly IProposalsToolId[] =>
	PROPOSALS_TOOL_IDS.filter((id) => PROPOSALS_TOOL_DISCLOSURE[id] === level);

/**
 * The idle-state exposed set — no active proposal, nothing claimed yet.
 * This is what a fresh session's static `tools/list` shows, and what the
 * static-surface byte ceiling is measured against.
 */
export const PROPOSALS_ESSENTIAL_TOOL_IDS: readonly IProposalsToolId[] =
	idsWithLevel('essential');

/**
 * Static disclosure tag for one registration, for wiring into
 * `IToolRegistration.disclosure` (packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts).
 * `essential` is returned as `undefined` — the core contract treats "no
 * `disclosure` declared" and `'essential'` identically (both stay
 * `visible`), and omitting it keeps essential-flow registrations
 * byte-for-byte what they were before this slice.
 *
 * Throws for any id this map does not know about — a new proposals tool
 * that is not routed through `applyProposalsDisclosure` (below) must
 * fail loudly, not silently ship invisible-and-unlabelled.
 */
export const staticDisclosureTagFor = (
	id: string,
): 'contextual' | 'administrative' | undefined => {
	if (!(id in PROPOSALS_TOOL_DISCLOSURE)) {
		throw new Error(
			`disclosure.ts: registration id "${id}" has no ` +
				'progressive-disclosure level assigned. Add it to ' +
				'PROPOSALS_TOOL_DISCLOSURE in ' +
				'plugins/proposals/src/lib/surface/disclosure.ts before wiring ' +
				'it into the plugin.',
		);
	}
	const level = PROPOSALS_TOOL_DISCLOSURE[id as IProposalsToolId];
	return level === 'essential' ? undefined : level;
};

/**
 * Tag every registration in `tools` with its static `disclosure` level
 * (mutating nothing — returns new objects). This is the one call site
 * `plugins/proposals/src/index.ts` needs so the 34 tool builders stay
 * untouched and the disclosure policy lives in exactly one file.
 */
export const applyProposalsDisclosure = <
	T extends { readonly id: string; readonly disclosure?: unknown },
>(
	tools: readonly T[],
): readonly T[] =>
	tools.map((tool) => {
		const disclosure = staticDisclosureTagFor(tool.id);
		return disclosure === undefined ? tool : { ...tool, disclosure };
	});
