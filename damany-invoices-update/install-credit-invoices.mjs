// Included at the top of damany-invoices-update.zip. Run from the app folder.
import {existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync, unlinkSync} from 'node:fs';
import {dirname, join, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const bundle = dirname(fileURLToPath(import.meta.url));
const root = realpathSync(process.cwd());
const dryRun = process.argv.includes('--check');
const marker = '// Damany credit invoices integration';
const fail = message => {throw new Error(message);};
function safePath(name) {
  if (name.split(/[\\/]/).includes('..') || name.startsWith('/') || name.includes(':')) fail('Invalid update path.');
  const target = resolve(root, name);
  if (!target.startsWith(root + sep)) fail('The update path must be inside your project.');
  let current = target;
  while (current !== root) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) fail(`Please use a normal project folder; ${relative(root, current)} is a link.`);
    current = dirname(current);
  }
  return target;
}
function replaceOnce(text, pattern, replacement, description) {
  const matches = [...text.matchAll(new RegExp(pattern.source, 'g'))];
  if (matches.length !== 1) fail(`Could not identify ${description} safely. No files were changed. Ask for help adapting the update to your current src/App.tsx.`);
  return text.replace(pattern, replacement);
}
try {
  if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'src/App.tsx')) || !existsSync(join(root, 'src/lib/types.ts'))) fail('Open a terminal in your website folder, the folder containing package.json, then run this command again.');
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!packageJson.dependencies?.['@supabase/supabase-js'] || !packageJson.dependencies?.['@tanstack/react-query']) fail('This update is for the existing Damany/Solara React app. The required project could not be identified.');
  const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
  const edits = [];
  const appPath = safePath('src/App.tsx'), typePath = safePath('src/lib/types.ts');
  const originalApp = readFileSync(appPath, 'utf8'), originalTypes = readFileSync(typePath, 'utf8');
  let app = originalApp, types = originalTypes;
  if (!app.includes(marker)) {
    if (/from\s*['"]\.\/pages\/Invoices['"]/.test(app) || /id\s*:\s*['"]invoices['"]/.test(app)) fail('This app already has an invoices integration. No files were changed.');
    if (!app.includes('session.user.id') || !app.includes('AuthGate')) fail('This update needs the version with the application login page. No files were changed.');
    app = `${marker}\nimport {Invoices} from './pages/Invoices';\nimport {ReceiptText as CreditInvoiceNavIcon} from 'lucide-react';\n` + app;
    app = replaceOnce(app, /\{\s*id\s*:\s*['"]clients['"][^{}]*\}/, value => `${value},{id:'invoices',label:'Credit invoices',Icon:CreditInvoiceNavIcon}`, 'the customer navigation item');
    app = replaceOnce(app, /view\s*===\s*['"]inventory['"]\s*\?\s*<Inventory\s+\{\.\.\.props\}\s*\/>/, value => `view==='invoices'?<Invoices key={mode} {...props} mode={mode} userId={session.user.id}/>:${value}`, 'the page navigation');
  } else if (!app.includes('CreditInvoiceNavIcon') || !/view\s*===\s*['"]invoices['"]/.test(app)) fail('The existing invoice integration is incomplete. No files were changed.');
  const viewTypes = /export\s+type\s+View\s*=[^;]+;/;
  const viewMatch = types.match(viewTypes);
  if (!viewMatch) fail('Could not identify the page type safely. No files were changed.');
  if (!/['"]invoices['"]/.test(viewMatch[0])) types = types.replace(viewTypes, value => value.slice(0, -1) + " | 'invoices';");
  if (app !== originalApp) edits.push({name:'src/App.tsx', target:appPath, before:Buffer.from(originalApp), after:Buffer.from(app)});
  if (types !== originalTypes) edits.push({name:'src/lib/types.ts', target:typePath, before:Buffer.from(originalTypes), after:Buffer.from(types)});
  for (const item of manifest.files) {
    if (!/^(src|supabase|tests|docs)\//.test(item.path)) fail('Unexpected file in the update manifest.');
    const target = safePath(item.path), after = readFileSync(join(bundle, 'files', item.path));
    if (createHash('sha256').update(after).digest('hex') !== item.sha256) fail(`The update file ${item.path} is damaged. Download the ZIP again.`);
    const before = existsSync(target) ? readFileSync(target) : null;
    if (before?.equals(after)) continue;
    if (before) fail(`${item.path} already exists with different contents. No files were changed. Ask for help merging the update.`);
    edits.push({name:item.path, target, before, after});
  }
  if (!edits.length) {console.log('The credit invoices update is already installed.'); process.exit(0);}
  console.log(`${dryRun ? 'The update will change' : 'Installing'} ${edits.length} files:`);
  for (const edit of edits) console.log(`  ${edit.before ? 'Update' : 'Add'} ${edit.name}`);
  if (dryRun) {console.log('Check passed. No files were changed. Run the same command without --check to install.'); process.exit(0);}
  const backupRoot = safePath('invoice-update-backups');
  const backup = join(backupRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(backup, {recursive:true});
  const ignore = join(backupRoot, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  for (const edit of edits.filter(edit => edit.before)) {const target = join(backup, edit.name); mkdirSync(dirname(target), {recursive:true}); writeFileSync(target, edit.before);}
  const written = [];
  try {
    for (const edit of edits) {mkdirSync(dirname(edit.target), {recursive:true}); written.push(edit); writeFileSync(edit.target, edit.after);}
  } catch (error) {
    for (const edit of written.reverse()) {if (edit.before) writeFileSync(edit.target, edit.before); else if (existsSync(edit.target)) unlinkSync(edit.target);}
    throw error;
  }
  console.log(`\nInstalled. Backups: ${relative(root, backup)}`);
  console.log('Next: run the invoice SQL file in your own Supabase project, run pnpm run build, then commit and push the listed files to Main.');
} catch (error) {console.error(`\n${error.message}`); process.exitCode = 1;}
