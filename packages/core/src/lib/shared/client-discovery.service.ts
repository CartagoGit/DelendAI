/**
 * client-discovery.service.ts — which known clients this machine has, and
 * whether each can work now, from what each client answers.
 *
 * `auto-agent-selector` and `orchestrator-runner` each probed the PATH
 * their own way and neither could tell an installed, logged-in client
 * from one that can do work. Both ask this service. A verdict is read
 * from the client's own answer to its login-status command, and names
 * that command and the line that decided it; a client with no such
 * command reads `unknown`, never a guess.
 */
import type {
	IClientCommandRunner,
	IClientDiscovery,
	IClientModels,
	IClientVerdict,
	IKnownClient,
} from '../contracts/interfaces/known-client.interface';
import { KNOWN_CLIENTS } from '../contracts/constants/known-clients.constant';

const PROBE_TIMEOUT_MS = 5_000;
const LOGIN_TIMEOUT_MS = 20_000;

/** Answers that say what stops a client, most specific first. */
const STOPPERS: readonly {
	readonly verdict: Exclude<
		IClientVerdict,
		'usable' | 'not-installed' | 'unknown'
	>;
	readonly pattern: RegExp;
}[] = [
	{
		verdict: 'quota-exhausted',
		pattern:
			/\b(quota|usage limit|rate limit)\b.*\b(reached|exceeded|exhausted)\b|\bout of (credits|quota)\b/iu,
	},
	{
		verdict: 'needs-plan',
		pattern:
			/\bno (active )?(plan|subscription)\b|\bupgrade to\b|\bpayment required\b|\bsubscription (required|expired)\b/iu,
	},
	{
		verdict: 'needs-login',
		pattern:
			/\bnot (logged|signed) in\b|\blog ?in required\b|\bunauthenticated\b|\bno credentials\b|\b0 credentials\b|\bnot authenticated\b/iu,
	},
];

/** One line as it may be shown: addresses and long tokens masked. */
const shown = (line: string): string =>
	line
		.replace(/\x1b\[[0-9;]*m/gu, '')
		.replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/giu, '<email>')
		.replace(/[A-Za-z0-9_-]{32,}/gu, '<redacted>')
		.trim();

/**
 * The verdict a client's login-status answer gives. Pure: specs feed it
 * recorded answers.
 */
export const clientVerdict = (
	client: IKnownClient,
	answer: { readonly code: number; readonly output: string } | undefined,
): Pick<IClientDiscovery, 'verdict' | 'evidence'> => {
	if (client.loginStatusArgs === undefined || answer === undefined) {
		return { verdict: 'unknown', evidence: null };
	}
	const command = [client.command, ...client.loginStatusArgs].join(' ');
	const lines = answer.output
		.split('\n')
		.map(shown)
		.filter((line) => line.length > 0);
	for (const stopper of STOPPERS) {
		const line = lines.find((each) => stopper.pattern.test(each));
		if (line !== undefined) {
			return { verdict: stopper.verdict, evidence: { command, line } };
		}
	}
	// The line that says the most: one about the login or the plan, else
	// the first with words in it (a JSON answer opens with a lone brace).
	const telling =
		lines.find((line) =>
			/\b(logged|signed|plan|subscription|credentials?|account|auth)/iu.test(
				line,
			),
		) ?? lines.find((line) => /[a-z]{3}/iu.test(line));
	if (answer.code !== 0) {
		return {
			verdict: 'needs-login',
			evidence: {
				command,
				line: telling ?? `exit ${String(answer.code)}`,
			},
		};
	}
	return {
		verdict: 'usable',
		evidence: { command, line: telling ?? 'exit 0' },
	};
};

/** Whether `command` is on PATH, where, and its version. */
export const probeClientCommand = async (
	command: string,
	run: IClientCommandRunner,
	cwd: string,
): Promise<Pick<IClientDiscovery, 'installed' | 'path' | 'version'>> => {
	const which = await run(`command -v ${command}`, {
		cwd,
		timeoutMs: PROBE_TIMEOUT_MS,
	}).catch(() => ({ code: 1, output: '' }));
	if (which.code !== 0)
		return { installed: false, path: null, version: null };
	const path = which.output.trim().split('\n')[0]?.trim() ?? '';
	const version = await run(`${command} --version`, {
		cwd,
		timeoutMs: PROBE_TIMEOUT_MS,
	})
		.then((ver) =>
			ver.code === 0
				? (ver.output.trim().split('\n')[0]?.trim() ?? null)
				: null,
		)
		.catch(() => null);
	return { installed: true, path: path === '' ? null : path, version };
};

/**
 * Every known client, probed in parallel. With `login`, the person's
 * consent already given, each installed client is asked whether it is
 * logged in and able to work.
 */
export const discoverClients = async (
	run: IClientCommandRunner,
	cwd: string,
	options: { readonly login: boolean },
	clients: readonly IKnownClient[] = KNOWN_CLIENTS,
): Promise<readonly IClientDiscovery[]> =>
	Promise.all(
		clients.map(async (client): Promise<IClientDiscovery> => {
			const probed = await probeClientCommand(client.command, run, cwd);
			if (!probed.installed) {
				return {
					client,
					...probed,
					verdict: 'not-installed',
					evidence: null,
				};
			}
			const answer =
				options.login && client.loginStatusArgs !== undefined
					? await run(
							[client.command, ...client.loginStatusArgs].join(
								' ',
							),
							{
								cwd,
								timeoutMs: LOGIN_TIMEOUT_MS,
							},
						).catch(() => undefined)
					: undefined;
			return {
				client,
				...probed,
				...(options.login
					? clientVerdict(client, answer)
					: { verdict: 'unknown' as const, evidence: null }),
			};
		}),
	);

/**
 * The models a host client says it can reach, by provider: OpenCode on
 * 2026-10-18 reached MiniMax through a credential while its own models
 * needed a plan, so "OpenCode" alone said nothing about what could run.
 * Asked through the client only; none of its files is opened.
 */
export const listClientModels = async (
	client: IKnownClient,
	run: IClientCommandRunner,
	cwd: string,
): Promise<IClientModels> => {
	if (client.modelListArgs === undefined) {
		return {
			listed: false,
			providers: [],
			reason: `${client.label} offers no way to list the models it reaches`,
		};
	}
	const answer = await run(
		[client.command, ...client.modelListArgs].join(' '),
		{ cwd, timeoutMs: LOGIN_TIMEOUT_MS },
	).catch(() => undefined);
	if (answer === undefined || answer.code !== 0) {
		return {
			listed: false,
			providers: [],
			reason: `${[client.command, ...client.modelListArgs].join(' ')} did not answer`,
		};
	}
	const byProvider = new Map<string, string[]>();
	for (const line of answer.output.split('\n')) {
		const id = line.replace(/\x1b\[[0-9;]*m/gu, '').trim();
		const slash = id.indexOf('/');
		if (slash <= 0 || /\s/u.test(id)) continue;
		const provider = id.slice(0, slash);
		byProvider.set(provider, [
			...(byProvider.get(provider) ?? []),
			id.slice(slash + 1),
		]);
	}
	return {
		listed: true,
		providers: [...byProvider].map(([provider, models]) => ({
			provider,
			models,
		})),
	};
};
