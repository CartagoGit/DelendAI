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
import { withDeclaredProviders } from '../shared/declared-providers.helper';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IHostByokProvider } from '../contracts/interfaces/host-byok.interface';
import { hostByokRoster } from '../shared/host-model-roster.service';

import type {
	IClientCommandRunner,
	IClientDiscovery,
	IClientProgress,
} from '../contracts/interfaces/known-client.interface';
import type {
	IAccountClassification,
	IAccountFinding,
	ILocalFetch,
	IModelCatalogue,
	IPlanTool,
} from '../contracts/interfaces/account-finding.interface';
import type {
	IAccountOfferOutcome,
	IOfferPosition,
	IOfferStep,
} from '../contracts/interfaces/account-offer.interface';
import type { IProviderAccount } from '../contracts/interfaces/provider-account.interface';
import {
	fetchLocalModels,
	gatherFindings,
} from '../shared/account-sources.service';
import { discoverClients } from '../shared/client-discovery.service';
import { catalogueSources } from '../shared/public-catalogue-sources.service';
import { knownClientsWith } from '../shared/known-client.helper';
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
	readonly ask: (
		offer: IProviderAccount,
		position?: IOfferPosition,
	) => Promise<boolean | undefined>;
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
		position?: IOfferPosition,
	) => Promise<IAccountClassification | undefined>;
	/** Asked once before any `classify`, with how many wait: go on now? */
	readonly beforeClassifying?: (count: number) => Promise<boolean>;
	readonly personalRoot?: string | undefined;
	readonly discovered?: readonly IClientDiscovery[] | undefined;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
	readonly seen?: readonly string[] | undefined;
	readonly planTools?: readonly IPlanTool[] | undefined;
	readonly fetchLocal?: ILocalFetch | undefined;
	/** The editors' BYOK providers; read from this machine's editors when absent. */
	readonly hostByok?: readonly IHostByokProvider[] | undefined;
	/** Told each step as it starts: discovery takes seconds, and silence looks stuck. */
	readonly onProgress?: ((step: IOfferStep) => void) | undefined;
	/** Reads the public model catalogue, so any provider's keys and models are named; absent, none is read. */
	readonly loadCatalogue?:
		| ((sources: readonly string[]) => Promise<IModelCatalogue | undefined>)
		| undefined;
	/** Told as each client is asked and as it answers. */
	readonly onClient?: ((progress: IClientProgress) => void) | undefined;
}): Promise<IAccountOfferOutcome> => {
	const personalPath = personalLayerPath(
		await projectIdentity(input.workspace),
		input.personalRoot,
	);
	const personal = parsePersonalLayer(await readText(personalPath)).layer;
	const shared = parseConfigFile(
		await readText(join(input.workspace, DEFAULT_CONFIG_FILENAME)),
	);
	input.onProgress?.('clients');
	const discoveries =
		input.discovered ??
		(await discoverClients(
			input.run,
			input.workspace,
			{ login: true, onClient: input.onClient },
			knownClientsWith([
				...(shared.clients ?? []),
				...(personal.clients ?? []),
			]),
		));
	const findings = await gatherFindings({
		discoveries,
		run: input.run,
		cwd: input.workspace,
		env: input.env ?? process.env,
		seen: input.seen ?? seenModels(),
		planTools: input.planTools,
		fetchLocal: input.fetchLocal ?? fetchLocalModels,
		hostByok:
			input.hostByok ?? (await hostByokRoster(input.env ?? process.env)),
		onProgress: input.onProgress,
		loadCatalogue:
			input.loadCatalogue === undefined
				? undefined
				: async () =>
						// Declared providers replace the catalogue's entries of the
						// same id, the person's own last.
						withDeclaredProviders(
							await (input.loadCatalogue?.(
								catalogueSources('models', [
									personal.catalogues,
									shared.catalogues,
								]),
							) ?? Promise.resolve(undefined)),
							[
								...(shared.modelProviders ?? []),
								...(personal.modelProviders ?? []),
							],
						),
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
	const added: IProviderAccount[] = [];
	const declined: string[] = [];
	const behind = new Map(findings.map((each) => [each.accountId, each]));
	const askEach = async (
		batch: readonly IProviderAccount[],
	): Promise<void> => {
		for (const [index, offer] of batch.entries()) {
			const answer = await input.ask(offer, {
				index: index + 1,
				total: batch.length,
				finding: behind.get(offer.accountId),
			});
			if (answer === true)
				added.push({
					...offer,
					permittedAutomation:
						(await input.askAutomation?.(offer)) === true,
				});
			else if (answer === false) declined.push(offer.accountId);
		}
	};
	// What is ready is asked first: a person who stops after it has
	// still answered what mattered, before the findings that need them.
	await askEach(sorted.offers);
	const answers: Record<string, IAccountClassification> = {};
	const learned: IProviderAccount[] = [];
	const unclassified: IAccountFinding[] = [];
	const classifying =
		sorted.unclassified.length > 0 &&
		input.classify !== undefined &&
		(input.beforeClassifying === undefined ||
			(await input.beforeClassifying(sorted.unclassified.length)));
	for (const [index, finding] of sorted.unclassified.entries()) {
		const answer = classifying
			? await input.classify?.(finding, {
					index: index + 1,
					total: sorted.unclassified.length,
					finding,
				})
			: undefined;
		if (answer === undefined) {
			unclassified.push(finding);
			continue;
		}
		answers[finding.key] = answer;
		const offer = offerFor(finding, answer);
		if (!alreadyKnown(offer, known)) learned.push(offer);
	}
	await learnAccounts(learnedPath, answers);
	await askEach(learned);
	const offered = [...sorted.offers, ...learned];
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
