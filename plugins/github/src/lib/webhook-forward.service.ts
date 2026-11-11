// effect-boundary-authorized: this is the transport adapter itself, run by
// the host server that holds the maintenance lease, not by a plugin tool;
// `IPluginEffectsCapability` declares only `git`, and the adapter's spawn
// and loopback listener are injected seams its spec replaces.
/**
 * webhook-forward.service.ts — GitHub's transport for the forge event port:
 * `gh webhook forward` opens a websocket OUT to GitHub and posts each
 * delivery to a listener on this machine's loopback address. No inbound
 * port, no public address and no relay of ours: the forge CLI's own login
 * supplies the credential.
 *
 * The extension (`gh extension install cli/gh-webhook`) creates a webhook on
 * the repository with the secret it is given, so GitHub signs each delivery
 * with it and the adapter can check it. The secret travels only in the
 * child's arguments: the extension reads it from no other place. It is drawn
 * for this connection and dies with it, because the webhook does.
 *
 * Ready means the extension said its websocket is open; an exit before that
 * rejects the open, an exit after it closes the connection.
 */

import { spawn as spawnProcess } from 'node:child_process';
import { createServer } from 'node:http';

import {
	GH_FORWARD_LISTEN_HOST,
	GH_FORWARD_OUTPUT_KEEP_CHARS,
	GH_FORWARD_READY_LINE,
	GH_FORWARD_READY_TIMEOUT_MS,
	GH_FORWARD_REASON_CHARS,
	GITHUB_FORWARDED_EVENTS,
} from './contracts/constants/github-webhook.constant';

import type {
	IForgeEventDelay,
	IForgeEventTransport,
} from '@delendai/forge/public';
import type {
	IForwardListen,
	IForwardSpawn,
	IGhWebhookForwardInput,
} from './contracts/interfaces/webhook-forward.interface';

const HTTP_ACCEPTED = 202;

/** Listen on loopback; answer every POST at once, then hand it over. */
export const listenOnLoopback: IForwardListen = (onDelivery) =>
	new Promise((resolve, reject) => {
		const server = createServer((request, response) => {
			const chunks: Buffer[] = [];
			request.on('data', (chunk: Buffer) => chunks.push(chunk));
			request.on('end', () => {
				// Answered before it is handled: the extension drops its
				// websocket when a post fails, so a slow handler must not
				// look like one.
				response.writeHead(HTTP_ACCEPTED).end();
				const headers: Record<string, string> = {};
				for (const [name, value] of Object.entries(request.headers)) {
					if (typeof value === 'string')
						headers[name.toLowerCase()] = value;
				}
				onDelivery({
					headers,
					body: Buffer.concat(chunks).toString('utf8'),
				});
			});
		});
		server.once('error', reject);
		server.listen(0, GH_FORWARD_LISTEN_HOST, () => {
			const address = server.address();
			const port =
				typeof address === 'object' && address !== null
					? address.port
					: 0;
			resolve({
				port,
				close: () =>
					new Promise((done) => {
						server.close(() => {
							done();
						});
						server.closeAllConnections();
					}),
			});
		});
	});

/** Start `gh` with its output merged into one stream of text. */
export const spawnGh: IForwardSpawn = (args) => {
	const child = spawnProcess('gh', [...args], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	return {
		onOutput: (listener) => {
			child.stdout.on('data', (chunk: Buffer) =>
				listener(chunk.toString()),
			);
			child.stderr.on('data', (chunk: Buffer) =>
				listener(chunk.toString()),
			);
		},
		onExit: (listener) => {
			child.on('exit', listener);
			// A missing `gh` emits `error` and no `exit`.
			child.on('error', () => listener(null));
		},
		kill: () => {
			child.kill();
		},
	};
};

const timerDelay: IForgeEventDelay = (run, delayMs) => {
	const handle = setTimeout(run, delayMs);
	handle.unref?.();
	return () => {
		clearTimeout(handle);
	};
};

/** The arguments of one forwarder, the secret included. */
export const ghForwardArgs = (
	repository: string,
	port: number,
	secret: string,
): readonly string[] => [
	'webhook',
	'forward',
	`--repo=${repository}`,
	`--events=${GITHUB_FORWARDED_EVENTS.join(',')}`,
	`--url=http://${GH_FORWARD_LISTEN_HOST}:${String(port)}/`,
	`--secret=${secret}`,
];

/** What a forwarder said, short and with the secret masked. */
const reasonOf = (
	output: string,
	secret: string,
	code: number | null,
): string => {
	const lines = output
		.split(secret)
		.join('***')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const said =
		lines.find((line) => line.startsWith('Error')) ?? lines[0] ?? '';
	const exit =
		code === null ? 'gh could not start' : `gh exited ${String(code)}`;
	return said.length === 0
		? exit
		: `${exit}: ${said.slice(0, GH_FORWARD_REASON_CHARS)}`;
};

export const createGhWebhookForwardTransport = (
	input: IGhWebhookForwardInput,
): IForgeEventTransport => {
	const spawn = input.spawn ?? spawnGh;
	const listen = input.listen ?? listenOnLoopback;
	const delay = input.delay ?? timerDelay;
	return {
		open: async ({ secret, onDelivery, onClosed }) => {
			const listener = await listen(onDelivery);
			const child = spawn(
				ghForwardArgs(input.repository, listener.port, secret),
			);
			let output = '';
			let ready = false;
			let ended = false;
			const end = async (): Promise<void> => {
				if (ended) return;
				ended = true;
				child.kill();
				await listener.close();
			};
			return new Promise((resolve, reject) => {
				const cancelWait = delay(() => {
					if (ready) return;
					void end();
					reject(
						new Error(
							`gh webhook forward said nothing ready in ${String(GH_FORWARD_READY_TIMEOUT_MS)} ms`,
						),
					);
				}, GH_FORWARD_READY_TIMEOUT_MS);
				child.onOutput((chunk) => {
					output = (output + chunk).slice(
						-GH_FORWARD_OUTPUT_KEEP_CHARS,
					);
					if (ready || !output.includes(GH_FORWARD_READY_LINE))
						return;
					ready = true;
					cancelWait();
					resolve({ close: end });
				});
				child.onExit((code) => {
					cancelWait();
					const reason = reasonOf(output, secret, code);
					const wasReady = ready;
					const already = ended;
					void end();
					if (!wasReady) reject(new Error(reason));
					else if (!already) onClosed(reason);
				});
			});
		},
	};
};
