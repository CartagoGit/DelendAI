/**
 * commit-maker-notes.constant.ts — where the maker of each unit commit is
 * recorded.
 *
 * One notes ref per agent: each agent writes only its own, so agents never
 * race on a shared ref; two instances of one agent merge theirs on push.
 * The forge shows no notes, so the record stays off the surface f00500
 * keeps free of AI names.
 */
export const MAKER_NOTES_PREFIX = 'refs/notes/delendai/';

/** Where the forge's notes are fetched to, so a fetch never drops a local note. */
export const MAKER_NOTES_REMOTE_PREFIX = 'refs/notes/delendai-remote/';
