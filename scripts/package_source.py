"""Package only source and documented, non-secret configuration."""
from pathlib import Path
import zipfile, shutil
root=Path(__file__).resolve().parent.parent
out=root/'public'/'downloads'
out.mkdir(parents=True,exist_ok=True)

for migration in sorted((root/'supabase/migrations').glob('*.sql')):
 shutil.copy2(migration,out/migration.name)
(out/'solara-schema.sql').write_text('\n'.join(p.read_text() for p in sorted((root/'supabase/migrations').glob('*.sql'))))
shutil.copy2(root/'README.md',out/'SETUP.md')
files=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','netlify.toml','index.html','.env.example','.gitignore','README.md','public/favicon.svg']
for directory in ['src','supabase','tests','docs','scripts']:
 files += [str(p.relative_to(root)) for p in (root/directory).rglob('*') if p.is_file() and '__pycache__' not in str(p) and '.temp' not in p.parts]
with zipfile.ZipFile(out/'solara-source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in sorted(files):
  if (root/name).is_file(): z.write(root/name,'solara-management/'+name)
print(f'Packaged {len(files)} source files to {out / "solara-source.zip"}')
