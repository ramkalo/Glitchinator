// Shared geometry + image warp for pasted Cut Out copies. Import-free so both the renderer
// (paste.js) and the overlay (cutOverlay.js) use identical math.
//
// A copy transform t = { x, y, scale, rot, skew? }. `skew` (when Allow Skew is on) is 4 per-corner
// offsets in the copy's local unit-square frame ([-0.5..0.5], y-down), order TL, TR, BR, BL.

const BASE = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];   // TL TR BR BL

// True when the copy is an un-skewed rectangle (fast drawImage path is exact).
export function isPlainRect(t, allowSkew) {
    if (!allowSkew || !Array.isArray(t.skew)) return true;
    return t.skew.every(c => (c?.[0] ?? 0) === 0 && (c?.[1] ?? 0) === 0);
}

// The 4 screen-space corners (TL, TR, BR, BL) of a copy centred at (cx,cy).
export function pasteCorners(t, cx, cy, natW, natH, allowSkew) {
    const scale = (t.scale ?? 100) / 100;
    const sw = natW * scale, sh = natH * scale;
    const ang = (t.rot ?? 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const skew = (allowSkew && Array.isArray(t.skew)) ? t.skew : null;
    return BASE.map(([bx, by], i) => {
        const lx = (bx + (skew?.[i]?.[0] ?? 0)) * sw;
        const ly = (by + (skew?.[i]?.[1] ?? 0)) * sh;
        return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
    });
}

// Solve x_i = a*u_i + c*v_i + e for the three correspondences (Cramer's rule). Returns [a,c,e].
function solveAffine(u0, v0, u1, v1, u2, v2, x0, x1, x2) {
    const det = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - v1 * u2);
    if (Math.abs(det) < 1e-9) return null;
    const a = (x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - v1 * x2)) / det;
    const c = (u0 * (x1 - x2) - x0 * (u1 - u2) + (u1 * x2 - x1 * u2)) / det;
    const e = (u0 * (v1 * x2 - x1 * v2) - v0 * (u1 * x2 - x1 * u2) + x0 * (u1 * v2 - v1 * u2)) / det;
    return [a, c, e];
}

function drawTriangle(ctx, img, s, d) {
    const X = solveAffine(s[0][0], s[0][1], s[1][0], s[1][1], s[2][0], s[2][1], d[0][0], d[1][0], d[2][0]);
    const Y = solveAffine(s[0][0], s[0][1], s[1][0], s[1][1], s[2][0], s[2][1], d[0][1], d[1][1], d[2][1]);
    if (!X || !Y) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d[0][0], d[0][1]);
    ctx.lineTo(d[1][0], d[1][1]);
    ctx.lineTo(d[2][0], d[2][1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(X[0], Y[0], X[1], Y[1], X[2], Y[2]);   // a,b,c,d,e,f
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}

// Warp `img` into the quad `corners` (TL,TR,BR,BL) via two affine triangles.
export function drawImageQuad(ctx, img, corners) {
    const iw = img.width, ih = img.height;
    const s = [[0, 0], [iw, 0], [iw, ih], [0, ih]];
    drawTriangle(ctx, img, [s[0], s[1], s[2]], [corners[0], corners[1], corners[2]]);
    drawTriangle(ctx, img, [s[0], s[2], s[3]], [corners[0], corners[2], corners[3]]);
}
