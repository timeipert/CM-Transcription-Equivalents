const fs = require('fs');
const path = require('path');

const hexMap = {
    // Slate scale
    '#f8fafc': 'var(--color-bg)',
    '#f1f5f9': 'var(--color-surface-muted)',
    '#e2e8f0': 'var(--color-border)',
    '#cbd5e1': 'var(--color-border-hover)',
    '#94a3b8': 'var(--color-text-light)',
    '#64748b': 'var(--color-text-muted)',
    '#475569': 'var(--color-text)',
    '#334155': 'var(--color-text)',
    '#1e293b': 'var(--color-text)',
    '#0f172a': 'var(--color-text)', // Very dark slate -> text

    // Blue scale
    '#eff6ff': 'var(--color-primary-light)', // blue-50
    '#dbeafe': 'var(--color-primary-light)', // blue-100
    '#60a5fa': 'var(--color-primary)', // blue-400
    '#3b82f6': 'var(--color-primary)', // blue-500
    '#2563eb': 'var(--color-primary-hover)', // blue-600
    '#1d4ed8': 'var(--color-primary-active)', // blue-700
    '#1e40af': 'var(--color-primary-dark)', // blue-800
    '#1e3a8a': 'var(--color-primary-dark)', // blue-900
    '#007bff': 'var(--color-primary)', // bootstrap blue
    '#0056b3': 'var(--color-primary-hover)', 
    '#1976d2': 'var(--color-primary-active)',

    // Grays
    '#eee': 'var(--color-border)',
    '#ccc': 'var(--color-border)',
    '#ddd': 'var(--color-border)',
    '#e0e0e0': 'var(--color-border)',
    '#f5f5f5': 'var(--color-surface-muted)',
    '#fafafa': 'var(--color-bg)',
    '#f9f9f9': 'var(--color-bg)',
    '#333': 'var(--color-text)',
    '#555': 'var(--color-text-muted)',
    '#666': 'var(--color-text-muted)',
    '#888': 'var(--color-text-light)',
    '#999': 'var(--color-text-light)',
    '#000': 'var(--color-text)',
    '#fff': 'var(--color-surface)',
    '#ffffff': 'var(--color-surface)',

    // Semantic
    '#ef4444': 'var(--color-danger)',
    '#dc2626': 'var(--color-danger)',
    '#d32f2f': 'var(--color-danger)',
    '#c62828': 'var(--color-danger)',
    '#e57373': 'var(--color-danger)',
    
    '#f59e0b': 'var(--color-warning)',
    '#d97706': 'var(--color-warning)',
    
    '#22c55e': 'var(--color-success)',
    '#166534': 'var(--color-success)',
    '#2e7d32': 'var(--color-success)',
    '#4ade80': 'var(--color-success)',
    '#86efac': 'var(--color-success)',
    
    // Light semantic backgrounds
    '#ffebee': 'var(--color-danger-light, #fee2e2)',
    '#ffcdd2': 'var(--color-danger-light, #fee2e2)',
    '#ef9a9a': 'var(--color-danger, #ef4444)',
    
    '#e8f5e9': 'var(--color-success-light, #dcfce7)',
    '#81c784': 'var(--color-success, #22c55e)',
    
    '#e3f2fd': 'var(--color-primary-light)',
    '#bae6fd': 'var(--color-primary-light)',
    '#e0f2fe': 'var(--color-primary-light)',
    '#0284c7': 'var(--color-primary)'
};

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.vue') || fullPath.endsWith('.js')) {
            // skip style.css, App.vue because we already did them
            if (fullPath.includes('style.css') || fullPath.includes('App.vue') || fullPath.includes('iiifRules.js')) continue;
            
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            
            // Match hex colors safely
            content = content.replace(/#([0-9a-fA-F]{3,6})\b/gi, (match) => {
                const lower = match.toLowerCase();
                if (hexMap[lower]) return hexMap[lower];
                return match;
            });
            
            if (content !== original) {
                console.log(`Updated ${fullPath}`);
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

processDir(path.join(__dirname, 'ui/src'));
