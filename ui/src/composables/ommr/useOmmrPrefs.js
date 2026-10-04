import { ref, watch } from 'vue';
import { saveText } from '../../utils/safeStorage';

/**
 * How the OMMR explorer looks, remembered per browser. These are display
 * preferences, not work: they are not part of the workspace file or backups
 * (the calibration, folio offsets and index modes that ARE work live in the
 * ommrSettings store).
 *
 * The values are shared: every caller gets the same refs.
 */

function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

/** A ref kept in browser storage under `key`, in the string format `encode`/`decode` define. */
function persisted(key, decode, encode) {
    const value = ref(decode(read(key)));
    watch(value, v => saveText(key, encode(v)));
    return value;
}

let prefs = null;

export function useOmmrPrefs() {
    if (!prefs) {
        prefs = {
            /** How much surrounding context a thumbnail shows around the neume box (0-1). */
            cardPadding: persisted('ommrPadding', raw => Number(raw) || 0.5, String),
            /** Use IIIF images even when the export came with its own page images. */
            preferIiif: persisted('ommrPreferIiif', raw => raw === '1', v => (v ? '1' : '0')),
            /** Overlay the exact note positions on each thumbnail. */
            showMarkers: persisted('ommrShowMarkers', raw => raw !== '0', v => (v ? '1' : '0'))
        };
    }
    return prefs;
}
