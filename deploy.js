import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

try {
  console.log('Building project with Vite...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('Reading sw.js...');
  const swSource = fs.readFileSync('sw.js', 'utf8');

  // Read the built assets
  const assetsDir = 'docs/assets';
  if (!fs.existsSync(assetsDir)) {
    throw new Error('Build directory docs/assets does not exist!');
  }

  const assetFiles = fs.readdirSync(assetsDir).map(file => `./assets/${file}`);

  // Construct the new ASSETS_TO_CACHE array
  const newAssetsToCache = [
    './',
    './index.html',
    './login.html',
    './manifest.json',
    './favicon.png',
    './favicon.svg',
    './icon.svg',
    './icons.svg',
    ...assetFiles
  ];

  // Replace the ASSETS_TO_CACHE in sw.js
  const regex = /const ASSETS_TO_CACHE = \[\s*[\s\S]*?\s*\];/;
  const replacement = `const ASSETS_TO_CACHE = ${JSON.stringify(newAssetsToCache, null, 2)};`;
  const updatedSw = swSource.replace(regex, replacement);

  fs.writeFileSync('docs/sw.js', updatedSw);
  console.log('✅ sw.js successfully compiled into docs/sw.js with correct assets cache.');

  console.log('Copying manifest.json to docs/...');
  fs.copyFileSync('manifest.json', 'docs/manifest.json');

  console.log('Copying PWA icons and favicons to docs/...');
  const filesToCopy = ['favicon.png', 'favicon.svg', 'icon.svg', 'icons.svg', 'OneSignalSDKWorker.js'];
  filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join('docs', file));
    }
  });

  console.log('Rewriting manifest link references in built HTML files to point to root manifest.json...');
  ['docs/index.html', 'docs/login.html'].forEach(htmlFile => {
    if (fs.existsSync(htmlFile)) {
      let content = fs.readFileSync(htmlFile, 'utf8');
      content = content.replace(/href="\.\/assets\/manifest-[a-zA-Z0-9_-]+\.json"/g, 'href="./manifest.json"');
      fs.writeFileSync(htmlFile, content);
    }
  });

  console.log('Initializing Git inside docs/...');
  execSync('git -C docs init', { stdio: 'ignore' });
  try {
    execSync('git -C docs remote add origin https://github.com/mnrdevelopers/chatify.git', { stdio: 'ignore' });
  } catch (_) {}

  console.log('Staging files inside docs/...');
  execSync('git -C docs add .', { stdio: 'inherit' });

  console.log('Committing changes inside docs/...');
  try {
    execSync('git -C docs commit -m "deploy: release PWA built files directly in root"', { stdio: 'ignore' });
  } catch (_) {}

  console.log('🚀 Force pushing build content to GitHub origin gh-pages...');
  execSync('git -C docs push --force origin master:gh-pages', { stdio: 'inherit' });
  console.log('✅ Successfully deployed to GitHub!');

} catch (err) {
  console.error('❌ Deployment build failed:', err);
  process.exit(1);
}
