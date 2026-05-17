export const ASSETS = {
  models: {
    vehicles: [
      { id: 'car-1', name: 'Roadfire GT', path: '/assets/models/car.glb', sideImage: '/assets/ui/cars/car-001-side.png?v=1' },
      { id: 'car-2', name: 'Dustvale 440', path: '/assets/models/car-2.glb', sideImage: '/assets/ui/cars/car-002-side.png?v=1' },
      { id: 'car-3', name: 'Canyon Royale', path: '/assets/models/car-3.glb', sideImage: '/assets/ui/cars/car-003-side.png?v=1' },
      { id: 'car-4', name: 'County Pursuit', path: '/assets/models/car-4.glb', sideImage: '/assets/ui/cars/car-004-side.png?v=1' },
    ],
    mobileOpponent: { id: 'car-sp', name: 'SP Rival', path: '/assets/models/car_SP.glb' },
    tumbleweed: { id: 'tumbleweed-1', name: 'Tumbleweed', path: '/assets/models/Tumbleweed3.glb' },
    scenery: [
      { id: 'plants-01', name: 'Plants 01', path: '/assets/models/scenery/plants_01.glb' },
      { id: 'plants-02', name: 'Plants 02', path: '/assets/models/scenery/plants_02.glb' },
      { id: 'cactus-01', name: 'Cactus 01', path: '/assets/models/scenery/cactus_01.glb' },
      { id: 'cactus-02', name: 'Cactus 02', path: '/assets/models/scenery/cactus_02.glb' },
      { id: 'stone-01', name: 'Stone 01', path: '/assets/models/scenery/stone_01.glb' },
      { id: 'stone-02', name: 'Stone 02', path: '/assets/models/scenery/stone_02.glb' },
      { id: 'stone-03', name: 'Stone 03', path: '/assets/models/scenery/stone_03.glb' },
    ],
  },
  audio: {
    bgm: [
      { id: 'bgm-1', name: 'BGM 1', path: '/assets/audio/bgm-1.mp3' },
      { id: 'bgm-2', name: 'BGM 2', path: '/assets/audio/bgm-2.mp3' },
      { id: 'bgm-3', name: 'BGM 3', path: '/assets/audio/bgm-3.mp3' },
      { id: 'bgm-4', name: 'BGM 4', path: '/assets/audio/bgm-4.mp3' },
    ],
    sfx: {
      accelRev: { path: '/assets/audio/sfx/accel_rev.mp3', cooldown: 0.85 },
      checkpointBell: { path: '/assets/audio/sfx/checkpoint_bell.mp3', cooldown: 0.8 },
      engineLoop: { path: '/assets/audio/sfx/engine_loop.mp3' },
      gravelLoop: { path: '/assets/audio/sfx/gravel_loop.mp3' },
      hitWoodMetal: { path: '/assets/audio/sfx/hit_wood_metal.mp3', cooldown: 0.18 },
      skidDirt: { path: '/assets/audio/sfx/skid_dirt.mp3', cooldown: 0.22 },
      uiClick: { path: '/assets/audio/sfx/ui_click.mp3', cooldown: 0.05 },
    },
  },
  textures: {
    road: [
      '/assets/textures/road/basecolor.jpg',
      '/assets/textures/road/basecolor.png',
      '/assets/textures/road/albedo.jpg',
      '/assets/textures/road/albedo.png',
      '/assets/textures/road/road.jpg',
      '/assets/textures/road/road.png',
    ],
    grass: [
      '/assets/textures/grass/basecolor.jpg',
      '/assets/textures/grass/basecolor.png',
      '/assets/textures/grass/albedo.jpg',
      '/assets/textures/grass/albedo.png',
      '/assets/textures/grass/grass.jpg',
      '/assets/textures/grass/grass.png',
    ],
  },
  hdri: '/assets/hdri/studio.hdr',
};

export const TRACK = {
  outerRx: 58,
  outerRz: 39,
  innerRx: 31,
  innerRz: 17,
  centerRx: 44.5,
  centerRz: 28,
  roadWidth: 18,
  shoulderWidth: 6.5,
  visualShoulderWidth: 4.4,
  roadY: 0.04,
  worldLimitRx: 350,
  worldLimitRz: 485,
};

export const PLAYER_START = {
  x: -128,
  z: -132,
  heading: Math.PI,
};
