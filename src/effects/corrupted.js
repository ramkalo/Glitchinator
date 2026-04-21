function mulberry32(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const SOLID_COLORS = {
    r:   [255, 0,   0  ],
    g:   [0,   255, 0  ],
    b:   [0,   0,   255],
    y:  [255, 255, 0  ],
    m:  [255, 0,   255],
    c:  [0,   255, 255],
    rgb: [255, 255, 255],
};

function generateSeeds(numSeeds, centerX, centerY, clusterR, chunkSize, rng) {
    const seeds = [];
    for (let i = 0; i < numSeeds; i++) {
        const angle = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * clusterR;
        seeds.push({
            cx: (centerX + Math.cos(angle) * r) / chunkSize,
            cy: (centerY + Math.sin(angle) * r) / chunkSize,
        });
    }
    return seeds;
}

function applyBranching(chunkMap, seeds, infectRadius, chunkW, chunkH, rng) {
    const queue = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let s = 0; s < seeds.length; s++) {
        const cx = Math.max(0, Math.min(chunkW - 1, Math.round(seeds[s].cx)));
        const cy = Math.max(0, Math.min(chunkH - 1, Math.round(seeds[s].cy)));
        const idx = cy * chunkW + cx;
        if (chunkMap[idx] === -1) {
            chunkMap[idx] = s;
            queue.push({ cx, cy, dist: 0, seed: s });
        }
    }

    let head = 0;
    while (head < queue.length) {
        const { cx, cy, dist, seed } = queue[head++];
        if (dist >= infectRadius) continue;

        const numBranches = Math.max(1, Math.ceil(3 * (1 - dist / Math.max(1, infectRadius))));
        const shuffled = dirs.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (let b = 0; b < numBranches; b++) {
            const [dx, dy] = shuffled[b];
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= chunkW || ny < 0 || ny >= chunkH) continue;
            const nidx = ny * chunkW + nx;
            if (chunkMap[nidx] !== -1) continue;
            chunkMap[nidx] = seed;
            queue.push({ cx: nx, cy: ny, dist: dist + 1, seed });
        }
    }
}

function markChunk(chunkMap, seedIdx, cx, cy, chunkW, chunkH) {
    if (cx < 0 || cx >= chunkW || cy < 0 || cy >= chunkH) return;
    if (chunkMap[cy * chunkW + cx] === -1) chunkMap[cy * chunkW + cx] = seedIdx;
}

function pointInPolygon(x, y, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        const xi = verts[i][0], yi = verts[i][1];
        const xj = verts[j][0], yj = verts[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

function makePolyVerts(N, radius, rotation, rng) {
    const verts = [];
    for (let i = 0; i < N; i++) {
        const angle = (2 * Math.PI * i / N) + rotation;
        const r     = radius * (0.7 + rng() * 0.6);
        verts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
    }
    return verts;
}

function fillPolygon(chunkMap, seedIdx, cx, cy, verts, chunkW, chunkH) {
    let maxR = 0;
    for (const [vx, vy] of verts) maxR = Math.max(maxR, Math.abs(vx), Math.abs(vy));
    const r = Math.ceil(maxR);
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (pointInPolygon(dx, dy, verts))
                markChunk(chunkMap, seedIdx, cx + dx, cy + dy, chunkW, chunkH);
        }
    }
}

function applySplatter(chunkMap, seeds, infectRadius, chunkW, chunkH, rng) {
    for (let s = 0; s < seeds.length; s++) {
        const scx = Math.round(seeds[s].cx);
        const scy = Math.round(seeds[s].cy);
        const N   = 3 + Math.floor(rng() * 6); // 3–8 sides, consistent per splat

        // Central blob
        fillPolygon(chunkMap, s, scx, scy, makePolyVerts(N, Math.max(1, infectRadius * 0.15), rng() * Math.PI * 2, rng), chunkW, chunkH);

        // Splatter arms — random angles, tapered thickness, drip tips
        const numArms = 7 + Math.floor(rng() * 9);
        for (let a = 0; a < numArms; a++) {
            const angle   = rng() * Math.PI * 2;
            const armLen  = infectRadius * (0.25 + rng() * 0.75);
            const startR  = 1 + rng() * 1.5;
            const perpA   = angle + Math.PI / 2;

            for (let step = 0; step <= Math.ceil(armLen); step++) {
                const t      = step / Math.max(1, armLen);
                const radius = Math.max(0.5, startR * (1 - t * 0.85));
                const wiggle = (rng() - 0.5) * 1.2;
                const wx     = scx + Math.cos(angle) * step + Math.cos(perpA) * wiggle;
                const wy     = scy + Math.sin(angle) * step + Math.sin(perpA) * wiggle;
                fillPolygon(chunkMap, s, Math.round(wx), Math.round(wy), makePolyVerts(N, radius, rng() * Math.PI * 2, rng), chunkW, chunkH);
            }

            // Random drips at arm tip
            const tipX     = Math.round(scx + Math.cos(angle) * armLen);
            const tipY     = Math.round(scy + Math.sin(angle) * armLen);
            const numDrips = Math.floor(rng() * 3);
            for (let d = 0; d < numDrips; d++) {
                const dripA   = angle + (rng() - 0.5) * 1.8;
                const dripLen = 1 + Math.floor(rng() * 4);
                for (let dl = 1; dl <= dripLen; dl++) {
                    fillPolygon(chunkMap, s,
                        Math.round(tipX + Math.cos(dripA) * dl),
                        Math.round(tipY + Math.sin(dripA) * dl),
                        makePolyVerts(N, 0.8, rng() * Math.PI * 2, rng), chunkW, chunkH);
                }
            }
        }
    }
}

function applyChains(chunkMap, seeds, infectRadius, chunkW, chunkH, rng) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (let s = 0; s < seeds.length; s++) {
        const numChains = 2 + Math.floor(rng() * 3);
        for (let c = 0; c < numChains; c++) {
            let wx = Math.max(0, Math.min(chunkW - 1, Math.round(seeds[s].cx)));
            let wy = Math.max(0, Math.min(chunkH - 1, Math.round(seeds[s].cy)));
            let dirIdx = Math.floor(rng() * 4);
            const links = Math.ceil(infectRadius * 0.8);

            for (let link = 0; link < links; link++) {
                const sqSize = 1 + Math.floor(rng() * 4); // 1–4 chunks per side
                const half   = Math.floor(sqSize / 2);
                for (let dy = -half; dy < sqSize - half; dy++) {
                    for (let dx = -half; dx < sqSize - half; dx++) {
                        markChunk(chunkMap, s, wx + dx, wy + dy, chunkW, chunkH);
                    }
                }

                // Occasional direction change
                if (rng() < 0.35) dirIdx = (dirIdx + (rng() < 0.5 ? 1 : 3)) % 4;
                const [ddx, ddy] = dirs[dirIdx];
                const gap = sqSize + Math.floor(rng() * 2);
                wx += ddx * gap;
                wy += ddy * gap;
                if (wx < 0 || wx >= chunkW || wy < 0 || wy >= chunkH) break;
            }
        }
    }
}

function walkPath(chunkMap, seedIdx, startCX, startCY, pathLength, chunkW, chunkH, rng) {
    let cx = Math.max(0, Math.min(chunkW - 1, Math.round(startCX)));
    let cy = Math.max(0, Math.min(chunkH - 1, Math.round(startCY)));
    let dirIdx = Math.floor(rng() * 4);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    markChunk(chunkMap, seedIdx, cx, cy, chunkW, chunkH);
    for (let step = 0; step < pathLength; step++) {
        if (rng() < 0.2) dirIdx = (dirIdx + (rng() < 0.5 ? 1 : 3)) % 4;
        const [dx, dy] = dirs[dirIdx];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= chunkW || ny < 0 || ny >= chunkH) {
            dirIdx = Math.floor(rng() * 4);
            continue;
        }
        cx = nx; cy = ny;
        markChunk(chunkMap, seedIdx, cx, cy, chunkW, chunkH);
    }
}

function applyPath(chunkMap, pathLength, chunkW, chunkH, centerX, centerY, clusterR, chunkSize, numPaths, rng) {
    for (let i = 0; i < numPaths; i++) {
        const angle  = rng() * Math.PI * 2;
        const r      = Math.sqrt(rng()) * clusterR;
        const startCX = (centerX + Math.cos(angle) * r) / chunkSize;
        const startCY = (centerY + Math.sin(angle) * r) / chunkSize;
        walkPath(chunkMap, i, startCX, startCY, pathLength, chunkW, chunkH, rng);
    }
}

function sampleFromRegion(region, chunkSize, width, height, srcData, corruptedChunks, boundaryChunks, rng, cx, cy) {
    let px, py;
    if (region === 'perimeter') {
    const startX = cx * chunkSize;
    const startY = cy * chunkSize;
    const side = Math.floor(rng() * 4);
    if      (side === 0) { px = startX; py = startY + rng() * chunkSize; }
    else if (side === 1) { px = startX + chunkSize - 1; py = startY + rng() * chunkSize; }
    else if (side === 2) { px = startX + rng() * chunkSize; py = startY; }
    else                 { px = startX + rng() * chunkSize; py = startY + chunkSize - 1; }

    } else if (region === 'inside') {
    const startX = cx * chunkSize;
    const startY = cy * chunkSize;
    px = Math.min(width  - 1, Math.floor(startX + rng() * chunkSize));
    py = Math.min(height - 1, Math.floor(startY + rng() * chunkSize));
    } else if (region === 'border') {
        const side = Math.floor(rng() * 4);
        if      (side === 0) { px = Math.floor(rng() * width);  py = Math.floor(rng() * Math.min(10, height)); }
        else if (side === 1) { px = Math.floor(rng() * width);  py = height - 1 - Math.floor(rng() * Math.min(10, height)); }
        else if (side === 2) { px = Math.floor(rng() * Math.min(10, width)); py = Math.floor(rng() * height); }
        else                 { px = width - 1 - Math.floor(rng() * Math.min(10, width)); py = Math.floor(rng() * height); }
    } else if (region === 'center') {
        const halfW = Math.min(100, Math.floor(width  / 2));
        const halfH = Math.min(100, Math.floor(height / 2));
        px = Math.floor(width  / 2 - halfW + rng() * halfW * 2);
        py = Math.floor(height / 2 - halfH + rng() * halfH * 2);
    } else { // random-img
        px = Math.floor(rng() * width);
        py = Math.floor(rng() * height);
    }
    px = Math.max(0, Math.min(width  - 1, px));
    py = Math.max(0, Math.min(height - 1, py));
    const i = (py * width + px) * 4;
    return [srcData[i], srcData[i + 1], srcData[i + 2]];
}

export default {
    name:  'corrupted',
    label: 'Corrupted',
    pass:  'pre-crt',
    paramKeys: ['corruptedSeeds', 'corruptedSeed', 'corruptedPattern', 'corruptedColor', 'corruptedColorMode', 'corruptedInfect', 'corruptedChunkSize', 'corruptedCluster', 'corruptedX', 'corruptedY'],
    params: {
        corruptedEnabled:   { default: false },
        corruptedSeeds:     { default: 3,   min: 1,   max: 10    },
        corruptedSeed:      { default: 42,  min: 1,   max: 99999 },
        corruptedPattern:   { default: 'splat' },
        corruptedColor:     { default: 'r' },
        corruptedColorMode: { default: 'per-chunk' },
        corruptedInfect:    { default: 50,  min: 0,   max: 100   },
        corruptedChunkSize: { default: 16,  min: 4,   max: 128   },
        corruptedCluster:   { default: 30,  min: 0,   max: 100   },
        corruptedX:         { default: 0,   min: -50, max: 50    },
        corruptedY:         { default: 0,   min: -50, max: 50    },
    },
    enabled:  (p) => p.corruptedEnabled,
    bindUniforms: corruptedBindUniforms,
    glsl: `
uniform sampler2D uChunkTex;
uniform sampler2D uColorTex;
uniform float corruptedChunkSize;
uniform int   corruptedIsStatic;
uniform int   corruptedIsGlitched;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    float chunkW = ceil(uResolution.x / corruptedChunkSize);
    float chunkH = ceil(uResolution.y / corruptedChunkSize);

    float px = vUV.x * uResolution.x;
    float py = (1.0 - vUV.y) * uResolution.y;
    float cx = floor(px / corruptedChunkSize);
    float cy = floor(py / corruptedChunkSize);

    float u = (cx + 0.5) / chunkW;
    float v = 1.0 - (cy + 0.5) / chunkH;
    float zoneF = texture(uChunkTex, vec2(u, v)).r * 255.0;
    int zone = int(zoneF + 0.5) - 1;

    if (zone < 0) { fragColor = texture(uTex, vUV); return; }

    if (corruptedIsStatic == 1) {
        float n = hash21(vec2(cx, cy));
        fragColor = vec4(n, n, n, 1.0);
        return;
    }

    if (corruptedIsStatic == 2) {
        float r = hash21(vec2(cx,        cy       ));
        float g = hash21(vec2(cy + 47.0, cx + 23.0));
        float b = hash21(vec2(cx + 83.0, cy + 61.0));
        fragColor = vec4(r, g, b, 1.0);
        return;
    }

    if (corruptedIsGlitched == 1) {
        vec2 encoded = texture(uColorTex, vec2(u, v)).rg;
        vec2 offset  = encoded * 2.0 - 1.0;
        fragColor = vec4(texture(uTex, fract(vUV + offset)).rgb, 1.0);
        return;
    }

    fragColor = vec4(texture(uColorTex, vec2(u, v)).rgb, 1.0);
}
`,
};

// --- GPU helpers ---

const _gpuCache = { key: null, srcTex: null, chunkTex: null, colorTex: null };

function corruptedCacheKey(p, w, h) {
    return [p.corruptedSeed, p.corruptedPattern, p.corruptedSeeds, p.corruptedInfect,
            p.corruptedChunkSize, p.corruptedCluster, p.corruptedX, p.corruptedY,
            p.corruptedColor, p.corruptedColorMode, w, h].join(',');
}

function flipYBuffer(buf, w, h) {
    const out = new Uint8Array(buf.length);
    const stride = w * 4;
    for (let row = 0; row < h; row++) {
        out.set(buf.subarray((h - 1 - row) * stride, (h - row) * stride), row * stride);
    }
    return out;
}

function buildChunkMapGPU(p, imgW, imgH) {
    const chunkSize = Math.max(1, p.corruptedChunkSize);
    const chunkW    = Math.ceil(imgW / chunkSize);
    const chunkH    = Math.ceil(imgH / chunkSize);
    const chunkMap  = new Int16Array(chunkW * chunkH).fill(-1);
    const rng       = mulberry32(p.corruptedSeed);
    const centerX   = (0.5 + p.corruptedX / 100) * imgW;
    const centerY   = (0.5 - p.corruptedY / 100) * imgH;
    const clusterR  = p.corruptedCluster / 100 * Math.min(imgW, imgH) * 2;
    const infectRadius = p.corruptedInfect / 100 * Math.max(chunkW, chunkH) * 0.5;
    const seeds     = generateSeeds(p.corruptedSeeds, centerX, centerY, clusterR, chunkSize, rng);
    const pathLength = Math.round((p.corruptedInfect / 100) * chunkW * chunkH);
    const pat = p.corruptedPattern ?? 'splat';
    if      (pat === 'splat')      applySplatter(chunkMap, seeds, infectRadius, chunkW, chunkH, rng);
    else if (pat === 'rubble')     applyChains(chunkMap, seeds, infectRadius, chunkW, chunkH, rng);
    else if (pat === 'detonation') { applyChains(chunkMap, seeds, infectRadius, chunkW, chunkH, rng); applySplatter(chunkMap, seeds, infectRadius, chunkW, chunkH, rng); }
    else if (pat === 'outbreak')   { applyBranching(chunkMap, seeds, infectRadius, chunkW, chunkH, rng); applySplatter(chunkMap, seeds, infectRadius, chunkW, chunkH, rng); }
    else if (pat === 'overgrowth') { applyChains(chunkMap, seeds, infectRadius, chunkW, chunkH, rng); applyBranching(chunkMap, seeds, infectRadius, chunkW, chunkH, rng); }
    else if (pat === 'worm')       applyPath(chunkMap, pathLength, chunkW, chunkH, centerX, centerY, clusterR, chunkSize, 1, rng);
    else if (pat === '3-worms')    applyPath(chunkMap, pathLength, chunkW, chunkH, centerX, centerY, clusterR, chunkSize, 3, rng);

    else                           applySplatter(chunkMap, seeds, infectRadius, chunkW, chunkH, rng);
    return { chunkMap, seeds, chunkW, chunkH };
}

function computeColorTexGPU(p, chunkMap, seeds, chunkW, chunkH, srcData, imgW, imgH) {
    const result     = new Uint8Array(chunkW * chunkH * 4);
    const isGlitched = (p.corruptedColorMode ?? 'per-chunk') === 'glitched';
    const solidColor = SOLID_COLORS[p.corruptedColor];
    const isDynamic  = !solidColor && p.corruptedColor !== 'static' && p.corruptedColor !== 'color-static';
    const isPerChunk = !isGlitched && (p.corruptedColorMode ?? 'per-chunk') === 'per-chunk';

    if (isGlitched) {
        const rng = mulberry32(p.corruptedSeed + 77777);
        const zoneOffsets = [];
        for (let z = 0; z < p.corruptedSeeds; z++) {
            zoneOffsets.push([rng(), rng()]); // [0,1] range — decoded to [-1,1] in shader
        }
        for (let ci = 0; ci < chunkW * chunkH; ci++) {
            const zone = chunkMap[ci];
            if (zone === -1) continue;
            const [ou, ov] = zoneOffsets[zone];
            result[ci * 4]     = Math.round(ou * 255);
            result[ci * 4 + 1] = Math.round(ov * 255);
            result[ci * 4 + 2] = 0;
            result[ci * 4 + 3] = 255;
        }
        return result;
    }

    let corruptedChunks = [], boundaryChunks = [];
    if (isDynamic) {
        for (let ci = 0; ci < chunkW * chunkH; ci++) {
            if (chunkMap[ci] === -1) continue;
            const cx = ci % chunkW, cy = Math.floor(ci / chunkW);
            corruptedChunks.push({ cx, cy });
            const isEdge = cx === 0 || cx === chunkW-1 || cy === 0 || cy === chunkH-1 ||
                (cx > 0         && chunkMap[ci-1]      === -1) || (cx < chunkW-1  && chunkMap[ci+1]      === -1) ||
                (cy > 0         && chunkMap[ci-chunkW] === -1) || (cy < chunkH-1  && chunkMap[ci+chunkW] === -1);
            if (isEdge) boundaryChunks.push({ cx, cy });
        }
    }

    // Pre-compute per-zone colors for per-zone mode
    let zoneColors = null;
    if (isDynamic && !isPerChunk && srcData && corruptedChunks.length > 0) {
        const rng = mulberry32(p.corruptedSeed + 99999);
        zoneColors = [];
        for (let z = 0; z < p.corruptedSeeds; z++) {
            zoneColors.push(sampleFromRegion(p.corruptedColor, Math.max(1, p.corruptedChunkSize), imgW, imgH, srcData, corruptedChunks, boundaryChunks, rng, seeds[z].cx, seeds[z].cy));
        }
    }

    const rng = mulberry32(p.corruptedSeed + 99999);
    for (let ci = 0; ci < chunkW * chunkH; ci++) {
        const zone = chunkMap[ci];
        if (zone === -1) continue;

        const cx = ci % chunkW, cy = Math.floor(ci / chunkW);
        let r, g, b;

        if (solidColor) {
            [r, g, b] = solidColor;
        } else if (isDynamic && isPerChunk && srcData && corruptedChunks.length > 0) {
            [r, g, b] = sampleFromRegion(p.corruptedColor, Math.max(1, p.corruptedChunkSize), imgW, imgH, srcData, corruptedChunks, boundaryChunks, rng, cx, cy);
        } else if (isDynamic && !isPerChunk && zoneColors) {
            [r, g, b] = zoneColors[zone];
        } else {
            r = g = b = 128;
        }

        result[ci * 4]     = r;
        result[ci * 4 + 1] = g;
        result[ci * 4 + 2] = b;
        result[ci * 4 + 3] = 255;
    }
    return result;
}

function corruptedBindUniforms(gl, prog, p, dstW, dstH, srcTex) {
    const key = corruptedCacheKey(p, dstW, dstH);

    if (key !== _gpuCache.key || srcTex !== _gpuCache.srcTex) {
        // Delete old textures
        if (_gpuCache.chunkTex) { gl.deleteTexture(_gpuCache.chunkTex); _gpuCache.chunkTex = null; }
        if (_gpuCache.colorTex) { gl.deleteTexture(_gpuCache.colorTex); _gpuCache.colorTex = null; }

        // Readback source pixels for dynamic color modes (skipped in glitched mode)
        let srcData = null;
        const solidColor = SOLID_COLORS[p.corruptedColor];
        const isDynamic  = !solidColor && p.corruptedColor !== 'static' && p.corruptedColor !== 'color-static';
        const isGlitched = (p.corruptedColorMode ?? 'per-chunk') === 'glitched';
        if (isDynamic && !isGlitched && srcTex) {
            const readFbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readFbo);
            gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, srcTex, 0);
            const raw = new Uint8Array(dstW * dstH * 4);
            gl.readPixels(0, 0, dstW, dstH, gl.RGBA, gl.UNSIGNED_BYTE, raw);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.deleteFramebuffer(readFbo);
            srcData = flipYBuffer(raw, dstW, dstH);
        }

        const { chunkMap, seeds, chunkW, chunkH } = buildChunkMapGPU(p, dstW, dstH);
        const chunkColors = computeColorTexGPU(p, chunkMap, seeds, chunkW, chunkH, srcData, dstW, dstH);

        // Upload chunkMap texture (R channel: zoneIndex+1, 0=unaffected)
        const chunkData = new Uint8Array(chunkW * chunkH * 4);
        for (let i = 0; i < chunkW * chunkH; i++) {
            chunkData[i * 4]     = chunkMap[i] + 1;  // 0=unaffected, 1-10=zone+1
            chunkData[i * 4 + 3] = 255;
        }
        // Upload on TEXTURE1/TEXTURE2 explicitly — avoids clobbering TEXTURE0 (srcTex)
        gl.activeTexture(gl.TEXTURE1);
        const chunkTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, chunkTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, chunkW, chunkH, 0, gl.RGBA, gl.UNSIGNED_BYTE, chunkData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Upload per-chunk color texture (chunkW × chunkH)
        gl.activeTexture(gl.TEXTURE2);
        const colorTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colorTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, chunkW, chunkH, 0, gl.RGBA, gl.UNSIGNED_BYTE, chunkColors);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        _gpuCache.chunkTex = chunkTex;
        _gpuCache.colorTex = colorTex;
        _gpuCache.key      = key;
        _gpuCache.srcTex   = srcTex;
    }

    const chunkLoc = prog._locs['uChunkTex'];
    const colorLoc = prog._locs['uColorTex'];
    const statLoc  = prog._locs['corruptedIsStatic'];
    const glitLoc  = prog._locs['corruptedIsGlitched'];
    if (chunkLoc != null) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, _gpuCache.chunkTex); gl.uniform1i(chunkLoc, 1); }
    if (colorLoc != null) { gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, _gpuCache.colorTex); gl.uniform1i(colorLoc, 2); }
    if (statLoc  != null) { gl.uniform1i(statLoc, p.corruptedColor === 'static' ? 1 : p.corruptedColor === 'color-static' ? 2 : 0); }
    if (glitLoc  != null) { gl.uniform1i(glitLoc, (p.corruptedColorMode ?? 'per-chunk') === 'glitched' ? 1 : 0); }
}
