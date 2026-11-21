import type { IRemotePublicationWait } from '../interfaces/remote-publication-wait.interface';

/** How long a delivery waits for the hand-over's detached publication: two minutes. */
export const REMOTE_PUBLICATION_WAIT: IRemotePublicationWait = {
	attempts: 24,
	pauseMs: 5_000,
};
