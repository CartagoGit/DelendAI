/**
 * Internal barrel for the Work Event Bus observers. Like the events
 * barrel, it is not exported from the package root yet.
 */
export {
	GitObserver,
	hashGitObservation,
	parsePorcelainPaths,
} from './git-observer';

export { GIT_OBSERVER_TIMEOUT_MS } from './contracts/constants/git-observer.constant';

export type {
	IGitEventSink,
	IGitObservation,
	IGitObserverOptions,
	IGitTrigger,
} from './contracts/interfaces/git-observer.interface';
