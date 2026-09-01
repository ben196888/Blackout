# Four-human trial runbook

Use this checklist for every PACE POC trial. A trial counts only when four humans in four independent browser sessions reach a terminal outcome and its private Fly log dump is verified.

## 1. Prepare the room

- Use four independent browsers or browser profiles. Do not share a session.
- Do not use an external voice call, spectator view, debug surface or developer tools.
- Read the on-screen content note aloud: fictional disaster, food scarcity, starvation and death.
- Tell every participant: “In-app message text and authoritative delivery outcomes are recorded for POC analysis. Do not include personal or sensitive information.”

## 2. Prove production before admitting players

Deploys are manual: pushing to `main` only verifies. Dispatch **Verify and deploy** from GitHub Actions and wait for the entire run, including **Production four-player smoke**, to pass. Do not create the human match while that workflow is running.

```sh
gh workflow run release.yml --repo ben196888/Blackout --ref main
gh run list --repo ben196888/Blackout --workflow release.yml --limit 1
```

After the run is green, freeze deployments and Fly Machine restarts until the terminal outcome and log dump verification are complete. Match state is in memory; either operation aborts the trial.

## 3. Create the match and start the dump

Player 1 creates the match at <https://pace-poc.fly.dev>. Before sharing the invite, copy the match ID from `/play/<matchID>` and open a dedicated terminal:

```sh
mkdir -p trial-logs
PACE_MATCH_ID='replace-with-match-id'
PACE_TRIAL_STARTED="$(date -u +%Y%m%dT%H%M%SZ)"
PACE_DUMP="trial-logs/${PACE_TRIAL_STARTED}-${PACE_MATCH_ID}.fly.jsonl"
fly logs --app pace-poc --json > "$PACE_DUMP"
```

Leave that command running for the complete trial. `trial-logs/` is ignored by Git because dumps contain player-authored text and private authoritative delivery outcomes.

## 4. Run the trial

- Admit exactly four human players using the invite link.
- Use the public in-app planning discussion for Day 0 method negotiation.
- Let players negotiate and act without out-of-band gameplay communication.
- Observe without supplying hidden information or strategy.
- Ensure the match reaches a terminal loss or 1–3-star outcome.
- Do not collect or infer wall-clock phase-duration metrics.

Record qualitative evidence for these questions:

1. Did useful method-coverage negotiation happen during Day 0 planning?
2. Did both-parties-must-hold create meaningful isolation rather than arbitrary failure?
3. Did radio, the VILLAGE OFFICE board and person-to-person spread make the Day 4 rendezvous change legible but uncertain?
4. Were Battery costs meaningful without making radio or infrastructure methods obvious traps?
5. Did stale position, cache and body reports create useful coordination mistakes?
6. Did the survival and 1/2/3-star outcome motivate rescue and regrouping?

## 5. Stop and verify the dump

After every player sees the terminal outcome, stop `fly logs` with Ctrl-C. In the same shell, verify at least one structured event for this match:

```sh
jq -e --arg match "$PACE_MATCH_ID" '
  .message | fromjson? |
  select(.event == "pace.message.v1" and .match == $match)
' "$PACE_DUMP" >/dev/null
```

Review the complete message evidence without treating Fly timestamps as phase metrics:

```sh
jq -c --arg match "$PACE_MATCH_ID" '
  .message | fromjson? |
  select(.event == "pace.message.v1" and .match == $match) |
  {gameDay, sender, method, rawText, deliveredText, recipients, dropped, excluded, truncated}
' "$PACE_DUMP"
```

If verification returns non-zero, the dump is incomplete: do not mark the milestone finished. Keep the private local dump and use Fly's seven-day searchable retention only as a fallback. Never commit or attach the dump to a public issue.

## 6. Record and tune

Comment observations and the terminal outcome on issue #9. Keep player-authored text and exact delivery outcomes in the private dump; summarize patterns rather than quoting participants.

Balance changes, if supported by the trial evidence, may edit only `src/constants.ts`: starting/map supply, yields, capacities, payload caps, drop rates and communication prices. After each edit run:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

After pushing and deploying, require the production smoke to pass again before another human trial.
