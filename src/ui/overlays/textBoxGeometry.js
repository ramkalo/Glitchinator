// Pure geometry for the Text box quad — no DOM or GL imports, so it can be
// reasoned about (and exercised) on its own. All math happens in pixels: the
// box params are percentages of canvas W/H, and a non-square canvas skews
// percentage space, which would bend the angles this file is here to preserve.

const MIN_SIDE = 6; // px — shortest side allowed while angles are locked

const _unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

// Solve w = a*p + b*q for (a, b). Null when p and q are parallel.
function _solve2(wx, wy, px, py, qx, qy) {
    const det = px * qy - py * qx;
    if (Math.abs(det) < 1e-9) return null;
    return [(wx * qy - wy * qx) / det, (px * wy - py * wx) / det];
}

/** Drag-anchor corner percentages → pixel corners. */
function _anchorPx(a, W, H) {
    return {
        tl: [a.tlx0 / 100 * W, a.tly0 / 100 * H],
        tr: [a.trx0 / 100 * W, a.try0 / 100 * H],
        br: [a.brx0 / 100 * W, a.bry0 / 100 * H],
        bl: [a.blx0 / 100 * W, a.bly0 / 100 * H],
    };
}

/** The four edge unit directions, walking TL → TR → BR → BL → TL. */
function _edgeDirs(c) {
    return {
        dt: _unit(c.tr[0] - c.tl[0], c.tr[1] - c.tl[1]),   // TL → TR
        dr: _unit(c.br[0] - c.tr[0], c.br[1] - c.tr[1]),   // TR → BR
        db: _unit(c.bl[0] - c.br[0], c.bl[1] - c.br[1]),   // BR → BL
        dl: _unit(c.tl[0] - c.bl[0], c.tl[1] - c.bl[1]),   // BL → TL
    };
}

const _pctOut = (c, W, H) => ({
    textTLx: c.tl[0] / W * 100, textTLy: c.tl[1] / H * 100,
    textTRx: c.tr[0] / W * 100, textTRy: c.tr[1] / H * 100,
    textBRx: c.br[0] / W * 100, textBRy: c.br[1] / H * 100,
    textBLx: c.bl[0] / W * 100, textBLy: c.bl[1] / H * 100,
});

/**
 * Square up the box: same center and rotation, but four right angles.
 * Rotation comes from the mean of the top and bottom edges; the side length is
 * the mean edge length, the height the mean perpendicular extent.
 * Returns a param-update object.
 */
export function rightAngleCorners(p, W, H) {
    const c = _anchorPx({
        tlx0: p.textTLx ?? 10, tly0: p.textTLy ?? 65,
        trx0: p.textTRx ?? 90, try0: p.textTRy ?? 65,
        brx0: p.textBRx ?? 90, bry0: p.textBRy ?? 95,
        blx0: p.textBLx ?? 10, bly0: p.textBLy ?? 95,
    }, W, H);

    const cx = (c.tl[0] + c.tr[0] + c.br[0] + c.bl[0]) / 4;
    const cy = (c.tl[1] + c.tr[1] + c.br[1] + c.bl[1]) / 4;

    // Horizontal axis: mean of the top edge and the bottom edge (bottom reversed
    // so both point left → right).
    const [ux, uy] = _unit((c.tr[0] - c.tl[0]) + (c.br[0] - c.bl[0]),
                           (c.tr[1] - c.tl[1]) + (c.br[1] - c.bl[1]));
    let [vx, vy] = [-uy, ux];

    // Point the vertical axis from the top edge toward the bottom edge.
    const downX = (c.bl[0] + c.br[0]) / 2 - (c.tl[0] + c.tr[0]) / 2;
    const downY = (c.bl[1] + c.br[1]) / 2 - (c.tl[1] + c.tr[1]) / 2;
    if (vx * downX + vy * downY < 0) { vx = -vx; vy = -vy; }

    const halfW = (Math.hypot(c.tr[0] - c.tl[0], c.tr[1] - c.tl[1])
                 + Math.hypot(c.br[0] - c.bl[0], c.br[1] - c.bl[1])) / 4;
    const halfH = (Math.abs((c.bl[0] - c.tl[0]) * vx + (c.bl[1] - c.tl[1]) * vy)
                 + Math.abs((c.br[0] - c.tr[0]) * vx + (c.br[1] - c.tr[1]) * vy)) / 4;

    const pt = (su, sv) => [cx + ux * halfW * su + vx * halfH * sv,
                            cy + uy * halfW * su + vy * halfH * sv];
    return _pctOut({ tl: pt(-1, -1), tr: pt(1, -1), br: pt(1, 1), bl: pt(-1, 1) }, W, H);
}

// Corner drag with angles locked. The corner opposite the one being dragged is
// pinned; the two paths of edges leading from it to the cursor each solve for
// their own pair of side lengths. Every edge keeps its direction, so all four
// angles survive — only the side lengths change.
// Table: dragged corner → [pinned, mid1, dir1a, dir1b, mid2, dir2a, dir2b],
// where dirs are edge directions signed for walking pinned → mid → dragged.
const _LOCK_PATHS = {
    br: ['tl', 'tr', ['dt', 1], ['dr',  1], 'bl', ['dl', -1], ['db', -1]],
    tl: ['br', 'tr', ['dr', -1], ['dt', -1], 'bl', ['db', 1], ['dl',  1]],
    tr: ['bl', 'tl', ['dl',  1], ['dt',  1], 'br', ['db', -1], ['dr', -1]],
    bl: ['tr', 'tl', ['dt', -1], ['dl', -1], 'br', ['dr', 1], ['db',  1]],
};

/**
 * @returns param-update object, or null when the drag would invert the box.
 */
export function lockedCornerDrag(anchor, handle, mx, my, W, H) {
    const path = _LOCK_PATHS[handle];
    if (!path) return null;
    const c = _anchorPx(anchor, W, H);
    const d = _edgeDirs(c);
    const [pinKey, mid1, s1a, s1b, mid2, s2a, s2b] = path;
    const O = c[pinKey];
    const wx = mx - O[0], wy = my - O[1];

    const out = { ...c };
    out[handle] = [mx, my];

    for (const [midKey, [ka, sa], [kb, sb]] of [[mid1, s1a, s1b], [mid2, s2a, s2b]]) {
        const p = [d[ka][0] * sa, d[ka][1] * sa];
        const q = [d[kb][0] * sb, d[kb][1] * sb];
        const sol = _solve2(wx, wy, p[0], p[1], q[0], q[1]);
        if (!sol || sol[0] < MIN_SIDE || sol[1] < MIN_SIDE) return null;
        out[midKey] = [O[0] + p[0] * sol[0], O[1] + p[1] * sol[0]];
    }
    return _pctOut(out, W, H);
}

// Edge drag with angles locked: the opposite edge stays put and the dragged edge
// slides along the two edges that connect them, so it stays parallel to where it
// started. One endpoint is placed from the cursor delta, the other falls out of
// the closure constraint.
export function lockedEdgeDrag(anchor, handle, dxPx, dyPx, W, H) {
    const c = _anchorPx(anchor, W, H);
    const d = _edgeDirs(c);
    const out = { ...c };

    // side, slideDir, moved endpoint placed from the pinned corner, then the
    // remaining endpoint solved against the other two edge directions.
    const along = (dir, sign) => (dxPx * dir[0] + dyPx * dir[1]) * sign;
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const step = (from, dir, s, sign) => [from[0] + dir[0] * s * sign, from[1] + dir[1] * s * sign];

    if (handle === 'rightEdge' || handle === 'leftEdge') {
        const isRight = handle === 'rightEdge';
        // top-edge length, measured from the pinned side
        const s = Math.max(MIN_SIDE, len(c.tl, c.tr) + along(d.dt, isRight ? 1 : -1));
        if (isRight) {
            out.tr = step(c.tl, d.dt, s, 1);
            // BR sits at TR + a·dr and at BL - b·db  ⇒  a·dr + b·db = BL - TR
            const sol = _solve2(c.bl[0] - out.tr[0], c.bl[1] - out.tr[1],
                                d.dr[0], d.dr[1], d.db[0], d.db[1]);
            if (!sol || sol[0] < MIN_SIDE || sol[1] < MIN_SIDE) return null;
            out.br = step(out.tr, d.dr, sol[0], 1);
        } else {
            out.tl = step(c.tr, d.dt, s, -1);
            // BL sits at TL - a·dl and at BR + b·db  ⇒  a·dl + b·db = TL - BR
            const sol = _solve2(out.tl[0] - c.br[0], out.tl[1] - c.br[1],
                                d.dl[0], d.dl[1], d.db[0], d.db[1]);
            if (!sol || sol[0] < MIN_SIDE || sol[1] < MIN_SIDE) return null;
            out.bl = step(out.tl, d.dl, sol[0], -1);
        }
        return _pctOut(out, W, H);
    }

    if (handle === 'topEdge' || handle === 'bottomEdge') {
        const isTop = handle === 'topEdge';
        // left-edge length (dl points BL → TL)
        const s = Math.max(MIN_SIDE, len(c.bl, c.tl) + along(d.dl, isTop ? 1 : -1));
        if (isTop) {
            out.tl = step(c.bl, d.dl, s, 1);
            // TL → TR walks along dt; BR → TR walks against dr.
            const sol = _solve2(c.br[0] - out.tl[0], c.br[1] - out.tl[1],
                                d.dt[0], d.dt[1], d.dr[0], d.dr[1]);
            if (!sol || sol[0] < MIN_SIDE || sol[1] < MIN_SIDE) return null;
            out.tr = step(out.tl, d.dt, sol[0], 1);
        } else {
            out.bl = step(c.tl, d.dl, s, -1);
            // BR sits at BL - a·db and at TR + b·dr  ⇒  a·db + b·dr = BL - TR
            const sol = _solve2(out.bl[0] - c.tr[0], out.bl[1] - c.tr[1],
                                d.db[0], d.db[1], d.dr[0], d.dr[1]);
            if (!sol || sol[0] < MIN_SIDE || sol[1] < MIN_SIDE) return null;
            out.br = step(out.bl, d.db, sol[0], -1);
        }
        return _pctOut(out, W, H);
    }
    return null;
}

