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
