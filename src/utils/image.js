import {
    setOriginalImage, originalImage,
    setOriginalFileBytes,
    setSecondImage, secondImage,
    setSecondTexture,
    setBlendMapImage, blendMapImage,
    setBlendMapTexture,
    setGlassMapImage, glassMapImage,
    setGlassMapTexture,
} from '../renderer/glstate.js';
import { uploadToTexture } from '../renderer/webgl.js';
import { processImage } from '../renderer/pipeline.js';
import { showNotification } from './notifications.js';

export function loadImage(file) {
    // Keep the raw file bytes so the Reveal tool can read container metadata (EXIF/XMP/GPS).
    file.arrayBuffer()
        .then(buf => setOriginalFileBytes(new Uint8Array(buf)))
        .catch(() => setOriginalFileBytes(null));

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            setOriginalImage(img);

            document.getElementById('imageInfo').textContent = `${img.width} \u00d7 ${img.height}px`;
            document.getElementById('dropZone').classList.add('hidden');
            document.getElementById('exportBtn').disabled = false;
            document.getElementById('revealBtn').disabled = false;
            document.getElementById('savePresetBtn').disabled = false;
            document.getElementById('exportBtnMobile').disabled = false;
            document.getElementById('revealBtnMobile').disabled = false;
            document.getElementById('savePresetBtnMobile').disabled = false;

            rescaleSecondImage();
            rescaleBlendMapImage();
            rescaleGlassMapImage();
            processImage();
            showNotification('Image loaded');
        };
        img.onerror = function() {
            showNotification('Failed to load image');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export function loadSecondImage(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            setSecondImage(img);
            rescaleSecondImage();
            const nameEl = document.getElementById('secondImageName');
            if (nameEl) nameEl.textContent = file.name;
            processImage();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

export function loadBlankCanvas(width, height, color) {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    setOriginalImage(offscreen);
    setOriginalFileBytes(null); // blank canvas has no source file / metadata

    document.getElementById('imageInfo').textContent = `${width} × ${height}px`;
    document.getElementById('dropZone').classList.add('hidden');
    document.getElementById('exportBtn').disabled = false;
    document.getElementById('revealBtn').disabled = false;
    document.getElementById('savePresetBtn').disabled = false;
    document.getElementById('exportBtnMobile').disabled = false;
    document.getElementById('revealBtnMobile').disabled = false;
    document.getElementById('savePresetBtnMobile').disabled = false;

    processImage();
    showNotification(`Blank ${color === '#ffffff' ? 'white' : 'black'} canvas loaded`);
}

export function loadBlendMapImage(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            setBlendMapImage(img);
            rescaleBlendMapImage();
            processImage();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

export function rescaleBlendMapImage() {
    if (!blendMapImage) return;
    setBlendMapTexture(uploadToTexture(blendMapImage));
}

export function loadGlassMapImage(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            setGlassMapImage(img);
            rescaleGlassMapImage();
            processImage();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

export function rescaleGlassMapImage() {
    if (!glassMapImage) return;
    setGlassMapTexture(uploadToTexture(glassMapImage));
}

export function rescaleSecondImage() {
    if (!secondImage || !originalImage) return;
    // Upload second image as a texture at its native size. The shader reads the image's own
    // dimensions (uSecondTexSize) and aspect-corrects the UVs ("contain" fit), so the image
    // keeps its proportions instead of being stretched to the primary image's aspect ratio.
    if (setSecondTexture) {
        const prev = null; // old texture cleanup handled by setSecondTexture caller if needed
        const tex = uploadToTexture(secondImage);
        setSecondTexture(tex);
    }
}
