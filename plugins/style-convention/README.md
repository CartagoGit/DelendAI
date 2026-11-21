# @delendai/style-convention

Before a stylesheet is edited: which selectors this file may define, which
surfaces consume the one about to change, and whether the value about to
be hard-coded already has a design token.

```bash
delendai --plugins=style-convention
```

"Design tokens" here always means CSS custom properties and SCSS
variables — never LLM token budgets.

## Configuration

A project that declares no `styleRoots` gets **no tool and no
diagnostic**. Nothing about a project's styles is assumed.

```jsonc
// delendai.config.json
{
	"plugins": {
		"style-convention": {
			"options": {
				"styleRoots": ["src/styles"],
				"markupRoots": ["src"],
				"architecture": "scss-bem", // or css-modules, tailwind, legacy-global
				"overrides": [
					// a folder with another architecture; the last match wins
					{ "glob": "src/legacy/**", "architecture": "legacy-global" }
				],
				"layers": [
					// who may define which selectors
					{ "name": "shared", "glob": "src/shared/**", "prefixes": ["ui-"] },
					{ "name": "pages", "glob": "src/pages/**", "prefixes": ["page-"] }
				],
				"tokenFiles": ["src/styles/_tokens.scss"],
				"sharedPrefixes": ["ui-"], // classes another gate owns
				"sharedAuthority": "our shared-component lint"
			}
		}
	}
}
```

## Tools

All three are read-only.

| Tool | What it answers |
| --- | --- |
| `style_profile` | The architecture declared, the folders with another one, the layers and their prefixes; for one `path`, what applies there. |
| `style_impact` | For a selector, or every selector a file defines: where it is defined, each surface that uses it, and which are in another package. |
| `style_check` | For a stylesheet on disk or as it would be saved: every rule of the project it breaks, with the reason and what to do instead. |

## What `style_check` refuses

| Finding | Meaning |
| --- | --- |
| `foreign-selector` | The selector's prefix belongs to another layer. |
| `forked-selector` | The selector already has a definition in another file. |
| `literal-has-token` | The value is one an existing design token names; the finding names the token. |
| `unsupported-directive` | Under `tailwind`: a directive the installed major does not accept. |
| `shared-owned` | The class belongs to a gate you named in `sharedAuthority`; this check names that gate instead of deciding. |

A folder declared `legacy-global` gets no finding: that is its
architecture, not drift to repair.

## What it is not

- **Not a second integrity checker.** Whether a used class is defined
  anywhere stays with the project's own lint; this plugin shares its
  parser so the two cannot disagree about what a stylesheet defines.
- **Not a migration tool**, and not a visual regression suite: whether the
  pixels changed is a different question from whether the consumers did.
