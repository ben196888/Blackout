export const RULE_STATUSES = [
  'draft', 'work-in-progress', 'alpha', 'beta', 'release-candidate', 'release',
] as const;

export type RuleStatus = typeof RULE_STATUSES[number];
export const STATUS_LABELS: Record<RuleStatus, string> = {
  draft: 'Draft',
  'work-in-progress': 'Work in progress',
  alpha: 'Alpha',
  beta: 'Beta',
  'release-candidate': 'Release candidate',
  release: 'Release',
};

export interface RuleVersion {
  version: string;
  status: RuleStatus;
}

/** Promote a rulebook here; viewing a version never changes the game engine. */
export const RULE_VERSIONS: readonly RuleVersion[] = [
  { version: '0.0.1', status: 'release' },
  { version: '0.0.2', status: 'draft' },
];
export const GAME_RULE_VERSION = '0.0.1';

export function compareVersions(a: RuleVersion, b: RuleVersion): number {
  const left = a.version.split('.').map(Number);
  const right = b.version.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference) return difference;
  }
  return 0;
}

export function defaultRuleVersion(versions: readonly RuleVersion[] = RULE_VERSIONS): RuleVersion {
  const eligible = versions.filter(({ status }) => status === 'release-candidate' || status === 'release');
  const latest = eligible.sort(compareVersions).at(-1);
  if (!latest) throw new Error('At least one release candidate or released rulebook is required.');
  return latest;
}

export function rulesUrl(version: string): string {
  return `/rules?version=v${version}`;
}
