import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * オフライン版（2026-11-13）：index.html をダブルクリックして file:// で開いても遊べるように、
 * JS と CSS を index.html の中に埋め込む（ブラウザは file:// から別ファイルの module スクリプトを読めないため）。
 * 画像は相対パス（base './'）でそのまま読む。セーブは今までどおりブラウザの localStorage。
 */
function inlineIntoHtml(): Plugin {
  return {
    name: 'inline-into-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName === 'index.html');
      if (!html || html.type !== 'asset') return;
      let text = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          text = text.replace(new RegExp(`<script[^>]*src="[^"]*${escape(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          text = text.replace(new RegExp(`<link[^>]*href="[^"]*${escape(name)}"[^>]*>`), () => `<style>${String(file.source)}</style>`);
          delete bundle[name];
        }
      }
      text = text.replace(/<link rel="modulepreload"[^>]*>/g, '');
      html.source = text;
    },
  };
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ゲーム本体はAPIキーを一切参照しない。GEMINI_* はスクリプト専用で、
// Vite の envPrefix（VITE_）に含めないことでブラウザ側へ露出させない。
export default defineConfig({
  plugins: [react(), inlineIntoHtml()],
  base: './',
  envPrefix: 'VITE_',
  define: { __PORTRAIT_MANIFEST__: fs.readFileSync('public/portraits/manifest.json', 'utf8') },
  build: { rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
} as never);
