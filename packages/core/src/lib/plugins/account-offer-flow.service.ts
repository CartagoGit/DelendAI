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
import type {
	IAccountClassification,
	IAccountFinding,
	IPlanTool,
} from '../contracts/interfaces/account-finding.interface';
import type { IAccountOfferOutcome } from '../contracts/interfaces/account-offer.interface';
import type { IProviderAccount } from '../contracts/interfaces/provider-account.interface';
import {
	fetchLocalModels,
	gatherFindings,
	type ILocalFetch,
} from '../shared/account-sources.service';
import { discoverClients } from '../shared/client-discovery.service';
import { seenModels } from '../work-identity/model-identity.helper';
import {
	accountOffers,
	alreadyKnown,
	offerFor,
} from './account-offers.service';
import {
	learnAccounts,
	learnedAccountsPath,
	readLearnedAccounts,
} from './learned-accounts.service';
import { DEFAULT_CONFIG_FILENAME, parseConfigFile } from './load-config-file';
import {
	addToPersonalLayer,
	setPersonalAutomation,
} from './personal-layer-writer.service';
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
	/**
	 * For an account the person added: may unattended work use it? Not
	 * asked, it stays off. Spending still asks first where the runner's
	 * `confirmBeforeExecute` is on (the default).
	 */
	readonly askAutomation?: (offer: IProviderAccount) => Promise<boolean>;
	/**
	 * Who a finding is with and how it is paid, when no source says: the
	 * person's answer, kept for next time. Not given, it is only listed.
	 */
	readonly classify?: (
		finding: IAccountFinding,
	) => Promise<IAccountClassification | undefined>;
	/** Asked once before any `classify`, with how many wait: go on now? */
	readonly beforeClassifying?: (count: number) => Promise<boolean>;
	readonly personalRoot?: string | undefined;
	readonly discovered?: readonly IClientDiscovery[] | undefined;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
	readonly seen?: readonly string[] | undefined;
	readonly planTools?: readonly IPlanTool[] | undefined;
	readonly fetchLocal?: ILocalFetch | undefined;
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
	const findings = await gatherFindings({
		discoveries,
		run: input.run,
		cwd: input.workspace,
		env: input.env ?? process.env,
		seen: input.seen ?? seenModels(),
		planTools: input.planTools,
		fetchLocal: input.fetchLocal ?? fetchLocalModels,
	});
	const learnedPath = learnedAccountsPath(input.personalRoot);
	const known = {
		accounts: [...(shared.accounts ?? []), ...(personal.accounts ?? [])],
		declined: personal.declinedOffers ?? [],
	};
	const sorted = accountOffers(
		findings,
		known,
		await readLearnedAccounts(learnedPath),
	);
	const answers: Record<string, IAccountClassification> = {};
	const offered = [...sorted.offers];
	const unclassified: IAccountFinding[] = [];
	const classifying =
		sorted.unclassified.length > 0 &&
		input.classify !== undefined &&
		(input.beforeClassifying === undefined ||
			(await input.beforeClassifying(sorted.unclassified.length)));
	for (const finding of sorted.unclassified) {
		const answer = classifying
			? await input.classify?.(finding)
			: undefined;
		if (answer === undefined) {
			unclassified.push(finding);
			continue;
		}
		answers[finding.key] = answer;
		const offer = offerFor(finding, answer);
		if (!alreadyKnown(offer, known)) offered.push(offer);
	}
	await learnAccounts(learnedPath, answers);
	const added: IProviderAccount[] = [];
	const declined: string[] = [];
	for (const offer of offered) {
		const answer = await input.ask(offer);
		if (answer === true)
			added.push({
				...offer,
				permittedAutomation:
					(await input.askAutomation?.(offer)) === true,
			});
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
		unclassified: unclassified.map(
			({ key, displayName, evidence, vendorHint }) => ({
				key,
				displayName,
				evidence,
				vendorHint,
			}),
		),
	};
};

/**
 * Turn unattended work on or off for one of the person's accounts in this
 * project, by id: `delendai accounts automation <id> on|off`, so nobody
 * edits the file by hand.
 */
export const setAccountAutomation = async (input: {
	readonly workspace: string;
	readonly accountId: string;
	readonly on: boolean;
	readonly personalRoot?: string | undefined;
}): Promise<{ readonly personalLayer: string; readonly changed: boolean }> => {
	const personalPath = personalLayerPath(
		await projectIdentity(input.workspace),
		input.personalRoot,
	);
	const { changed } = await setPersonalAutomation(
		personalPath,
		input.accountId,
		input.on,
	);
	return { personalLayer: personalPath, changed };
};
