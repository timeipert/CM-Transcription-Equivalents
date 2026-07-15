const fs = require('fs');
const path = require('path');

// 1. Add new tokens to style.css
let styleCss = fs.readFileSync('ui/src/style.css', 'utf8');
if (!styleCss.includes('--color-danger-light')) {
    styleCss = styleCss.replace('/* Semantic */', `/* Semantic */
  --color-danger-light: #fee2e2;
  --color-danger-muted: #fca5a5;
  --color-warning-light: #fef3c7;
  --color-warning-muted: #fde68a;
  --color-warning-dark: #b45309;
  --color-success-light: #dcfce7;
  --color-success-muted: #86efac;`);
    fs.writeFileSync('ui/src/style.css', styleCss);
}

// 2. Map remaining hex
const hexMap = {
    '#fee2e2': 'var(--color-danger-light)',
    '#fca5a5': 'var(--color-danger-muted)',
    '#fef3c7': 'var(--color-warning-light)',
    '#fde68a': 'var(--color-warning-muted)',
    '#b45309': 'var(--color-warning-dark)',
    '#dcfce7': 'var(--color-success-light)',
    '#86efac': 'var(--color-success-muted)',
    '#fffbeb': 'var(--color-warning-light)', // map to amber-100
    '#fef2f2': 'var(--color-danger-light)', 
    '#fecaca': 'var(--color-danger-muted)',
    '#fdfdfd': 'var(--color-surface)',
    '#f0f7ff': 'var(--color-primary-light)',
    '#c7d2fe': 'var(--color-primary-light)', // indigo-200 -> primary-light
    '#92400e': 'var(--color-warning-dark)', // amber-800
    '#fde047': 'var(--color-warning-muted)', // yellow-300
    '#f8f9fa': 'var(--color-bg)',
    '#f1f1f1': 'var(--color-surface-muted)',
    '#f0fdf4': 'var(--color-success-light)',
    '#e8e8e8': 'var(--color-border)',
    '#e0e7ff': 'var(--color-primary-light)',
    '#c8e6c9': 'var(--color-success-light)',
    '#bbf7d0': 'var(--color-success-muted)',
    '#991b1b': 'var(--color-danger)',
    '#93c5fd': 'var(--color-primary-light)',
    '#8b5cf6': 'var(--color-accent)',
    '#78350f': 'var(--color-warning-dark)', // amber-900
    '#6366f1': 'var(--color-primary)', // indigo-500
    '#3730a3': 'var(--color-primary-dark)', // indigo-800
    '#14532d': 'var(--color-success)', // green-900
    '#00ff00': 'var(--color-success)',
    '#00cc00': 'var(--color-success)',
    '#ef4444': 'var(--color-danger)'
};

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.vue') || fullPath.endsWith('.js')) {
            if (fullPath.includes('style.css') || fullPath.includes('iiifRules.js')) continue;
            
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            content = content.replace(/#([0-9a-fA-F]{3,6})\b/gi, (match) => {
                const lower = match.toLowerCase();
                if (hexMap[lower]) return hexMap[lower];
                return match; // return original if not in map
            });
            
            // Clean up fallback var defaults (e.g. var(--color-danger, #ef4444) -> var(--color-danger))
            content = content.replace(/var\(--color-[a-zA-Z0-9-]+,\s*#[a-fA-F0-9]+\)/g, (match) => {
                return match.split(',')[0] + ')';
            });
            
            if (content !== original) {
                console.log(`Updated ${fullPath}`);
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

processDir(path.join(__dirname, 'ui/src'));
