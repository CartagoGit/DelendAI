/** Everything the timeline can record. Each is one fact, never a rewrite. */
export const TIMELINE_EVENT_KINDS = [
	'horizon-added',
	'horizon-hint-set',
	'horizon-removed',
	'entry-added',
	'entry-edited',
	'entry-state-changed',
	'entry-removed',
] as const;

/** First line of a markdown timeline; readers skip every non-event line. */
export const MARKDOWN_TIMELINE_HEADER =
	'# Roadmap timeline\n\nOne event per line, appended and never edited.\n\n';

/** Marks a line of a markdown timeline as an event. */
export const MARKDOWN_TIMELINE_LINE_PREFIX = '- ';

/** The first sequence number a timeline hands out. */
export const TIMELINE_FIRST_SEQ = 1;
