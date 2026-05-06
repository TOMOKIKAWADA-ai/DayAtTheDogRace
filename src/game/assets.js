import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { ASSETS } from './config.js';

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

async function isLoadableAsset(path) {
  try {
    const response = await fetch(path, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') ?? '';
    return response.ok && !contentType.includes('text/html');
  } catch {
    return false;
  }
}

function configureTexture(texture, repeatX, repeatY, options = {}) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = options.wrapS ?? THREE.RepeatWrapping;
  texture.wrapT = options.wrapT ?? THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

function makeCanvasTexture(draw, repeatX, repeatY, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = options.width ?? 256;
  canvas.height = options.height ?? 256;
  const context = canvas.getContext('2d');
  draw(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  return configureTexture(texture, repeatX, repeatY, options);
}

function createRandom(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function smoothStep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function drawPebbles(ctx, width, height, random, count, options) {
  for (let i = 0; i < count; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = randomBetween(random, options.minRadius, options.maxRadius);
    const stretch = randomBetween(random, 0.62, 1.35);
    const tone = options.toneMin + Math.floor(random() * (options.toneMax - options.toneMin));
    const alpha = randomBetween(random, options.alphaMin, options.alphaMax);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI);
    ctx.fillStyle = `rgba(${tone + options.redShift}, ${tone + options.greenShift}, ${tone + options.blueShift}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * stretch, radius, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(26, 24, 21, ${alpha * 0.28})`;
    ctx.lineWidth = Math.max(0.45, radius * 0.16);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDryBrush(ctx, width, height, random, count, areaBias = () => true) {
  ctx.lineCap = 'round';

  for (let i = 0; i < count; i += 1) {
    let x = random() * width;
    let y = random() * height;
    let guard = 0;

    while (!areaBias(x / width, y / height) && guard < 12) {
      x = random() * width;
      y = random() * height;
      guard += 1;
    }

    const radius = randomBetween(random, 3, 10);
    const strands = 4 + Math.floor(random() * 7);
    ctx.strokeStyle = `rgba(${95 + random() * 55}, ${78 + random() * 40}, ${48 + random() * 24}, ${0.12 + random() * 0.2})`;
    ctx.lineWidth = randomBetween(random, 0.45, 1.1);

    for (let strand = 0; strand < strands; strand += 1) {
      const angle = random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * radius * 0.38,
        y + Math.sin(angle) * radius * 0.38,
        x + Math.cos(angle + randomBetween(random, -0.45, 0.45)) * radius,
        y + Math.sin(angle + randomBetween(random, -0.45, 0.45)) * radius,
      );
      ctx.stroke();
    }
  }
}

export function createRoadFallbackTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    const random = createRandom(0x6f617370);

    ctx.fillStyle = '#4d4a43';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 38; i += 1) {
      const shade = 52 + Math.floor(random() * 42);
      const alpha = randomBetween(random, 0.05, 0.14);
      ctx.fillStyle = `rgba(${shade + 12}, ${shade + 8}, ${shade}, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(random() * width, random() * height, randomBetween(random, 22, 72), randomBetween(random, 14, 46), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 7200; i += 1) {
      const shade = 46 + Math.floor(random() * 74);
      const alpha = randomBetween(random, 0.16, 0.48);
      const warm = randomBetween(random, -4, 10);
      ctx.fillStyle = `rgba(${shade + warm}, ${shade + warm - 3}, ${shade + warm - 9}, ${alpha})`;
      const size = randomBetween(random, 0.55, 2.2);
      ctx.fillRect(random() * width, random() * height, size, size * randomBetween(random, 0.7, 1.5));
    }

    drawPebbles(ctx, width, height, random, 420, {
      minRadius: 0.9,
      maxRadius: 3.8,
      toneMin: 62,
      toneMax: 136,
      redShift: 12,
      greenShift: 8,
      blueShift: -2,
      alphaMin: 0.22,
      alphaMax: 0.58,
    });

    ctx.strokeStyle = 'rgba(22, 21, 19, 0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 82; i += 1) {
      const x = random() * width;
      const y = random() * height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 3; step += 1) {
        ctx.lineTo(x + randomBetween(random, -30, 30), y + step * randomBetween(random, 7, 17));
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 950; i += 1) {
      const shade = 132 + Math.floor(random() * 60);
      ctx.fillStyle = `rgba(${shade}, ${shade - 5}, ${shade - 18}, ${randomBetween(random, 0.045, 0.13)})`;
      ctx.fillRect(random() * width, random() * height, randomBetween(random, 0.6, 1.8), randomBetween(random, 0.6, 1.8));
    }
    ctx.globalCompositeOperation = 'source-over';
  }, 1, 1, { width: 512, height: 512 });
}

export function createGrassFallbackTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    const random = createRandom(0x64657374);

    ctx.fillStyle = '#d2b982';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 44; i += 1) {
      const shade = 150 + Math.floor(random() * 42);
      ctx.fillStyle = `rgba(${shade + 32}, ${shade + 12}, ${shade - 18}, ${randomBetween(random, 0.035, 0.1)})`;
      ctx.beginPath();
      ctx.ellipse(random() * width, random() * height, randomBetween(random, 16, 62), randomBetween(random, 10, 42), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 4400; i += 1) {
      const base = 128 + Math.floor(random() * 66);
      ctx.fillStyle = `rgba(${base + 36}, ${base + 18}, ${base - 4}, ${randomBetween(random, 0.1, 0.28)})`;
      ctx.fillRect(random() * width, random() * height, randomBetween(random, 0.6, 2.8), randomBetween(random, 0.6, 3.6));
    }

    drawPebbles(ctx, width, height, random, 160, {
      minRadius: 0.9,
      maxRadius: 4.2,
      toneMin: 104,
      toneMax: 164,
      redShift: 24,
      greenShift: 16,
      blueShift: 2,
      alphaMin: 0.1,
      alphaMax: 0.28,
    });
    drawDryBrush(ctx, width, height, random, 52);
  }, 18, 18, { width: 512, height: 512 });
}

export function createRoadEdgeFallbackTexture() {
  return makeCanvasTexture((ctx, width, height) => {
    const random = createRandom(0x65646765);
    const image = ctx.createImageData(width, height);
    const asphalt = [82, 78, 68];
    const sand = [206, 181, 127];

    for (let y = 0; y < height; y += 1) {
      const yNorm = y / height;
      const edge = 0.3
        + Math.sin(yNorm * Math.PI * 7.5) * 0.026
        + Math.sin(yNorm * Math.PI * 19.2) * 0.012;
      const blendWidth = 0.46 + Math.sin(yNorm * Math.PI * 5.4) * 0.03;

      for (let x = 0; x < width; x += 1) {
        const xNorm = x / width;
        const t = smoothStep(edge, edge + blendWidth, xNorm);
        const grit = (random() - 0.5) * 24;
        const warmDust = smoothStep(0.15, 0.9, xNorm) * 10;
        const color = lerpColor(asphalt, sand, t);
        const index = (y * width + x) * 4;

        image.data[index] = Math.max(0, Math.min(255, color[0] + grit + warmDust));
        image.data[index + 1] = Math.max(0, Math.min(255, color[1] + grit * 0.86 + warmDust * 0.62));
        image.data[index + 2] = Math.max(0, Math.min(255, color[2] + grit * 0.7));
        image.data[index + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);

    for (let i = 0; i < 2200; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const xNorm = x / width;
      const base = xNorm < 0.42 ? 66 + Math.floor(random() * 46) : 118 + Math.floor(random() * 58);
      const red = base + (xNorm < 0.42 ? 10 : 30);
      const green = base + (xNorm < 0.42 ? 7 : 16);
      const blue = base + (xNorm < 0.42 ? -3 : -2);
      ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${randomBetween(random, 0.1, 0.3)})`;
      ctx.fillRect(x, y, randomBetween(random, 0.7, 2.5), randomBetween(random, 0.7, 3.2));
    }

    drawPebbles(ctx, width, height, random, 250, {
      minRadius: 0.9,
      maxRadius: 4.6,
      toneMin: 82,
      toneMax: 152,
      redShift: 20,
      greenShift: 13,
      blueShift: 0,
      alphaMin: 0.12,
      alphaMax: 0.34,
    });
    drawDryBrush(ctx, width, height, random, 28, (xNorm) => xNorm > 0.48);
  }, 1, 1, {
    width: 512,
    height: 512,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.RepeatWrapping,
  });
}

export async function loadTextureOrFallback(candidates, fallbackFactory, repeatX, repeatY) {
  for (const path of candidates) {
    try {
      if (!await isLoadableAsset(path)) {
        continue;
      }

      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(path, resolve, undefined, reject);
      });
      return { texture: configureTexture(texture, repeatX, repeatY), source: path };
    } catch {
      // Try the next local asset name before falling back.
    }
  }

  return { texture: fallbackFactory(), source: 'procedural fallback' };
}

export async function loadHdriEnvironment(renderer) {
  try {
    if (!ASSETS.hdri || !await isLoadableAsset(ASSETS.hdri)) {
      throw new Error('HDRI path is not configured');
    }

    const texture = await new Promise((resolve, reject) => {
      new RGBELoader().load(ASSETS.hdri, resolve, undefined, reject);
    });
    texture.mapping = THREE.EquirectangularReflectionMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return { texture, source: ASSETS.hdri };
  } catch {
    return { texture: null, source: 'default lights' };
  }
}

export async function loadGltfScene(path) {
  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.load(path, resolve, undefined, reject);
  });

  return gltf.scene;
}
