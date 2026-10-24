# @delendai/roadmap

A versioned roadmap: what each target version promises, what of that is
delivered, whether the version can be promoted, and the release bump its
promises imply.

```bash
delendai --plugins=roadmap
```

## What is the authority, and what is derived

| Layer | Where | Rule |
| --- | --- | --- |
| **Authority** | the roadmap file, tracked in git | Edited by hand or by `roadmap_plan_init` / `roadmap_plan_close`, reviewed in a pull request. The only place intent is decided. |
| **Timeline** | a file beside it (or SQLite, with `@delendai/roadmap-sqlite`) | Append-only: when an entry was added, who changed it, why. Derived — `roadmap_sync` shows what it has not recorded. |
| **Projection** | whatever shows the roadmap (a page, an editor view, JSON) | Regenerated from the authority file. When they differ, regenerate; never edit the projection. |

A `.db` cannot be reviewed in a pull request, and a diff cannot tell when
an entry was added or why. Each layer does the one thing it can.

## Configuration

Everything is optional, and nothing is assumed. A project that declares
no `file` gets **no tool and no diagnostic**.

```jsonc
// delendai.config.json
{
	"plugins": {
		"roadmap": {
			"options": {
				"file": "ROADMAP.md", // the authority file, relative to the workspace
				"timeline": "ROADMAP.timeline.md", // default: beside the file
				"versionFile": "package.json", // a JSON file whose "version" says what is published
				"promotion": {
					"blockingGates": ["proposal-done", "path-exists"], // default: every gate kind
					"deferralPolicy": "block", // or "report": open entries are listed, not blocking
					"schedule": "0 6 * * 1" // a cron expression, or "on-ready"
				}
			}
		}
	}
}
```

**No branch is hard-coded.** The branches a promotion runs between are
the project's own — `development.branches` in its configuration — whether
they are called `develop` and `main`, `trunk` and `release/2.x`, or are
one and the same (in which case there is nothing to promote and the
plugin says so).

## Tools

| Tool | Writes | What it answers |
| --- | --- | --- |
| `roadmap_show` | no | The roadmap as a compact listing; one entry whole on request. |
| `roadmap_sync` | no | Whether the timeline tells the same story as the file. |
| `roadmap_readiness` | no | `ready`, `not-ready` or `unknown` per version, with what holds it back. |
| `roadmap_delta` | no | Declared, delivered, published — the bump implied, who decides the real one, and the next action. |
| `roadmap_promotion` | no | Whether the conditions for a promotion are met. It never merges, pushes or tags. |
| `roadmap_plan_init` | roadmap + timeline files | Opens a target version with what it promises. |
| `roadmap_plan_close` | roadmap + timeline files | Closes an entry as delivered, deferred, dropped or superseded — on passing gates or a stated reason, never on silence. |

## What it does not do

- **It does not decide the version.** The bump it reports is what the
  promised entries imply; the release tooling stays the authority, and a
  difference between the two is reported as data.
- **It does not bump, publish, tag or merge.** The manifest carries no
  `git-write` permission.
- **A missing answer is `unknown`, not a failure.** A gate nobody can look
  up does not fail an entry, and an estimate never takes part in
  readiness: a date nobody can audit is a hope, not a deadline.
