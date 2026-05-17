import * as THREE from 'three';
import { ASSETS, PLAYER_START, TRACK } from './config.js';
import {
  createGrassFallbackTexture,
  createRoadEdgeFallbackTexture,
  createRoadFallbackTexture,
  loadGltfScene,
  loadHdriEnvironment,
  loadTextureOrFallback,
} from './assets.js';
import { GameAudio } from './audio.js';
import { CHARACTER_AFFECTION_MAX, RACE_CHARACTERS } from './characters.js';
import { createTrack } from './track.js';
import {
  VEHICLE_GRAPHIC_SCALE,
  createFallbackCar,
  prepareLoadedCar,
  replaceVehicleVisual,
} from './vehicles.js';

function moveToward(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}

function formatLapTime(seconds) {
  return Number.isFinite(seconds) ? `${seconds.toFixed(2)}s` : '--';
}

function randomBgmIndex(excludedIndex = -1) {
  const trackCount = ASSETS.audio.bgm.length;
  if (trackCount <= 1) return 0;

  let nextIndex = Math.floor(Math.random() * trackCount);
  while (nextIndex === excludedIndex) {
    nextIndex = Math.floor(Math.random() * trackCount);
  }
  return nextIndex;
}

function randomArrayItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickDifferentLine(lines, previousLine) {
  if (!lines?.length) return '';
  if (lines.length === 1) return lines[0];

  let line = randomArrayItem(lines);
  for (let i = 0; i < 4 && line === previousLine; i += 1) {
    line = randomArrayItem(lines);
  }
  return line;
}

function createDefaultCharacterAffinity() {
  return Object.fromEntries(RACE_CHARACTERS.map((character) => [character.id, 0]));
}

function isMobilePerformanceTarget() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;

  return window.matchMedia('(max-width: 720px), (hover: none) and (pointer: coarse)').matches;
}

function createPerformanceSettings() {
  const mobile = isMobilePerformanceTarget();
  return {
    ...PERFORMANCE_SETTINGS[mobile ? 'mobile' : 'desktop'],
    mobile,
  };
}

function normalizeCharacterAffinity(source = {}) {
  const defaults = createDefaultCharacterAffinity();
  RACE_CHARACTERS.forEach((character) => {
    const value = Number(source[character.id]);
    defaults[character.id] = Number.isFinite(value)
      ? THREE.MathUtils.clamp(Math.floor(value), 0, CHARACTER_AFFECTION_MAX)
      : 0;
  });
  return defaults;
}

function ordinalPlace(place) {
  if (!Number.isFinite(place)) return '--';
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;

  switch (place % 10) {
    case 1:
      return `${place}st`;
    case 2:
      return `${place}nd`;
    case 3:
      return `${place}rd`;
    default:
      return `${place}th`;
  }
}

function normalizeInputKey(event) {
  return event.code === 'Space' ? 'space' : event.key.toLowerCase();
}

function applyGamepadDeadzone(value, deadzone = 0.18) {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

function gamepadButtonValue(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (typeof button === 'number') return button;
  return button?.value ?? (button?.pressed ? 1 : 0);
}

const MENU_CONTROL_ROWS = [
  { action: '車を選ぶ', keys: ['Click', '1-4', 'D-Pad / LS'] },
  { action: '決定', keys: ['Click', '1-4', 'Cross'] },
];
const KEYBOARD_CONTROL_ROWS = [
  { action: 'アクセル', keys: ['W', '↑'] },
  { action: 'ブレーキ / バック', keys: ['S', '↓'] },
  { action: 'ステアリング', keys: ['A / D', '← / →'] },
  { action: 'ニトロ', keys: ['Space'] },
  { action: '一時停止', keys: ['P', 'Esc'] },
  { action: 'リスタート', keys: ['R'] },
];
const GAMEPAD_CONTROL_ROWS = [
  { action: 'ステアリング', keys: ['LS', 'D-Pad'] },
  { action: 'アクセル', keys: ['R2', 'Cross'] },
  { action: 'ブレーキ / バック', keys: ['L2', 'Circle', 'Square'] },
  { action: 'ニトロ', keys: ['R1', 'Triangle'] },
  { action: '一時停止', keys: ['OPTIONS'] },
];

function createKeyCaps(keys) {
  return keys.map((key) => `<kbd>${key}</kbd>`).join('');
}

function createControlGroup(title, rows) {
  return `
    <div class="control-group">
      <span class="control-group-title">${title}</span>
      ${rows.map((row) => `
        <div class="control-row">
          <span class="control-action">${row.action}</span>
          <span class="control-keys">${createKeyCaps(row.keys)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function createControlsGuide({ includeMenu = false, modifier = '' } = {}) {
  const groups = [
    includeMenu ? createControlGroup('CAR SELECT', MENU_CONTROL_ROWS) : '',
    createControlGroup('KEYBOARD', KEYBOARD_CONTROL_ROWS),
    createControlGroup('PS5 PAD', GAMEPAD_CONTROL_ROWS),
  ].filter(Boolean).join('');

  return `
    <div class="controls-guide ${modifier}" aria-label="操作方法">
      <div class="controls-guide-title">操作方法</div>
      <div class="controls-grid">${groups}</div>
    </div>
  `;
}

const GAMEPAD_BUTTON = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  r1: 5,
  l2: 6,
  r2: 7,
  options: 9,
  dpadLeft: 14,
  dpadRight: 15,
};
const GAMEPAD_TRIGGER_THRESHOLD = 0.08;
const GAMEPAD_BUTTON_THRESHOLD = 0.45;

const VEHICLE_COLLISION_RADIUS = 4.6 * VEHICLE_GRAPHIC_SCALE;
const ROAD_GRIP = 7.4;
const DRIFT_GRIP = 0.75;
const DESERT_EDGE_GRIP = 4.8;
const DESERT_DEEP_GRIP = 7.0;
const DESERT_EDGE_DRAG = 1.45;
const DESERT_DEEP_DRAG = 2.35;
const DESERT_EDGE_MAX_SPEED = 16;
const DESERT_DEEP_MAX_SPEED = 10;
const DESERT_DEPTH_FOR_FULL_SLOWDOWN = 18;
const ROAD_THROTTLE_DRAG = 0.38;
const ROAD_COAST_DRAG = 0.24;
const PLAYER_FRONT_AXLE_OFFSET = 1.8 * VEHICLE_GRAPHIC_SCALE;
const PLAYER_FRONT_AXLE_PIVOT_STRENGTH = 0.82;
const OPPONENT_MAX_SPEED = 0.046;
const OPPONENT_MIN_CORNER_SPEED = 0.016;
const OPPONENT_COUNT = 3;
const OPPONENT_OUTSIDE_LINE_OFFSET = TRACK.roadWidth * 0.2;
const OPPONENT_INSIDE_LINE_OFFSET = TRACK.roadWidth * 0.18;
const OPPONENT_LINE_SHIFT_SPEED = 4.8;
const OPPONENT_LINE_LIMIT = TRACK.roadWidth / 2 - 2.2;
const OPPONENT_TURN_SIDE_SWITCH_THRESHOLD = 0.06;
const OPPONENT_LINE_CORNER_START = 0.07;
const OPPONENT_LINE_CORNER_FULL = 0.28;
const OPPONENT_RECOVERY_PULL = 3.25;
const OPPONENT_KNOCKBACK_DAMPING = 1.9;
const OPPONENT_RECOVERY_TIME = 2.9;
const OPPONENT_RECOVERY_SNAP_DISTANCE = 0.18;
const OPPONENT_RECOVERY_SNAP_SPEED = 0.55;
const OPPONENT_HIT_COOLDOWN = 0.24;
const ROAD_SURFACE_RELEASE_MARGIN = 0.6;
const THROTTLE_UNDERSTEER_STRENGTH = 0.72;
const DECEL_TURN_IN_STRENGTH = 0.72;
const LIFT_OFF_LOAD_FACTOR = 0.58;
const VEHICLE_BRAKE_PITCH = 0.14;
const VEHICLE_ACCEL_PITCH = 0.006;
const VEHICLE_STEER_ROLL = 0.02;
const VEHICLE_STEER_ROLL_START = 0.78;
const RACE_LAPS = 3;
const PLAYER_ROAD_MAX_SPEED = 54;
const NITRO_ACCEL = 48;
const NITRO_DRAIN_RATE = 0.14;
const NITRO_MAX_SPEED_BOOST = 22;
const SLIPSTREAM_MIN_SPEED = 15;
const SLIPSTREAM_MIN_DISTANCE = 6;
const SLIPSTREAM_MAX_DISTANCE = 36;
const SLIPSTREAM_MAX_LATERAL_DISTANCE = 8.5;
const SLIPSTREAM_TURN_FADE_START = 0.055;
const SLIPSTREAM_TURN_FADE_END = 0.15;
const SLIPSTREAM_MIN_ALIGNMENT = 0.78;
const SLIPSTREAM_DRAG_REDUCTION = 0.44;
const SLIPSTREAM_MAX_SPEED_BOOST = 7;
const SLIPSTREAM_ACCEL = 9.5;
const COUNTDOWN_SECONDS = 3;
const COUNTDOWN_GO_DISPLAY_SECONDS = 0.72;
const CHARACTER_AFFECTION_STORAGE_KEY = 'eagle-rock-character-affection-v1';
const CHARACTER_DIALOGUE_DURATION = 3.25;
const CHARACTER_DIALOGUE_DEFAULT_COOLDOWN = 3.4;
const CHARACTER_CORNER_COOLDOWN = 8.5;
const CHARACTER_OVERTAKE_COOLDOWN = 2.6;
const CHARACTER_DANGER_COOLDOWN = 8.0;
const CHARACTER_BOOST_COOLDOWN = 5.4;
const CHARACTER_STUCK_OFFROAD_SECONDS = 2.6;
const CHARACTER_OPPONENT_INDEX = 0;
const START_GRID_LANE_OFFSET = 4.7;
const START_GRID_PROGRESS_SPACING = 0.018;
const PLAYER_GRID_PROGRESS = -START_GRID_PROGRESS_SPACING * OPPONENT_COUNT;
const PLAYER_GRID_LINE_OFFSET = START_GRID_LANE_OFFSET;
const COURSE_MAP_SIZE = 240;
const COURSE_MAP_PADDING = 18;
const COURSE_MAP_MARKER_MARGIN = 8;
const ENGINE_BASE_VOLUME = 0.1;
const TUMBLEWEED_VISUAL_SIZE = 3.8;
const TUMBLEWEED_WIND = new THREE.Vector3(-0.62, 0, 0.78).normalize();
const SAND_WIND = new THREE.Vector3(-0.66, 0, 0.75).normalize();
const SAND_WISP_SPAWN_RADIUS = 118;
const SAND_WISP_DESPAWN_DISTANCE = 168;
const TUMBLEWEED_SPAWN_DISTANCE = 92;
const TUMBLEWEED_DESPAWN_DISTANCE = 175;
const TUMBLEWEED_MIN_SPEED = 18;
const TUMBLEWEED_MAX_SPEED = 27;
const TUMBLEWEED_INITIAL_DELAY = 0.35;
const TUMBLEWEED_MIN_BOUNCE_HEIGHT = 0.42;
const TUMBLEWEED_MAX_BOUNCE_HEIGHT = 0.92;
const TUMBLEWEED_MIN_BOUNCE_RATE = 8.5;
const TUMBLEWEED_MAX_BOUNCE_RATE = 12.5;
const OPPONENT_FALLBACK_COLORS = [
  { body: 0xf5c542, accent: 0x5a3814 },
  { body: 0x20201d, accent: 0xd8d0bd },
  { body: 0xb8c1c7, accent: 0x313942 },
];
const OPPONENT_NAMES = ['HAWK', 'B. CARVER', 'DUSTY'];
const OPPONENT_STARTS = [
  { progress: 0, speed: 0.035, lineBias: -START_GRID_LANE_OFFSET },
  { progress: -START_GRID_PROGRESS_SPACING, speed: 0.033, lineBias: START_GRID_LANE_OFFSET },
  { progress: -START_GRID_PROGRESS_SPACING * 2, speed: 0.032, lineBias: -START_GRID_LANE_OFFSET },
];
const COURSE_SCENERY_COUNT = 84;
const PERFORMANCE_SETTINGS = {
  desktop: {
    antialias: true,
    pixelRatioCap: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    courseSceneryCount: 60,
    fixedSceneryStep: 1,
    maxSmokeParticles: 36,
    smokeEmitScale: 0.78,
    maxSandWisps: 28,
    sandWispSpawnRate: 4.2,
    maxTumbleweeds: 4,
    tumbleweedSpawnMin: 2.0,
    tumbleweedSpawnMax: 4.2,
  },
  mobile: {
    antialias: false,
    pixelRatioCap: 1,
    shadowsEnabled: false,
    shadowMapSize: 512,
    courseSceneryCount: 28,
    fixedSceneryStep: 2,
    maxSmokeParticles: 18,
    smokeEmitScale: 0.45,
    maxSandWisps: 12,
    sandWispSpawnRate: 2.2,
    maxTumbleweeds: 2,
    tumbleweedSpawnMin: 3.2,
    tumbleweedSpawnMax: 5.8,
  },
};
const COURSE_SCENERY_MODELS = [
  { modelId: 'plants-01', minHeight: 1.55, maxHeight: 2.25, minOffset: 3.5, maxOffset: 12, tangentJitter: 6 },
  { modelId: 'stone-01', minHeight: 0.76, maxHeight: 1.12, minOffset: 4.5, maxOffset: 13, tangentJitter: 5 },
  { modelId: 'plants-02', minHeight: 1.45, maxHeight: 2.15, minOffset: 4, maxOffset: 13, tangentJitter: 6 },
  { modelId: 'stone-02', minHeight: 0.82, maxHeight: 1.2, minOffset: 5, maxOffset: 14, tangentJitter: 5 },
  { modelId: 'cactus-01', minHeight: 3.55, maxHeight: 5.1, minOffset: 8, maxOffset: 18, tangentJitter: 7 },
  { modelId: 'stone-03', minHeight: 0.92, maxHeight: 1.32, minOffset: 5, maxOffset: 15, tangentJitter: 5 },
  { modelId: 'plants-01', minHeight: 1.45, maxHeight: 2.05, minOffset: 3.5, maxOffset: 11, tangentJitter: 6 },
  { modelId: 'cactus-02', minHeight: 5.7, maxHeight: 7.5, minOffset: 11, maxOffset: 23, tangentJitter: 8 },
  { modelId: 'plants-02', minHeight: 1.55, maxHeight: 2.35, minOffset: 4.5, maxOffset: 14, tangentJitter: 6 },
  { modelId: 'stone-01', minHeight: 0.74, maxHeight: 1.06, minOffset: 5, maxOffset: 13, tangentJitter: 5 },
  { modelId: 'plants-01', minHeight: 1.6, maxHeight: 2.4, minOffset: 4, maxOffset: 13, tangentJitter: 6 },
  { modelId: 'stone-02', minHeight: 0.78, maxHeight: 1.14, minOffset: 5, maxOffset: 14, tangentJitter: 5 },
];
const BACKGROUND_SCENERY_PLACEMENTS = [
  { modelId: 'cactus-02', x: -216, z: -118, height: 7.6, rotation: 0.35 },
  { modelId: 'cactus-02', x: 238, z: -74, height: 6.9, rotation: -0.6 },
  { modelId: 'cactus-02', x: 236, z: 124, height: 7.25, rotation: 1.2 },
  { modelId: 'cactus-02', x: 4, z: -214, height: 6.45, rotation: 1.8 },
  { modelId: 'cactus-01', x: -224, z: 78, height: 4.3, rotation: -1.2 },
  { modelId: 'cactus-01', x: 126, z: 226, height: 4.85, rotation: 0.7 },
  { modelId: 'cactus-01', x: -98, z: 218, height: 3.95, rotation: 2.1 },
  { modelId: 'cactus-01', x: 264, z: 18, height: 4.45, rotation: 2.7 },
  { modelId: 'plants-01', x: -58, z: 86, height: 2.15, rotation: 0.1 },
  { modelId: 'plants-01', x: 98, z: 88, height: 1.85, rotation: 1.9 },
  { modelId: 'plants-01', x: -186, z: -10, height: 2.35, rotation: -0.7 },
  { modelId: 'plants-01', x: 188, z: -126, height: 2.05, rotation: 2.4 },
  { modelId: 'plants-01', x: -238, z: 150, height: 1.95, rotation: -2.6 },
  { modelId: 'plants-01', x: 274, z: -132, height: 2.2, rotation: 0.8 },
  { modelId: 'plants-02', x: 22, z: 84, height: 2.05, rotation: -1.5 },
  { modelId: 'plants-02', x: 124, z: -114, height: 2.3, rotation: 0.55 },
  { modelId: 'plants-02', x: -172, z: -158, height: 1.9, rotation: 2.85 },
  { modelId: 'plants-02', x: 194, z: 200, height: 2.45, rotation: -0.3 },
  { modelId: 'plants-02', x: -282, z: -38, height: 2.1, rotation: 1.35 },
  { modelId: 'plants-02', x: 276, z: 98, height: 1.8, rotation: -2.15 },
  { modelId: 'stone-01', x: -112, z: 54, height: 1.05, rotation: 0.4 },
  { modelId: 'stone-01', x: 52, z: -176, height: 0.86, rotation: 1.2 },
  { modelId: 'stone-01', x: -254, z: -142, height: 1.18, rotation: -0.8 },
  { modelId: 'stone-01', x: 234, z: 174, height: 0.92, rotation: 2.2 },
  { modelId: 'stone-02', x: 72, z: 34, height: 1.22, rotation: -2.1 },
  { modelId: 'stone-02', x: -30, z: 184, height: 0.98, rotation: 0.9 },
  { modelId: 'stone-02', x: 214, z: 38, height: 1.12, rotation: 2.75 },
  { modelId: 'stone-02', x: -206, z: 114, height: 0.9, rotation: -1.65 },
  { modelId: 'stone-03', x: -42, z: -184, height: 1.28, rotation: 1.7 },
  { modelId: 'stone-03', x: 154, z: 214, height: 1.08, rotation: -0.2 },
  { modelId: 'stone-03', x: 284, z: -24, height: 1.36, rotation: -2.7 },
  { modelId: 'stone-03', x: -286, z: 106, height: 1.16, rotation: 0.65 },
];

function smoothStep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createSeededRandom(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function randomRange(random, min, max) {
  return min + random() * (max - min);
}

function createSmokeTexture() {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
  gradient.addColorStop(0.35, 'rgba(224, 220, 210, 0.34)');
  gradient.addColorStop(0.74, 'rgba(196, 194, 188, 0.12)');
  gradient.addColorStop(1, 'rgba(196, 194, 188, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSandWispTexture() {
  const width = 256;
  const height = 72;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  const bodyGradient = context.createLinearGradient(0, 0, width, 0);
  bodyGradient.addColorStop(0, 'rgba(255, 226, 168, 0)');
  bodyGradient.addColorStop(0.2, 'rgba(255, 226, 168, 0.22)');
  bodyGradient.addColorStop(0.58, 'rgba(238, 188, 108, 0.34)');
  bodyGradient.addColorStop(1, 'rgba(238, 188, 108, 0)');

  context.fillStyle = bodyGradient;
  context.beginPath();
  context.ellipse(width / 2, height / 2, width * 0.48, height * 0.28, -0.08, 0, Math.PI * 2);
  context.fill();

  for (let i = 0; i < 18; i += 1) {
    const y = height * (0.28 + Math.random() * 0.44);
    const x = width * Math.random() * 0.2;
    const length = width * (0.3 + Math.random() * 0.48);
    const opacity = 0.05 + Math.random() * 0.08;
    context.strokeStyle = `rgba(255, 240, 190, ${opacity})`;
    context.lineWidth = 1 + Math.random() * 2.2;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(
      x + length * 0.32,
      y - 7 + Math.random() * 14,
      x + length * 0.7,
      y - 10 + Math.random() * 20,
      x + length,
      y + (Math.random() - 0.5) * 12,
    );
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function enableObjectShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

function removeMaterialGloss(material) {
  if (!material) return material;

  const nextMaterial = material.clone();
  if ('roughness' in nextMaterial) nextMaterial.roughness = 1;
  if ('metalness' in nextMaterial) nextMaterial.metalness = 0;
  if ('envMapIntensity' in nextMaterial) nextMaterial.envMapIntensity = 0;
  if ('clearcoat' in nextMaterial) nextMaterial.clearcoat = 0;
  if ('clearcoatRoughness' in nextMaterial) nextMaterial.clearcoatRoughness = 1;
  if ('sheen' in nextMaterial) nextMaterial.sheen = 0;
  if ('specularIntensity' in nextMaterial) nextMaterial.specularIntensity = 0;
  nextMaterial.needsUpdate = true;
  return nextMaterial;
}

function prepareTumbleweedVisual(model) {
  const visual = model.clone(true);
  enableObjectShadows(visual, { cast: false, receive: false });
  visual.traverse((child) => {
    if (child.isMesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => removeMaterialGloss(material))
        : removeMaterialGloss(child.material);
    }
  });

  const bounds = new THREE.Box3().setFromObject(visual);
  const size = bounds.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  if (maxSize > 0) {
    visual.scale.setScalar(TUMBLEWEED_VISUAL_SIZE / maxSize);
  }

  visual.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(visual);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const scaledSize = scaledBounds.getSize(new THREE.Vector3());
  const radius = Math.max(scaledSize.x, scaledSize.y, scaledSize.z) * 0.5;
  visual.position.sub(center);
  visual.userData.radius = radius || 2.4;

  return visual;
}

function prepareStaticSceneryPrototype(model) {
  const prototype = new THREE.Group();
  const visual = model.clone(true);

  enableObjectShadows(visual, { cast: false, receive: false });
  visual.traverse((child) => {
    if (child.isMesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => removeMaterialGloss(material))
        : removeMaterialGloss(child.material);
    }
  });

  visual.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(visual);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  visual.position.x -= center.x;
  visual.position.y -= bounds.min.y;
  visual.position.z -= center.z;
  prototype.add(visual);
  prototype.userData.sourceHeight = size.y || 1;

  return prototype;
}

function createFallbackTumbleweedVisual() {
  const visual = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x6b4a24,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0,
  });

  for (let i = 0; i < 24; i += 1) {
    const length = 2.4 + Math.random() * 2.2;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, length, 5), material);
    branch.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    branch.position.set(
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2,
    );
    visual.add(branch);
  }

  enableObjectShadows(visual, { cast: false, receive: false });
  visual.userData.radius = 2.4;
  return visual;
}

export class RacingGame {
  constructor(root) {
    this.root = root;
    this.keys = new Map();
    this.clock = new THREE.Clock();
    this.animationId = 0;
    this.assetMessages = [];
    this.smokeParticles = [];
    this.smokeEmitAccumulator = 0;
    this.sandWisps = [];
    this.sandWispEmitAccumulator = 0;
    this.tumbleweeds = [];
    this.tumbleweedPrototype = null;
    this.backgroundSceneryRoot = null;
    this.tumbleweedSpawnTimer = TUMBLEWEED_INITIAL_DELAY;
    this.raceStarted = false;
    this.raceFinished = false;
    this.vehicleLoadRequest = 0;
    this.vehicleSelectionLocked = true;
    this.performanceSettings = createPerformanceSettings();
    this.selectedVehicle = ASSETS.models.vehicles[0];
    this.opponentVehicles = this.pickOpponentVehicles(this.selectedVehicle);
    this.characterAffinity = this.loadCharacterAffinity();
    this.activeCharacter = null;
    this.lastRaceResult = null;
    this.characterDialogue = {
      visibleUntil: 0,
      lastEventAt: new Map(),
      lastLineByEvent: new Map(),
      lastPlayerAhead: null,
      cornerPrimed: false,
      nitroWasActive: false,
      offroadDangerTime: 0,
      offroadStuckTime: 0,
      lastLimitedDialogueLap: -1,
      finishLine: '',
      finishExpression: 'neutral',
    };
    this.bgmAudio = null;
    this.bgmEnabled = false;
    this.bgmIndex = randomBgmIndex();
    this.sfx = new GameAudio(ASSETS.audio.sfx);
    this.drivingAudio = {
      throttleHeld: false,
    };
    this.gamepadInput = {
      index: null,
      buttons: new Map(),
      previousButtons: new Map(),
      steer: 0,
      throttle: 0,
      brake: 0,
      nitro: false,
      menuAxis: 0,
      selectionIndex: 0,
    };
    this.touchInput = {
      activeControls: new Map(),
      stickPointerId: null,
      stickValue: 0,
      stickOffset: 0,
      steer: 0,
      throttle: false,
      brake: false,
      nitro: false,
    };
    this.countdown = {
      active: false,
      released: false,
      startedAt: 0,
      label: '',
    };
    this.paused = {
      active: false,
      startedAt: 0,
    };
  }

  async start() {
    this.createLayout();
    this.createRenderer();
    this.createScene();
    this.bindEvents();

    const [roadResult, grassResult, environmentResult] = await Promise.all([
      loadTextureOrFallback(ASSETS.textures.road, createRoadFallbackTexture, 1, 1),
      loadTextureOrFallback(ASSETS.textures.grass, createGrassFallbackTexture, 18, 18),
      loadHdriEnvironment(this.renderer),
    ]);
    const roadEdgeTexture = createRoadEdgeFallbackTexture();

    if (environmentResult.texture) {
      this.scene.environment = environmentResult.texture;
    }

    this.assetMessages.push(`road: ${roadResult.source}`);
    this.assetMessages.push('edge: procedural road/desert blend');
    this.assetMessages.push(`grass: ${grassResult.source}`);
    this.assetMessages.push(`light: ${environmentResult.source}`);
    this.assetMessages.push(`music: ${ASSETS.audio.bgm.length} tracks`);
    this.assetMessages.push(`sfx: ${Object.keys(ASSETS.audio.sfx).length} effects`);
    this.updateAssetStatus();
    this.sfx.preload();

    this.track = createTrack(this.scene, {
      road: roadResult.texture,
      roadEdge: roadEdgeTexture,
      grass: grassResult.texture,
    });
    this.createCourseMap();

    this.createVehicles();
    await Promise.all([
      this.loadTumbleweedModel(),
      this.loadBackgroundScenery(),
    ]);
    this.reset();
    this.vehicleSelectionLocked = false;
    this.startScreen?.classList.remove('start-screen--loading');
    this.setCarChoicesDisabled(false);
    this.focusCarChoice(this.gamepadInput.selectionIndex);
    this.resize();
    this.animate();
  }

  loadCharacterAffinity() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createDefaultCharacterAffinity();
    }

    try {
      const stored = window.localStorage.getItem(CHARACTER_AFFECTION_STORAGE_KEY);
      return normalizeCharacterAffinity(stored ? JSON.parse(stored) : {});
    } catch {
      return createDefaultCharacterAffinity();
    }
  }

  saveCharacterAffinity() {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      window.localStorage.setItem(
        CHARACTER_AFFECTION_STORAGE_KEY,
        JSON.stringify(normalizeCharacterAffinity(this.characterAffinity)),
      );
    } catch {
      // Non-critical: private browsing or storage limits should not block play.
    }
  }

  resetCharacterDialogueState() {
    this.characterDialogue.visibleUntil = 0;
    this.characterDialogue.lastEventAt = new Map();
    this.characterDialogue.lastLineByEvent = new Map();
    this.characterDialogue.lastPlayerAhead = null;
    this.characterDialogue.cornerPrimed = false;
    this.characterDialogue.nitroWasActive = false;
    this.characterDialogue.offroadDangerTime = 0;
    this.characterDialogue.offroadStuckTime = 0;
    this.characterDialogue.lastLimitedDialogueLap = -1;
    this.characterDialogue.finishLine = '';
    this.characterDialogue.finishExpression = 'neutral';
  }

  getActiveCharacterAffinity() {
    if (!this.activeCharacter) return 0;
    return THREE.MathUtils.clamp(
      this.characterAffinity[this.activeCharacter.id] ?? 0,
      0,
      CHARACTER_AFFECTION_MAX,
    );
  }

  addActiveCharacterAffinity() {
    if (!this.activeCharacter) return;

    const current = this.getActiveCharacterAffinity();
    this.characterAffinity[this.activeCharacter.id] = Math.min(
      CHARACTER_AFFECTION_MAX,
      current + 1,
    );
    this.saveCharacterAffinity();
  }

  getCharacterPortrait(expression = 'neutral') {
    if (!this.activeCharacter) return '';
    return this.activeCharacter.portraits[expression] ?? this.activeCharacter.portraits.neutral;
  }

  getCharacterDialogueLines(eventKey, options = {}) {
    if (!this.activeCharacter) return [];
    if (eventKey === 'defeat') {
      const stage = THREE.MathUtils.clamp(
        options.affinityStage ?? this.getActiveCharacterAffinity(),
        0,
        CHARACTER_AFFECTION_MAX,
      );
      return this.activeCharacter.defeatByAffinity[stage] ?? [];
    }
    return this.activeCharacter.dialogue[eventKey] ?? [];
  }

  pickCharacterLine(eventKey, options = {}) {
    const lines = this.getCharacterDialogueLines(eventKey, options);
    const previousLine = this.characterDialogue.lastLineByEvent.get(eventKey);
    const line = pickDifferentLine(lines, previousLine);
    if (line) this.characterDialogue.lastLineByEvent.set(eventKey, line);
    return line;
  }

  updateCharacterPanel(expression = 'neutral') {
    if (!this.characterComms?.root || !this.activeCharacter) return;

    const portrait = this.getCharacterPortrait(expression);
    this.characterComms.name.textContent = this.activeCharacter.name;
    this.characterComms.portrait.src = portrait;
    this.characterComms.portrait.alt = this.activeCharacter.name;
  }

  hideCharacterDialogue() {
    this.characterComms?.root?.classList.add('is-hidden');
    this.characterDialogue.visibleUntil = 0;
  }

  showCharacterDialogue(eventKey, options = {}) {
    if (!this.activeCharacter || !this.characterComms?.root) return false;

    const now = performance.now();
    const cooldown = options.cooldown ?? CHARACTER_DIALOGUE_DEFAULT_COOLDOWN;
    const lastAt = this.characterDialogue.lastEventAt.get(eventKey) ?? -Infinity;
    if (!options.force && now - lastAt < cooldown * 1000) return false;

    const line = this.pickCharacterLine(eventKey, options);
    if (!line) return false;

    const expression = options.expression
      ?? this.activeCharacter.expressions[eventKey]
      ?? 'neutral';
    this.updateCharacterPanel(expression);
    this.characterComms.line.textContent = line;
    this.characterComms.root.classList.remove('is-hidden');
    this.characterDialogue.visibleUntil = now + (options.duration ?? CHARACTER_DIALOGUE_DURATION) * 1000;
    this.characterDialogue.lastEventAt.set(eventKey, now);
    return true;
  }

  showLimitedRaceDialogue(eventKey, options = {}) {
    if (!this.player) return false;

    const lapKey = this.player.laps;
    if (this.characterDialogue.lastLimitedDialogueLap === lapKey) return false;

    const shown = this.showCharacterDialogue(eventKey, options);
    if (shown) {
      this.characterDialogue.lastLimitedDialogueLap = lapKey;
    }
    return shown;
  }

  updateCharacterDialogueVisibility(now = performance.now()) {
    if (!this.characterComms?.root || this.characterComms.root.classList.contains('is-hidden')) return;
    if (this.characterDialogue.visibleUntil > 0 && now >= this.characterDialogue.visibleUntil) {
      this.hideCharacterDialogue();
    }
  }

  getActiveCharacterOpponent() {
    if (!this.activeCharacter) return null;
    return this.opponents?.find((opponent) => opponent.characterId === this.activeCharacter.id) ?? null;
  }

  isActiveCharacterOpponent(opponent) {
    return Boolean(this.activeCharacter && opponent?.characterId === this.activeCharacter.id);
  }

  prepareRaceCharacter() {
    this.activeCharacter = randomArrayItem(RACE_CHARACTERS);
    this.resetCharacterDialogueState();

    const characterOpponent = this.opponents?.[CHARACTER_OPPONENT_INDEX];
    if (characterOpponent) {
      characterOpponent.name = this.activeCharacter.shortName;
      characterOpponent.characterId = this.activeCharacter.id;
    }

    this.updatePositionBoard();
    this.updateCharacterPanel(this.activeCharacter.expressions.preRace);
    this.showCharacterDialogue('preRace', {
      force: true,
      duration: 2.8,
    });
  }

  createLayout() {
    const vehicleButtons = ASSETS.models.vehicles
      .map((vehicle, index) => `
        <button class="car-choice" type="button" data-car-id="${vehicle.id}" disabled>
          <span class="car-choice-number">${index + 1}</span>
          ${vehicle.sideImage ? `<span class="car-choice-visual"><img src="${vehicle.sideImage}" alt="" draggable="false" /></span>` : ''}
          <span class="car-choice-name">${vehicle.name}</span>
        </button>
      `)
      .join('');
    const opponentMarkers = Array.from({ length: OPPONENT_COUNT }, (_, index) => `
            <g class="course-map-marker course-map-marker-opponent" data-map-opponent="${index}">
              <path d="M 0 -5 L 4.5 6 L 0 3 L -4.5 6 Z"></path>
            </g>
    `).join('');
    const startControls = createControlsGuide({ includeMenu: true, modifier: 'controls-guide--start' });
    const pauseControls = createControlsGuide({ modifier: 'controls-guide--pause' });

    this.root.innerHTML = `
      <main class="game-shell">
        <div class="viewport" data-viewport></div>
        <section class="route-title" aria-label="route">
          <h1>DAY OF THE DOG</h1>
          <p>RACE</p>
        </section>
        <section class="stage-board" aria-label="stage status">
          <div class="stage-box stage-times">
            <span>Lap <strong data-lap>0/${RACE_LAPS}</strong></span>
            <span>Current <strong data-current>0.00s</strong></span>
            <span>Best <strong data-best>--</strong></span>
          </div>
        </section>
        <section class="position-board" aria-label="position">
          <div class="position-number" data-position-number>--<span>/--</span> <em>POS.</em></div>
          <ol data-position-list></ol>
        </section>
        <section class="course-map" aria-label="course overview">
          <svg class="course-map-svg" data-course-map viewBox="0 0 240 240" role="img" aria-label="course overview">
            <path class="course-map-runoff" data-map-runoff></path>
            <path class="course-map-road" data-map-road></path>
            <path class="course-map-center" data-map-center></path>
${opponentMarkers}
            <g class="course-map-marker course-map-marker-player" data-map-player>
              <path d="M 0 -6.5 L 5 7 L 0 3.5 L -5 7 Z"></path>
            </g>
          </svg>
          <div class="course-map-legend" aria-hidden="true">
            <span><i class="legend-you"></i>YOU</span>
            <span><i class="legend-rival"></i>RIVAL</span>
          </div>
        </section>
        <section class="dashboard" aria-label="race instruments">
          <div class="nitro-gauge" data-nitro><span>NITRO</span><i></i></div>
          <div class="speedometer">
            <div class="speedometer-ring"></div>
            <div class="speed-value" data-speed>0</div>
            <div class="speed-unit">MPH</div>
            <div class="gear-label">GEAR 4</div>
          </div>
          <button class="audio-toggle is-muted" type="button" data-audio-toggle aria-label="Turn audio on">
            <span class="audio-icon" aria-hidden="true"></span>
          </button>
        </section>
        <section class="character-comms is-hidden" data-character-comms aria-live="polite">
          <div class="character-portrait"><img data-character-portrait alt="" draggable="false" /></div>
          <div class="character-copy">
            <div class="character-meta">
              <span data-character-name>Rival</span>
            </div>
            <p class="character-line" data-character-line></p>
          </div>
        </section>
        <button class="pause-toggle" type="button" data-pause-toggle aria-label="Pause game">
            <span class="pause-icon" aria-hidden="true"></span>
          </button>
        <section class="mobile-race-hud" aria-label="mobile race status">
          <div class="mobile-stat mobile-stat--speed">
            <span>SPD</span>
            <strong data-speed>0</strong>
          </div>
          <div class="mobile-stat">
            <span>LAP</span>
            <strong data-lap>0/${RACE_LAPS}</strong>
          </div>
          <div class="mobile-stat">
            <span>POS</span>
            <strong data-mobile-position>--/--</strong>
          </div>
          <div class="mobile-stat">
            <span>BEST</span>
            <strong data-best>--</strong>
          </div>
          <div class="mobile-meter mobile-meter--speed">
            <span>SPEED</span>
            <b><i data-speed-meter></i></b>
          </div>
          <div class="mobile-meter mobile-meter--nitro">
            <span>NITRO</span>
            <b><i data-nitro></i></b>
          </div>
          <div class="mobile-current">
            <span>CURRENT</span>
            <strong data-current>0.00s</strong>
          </div>
        </section>
        <section class="hud" aria-label="race status">
          <h1 class="hud-title">DAY OF THE DOG RACE</h1>
          <div class="hud-grid">
            <div class="metric"><span class="metric-label">Speed</span><span class="metric-value" data-speed>0</span></div>
            <div class="metric"><span class="metric-label">Lap</span><span class="metric-value" data-lap>0/${RACE_LAPS}</span></div>
            <div class="metric"><span class="metric-label">Current</span><span class="metric-value" data-current>0.00s</span></div>
            <div class="metric"><span class="metric-label">Best</span><span class="metric-value" data-best>--</span></div>
          </div>
          <button class="audio-toggle is-muted" type="button" data-audio-toggle aria-label="Turn audio on">
            <span class="audio-icon" aria-hidden="true"></span>
          </button>
        </section>
        <section class="touch-controls" aria-label="touch driving controls">
          <div class="touch-stick" data-touch-stick role="group" aria-label="Steering">
            <img class="touch-stick-base" src="/assets/ui/touch/stick-base.svg" alt="" draggable="false" />
            <img class="touch-stick-thumb" src="/assets/ui/touch/stick.svg" alt="" draggable="false" data-touch-stick-thumb />
          </div>
          <div class="touch-actions">
            <button class="touch-button touch-button--nitro" type="button" data-touch-control="nitro" aria-label="Nitro">
              <img src="/assets/ui/touch/nitro.svg" alt="" draggable="false" />
            </button>
            <button class="touch-button touch-button--brake" type="button" data-touch-control="brake" aria-label="Brake or reverse">
              <img src="/assets/ui/touch/brake.svg" alt="" draggable="false" />
            </button>
            <button class="touch-button touch-button--throttle" type="button" data-touch-control="throttle" aria-label="Accelerate">
              <img src="/assets/ui/touch/gas-pedal.svg" alt="" draggable="false" />
            </button>
          </div>
        </section>
        <section class="start-screen start-screen--loading" data-start-screen aria-label="car selection">
          <div class="start-panel">
            <p class="start-kicker">DAY OF THE DOG RACE</p>
            <h2 class="start-title">Choose Your Car</h2>
            <div class="car-picker" data-car-picker>${vehicleButtons}</div>
            ${startControls}
          </div>
        </section>
        <section class="countdown-screen is-hidden" data-countdown-screen aria-label="race countdown" aria-live="polite">
          <div class="countdown-value" data-countdown-value>3</div>
        </section>
        <section class="pause-screen is-hidden" data-pause-screen aria-label="game paused" aria-live="polite">
          <div class="pause-panel">
            <div class="pause-title">PAUSED</div>
            ${pauseControls}
          </div>
        </section>
        <section class="finish-screen is-hidden" data-finish-screen aria-label="race results">
          <div class="finish-panel">
            <p class="finish-kicker">Race Complete</p>
            <h2 class="finish-title" data-finish-title>${RACE_LAPS} Laps Finished</h2>
            <div class="finish-character" data-finish-character>
              <div class="finish-character-portrait">
                <img data-finish-character-portrait alt="" draggable="false" />
              </div>
              <div class="finish-character-copy">
                <span data-finish-character-name>Rival</span>
                <p data-finish-character-line></p>
              </div>
            </div>
            <div class="finish-stats">
              <span>Result <strong data-finish-result>--</strong></span>
              <span>Total <strong data-finish-total>--</strong></span>
              <span>Best <strong data-finish-best>--</strong></span>
              <span>Nitro <strong data-finish-nitro>--</strong></span>
            </div>
            <button class="finish-action" type="button" data-restart-race>Race Again</button>
            <p class="finish-controls"><kbd>R</kbd><span>or</span><kbd>Cross</kbd><kbd>OPTIONS</kbd><span>でリスタート</span></p>
          </div>
        </section>
        <div class="asset-status" data-assets>loading local assets...</div>
      </main>
    `;

    this.gameShell = this.root.querySelector('.game-shell');
    this.viewport = this.root.querySelector('[data-viewport]');
    this.hud = {
      speed: [...this.root.querySelectorAll('[data-speed]')],
      lap: [...this.root.querySelectorAll('[data-lap]')],
      current: [...this.root.querySelectorAll('[data-current]')],
      best: [...this.root.querySelectorAll('[data-best]')],
      nitro: [...this.root.querySelectorAll('[data-nitro]')],
      speedMeters: [...this.root.querySelectorAll('[data-speed-meter]')],
      assets: this.root.querySelector('[data-assets]'),
    };
    this.courseMap = {
      root: this.root.querySelector('[data-course-map]'),
      runoff: this.root.querySelector('[data-map-runoff]'),
      road: this.root.querySelector('[data-map-road]'),
      center: this.root.querySelector('[data-map-center]'),
      player: this.root.querySelector('[data-map-player]'),
      opponents: [...this.root.querySelectorAll('[data-map-opponent]')],
    };
    this.positionBoard = {
      number: this.root.querySelector('[data-position-number]'),
      mobileNumber: this.root.querySelector('[data-mobile-position]'),
      list: this.root.querySelector('[data-position-list]'),
    };
    this.startScreen = this.root.querySelector('[data-start-screen]');
    this.countdownScreen = this.root.querySelector('[data-countdown-screen]');
    this.countdownValue = this.root.querySelector('[data-countdown-value]');
    this.pauseScreen = this.root.querySelector('[data-pause-screen]');
    this.pauseButton = this.root.querySelector('[data-pause-toggle]');
    this.finishScreen = this.root.querySelector('[data-finish-screen]');
    this.finishTitle = this.root.querySelector('[data-finish-title]');
    this.finishStats = {
      result: this.root.querySelector('[data-finish-result]'),
      total: this.root.querySelector('[data-finish-total]'),
      best: this.root.querySelector('[data-finish-best]'),
      nitro: this.root.querySelector('[data-finish-nitro]'),
    };
    this.characterComms = {
      root: this.root.querySelector('[data-character-comms]'),
      portrait: this.root.querySelector('[data-character-portrait]'),
      name: this.root.querySelector('[data-character-name]'),
      line: this.root.querySelector('[data-character-line]'),
    };
    this.finishCharacter = {
      root: this.root.querySelector('[data-finish-character]'),
      portrait: this.root.querySelector('[data-finish-character-portrait]'),
      name: this.root.querySelector('[data-finish-character-name]'),
      line: this.root.querySelector('[data-finish-character-line]'),
    };
    this.restartButton = this.root.querySelector('[data-restart-race]');
    this.carPicker = this.root.querySelector('[data-car-picker]');
    this.carChoices = [...this.root.querySelectorAll('[data-car-id]')];
    this.setCarChoicesDisabled(true);
    this.audioToggles = [...this.root.querySelectorAll('[data-audio-toggle]')];
    this.touchButtons = [...this.root.querySelectorAll('[data-touch-control]')];
    this.touchStick = this.root.querySelector('[data-touch-stick]');
    this.touchStickThumb = this.root.querySelector('[data-touch-stick-thumb]');
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.performanceSettings.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.performanceSettings.pixelRatioCap));
    this.renderer.shadowMap.enabled = this.performanceSettings.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.viewport.appendChild(this.renderer.domElement);
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb29a76);
    this.scene.fog = new THREE.Fog(0xb29a76, 190, 470);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 420);
    this.camera.position.set(0, 36, -34);

    const hemisphere = new THREE.HemisphereLight(0xffecd0, 0x6a5237, 1.48);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffe7ba, 2.55);
    sun.position.set(-38, 72, -46);
    sun.castShadow = this.performanceSettings.shadowsEnabled;
    sun.shadow.mapSize.set(this.performanceSettings.shadowMapSize, this.performanceSettings.shadowMapSize);
    sun.shadow.camera.left = -285;
    sun.shadow.camera.right = 285;
    sun.shadow.camera.top = 245;
    sun.shadow.camera.bottom = -510;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 300;
    this.scene.add(sun);

    this.smokeTexture = createSmokeTexture();
    this.sandWispTexture = createSandWispTexture();
  }

  createBgmPlayer() {
    if (this.bgmAudio || ASSETS.audio.bgm.length === 0) return;

    this.bgmAudio = new Audio();
    this.bgmAudio.preload = 'auto';
    this.bgmAudio.volume = 0.34;
    this.bgmAudio.addEventListener('ended', () => this.playNextBgmTrack());
    this.bgmAudio.addEventListener('error', () => this.playNextBgmTrack());
  }

  startBgm() {
    this.bgmEnabled = true;
    this.sfx.setEnabled(true);
    this.updateAudioToggle();

    if (ASSETS.audio.bgm.length === 0) return;

    this.createBgmPlayer();
    this.bgmIndex = randomBgmIndex(this.bgmIndex);
    this.playCurrentBgmTrack();
  }

  playCurrentBgmTrack() {
    if (!this.bgmAudio || !this.bgmEnabled) return;

    const track = ASSETS.audio.bgm[this.bgmIndex % ASSETS.audio.bgm.length];
    if (this.bgmAudio.dataset.path !== track.path) {
      this.bgmAudio.src = track.path;
      this.bgmAudio.dataset.path = track.path;
    }

    this.bgmAudio.play().catch(() => {
      this.bgmEnabled = false;
      this.sfx.setEnabled(false);
      this.updateAudioToggle();
    });
  }

  playNextBgmTrack() {
    if (!this.bgmEnabled || ASSETS.audio.bgm.length === 0) return;

    this.bgmIndex = randomBgmIndex(this.bgmIndex);
    this.playCurrentBgmTrack();
  }

  toggleBgm() {
    if (this.bgmEnabled) {
      this.bgmEnabled = false;
      this.bgmAudio?.pause();
      this.sfx.setEnabled(false);
      this.updateAudioToggle();
      this.sfx.playOneShot('uiClick', 0.28, { force: true });
      return;
    }

    this.startBgm();
    this.sfx.playOneShot('uiClick', 0.34, { force: true });
  }

  updateAudioToggle() {
    if (!this.audioToggles?.length) return;

    this.audioToggles.forEach((audioToggle) => {
      audioToggle.classList.toggle('is-muted', !this.bgmEnabled);
      audioToggle.setAttribute('aria-label', this.bgmEnabled ? 'Turn audio off' : 'Turn audio on');
    });
  }

  createVehicles() {
    this.playerRoot = new THREE.Group();
    this.playerVisual = createFallbackCar(0x2d8cff, 0x172235);
    this.playerRoot.add(this.playerVisual);
    this.playerRoot.visible = false;
    this.scene.add(this.playerRoot);

    this.opponentRoots = [];
    this.opponentVisuals = [];
    for (let i = 0; i < OPPONENT_COUNT; i += 1) {
      const root = new THREE.Group();
      const colors = OPPONENT_FALLBACK_COLORS[i % OPPONENT_FALLBACK_COLORS.length];
      const visual = createFallbackCar(colors.body, colors.accent);
      root.add(visual);
      root.visible = false;
      this.scene.add(root);
      this.opponentRoots.push(root);
      this.opponentVisuals.push(visual);
    }
  }

  setVehiclesVisible(visible) {
    if (this.playerRoot) this.playerRoot.visible = visible;
    this.opponentRoots?.forEach((root) => {
      root.visible = visible;
    });
  }

  getGroundY(x, z) {
    return this.track?.getGroundHeight(x, z) ?? 0;
  }

  getAmbientGroundY(x, z) {
    return this.track?.getAmbientGroundHeight(x, z) ?? this.getGroundY(x, z);
  }

  getSurfaceY(x, z) {
    return this.track?.getSurfaceHeight(x, z) ?? 0;
  }

  setCarChoicesDisabled(disabled) {
    this.carChoices?.forEach((button) => {
      button.disabled = disabled;
      if (disabled) button.classList.remove('is-controller-focus');
    });
    this.carPicker?.classList.toggle('is-disabled', disabled);
  }

  focusCarChoice(index) {
    const choices = this.carChoices ?? [];
    if (choices.length === 0) return;

    const normalizedIndex = THREE.MathUtils.euclideanModulo(index, choices.length);
    this.gamepadInput.selectionIndex = normalizedIndex;
    choices.forEach((button, choiceIndex) => {
      const isFocused = choiceIndex === normalizedIndex
        && !this.vehicleSelectionLocked
        && !this.raceStarted
        && !this.countdown.active;
      button.classList.toggle('is-controller-focus', isFocused);
    });
  }

  moveFocusedCarChoice(direction) {
    if (this.vehicleSelectionLocked || this.raceStarted || this.raceFinished || this.countdown.active) return;
    this.focusCarChoice(this.gamepadInput.selectionIndex + direction);
    this.sfx.playOneShot('uiClick', 0.18, { playbackRate: 1.08 });
  }

  selectFocusedCarChoice() {
    if (this.vehicleSelectionLocked || this.raceStarted || this.raceFinished || this.countdown.active) return;

    const vehicle = ASSETS.models.vehicles[this.gamepadInput.selectionIndex];
    if (vehicle) {
      this.selectVehicle(vehicle);
    }
  }

  async loadVehicleModel(vehicle, vehicleRoot, kind, options = {}) {
    const path = vehicle?.path ?? vehicle;
    const label = vehicle?.name ?? path;
    const messageLabel = options.label ?? kind;

    try {
      const gltfScene = await loadGltfScene(path);
      const model = prepareLoadedCar(gltfScene);

      if (kind === 'player') {
        this.playerVisual = replaceVehicleVisual(vehicleRoot, this.playerVisual, model);
      } else {
        const opponentIndex = options.index ?? 0;
        this.opponentVisuals[opponentIndex] = replaceVehicleVisual(
          vehicleRoot,
          this.opponentVisuals[opponentIndex],
          model,
        );
      }

      this.assetMessages.push(`${messageLabel}: ${label}`);
    } catch {
      this.assetMessages.push(`${messageLabel}: fallback box model`);
    }
    this.updateAssetStatus();
  }

  async loadTumbleweedModel() {
    const asset = ASSETS.models.tumbleweed;

    try {
      const gltfScene = await loadGltfScene(asset.path);
      this.tumbleweedPrototype = prepareTumbleweedVisual(gltfScene);
      this.assetMessages.push(`tumbleweed: ${asset.name}`);
    } catch {
      this.tumbleweedPrototype = createFallbackTumbleweedVisual();
      this.assetMessages.push('tumbleweed: fallback brush model');
    }

    this.updateAssetStatus();
  }

  async loadBackgroundScenery() {
    const sceneryAssets = ASSETS.models.scenery ?? [];
    if (sceneryAssets.length === 0) return;

    const loadedAssets = await Promise.all(sceneryAssets.map(async (asset) => {
      try {
        return [asset.id, await loadGltfScene(asset.path)];
      } catch {
        return null;
      }
    }));
    const prototypesById = new Map(
      loadedAssets
        .filter(Boolean)
        .map(([id, model]) => [id, prepareStaticSceneryPrototype(model)]),
    );
    const fixedPlacements = BACKGROUND_SCENERY_PLACEMENTS
      .filter((_, index) => index % this.performanceSettings.fixedSceneryStep === 0);
    const placements = [
      ...fixedPlacements,
      ...this.createCourseSceneryPlacements(),
    ];
    const root = new THREE.Group();
    root.name = 'background-scenery';

    let added = 0;
    for (const placement of placements) {
      const prototype = prototypesById.get(placement.modelId);
      if (!prototype || this.track?.isOnRoad(placement.x, placement.z)) continue;

      const visual = prototype.clone(true);
      visual.scale.setScalar(placement.height / prototype.userData.sourceHeight);
      const anchor = new THREE.Group();
      anchor.position.set(placement.x, this.getGroundY(placement.x, placement.z), placement.z);
      anchor.rotation.set(0, placement.rotation, 0);
      anchor.add(visual);
      root.add(anchor);
      added += 1;
    }

    if (added > 0) {
      this.backgroundSceneryRoot = root;
      this.scene.add(root);
      this.assetMessages.push(`scenery: ${added} GLB objects (${prototypesById.size}/${sceneryAssets.length} models)`);
    } else {
      this.assetMessages.push('scenery: unavailable');
    }

    this.updateAssetStatus();
  }

  createCourseSceneryPlacements() {
    if (!this.track) return [];

    const random = createSeededRandom(0x6561676c);
    const placements = [];
    const roadEdgeDistance = TRACK.roadWidth / 2 + TRACK.shoulderWidth;

    const sceneryCount = Math.min(COURSE_SCENERY_COUNT, this.performanceSettings.courseSceneryCount);
    for (let i = 0; i < sceneryCount; i += 1) {
      const model = COURSE_SCENERY_MODELS[i % COURSE_SCENERY_MODELS.length];
      const side = i % 4 < 2 ? 1 : -1;
      const progress = THREE.MathUtils.euclideanModulo((i + randomRange(random, -0.18, 0.18)) / sceneryCount, 1);
      const pose = this.getTrackPose(progress);
      const distance = roadEdgeDistance + randomRange(random, model.minOffset, model.maxOffset);
      const tangentOffset = randomRange(random, -model.tangentJitter, model.tangentJitter);
      const point = pose.point
        .clone()
        .addScaledVector(pose.normal, side * distance)
        .addScaledVector(pose.tangent, tangentOffset);

      placements.push({
        modelId: model.modelId,
        x: point.x,
        z: point.z,
        height: randomRange(random, model.minHeight, model.maxHeight),
        rotation: pose.heading + randomRange(random, -1.35, 1.35),
      });
    }

    return placements;
  }

  pickOpponentVehicles(selectedVehicle) {
    const alternatives = ASSETS.models.vehicles.filter((vehicle) => vehicle.id !== selectedVehicle.id);
    const pool = alternatives.length > 0 ? alternatives : ASSETS.models.vehicles;
    const startIndex = Math.floor(Math.random() * pool.length);
    return Array.from({ length: OPPONENT_COUNT }, (_, index) => pool[(startIndex + index) % pool.length]);
  }

  getPlayerStartPose() {
    if (!this.track) {
      return {
        x: PLAYER_START.x,
        y: this.getSurfaceY(PLAYER_START.x, PLAYER_START.z),
        z: PLAYER_START.z,
        heading: PLAYER_START.heading,
        progress: this.track?.getProgress(PLAYER_START.x, PLAYER_START.z) ?? 0,
        unwrappedProgress: 0,
      };
    }

    const pose = this.getTrackPose(PLAYER_GRID_PROGRESS);
    const point = pose.point.clone().addScaledVector(pose.normal, PLAYER_GRID_LINE_OFFSET);
    point.y = this.getSurfaceY(point.x, point.z);

    return {
      x: point.x,
      y: point.y,
      z: point.z,
      heading: pose.heading,
      progress: this.track.getProgress(point.x, point.z),
      unwrappedProgress: PLAYER_GRID_PROGRESS,
    };
  }

  setRaceClockStart(now = performance.now()) {
    if (!this.player) return;

    this.player.raceStartedAt = now;
    this.player.lapStartedAt = now;
    this.player.finishedAt = null;
    this.player.previousForwardSpeed = 0;
  }

  startRaceCountdown() {
    const now = performance.now();
    this.prepareRaceCharacter();
    this.raceStarted = false;
    this.raceFinished = false;
    this.gameShell?.classList.add('is-race-interface-active');
    this.countdown.active = true;
    this.countdown.released = false;
    this.countdown.startedAt = now;
    this.countdown.label = '';
    this.countdownScreen?.classList.remove('is-hidden');
    this.updatePauseButtonState();
    this.updateCountdown(now);
    this.clock.getDelta();
  }

  releaseCountdownRace(now = performance.now()) {
    if (this.countdown.released) return;

    this.countdown.released = true;
    this.raceStarted = true;
    this.setRaceClockStart(now);
    this.updatePauseButtonState();
    this.sfx.playOneShot('checkpointBell', 0.58, { force: true, playbackRate: 1.08 });
    this.clock.getDelta();
  }

  finishCountdown() {
    this.countdown.active = false;
    this.countdownScreen?.classList.add('is-hidden');
  }

  updateCountdown(now = performance.now()) {
    if (!this.countdown.active) return;

    const elapsed = (now - this.countdown.startedAt) / 1000;
    let label = 'GO';

    if (elapsed < COUNTDOWN_SECONDS) {
      label = String(Math.ceil(COUNTDOWN_SECONDS - elapsed));
    } else {
      this.releaseCountdownRace(now);
      if (elapsed >= COUNTDOWN_SECONDS + COUNTDOWN_GO_DISPLAY_SECONDS) {
        this.finishCountdown();
      }
    }

    if (label !== this.countdown.label && this.countdownValue) {
      this.countdown.label = label;
      this.countdownValue.textContent = label;
      this.countdownValue.classList.toggle('is-go', label === 'GO');
      if (label === '1') {
        this.showCharacterDialogue('ready', {
          force: true,
          duration: 2.2,
        });
      }
    }
  }

  canTogglePause() {
    return this.raceStarted || this.countdown.active || this.paused.active;
  }

  setPausedState(active) {
    this.paused.active = active;
    this.pauseScreen?.classList.toggle('is-hidden', !active);
    this.pauseButton?.classList.toggle('is-paused', active);
    this.pauseButton?.setAttribute('aria-label', active ? 'Resume game' : 'Pause game');
    this.gameShell?.classList.toggle('is-paused', active);
    if (active) this.clearTouchControls();
    this.updatePauseButtonState();
  }

  updatePauseButtonState() {
    const available = this.raceStarted || this.countdown.active || this.paused.active;
    this.pauseButton?.classList.toggle('is-available', available);
  }

  pauseRace() {
    if (!this.canTogglePause() || this.paused.active) return;

    this.paused.startedAt = performance.now();
    this.setPausedState(true);
    this.sfx.pauseLoops();
  }

  resumeRace() {
    if (!this.paused.active) return;

    const now = performance.now();
    const pausedDuration = now - this.paused.startedAt;
    if (this.countdown.active) {
      this.countdown.startedAt += pausedDuration;
    }
    if (this.raceStarted && this.player) {
      this.player.raceStartedAt += pausedDuration;
      this.player.lapStartedAt += pausedDuration;
    }

    this.setPausedState(false);
    this.clock.getDelta();
  }

  togglePause() {
    if (this.paused.active) {
      this.resumeRace();
    } else {
      this.pauseRace();
    }
  }

  restartRace() {
    if (!this.raceStarted && !this.raceFinished && !this.countdown.active) return;

    this.reset();
    this.setVehiclesVisible(true);
    this.startRaceCountdown();
  }

  getActiveGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

    const gamepads = Array.from(navigator.getGamepads());
    const currentGamepad = this.gamepadInput.index !== null ? gamepads[this.gamepadInput.index] : null;
    if (currentGamepad?.connected) return currentGamepad;

    return gamepads.find((gamepad) => gamepad?.connected && (
      gamepad.mapping === 'standard'
      || /dualsense|dualshock|wireless controller|playstation|ps5/i.test(gamepad.id)
    )) ?? gamepads.find((gamepad) => gamepad?.connected) ?? null;
  }

  isGamepadButtonPressed(buttonIndex) {
    return Boolean(this.gamepadInput.buttons.get(buttonIndex))
      && !this.gamepadInput.previousButtons.get(buttonIndex);
  }

  updateGamepadInput() {
    const gamepad = this.getActiveGamepad();
    this.gamepadInput.previousButtons = this.gamepadInput.buttons;
    this.gamepadInput.buttons = new Map();
    this.gamepadInput.steer = 0;
    this.gamepadInput.throttle = 0;
    this.gamepadInput.brake = 0;
    this.gamepadInput.nitro = false;

    if (!gamepad) {
      this.gamepadInput.index = null;
      this.gamepadInput.menuAxis = 0;
      return;
    }

    this.gamepadInput.index = gamepad.index;
    Array.from(gamepad.buttons).forEach((_, index) => {
      this.gamepadInput.buttons.set(index, gamepadButtonValue(gamepad, index) > GAMEPAD_BUTTON_THRESHOLD);
    });

    const stickX = applyGamepadDeadzone(gamepad.axes?.[0] ?? 0);
    const dpadSteer = (this.gamepadInput.buttons.get(GAMEPAD_BUTTON.dpadLeft) ? 1 : 0)
      + (this.gamepadInput.buttons.get(GAMEPAD_BUTTON.dpadRight) ? -1 : 0);
    this.gamepadInput.steer = dpadSteer || -stickX;
    this.gamepadInput.throttle = Math.max(
      gamepadButtonValue(gamepad, GAMEPAD_BUTTON.r2),
      gamepadButtonValue(gamepad, GAMEPAD_BUTTON.cross),
    );
    this.gamepadInput.brake = Math.max(
      gamepadButtonValue(gamepad, GAMEPAD_BUTTON.l2),
      gamepadButtonValue(gamepad, GAMEPAD_BUTTON.circle),
      gamepadButtonValue(gamepad, GAMEPAD_BUTTON.square),
    );
    this.gamepadInput.nitro = gamepadButtonValue(gamepad, GAMEPAD_BUTTON.r1) > GAMEPAD_BUTTON_THRESHOLD
      || gamepadButtonValue(gamepad, GAMEPAD_BUTTON.triangle) > GAMEPAD_BUTTON_THRESHOLD;

    if (this.canTogglePause() && this.isGamepadButtonPressed(GAMEPAD_BUTTON.options)) {
      this.togglePause();
      return;
    }

    this.handleGamepadMenuActions(stickX);
  }

  handleGamepadMenuActions(stickX) {
    if (this.raceFinished) {
      if (
        this.isGamepadButtonPressed(GAMEPAD_BUTTON.cross)
        || this.isGamepadButtonPressed(GAMEPAD_BUTTON.options)
      ) {
        this.restartRace();
      }
      return;
    }

    if (this.raceStarted || this.vehicleSelectionLocked || this.countdown.active) return;

    const dpadDirection = (this.gamepadInput.buttons.get(GAMEPAD_BUTTON.dpadRight) ? 1 : 0)
      + (this.gamepadInput.buttons.get(GAMEPAD_BUTTON.dpadLeft) ? -1 : 0);
    const stickDirection = Math.abs(stickX) > 0.62 ? Math.sign(stickX) : 0;
    const menuDirection = dpadDirection || stickDirection;
    if (menuDirection !== 0 && menuDirection !== this.gamepadInput.menuAxis) {
      this.moveFocusedCarChoice(menuDirection);
    }
    this.gamepadInput.menuAxis = menuDirection;

    if (this.isGamepadButtonPressed(GAMEPAD_BUTTON.cross)) {
      this.selectFocusedCarChoice();
    }
  }

  isTouchControlActive(control) {
    return (this.touchInput.activeControls.get(control)?.size ?? 0) > 0;
  }

  syncTouchInputState() {
    const buttonSteer = (this.isTouchControlActive('steer-left') ? 1 : 0)
      + (this.isTouchControlActive('steer-right') ? -1 : 0);
    this.touchInput.steer = this.touchInput.stickPointerId === null
      ? buttonSteer
      : this.touchInput.stickValue;
    this.touchInput.throttle = this.isTouchControlActive('throttle');
    this.touchInput.brake = this.isTouchControlActive('brake');
    this.touchInput.nitro = this.isTouchControlActive('nitro');
    this.touchStickThumb?.style.setProperty('--stick-x', `${this.touchInput.stickOffset.toFixed(1)}px`);
    this.touchButtons?.forEach((button) => {
      button.classList.toggle('is-pressed', this.isTouchControlActive(button.dataset.touchControl));
    });
  }

  updateTouchStick(event) {
    if (!this.touchStick) return;

    const rect = this.touchStick.getBoundingClientRect();
    const maxOffset = Math.max(1, rect.width * 0.24);
    const centerX = rect.left + rect.width / 2;
    const offset = THREE.MathUtils.clamp(event.clientX - centerX, -maxOffset, maxOffset);
    this.touchInput.stickOffset = offset;
    this.touchInput.stickValue = -offset / maxOffset;
    this.syncTouchInputState();
  }

  clearTouchStick() {
    this.touchInput.stickPointerId = null;
    this.touchInput.stickValue = 0;
    this.touchInput.stickOffset = 0;
    this.syncTouchInputState();
  }

  setTouchControl(control, pointerId, active) {
    if (active) {
      if (!this.touchInput.activeControls.has(control)) {
        this.touchInput.activeControls.set(control, new Set());
      }
      this.touchInput.activeControls.get(control).add(pointerId);
    } else {
      this.touchInput.activeControls.get(control)?.delete(pointerId);
      if (this.touchInput.activeControls.get(control)?.size === 0) {
        this.touchInput.activeControls.delete(control);
      }
    }

    this.syncTouchInputState();
  }

  clearTouchPointer(pointerId) {
    this.touchInput.activeControls.forEach((pointers, control) => {
      pointers.delete(pointerId);
      if (pointers.size === 0) {
        this.touchInput.activeControls.delete(control);
      }
    });
    this.syncTouchInputState();
  }

  clearTouchControls() {
    this.touchInput.activeControls.clear();
    this.clearTouchStick();
  }

  getPlayerInput() {
    const keyboardSteer = (this.keys.get('arrowleft') || this.keys.get('a') ? 1 : 0)
      + (this.keys.get('arrowright') || this.keys.get('d') ? -1 : 0);
    const throttleAmount = Math.max(
      this.keys.get('arrowup') || this.keys.get('w') ? 1 : 0,
      this.gamepadInput.throttle > GAMEPAD_TRIGGER_THRESHOLD ? this.gamepadInput.throttle : 0,
      this.touchInput.throttle ? 1 : 0,
    );
    const brakeAmount = Math.max(
      this.keys.get('arrowdown') || this.keys.get('s') ? 1 : 0,
      this.gamepadInput.brake > GAMEPAD_TRIGGER_THRESHOLD ? this.gamepadInput.brake : 0,
      this.touchInput.brake ? 1 : 0,
    );

    return {
      forward: throttleAmount > GAMEPAD_TRIGGER_THRESHOLD,
      backward: brakeAmount > GAMEPAD_TRIGGER_THRESHOLD,
      throttleAmount,
      brakeAmount,
      steer: THREE.MathUtils.clamp(keyboardSteer + this.gamepadInput.steer + this.touchInput.steer, -1, 1),
      nitroHeld: Boolean(this.keys.get('space') || this.gamepadInput.nitro || this.touchInput.nitro),
    };
  }

  async selectVehicle(vehicle) {
    if (this.vehicleSelectionLocked) return;

    this.vehicleSelectionLocked = true;
    const requestId = ++this.vehicleLoadRequest;
    this.selectedVehicle = vehicle;
    const selectedIndex = ASSETS.models.vehicles.findIndex((candidate) => candidate.id === vehicle.id);
    if (selectedIndex >= 0) this.gamepadInput.selectionIndex = selectedIndex;
    this.opponentVehicles = this.pickOpponentVehicles(vehicle);
    this.raceStarted = false;
    this.sfx.playOneShot('uiClick', 0.38, { force: true });
    this.startBgm();
    this.assetMessages = this.assetMessages.filter((message) => (
      !message.startsWith('player:') && !message.startsWith('opponent')
    ));
    this.updateAssetStatus();

    this.startScreen?.classList.add('start-screen--loading');
    this.setCarChoicesDisabled(true);
    this.carChoices?.forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.carId === vehicle.id);
    });

    await Promise.all([
      this.loadVehicleModel(vehicle, this.playerRoot, 'player'),
      ...this.opponentVehicles.map((opponentVehicle, index) => (
        this.loadVehicleModel(opponentVehicle, this.opponentRoots[index], 'opponent', {
          index,
          label: `opponent ${index + 1}`,
        })
      )),
    ]);

    if (requestId !== this.vehicleLoadRequest) return;

    this.reset();
    this.setVehiclesVisible(true);
    this.startScreen?.classList.add('is-hidden');
    this.startRaceCountdown();
  }

  bindEvents() {
    this.onAudioToggle = () => this.toggleBgm();

    this.onVehiclePick = (event) => {
      const button = event.target.closest('[data-car-id]');
      if (!button || button.disabled) return;

      const vehicle = ASSETS.models.vehicles.find((candidate) => candidate.id === button.dataset.carId);
      if (vehicle) {
        this.selectVehicle(vehicle);
      }
    };

    this.onKeyDown = (event) => {
      const key = normalizeInputKey(event);
      this.keys.set(key, true);

      if (!this.raceStarted && !this.raceFinished && !this.countdown.active && /^[1-9]$/.test(key)) {
        const vehicle = ASSETS.models.vehicles[Number(key) - 1];
        if (vehicle) {
          event.preventDefault();
          this.selectVehicle(vehicle);
        }
        return;
      }

      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(key)) {
        event.preventDefault();
      }
      if ((key === 'p' || key === 'escape') && this.canTogglePause()) {
        event.preventDefault();
        this.togglePause();
        return;
      }
      if (key === 'r' && (this.raceStarted || this.raceFinished || this.countdown.active)) {
        event.preventDefault();
        this.restartRace();
      }
    };

    this.onKeyUp = (event) => {
      this.keys.set(normalizeInputKey(event), false);
    };

    this.onRestartRace = () => this.restartRace();
    this.onPauseToggle = () => this.togglePause();
    this.onTouchControlPointerDown = (event) => {
      const control = event.currentTarget.dataset.touchControl;
      if (!control) return;

      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional; the control state still updates without it.
      }
      this.setTouchControl(control, event.pointerId, true);
    };
    this.onTouchControlPointerUp = (event) => {
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already be released by the browser.
      }
      this.clearTouchPointer(event.pointerId);
    };
    this.onTouchStickPointerDown = (event) => {
      event.preventDefault();
      this.touchInput.stickPointerId = event.pointerId;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional; move events still update while over the stick.
      }
      this.updateTouchStick(event);
    };
    this.onTouchStickPointerMove = (event) => {
      if (this.touchInput.stickPointerId !== event.pointerId) return;
      event.preventDefault();
      this.updateTouchStick(event);
    };
    this.onTouchStickPointerUp = (event) => {
      if (this.touchInput.stickPointerId !== event.pointerId) return;
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // The pointer may already be released by the browser.
      }
      this.clearTouchStick();
    };
    this.onGamepadConnected = (event) => {
      this.gamepadInput.index = event.gamepad.index;
    };
    this.onGamepadDisconnected = (event) => {
      if (this.gamepadInput.index === event.gamepad.index) {
        this.gamepadInput.index = null;
        this.gamepadInput.buttons = new Map();
        this.gamepadInput.previousButtons = new Map();
      }
    };
    this.onResize = () => this.resize();
    this.audioToggles?.forEach((audioToggle) => audioToggle.addEventListener('click', this.onAudioToggle));
    this.carPicker?.addEventListener('click', this.onVehiclePick);
    this.restartButton?.addEventListener('click', this.onRestartRace);
    this.pauseButton?.addEventListener('click', this.onPauseToggle);
    this.touchButtons?.forEach((button) => {
      button.addEventListener('pointerdown', this.onTouchControlPointerDown);
      button.addEventListener('pointerup', this.onTouchControlPointerUp);
      button.addEventListener('pointercancel', this.onTouchControlPointerUp);
      button.addEventListener('lostpointercapture', this.onTouchControlPointerUp);
    });
    this.touchStick?.addEventListener('pointerdown', this.onTouchStickPointerDown);
    this.touchStick?.addEventListener('pointermove', this.onTouchStickPointerMove);
    this.touchStick?.addEventListener('pointerup', this.onTouchStickPointerUp);
    this.touchStick?.addEventListener('pointercancel', this.onTouchStickPointerUp);
    this.touchStick?.addEventListener('lostpointercapture', this.onTouchStickPointerUp);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    window.addEventListener('resize', this.onResize);
  }

  reset() {
    const now = performance.now();
    const startPose = this.getPlayerStartPose();
    this.clearSmoke();
    this.clearSandWisps();
    this.clearTumbleweeds();
    this.tumbleweedSpawnTimer = TUMBLEWEED_INITIAL_DELAY;
    this.countdown.active = false;
    this.countdown.released = false;
    this.countdown.label = '';
    this.paused.active = false;
    this.paused.startedAt = 0;
    this.clearTouchControls();
    this.gameShell?.classList.remove('is-race-interface-active', 'is-paused');
    this.raceFinished = false;
    this.lastRaceResult = null;
    this.hideCharacterDialogue();
    this.resetCharacterDialogueState();
    this.countdownScreen?.classList.add('is-hidden');
    this.pauseScreen?.classList.add('is-hidden');
    this.pauseButton?.classList.remove('is-paused');
    this.pauseButton?.classList.remove('is-available');
    this.pauseButton?.setAttribute('aria-label', 'Pause game');
    this.finishScreen?.classList.add('is-hidden');

    this.player = {
      x: startPose.x,
      y: startPose.y,
      z: startPose.z,
      heading: startPose.heading,
      vx: 0,
      vz: 0,
      speed: 0,
      loadTransfer: 0,
      rearSlip: 0,
      nitro: 1,
      nitroActive: false,
      raceStartedAt: now,
      finishedAt: null,
      previousForwardSpeed: 0,
      laps: 0,
      lapStartedAt: now,
      bestLap: Number.NaN,
      lastProgress: startPose.progress,
      unwrappedProgress: startPose.unwrappedProgress,
      lapMark: 0,
      surface: 'road',
      slipstream: 0,
    };
    this.opponents = OPPONENT_STARTS.map((start, index) => ({
      ...start,
      index,
      name: OPPONENT_NAMES[index] ?? `RIVAL ${index + 1}`,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vz: 0,
      lineOffset: 0,
      turnSide: 1,
      characterId: null,
      lastProgress: start.progress,
      unwrappedProgress: start.progress,
      recovering: false,
      recoveryTime: 0,
      hitCooldown: 0,
    }));
    this.drivingAudio.throttleHeld = false;

    this.playerRoot?.position.set(this.player.x, this.player.y, this.player.z);
    if (this.playerRoot) {
      this.playerRoot.rotation.y = this.player.heading;
    }

    this.opponents.forEach((opponent) => this.resetOpponentPosition(opponent));

    if (this.camera) {
      this.updateCamera(1);
    }

    this.updateHud();
    this.updateCourseMap();
  }

  resetOpponentPosition(opponent) {
    const root = this.opponentRoots?.[opponent.index];
    if (!root || !this.track) return;

    const target = this.getOpponentTrackTarget(opponent, 0);
    opponent.x = target.point.x;
    opponent.y = target.point.y;
    opponent.z = target.point.z;
    opponent.vx = 0;
    opponent.vz = 0;
    opponent.recovering = false;
    opponent.recoveryTime = 0;
    opponent.hitCooldown = 0;
    root.position.set(opponent.x, opponent.y, opponent.z);
    root.rotation.y = target.heading;
  }

  updatePlayer(delta) {
    const {
      forward,
      backward,
      throttleAmount,
      brakeAmount,
      steer,
      nitroHeld,
    } = this.getPlayerInput();
    const surfaceInfo = this.track.getSurfaceInfo(this.player.x, this.player.z);
    const roadSurfaceLimit = TRACK.roadWidth / 2 + TRACK.shoulderWidth;
    const desertDepth = Math.max(0, surfaceInfo.distance - roadSurfaceLimit);
    const desertDepthFactor = smoothStep(0, DESERT_DEPTH_FOR_FULL_SLOWDOWN, desertDepth);
    const surface = surfaceInfo.surface === 'road'
      || (this.player.surface === 'road' && surfaceInfo.distance <= roadSurfaceLimit + ROAD_SURFACE_RELEASE_MARGIN)
      ? 'road'
      : 'desert';
    this.player.surface = surface;
    const onRoad = surface === 'road';

    const headingSin = Math.sin(this.player.heading);
    const headingCos = Math.cos(this.player.heading);
    const rightX = headingCos;
    const rightZ = -headingSin;
    const forwardSpeed = this.player.vx * headingSin + this.player.vz * headingCos;
    const lateralSpeed = this.player.vx * rightX + this.player.vz * rightZ;
    const braking = backward && forwardSpeed > 1.2;
    const reversing = backward && forwardSpeed <= 1.2;
    const nitroActive = Boolean(nitroHeld && !backward && this.player.nitro > 0);
    const throttleAccel = onRoad ? 25 : THREE.MathUtils.lerp(12, 7, desertDepthFactor);
    const nitroAccel = onRoad ? NITRO_ACCEL : THREE.MathUtils.lerp(26, 18, desertDepthFactor);
    const brakeAccel = onRoad ? 52 : THREE.MathUtils.lerp(27, 35, desertDepthFactor);
    const reverseAccel = onRoad ? 15 : 8;
    let driveAccel = 0;

    if (forward) driveAccel += throttleAccel * throttleAmount;
    if (nitroActive) driveAccel += nitroAccel;
    if (braking) driveAccel -= brakeAccel * brakeAmount;
    if (reversing) driveAccel -= reverseAccel * brakeAmount;

    if (nitroActive && !this.player.nitroActive) {
      this.sfx.playOneShot('accelRev', 0.46, { playbackRate: 1.18 });
    }

    this.player.nitro = THREE.MathUtils.clamp(
      this.player.nitro - (nitroActive ? NITRO_DRAIN_RATE : 0) * delta,
      0,
      1,
    );
    this.player.nitroActive = nitroActive;

    this.player.vx += headingSin * driveAccel * delta;
    this.player.vz += headingCos * driveAccel * delta;

    let currentForwardSpeed = this.player.vx * headingSin + this.player.vz * headingCos;
    const slipstreamStrength = this.getSlipstreamStrength({
      progress: surfaceInfo.progress,
      headingSin,
      headingCos,
      rightX,
      rightZ,
      forwardSpeed: currentForwardSpeed,
      onRoad: onRoad && !braking && !reversing,
    });
    this.player.slipstream = slipstreamStrength;

    if (slipstreamStrength > 0 && (forward || nitroActive)) {
      const slipstreamAccel = SLIPSTREAM_ACCEL * slipstreamStrength * delta;
      this.player.vx += headingSin * slipstreamAccel;
      this.player.vz += headingCos * slipstreamAccel;
      currentForwardSpeed = this.player.vx * headingSin + this.player.vz * headingCos;
    }

    const naturalDecel = Math.max(0, this.player.previousForwardSpeed - currentForwardSpeed) / Math.max(delta, 0.001);
    const brakingLoad = braking ? 1 : 0;
    const suddenDecelLoad = THREE.MathUtils.clamp((naturalDecel - 9) / 28, 0, 1);
    const liftOffLoad = !forward && !nitroActive && !backward && currentForwardSpeed > 6
      ? smoothStep(6, 26, currentForwardSpeed) * LIFT_OFF_LOAD_FACTOR
      : 0;
    const loadTarget = Math.max(brakingLoad, suddenDecelLoad, liftOffLoad);
    this.player.loadTransfer = moveToward(this.player.loadTransfer, loadTarget, (loadTarget > this.player.loadTransfer ? 7.2 : 1.8) * delta);

    const speed = Math.hypot(this.player.vx, this.player.vz);
    const accelerationLoad = onRoad && driveAccel > 0 && currentForwardSpeed > 3
      ? smoothStep(3, 24, currentForwardSpeed)
      : 0;
    const driftTarget = onRoad && speed > 8 && this.player.loadTransfer > 0.12
      ? THREE.MathUtils.clamp((this.player.loadTransfer - 0.08) * 1.85 + Math.abs(steer) * 0.55 + Math.abs(lateralSpeed) / 24, 0, 1)
      : 0;
    this.player.rearSlip = moveToward(this.player.rearSlip, driftTarget, (driftTarget > this.player.rearSlip ? 7.2 : 1.55) * delta);

    const driveableGrip = ROAD_GRIP;
    const grip = onRoad
      ? THREE.MathUtils.lerp(driveableGrip, DRIFT_GRIP, this.player.rearSlip)
      : THREE.MathUtils.lerp(DESERT_EDGE_GRIP, DESERT_DEEP_GRIP, desertDepthFactor);
    const dampedLateralSpeed = lateralSpeed * Math.exp(-grip * delta);
    const roadForwardDrag = (!forward && !nitroActive && !backward)
      ? ROAD_COAST_DRAG
      : ROAD_THROTTLE_DRAG;
    const baseForwardDrag = onRoad ? roadForwardDrag : THREE.MathUtils.lerp(DESERT_EDGE_DRAG, DESERT_DEEP_DRAG, desertDepthFactor);
    const forwardDrag = baseForwardDrag * (1 - SLIPSTREAM_DRAG_REDUCTION * slipstreamStrength);
    const dampedForwardSpeed = currentForwardSpeed * Math.exp(-forwardDrag * delta);
    const nitroSpeedBoost = nitroActive
      ? THREE.MathUtils.lerp(NITRO_MAX_SPEED_BOOST, NITRO_MAX_SPEED_BOOST * 0.42, desertDepthFactor)
      : 0;
    const maxForward = (onRoad ? PLAYER_ROAD_MAX_SPEED : THREE.MathUtils.lerp(DESERT_EDGE_MAX_SPEED, DESERT_DEEP_MAX_SPEED, desertDepthFactor))
      + nitroSpeedBoost
      + SLIPSTREAM_MAX_SPEED_BOOST * slipstreamStrength;
    const maxReverse = onRoad ? -13 : -7;
    const clampedForwardSpeed = THREE.MathUtils.clamp(dampedForwardSpeed, maxReverse, maxForward);

    this.player.vx = headingSin * clampedForwardSpeed + rightX * dampedLateralSpeed;
    this.player.vz = headingCos * clampedForwardSpeed + rightZ * dampedLateralSpeed;

    const direction = clampedForwardSpeed >= 0 ? 1 : -1;
    const steerScale = THREE.MathUtils.clamp(Math.abs(clampedForwardSpeed) / 20, 0.12, 1);
    const loadSteerFactor = onRoad
      ? THREE.MathUtils.clamp(
        (1 - accelerationLoad * THROTTLE_UNDERSTEER_STRENGTH)
        * (1 + this.player.loadTransfer * DECEL_TURN_IN_STRENGTH),
        0.28,
        1.82,
      )
      : 1;
    const baseYaw = 1.9 * steerScale * loadSteerFactor * direction;
    const oldHeading = this.player.heading;
    const driftYaw = this.player.rearSlip
      * (braking ? 2.85 : 1.18)
      * (1 + this.player.loadTransfer * 0.26)
      * steerScale
      * direction;
    this.player.heading += steer * (baseYaw + driftYaw) * delta;

    if (this.player.rearSlip > 0.08 && Math.abs(lateralSpeed) > 1.3) {
      this.player.heading += THREE.MathUtils.clamp(lateralSpeed / 22, -1.08, 1.08) * this.player.rearSlip * delta;
    }

    const headingDelta = this.player.heading - oldHeading;
    if (Math.abs(headingDelta) > 0.0001 && Math.abs(clampedForwardSpeed) > 0.4) {
      const oldForwardX = Math.sin(oldHeading);
      const oldForwardZ = Math.cos(oldHeading);
      const newForwardX = Math.sin(this.player.heading);
      const newForwardZ = Math.cos(this.player.heading);
      const pivotOffset = PLAYER_FRONT_AXLE_OFFSET * PLAYER_FRONT_AXLE_PIVOT_STRENGTH;
      this.player.x += (oldForwardX - newForwardX) * pivotOffset;
      this.player.z += (oldForwardZ - newForwardZ) * pivotOffset;
    }

    this.player.x += this.player.vx * delta;
    this.player.z += this.player.vz * delta;
    this.player.y = this.getSurfaceY(this.player.x, this.player.z);
    this.player.speed = Math.hypot(this.player.vx, this.player.vz);
    this.player.previousForwardSpeed = clampedForwardSpeed;
    this.updateCharacterDrivingDialogue(delta, {
      onRoad,
      nitroActive,
      speed: this.player.speed,
      forwardSpeed: clampedForwardSpeed,
      lateralSpeed,
      turnSeverity: this.estimateTrackTurn(surfaceInfo.progress),
    });
    this.keepInsideWorld();
    const finishedRace = this.updateLapProgress();

    this.playerRoot.position.set(this.player.x, this.player.y, this.player.z);
    this.playerRoot.rotation.y = this.player.heading + THREE.MathUtils.clamp(lateralSpeed / 22, -0.62, 0.62) * this.player.rearSlip;
    const visualPitch = this.player.loadTransfer * VEHICLE_BRAKE_PITCH
      - accelerationLoad * VEHICLE_ACCEL_PITCH;
    const visualRollSpeedScale = smoothStep(3, 22, Math.abs(clampedForwardSpeed));
    const steeringRollInput = Math.sign(steer)
      * smoothStep(VEHICLE_STEER_ROLL_START, 1, Math.abs(steer));
    const steeringRoll = -steeringRollInput * visualRollSpeedScale * VEHICLE_STEER_ROLL;
    this.playerVisual.rotation.x = THREE.MathUtils.clamp(visualPitch, -0.05, 0.16);
    this.playerVisual.rotation.z = THREE.MathUtils.clamp(steeringRoll, -0.035, 0.035);
    if (finishedRace) {
      return;
    }
    this.emitDriftSmoke(delta, lateralSpeed, clampedForwardSpeed, onRoad);
    this.updateDrivingAudio({
      forward,
      nitroActive,
      onRoad,
      lateralSpeed,
      forwardSpeed: clampedForwardSpeed,
      speed: this.player.speed,
      driveAccel,
      desertDepthFactor,
    });
  }

  updateCharacterDrivingDialogue(delta, {
    onRoad,
    nitroActive,
    speed,
    forwardSpeed,
    lateralSpeed,
    turnSeverity,
  }) {
    if (!this.activeCharacter) return;

    if (nitroActive && !this.characterDialogue.nitroWasActive) {
      this.showLimitedRaceDialogue('boost', {
        cooldown: CHARACTER_BOOST_COOLDOWN,
        duration: 2.7,
      });
    }
    this.characterDialogue.nitroWasActive = nitroActive;

    const cornerIsClean = onRoad
      && turnSeverity > 0.075
      && Math.abs(forwardSpeed) > 20
      && Math.abs(lateralSpeed) < 6.2
      && this.player.rearSlip < 0.52;
    if (cornerIsClean) {
      this.characterDialogue.cornerPrimed = true;
    }
    if (this.characterDialogue.cornerPrimed && turnSeverity < 0.045) {
      this.showLimitedRaceDialogue('corner', {
        cooldown: CHARACTER_CORNER_COOLDOWN,
        duration: 2.9,
      });
      this.characterDialogue.cornerPrimed = false;
    }
    if (!onRoad || Math.abs(forwardSpeed) < 10) {
      this.characterDialogue.cornerPrimed = false;
    }

    if (!onRoad) {
      this.characterDialogue.offroadStuckTime += delta;
      if (this.characterDialogue.offroadStuckTime > CHARACTER_STUCK_OFFROAD_SECONDS) {
        const shown = this.showLimitedRaceDialogue('stuckOffroad', {
          duration: 3.2,
        });
        if (shown) this.characterDialogue.offroadStuckTime = 0;
      }
    } else {
      this.characterDialogue.offroadStuckTime = 0;
    }

    if (!onRoad && speed > 20) {
      this.characterDialogue.offroadDangerTime += delta;
      if (this.characterDialogue.offroadDangerTime > 1.05) {
        const shown = this.showLimitedRaceDialogue('danger', {
          cooldown: CHARACTER_DANGER_COOLDOWN,
          duration: 2.9,
        });
        if (shown) this.characterDialogue.offroadDangerTime = 0;
      }
    } else {
      this.characterDialogue.offroadDangerTime = Math.max(0, this.characterDialogue.offroadDangerTime - delta * 1.6);
    }
  }

  updateCharacterRaceDialogue() {
    const characterOpponent = this.getActiveCharacterOpponent();
    if (!this.activeCharacter || !this.player || !characterOpponent) return;

    const playerAhead = this.player.unwrappedProgress > characterOpponent.unwrappedProgress + 0.004;
    if (this.characterDialogue.lastPlayerAhead === null) {
      this.characterDialogue.lastPlayerAhead = playerAhead;
      return;
    }
    if (playerAhead === this.characterDialogue.lastPlayerAhead) return;

    this.characterDialogue.lastPlayerAhead = playerAhead;
    this.showCharacterDialogue(playerAhead ? 'overtaken' : 'overtake', {
      force: true,
      cooldown: CHARACTER_OVERTAKE_COOLDOWN,
      duration: 2.8,
    });
  }

  getSlipstreamStrength({
    progress,
    headingSin,
    headingCos,
    rightX,
    rightZ,
    forwardSpeed,
    onRoad,
  }) {
    if (!onRoad || forwardSpeed < SLIPSTREAM_MIN_SPEED || !this.opponents?.length) return 0;

    const turnSeverity = Math.max(
      this.estimateTrackTurn(progress, 0.012),
      this.estimateTrackTurn(progress + 0.018, 0.012),
    );
    const turnFactor = 1 - smoothStep(SLIPSTREAM_TURN_FADE_START, SLIPSTREAM_TURN_FADE_END, turnSeverity);
    if (turnFactor <= 0) return 0;

    let strongestDraft = 0;
    for (const opponent of this.opponents) {
      if (opponent.recoveryTime > 0) continue;

      const toOpponentX = opponent.x - this.player.x;
      const toOpponentZ = opponent.z - this.player.z;
      const forwardDistance = toOpponentX * headingSin + toOpponentZ * headingCos;
      if (forwardDistance < SLIPSTREAM_MIN_DISTANCE || forwardDistance > SLIPSTREAM_MAX_DISTANCE) continue;

      const lateralDistance = Math.abs(toOpponentX * rightX + toOpponentZ * rightZ);
      if (lateralDistance > SLIPSTREAM_MAX_LATERAL_DISTANCE) continue;

      const opponentHeading = this.opponentRoots?.[opponent.index]?.rotation.y ?? this.getTrackPose(opponent.progress).heading;
      const alignment = headingSin * Math.sin(opponentHeading) + headingCos * Math.cos(opponentHeading);
      if (alignment < SLIPSTREAM_MIN_ALIGNMENT) continue;

      const distanceFactor = smoothStep(SLIPSTREAM_MIN_DISTANCE, SLIPSTREAM_MIN_DISTANCE + 7, forwardDistance)
        * (1 - smoothStep(SLIPSTREAM_MAX_DISTANCE - 10, SLIPSTREAM_MAX_DISTANCE, forwardDistance));
      const lateralFactor = 1 - smoothStep(0, SLIPSTREAM_MAX_LATERAL_DISTANCE, lateralDistance);
      const alignmentFactor = smoothStep(SLIPSTREAM_MIN_ALIGNMENT, 0.96, alignment);
      const speedFactor = smoothStep(SLIPSTREAM_MIN_SPEED, PLAYER_ROAD_MAX_SPEED * 0.72, forwardSpeed);
      strongestDraft = Math.max(
        strongestDraft,
        distanceFactor * lateralFactor * alignmentFactor * speedFactor * turnFactor,
      );
    }

    return THREE.MathUtils.clamp(strongestDraft, 0, 1);
  }

  updateDrivingAudio({ forward, nitroActive, onRoad, lateralSpeed, forwardSpeed, speed, driveAccel, desertDepthFactor }) {
    const speedFactor = smoothStep(0, 42, speed);
    const enginePitchFactor = smoothStep(4, 38, Math.abs(forwardSpeed));
    const throttleAmount = forward && driveAccel > 0 ? 1 : 0;
    const engineVolume = ENGINE_BASE_VOLUME + speedFactor * 0.18 + throttleAmount * 0.12 + (nitroActive ? 0.08 : 0);
    const engineRate = 0.78 + enginePitchFactor * 0.9 + throttleAmount * 0.1 + (nitroActive ? 0.16 : 0);

    this.sfx.setLoop('engineLoop', engineVolume, engineRate);

    const gravelAmount = onRoad
      ? 0
      : smoothStep(1, 12, speed) * THREE.MathUtils.lerp(0.55, 1, desertDepthFactor);
    this.sfx.setLoop('gravelLoop', gravelAmount * 0.32, 0.78 + speedFactor * 0.58);

    const skidAmount = onRoad
      ? this.player.rearSlip
        * smoothStep(1.4, 7, Math.abs(lateralSpeed))
        * smoothStep(8, 18, Math.abs(forwardSpeed))
      : smoothStep(2, 8, Math.abs(lateralSpeed)) * smoothStep(4, 14, Math.abs(forwardSpeed));

    if (skidAmount > 0.22) {
      const amount = THREE.MathUtils.clamp(skidAmount, 0, 1);
      this.sfx.playOneShot('skidDirt', THREE.MathUtils.lerp(0.18, 0.54, amount), {
        cooldown: THREE.MathUtils.lerp(0.34, 0.16, amount),
        playbackRate: THREE.MathUtils.lerp(0.88, 1.18, Math.random()),
      });
    }

    if (forward && !this.drivingAudio.throttleHeld && Math.abs(forwardSpeed) < 10) {
      this.sfx.playOneShot('accelRev', 0.42, {
        cooldown: 0.75,
        playbackRate: 0.96 + Math.random() * 0.08,
      });
    }

    this.drivingAudio.throttleHeld = Boolean(forward);
  }

  emitDriftSmoke(delta, lateralSpeed, forwardSpeed, onRoad) {
    const driftAmount = onRoad
      ? this.player.rearSlip
        * smoothStep(1.1, 6.5, Math.abs(lateralSpeed))
        * smoothStep(7, 15, Math.abs(forwardSpeed))
      : Math.max(
        smoothStep(5, 18, Math.abs(forwardSpeed)) * 0.24,
        smoothStep(2, 8, Math.abs(lateralSpeed)) * smoothStep(4, 14, Math.abs(forwardSpeed)) * 0.86,
      );

    if (driftAmount < 0.1) {
      this.smokeEmitAccumulator = 0;
      return;
    }

    this.smokeEmitAccumulator += delta
      * THREE.MathUtils.lerp(5, 16, driftAmount)
      * this.performanceSettings.smokeEmitScale;
    while (this.smokeEmitAccumulator >= 1) {
      this.smokeEmitAccumulator -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.spawnSmokePuff(side, driftAmount, lateralSpeed, onRoad);

      if (driftAmount > 0.55 && Math.random() < 0.35) {
        this.spawnSmokePuff(-side, driftAmount, lateralSpeed, onRoad);
      }
    }
  }

  spawnSmokePuff(side, driftAmount, lateralSpeed, onRoad) {
    if (this.smokeParticles.length >= this.performanceSettings.maxSmokeParticles) {
      this.removeSmokeParticle(0);
    }

    const headingSin = Math.sin(this.player.heading);
    const headingCos = Math.cos(this.player.heading);
    const rightX = headingCos;
    const rightZ = -headingSin;
    const rearOffset = -2.25 * VEHICLE_GRAPHIC_SCALE;
    const sideOffset = side * 1.45 * VEHICLE_GRAPHIC_SCALE;
    const jitter = (Math.random() - 0.5) * 0.42;
    const x = this.player.x + headingSin * rearOffset + rightX * (sideOffset + jitter);
    const z = this.player.z + headingCos * rearOffset + rightZ * (sideOffset + jitter);
    const surfaceY = this.getSurfaceY(x, z);
    const scale = THREE.MathUtils.lerp(onRoad ? 1.05 : 1.2, onRoad ? 1.75 : 2.35, driftAmount) * (0.84 + Math.random() * 0.28);

    const material = new THREE.SpriteMaterial({
      map: this.smokeTexture,
      color: onRoad ? 0xd8d4ca : 0xd6b16b,
      transparent: true,
      opacity: THREE.MathUtils.lerp(onRoad ? 0.1 : 0.14, onRoad ? 0.24 : 0.34, driftAmount),
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, surfaceY + 0.56 + Math.random() * 0.22, z);
    sprite.scale.set(scale, scale, scale);
    this.scene.add(sprite);

    const driftDirection = Math.sign(lateralSpeed) || side;
    this.smokeParticles.push({
      sprite,
      age: 0,
      life: THREE.MathUtils.lerp(0.48, 0.78, driftAmount) * (0.9 + Math.random() * 0.22),
      opacity: material.opacity,
      startScale: scale,
      endScale: scale * THREE.MathUtils.lerp(onRoad ? 2.0 : 2.55, onRoad ? 2.85 : 3.45, driftAmount),
      vx: -this.player.vx * (onRoad ? 0.035 : 0.055) + rightX * driftDirection * 0.28 + SAND_WIND.x * (onRoad ? 0.18 : 0.58) + (Math.random() - 0.5) * 0.55,
      vz: -this.player.vz * (onRoad ? 0.035 : 0.055) + rightZ * driftDirection * 0.28 + SAND_WIND.z * (onRoad ? 0.18 : 0.58) + (Math.random() - 0.5) * 0.55,
      rise: (onRoad ? 0.22 : 0.34) + Math.random() * 0.18,
    });
  }

  updateSmoke(delta) {
    for (let i = this.smokeParticles.length - 1; i >= 0; i -= 1) {
      const particle = this.smokeParticles[i];
      particle.age += delta;

      if (particle.age >= particle.life) {
        this.removeSmokeParticle(i);
        continue;
      }

      const t = particle.age / particle.life;
      const eased = smoothStep(0, 1, t);
      particle.sprite.position.x += particle.vx * delta;
      particle.sprite.position.y += particle.rise * delta;
      particle.sprite.position.z += particle.vz * delta;
      const scale = THREE.MathUtils.lerp(particle.startScale, particle.endScale, eased);
      particle.sprite.scale.set(scale, scale, scale);
      particle.sprite.material.opacity = particle.opacity * (1 - smoothStep(0.2, 1, t));
    }
  }

  removeSmokeParticle(index) {
    const [particle] = this.smokeParticles.splice(index, 1);
    if (!particle) return;

    this.scene.remove(particle.sprite);
    particle.sprite.material.dispose();
  }

  clearSmoke() {
    while (this.smokeParticles.length > 0) {
      this.removeSmokeParticle(this.smokeParticles.length - 1);
    }
    this.smokeEmitAccumulator = 0;
  }

  spawnSandWisp() {
    if (!this.player || !this.sandWispTexture) return;
    if (this.sandWisps.length >= this.performanceSettings.maxSandWisps) {
      this.removeSandWisp(0);
    }

    const crossWind = new THREE.Vector3(-SAND_WIND.z, 0, SAND_WIND.x);
    const ahead = 28 + Math.random() * SAND_WISP_SPAWN_RADIUS;
    const side = (Math.random() - 0.5) * SAND_WISP_SPAWN_RADIUS * 1.5;
    const x = this.player.x - SAND_WIND.x * ahead + crossWind.x * side;
    const z = this.player.z - SAND_WIND.z * ahead + crossWind.z * side;
    const groundY = this.getAmbientGroundY(x, z);
    const scaleX = 13 + Math.random() * 22;
    const scaleY = 1.3 + Math.random() * 2.8;
    const opacity = 0.05 + Math.random() * 0.09;

    const material = new THREE.SpriteMaterial({
      map: this.sandWispTexture,
      color: 0xf0c777,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, groundY + 0.35 + Math.random() * 1.15, z);
    sprite.scale.set(scaleX, scaleY, 1);
    this.scene.add(sprite);

    this.sandWisps.push({
      sprite,
      age: 0,
      life: 2.8 + Math.random() * 2.2,
      opacity,
      scaleX,
      scaleY,
      speed: 11 + Math.random() * 10,
      sway: (Math.random() - 0.5) * 0.65,
    });
  }

  updateAmbientSand(delta) {
    if (!this.player || !this.scene) return;

    this.sandWispEmitAccumulator += delta * this.performanceSettings.sandWispSpawnRate;
    while (this.sandWispEmitAccumulator >= 1) {
      this.sandWispEmitAccumulator -= 1;
      this.spawnSandWisp();
    }

    for (let i = this.sandWisps.length - 1; i >= 0; i -= 1) {
      const wisp = this.sandWisps[i];
      wisp.age += delta;
      const distanceFromPlayer = Math.hypot(
        wisp.sprite.position.x - this.player.x,
        wisp.sprite.position.z - this.player.z,
      );

      if (wisp.age >= wisp.life || distanceFromPlayer > SAND_WISP_DESPAWN_DISTANCE) {
        this.removeSandWisp(i);
        continue;
      }

      const t = wisp.age / wisp.life;
      const fadeIn = smoothStep(0, 0.18, t);
      const fadeOut = 1 - smoothStep(0.62, 1, t);
      const speed = wisp.speed * (1 + t * 0.45);
      wisp.sprite.position.x += (SAND_WIND.x * speed + wisp.sway) * delta;
      wisp.sprite.position.z += (SAND_WIND.z * speed - wisp.sway * 0.35) * delta;
      wisp.sprite.position.y = this.getAmbientGroundY(wisp.sprite.position.x, wisp.sprite.position.z)
        + 0.38
        + Math.sin(wisp.age * 4.2 + wisp.scaleX) * 0.18;
      wisp.sprite.scale.set(
        wisp.scaleX * (1 + t * 0.55),
        wisp.scaleY * (1 + t * 0.28),
        1,
      );
      wisp.sprite.material.opacity = wisp.opacity * fadeIn * fadeOut;
    }
  }

  removeSandWisp(index) {
    const [wisp] = this.sandWisps.splice(index, 1);
    if (!wisp) return;

    this.scene.remove(wisp.sprite);
    wisp.sprite.material.dispose();
  }

  clearSandWisps() {
    while (this.sandWisps.length > 0) {
      this.removeSandWisp(this.sandWisps.length - 1);
    }
    this.sandWispEmitAccumulator = 0;
  }

  spawnTumbleweed() {
    if (!this.tumbleweedPrototype || !this.player) return;

    if (this.tumbleweeds.length >= this.performanceSettings.maxTumbleweeds) {
      this.removeTumbleweed(0);
    }

    const root = new THREE.Group();
    const visual = this.tumbleweedPrototype.clone(true);
    const radius = visual.userData.radius ?? this.tumbleweedPrototype.userData.radius ?? 2.4;
    const crossWind = new THREE.Vector3(-TUMBLEWEED_WIND.z, 0, TUMBLEWEED_WIND.x);
    const start = new THREE.Vector3(this.player.x, 0, this.player.z)
      .addScaledVector(TUMBLEWEED_WIND, -TUMBLEWEED_SPAWN_DISTANCE)
      .addScaledVector(crossWind, (Math.random() - 0.5) * 122);

    root.add(visual);
    root.position.set(start.x, this.getGroundY(start.x, start.z) + radius, start.z);
    root.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(root);

    this.tumbleweeds.push({
      root,
      radius,
      age: 0,
      life: 8.5 + Math.random() * 4.5,
      speed: THREE.MathUtils.lerp(TUMBLEWEED_MIN_SPEED, TUMBLEWEED_MAX_SPEED, Math.random()),
      direction: TUMBLEWEED_WIND.clone(),
      rollAxis: new THREE.Vector3(TUMBLEWEED_WIND.z, 0, -TUMBLEWEED_WIND.x).normalize(),
      wobble: Math.random() * Math.PI * 2,
      bounceHeight: THREE.MathUtils.lerp(TUMBLEWEED_MIN_BOUNCE_HEIGHT, TUMBLEWEED_MAX_BOUNCE_HEIGHT, Math.random()),
      bounceRate: THREE.MathUtils.lerp(TUMBLEWEED_MIN_BOUNCE_RATE, TUMBLEWEED_MAX_BOUNCE_RATE, Math.random()),
      sideAxis: crossWind.normalize(),
      skitterStrength: 0.35 + Math.random() * 0.5,
      previousSkitterOffset: 0,
    });
  }

  updateTumbleweeds(delta) {
    if (!this.tumbleweedPrototype || !this.player) return;

    this.tumbleweedSpawnTimer -= delta;
    if (this.tumbleweedSpawnTimer <= 0) {
      this.spawnTumbleweed();
      this.tumbleweedSpawnTimer = THREE.MathUtils.lerp(
        this.performanceSettings.tumbleweedSpawnMin,
        this.performanceSettings.tumbleweedSpawnMax,
        Math.random(),
      );
    }

    for (let i = this.tumbleweeds.length - 1; i >= 0; i -= 1) {
      const tumbleweed = this.tumbleweeds[i];
      tumbleweed.age += delta;
      tumbleweed.root.position.x += tumbleweed.direction.x * tumbleweed.speed * delta;
      tumbleweed.root.position.z += tumbleweed.direction.z * tumbleweed.speed * delta;
      const bounceWave = Math.abs(Math.sin(tumbleweed.age * tumbleweed.bounceRate + tumbleweed.wobble));
      const bounceLift = Math.pow(bounceWave, 1.7);
      const skitterOffset = Math.sin(tumbleweed.age * tumbleweed.bounceRate * 0.48 + tumbleweed.wobble)
        * tumbleweed.skitterStrength;
      const skitterDelta = skitterOffset - tumbleweed.previousSkitterOffset;
      tumbleweed.root.position.x += tumbleweed.sideAxis.x * skitterDelta;
      tumbleweed.root.position.z += tumbleweed.sideAxis.z * skitterDelta;
      tumbleweed.previousSkitterOffset = skitterOffset;
      tumbleweed.root.position.y = this.getGroundY(tumbleweed.root.position.x, tumbleweed.root.position.z)
        + tumbleweed.radius
        + bounceLift * tumbleweed.bounceHeight;
      tumbleweed.root.rotateOnWorldAxis(
        tumbleweed.rollAxis,
        (tumbleweed.speed / Math.max(0.1, tumbleweed.radius)) * delta * (1 + bounceLift * 0.18),
      );
      tumbleweed.root.rotateOnWorldAxis(tumbleweed.direction, delta * (0.55 + bounceLift * 0.65));

      const distanceFromPlayer = Math.hypot(
        tumbleweed.root.position.x - this.player.x,
        tumbleweed.root.position.z - this.player.z,
      );
      if (tumbleweed.age > tumbleweed.life || distanceFromPlayer > TUMBLEWEED_DESPAWN_DISTANCE) {
        this.removeTumbleweed(i);
      }
    }
  }

  removeTumbleweed(index) {
    const [tumbleweed] = this.tumbleweeds.splice(index, 1);
    if (!tumbleweed) return;

    this.scene.remove(tumbleweed.root);
  }

  clearTumbleweeds() {
    while (this.tumbleweeds.length > 0) {
      this.removeTumbleweed(this.tumbleweeds.length - 1);
    }
  }

  keepInsideWorld() {
    const edge = (this.player.x * this.player.x) / (TRACK.worldLimitRx * TRACK.worldLimitRx)
      + (this.player.z * this.player.z) / (TRACK.worldLimitRz * TRACK.worldLimitRz);

    if (edge <= 1) return;

    const pull = 1 / Math.sqrt(edge);
    this.player.x *= pull * 0.985;
    this.player.z *= pull * 0.985;
    this.player.vx *= 0.78;
    this.player.vz *= 0.78;
    this.player.speed = Math.hypot(this.player.vx, this.player.vz);
  }

  updateLapProgress() {
    const progress = this.track.getProgress(this.player.x, this.player.z);
    let deltaProgress = progress - this.player.lastProgress;

    if (deltaProgress > 0.5) deltaProgress -= 1;
    if (deltaProgress < -0.5) deltaProgress += 1;

    this.player.unwrappedProgress += deltaProgress;
    this.player.lastProgress = progress;

    const lapTime = (performance.now() - this.player.lapStartedAt) / 1000;
    if (this.player.unwrappedProgress - this.player.lapMark >= 1 && lapTime > 4) {
      this.player.laps = Math.min(RACE_LAPS, this.player.laps + 1);
      this.player.bestLap = Number.isNaN(this.player.bestLap)
        ? lapTime
        : Math.min(this.player.bestLap, lapTime);
      this.player.lapMark += 1;
      if (this.player.laps >= RACE_LAPS) {
        this.completeRace();
        return true;
      }
      if (this.player.laps === RACE_LAPS - 1) {
        this.showLimitedRaceDialogue('finalLap', {
          force: true,
          duration: 3.3,
        });
      }
      this.player.lapStartedAt = performance.now();
      this.sfx.playOneShot('checkpointBell', 0.54);
    }
    return false;
  }

  completeRace() {
    if (this.raceFinished) return;

    const playerRank = this.getPlayerRank();
    const playerWon = playerRank === 1;
    const defeatAffinityStage = this.getActiveCharacterAffinity();
    this.lastRaceResult = {
      playerRank,
      playerWon,
      defeatAffinityStage,
    };
    if (playerWon) {
      this.addActiveCharacterAffinity();
    }

    this.raceStarted = false;
    this.raceFinished = true;
    this.countdown.active = false;
    this.setPausedState(false);
    this.clearTouchControls();
    this.gameShell?.classList.remove('is-race-interface-active');
    this.countdownScreen?.classList.add('is-hidden');
    this.hideCharacterDialogue();
    this.player.finishedAt = performance.now();
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.speed = 0;
    this.player.nitroActive = false;
    this.sfx.pauseLoops();
    this.sfx.playOneShot('checkpointBell', 0.74, { force: true, playbackRate: 1.18 });
    this.updateHud();
    this.updateFinishScreen();
    this.finishScreen?.classList.remove('is-hidden');
  }

  updateFinishScreen() {
    if (!this.player || !this.finishStats) return;

    const finishTime = this.player.finishedAt ?? performance.now();
    const totalTime = (finishTime - this.player.raceStartedAt) / 1000;
    const playerRank = this.lastRaceResult?.playerRank ?? this.getPlayerRank();
    const playerWon = this.lastRaceResult?.playerWon ?? playerRank === 1;
    if (this.finishTitle) {
      this.finishTitle.textContent = playerWon ? 'You Won The Race' : `${ordinalPlace(playerRank)} Place Finish`;
    }
    this.finishStats.result.textContent = playerWon ? 'WIN' : `${playerRank}/${OPPONENT_COUNT + 1}`;
    this.finishStats.total.textContent = formatLapTime(totalTime);
    this.finishStats.best.textContent = formatLapTime(this.player.bestLap);
    this.finishStats.nitro.textContent = `${Math.round(this.player.nitro * 100)}%`;
    this.updateFinishCharacterLine(playerWon);
  }

  updateFinishCharacterLine(playerWon) {
    if (!this.activeCharacter || !this.finishCharacter?.root) return;

    const eventKey = playerWon ? 'defeat' : 'victory';
    const affinityStage = this.lastRaceResult?.defeatAffinityStage ?? this.getActiveCharacterAffinity();
    const expression = playerWon
      ? this.activeCharacter.expressions.defeat
      : this.activeCharacter.expressions.victory;
    const line = this.pickCharacterLine(eventKey, { affinityStage });
    const portrait = this.getCharacterPortrait(expression);

    this.finishCharacter.root.classList.toggle('is-player-win', playerWon);
    this.finishCharacter.name.textContent = this.activeCharacter.name;
    this.finishCharacter.line.textContent = line;
    this.finishCharacter.portrait.src = portrait;
    this.finishCharacter.portrait.alt = this.activeCharacter.name;
  }

  estimateTrackTurn(progress, lookAhead = 0.018) {
    const previous = this.track.centerPoint(progress - lookAhead);
    const current = this.track.centerPoint(progress);
    const next = this.track.centerPoint(progress + lookAhead);
    const incoming = current.clone().sub(previous).setY(0).normalize();
    const outgoing = next.clone().sub(current).setY(0).normalize();

    return incoming.angleTo(outgoing);
  }

  estimateTrackTurnInfo(progress, lookAhead = 0.018) {
    const previous = this.track.centerPoint(progress - lookAhead);
    const current = this.track.centerPoint(progress);
    const next = this.track.centerPoint(progress + lookAhead);
    const incoming = current.clone().sub(previous).setY(0).normalize();
    const outgoing = next.clone().sub(current).setY(0).normalize();
    const signedTurn = incoming.x * outgoing.z - incoming.z * outgoing.x;

    return {
      angle: incoming.angleTo(outgoing),
      side: Math.sign(signedTurn),
    };
  }

  getTrackPose(progress) {
    const point = this.track.centerPoint(progress);
    const next = this.track.centerPoint(progress + 0.004);
    const tangent = next.clone().sub(point).setY(0);

    if (tangent.lengthSq() === 0) {
      tangent.set(0, 0, 1);
    } else {
      tangent.normalize();
    }

    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    return {
      point,
      tangent,
      normal,
      heading: Math.atan2(tangent.x, tangent.z),
    };
  }

  getOpponentLineOffset(opponent, delta) {
    const turnChecks = [-0.012, 0.014, 0.038, 0.066].map((offset) => (
      this.estimateTrackTurnInfo(opponent.progress + offset)
    ));
    const dominantTurn = turnChecks.reduce(
      (strongest, turn) => (turn.angle > strongest.angle ? turn : strongest),
      { angle: 0, side: opponent.turnSide || 1 },
    );

    if (dominantTurn.side !== 0 && dominantTurn.angle > OPPONENT_TURN_SIDE_SWITCH_THRESHOLD) {
      opponent.turnSide = dominantTurn.side;
    }

    const turnSide = opponent.turnSide || 1;
    const turnSeverity = smoothStep(OPPONENT_LINE_CORNER_START, OPPONENT_LINE_CORNER_FULL, dominantTurn.angle);
    const outsideOffset = -turnSide * OPPONENT_OUTSIDE_LINE_OFFSET;
    const insideOffset = turnSide * OPPONENT_INSIDE_LINE_OFFSET;
    const targetOffset = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(outsideOffset, insideOffset, turnSeverity)
        + opponent.lineBias * (1 - turnSeverity * 0.45),
      -OPPONENT_LINE_LIMIT,
      OPPONENT_LINE_LIMIT,
    );

    opponent.lineOffset = delta > 0
      ? moveToward(opponent.lineOffset ?? targetOffset, targetOffset, OPPONENT_LINE_SHIFT_SPEED * delta)
      : targetOffset;

    return opponent.lineOffset;
  }

  getOpponentTrackTarget(opponent, delta) {
    const pose = this.getTrackPose(opponent.progress);
    const nextPose = this.getTrackPose(opponent.progress + 0.004);
    const lineOffset = this.getOpponentLineOffset(opponent, delta);
    const point = pose.point.clone().addScaledVector(pose.normal, lineOffset);
    const nextPoint = nextPose.point.clone().addScaledVector(nextPose.normal, lineOffset);
    point.y = this.getSurfaceY(point.x, point.z);
    nextPoint.y = this.getSurfaceY(nextPoint.x, nextPoint.z);

    return {
      point,
      heading: Math.atan2(nextPoint.x - point.x, nextPoint.z - point.z),
    };
  }

  getOpponentTargetSpeed(opponent) {
    const turnNow = this.estimateTrackTurn(opponent.progress);
    const turnSoon = this.estimateTrackTurn(opponent.progress + 0.026);
    const turnLater = this.estimateTrackTurn(opponent.progress + 0.052);
    const turnSeverity = smoothStep(0.055, 0.32, Math.max(turnNow, turnSoon, turnLater));

    return THREE.MathUtils.lerp(OPPONENT_MAX_SPEED, OPPONENT_MIN_CORNER_SPEED, turnSeverity);
  }

  updateOpponent(opponent, delta) {
    const root = this.opponentRoots?.[opponent.index];
    if (!root) return;

    const targetSpeed = this.getOpponentTargetSpeed(opponent);
    const speedStep = (targetSpeed < opponent.speed ? 0.13 : 0.032) * delta;
    opponent.speed = moveToward(opponent.speed, targetSpeed, speedStep);
    opponent.hitCooldown = Math.max(0, opponent.hitCooldown - delta);
    const recovering = opponent.recovering || opponent.recoveryTime > 0;
    const nextProgress = THREE.MathUtils.euclideanModulo(
      opponent.progress + opponent.speed * delta * (recovering ? 0.64 : 1),
      1,
    );
    let deltaProgress = nextProgress - opponent.lastProgress;

    if (deltaProgress > 0.5) deltaProgress -= 1;
    if (deltaProgress < -0.5) deltaProgress += 1;

    opponent.unwrappedProgress += deltaProgress;
    opponent.lastProgress = nextProgress;
    opponent.progress = nextProgress;

    const target = this.getOpponentTrackTarget(opponent, delta);
    const current = target.point;
    const trackHeading = target.heading;

    if (!recovering) {
      opponent.x = current.x;
      opponent.y = current.y;
      opponent.z = current.z;
      opponent.vx = 0;
      opponent.vz = 0;
      root.position.set(current.x, current.y, current.z);
      root.rotation.y = trackHeading;
      return;
    }

    const returnX = current.x - opponent.x;
    const returnZ = current.z - opponent.z;
    const returnDistance = Math.hypot(returnX, returnZ);

    opponent.vx += returnX * OPPONENT_RECOVERY_PULL * delta;
    opponent.vz += returnZ * OPPONENT_RECOVERY_PULL * delta;

    const damping = Math.exp(-OPPONENT_KNOCKBACK_DAMPING * delta);
    opponent.vx *= damping;
    opponent.vz *= damping;
    opponent.x += opponent.vx * delta;
    opponent.z += opponent.vz * delta;
    opponent.recoveryTime = Math.max(0, opponent.recoveryTime - delta);

    const knockbackSpeed = Math.hypot(opponent.vx, opponent.vz);
    if (
      returnDistance < OPPONENT_RECOVERY_SNAP_DISTANCE
      && knockbackSpeed < OPPONENT_RECOVERY_SNAP_SPEED
    ) {
      opponent.x = current.x;
      opponent.y = current.y;
      opponent.z = current.z;
      opponent.vx = 0;
      opponent.vz = 0;
      opponent.recovering = false;
      opponent.recoveryTime = 0;
      root.position.set(current.x, current.y, current.z);
      root.rotation.y = trackHeading;
      return;
    }

    opponent.recovering = true;
    opponent.y = this.getSurfaceY(opponent.x, opponent.z);

    root.position.set(opponent.x, opponent.y, opponent.z);
    root.rotation.y = knockbackSpeed > 0.4
      ? Math.atan2(opponent.vx, opponent.vz)
      : trackHeading;
  }

  handleOpponentCollision(opponent) {
    const root = this.opponentRoots?.[opponent.index];
    if (!root) return;

    const dx = this.player.x - root.position.x;
    const dz = this.player.z - root.position.z;
    const distanceSq = dx * dx + dz * dz;
    const minDistance = VEHICLE_COLLISION_RADIUS;

    if (distanceSq >= minDistance * minDistance) {
      return;
    }

    const distance = Math.sqrt(distanceSq) || 1;
    const normalX = dx / distance;
    const normalZ = dz / distance;
    const overlap = minDistance - distance;
    const normalSpeed = this.player.vx * normalX + this.player.vz * normalZ;
    const impactSpeed = Math.max(4.5, -normalSpeed * 1.15, this.player.speed * 0.32);

    this.player.x += normalX * (overlap + 0.06);
    this.player.z += normalZ * (overlap + 0.06);
    opponent.x = root.position.x;
    opponent.z = root.position.z;

    const freshContact = opponent.hitCooldown <= 0;
    if (opponent.hitCooldown <= 0) {
      opponent.recovering = true;
      opponent.recoveryTime = OPPONENT_RECOVERY_TIME;
      opponent.hitCooldown = OPPONENT_HIT_COOLDOWN;
      this.sfx.playOneShot('hitWoodMetal', THREE.MathUtils.clamp(impactSpeed / 18, 0.36, 0.82), {
        playbackRate: 0.92 + Math.random() * 0.18,
      });
      opponent.x -= normalX * (overlap * 0.45 + 0.16);
      opponent.z -= normalZ * (overlap * 0.45 + 0.16);
      opponent.vx = (opponent.vx ?? 0) - normalX * impactSpeed + this.player.vx * 0.22;
      opponent.vz = (opponent.vz ?? 0) - normalZ * impactSpeed + this.player.vz * 0.22;
      opponent.y = this.getSurfaceY(opponent.x, opponent.z);
      opponent.speed *= 0.72;
      root.position.set(opponent.x, opponent.y, opponent.z);
    }
    if (freshContact && this.isActiveCharacterOpponent(opponent)) {
      this.showCharacterDialogue('contact', {
        force: true,
        cooldown: 2.4,
        duration: 2.7,
      });
    }

    if (normalSpeed < 0) {
      this.player.vx -= normalX * normalSpeed * 1.35;
      this.player.vz -= normalZ * normalSpeed * 1.35;
    }

    this.player.vx *= 0.74;
    this.player.vz *= 0.74;
    this.player.speed = Math.hypot(this.player.vx, this.player.vz);
    this.player.loadTransfer = Math.max(this.player.loadTransfer, 0.5);
    this.player.rearSlip = Math.max(this.player.rearSlip, 0.35);

    this.keepInsideWorld();
    this.player.y = this.getSurfaceY(this.player.x, this.player.z);
    this.playerRoot.position.set(this.player.x, this.player.y, this.player.z);
  }

  updateCamera(delta) {
    const forward = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));
    const playerY = this.player.y ?? this.getSurfaceY(this.player.x, this.player.z);
    const desired = new THREE.Vector3(this.player.x, playerY, this.player.z)
      .addScaledVector(forward, -31)
      .add(new THREE.Vector3(0, 43, 0));
    const target = new THREE.Vector3(this.player.x, playerY + 1.4, this.player.z).addScaledVector(forward, 8);

    this.camera.position.lerp(desired, 1 - Math.exp(-6 * delta));
    this.camera.lookAt(target);
  }

  updateHud() {
    const hudNow = this.player.finishedAt ?? performance.now();
    const currentLap = (hudNow - this.player.lapStartedAt) / 1000;
    const displayedSpeed = Math.round(Math.abs(this.player.speed) * 4.6);
    const speedMeterFill = THREE.MathUtils.clamp(
      displayedSpeed / (PLAYER_ROAD_MAX_SPEED * 4.6),
      0,
      1,
    ) * 100;
    const nitroMeterFill = this.player.nitro * 100;
    const nitroGaugeFill = this.player.nitro * 58;

    this.hud.speed.forEach((element) => {
      element.textContent = `${displayedSpeed}`;
    });
    this.hud.lap.forEach((element) => {
      element.textContent = `${this.player.laps}/${RACE_LAPS}`;
    });
    this.hud.current.forEach((element) => {
      element.textContent = formatLapTime(currentLap);
    });
    this.hud.best.forEach((element) => {
      element.textContent = formatLapTime(this.player.bestLap);
    });
    this.hud.speedMeters.forEach((element) => {
      element.style.setProperty('--meter-fill', `${speedMeterFill.toFixed(1)}%`);
    });
    this.hud.nitro.forEach((element) => {
      element.style.setProperty('--nitro-fill', `${nitroGaugeFill.toFixed(1)}%`);
      element.style.setProperty('--meter-fill', `${nitroMeterFill.toFixed(1)}%`);
      element.classList.toggle('is-active', this.player.nitroActive);
    });
    this.updatePositionBoard();
  }

  getRaceRankings() {
    if (!this.player || !this.opponents) return [];
    const racers = [
      {
        id: 'player',
        name: 'YOU',
        progress: this.player.unwrappedProgress,
      },
      ...this.opponents.map((opponent) => ({
        id: `opponent-${opponent.index}`,
        name: opponent.name,
        progress: opponent.unwrappedProgress,
      })),
    ].sort((a, b) => b.progress - a.progress);

    return racers;
  }

  getPlayerRank() {
    const racers = this.getRaceRankings();
    return racers.findIndex((racer) => racer.id === 'player') + 1;
  }

  updatePositionBoard() {
    if (!this.positionBoard || !this.player || !this.opponents) return;

    const racers = this.getRaceRankings();
    const playerRank = racers.findIndex((racer) => racer.id === 'player') + 1;

    if (this.positionBoard.number) {
      this.positionBoard.number.innerHTML = `${playerRank}<span>/${racers.length}</span> <em>POS.</em>`;
    }
    if (this.positionBoard.mobileNumber) {
      this.positionBoard.mobileNumber.textContent = `${playerRank}/${racers.length}`;
    }
    if (this.positionBoard.list) {
      this.positionBoard.list.innerHTML = racers
        .map((racer, index) => `
          <li class="${racer.id === 'player' ? 'is-you' : ''}">
            <span>${index + 1}</span> ${racer.name}
          </li>
        `)
        .join('');
    }
  }

  updateAssetStatus() {
    if (!this.hud?.assets) return;
    this.hud.assets.textContent = this.assetMessages.join(' | ');
  }

  createCourseMap() {
    if (!this.courseMap?.road || !this.track) return;

    const points = [];
    const sampleCount = 220;
    for (let i = 0; i < sampleCount; i += 1) {
      points.push(this.track.centerPoint(i / sampleCount));
    }

    const bounds = points.reduce(
      (result, point) => ({
        minX: Math.min(result.minX, point.x),
        maxX: Math.max(result.maxX, point.x),
        minZ: Math.min(result.minZ, point.z),
        maxZ: Math.max(result.maxZ, point.z),
      }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
    );
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxZ - bounds.minZ);
    const scale = Math.min(
      (COURSE_MAP_SIZE - COURSE_MAP_PADDING * 2) / width,
      (COURSE_MAP_SIZE - COURSE_MAP_PADDING * 2) / height,
    );

    this.courseMapTransform = {
      scale,
      offsetX: (COURSE_MAP_SIZE - width * scale) / 2 - bounds.minX * scale,
      offsetY: (COURSE_MAP_SIZE - height * scale) / 2 - bounds.minZ * scale,
    };

    const mapPoints = points.map((point) => this.worldToCourseMap(point.x, point.z, false));
    const path = mapPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(' ');
    const closedPath = `${path} Z`;
    const roadStroke = Math.max(7, TRACK.roadWidth * scale);
    const runoffStroke = Math.max(12, (TRACK.roadWidth + TRACK.shoulderWidth * 2) * scale);

    this.courseMap.runoff.setAttribute('d', closedPath);
    this.courseMap.runoff.setAttribute('stroke-width', runoffStroke.toFixed(1));
    this.courseMap.road.setAttribute('d', closedPath);
    this.courseMap.road.setAttribute('stroke-width', roadStroke.toFixed(1));
    this.courseMap.center.setAttribute('d', closedPath);
    this.updateCourseMap();
  }

  worldToCourseMap(x, z, clamp = true) {
    if (!this.courseMapTransform) return { x: COURSE_MAP_SIZE / 2, y: COURSE_MAP_SIZE / 2 };

    let mapX = x * this.courseMapTransform.scale + this.courseMapTransform.offsetX;
    let mapY = z * this.courseMapTransform.scale + this.courseMapTransform.offsetY;

    if (clamp) {
      mapX = THREE.MathUtils.clamp(mapX, COURSE_MAP_MARKER_MARGIN, COURSE_MAP_SIZE - COURSE_MAP_MARKER_MARGIN);
      mapY = THREE.MathUtils.clamp(mapY, COURSE_MAP_MARKER_MARGIN, COURSE_MAP_SIZE - COURSE_MAP_MARKER_MARGIN);
    }

    return { x: mapX, y: mapY };
  }

  updateCourseMap() {
    if (!this.courseMapTransform || !this.player) return;

    this.positionCourseMapMarker(this.courseMap.player, this.player.x, this.player.z, this.player.heading);

    this.opponents?.forEach((opponent, index) => {
      const root = this.opponentRoots?.[index];
      const opponentX = opponent?.x ?? root?.position.x ?? 0;
      const opponentZ = opponent?.z ?? root?.position.z ?? 0;
      const opponentHeading = root?.rotation.y ?? 0;
      this.positionCourseMapMarker(this.courseMap.opponents?.[index], opponentX, opponentZ, opponentHeading);
    });
  }

  positionCourseMapMarker(marker, x, z, heading) {
    if (!marker) return;

    const point = this.worldToCourseMap(x, z);
    const rotation = 180 - THREE.MathUtils.radToDeg(heading);
    marker.setAttribute(
      'transform',
      `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${rotation.toFixed(1)})`,
    );
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.033);
    this.updateGamepadInput();
    if (!this.paused.active) {
      this.updateCountdown();
      this.updateAmbientSand(delta);
    }

    if (this.raceStarted && !this.paused.active) {
      this.updatePlayer(delta);
      if (this.raceStarted) {
        this.opponents.forEach((opponent) => this.updateOpponent(opponent, delta));
        this.opponents.forEach((opponent) => this.handleOpponentCollision(opponent));
        this.updateCharacterRaceDialogue();
        this.updateSmoke(delta);
        this.updateTumbleweeds(delta);
      }
      this.updateCamera(delta);
      this.updateHud();
      this.updateCourseMap();
    }

    this.updateCharacterDialogueVisibility();
    this.renderer.render(this.scene, this.camera);
    this.animationId = window.requestAnimationFrame(() => this.animate());
  }

  resize() {
    const width = this.viewport.clientWidth || 1;
    const height = this.viewport.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose() {
    window.cancelAnimationFrame(this.animationId);
    this.audioToggles?.forEach((audioToggle) => audioToggle.removeEventListener('click', this.onAudioToggle));
    this.carPicker?.removeEventListener('click', this.onVehiclePick);
    this.restartButton?.removeEventListener('click', this.onRestartRace);
    this.pauseButton?.removeEventListener('click', this.onPauseToggle);
    this.touchButtons?.forEach((button) => {
      button.removeEventListener('pointerdown', this.onTouchControlPointerDown);
      button.removeEventListener('pointerup', this.onTouchControlPointerUp);
      button.removeEventListener('pointercancel', this.onTouchControlPointerUp);
      button.removeEventListener('lostpointercapture', this.onTouchControlPointerUp);
    });
    this.touchStick?.removeEventListener('pointerdown', this.onTouchStickPointerDown);
    this.touchStick?.removeEventListener('pointermove', this.onTouchStickPointerMove);
    this.touchStick?.removeEventListener('pointerup', this.onTouchStickPointerUp);
    this.touchStick?.removeEventListener('pointercancel', this.onTouchStickPointerUp);
    this.touchStick?.removeEventListener('lostpointercapture', this.onTouchStickPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    window.removeEventListener('resize', this.onResize);
    this.clearSmoke();
    this.clearSandWisps();
    this.clearTumbleweeds();
    this.backgroundSceneryRoot?.removeFromParent();
    this.backgroundSceneryRoot = null;
    this.bgmAudio?.pause();
    this.bgmAudio = null;
    this.sfx.dispose();
    this.smokeTexture?.dispose();
    this.sandWispTexture?.dispose();
    this.renderer.dispose();
  }
}
