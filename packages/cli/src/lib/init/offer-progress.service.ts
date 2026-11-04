/**
 * offer-progress.service.ts — what the offer of accounts shows while it
 * waits for the machine's clients to answer.
 *
 * A step printed once said nothing about a step that took seconds: a
 * person could not tell a slow client from a hung command. At a terminal
 * one live line names the clients still being asked and counts the
 * seconds; each client that answers gets a line of its own.
 */
import type { IClientProgress, IOfferStep } from '@delendai/core/contracts';

import { OFFER_MESSAGES } from '../../contracts/constants/offer-messages.constant';
import type { IOfferProgressStream } from '../../contracts/interfaces/init-offer.interface';
import type { IOfferMessages } from '../../contracts/interfaces/offer-messages.interface';
import { c } from '../helpers/cli-color.helper';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TICK_MS = 120;
const MS_PER_SECOND = 1000;
const CLEAR_LINE = '\r\x1b[2K';

const seconds = (ms: number): string => `${(ms / MS_PER_SECOND).toFixed(1)} s`;

/** The progress of one offer, written to `stream`. */
export const offerProgress = (
	stream: IOfferProgressStream,
	messages: IOfferMessages = OFFER_MESSAGES.en,
) => {
	const started = Date.now();
	const pending = new Map<string, string>();
	let frame = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	const live = stream.isTTY === true;
	const render = (): void => {
		if (!live || pending.size === 0) return;
		frame = (frame + 1) % FRAMES.length;
		stream.write(
			`${CLEAR_LINE}    ${c.cyan(FRAMES[frame] ?? '')} ${c.gray(messages.asking([...pending.values()].join(', '), seconds(Date.now() - started)))}`,
		);
	};
	const line = (text: string): void => {
		stream.write(`${live ? CLEAR_LINE : ''}${text}\n`);
		render();
	};
	if (live) {
		timer = setInterval(render, TICK_MS);
		timer.unref?.();
	}
	return {
		step: (step: IOfferStep): void =>
			line(`  ${c.cyan('›')} ${messages.steps[step]}`),
		client: (progress: IClientProgress): void => {
			if (progress.phase === 'asking') {
				pending.set(progress.command, progress.command);
				render();
				return;
			}
			pending.delete(progress.command);
			if (progress.verdict === 'not-installed') {
				render();
				return;
			}
			line(
				`    ${progress.verdict === 'usable' ? c.green('✓') : c.yellow('·')} ${progress.label}: ${messages.verdicts[progress.verdict ?? 'unknown']} ${c.gray(seconds(progress.ms ?? 0))}`,
			);
		},
		/** Clears the live line; the questions come next. */
		stop: (): void => {
			if (timer !== undefined) clearInterval(timer);
			timer = undefined;
			pending.clear();
			if (live) stream.write(CLEAR_LINE);
		},
	};
};
