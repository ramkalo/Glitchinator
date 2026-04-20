import {
    canvas, ctx,
    setOriginalImage, originalImage,
    setSecondImage, secondImage,
    setSecondImagePixels
} from '../renderer/glstate.js';
import { processImage } from '../renderer/pipeline.js';
import { showNotification } from './notifications.js';

export function loadImage(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            setOriginalImage(img);
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            document.getElementById('imageInfo').textContent = `${img.width} \u00d7 ${img.height}px`;
            document.getElementById('dropZone').classList.add('hidden');
            document.getElementById('exportBtn').disabled = false;
            document.getElementById('savePresetBtn').disabled = false;
            document.getElementById('exportBtnMobile').disabled = false;
            document.getElementById('savePresetBtnMobile').disabled = false;

            rescaleSecondImage();
            processImage();
            showNotification('Image loaded');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export function loadSecondImage(file) {
    var reader = new FileReader();
    reader.onload = function(event) {
        var img = new Image();
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

export function rescaleSecondImage() {
    if (!secondImage || !originalImage) return;
    var w = originalImage.width;
    var h = originalImage.height;
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    var tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(secondImage, 0, 0, w, h);
    setSecondImagePixels(tempCtx.getImageData(0, 0, w, h).data);
}