import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

try {
  const protectedFolders = ['템플릿', '표준분류', '분류표 인자'];

  console.log('1. Checking protected folders...');
  for (const f of protectedFolders) {
    if (!fs.existsSync(f) || fs.readdirSync(f).length === 0) {
      throw new Error(`CRITICAL: Protected folder '${f}' missing or empty!`);
    }
    console.log(` - ${f}: ${fs.readdirSync(f).length} items`);
  }

  const worktreeDir = path.resolve('../gh-pages-work');
  console.log('2. Target worktree dir:', worktreeDir);

  if (fs.existsSync(worktreeDir)) {
    fs.rmSync(worktreeDir, { recursive: true, force: true });
    console.log('Removed existing worktree dir');
  }

  console.log('3. Adding worktree for gh-pages...');
  execSync(`git worktree add "${worktreeDir}" gh-pages`, { stdio: 'inherit' });

  function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach(childItemName => {
        copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  console.log('4. Copying app files to worktree root and app/ ...');
  copyRecursiveSync('app', worktreeDir);
  copyRecursiveSync('app', path.join(worktreeDir, 'app'));

  console.log('5. Copying protected folders to worktree ...');
  for (const f of protectedFolders) {
    copyRecursiveSync(f, path.join(worktreeDir, f));
  }

  console.log('6. Staging and committing in gh-pages...');
  execSync('git add -A', { cwd: worktreeDir, stdio: 'inherit' });
  try {
    execSync('git commit -m "Deploy: sync app and permanently protect 템플릿, 표준분류, 분류표 인자 assets (v24)"', { cwd: worktreeDir, stdio: 'inherit' });
    console.log('7. Pushing to origin/gh-pages...');
    execSync('git push origin gh-pages', { cwd: worktreeDir, stdio: 'inherit' });
  } catch (e) {
    console.log('Nothing to commit or already up to date:', e.message);
  }

  console.log('8. Removing external worktree...');
  execSync(`git worktree remove --force "${worktreeDir}"`, { stdio: 'inherit' });

  console.log('9. Verifying protected folders post-deployment...');
  for (const f of protectedFolders) {
    if (!fs.existsSync(f) || fs.readdirSync(f).length === 0) {
      throw new Error(`CRITICAL POST-CHECK: Protected folder '${f}' was affected!`);
    }
    console.log(` - ${f}: ${fs.readdirSync(f).length} items`);
  }

  console.log('🎉 Deployment to gh-pages completed successfully!');
} catch (err) {
  console.log('ERROR during deploy:', err.message);
  process.exit(1);
}
