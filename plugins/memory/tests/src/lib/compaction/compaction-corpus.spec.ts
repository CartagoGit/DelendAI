/**
 * compaction-corpus.spec.ts — automatic compaction must keep every
 * constraint a user declared, measured over a corpus of conversations
 * rather than one sentence at a time.
 *
 * The constraints are phrased the way people actually give them, in the
 * two languages this project is conducted in: modal verbs, but also bare
 * negative imperatives ("No abras…", "Do not raise…"), "deja de", "avoid"
 * and "no quiero que". A detector that only knows "must" and "never"
 * reads most real boundaries as chatter, and a binding compaction would
 * then drop them without a trace.
 */

import { describe, expect, it } from 'vitest';

import { judgeCompactedSummary } from '../../../../src/lib/compaction/auto-compaction-policy.helper';
import {
	extractLoadBearing,
	verifySummaryPreserves,
} from '../../../../src/lib/compaction/preserve-rules.helper';

interface ICorpusConversation {
	readonly name: string;
	/** Chatter that carries no boundary, interleaved with the constraints. */
	readonly chatter: readonly string[];
	/** Every boundary the user declared, one per line. */
	readonly constraints: readonly string[];
}

const CORPUS: readonly ICorpusConversation[] = [
	{
		name: 'autonomous swarm session (es)',
		chatter: [
			'Alcancé el límite de uso, ya se ha restablecido.',
			'Revisa el estado de CI cuando termine la ronda.',
		],
		constraints: [
			'NO QUIERO QUE PARES DE TRABAJAR',
			'Nunca leas, imprimas ni registres el token.',
			'No abras el fichero del token salvo a través del wrapper.',
			'No copies la credencial a la configuración del proyecto.',
			'No borres ramas sin evidencia.',
			'Deja de usar el pooler de conexiones en los tests.',
			'Evita cualquier reset global del repositorio.',
		],
	},
	{
		name: 'release hygiene (en)',
		chatter: [
			'The queue looked healthy this morning.',
			'Thanks, that summary was useful.',
		],
		constraints: [
			'Never change origin to a token URL.',
			'Do not raise budgets or baselines to silence gates.',
			"Don't mark NOT_EXECUTABLE as PASS.",
			'No test retries to paper over races.',
			'Commits must not carry a co-author line naming a model.',
			'Branch-protection writes only go through the bootstrap wrapper.',
			'Do not attempt automatic credential revocation.',
			'Avoid deleting worktrees that still hold uncommitted work.',
			'Stop pushing directly to the integration branch.',
		],
	},
];

const sourceOf = (conversation: ICorpusConversation): string =>
	[
		conversation.chatter[0],
		...conversation.constraints,
		conversation.chatter[1],
	].join('\n');

describe('compaction corpus: declared user constraints', () => {
	const declared = CORPUS.flatMap((c) => c.constraints);

	it('recognises every declared constraint in the corpus', () => {
		const missed = CORPUS.flatMap((conversation) => {
			const found = new Set(
				extractLoadBearing(sourceOf(conversation))
					.filter((f) => f.category === 'user-constraint')
					.map((f) => f.text),
			);
			return conversation.constraints.filter((line) => !found.has(line));
		});
		expect(missed).toEqual([]);
		expect(declared.length).toBeGreaterThanOrEqual(16);
	});

	it('does not mark the chatter around them as constraints', () => {
		const chatter = CORPUS.flatMap((c) => c.chatter);
		const flagged = chatter.filter((line) =>
			extractLoadBearing(line).some(
				(f) => f.category === 'user-constraint',
			),
		);
		expect(flagged).toEqual([]);
	});

	it('accepts a binding compaction that carries every constraint', () => {
		for (const conversation of CORPUS) {
			const verdict = verifySummaryPreserves({
				source: sourceOf(conversation),
				summary: [
					'Summary of the session.',
					...conversation.constraints,
				].join('\n'),
			});
			expect(
				judgeCompactedSummary({ binding: true, verdict }),
			).toMatchObject({ accept: true, wouldLose: 0 });
		}
	});

	it('refuses a binding compaction that drops any single constraint', () => {
		const accepted: string[] = [];
		for (const conversation of CORPUS) {
			for (const dropped of conversation.constraints) {
				const verdict = verifySummaryPreserves({
					source: sourceOf(conversation),
					summary: [
						'Summary of the session.',
						...conversation.constraints.filter(
							(c) => c !== dropped,
						),
					].join('\n'),
				});
				if (judgeCompactedSummary({ binding: true, verdict }).accept) {
					accepted.push(dropped);
				}
			}
		}
		// 100% preservation over the corpus: no summary that loses a
		// declared constraint may replace the conversation.
		expect(accepted).toEqual([]);
	});
});
