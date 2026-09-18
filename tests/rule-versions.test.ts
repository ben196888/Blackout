import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultRuleVersion, RULE_STATUSES, RULE_VERSIONS, type RuleVersion } from '../src/rules/versions';

describe('rulebook release lifecycle', () => {
  const baseline: RuleVersion = { version: '0.0.1', status: 'release' };

  it.each(RULE_STATUSES)('selects the default when the next version is %s', (status) => {
    const next: RuleVersion = { version: '0.0.2', status };
    expect(defaultRuleVersion([next, baseline]).version)
      .toBe(status === 'release-candidate' || status === 'release' ? '0.0.2' : '0.0.1');
  });

  it('keeps a release candidate as default through later drafts and releases', () => {
    const versions: RuleVersion[] = [baseline, { version: '0.0.2', status: 'release-candidate' },
      { version: '0.0.3', status: 'beta' }];
    expect(defaultRuleVersion(versions).version).toBe('0.0.2');
    versions[1]!.status = 'release';
    expect(defaultRuleVersion(versions).version).toBe('0.0.2');
    versions[2]!.status = 'release-candidate';
    expect(defaultRuleVersion(versions).version).toBe('0.0.3');
  });

  it('orders version numbers numerically across patches, minors and majors', () => {
    const versions: RuleVersion[] = ['0.0.9', '0.0.10', '0.2.0', '0.10.0', '1.0.0']
      .map((version) => ({ version, status: 'release' }));
    while (versions.length) {
      expect(defaultRuleVersion([...versions].reverse()).version).toBe(versions.at(-1)!.version);
      versions.pop();
    }
  });

  it('does not silently make an unreleased draft the default', () => {
    expect(() => defaultRuleVersion([{ version: '0.0.2', status: 'draft' }])).toThrow();
  });

  it('registers unique rulebooks that exist, with v0.0.1 default today', () => {
    expect(new Set(RULE_VERSIONS.map(({ version }) => version)).size).toBe(RULE_VERSIONS.length);
    for (const { version } of RULE_VERSIONS) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(readFileSync(`docs/rules/v${version}.md`, 'utf8')).toContain(`# BLACKOUT rules v${version}`);
    }
    expect(defaultRuleVersion().version).toBe('0.0.1');
  });
});
