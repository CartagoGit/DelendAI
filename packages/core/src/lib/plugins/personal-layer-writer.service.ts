/**
 * personal-layer-writer.service.ts — the one writer of a person's project
 * file: what is added is merged into what the person already declared,
 * written privately, under one mutex.
 *
 * The migration that moves accounts out of the committed configuration
 * and the offer of the accounts found on the machine both write this
 * file; each kept its own copy of the rules (what the person declared
 * wins, the file is private), and one copy is the only way they cannot
 * drift.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
	PERSONAL_DIRECTORY_MODE,
	PERSONAL_FILE_MODE,
	PERSONAL_LAYER_SCHEMA,
} from '../contracts/constants/personal-layer-schema.constant';
import { writeFileAtomic } from '../shared/atomic-write';
import { withFileMutex } from '../shared/with-file-mutex';
import type {
	IPersonalAddition,
	IPersonalMerge,
} from '../contracts/interfaces/personal-addition.interface';
import { parsePersonalLayer } from './personal-layer.service';

const readText = async (path: string): Promise<string | undefined> =>
	readFile(path, 'utf8').catch(() => undefined);

/**
 * Merge `addition` into the file at `target`, without a lock: for a caller
 * already holding the file's mutex. What the person declared wins (an
 * account or binding they hold is not replaced). A file that does not
 * parse is refused, never overwritten.
 */
export const mergeIntoPersonalLayer = async (
	target: string,
	addition: IPersonalAddition,
): Promise<IPersonalMerge> => {
	const current = parsePersonalLayer(await readText(target));
	if (current.issue !== undefined) {
		throw new Error(
			`personal configuration ${target} ${current.issue}: fix or remove it, then start again`,
		);
	}
	const layer = current.layer;
	const held = new Set((layer.accounts ?? []).map((each) => each.accountId));
	const bound = new Set((layer.providers ?? []).map((each) => each.id));
	const declined = new Set(layer.declinedOffers ?? []);
	const accounts = (addition.accounts ?? []).filter(
		(account) => !held.has(String(account.accountId)),
	);
	const providers = (addition.providers ?? []).filter(
		(binding) => !bound.has(binding.id),
	);
	const declinedOffers = [...new Set(addition.declinedOffers ?? [])].filter(
		(id) => !declined.has(id),
	);
	const merged = {
		accounts: accounts.length,
		providers: providers.length,
		declinedOffers: declinedOffers.length,
	};
	if (accounts.length + providers.length + declinedOffers.length === 0)
		return merged;
	const next = {
		...layer,
		...(accounts.length === 0 && layer.accounts === undefined
			? {}
			: { accounts: [...(layer.accounts ?? []), ...accounts] }),
		...(providers.length === 0 && layer.providers === undefined
			? {}
			: { providers: [...(layer.providers ?? []), ...providers] }),
		...(declinedOffers.length === 0 && layer.declinedOffers === undefined
			? {}
			: {
					declinedOffers: [
						...(layer.declinedOffers ?? []),
						...declinedOffers,
					],
				}),
	};
	// What is written must read back: an addition the schema refuses would
	// leave a file every later start refuses too.
	const valid = PERSONAL_LAYER_SCHEMA.safeParse(next);
	if (!valid.success) {
		throw new Error(
			`not written to ${target}: ${valid.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
		);
	}
	await mkdir(dirname(target), {
		recursive: true,
		mode: PERSONAL_DIRECTORY_MODE,
	});
	await writeFileAtomic(target, `${JSON.stringify(next, null, '\t')}\n`, {
		mode: PERSONAL_FILE_MODE,
	});
	return merged;
};

/** `mergeIntoPersonalLayer` under the file's mutex. */
export const addToPersonalLayer = async (
	target: string,
	addition: IPersonalAddition,
): Promise<IPersonalMerge> => {
	await mkdir(dirname(target), {
		recursive: true,
		mode: PERSONAL_DIRECTORY_MODE,
	});
	return withFileMutex(
		target,
		() => mergeIntoPersonalLayer(target, addition),
		{
			onContention: 'wait',
		},
	);
};
