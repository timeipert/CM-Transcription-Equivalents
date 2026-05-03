import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useIiifStore = defineStore('iiif', () => {
    // State
    const links = ref(JSON.parse(localStorage.getItem('iiifLinks') || '{}'));
    const parsedData = ref({}); // source -> array of { folio, imgUrl }

    // Persist links
    watch(links, (newLinks) => {
        localStorage.setItem('iiifLinks', JSON.stringify(newLinks));
    }, { deep: true });

    async function loadAllManifests() {
        for (const [source, url] of Object.entries(links.value)) {
            await fetchAndParseManifest(source, url);
        }
    }

    async function addManifest(source, url) {
        links.value[source] = url;
        await fetchAndParseManifest(source, url);
    }

    function removeManifest(source) {
        delete links.value[source];
        delete parsedData.value[source];
    }

    async function fetchAndParseManifest(source, url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to load manifest");
            const data = await res.json();
            
            const folios = [];
            
            // IIIF v2 Parsing
            if (data['@context'] && data['@context'].includes('2/context.json')) {
                if (data.sequences && data.sequences.length > 0) {
                    for (const canvas of data.sequences[0].canvases) {
                        const label = canvas.label || 'Unknown';
                        let imgUrl = null;
                        let serviceUrl = null;
                        const cw = canvas.width || 0;
                        const ch = canvas.height || 0;
                        if (canvas.images && canvas.images[0].resource) {
                            const res = canvas.images[0].resource;
                            if (res.service && res.service['@id']) {
                                serviceUrl = res.service['@id'];
                                imgUrl = serviceUrl + '/full/full/0/default.jpg';
                            } else {
                                imgUrl = res['@id'];
                            }
                        }
                        if (imgUrl) folios.push({ folio: label, imgUrl, serviceUrl, w: cw, h: ch });
                    }
                }
            } 
            // IIIF v3 Parsing
            else if (data['@context'] && (data['@context'].includes('3/context.json') || data['@context'] === 'http://iiif.io/api/presentation/3/context.json')) {
                if (data.items) {
                    for (const item of data.items) {
                        let label = 'Unknown';
                        if (typeof item.label === 'string') {
                            label = item.label;
                        } else if (item.label && typeof item.label === 'object') {
                            const keys = Object.keys(item.label);
                            if (keys.length > 0) {
                                label = item.label[keys[0]][0];
                            }
                        }
                        
                        let imgUrl = null;
                        let serviceUrl = null;
                        const cw = item.width || 0;
                        const ch = item.height || 0;
                        if (item.items && item.items.length > 0 && item.items[0].items && item.items[0].items.length > 0) {
                            const body = item.items[0].items[0].body;
                            if (body && body.service && body.service.length > 0) {
                                const sid = body.service[0].id || body.service[0]['@id'];
                                if (sid) {
                                    serviceUrl = sid;
                                    imgUrl = sid + '/full/max/0/default.jpg';
                                }
                            } else if (body && body.id) {
                                imgUrl = body.id;
                            }
                        }
                        if (imgUrl) folios.push({ folio: label, imgUrl, serviceUrl, w: cw, h: ch });
                    }
                }
            } else {
                 console.warn("Unknown IIIF manifest version", data['@context']);
            }
            
            if (folios.length > 0) {
                parsedData.value[source] = folios;
            } else {
                console.warn(`No canvases found in manifest for ${source}`);
            }
            
        } catch (e) {
            console.error(`Failed to load IIIF manifest for ${source}`, e);
        }
    }

    /**
     * Import manifests from data.json's `manifests` field.
     * Only loads ones not already present in the store.
     */
    async function importFromDataManifests(manifestMap) {
        for (const [source, info] of Object.entries(manifestMap)) {
            const url = (typeof info === 'string' ? info : info.url || '').trim();
            if (!url) continue;
            // Just register the link, don't fetch yet (lazy loading)
            if (!links.value[source]) {
                links.value[source] = url;
            }
        }
    }

    /**
     * Ensure a specific source's manifest is loaded.
     * Called lazily when a source's images are actually needed.
     */
    async function ensureLoaded(source) {
        if (parsedData.value[source]) return; // Already loaded
        const url = links.value[source];
        if (!url) return; // No URL known
        await fetchAndParseManifest(source, url);
    }

    // No eager loading — all manifests are loaded lazily via ensureLoaded()

    return {
        links,
        parsedData,
        addManifest,
        removeManifest,
        importFromDataManifests,
        ensureLoaded
    };
});
