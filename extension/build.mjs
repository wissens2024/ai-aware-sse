import * as esbuild from 'esbuild';
import { mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

// --mode=production / --mode=development (default: development)
const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'development';
const isProd = mode === 'production';

const envDefaults = {
  development: {
    API_BASE: 'http://localhost:8080/api/v1',
    DEVICE_TOKEN: 'devtoken-123',
  },
  production: {
    API_BASE: 'https://sse.aines.kr/api/v1',
    DEVICE_TOKEN: '',
  },
};

const env = envDefaults[isProd ? 'production' : 'development'];
console.log(`Building extension in ${mode} mode (API_BASE=${env.API_BASE})`);

const opts = {
  bundle: true,
  format: 'iife',
  target: 'es2020',
  sourcemap: !isProd,
  logLevel: 'info',
  define: {
    '__EXT_ENV__.MODE': JSON.stringify(mode),
    '__EXT_ENV__.API_BASE': JSON.stringify(env.API_BASE),
    '__EXT_ENV__.DEVICE_TOKEN': JSON.stringify(env.DEVICE_TOKEN),
  },
  minify: isProd,
};

const builds = [
  { entryPoints: [join(__dirname, 'src/content.ts')], outfile: join(distDir, 'content.js') },
  { entryPoints: [join(__dirname, 'src/background.ts')], outfile: join(distDir, 'background.js') },
  { entryPoints: [join(__dirname, 'src/options.ts')], outfile: join(distDir, 'options.js') },
];

for (const config of builds) {
  await esbuild.build({ ...config, ...opts });
}

// dist/ 단독 로드용: manifest.json (경로를 dist 기준으로), options.html, icons
const manifestSrc = readFileSync(join(__dirname, 'manifest.json'), 'utf-8');
const manifestDist = manifestSrc
  .replace(/"dist\/content\.js"/g, '"content.js"')
  .replace(/"dist\/background\.js"/g, '"background.js"');
writeFileSync(join(distDir, 'manifest.json'), manifestDist);

const optionsHtml = readFileSync(join(__dirname, 'options.html'), 'utf-8').replace(
  'src="dist/options.js"',
  'src="options.js"',
);
writeFileSync(join(distDir, 'options.html'), optionsHtml);

// 아이콘 복사
const iconsDistDir = join(distDir, 'icons');
if (!existsSync(iconsDistDir)) mkdirSync(iconsDistDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const filename = `icon-${size}.png`;
  const src = join(__dirname, 'icons', filename);
  if (existsSync(src)) {
    copyFileSync(src, join(iconsDistDir, filename));
  } else {
    console.warn(`Warning: ${filename} not found — run "node generate-icons.mjs" first`);
  }
}

console.log(`Extension build done (${mode}): dist/`);
