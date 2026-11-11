/**
 * Legend line prepended once (only when something was rewritten) so a
 * receiving agent knows how to read `[kind:name U+XXXX]` tokens (x00207).
 */
export const UNICODE_TOKEN_LEGEND =
	'[unicode-tokens] Tokens of the form [kind:name U+XXXX] stand for the named character; treat each token as the meaning of that character, not as decoration.';
