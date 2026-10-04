/**
 * IIIF Image API URLs.
 *
 *     {service}/{region}/{size}/{rotation}/{quality}.{format}
 *
 * Six places used to assemble these by string concatenation, each with its own
 * idea of how a region or a size is written. This is the one place that knows.
 */

const stripTrailingSlash = url => String(url).replace(/\/+$/, '');

/**
 * @param {string} serviceUrl the image service id (no trailing path)
 * @param {{ region?: string, size?: string, rotation?: string, quality?: string, format?: string }} [parts]
 */
export function iiifImageUrl(serviceUrl, { region = 'full', size = 'full', rotation = '0', quality = 'default', format = 'jpg' } = {}) {
    return `${stripTrailingSlash(serviceUrl)}/${region}/${size}/${rotation}/${quality}.${format}`;
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
