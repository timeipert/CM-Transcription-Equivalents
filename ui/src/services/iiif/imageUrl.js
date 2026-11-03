/**
 * IIIF Image API URLs.
 *
 *     {service}/{region}/{size}/{rotation}/{quality}.{format}
 *
 * Six places used to assemble these by string concatenation, each with its own
 * idea of how a region or a size is written. This is the one place that knows.
 */

import { iiifServerLimits } from '../../config/iiifRules';

const stripTrailingSlash = url => String(url).replace(/\/+$/, '');

function hostOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

/**
 * The size a server accepts. Most servers take any size; one listed in
 * `iiifServerLimits` answers `full`, `max` and large widths with an error page, so
 * for it those become the best fit inside the limit.
 */
function sizeFor(serviceUrl, size) {
    const limit = iiifServerLimits[hostOf(serviceUrl)];
    if (!limit) return size;
    const edge = limit.maxEdge;
    if (size === 'full' || size === 'max') return `!${edge},${edge}`;
    const width = /^(\d+),$/.exec(String(size));
    if (width && Number(width[1]) > edge) return `${edge},`;
    return size;
}

/**
 * @param {string} serviceUrl the image service id (no trailing path)
 * @param {{ region?: string, size?: string, rotation?: string, quality?: string, format?: string }} [parts]
 */
export function iiifImageUrl(serviceUrl, { region = 'full', size = 'full', rotation = '0', quality = 'default', format = 'jpg' } = {}) {
    return `${stripTrailingSlash(serviceUrl)}/${region}/${sizeFor(serviceUrl, size)}/${rotation}/${quality}.${format}`;
}

/**
 * A region given as percent of the page: `pct:x,y,w,h`.
 * @param {{ x: number, y: number, w: number, h: number }} box in percent (0-100)
 */
export function pctRegion(box, digits = 3) {
    return `pct:${box.x.toFixed(digits)},${box.y.toFixed(digits)},${box.w.toFixed(digits)},${box.h.toFixed(digits)}`;
}

/**
 * A size parameter. A number (or digit string) is a width, written `w,`; any
 * other value ("full", "max", "!400,400", …) is passed through unchanged.
 */
export function sizeParam(size) {
    if (typeof size === 'number' || (typeof size === 'string' && /^\d+$/.test(size))) return `${size},`;
    return size;
}

/** The whole page at the given width (or "full"/"max"). */
export function iiifPageUrl(serviceUrl, size = 'full') {
    return iiifImageUrl(serviceUrl, { size: sizeParam(size) });
}

/**
 * A region of the page at the given width.
 * @param {string} region `pct:x,y,w,h`, `x,y,w,h` or "full" (see `pctRegion`)
 */
export function iiifRegionUrl(serviceUrl, region, size = 'full') {
    return iiifImageUrl(serviceUrl, { region, size: sizeParam(size) });
}
