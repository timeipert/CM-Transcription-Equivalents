/**
 * Download a manifest, patiently: IIIF servers are often slow and sometimes
 * flaky, so a request gets a timeout and a few retries with exponential backoff
 * and jitter. A definite answer — not found, unauthorized, forbidden — is not
 * retried, since asking again cannot change it.
 */

const NO_RETRY = new Set([401, 403, 404]);

/**
 * @param {string} url
 * @param {Object} [options]
 * @param {number} [options.retries=3]
 * @param {number} [options.timeoutMs=15000]
 * @param {number} [options.backoffMs=800] base delay; doubles with each failed attempt
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<any>} the parsed JSON
 * @throws on timeout, network failure, a non-OK status, or a body that is not JSON
 */
export async function fetchManifestJson(url, { retries = 3, timeoutMs = 15000, backoffMs = 800, fetchImpl = globalThis.fetch } = {}) {
    let attempt = 0;
    let res;

    while (attempt < retries) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            res = await fetchImpl(url, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok || NO_RETRY.has(res.status)) break;
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            clearTimeout(timer);
            attempt++;
            if (attempt >= retries) {
                if (e.name === 'AbortError') throw new Error(`Manifest fetch timed out after ${timeoutMs / 1000}s`, { cause: e });
                throw e;
            }
            await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt) + Math.random() * 200));
        }
    }

    if (!res.ok) throw new Error(`Failed to load manifest: HTTP ${res.status}`);
    return res.json();
}
