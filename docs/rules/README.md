# BLACKOUT rule versions

These are game-rule versions. They do not create a deployment, package release or Git tag.

| Version | Status | Players | Rulebook |
| --- | --- | --- | --- |
| **v0.0.1** | **Release — current game** | Exactly 4 | [Current rulebook](v0.0.1.md), [map data](maps-v0.0.1.json) |
| **v0.0.2** | **Draft — not active** | 4–20: Village 4–8, Town 9–13, Valley 14–20 | [Proposed rulebook](v0.0.2.md), [map data](maps-v0.0.2.json) |

v0.0.1 records the current source baseline at `cf087fd8e9dedd3c223e1f85d31ea41fef41cc36`. It extracts the rules page and resolves its shorthand against the engine. The proposed v0.0.2 rules are reviewed separately from the current-version documentation. Documentation versioning does not activate proposed mechanics.

## Change policy

- Keep each released rule version as a stable historical reference. Correct transcription errors transparently; do not rewrite a released version to introduce new gameplay.
- Each version progresses through **Draft → Work in progress → Alpha → Beta → Release candidate → Release**. Keep incomplete proposals clearly labeled; promotion requires the corresponding implementation and validation.
- Review rule changes and their map data together in Git. Gameplay changes must update the target rulebook and the in-game explanation in the same implementation work.
- The rules page lets readers select any version. Its default is the **highest numbered version at Release candidate or Release**, independent of registry order. A newer Draft, Work in progress, Alpha or Beta does not change the default. Thus v0.0.1 is default now; v0.0.2 becomes default at Release candidate and stays default through Release until a newer version reaches Release candidate.
- Maintain version statuses in [`src/rules/versions.ts`](../../src/rules/versions.ts), and update the rulebook status and this index in the same change when promoting a version. Add each new rulebook as `docs/rules/vX.Y.Z.md` and register its version/status.
- Selecting a rulebook does not change the active engine. Track the implemented game version separately from the documentation default. Version links use `/rules?version=vX.Y.Z` and remain selectable after a newer default is introduced.
- Keep rationale, alternatives, open questions, implementation checklists and validation discussion in GitHub issues, not an RFC directory under `docs/`.

## Design and implementation issues

- [#19 — v0.0.2: design and implement 4–20-player map scales](https://github.com/ben196888/Blackout/issues/19): full former RFC, exact graph prototypes, reproducible audit script, audit results and legacy resource analysis are preserved in the issue, with a SHA-256 migration manifest.
- [#20 — Align the rules page with the v0.0.1 engine behavior](https://github.com/ben196888/Blackout/issues/20): exposure, radio pricing, starvation, broadcaster and method-selection wording corrections.

`maps-v0.0.1.json` preserves all 16 engine nodes, their initial caches and facilities, weighted roads (including the zero-cost bridge), starting locations, road closures and the Night 4 draw. Its consistency with the current v0.0.1 engine is checked in `tests/map.test.ts`. When a later engine version replaces these rules, retain this snapshot and migrate that comparison to the new version.

The archived v0.0.2 audit tooling in #19 is design evidence, not production code. To reproduce it, save the issue’s `audit.py` and `maps.json` blocks together and run the script.

## Map layout tooling

Run `pnpm maps:layout` to regenerate the three v0.0.2 diagrams and their `layout-report.json`. Run `pnpm maps:check` to verify reproducible output. The script reads connections from `maps-v0.0.2.json`; labels, neighborhood centers and deterministic search settings live in `scripts/map-layout.config.json`.

The optimizer rearranges locations within their neighborhood boundaries. It first avoids location boxes overlapping or roads passing through unrelated locations, then prioritizes crossings between two roads that both connect different neighborhoods. Crossings involving a local road are the secondary priority. A local improvement cannot outweigh one crossing between neighborhood roads. The fixed-seed search is bounded, so remaining crossings are reported rather than claimed to be globally minimal.

The SVG uses the same straight road segments that the audit measures. The report records every remaining crossing and all location coordinates; tests also protect the reported Village and Town road pairs from crossing again. No game connections are changed by layout generation.
