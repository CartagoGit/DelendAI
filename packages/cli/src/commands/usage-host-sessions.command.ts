import {
	claudeProjectsDir,
	meterSessions,
} from '@delendai/usage-tracking/public';
import type {
	IHostSessionTokens,
	IThreadTokens,
} from '@delendai/usage-tracking/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../contracts/interfaces/cli-command.interface';
import { scalarArg } from '../lib/helpers/cli-command.helper';

const short = (n: number): string =>
	n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}k`;

const row = (name: string, u: IThreadTokens): string =>
	`${name.slice(0, 28).padEnd(28)} calls=${String(u.calls).padStart(5)} ` +
	`in=${short(u.input)} cw=${short(u.cacheWrite)} cr=${short(u.cacheRead)} ` +
	`out=${short(u.output)} ctx~${short(u.contextMedian)} max ${short(u.contextMax)}`;

const render = (sessions: readonly IHostSessionTokens[]): string =>
	sessions
		.flatMap((s) => [
			`session ${s.session}`,
			`  ${row('MAIN', s.main)}`,
			...s.subagents.map(
				(a) => `  ${row(a.id, a)}  | ${a.prompt.slice(0, 60)}`,
			),
		])
		.join('\n');

/**
 * Claude Code only: other hosts keep their transcripts elsewhere and are not
 * read here. Reads the transcripts of this workspace, never writes.
 */
export const usageHostSessionsCommand: ICliCommand = {
	name: 'usage host-sessions',
	offline: true,
	readsOnly: () => true,
	summary:
		'Report the tokens each thread of a Claude Code session spent: main and every subagent.',
	usage: 'usage host-sessions [--since=<date|time>] [--until=<date|time>] [--session=<id>] [--projects-dir=<dir>]',
	flags: ['since', 'until', 'session', 'projects-dir'],
	async run(args, ctx) {
		const dir =
			scalarArg(args, 'projects-dir') ??
			claudeProjectsDir(ctx.globals.workspace);
		const sessions = await meterSessions(dir, {
			from: scalarArg(args, 'since'),
			to: scalarArg(args, 'until'),
			session: scalarArg(args, 'session'),
		});
		return {
			code: EXIT_CODE.OK,
			data: { dir, sessions },
			text: sessions.length ? render(sessions) : `no sessions in ${dir}`,
		};
	},
};
