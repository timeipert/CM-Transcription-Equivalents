const fs = require('fs');
const data = JSON.parse(fs.readFileSync('ui/public/data.json', 'utf8'));

const rawData = data.data;
const patStats = data.stats;
const allPatterns = Object.keys(patStats);

function getBasicType(pattern) {
    let p = pattern.replace(/[\*\[\]]/g, "");
    p = p.replace(/[LQOS]/g, "");
    if (p === "") return "(Start)";
    return p;
}

const patternGroups = {};
for (const p of allPatterns) {
    const basic = getBasicType(p);
    if (!patternGroups[basic]) patternGroups[basic] = [];
    patternGroups[basic].push(p);
}

const g = 'udududd';
const src = 'Pa 1235';

let sum = 0;
for (const v of patternGroups[g]) {
    const len = rawData[src][v] ? rawData[src][v].length : 0;
    sum += len;
    console.log(`Variant ${v} in ${src}: ${len}`);
}
console.log(`Group ${g} sum in ${src}: ${sum}`);

