#!/usr/bin/env node
/**
 * Post-build check for the published site in ../docs.
 *
 * `vite build` writes to ../docs with emptyOutDir, which wipes the directory
 * first. Anything that is only present in docs/ — never in ui/public/ — is
 * therefore deleted by a build and silently disappears from the deployed site.
 * That is exactly how docs/scans/ was lost once already.
 *
 * So: every entry in ui/public/ must survive into docs/, and the bundle itself
 * must be present. Fail the build rather than publish a site with holes in it.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(uiDir, 'public');
const outDir = join(uiDir, '..', 'docs');

const problems = [];

/** Every file under `dir`, as paths relative to it. */
function filesUnder(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...filesUnder(full).map(p => join(entry.name, p)));
        else out.push(entry.name);
    }
    return out;
}

if (!existsSync(outDir)) {
    problems.push(`Build output ${outDir} does not exist.`);
} else {
    // 1. The bundle itself
    const indexHtml = join(outDir, 'index.html');
    if (!existsSync(indexHtml)) {
        problems.push('docs/index.html is missing.');
    } else if (!/src="[^"]*assets\/[^"]+\.js"/.test(readFileSync(indexHtml, 'utf8'))) {
        problems.push('docs/index.html does not reference a built assets/ bundle.');
    }

    // 2. Everything shipped from public/ must have made it across
    if (existsSync(publicDir)) {
        const missing = filesUnder(publicDir).filter(rel => !existsSync(join(outDir, rel)));
        if (missing.length) {
            const shown = missing.slice(0, 10).map(m => `      ${m}`).join('\n');
            problems.push(
                `${missing.length} file(s) from ui/public/ are missing in docs/:\n${shown}` +
                (missing.length > 10 ? `\n      … and ${missing.length - 10} more` : '')
            );
        }
    }

    // 3. Anything tracked in docs/ but absent from public/ will be wiped by the
    //    next build. Warn, because it means docs/ holds an orphaned asset whose
    //    only copy is the build output.
    const knownGenerated = new Set(['index.html', 'assets', '.nojekyll']);
    for (const entry of readdirSync(outDir, { withFileTypes: true })) {
        if (knownGenerated.has(entry.name)) continue;
        if (!existsSync(join(publicDir, entry.name))) {
            problems.push(
                `docs/${entry.name} has no counterpart in ui/public/ — the next build will delete it. ` +
                `Move the originals into ui/public/${entry.name}/ so builds can reproduce them.`
            );
        }
    }
}

/**
 * The decisive check: did this build delete files that are committed?
 *
 * ui/public/scans/ is gitignored (large image binaries) while docs/scans/ is
 * committed, so a clone without the scans builds a site with the images
 * missing — and the checks above cannot see it, because nothing is left in
 * either place to compare. Asking git what the build removed catches it
 * regardless of why the source was absent.
 *
 * Hashed bundles under docs/assets/ are expected to churn and are exempt.
 */
try {
    const out = execFileSync('git', ['status', '--porcelain', '--', 'docs'], {
        cwd: join(uiDir, '..'), encoding: 'utf8'
    });
    const deleted = out.split('\n')
        .filter(l => /^\s?D/.test(l))
        .map(l => l.slice(3).replace(/^"|"$/g, ''))
        .filter(p => !p.startsWith('docs/assets/'));
    if (deleted.length) {
        const shown = deleted.slice(0, 10).map(d => `      ${d}`).join('\n');
        problems.push(
            `This build deleted ${deleted.length} committed file(s) from docs/:\n${shown}` +
            (deleted.length > 10 ? `\n      … and ${deleted.length - 10} more` : '') +
            `\n    Their source is missing from ui/public/ (scans/ is gitignored, so a fresh` +
            `\n    clone has none). Restore them under ui/public/ and rebuild, or` +
            `\n    'git checkout -- docs' to undo this build.`
        );
    }
} catch {
    // Not a git repo, or git unavailable — the checks above still apply.
}

if (problems.length) {
    console.error('\n✗ Build verification failed:\n');
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
}

const count = existsSync(publicDir) ? filesUnder(publicDir).length : 0;
console.log(`✓ Build verified: docs/ has index.html, an assets bundle, and all ${count} file(s) from ui/public/.`);
