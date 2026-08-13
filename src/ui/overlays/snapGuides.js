// Pure snap-to-grid math for the Text box — no DOM or GL imports, so it can be
// reasoned about on its own. Everything works in screen pixels (the space the
// overlay drags happen in). Guides are the rule-of-thirds lines (⅓, ⅔) plus the
// center line (½), applied independently on each axis.

export const SNAP_FRACS = [1 / 3, 1 / 2, 2 / 3];
export const SNAP_THRESHOLD_PX = 8; // magnet distance to a guide before it snaps

// Nearest guide to a pixel coord along one axis. Returns { value, frac } for the
// closest guide within threshold, else null.
export function nearestGuide(px, sizePx) {
    let best = null;
    for (const f of SNAP_FRACS) {
        const g = f * sizePx;
        const d = Math.abs(px - g);
        if (d <= SNAP_THRESHOLD_PX && (!best || d < best.d)) best = { d, value: g, frac: f };
    }
    return best ? { value: best.value, frac: best.frac } : null;
}

// Snap a single point independently on each axis (corner drags). Returns the
// possibly-adjusted point plus the fracs of the guides it locked onto (null where
// nothing snapped).
export function snapPoint(mx, my, W, H) {
    const v = nearestGuide(mx, W);
    const h = nearestGuide(my, H);
    return {
        x: v ? v.value : mx,
        y: h ? h.value : my,
        vFrac: v ? v.frac : null,
        hFrac: h ? h.frac : null,
    };
}

// Whole-box move: given the four moved corners (px, TL/TR/BR/BL order) decide the
// extra offset that lands the box's nearest edge OR center on a guide. X and Y are
// chosen independently; each considers {min edge, center, max edge}. Returns the
// px offset to add to every corner plus the matched guide fracs.
export function snapTranslate(corners, W, H) {
    const xs = corners.map(c => c[0]);
    const ys = corners.map(c => c[1]);
    const left = Math.min(...xs), right = Math.max(...xs), cx = (left + right) / 2;
    const top = Math.min(...ys), bottom = Math.max(...ys), cy = (top + bottom) / 2;

    const bestOffset = (features, sizePx) => {
        let best = null; // { offset, frac, d }
        for (const feat of features) {
            const g = nearestGuide(feat, sizePx);
            if (!g) continue;
            const d = Math.abs(g.value - feat);
            if (!best || d < best.d) best = { offset: g.value - feat, frac: g.frac, d };
        }
        return best;
    };

    const bx = bestOffset([left, cx, right], W);
    const by = bestOffset([top, cy, bottom], H);
    return {
        offsetX: bx ? bx.offset : 0,
        offsetY: by ? by.offset : 0,
        vFrac: bx ? bx.frac : null,
        hFrac: by ? by.frac : null,
    };
}

// Edge drag on its perpendicular axis: given the edge midpoint's current px, the
// raw drag delta, and the axis size, return the adjusted delta so the edge lands
// on the nearest guide, plus the matched frac (null when nothing snapped).
export function snapEdge(midPx, deltaPx, sizePx) {
    const g = nearestGuide(midPx + deltaPx, sizePx);
    if (!g) return { delta: deltaPx, frac: null };
    return { delta: deltaPx + (g.value - (midPx + deltaPx)), frac: g.frac };
}
