/**
 * account-offer-flow.service.ts — the accounts this machine's clients are
 * logged in with, offered to the person one by one; a yes is written to
 * their own project file, a no is remembered so it is not asked again.
 *
 * `init` and `delendai accounts offer` run this one flow. It asks the
 * clients only after the person started it (their consent), declares
 * nothing in the committed configuration, and leaves every account it
 * writes closed to unattended work.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IClientCommandRunner,
	IClientDiscovery,
} from '../contracts/interfaces/known-client.interface';
import type { IAccountOfferOutcome } from '../contracts/interfaces/account-offer.interface';
import type { IProviderAccount } from '../contracts/interfaces/provider-account.interface';
import { discoverClients } from '../shared/client-discovery.service';
import { accountOffers } from './account-offers.service';
import { DEFAULT_CONFIG_FILENAME, parseConfigFile } from './load-config-file';
import { addToPersonalLayer } from './personal-layer-writer.service';
import {
	parsePersonalLayer,
	personalLayerPath,
	projectIdentity,
} from './personal-layer.service';

const readText = async (path: string): Promise<string | undefined> =>
	readFile(path, 'utf8').catch(() => undefined);

/**
 * Discover, offer, write. `ask` answers each offer; it is not called when
 * there is nothing to offer, and an offer it does not answer is only listed. `discovered` stands in for the discovery (a
 * caller that already ran it, or a spec).
 */
export const offerFoundAccounts = async (input: {
	readonly workspace: string;
	readonly run: IClientCommandRunner;
	/** Yes, no, or no answer (nobody to ask): neither added nor declined. */
	readonly ask: (offer: IProviderAccount) => Promise<boolean | undefined>;
	readonly personalRoot?: string | undefined;
	readonly discovered?: readonly IClientDiscovery[] | undefined;
}): Promise<IAccountOfferOutcome> => {
	const personalPath = personalLayerPath(
		await projectIdentity(input.workspace),
		input.personalRoot,
	);
	const personal = parsePersonalLayer(await readText(personalPath)).layer;
	const shared = parseConfigFile(
		await readText(join(input.workspace, DEFAULT_CONFIG_FILENAME)),
	);
	const discoveries =
		input.discovered ??
		(await discoverClients(input.run, input.workspace, { login: true }));
	const offered = accountOffers(discoveries, {
		accounts: [...(shared.accounts ?? []), ...(personal.accounts ?? [])],
		declined: personal.declinedOffers ?? [],
	});
	const added: IProviderAccount[] = [];
	const declined: string[] = [];
	for (const offer of offered) {
		const answer = await input.ask(offer);
		if (answer === true) added.push(offer);
		else if (answer === false) declined.push(offer.accountId);
	}
	if (added.length + declined.length > 0) {
		await addToPersonalLayer(personalPath, {
			accounts: added.map((account) => ({ ...account })),
			declinedOffers: declined,
		});
	}
	return {
		personalLayer: personalPath,
		offered,
		added: added.map((account) => account.accountId),
		declined,
	};
};
