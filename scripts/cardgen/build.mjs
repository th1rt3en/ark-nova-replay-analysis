// Bundles harness/entry.tsx (the card components of the fan site "Next-Ark-Nova-Cards" + our Marine Worlds additions) into harness/out.cjs (renders HTML strings).
import esbuild from 'esbuild';
import path from 'path';
await esbuild.build({
  entryPoints: ['harness/entry.tsx'], bundle: true, platform: 'node', format: 'cjs', outfile: 'harness/out.cjs',
  alias: { '@': path.resolve('src'), 'next/image': path.resolve('shim/image.tsx'), 'next-i18next': path.resolve('shim/i18n.ts'), 'next/link': path.resolve('shim/image.tsx') },
  loader: { '.json': 'json' }, jsx: 'automatic', logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"' },
});
