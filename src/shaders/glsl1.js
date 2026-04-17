export const VERTEX_SHADER_GLSL1 = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

export const PRE_CRT_SHADER_GLSL1 = `
    precision highp float;

    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform sampler2D u_image2;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform int u_doubleExposureEnabled;
    uniform int u_doubleExposureChannelMode;
    uniform int u_doubleExposureBlendMode;
    uniform float u_doubleExposureIntensity;
    uniform int u_doubleExposureReverse;

    uniform bool u_basicEnabled;
    uniform float u_brightness;
    uniform float u_contrast;
    uniform float u_saturation;
    uniform float u_highlights;
    uniform float u_shadows;
    uniform float u_temperature;
    uniform float u_tint;

    uniform bool u_digitizeEnabled;
    uniform float u_digitizeDither;
    uniform float u_digitizeNoise;

    uniform bool u_grainEnabled;
    uniform float u_grainIntensity;

    uniform bool u_vignetteEnabled;

    uniform bool u_pixelArtEnabled;
    uniform float u_pixelSize;
    uniform float u_pixelColors;

    uniform bool u_chromaEnabled;
    uniform float u_chromaRedX;
    uniform float u_chromaRedY;
    uniform float u_chromaGreenX;
    uniform float u_chromaGreenY;
    uniform float u_chromaBlueX;
    uniform float u_chromaBlueY;

    uniform float u_vignetteRadius;
    uniform float u_vignetteCenterX;
    uniform float u_vignetteCenterY;
    uniform float u_vignetteEdge;
    uniform float u_vignetteCenter;

    uniform bool u_invertEnabled;
    uniform int u_invertMode;
    uniform float u_invertIntensity;
    uniform bool u_invertReverse;

    uniform bool u_vhsEnabled;
    uniform float u_vhsTracking;
    uniform float u_vhsBleed;
    uniform float u_vhsNoise;

    const float bayer4x4[16] = float[16](
        0.0/16.0,  8.0/16.0,  2.0/16.0, 10.0/16.0,
       12.0/16.0,  4.0/16.0, 14.0/16.0,  6.0/16.0,
        3.0/16.0, 11.0/16.0,  1.0/16.0,  9.0/16.0,
       15.0/16.0,  7.0/16.0, 13.0/16.0,  5.0/16.0
    );

    float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float blendCh(float a, float b, int mode) {
        a = a / 255.0; b = b / 255.0;
        float r;
        if      (mode == 1) r = 1.0 - (1.0 - a) * (1.0 - b);
        else if (mode == 2) r = a * b;
        else if (mode == 3) r = min(1.0, a + b);
        else if (mode == 4) r = a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
        else if (mode == 5) r = abs(a - b);
        else                r = a;
        return r * 255.0;
    }

    void main() {
        vec2 uv = v_texCoord;
        vec4 color = texture2D(u_image, uv);

        if (u_doubleExposureEnabled == 1) {
            vec4 c2 = texture2D(u_image2, uv);
            float lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
            float threshold = 255.0 * (u_doubleExposureIntensity / 100.0);
            bool doBlend = (u_doubleExposureReverse == 1) ? (lum <= threshold) : (lum >= threshold);
            if (doBlend) {
                int cm = u_doubleExposureChannelMode;
                int bm = u_doubleExposureBlendMode;
                if (cm==1||cm==2||cm==5||cm==6) color.r = blendCh(color.r, c2.r, bm);
                if (cm==1||cm==3||cm==5||cm==7) color.g = blendCh(color.g, c2.g, bm);
                if (cm==1||cm==4||cm==6||cm==7) color.b = blendCh(color.b, c2.b, bm);
            }
        }

        if (u_basicEnabled) {
            float lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;

            if (u_highlights != 0.0) {
                float hf = u_highlights * (lum / 255.0) * 0.3;
                color.rgb += hf;
            }

            if (u_shadows != 0.0) {
                float sf = u_shadows * ((255.0 - lum) / 255.0) * 0.3;
                color.rgb += sf;
            }

            float contrastFactor = (u_contrast + 100.0) / 100.0;
            color.rgb = color.rgb * contrastFactor + u_brightness;

            if (u_saturation != 0.0) {
                float sat = 1.0 + u_saturation / 100.0;
                float gray = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
                color.r = gray + sat * (color.r - gray);
                color.g = gray + sat * (color.g - gray);
                color.b = gray + sat * (color.b - gray);
            }

            if (u_temperature != 0.0) {
                float temp = u_temperature / 100.0;
                color.r += temp * 25.0;
                color.b -= temp * 25.0;
            }

            if (u_tint != 0.0) {
                color.g += u_tint * 0.25;
            }
        }

        if (u_digitizeEnabled && u_digitizeDither > 0.0) {
            float amount = u_digitizeDither / 100.0;
            int x = int(mod(gl_FragCoord.x, 4.0));
            int y = int(mod(gl_FragCoord.y, 4.0));
            float threshold = bayer4x4[y * 4 + x] * amount;
            color.rgb = floor(color.rgb / 32.0 + threshold) * 32.0;
        }

        if (u_digitizeEnabled && u_digitizeNoise > 0.0) {
            float intensity = u_digitizeNoise / 100.0 * 80.0;
            float noise = (rand(v_texCoord + u_time) - 0.5) * intensity;
            color.rgb += noise;
        }

        if (u_grainEnabled && u_grainIntensity > 0.0) {
            float intensity = u_grainIntensity / 100.0 * 50.0;
            float noise = (rand(v_texCoord + u_time * 0.001) - 0.5) * intensity;
            color.rgb += noise;
        }

        if (u_pixelArtEnabled) {
            vec2 pixelUV = floor(v_texCoord * u_resolution / u_pixelSize) * u_pixelSize / u_resolution;
            vec4 pixelColor = texture2D(u_image, pixelUV);
            float step = 256.0 / u_pixelColors;
            pixelColor.rgb = floor(pixelColor.rgb / step + 0.5) * step;
            color = pixelColor;
        }

        if (u_chromaEnabled) {
            vec2 redOffset = vec2(u_chromaRedX, -u_chromaRedY) / u_resolution;  // Negate Y: negative = down
            vec2 greenOffset = vec2(u_chromaGreenX, -u_chromaGreenY) / u_resolution;  // Negate Y: negative = down
            vec2 blueOffset = vec2(u_chromaBlueX, -u_chromaBlueY) / u_resolution;  // Negate Y: negative = down
            color.r = texture2D(u_image, uv + redOffset).r;
            color.g = texture2D(u_image, uv + greenOffset).g;
            color.b = texture2D(u_image, uv + blueOffset).b;
        }

        if (u_vignetteEnabled) {
            vec2 center = vec2(0.5 + u_vignetteCenterX / 100.0, 0.5 - u_vignetteCenterY / 100.0);  // Flip Y: negative = down
            float dist = distance(uv, center);
            float maxDist = 0.7071 * (u_vignetteRadius / 100.0);
            float falloff = pow(min(dist / maxDist, 1.0), 2.0);

            // Edge effect: scales brightness at edges based on falloff
            // falloff=0 (center) → edgeFactor=1.0 (no change)
            // falloff=1 (edges) → edgeFactor varies with u_vignetteEdge
            float edgeFactor = 1.0 + falloff * (u_vignetteEdge / 100.0);
            edgeFactor = max(0.0, edgeFactor);

            // Center effect: adds/subtracts brightness at center
            // At center (falloff≈0): full center effect
            // At edges (falloff≈1): center effect fades out
            float centerFactor = 1.0 + (1.0 - falloff) * (u_vignetteCenter / 100.0);
            centerFactor = max(0.0, centerFactor);

            // Combine effects
            float vignette = edgeFactor * centerFactor;

            color.rgb *= vignette;
        }

        if (u_invertEnabled) {
            float lum = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
            float threshold = 255.0 * (u_invertIntensity / 100.0);
            bool shouldInvert = u_invertReverse ? (lum <= threshold) : (lum >= threshold);

            if (shouldInvert) {
                if (u_invertMode == 1) {  // all
                    color.rgb = vec3(255.0) - color.rgb;
                } else if (u_invertMode == 2) {  // rc (red-cyan)
                    color.r = 255.0 - color.r;
                } else if (u_invertMode == 3) {  // gm (green-magenta)
                    color.g = 255.0 - color.g;
                } else if (u_invertMode == 4) {  // by (blue-yellow)
                    color.b = 255.0 - color.b;
                } else if (u_invertMode == 5) {  // bw (black-white/luminance)
                    float newLum = 255.0 - lum;
                    color.rgb = vec3(newLum);
                }
            }
        }

        if (u_vhsEnabled) {
            if (u_vhsTracking > 0.0) {
                int numLines = int(u_vhsTracking / 15.0);
                for (int i = 0; i < 7; i++) {
                    if (i < numLines) {
                        float rowY = fract(float(i) * 0.1324 + u_time * 0.5);
                        float rowDist = abs(uv.y - rowY);
                        if (rowDist < 1.0 / u_resolution.y * 2.0) {
                            float offset = (rand(vec2(float(i), u_time)) - 0.5) * 30.0 / u_resolution.x;
                            uv = vec2(uv.x + offset, uv.y);
                            color = texture2D(u_image, uv);
                        }
                    }
                }
            }

            if (u_vhsBleed > 0.0) {
                float bleed = u_vhsBleed / u_resolution.x;
                color.r = texture2D(u_image, vec2(uv.x - bleed, uv.y)).r;
                color.b = texture2D(u_image, vec2(uv.x + bleed, uv.y)).b;
            }

            if (u_vhsNoise > 0.0) {
                float intensity = u_vhsNoise / 100.0 * 120.0;
                float noise = (rand(v_texCoord + u_time) - 0.5) * intensity;
                color.rgb += noise;
            }
        }

        color.rgb = clamp(color.rgb, 0.0, 255.0);

        gl_FragColor = color;
    }
`;

export const CRT_SHADER_GLSL1 = `
    precision highp float;

    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform bool u_crtEnabled;
    uniform float u_crtCurvature;
    uniform float u_crtCurvatureRadius;
    uniform float u_crtCurvatureIntensity;
    uniform float u_crtCurvatureX;
    uniform float u_crtCurvatureY;
    uniform float u_crtScanline;
    uniform float u_crtScanSpacing;
    uniform float u_crtWaves;
    uniform float u_crtWavePhase;
    uniform float u_crtStatic;
    uniform int u_crtStaticType;

    float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float crtWave(vec2 uv, float phase, float amp) {
        float xNorm = uv.x * 10.0 + phase;
        float yNorm = uv.y * 8.0;

        float w =
            3.2 * sin(xNorm + 0.3 * cos(2.1 * xNorm) + yNorm) +
            2.1 * cos(0.73 * xNorm - 1.4 + yNorm * 0.7) * sin(0.5 * xNorm + 0.9 + yNorm * 0.5) +
            1.8 * sin(2.3 * xNorm + cos(xNorm) + yNorm * 0.3) * exp(-0.02 * pow(xNorm - 2.0, 2.0)) +
            0.9 * cos(3.7 * xNorm - 0.8 + yNorm * 0.4) * (1.0 / (1.0 + 0.15 * xNorm * xNorm)) +
            1.2 * sin(0.41 * xNorm * xNorm - xNorm + yNorm * 0.6);

        return w * amp;
    }

    void main() {
        vec2 uv = v_texCoord;
        vec4 color = texture2D(u_image, uv);

        if (u_crtEnabled) {
            if (u_crtCurvature > 0.0) {
                vec2 center = vec2(0.5 + u_crtCurvatureX / 100.0, 0.5 - u_crtCurvatureY / 100.0);  // Flip Y: negative = down
                float maxRadius = min(u_resolution.x, u_resolution.y) * (u_crtCurvatureRadius / 100.0) / u_resolution.x;
                float intensity = u_crtCurvature / 100.0 * u_crtCurvatureIntensity / 100.0;
                float k = intensity;

                vec2 dc = uv - center;
                float r = length(dc);

                if (r > 0.0 && r < maxRadius) {
                    float factor = 1.0 - k * pow(1.0 - r / maxRadius, 2.0);
                    uv = center + dc * factor;
                }

                uv = clamp(uv, 0.0, 1.0);
                color = texture2D(u_image, uv);
            }

            if (u_crtScanline > 0.0) {
                float spacing = u_crtScanSpacing;
                float row = mod(gl_FragCoord.y, spacing);
                if (row < 1.0) {
                    float darken = 1.0 - u_crtScanline / 100.0 * 0.7;
                    color.rgb *= darken;
                }
            }

            if (u_crtWaves > 0.0) {
                float amplitude = u_crtWaves / 100.0;
                float phase = u_crtWavePhase / 100.0 * 20.0;

                float offset = crtWave(uv, phase, amplitude * 80.0) / u_resolution.x;

                float r = texture2D(u_image, vec2(uv.x + offset, uv.y)).r;
                float g = color.g;
                float b = texture2D(u_image, vec2(uv.x - offset, uv.y)).b;

                color.rgb = vec3(r, g, b);
            }

            if (u_crtStatic > 0.0) {
                float intensity = u_crtStatic / 100.0;
                float noise = (rand(v_texCoord + u_time) - 0.5) * 255.0 * intensity;

                if (u_crtStaticType == 0) {
                    color.rgb += noise;
                } else if (u_crtStaticType == 1) {
                    color.r += noise * rand(v_texCoord + u_time + 0.1);
                    color.g += noise * rand(v_texCoord + u_time + 0.2);
                    color.b += noise * rand(v_texCoord + u_time + 0.3);
                } else {
                    float gray = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
                    float newGray = clamp(gray + noise, 0.0, 255.0);
                    float ratio = newGray / max(gray, 0.001);
                    color.rgb *= ratio;
                }
            }
        }

        color.rgb = clamp(color.rgb, 0.0, 255.0);

        gl_FragColor = color;
    }
`;

export const WAVES_SHADER_GLSL1 = `
    precision highp float;

    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
    uniform float u_time;

    uniform int u_wavesEnabled;
    uniform float u_wavesR;
    uniform float u_wavesG;
    uniform float u_wavesB;
    uniform float u_wavesPhase;

    float crtWave(vec2 uv, float phase, float amp) {
        float xNorm = uv.x * 10.0 + phase;
        float yNorm = uv.y * 8.0;

        float w =
            3.2 * sin(xNorm + 0.3 * cos(2.1 * xNorm) + yNorm) +
            2.1 * cos(0.73 * xNorm - 1.4 + yNorm * 0.7) * sin(0.5 * xNorm + 0.9 + yNorm * 0.5) +
            1.8 * sin(2.3 * xNorm + cos(xNorm) + yNorm * 0.3) * exp(-0.02 * pow(xNorm - 2.0, 2.0)) +
            0.9 * cos(3.7 * xNorm - 0.8 + yNorm * 0.4) * (1.0 / (1.0 + 0.15 * xNorm * xNorm)) +
            1.2 * sin(0.41 * xNorm * xNorm - xNorm + yNorm * 0.6);

        return w * amp;
    }

    void main() {
        vec2 uv = v_texCoord;
        vec4 color = texture2D(u_image, uv);

        if (u_wavesEnabled == 1) {
            float phase = u_wavesPhase / 100.0 * 20.0;
            float baseWave = crtWave(uv, phase, 1.0) / u_resolution.x;

            float r = texture2D(u_image, vec2(clamp(uv.x + baseWave * (u_wavesR / 100.0) * 80.0, 0.0, 1.0), uv.y)).r;
            float g = texture2D(u_image, vec2(clamp(uv.x + baseWave * (u_wavesG / 100.0) * 80.0, 0.0, 1.0), uv.y)).g;
            float b = texture2D(u_image, vec2(clamp(uv.x + baseWave * (u_wavesB / 100.0) * 80.0, 0.0, 1.0), uv.y)).b;
            color.rgb = vec3(r, g, b);
        }

        gl_FragColor = color;
    }
`;
