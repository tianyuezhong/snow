import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
// docs/ is generated website output for GitHub Pages, not hand-written documentation.
await rm('docs', { recursive: true, force: true });
await mkdir('docs', { recursive: true });
await cp('dist', 'docs', { recursive: true });
await writeFile('docs/.nojekyll', '');
console.log('GitHub Pages 文件已生成到 docs/。在仓库 Settings → Pages 选择 Deploy from a branch / main /docs。');
