// effect-boundary-authorized: reads secret files from the host into memory only; nothing is ever written, and the values are returned to the caller instead of being stored.
import { readFile } from 'node:fs/promises';

import { redactSecrets } from '@delendai/core/public';

import { REDACTED_VALUE } from './contracts/constants/env-redaction.constant';
import type {
	IResolvedSecrets,
	ISecretReference,
	ISecretSources,
} from './contracts/interfaces/secret-resolver.interface';
import { ENV_NAME_PATTERN } from './contracts/constants/ssh.constant';

/** The variable that names the running agent's socket. */
const AGENT_SOCKET_VARIABLE = 'SSH_AUTH_SOCK';

/** A value shorter than this is too likely to match ordinary text. */
const MIN_REDACTABLE_LENGTH = 4;

/** The host as it is, read from the process and the filesystem. */
export const hostSecretSources = (): ISecretSources => ({
	env: process.env,
	readFile: (path) => readFile(path, 'utf8'),
});

const assertName = (name: string): void => {
	if (!ENV_NAME_PATTERN.test(name)) {
		throw new Error(`not a valid secret name: ${name}`);
	}
};

/** Longest value first, so a value containing another is replaced whole. */
const buildRedactor =
	(values: readonly string[]) =>
	(text: string): string => {
		const ordered = values
			.filter((value) => value.length >= MIN_REDACTABLE_LENGTH)
			.sort((a, b) => b.length - a.length);
		let out = text;
		for (const value of ordered)
			out = out.split(value).join(REDACTED_VALUE);
		return redactSecrets(out).text;
	};

/**
 * Resolve secret references into memory. A value lives in the returned
 * object and nowhere else: the resolver has no way to write, and the
 * redactor it returns removes those values from any text that is about
 * to be logged. A reference that cannot be resolved is an error naming
 * the reference, never the value.
 */
export const resolveSecrets = async (
	references: readonly ISecretReference[],
	sources: ISecretSources = hostSecretSources(),
): Promise<IResolvedSecrets> => {
	const values: Record<string, string> = {};
	let agentSocket: string | undefined;
	for (const reference of references) {
		if (reference.kind === 'ssh-agent-forward') {
			const socket = sources.env[AGENT_SOCKET_VARIABLE];
			if (socket === undefined || socket.length === 0) {
				throw new Error(
					`ssh-agent-forward needs ${AGENT_SOCKET_VARIABLE} to be set on the host`,
				);
			}
			agentSocket = socket;
			continue;
		}
		assertName(reference.name);
		if (reference.kind === 'env') {
			const from = reference.from ?? reference.name;
			const value = sources.env[from];
			if (value === undefined) {
				throw new Error(`host variable ${from} is not set`);
			}
			values[reference.name] = value;
			continue;
		}
		try {
			values[reference.name] = (
				await sources.readFile(reference.path)
			).replace(/\r?\n$/, '');
		} catch {
			throw new Error(`secret file ${reference.path} could not be read`);
		}
	}
	return {
		values,
		...(agentSocket === undefined ? {} : { agentSocket }),
		names: Object.keys(values),
		redact: buildRedactor(Object.values(values)),
	};
};
