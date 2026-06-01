const fs = require('fs');
const doc = JSON.parse(fs.readFileSync('export/Be 40078/866e5c6a-da12-449c-b1f7-e509796e0ae3/data.json', 'utf8'));

function printStructure(node, depth = 0) {
    if (!node) return;
    const indent = '  '.repeat(depth);
    const kind = node.kind || 'unknown';
    const label = node.label || '';
    const text = node.text || '';
    console.log(`${indent}- ${kind} (label: "${label}", text: "${text.substring(0, 30)}")`);
    
    const children = node.children || node.elements || [];
    for (const child of children) {
        printStructure(child, depth + 1);
    }
}

printStructure(doc);
