/**
 * task-pack.service.ts — a delegated task, rendered as the prompt a worker
 * on another vendor reads.
 *
 * A host subagent is handed an `IDelegatedTask`; a worker the runner
 * starts reads text. The text is the task's own sections, never the
 * caller's conversation: what to achieve, how it will be checked, what it
 * may call, the context it was given, and what it asked for but could not
 * be given — so a worker can tell "no context" from "context unreadable".
 */
import type { IDelegatedTask } from '@delendai/contracts';

import type {
	IClosedContract,
	IClosedContractResult,
} from '../contracts/interfaces/closed-contract.interface';

const section = (title: string, lines: readonly string[]): string =>
	lines.length === 0 ? '' : `## ${title}\n${lines.join('\n')}\n`;

/** The prompt `task` is handed over as, with `context` the compiled context when the caller has it. */
export const renderTaskPack = (
	task: IDelegatedTask,
	context?: string | undefined,
): string =>
	[
		section('Objective', [task.objective]),
		section(
			'Acceptance (the orchestrator checks these)',
			task.acceptance.map((line) => `- ${line}`),
		),
		section(
			'Tools you may call',
			task.allowedTools.length === 0
				? ['- none']
				: task.allowedTools.map((tool) => `- ${tool}`),
		),
		section('Context', [
			context === undefined || context.length === 0
				? `Context manifest ${task.manifestId}${task.moreContext.allowed && task.moreContext.via !== undefined ? `: read it through ${task.moreContext.via}` : ''}.`
				: context,
		]),
		section(
			'Asked for but not given',
			(task.missingContext ?? []).map(
				(item) => `- ${item.id}: ${item.reason}`,
			),
		),
		section('Output', [
			task.outputSchema === undefined
				? 'Answer in plain text.'
				: `Answer with JSON matching this schema:\n${JSON.stringify(task.outputSchema)}`,
		]),
	]
		.filter((part) => part.length > 0)
		.join('\n');

const RULES = [
	'You may not redesign the task, widen its scope or launch other agents.',
	'Change only the authorized files. When a stop condition holds, or you need more capacity than the limits allow, stop and answer with a blocker; do not go on.',
];

const bullets = (items: readonly string[]): string[] =>
	items.map((item) => `- ${item}`);

/** The sections of `contract` that are empty, by name. */
const missingSections = (contract: IClosedContract): string[] => {
	const lists: ReadonlyArray<readonly [string, readonly string[]]> = [
		['authorizedFiles', contract.authorizedFiles],
		['interfaces', contract.interfaces],
		['invariants', contract.invariants],
		['dependencies', contract.dependencies],
		['acceptance', contract.acceptance],
		['tests', contract.tests],
		['stopConditions', contract.stopConditions],
	];
	const budget = Object.entries(contract.budget)
		.filter(([, value]) => !(Number.isFinite(value) && value > 0))
		.map(([name]) => `budget.${name}`);
	return [
		...(contract.objective.trim().length === 0 ? ['objective'] : []),
		...lists
			.filter(([, items]) => items.length === 0)
			.map(([name]) => name),
		...budget,
		...(contract.unit.trim().length === 0 ? ['unit'] : []),
	];
};

/**
 * The prompt a worker reads for one closed contract: every section, and
 * the rule that it cannot redesign, widen scope or launch agents. A
 * contract missing a section is refused with the names of the gaps.
 */
export const renderClosedContract = (
	contract: IClosedContract,
): IClosedContractResult => {
	const missing = missingSections(contract);
	if (missing.length > 0) return { ok: false, missing };
	const { budget } = contract;
	const prompt = [
		section('Objective', [contract.objective]),
		section('Unit (this contract is bound to it)', [contract.unit]),
		section('Authorized files', bullets(contract.authorizedFiles)),
		section(
			'Interfaces and expected behaviour',
			bullets(contract.interfaces),
		),
		section('Invariants', bullets(contract.invariants)),
		section('Dependencies', bullets(contract.dependencies)),
		section('Acceptance', bullets(contract.acceptance)),
		section('Exact tests', bullets(contract.tests)),
		section('Budget and limits', [
			`- tokens: ${budget.tokens}`,
			`- calls: ${budget.calls}`,
			`- turns: ${budget.turns}`,
			`- retries: ${budget.retries}`,
		]),
		section('Stop conditions', bullets(contract.stopConditions)),
		section('Rules', bullets(RULES)),
	].join('\n');
	return { ok: true, prompt };
};
