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

function getGroupValue(source, groupName) {
    let sum = 0;
    if (!rawData[source]) return 0;
    const variants = patternGroups[groupName];
    for (const v of variants) {
        if (rawData[source][v]) sum += rawData[source][v].length;
    }
    return sum;
}

function getCellValue(source, pattern) {
    if (rawData[source] && rawData[source][pattern]) {
        return rawData[source][pattern].length;
    }
    return 0;
}

const hideEmpty = false;
let foundAnomaly = false;

for (const g of Object.keys(patternGroups)) {
    const variants = patternGroups[g];
    const isSingle = (variants.length === 1);
    
    // Simulate what visibleCols does
    const cols = [];
    if (isSingle) {
        cols.push({ type: 'pattern', name: variants[0], label: variants[0], isSingle: true });
    } else {
        cols.push({ type: 'group', name: g, label: g, expanded: true });
        // simulate expanded
        const sortedVars = [...variants].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        for (const v of sortedVars) {
            if (hideEmpty) {
                if (patStats[v].count === 0) continue;
            }
            cols.push({ type: 'pattern', name: v, label: v, parent: g });
        }
    }
    
    for (const src of Object.keys(rawData)) {
        if (src !== 'Pa 1235') continue;
        
        let gVal = getGroupValue(src, g);
        if (gVal > 0) {
            let hasPositiveVariant = false;
            let variantVals = [];
            for (const col of cols) {
                if (col.type === 'pattern') {
                    let cv = getCellValue(src, col.name);
                    variantVals.push(cv);
                    if (cv > 0) hasPositiveVariant = true;
                }
            }
            if (!hasPositiveVariant) {
                console.log(`Anomaly: Group ${g} in ${src} has val ${gVal}, but variants have ${variantVals}`);
                foundAnomaly = true;
            }
        }
    }
}
if (!foundAnomaly) console.log("No anomalies found in Vue logic translation.");
