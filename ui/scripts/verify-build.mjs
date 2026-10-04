#!/usr/bin/env node
/**
 * Post-build check for the site in ../docs.
 *
 * The site is built from source (CI publishes it; docs/ is gitignored), so a
 * file only reaches it if it lives in ui/public/ or the bundle. This fails the
 * build when the bundle is missing or when anything in ui/public/ did not make
 * it into the output, rather than publishing a site with holes in it.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
}

if (problems.length) {
    console.error('\n✗ Build verification failed:\n');
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
}

const count = existsSync(publicDir) ? filesUnder(publicDir).length : 0;
console.log(`✓ Build verified: docs/ has index.html, an assets bundle, and all ${count} file(s) from ui/public/.`);
