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

for (const p of patternGroups['udududd']) {
    console.log(p, rawData['Pa 1235']?.[p]?.length || 0);
}
