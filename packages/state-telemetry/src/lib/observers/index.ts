/**
 * Internal barrel for the Work Event Bus observers. Like the events
 * barrel, it is not exported from the package root yet.
 */
export {
	GitObserver,
	GIT_OBSERVER_TIMEOUT_MS,
	hashGitObservation,
	parsePorcelainPaths,
	type IGitEventSink,
	type IGitObservation,
	type IGitObserverOptions,
	type TGitTrigger,
} from './git-observer';
