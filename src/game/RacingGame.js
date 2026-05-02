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

function normalizeInputKey(event) {
  return event.code === 'Space' ? 'space' : event.key.toLowerCase();
}

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
const OPPONENT_MAX_SPEED = 0.074;
const OPPONENT_MIN_CORNER_SPEED = 0.022;
const OPPONENT_COUNT = 2;
const OPPONENT_OUTSIDE_LINE_OFFSET = TRACK.roadWidth * 0.2;
const OPPONENT_INSIDE_LINE_OFFSET = TRACK.roadWidth * 0.18;
const OPPONENT_LINE_SHIFT_SPEED = 4.8;
const OPPONENT_LINE_LIMIT = TRACK.roadWidth / 2 - 2.2;
const OPPONENT_TURN_SIDE_SWITCH_THRESHOLD = 0.06;
const OPPONENT_LINE_CORNER_START = 0.07;
const OPPONENT_LINE_CORNER_FULL = 0.28;
const MAX_SMOKE_PARTICLES = 54;
const OPPONENT_RECOVERY_PULL = 3.25;
const OPPONENT_KNOCKBACK_DAMPING = 1.9;
const OPPONENT_RECOVERY_TIME = 2.9;
const OPPONENT_HIT_COOLDOWN = 0.24;
const ROAD_SURFACE_RELEASE_MARGIN = 0.6;
const THROTTLE_UNDERSTEER_STRENGTH = 0.72;
const DECEL_TURN_IN_STRENGTH = 0.72;
const LIFT_OFF_LOAD_FACTOR = 0.58;
const RACE_LAPS = 6;
const NITRO_ACCEL = 48;
const NITRO_DRAIN_RATE = 0.14;
const NITRO_MAX_SPEED_BOOST = 18;
const COURSE_MAP_SIZE = 240;
const COURSE_MAP_PADDING = 18;
const COURSE_MAP_MARKER_MARGIN = 8;
const ENGINE_BASE_VOLUME = 0.1;
const TUMBLEWEED_MAX_COUNT = 6;
const TUMBLEWEED_VISUAL_SIZE = 3.8;
const TUMBLEWEED_WIND = new THREE.Vector3(-0.62, 0, 0.78).normalize();
const TUMBLEWEED_SPAWN_DISTANCE = 92;
const TUMBLEWEED_DESPAWN_DISTANCE = 175;
const TUMBLEWEED_MIN_SPEED = 18;
const TUMBLEWEED_MAX_SPEED = 27;
const TUMBLEWEED_INITIAL_DELAY = 0.35;
const OPPONENT_FALLBACK_COLORS = [
  { body: 0xf5c542, accent: 0x5a3814 },
  { body: 0x20201d, accent: 0xd8d0bd },
];
const OPPONENT_NAMES = ['HAWK', 'B. CARVER'];
const OPPONENT_STARTS = [
  { progress: 0.47, speed: 0.056, lineBias: 0.22 },
  { progress: 0.56, speed: 0.053, lineBias: -0.22 },
];

function smoothStep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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

function enableObjectShadows(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
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
  enableObjectShadows(visual);
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

  enableObjectShadows(visual);
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
    this.tumbleweeds = [];
    this.tumbleweedPrototype = null;
    this.tumbleweedSpawnTimer = TUMBLEWEED_INITIAL_DELAY;
    this.raceStarted = false;
    this.raceFinished = false;
    this.vehicleLoadRequest = 0;
    this.vehicleSelectionLocked = false;
    this.selectedVehicle = ASSETS.models.vehicles[0];
    this.opponentVehicles = this.pickOpponentVehicles(this.selectedVehicle);
    this.bgmAudio = null;
    this.bgmEnabled = false;
    this.bgmIndex = randomBgmIndex();
    this.sfx = new GameAudio(ASSETS.audio.sfx);
    this.drivingAudio = {
      throttleHeld: false,
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
    await this.loadTumbleweedModel();
    this.reset();
    this.resize();
    this.animate();
  }

  createLayout() {
    const vehicleButtons = ASSETS.models.vehicles
      .map((vehicle, index) => `
        <button class="car-choice" type="button" data-car-id="${vehicle.id}">
          <span class="car-choice-number">${index + 1}</span>
          <span class="car-choice-name">${vehicle.name}</span>
        </button>
      `)
      .join('');

    this.root.innerHTML = `
      <main class="game-shell">
        <div class="viewport" data-viewport></div>
        <section class="route-title" aria-label="route">
          <h1>EAGLE ROCK</h1>
          <p>HIGHWAY</p>
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
            <g class="course-map-marker course-map-marker-opponent" data-map-opponent="0">
              <path d="M 0 -5 L 4.5 6 L 0 3 L -4.5 6 Z"></path>
            </g>
            <g class="course-map-marker course-map-marker-opponent" data-map-opponent="1">
              <path d="M 0 -5 L 4.5 6 L 0 3 L -4.5 6 Z"></path>
            </g>
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
        <section class="hud" aria-label="race status">
          <h1 class="hud-title">Topdown Racing Mock</h1>
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
        <aside class="help help-garbled" aria-hidden="true">
          <strong>操作</strong><br />
          W/S または ↑/↓: 前進・後退<br />
          A/D または ←/→: ステアリング<br />
          R: リセット
        </aside>
        <aside class="help">
          <strong>Controls</strong><br />
          W/S or arrow keys: throttle / brake<br />
          A/D or arrow keys: steer<br />
          Space: nitro<br />
          R: restart
        </aside>
        <section class="start-screen" data-start-screen aria-label="car selection">
          <div class="start-panel">
            <p class="start-kicker">Eagle Rock Highway</p>
            <h2 class="start-title">Choose Your Car</h2>
            <div class="car-picker" data-car-picker>${vehicleButtons}</div>
          </div>
        </section>
        <section class="finish-screen is-hidden" data-finish-screen aria-label="race results">
          <div class="finish-panel">
            <p class="finish-kicker">Race Complete</p>
            <h2 class="finish-title">${RACE_LAPS} Laps Finished</h2>
            <div class="finish-stats">
              <span>Total <strong data-finish-total>--</strong></span>
              <span>Best <strong data-finish-best>--</strong></span>
              <span>Nitro <strong data-finish-nitro>--</strong></span>
            </div>
            <p class="finish-action">Press R to race again</p>
          </div>
        </section>
        <div class="asset-status" data-assets>loading local assets...</div>
      </main>
    `;

    this.viewport = this.root.querySelector('[data-viewport]');
    this.hud = {
      speed: this.root.querySelector('[data-speed]'),
      lap: this.root.querySelector('[data-lap]'),
      current: this.root.querySelector('[data-current]'),
      best: this.root.querySelector('[data-best]'),
      nitro: this.root.querySelector('[data-nitro]'),
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
      list: this.root.querySelector('[data-position-list]'),
    };
    this.startScreen = this.root.querySelector('[data-start-screen]');
    this.finishScreen = this.root.querySelector('[data-finish-screen]');
    this.finishStats = {
      total: this.root.querySelector('[data-finish-total]'),
      best: this.root.querySelector('[data-finish-best]'),
      nitro: this.root.querySelector('[data-finish-nitro]'),
    };
    this.carPicker = this.root.querySelector('[data-car-picker]');
    this.audioToggles = [...this.root.querySelectorAll('[data-audio-toggle]')];
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -215;
    sun.shadow.camera.right = 215;
    sun.shadow.camera.top = 165;
    sun.shadow.camera.bottom = -165;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 300;
    this.scene.add(sun);

    this.smokeTexture = createSmokeTexture();
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
    this.scene.add(this.playerRoot);

    this.opponentRoots = [];
    this.opponentVisuals = [];
    for (let i = 0; i < OPPONENT_COUNT; i += 1) {
      const root = new THREE.Group();
      const colors = OPPONENT_FALLBACK_COLORS[i % OPPONENT_FALLBACK_COLORS.length];
      const visual = createFallbackCar(colors.body, colors.accent);
      root.add(visual);
      this.scene.add(root);
      this.opponentRoots.push(root);
      this.opponentVisuals.push(visual);
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

  pickOpponentVehicles(selectedVehicle) {
    const alternatives = ASSETS.models.vehicles.filter((vehicle) => vehicle.id !== selectedVehicle.id);
    const pool = alternatives.length > 0 ? alternatives : ASSETS.models.vehicles;
    const startIndex = Math.floor(Math.random() * pool.length);
    return Array.from({ length: OPPONENT_COUNT }, (_, index) => pool[(startIndex + index) % pool.length]);
  }

  async selectVehicle(vehicle) {
    if (this.vehicleSelectionLocked) return;

    this.vehicleSelectionLocked = true;
    const requestId = ++this.vehicleLoadRequest;
    this.selectedVehicle = vehicle;
    this.opponentVehicles = this.pickOpponentVehicles(vehicle);
    this.raceStarted = false;
    this.sfx.playOneShot('uiClick', 0.38, { force: true });
    this.startBgm();
    this.assetMessages = this.assetMessages.filter((message) => (
      !message.startsWith('player:') && !message.startsWith('opponent')
    ));
    this.updateAssetStatus();

    this.startScreen?.classList.add('start-screen--loading');
    this.carPicker?.querySelectorAll('.car-choice').forEach((button) => {
      button.disabled = true;
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
    this.raceStarted = true;
    this.clock.getDelta();
    this.startScreen?.classList.add('is-hidden');
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

      if (!this.raceStarted && /^[1-3]$/.test(key)) {
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
      if (key === 'r' && (this.raceStarted || this.raceFinished)) {
        event.preventDefault();
        const restartFinishedRace = this.raceFinished;
        this.reset();
        if (restartFinishedRace) {
          this.raceStarted = true;
          this.clock.getDelta();
        }
      }
    };

    this.onKeyUp = (event) => {
      this.keys.set(normalizeInputKey(event), false);
    };

    this.onResize = () => this.resize();
    this.audioToggles?.forEach((audioToggle) => audioToggle.addEventListener('click', this.onAudioToggle));
    this.carPicker?.addEventListener('click', this.onVehiclePick);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  reset() {
    const now = performance.now();
    const startProgress = this.track?.getProgress(PLAYER_START.x, PLAYER_START.z) ?? 0;
    this.clearSmoke();
    this.clearTumbleweeds();
    this.tumbleweedSpawnTimer = TUMBLEWEED_INITIAL_DELAY;
    this.raceFinished = false;
    this.finishScreen?.classList.add('is-hidden');

    this.player = {
      x: PLAYER_START.x,
      z: PLAYER_START.z,
      heading: PLAYER_START.heading,
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
      lastProgress: startProgress,
      unwrappedProgress: startProgress,
      lapMark: startProgress,
      surface: 'road',
    };
    this.opponents = OPPONENT_STARTS.map((start, index) => ({
      ...start,
      index,
      name: OPPONENT_NAMES[index] ?? `RIVAL ${index + 1}`,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      lineOffset: 0,
      turnSide: 1,
      lastProgress: start.progress,
      unwrappedProgress: start.progress,
      recoveryTime: 0,
      hitCooldown: 0,
    }));
    this.drivingAudio.throttleHeld = false;

    this.playerRoot?.position.set(this.player.x, 0, this.player.z);
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
    opponent.z = target.point.z;
    opponent.vx = 0;
    opponent.vz = 0;
    opponent.recoveryTime = 0;
    opponent.hitCooldown = 0;
    root.position.set(opponent.x, 0, opponent.z);
    root.rotation.y = target.heading;
  }

  updatePlayer(delta) {
    const forward = this.keys.get('arrowup') || this.keys.get('w');
    const backward = this.keys.get('arrowdown') || this.keys.get('s');
    const left = this.keys.get('arrowleft') || this.keys.get('a');
    const right = this.keys.get('arrowright') || this.keys.get('d');
    const nitroHeld = this.keys.get('space');
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
    const steer = (left ? 1 : 0) + (right ? -1 : 0);
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

    if (forward) driveAccel += throttleAccel;
    if (nitroActive) driveAccel += nitroAccel;
    if (braking) driveAccel -= brakeAccel;
    if (reversing) driveAccel -= reverseAccel;

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

    const currentForwardSpeed = this.player.vx * headingSin + this.player.vz * headingCos;
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
    const forwardDrag = onRoad ? 0.38 : THREE.MathUtils.lerp(DESERT_EDGE_DRAG, DESERT_DEEP_DRAG, desertDepthFactor);
    const dampedForwardSpeed = currentForwardSpeed * Math.exp(-forwardDrag * delta);
    const nitroSpeedBoost = nitroActive
      ? THREE.MathUtils.lerp(NITRO_MAX_SPEED_BOOST, NITRO_MAX_SPEED_BOOST * 0.42, desertDepthFactor)
      : 0;
    const maxForward = (onRoad ? 42 : THREE.MathUtils.lerp(DESERT_EDGE_MAX_SPEED, DESERT_DEEP_MAX_SPEED, desertDepthFactor))
      + nitroSpeedBoost;
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
    const driftYaw = this.player.rearSlip
      * (braking ? 3.35 : 1.42)
      * (1 + this.player.loadTransfer * 0.35)
      * steerScale
      * direction;
    this.player.heading += steer * (baseYaw + driftYaw) * delta;

    if (this.player.rearSlip > 0.08 && Math.abs(lateralSpeed) > 1.3) {
      this.player.heading += THREE.MathUtils.clamp(lateralSpeed / 18, -1.35, 1.35) * this.player.rearSlip * delta;
    }

    this.player.x += this.player.vx * delta;
    this.player.z += this.player.vz * delta;
    this.player.speed = Math.hypot(this.player.vx, this.player.vz);
    this.player.previousForwardSpeed = clampedForwardSpeed;
    this.keepInsideWorld();
    const finishedRace = this.updateLapProgress();

    this.playerRoot.position.set(this.player.x, 0, this.player.z);
    this.playerRoot.rotation.y = this.player.heading + THREE.MathUtils.clamp(lateralSpeed / 22, -0.62, 0.62) * this.player.rearSlip;
    this.playerVisual.rotation.x = -0.14 * this.player.loadTransfer;
    this.playerVisual.rotation.z = THREE.MathUtils.clamp(lateralSpeed / 34, -0.13, 0.13) * (1 - this.player.rearSlip * 0.25);
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
      : 0;

    if (driftAmount < 0.1) {
      this.smokeEmitAccumulator = 0;
      return;
    }

    this.smokeEmitAccumulator += delta * THREE.MathUtils.lerp(5, 16, driftAmount);
    while (this.smokeEmitAccumulator >= 1) {
      this.smokeEmitAccumulator -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.spawnSmokePuff(side, driftAmount, lateralSpeed);

      if (driftAmount > 0.55 && Math.random() < 0.35) {
        this.spawnSmokePuff(-side, driftAmount, lateralSpeed);
      }
    }
  }

  spawnSmokePuff(side, driftAmount, lateralSpeed) {
    if (this.smokeParticles.length >= MAX_SMOKE_PARTICLES) {
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
    const scale = THREE.MathUtils.lerp(1.05, 1.75, driftAmount) * (0.84 + Math.random() * 0.28);

    const material = new THREE.SpriteMaterial({
      map: this.smokeTexture,
      color: 0xd8d4ca,
      transparent: true,
      opacity: THREE.MathUtils.lerp(0.1, 0.24, driftAmount),
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 0.7 + Math.random() * 0.18, z);
    sprite.scale.set(scale, scale, scale);
    this.scene.add(sprite);

    const driftDirection = Math.sign(lateralSpeed) || side;
    this.smokeParticles.push({
      sprite,
      age: 0,
      life: THREE.MathUtils.lerp(0.48, 0.78, driftAmount) * (0.9 + Math.random() * 0.22),
      opacity: material.opacity,
      startScale: scale,
      endScale: scale * THREE.MathUtils.lerp(2.0, 2.85, driftAmount),
      vx: -this.player.vx * 0.035 + rightX * driftDirection * 0.28 + (Math.random() - 0.5) * 0.55,
      vz: -this.player.vz * 0.035 + rightZ * driftDirection * 0.28 + (Math.random() - 0.5) * 0.55,
      rise: 0.22 + Math.random() * 0.16,
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

  spawnTumbleweed() {
    if (!this.tumbleweedPrototype || !this.player) return;

    if (this.tumbleweeds.length >= TUMBLEWEED_MAX_COUNT) {
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
    root.position.set(start.x, TRACK.roadY + radius, start.z);
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
    });
  }

  updateTumbleweeds(delta) {
    if (!this.tumbleweedPrototype || !this.player) return;

    this.tumbleweedSpawnTimer -= delta;
    if (this.tumbleweedSpawnTimer <= 0) {
      this.spawnTumbleweed();
      this.tumbleweedSpawnTimer = THREE.MathUtils.lerp(1.4, 3.1, Math.random());
    }

    for (let i = this.tumbleweeds.length - 1; i >= 0; i -= 1) {
      const tumbleweed = this.tumbleweeds[i];
      tumbleweed.age += delta;
      tumbleweed.root.position.x += tumbleweed.direction.x * tumbleweed.speed * delta;
      tumbleweed.root.position.z += tumbleweed.direction.z * tumbleweed.speed * delta;
      tumbleweed.root.position.y = TRACK.roadY
        + tumbleweed.radius
        + Math.abs(Math.sin(tumbleweed.age * 6.5 + tumbleweed.wobble)) * 0.16;
      tumbleweed.root.rotateOnWorldAxis(
        tumbleweed.rollAxis,
        (tumbleweed.speed / Math.max(0.1, tumbleweed.radius)) * delta,
      );
      tumbleweed.root.rotateOnWorldAxis(tumbleweed.direction, delta * 0.85);

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
      this.player.lapStartedAt = performance.now();
      this.sfx.playOneShot('checkpointBell', 0.54);
    }
    return false;
  }

  completeRace() {
    if (this.raceFinished) return;

    this.raceStarted = false;
    this.raceFinished = true;
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
    this.finishStats.total.textContent = formatLapTime(totalTime);
    this.finishStats.best.textContent = formatLapTime(this.player.bestLap);
    this.finishStats.nitro.textContent = `${Math.round(this.player.nitro * 100)}%`;
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
    const nextProgress = THREE.MathUtils.euclideanModulo(
      opponent.progress + opponent.speed * delta * (opponent.recoveryTime > 0 ? 0.64 : 1),
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

    if (opponent.recoveryTime <= 0) {
      opponent.x = current.x;
      opponent.z = current.z;
      opponent.vx = 0;
      opponent.vz = 0;
      root.position.set(current.x, 0, current.z);
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
    if (returnDistance < 1.5 && knockbackSpeed < 2.6 && opponent.recoveryTime < 1.25) {
      opponent.x = current.x;
      opponent.z = current.z;
      opponent.vx = 0;
      opponent.vz = 0;
      opponent.recoveryTime = 0;
      root.position.set(current.x, 0, current.z);
      root.rotation.y = trackHeading;
      return;
    }

    root.position.set(opponent.x, 0, opponent.z);
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

    if (opponent.hitCooldown <= 0) {
      opponent.recoveryTime = OPPONENT_RECOVERY_TIME;
      opponent.hitCooldown = OPPONENT_HIT_COOLDOWN;
      this.sfx.playOneShot('hitWoodMetal', THREE.MathUtils.clamp(impactSpeed / 18, 0.36, 0.82), {
        playbackRate: 0.92 + Math.random() * 0.18,
      });
      opponent.x -= normalX * (overlap * 0.45 + 0.16);
      opponent.z -= normalZ * (overlap * 0.45 + 0.16);
      opponent.vx = (opponent.vx ?? 0) - normalX * impactSpeed + this.player.vx * 0.22;
      opponent.vz = (opponent.vz ?? 0) - normalZ * impactSpeed + this.player.vz * 0.22;
      opponent.speed *= 0.72;
      root.position.set(opponent.x, 0, opponent.z);
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
    this.playerRoot.position.set(this.player.x, 0, this.player.z);
  }

  updateCamera(delta) {
    const forward = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));
    const desired = new THREE.Vector3(this.player.x, 0, this.player.z)
      .addScaledVector(forward, -31)
      .add(new THREE.Vector3(0, 43, 0));
    const target = new THREE.Vector3(this.player.x, 1.4, this.player.z).addScaledVector(forward, 8);

    this.camera.position.lerp(desired, 1 - Math.exp(-6 * delta));
    this.camera.lookAt(target);
  }

  updateHud() {
    const hudNow = this.player.finishedAt ?? performance.now();
    const currentLap = (hudNow - this.player.lapStartedAt) / 1000;
    this.hud.speed.textContent = `${Math.round(Math.abs(this.player.speed) * 4.6)}`;
    this.hud.lap.textContent = `${this.player.laps}/${RACE_LAPS}`;
    this.hud.current.textContent = formatLapTime(currentLap);
    this.hud.best.textContent = formatLapTime(this.player.bestLap);
    this.hud.nitro?.style.setProperty('--nitro-fill', `${(this.player.nitro * 58).toFixed(1)}%`);
    this.hud.nitro?.classList.toggle('is-active', this.player.nitroActive);
    this.updatePositionBoard();
  }

  updatePositionBoard() {
    if (!this.positionBoard?.number || !this.positionBoard?.list || !this.player || !this.opponents) return;

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
    const playerRank = racers.findIndex((racer) => racer.id === 'player') + 1;

    this.positionBoard.number.innerHTML = `${playerRank}<span>/${racers.length}</span> <em>POS.</em>`;
    this.positionBoard.list.innerHTML = racers
      .map((racer, index) => `
        <li class="${racer.id === 'player' ? 'is-you' : ''}">
          <span>${index + 1}</span> ${racer.name}
        </li>
      `)
      .join('');
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

    if (this.raceStarted) {
      this.updatePlayer(delta);
      if (this.raceStarted) {
        this.opponents.forEach((opponent) => this.updateOpponent(opponent, delta));
        this.opponents.forEach((opponent) => this.handleOpponentCollision(opponent));
        this.updateSmoke(delta);
        this.updateTumbleweeds(delta);
      }
      this.updateCamera(delta);
      this.updateHud();
      this.updateCourseMap();
    }

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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.clearSmoke();
    this.clearTumbleweeds();
    this.bgmAudio?.pause();
    this.bgmAudio = null;
    this.sfx.dispose();
    this.smokeTexture?.dispose();
    this.renderer.dispose();
  }
}
