import {
    canvas, ctx, gl,
    useWebGL,
    setOriginalImage, originalImage,
    setSecondImage, secondImage,
    setSecondTexture, secondTexture,
    setSecondImagePixels
} from '../renderer/glstate.js';
import { createTexture, initFramebuffers } from '../renderer/webgl.js';
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

            if (useWebGL) {
                createTexture(img);
                initFramebuffers(img.width, img.height);
            }

            ctx.drawImage(img, 0, 0);

            document.getElementById('imageInfo').textContent = `${img.width} \u00d7 ${img.height}px`;
            document.getElementById('dropZone').classList.add('hidden');
            document.getElementById('exportBtn').disabled = false;
            document.getElementById('resetBtn').disabled = false;
            document.getElementById('savePresetBtn').disabled = false;
            document.getElementById('exportBtnMobile').disabled = false;
            document.getElementById('resetBtnMobile').disabled = false;
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
            document.getElementById('secondImageName').textContent = file.name;
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
    if (gl) {
        if (secondTexture) gl.deleteTexture(secondTexture);
        const newTex = gl.createTexture();
        setSecondTexture(newTex);
        gl.bindTexture(gl.TEXTURE_2D, newTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
}
