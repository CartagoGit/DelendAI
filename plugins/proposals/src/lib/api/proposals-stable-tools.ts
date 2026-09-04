import { z } from 'zod';

import {
	describeStableTool,
	registerStableToolDescriptors,
	type IStableToolDescriptor,
} from '@delendai/core/lib/api/stable-facade';
import type { IStableManifestTool } from '@delendai/core/public';
import { MCP_VERTEX_VERSION } from '@delendai/core/version';
import {
	CREATE_PROPOSAL_INPUT_SCHEMA,
	CREATE_PROPOSAL_OUTPUT_SCHEMA,
	REVIEW_INPUT_SCHEMA,
	REVIEW_OUTPUT_SCHEMA,
} from '../tools/authoring.tool';
import {
	AUTO_WORK_INPUT_SCHEMA,
	AUTO_WORK_OUTPUT_SCHEMA,
} from '../tools/auto-work.tool';
import {
	AGENT_LOCK_INPUT_SCHEMA,
	AGENT_LOCK_OUTPUT_SCHEMA,
} from '../tools/agent-lock.tool';
import {
	AGENT_WORKTREE_INPUT_SCHEMA,
	AGENT_WORKTREE_OUTPUT_SCHEMA,
} from '../tools/agent-worktree.tool';
import {
	CLOSE_PLAN_INPUT_SCHEMA,
	CLOSE_PLAN_OUTPUT_SCHEMA,
} from '../tools/close-plan.tool';
import { PROPOSAL_TRANSITION_INPUT_SCHEMA } from '../contracts/proposal-transition-input.contract';
import { PROPOSAL_TRANSITION_OUTPUT_SCHEMA } from '../tools/proposal-transition.tool';
import {
	TASK_QUEUE_INPUT_SCHEMA,
	TASK_QUEUE_OUTPUT_SCHEMA,
} from '../tools/task-queue.tool';
import {
	STATE_REPAIR_INPUT_SCHEMA,
	STATE_REPAIR_OUTPUT_SCHEMA,
} from '../tools/state-tools.tool';
import {
	FORCE_TRANSITION_INPUT_SCHEMA,
	FORCE_TRANSITION_OUTPUT_SCHEMA,
} from '../tools/recovery-tools';

export const PROPOSALS_STABLE_TOOLS: readonly IStableToolDescriptor[] =
	Object.freeze([
		describeStableTool({
			name: 'proposal_transition',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
			outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
			summary: 'Move a proposal to a new status against the DFA.',
		}),
		describeStableTool({
			name: 'proposals_close_plan',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: CLOSE_PLAN_INPUT_SCHEMA,
			outputSchema: CLOSE_PLAN_OUTPUT_SCHEMA,
			summary: 'Close a plan proposal after checking every blocker.',
		}),
		describeStableTool({
			name: 'proposal_create',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: CREATE_PROPOSAL_INPUT_SCHEMA,
			outputSchema: CREATE_PROPOSAL_OUTPUT_SCHEMA,
			summary:
				'Create a new proposal document with frontmatter + slices.',
		}),
		describeStableTool({
			name: 'auto_work',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: AUTO_WORK_INPUT_SCHEMA,
			outputSchema: AUTO_WORK_OUTPUT_SCHEMA,
			summary:
				'Resolve the next proposal slice and return an action plan.',
		}),
		describeStableTool({
			name: 'agent_lock',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: AGENT_LOCK_INPUT_SCHEMA,
			outputSchema: AGENT_LOCK_OUTPUT_SCHEMA,
			summary: 'Claim file ownership for an agent (cross-process lock).',
		}),
		describeStableTool({
			name: 'agent_worktree',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: AGENT_WORKTREE_INPUT_SCHEMA,
			outputSchema: AGENT_WORKTREE_OUTPUT_SCHEMA,
			summary: 'Create or manage per-agent git worktrees.',
		}),
		describeStableTool({
			name: 'proposal_review',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: REVIEW_INPUT_SCHEMA,
			outputSchema: REVIEW_OUTPUT_SCHEMA,
			summary: 'Submit/approve/request-changes on a proposal in review.',
		}),
		describeStableTool({
			name: 'task_queue_enqueue',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: TASK_QUEUE_INPUT_SCHEMA,
			outputSchema: TASK_QUEUE_OUTPUT_SCHEMA,
			summary: 'Push a task onto the persistent swarm queue.',
		}),
		describeStableTool({
			name: 'state_repair',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: STATE_REPAIR_INPUT_SCHEMA,
			outputSchema: STATE_REPAIR_OUTPUT_SCHEMA,
			summary:
				'Auto-heal stale locks, queue backpressure, orphan assignments.',
		}),
		describeStableTool({
			name: 'proposal_force_transition',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: FORCE_TRANSITION_INPUT_SCHEMA,
			outputSchema: FORCE_TRANSITION_OUTPUT_SCHEMA,
			summary: 'Recovery-path transition (skips peer-review lock).',
		}),
	]);

const schemaToJson = (schema: unknown): unknown => {
	if (schema === undefined || schema === null) {
		return null;
	}
	try {
		return JSON.parse(JSON.stringify(z.toJSONSchema(schema as z.ZodType)));
	} catch {
		return null;
	}
};

const toStableToolSurfaceEntry = (
	descriptor: IStableToolDescriptor,
): IStableManifestTool =>
	Object.freeze({
		name: descriptor.name,
		plugin: descriptor.plugin,
		sinceVersion: descriptor.sinceVersion,
		semverGuarantee: descriptor.semverGuarantee,
		summary: descriptor.summary,
		inputSchema: schemaToJson(descriptor.inputSchema),
		outputSchema: schemaToJson(descriptor.outputSchema),
	});

export const PROPOSALS_STABLE_TOOL_SURFACE: readonly IStableManifestTool[] =
	Object.freeze(PROPOSALS_STABLE_TOOLS.map(toStableToolSurfaceEntry));

export const PROPOSAL_ADAPTIVE_FACADE_INTENTS = [
	'orient',
	'plan',
	'claim',
	'progress',
	'close',
	'recover',
] as const;

export type TProposalAdaptiveFacadeIntent =
	(typeof PROPOSAL_ADAPTIVE_FACADE_INTENTS)[number];

export type TProposalAdaptiveFacadeEffect = 'read' | 'write' | 'recovery';

export interface IProposalAdaptiveFacadePath {
	readonly intent: TProposalAdaptiveFacadeIntent;
	readonly toolName: string;
	readonly effect: TProposalAdaptiveFacadeEffect;
	readonly expectedCalls: number;
	readonly intentFit: number;
	readonly sideEffectRisk: number;
	readonly summary: string;
}

const stableToolSummaryByName = new Map(
	PROPOSALS_STABLE_TOOLS.map((descriptor) => [
		descriptor.name,
		descriptor.summary,
	]),
);

const describeAdaptiveFacadePath = (
	path: Omit<IProposalAdaptiveFacadePath, 'summary'>,
): IProposalAdaptiveFacadePath =>
	Object.freeze({
		...path,
		summary: stableToolSummaryByName.get(path.toolName) ?? path.toolName,
	});

export const PROPOSALS_ADAPTIVE_FACADE_PATHS: readonly IProposalAdaptiveFacadePath[] =
	Object.freeze([
		describeAdaptiveFacadePath({
			intent: 'orient',
			toolName: 'auto_work',
			effect: 'read',
			expectedCalls: 1,
			intentFit: 1,
			sideEffectRisk: 0.02,
		}),
		describeAdaptiveFacadePath({
			intent: 'plan',
			toolName: 'auto_work',
			effect: 'read',
			expectedCalls: 1,
			intentFit: 1,
			sideEffectRisk: 0.02,
		}),
		describeAdaptiveFacadePath({
			intent: 'claim',
			toolName: 'agent_lock',
			effect: 'write',
			expectedCalls: 1,
			intentFit: 1,
			sideEffectRisk: 0.42,
		}),
		describeAdaptiveFacadePath({
			intent: 'claim',
			toolName: 'agent_worktree',
			effect: 'write',
			expectedCalls: 2,
			intentFit: 0.76,
			sideEffectRisk: 0.28,
		}),
		describeAdaptiveFacadePath({
			intent: 'progress',
			toolName: 'proposal_review',
			effect: 'write',
			expectedCalls: 1,
			intentFit: 1,
			sideEffectRisk: 0.4,
		}),
		describeAdaptiveFacadePath({
			intent: 'progress',
			toolName: 'task_queue_enqueue',
			effect: 'write',
			expectedCalls: 1,
			intentFit: 0.74,
			sideEffectRisk: 0.22,
		}),
		describeAdaptiveFacadePath({
			intent: 'close',
			toolName: 'proposal_transition',
			effect: 'write',
			expectedCalls: 1,
			intentFit: 1,
			sideEffectRisk: 0.54,
		}),
		describeAdaptiveFacadePath({
			intent: 'close',
			toolName: 'proposal_review',
			effect: 'write',
			expectedCalls: 2,
			intentFit: 0.84,
			sideEffectRisk: 0.36,
		}),
		describeAdaptiveFacadePath({
			intent: 'recover',
			toolName: 'state_repair',
			effect: 'recovery',
			expectedCalls: 1,
			intentFit: 1,
			sideEffectRisk: 0.66,
		}),
		describeAdaptiveFacadePath({
			intent: 'recover',
			toolName: 'proposal_force_transition',
			effect: 'recovery',
			expectedCalls: 1,
			intentFit: 0.9,
			sideEffectRisk: 0.92,
		}),
	]);

export const listProposalAdaptiveFacadePaths = (
	intent?: TProposalAdaptiveFacadeIntent,
): readonly IProposalAdaptiveFacadePath[] =>
	intent === undefined
		? PROPOSALS_ADAPTIVE_FACADE_PATHS
		: PROPOSALS_ADAPTIVE_FACADE_PATHS.filter(
				(path) => path.intent === intent,
			);

/** Register the proposals stable facade contribution once the plugin loads. */
export const registerProposalsStableTools =
	(): readonly IStableToolDescriptor[] =>
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
