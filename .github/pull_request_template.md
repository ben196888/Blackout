## What

<!-- What changed and why. Link the issue if there is one. -->

## Verification

All four gates must pass locally before review.

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm smoke`

## Checklist

- [ ] Commits follow Conventional Commits
- [ ] Balance changes, if any, touch only the `BALANCE` object in `src/constants.ts` and cite trial evidence
- [ ] Changes to player view or identity validation add a test that fails without the fix
- [ ] No trial log dumps, player-authored text, or private delivery outcomes included
