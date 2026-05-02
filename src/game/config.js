export const ASSETS = {
  models: {
    vehicles: [
      { id: 'car-1', name: 'CAR 001', path: '/assets/models/car.glb' },
      { id: 'car-2', name: 'CAR 002', path: '/assets/models/car-2.glb' },
      { id: 'car-3', name: 'CAR 003', path: '/assets/models/car-3.glb' },
    ],
    tumbleweed: { id: 'tumbleweed-1', name: 'Tumbleweed', path: '/assets/models/Tumbleweed3.glb' },
  },
  audio: {
    bgm: [
      { id: 'bgm-1', name: 'BGM 1', path: '/assets/audio/bgm-1.mp3' },
      { id: 'bgm-2', name: 'BGM 2', path: '/assets/audio/bgm-2.mp3' },
      { id: 'bgm-3', name: 'BGM 3', path: '/assets/audio/bgm-3.mp3' },
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
  worldLimitRx: 310,
  worldLimitRz: 285,
};

export const PLAYER_START = {
  x: -70,
  z: -132,
  heading: 1.42,
};
