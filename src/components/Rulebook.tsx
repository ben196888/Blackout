import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RULE_VERSIONS, rulesUrl } from '../rules/versions';

const documents = import.meta.glob<string>('../../docs/rules/v*.md', {
  query: '?raw', import: 'default', eager: true,
});
const assets = import.meta.glob<string>([
  '../../docs/rules/diagrams/**/*.svg', '../../docs/rules/maps-*.json',
], { query: '?url', import: 'default', eager: true });

function documentUrl(url: string): string {
  const [path, fragment] = url.split('#');
  const version = RULE_VERSIONS.find((entry) => path === `v${entry.version}.md`);
  if (version) return rulesUrl(version.version) + (fragment ? `#${fragment}` : '');
  if (path === 'README.md') return 'https://github.com/ben196888/Blackout/tree/main/docs/rules';
  return assets[`../../docs/rules/${path}`] ?? defaultUrlTransform(url);
}

export default function Rulebook({ version }: { version: string }) {
  const markdown = documents[`../../docs/rules/v${version}.md`];
  return (
    <article className="rulebook" aria-label={`v${version} rulebook`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={documentUrl}
        components={{
          table: ({ children }) => <div className="ref-table ref-scroll"><table>{children}</table></div>,
          img: ({ src, alt }) => <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={alt} /></a>,
        }}
      >
        {markdown?.replace(/^# .+\n+Status: .+\n+/u, '')}
      </Markdown>
    </article>
  );
}
