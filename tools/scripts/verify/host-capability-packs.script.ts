#!/usr/bin/env bun
/**
 * f00149 S4 — `verify:host-capability-packs` gate.
 *
 * Validates every shipped adapter pack against the shared
 * `IHostAdapterPack` contract: any claim for a capability the
 * profile does not declare is rejected. The verifier is host-neutral
 * — adding a future MCP host means appending one entry to
 * `CANONICAL_PROFILES` (and the gate catches any drift).
 *
 * Pure: it consumes the public `buildHostAdapterPack` + the contract
 * types from `@mcp-vertex/core/public`; no fs, no subprocess. The
 * `run()` function returns a structured `IHostCapabilityGateResult`
 * so the same code drives the script exit code AND the spec tests.
 */
import type {
	IHostAdapterPack,
	IHostCapabilityProfile,
} from '@mcp-vertex/core/public';
import { buildHostAdapterPack } from '@mcp-vertex/core/public';

const ALLOWED_ACTION_KINDS = new Set([
	'connect-mcp',
	'load-instructions',
	'install-skills',
	'configure-lifecycle',
	'continue-work',
]);

export const CANONICAL_PROFILES: readonly IHostCapabilityProfile[] = [
	{
		// Generic MCP client — only the live MCP surface, no native hooks.
		id: 'generic-mcp',
		capabilities: {
			mcp: { tools: true, prompts: true, resources: true },
			instructions: 'none',
			skills: 'none',
			lifecycle: 'none',
			continuation: 'manual',
		},
	},
	{
		// Codex (per docs/mcp-vertex/examples/host-capability-adapter.md +
		// config/external/codex/README.md) — MCP baseline only; uses
		// prompt-time instructions; no native skills, no hooks; manual
		// continuation.
		id: 'codex',
		capabilities: {
			mcp: { tools: true, prompts: true, resources: true },
			instructions: 'prompt',
			skills: 'none',
			lifecycle: 'none',
			continuation: 'manual',
		},
	},
	{
		// Claude Code (per config/external/claude-code/README.md) —
		// workspace-file instructions + native skills + lifecycle
		// hooks + manual continuation (the host loop is owned by the
		// user, not the server).
		id: 'claude-code',
		capabilities: {
			mcp: { tools: true, prompts: true, resources: true },
			instructions: 'workspace-file',
			skills: 'native',
			lifecycle: 'hooks',
			continuation: 'manual',
		},
	},
	{
		// Future host with a documented runner: tests the host-loop
		// branch of the contract (requiresHostRunner + adapter-owned
		// fallback). NOT shipped — included to lock the shape so a
		// future addition does not need a contract bump.
		id: 'host-loop-reference',
		capabilities: {
			mcp: { tools: true, prompts: false, resources: false },
			instructions: 'prompt',
			skills: 'mcp-tool',
			lifecycle: 'observe',
			continuation: 'host-loop',
		},
	},
];

export interface IHostCapabilityFinding {
	readonly hostId: string;
	readonly ruleId: string;
	readonly message: string;
}

export interface IHostCapabilityGateResult {
	readonly ok: boolean;
	readonly profiles: readonly string[];
	readonly findings: readonly IHostCapabilityFinding[];
}

export type HostAdapterPackBuilder = (
	profile: IHostCapabilityProfile,
) => IHostAdapterPack;

const finding = (
	hostId: string,
	ruleId: string,
	message: string,
): IHostCapabilityFinding => ({ hostId, ruleId, message });

const validateOne = (
	profile: IHostCapabilityProfile,
	buildPack: HostAdapterPackBuilder = buildHostAdapterPack,
): readonly IHostCapabilityFinding[] => {
	const out: IHostCapabilityFinding[] = [];
	if (profile.id.trim() === '') {
		out.push(
			finding(
				profile.id,
				'empty-host-id',
				'profile id must be non-empty',
			),
		);
		return out;
	}
	if (
		!profile.capabilities.mcp.tools &&
		!profile.capabilities.mcp.prompts &&
		!profile.capabilities.mcp.resources
	) {
		// A host with zero MCP surface has no business advertising an
		// adapter pack — mcp-vertex is unreachable to it. Record the
		// finding BEFORE calling the builder because the builder's
		// assertProfile throws on the same condition.
		out.push(
			finding(
				profile.id,
				'no-mcp-surface',
				'profile declares no MCP tools/prompts/resources — unreachable host',
			),
		);
		return out;
	}

	let pack: IHostAdapterPack;
	try {
		pack = buildPack(profile);
	} catch (error) {
		out.push(
			finding(
				profile.id,
				'builder-threw',
				`buildHostAdapterPack threw: ${error instanceof Error ? error.message : String(error)}`,
			),
		);
		return out;
	}
	if (pack.version !== 1) {
		out.push(
			finding(
				profile.id,
				'bad-version',
				`pack.version is ${pack.version}, expected 1`,
			),
		);
	}

	// Every pack must expose at least one required: true connect-mcp
	// action (the MCP baseline).
	const requiredMcp = pack.actions.filter(
		(a) => a.kind === 'connect-mcp' && a.required,
	);
	if (requiredMcp.length === 0) {
		out.push(
			finding(
				profile.id,
				'missing-mcp-baseline',
				'pack has no required connect-mcp action — MCP baseline must be enforced',
			),
		);
	}

	// Every action kind must be in the allowed union.
	for (const action of pack.actions) {
		if (!ALLOWED_ACTION_KINDS.has(action.kind)) {
			out.push(
				finding(
					profile.id,
					'unknown-action-kind',
					`action.kind "${action.kind}" is not in the contract union`,
				),
			);
		}
	}

	// Claim consistency: optional actions must reflect the profile's
	// declared capability; an action that the profile explicitly disables
	// (set to 'none') MUST NOT appear in the pack.
	const expected: Record<string, boolean> = {
		'load-instructions': profile.capabilities.instructions !== 'none',
		'install-skills': profile.capabilities.skills !== 'none',
		'configure-lifecycle': profile.capabilities.lifecycle !== 'none',
	};
	for (const [kind, present] of Object.entries(expected)) {
		const inPack = pack.actions.some((a) => a.kind === kind);
		if (present && !inPack) {
			out.push(
				finding(
					profile.id,
					'missing-optional-action',
					`profile declares a capability but pack has no "${kind}" action`,
				),
			);
		}
		if (!present && inPack) {
			out.push(
				finding(
					profile.id,
					'phantom-optional-action',
					`pack has "${kind}" but profile declares the capability as 'none'`,
				),
			);
		}
	}

	// Continuation consistency: requiresHostRunner ↔ mode === 'host-loop'.
	if (
		pack.continuation.requiresHostRunner &&
		pack.continuation.mode !== 'host-loop'
	) {
		out.push(
			finding(
				profile.id,
				'runner-without-host-loop',
				`requiresHostRunner is true but continuation.mode is "${pack.continuation.mode}"`,
			),
		);
	}
	if (
		!pack.continuation.requiresHostRunner &&
		pack.continuation.mode === 'host-loop'
	) {
		out.push(
			finding(
				profile.id,
				'host-loop-without-runner',
				'continuation.mode is "host-loop" but requiresHostRunner is false',
			),
		);
	}
	// The continuation action's mode must match pack.continuation.mode.
	const continuationAction = pack.actions.find(
		(a) => a.kind === 'continue-work',
	);
	if (
		continuationAction &&
		continuationAction.mode !== pack.continuation.mode
	) {
		out.push(
			finding(
				profile.id,
				'continuation-mode-mismatch',
				`continue-work.mode "${continuationAction.mode}" != pack.continuation.mode "${pack.continuation.mode}"`,
			),
		);
	}

	return out;
};

/**
 * Validate every canonical profile. Pure: same inputs -> same outputs.
 */
export const runHostCapabilityGate = (
	profiles: readonly IHostCapabilityProfile[] = CANONICAL_PROFILES,
	buildPack: HostAdapterPackBuilder = buildHostAdapterPack,
): IHostCapabilityGateResult => {
	const findings: IHostCapabilityFinding[] = [];
	const ids = new Set<string>();
	for (const profile of profiles) {
		if (ids.has(profile.id)) {
			findings.push(
				finding(
					profile.id,
					'duplicate-host-id',
					`hostId "${profile.id}" appears more than once in CANONICAL_PROFILES`,
				),
			);
			continue;
		}
		ids.add(profile.id);
		findings.push(...validateOne(profile, buildPack));
	}
	return {
		ok: findings.length === 0,
		profiles: profiles.map((p) => p.id),
		findings,
	};
};

/* c8:next-line bun-script-entry */
if (import.meta.main) {
	const result = runHostCapabilityGate();
	// Render one line per finding (empty list -> "ok").
	if (result.ok) {
		console.log(
			`host-capability-packs: ${result.profiles.length} pack(s) validated — 0 findings.`,
		);
		process.exit(0);
	}
	console.error(
		`host-capability-packs: ${result.findings.length} finding(s):`,
	);
	for (const f of result.findings) {
		console.error(`  ${f.hostId} :: ${f.ruleId} :: ${f.message}`);
	}
	process.exit(1);
}
