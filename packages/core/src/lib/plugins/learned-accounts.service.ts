/**
 * learned-accounts.service.ts — what a person answered about a finding
 * delendai could not classify, kept for every project of that person.
 *
 * A source that cannot say who an account is with, or how it is paid, is
 * asked once. The answer is the catalogue: it grows from answers, not from
 * releases, and it is the person's own (next to their project files,
 * private, never in a repository).
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import {
	BILLING_MODES,
	CREDENTIAL_MODES,
} from '../contracts/constants/provider-account-modes.constant';
import {
	PERSONAL_DIRECTORY_MODE,
	PERSONAL_FILE_MODE,
} from '../contracts/constants/personal-layer-schema.constant';
import type { IAccountClassification } from '../contracts/interfaces/account-finding.interface';
import { writeFileAtomic } from '../shared/atomic-write';
import { withFileMutex } from '../shared/with-file-mutex';
import { defaultPersonalRoot } from './personal-layer.service';

const LEARNED_SCHEMA = z.object({
	classifications: z.record(
		z.string(),
		z
			.object({
				vendor: z.string().min(1),
				credentialMode: z.enum(CREDENTIAL_MODES),
				billingMode: z.enum(BILLING_MODES),
			})
			.strict(),
	),
});

/** The person's learned classifications, beside their project files. */
export const learnedAccountsPath = (
	root: string = defaultPersonalRoot(),
): string => join(root, 'delendai', 'learned-accounts.json');

/** What the person answered, by finding key; nothing when the file is absent or unreadable. */
export const readLearnedAccounts = async (
	path: string,
): Promise<Readonly<Record<string, IAccountClassification>>> => {
	const text = await readFile(path, 'utf8').catch(() => undefined);
	if (text === undefined) return {};
	try {
		const parsed = LEARNED_SCHEMA.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data.classifications : {};
	} catch {
		return {};
	}
};

/** Keep answers, privately, merged over what was kept before. */
export const learnAccounts = async (
	path: string,
	answers: Readonly<Record<string, IAccountClassification>>,
): Promise<void> => {
	if (Object.keys(answers).length === 0) return;
	await mkdir(dirname(path), {
		recursive: true,
		mode: PERSONAL_DIRECTORY_MODE,
	});
	await withFileMutex(
		path,
		async () => {
			const kept = await readLearnedAccounts(path);
			await writeFileAtomic(
				path,
				`${JSON.stringify({ classifications: { ...kept, ...answers } }, null, '\t')}\n`,
				{ mode: PERSONAL_FILE_MODE },
			);
		},
		{ onContention: 'wait' },
	);
};
