/**
 * agent-onboard.tool.ts — `<prefix>_onboard_agent`: make a project able to
 * use an agent, whatever it is.
 *
 * plan: look the target up in the registry, the declarations and the
 * machine; an ACP agent is greeted (what it says it is, at no cost); one
 * no catalogue knows comes back with its own help and a draft declaration
 * for the calling model to complete. apply: write the declaration (checked
 * by the schema) and the agent's usage page. prove: one prompt, only with
 * the person's consent, every permission the agent asks for refused.
 */
import {
	declareAgent,
	introduceAgent,
	listAgents,
	runAcpAgent,
	runClientCommand,
	writeAgentUsagePage,
} from '@delendai/core/cli';
import { toolJson } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';

import {
	ONBOARD_AGENT_INPUT_SCHEMA,
	ONBOARD_AGENT_OUTPUT_SCHEMA,
} from '../contracts/constants/onboard-agent-schema.constant';
import type {
	IOnboardAgentFlows,
	IOnboardAgentToolOptions,
} from '../contracts/interfaces/onboard-agent.interface';

const HELP_BYTES = 4000;
const PROOF_TEXT_BYTES = 500;
const DEFAULT_PROOF_PROMPT = 'Reply with the single word: ready';

export const realOnboardFlows: IOnboardAgentFlows = {
	listAgents,
	declareAgent,
	introduceAgent,
	writeAgentUsagePage,
	runAcpAgent,
	help: async (command, cwd) =>
		(
			await runClientCommand(`${command} --help 2>&1`, {
				cwd,
				timeoutMs: 3000,
			})
		).output,
};

const kebab = (text: string): string =>
	(text.split(/[\\/]/u).pop() ?? text)
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '') || 'agent';

type IInput = {
	readonly target: string;
	readonly mode: 'plan' | 'apply' | 'prove';
	readonly declaration?: Record<string, unknown> | undefined;
	readonly consent?: boolean | undefined;
	readonly prompt?: string | undefined;
};

/** The tool's work, apart from MCP, so it can be driven directly. */
export const onboardAgent = async (
	input: IInput,
	workspace: string,
	flows: IOnboardAgentFlows = realOnboardFlows,
) => {
	const { agents } = await flows.listAgents({ workspace, all: true });
	const wanted = input.target.toLowerCase();
	const agent = agents.find(
		(each) =>
			each.id === wanted ||
			each.name.toLowerCase() === wanted ||
			each.launch?.command === input.target,
	);
	if (input.mode === 'apply') {
		if (input.declaration === undefined)
			return {
				mode: input.mode,
				known: agent !== undefined,
				nextAction:
					'pass `declaration` (the draft from plan, completed) to apply',
			};
		const declared = await flows.declareAgent({
			workspace,
			agent: input.declaration,
		});
		const { agents: after } = await flows.listAgents({
			workspace,
			all: true,
		});
		const written = after.find((each) => each.id === declared.agent.id);
		const page =
			written === undefined
				? undefined
				: await flows.writeAgentUsagePage({
						workspace,
						agent: written,
					});
		return {
			mode: input.mode,
			known: true,
			declared,
			page,
			nextAction: `run \`delendai accounts offer\` to add the account ${declared.agent.id} runs on, then onboard_agent mode=prove with the person's consent`,
		};
	}
	if (input.mode === 'prove') {
		if (agent?.launch === undefined)
			return {
				mode: input.mode,
				known: agent !== undefined,
				nextAction:
					'it cannot start over ACP: apply a declaration with its command first',
			};
		if (input.consent !== true)
			return {
				mode: input.mode,
				known: true,
				agent,
				nextAction:
					'a prompt may spend: ask the person, then call again with consent: true',
			};
		const proof = await flows.runAcpAgent(agent.launch, {
			cwd: workspace,
			prompt: input.prompt ?? DEFAULT_PROOF_PROMPT,
			timeoutMs: 120_000,
		});
		return {
			mode: input.mode,
			known: true,
			agent,
			proof: { ...proof, text: proof.text.slice(0, PROOF_TEXT_BYTES) },
			nextAction:
				proof.stopReason === 'end_turn'
					? 'it answered: the project can use it'
					: `it stopped with ${proof.stopReason}`,
		};
	}
	if (agent !== undefined) {
		const introduction =
			agent.launch === undefined
				? undefined
				: await flows
						.introduceAgent(agent.launch, workspace)
						.catch(() => undefined);
		return {
			mode: input.mode,
			known: true,
			agent,
			introduction,
			nextAction:
				agent.declared === undefined
					? `known from the ${agent.origin === 'registry' ? 'registry' : 'machine'}; apply a declaration only to reach it another way`
					: 'already declared; prove it with the person’s consent',
		};
	}
	if (/^https?:\/\//u.test(input.target))
		return {
			mode: input.mode,
			known: false,
			draft: {
				id: kebab(new URL(input.target).hostname),
				kind: 'http',
				url: input.target,
			},
			nextAction:
				'complete the draft (name, keyVariables) and call apply',
		};
	const help = (await flows.help(input.target, workspace)).slice(
		0,
		HELP_BYTES,
	);
	return {
		mode: input.mode,
		known: false,
		help,
		draft: {
			id: kebab(input.target),
			kind: /\bacp\b/iu.test(help) ? 'acp' : 'cli',
			command: input.target,
			probes: {},
		},
		nextAction:
			'read the help, fill the probes (login, models, prompt, quota) and the args that start it, then call apply',
	};
};

export const buildOnboardAgentRegistration = (
	options: IOnboardAgentToolOptions,
): IToolRegistration => ({
	id: 'onboard_agent',
	tags: ['orchestrator-runner', 'lazy', 'bootstrap'],
	effects: ['spawn', 'write', 'network'],
	writeRoot: 'host-state',
	summary:
		'Make the project able to use any agent: look it up, draft its declaration, write it, prove it with consent.',
	descriptionKey: 'delendai_orchestrator-runner_onboard_agent',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_onboard_agent`,
			{
				description:
					'Make the project able to use an AI agent, CLI or endpoint. plan: looks the target (registry id or name, command, executable, URL) up in the public ACP registry, the declarations and this machine; an ACP agent is greeted for what it says it is (no cost); an unknown one returns its own --help and a draft declaration for you to complete. apply: writes the completed declaration to the person’s file (schema-checked) and the agent’s usage page under docs/delendai/models. prove: sends one prompt over ACP only with consent: true, refusing every permission the agent asks for. Never reads a credential value.',
				inputSchema: ONBOARD_AGENT_INPUT_SCHEMA,
				outputSchema: ONBOARD_AGENT_OUTPUT_SCHEMA,
			},
			async (args) =>
				toolJson(
					await onboardAgent(
						args,
						options.workspaceRoot,
						options.flows,
					),
				),
		);
	},
});
