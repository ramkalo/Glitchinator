// Pure shape geometry for the Cut Out tool — no imports, so both the effect
// (cut.js) and the tool actions (cutTool.js) can share it without import cycles.
// Uses the same screen convention as cutOverlay.js: cx=(0.5+X/100)*w,
// cy=(0.5−Y/100)*h, so the saved hole / extracted region land exactly where the
// user positioned the selection. `cutRot` rotates the shape about its center
// (degrees, clockwise in screen space, matching the paste-copy rotation).

export function shapeGeometry(p, w, h) {
    const cx = (0.5 + p.cutX / 100) * w;
    const cy = (0.5 - p.cutY / 100) * h;
    const shape = p.cutShape;
    const rot = (p.cutRot || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    // Rotate a center-relative offset (px, y-down) into screen space about the center.
    const rotate = (lx, ly) => [cx + lx * cosR - ly * sinR, cy + lx * sinR + ly * cosR];
    const bboxOf = (pts) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of pts) {
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        return [minX, minY, maxX, maxY];
    };

    if (shape === 'rectangle') {
        const hw = (p.cutW / 200) * w, hh = (p.cutH / 200) * h;
        const corners = [rotate(-hw, -hh), rotate(hw, -hh), rotate(hw, hh), rotate(-hw, hh)];
        return { kind: 'rect', cx, cy, hw, hh, rot, corners, bbox: bboxOf(corners) };
    }
    if (shape === 'ellipse') {
        const rx = (p.cutW / 200) * w, ry = (p.cutH / 200) * h;
        // Rotated-ellipse axis-aligned extents.
        const ex = Math.hypot(rx * cosR, ry * sinR);
        const ey = Math.hypot(rx * sinR, ry * cosR);
        return { kind: 'ellipse', cx, cy, rx, ry, rot, bbox: [cx - ex, cy - ey, cx + ex, cy + ey] };
    }
    const n = shape === 'triangle' ? 3 : Math.max(3, Math.min(12, Math.round(p.cutSides)));
    const verts = [];
    for (let i = 0; i < n; i++) {
        const ox =  ((p[`cutV${i}x`] ?? 0) / 100) * w;   // center-relative offset, px (y-down)
        const oy = -((p[`cutV${i}y`] ?? 0) / 100) * h;
        verts.push(rotate(ox, oy));
    }
    return { kind: 'poly', verts, bbox: bboxOf(verts) };
}

export function traceShapePath(ctx, g) {
    ctx.beginPath();
    if (g.kind === 'rect') {
        const c = g.corners;
        ctx.moveTo(c[0][0], c[0][1]);
        for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]);
        ctx.closePath();
    } else if (g.kind === 'ellipse') {
        ctx.ellipse(g.cx, g.cy, Math.max(0.5, g.rx), Math.max(0.5, g.ry), g.rot || 0, 0, Math.PI * 2);
    } else {
        ctx.moveTo(g.verts[0][0], g.verts[0][1]);
        for (let i = 1; i < g.verts.length; i++) ctx.lineTo(g.verts[i][0], g.verts[i][1]);
        ctx.closePath();
    }
}
