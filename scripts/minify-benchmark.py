"""Optional packaging helper. The application itself needs no build step.
Install development-only tools with: python3 -m pip install rjsmin rcssmin
"""
import re
from pathlib import Path
import rjsmin
import rcssmin
root = Path(__file__).resolve().parent.parent
source = (root / 'index.html').read_text()
result = re.sub(r'<style>(.*?)</style>', lambda m: '<style>' + rcssmin.cssmin(m[1]) + '</style>', source, flags=re.S)
result = re.sub(r'<script type="module">(.*?)</script>', lambda m: '<script type="module">' + rjsmin.jsmin(m[1]) + '</script>', result, flags=re.S)
result = re.sub(r'>\s+<', '><', result).strip()
(root / 'index.min.html').write_text(result)
print(f'Original: {len(source.encode())} bytes; minified: {len(result.encode())} bytes')
