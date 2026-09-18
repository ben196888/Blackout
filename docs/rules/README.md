# BLACKOUT rule versions

These are game-rule versions. They do not create a deployment, package release or Git tag.

| Version | Status | Players | Rulebook |
| --- | --- | --- | --- |
| **v0.0.1** | **Current implemented rules** | Exactly 4 | [Current rulebook](v0.0.1.md), [map data](maps-v0.0.1.json) |

v0.0.1 records the current source baseline at `cf087fd8e9dedd3c223e1f85d31ea41fef41cc36`. It extracts the rules page and resolves its shorthand against the engine. The proposed v0.0.2 rules are reviewed separately from the current-version documentation. Documentation versioning does not activate proposed mechanics.

## Change policy

- Keep each released rule version as a stable historical reference. Correct transcription errors transparently; do not rewrite a released version to introduce new gameplay.
- Keep proposed rules in their own version and label them Draft until implemented and verified.
- Review rule changes and their map data together in Git. Gameplay changes must update the target rulebook and the in-game explanation in the same implementation work.
- Update this index's current version only when the corresponding rules are released. The current rules page continues to represent v0.0.1 until then.
- Keep rationale, alternatives, open questions, implementation checklists and validation discussion in GitHub issues, not an RFC directory under `docs/`.

## Design and implementation issues

- [#19 — v0.0.2: design and implement 4–20-player map scales](https://github.com/ben196888/Blackout/issues/19): full former RFC, exact graph prototypes, reproducible audit script, audit results and legacy resource analysis are preserved in the issue, with a SHA-256 migration manifest.
- [#20 — Align the rules page with the v0.0.1 engine behavior](https://github.com/ben196888/Blackout/issues/20): exposure, radio pricing, starvation, broadcaster and method-selection wording corrections.

`maps-v0.0.1.json` preserves all 16 engine nodes, their initial caches and facilities, weighted roads (including the zero-cost bridge), starting locations, road closures and the Night 4 draw. Its consistency with the current v0.0.1 engine is checked in `tests/map.test.ts`. When a later engine version replaces these rules, retain this snapshot and migrate that comparison to the new version.

The archived v0.0.2 audit tooling in #19 is design evidence, not production code. To reproduce it, save the issue’s `audit.py` and `maps.json` blocks together and run the script.
