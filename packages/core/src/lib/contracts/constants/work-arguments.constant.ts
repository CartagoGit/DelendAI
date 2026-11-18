/**
 * The flags a work subcommand cannot run without, and what it says when
 * one is missing. Checked before anything is asked of git: a call that
 * names no unit used to spawn 82 git processes to say so.
 */
import type {
	IWorkArgumentsRule,
	IWorkArgumentsSubcommand,
} from '../interfaces/work-arguments.interface';

export const WORK_ARGUMENT_RULES: Readonly<
	Record<IWorkArgumentsSubcommand, IWorkArgumentsRule>
> = {
	enter: {
		required: ['proposal'],
		reason: 'A worktree belongs to one identity and one unit of work.',
		usage: 'work enter --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>] [--dir=<path>] [--alongside]; --agent defaults to DELENDAI_AGENT_ID.',
	},
	checkpoint: {
		required: ['proposal', 'slice', 'message', 'paths'],
		reason: 'A checkpoint needs an identity, a scope and a message.',
		usage: 'work checkpoint --proposal=<id> --slice=<id> --paths=<a,b> --message="..." [--agent=<who>] [--generation=<n>] [--topic=<text>]; --agent defaults to DELENDAI_AGENT_ID.',
	},
	prove: {
		required: ['proposal', 'slice'],
		reason: 'Proving needs the unit of work it proves.',
		usage: 'work prove --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>].',
	},
	publish: {
		required: ['proposal', 'slice'],
		reason: 'Publishing needs the unit of work it is publishing.',
		usage: 'work publish --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>] [--remote=origin] [--keep-work-ref].',
	},
	retire: {
		required: ['ref', 'reason'],
		reason: 'Retiring a unit needs the unit and why it will not land.',
		usage: 'work retire --ref=<its work or publication branch> --reason="<why>" [--unowned]. `work swarm` lists the units there are.',
	},
};
