/**
 * work-unit.tool.ts — a unit of work, from any host (x00736).
 *
 * Entering, claiming, checkpointing and publishing a unit was reachable
 * only from a terminal (`delendai work …`). A host that reaches delendai
 * through MCP alone could read the review queue and record verdicts, and
 * never had a unit to record them in. This tool runs the same engine the
 * CLI runs (`runWorkUnit`), with the same operations and flags.
 *
 * The session is this server's. One server serves one conversation, so
 * every call from it keeps its unit, and two instances of one model, each
 * with its own server, never share one without passing anything.
 */
import { randomUUID } from 'node:crypto';

import z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkUnitToolOptions } from '../contracts/interfaces/work-unit-context.interface';
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { runWorkUnit } from '../work-units/work-unit.service';
import { toolJson } from '../shared/tool-response';

const WORK_UNIT_REGISTRATION_ID = 'work';

const workUnitInputSchema = z.object({
	action: z.enum([
		'status',
		'swarm',
		'doctor',
		'claim',
		'enter',
		'checkpoint',
		'publish',
	]),
	proposal: z.string().min(1).optional(),
	slice: z.string().min(1).optional(),
	kind: z.string().min(1).optional(),
	topic: z.string().min(1).optional(),
	generation: z.number().int().positive().optional(),
	agent: z.string().min(1).optional(),
	session: z.string().min(1).optional(),
	message: z.string().min(1).optional(),
	paths: z.array(z.string().min(1)).optional(),
	ref: z.string().min(1).optional(),
	keepWorkRef: z.boolean().optional(),
	noPullRequest: z.boolean().optional(),
});

const workUnitOutputSchema = z.object({
	ok: z.boolean(),
	code: z.number().int(),
	data: z.unknown().optional(),
	error: z.string().optional(),
});

type IWorkUnitInput = z.infer<typeof workUnitInputSchema>;

/** The CLI flags `runWorkUnit` reads, from the tool's input. */
export const workUnitArgs = (
	input: IWorkUnitInput,
	session: string,
): readonly string[] => {
	const flag = (name: string, value: string | number | undefined) =>
		value === undefined ? [] : [`--${name}=${String(value)}`];
	return [
		input.action,
		...flag('proposal', input.proposal),
		...flag('slice', input.slice),
		...flag('kind', input.kind),
		...flag('topic', input.topic),
		...flag('generation', input.generation),
		...flag('agent', input.agent),
		...flag('session', input.session ?? session),
		...flag('message', input.message),
		...flag('paths', input.paths?.join(',')),
		...flag('ref', input.ref),
		...(input.keepWorkRef === true ? ['--keep-work-ref'] : []),
		...(input.noPullRequest === true ? ['--no-pull-request'] : []),
	];
};

export const buildWorkUnitToolRegistration = (
	options: IWorkUnitToolOptions,
): IToolRegistration => {
	const session = options.session ?? randomUUID().slice(0, 8);
	return {
		id: WORK_UNIT_REGISTRATION_ID,
		summary:
			'Enter, claim, checkpoint and publish your unit of work; see the swarm.',
		tags: ['workflow', 'git'],
		effects: ['write', 'spawn', 'network'],
		writeRoot: 'repository',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_${WORK_UNIT_REGISTRATION_ID}`,
				{
					title: 'DelendAI Unit of Work',
					description:
						'Your unit of work, from any host: the same operations as `delendai work`. `enter` gives you your own worktree and work ref (pass it as `checkout` to the write tools); `publish` turns the unit into a pull request. The session is this server’s, so your calls keep your unit; pass `agent` (your model id) unless DELENDAI_AGENT_ID is set.',
					inputSchema: workUnitInputSchema,
					outputSchema: workUnitOutputSchema,
				},
				async (input: IWorkUnitInput) => {
					const result = await runWorkUnit(
						workUnitArgs(input, session),
						{
							cwd: options.workspaceRoot,
							globals: {
								workspace: options.workspaceRoot,
								json: true,
								format: 'json',
							},
						},
					);
					return toolJson({
						ok: result.code === EXIT_CODE.OK,
						code: result.code,
						...(result.data === undefined
							? {}
							: { data: result.data }),
						...(result.error === undefined
							? {}
							: { error: result.error }),
					});
				},
			);
		},
	};
};
