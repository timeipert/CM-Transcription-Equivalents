/**
 * Choosing which OMMR examples to import.
 *
 * An export holds thousands of neumes; the manuscript documentation needs one
 * good example per pattern. Both helpers here are greedy set covers — each step
 * takes whatever covers the most patterns not yet covered — which is not
 * optimal in theory but is fast and, in practice, close to a single line that
 * shows everything. They are pure: patterns the user excluded are passed in as a
 * predicate, results come back as plain data.
 */

/** Lower is a better representative: a balanced aspect ratio crops cleanly. */
export const representativeScore = snippet => Math.abs(snippet.aspectRatio - 1.2);

/**
 * One example per pattern, using as few distinct staff lines as possible.
 *
 * @param {Array<{id, pattern, folio, lineId, aspectRatio}>} snippets
 * @param {(pattern: string) => boolean} [isIncluded]
 * @returns {null | { chosenIds: string[], summary: { lines, covered, total, lineCount, totalLines } }}
 *   null when no pattern is included
 */
export function suggestOptimalSelection(snippets, isIncluded = () => true) {
    // Index lines: lineKey -> the best snippet per pattern on that line.
    const lines = new Map();
    const universe = new Set();
    for (const s of snippets) {
        if (!isIncluded(s.pattern)) continue;
        universe.add(s.pattern);
        const key = `${s.folio}|||${s.lineId}`;
        let entry = lines.get(key);
        if (!entry) {
            entry = { folio: s.folio, lineId: s.lineId, best: new Map() };
            lines.set(key, entry);
        }
        const current = entry.best.get(s.pattern);
        if (!current || representativeScore(s) < representativeScore(current)) entry.best.set(s.pattern, s);
    }
    if (!universe.size) return null;

    const lineArr = [...lines.values()];
    const uncovered = new Set(universe);
    const chosen = new Map(); // pattern -> snippet
    const chosenLines = [];

    while (uncovered.size > 0) {
        let bestLine = null;
        let bestGain = 0;
        for (const line of lineArr) {
            let gain = 0;
            for (const pattern of line.best.keys()) if (uncovered.has(pattern)) gain++;
            if (gain > bestGain) { bestGain = gain; bestLine = line; }
        }
        if (!bestLine || bestGain === 0) break;
        const covers = [];
        for (const [pattern, snippet] of bestLine.best) {
            if (uncovered.has(pattern)) { chosen.set(pattern, snippet); uncovered.delete(pattern); covers.push(pattern); }
        }
        chosenLines.push({ folio: bestLine.folio, lineId: bestLine.lineId, covers });
    }

    return {
        chosenIds: [...chosen.values()].map(s => s.id),
        summary: {
            lines: chosenLines,
            covered: chosen.size,
            total: universe.size,
            lineCount: chosenLines.length,
            totalLines: lines.size
        }
    };
}

/**
 * The fewest staff lines that together show every pattern.
 *
 * @param {Array<{id, patterns: string[]}>} lines
 * @param {(pattern: string) => boolean} [isIncluded]
 * @returns {null | { lines: Array<{ line, newPatterns: string[] }>, covered, total, totalLines }}
 *   null when no pattern is included
 */
export function suggestLineCoverage(lines, isIncluded = () => true) {
    const universe = new Set();
    for (const line of lines) line.patterns.forEach(p => { if (isIncluded(p)) universe.add(p); });
    if (!universe.size) return null;

    const uncovered = new Set(universe);
    const chosen = [];

    while (uncovered.size) {
        let best = null;
        let bestNew = null;
        let bestGain = 0;
        for (const line of lines) {
            const fresh = line.patterns.filter(p => uncovered.has(p));
            // more new patterns wins; on a tie, prefer the denser line (more patterns in total)
            if (fresh.length > bestGain || (fresh.length === bestGain && best && line.patterns.length > best.patterns.length)) {
                bestGain = fresh.length;
                best = line;
                bestNew = fresh;
            }
        }
        if (!best || !bestGain) break;
        chosen.push({ line: best, newPatterns: bestNew });
        bestNew.forEach(p => uncovered.delete(p));
    }

    return {
        lines: chosen,
        covered: universe.size - uncovered.size,
        total: universe.size,
        totalLines: lines.length
    };
}

/**
 * Mark only ONE neume per pattern that a chosen line newly contributes, so each
 * pattern is labelled exactly once (avoids a wall of punctum labels).
 */
export function markedNeumes(item) {
    const wanted = new Set(item.newPatterns);
    const seen = new Set();
    const out = [];
    for (const neume of item.line.neumes) {
        if (wanted.has(neume.pattern) && !seen.has(neume.pattern)) {
            seen.add(neume.pattern);
            out.push(neume);
        }
    }
    return out;
}
