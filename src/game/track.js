import * as THREE from 'three';
import { TRACK } from './config.js';

const CENTER_POINTS = [
  [-128, -132],
  [-128, -210],
  [-130, -306],
  [-126, -388],
  [-96, -422],
  [-56, -414],
  [-36, -372],
  [-44, -302],
  [-18, -250],
  [24, -256],
  [54, -322],
  [92, -338],
  [122, -298],
  [122, -218],
  [136, -154],
  [160, -96],
  [172, -28],
  [178, 42],
  [204, 92],
  [188, 136],
  [142, 168],
  [88, 158],
  [46, 126],
  [0, 128],
  [-46, 150],
  [-88, 136],
  [-122, 96],
  [-132, 44],
  [-132, -20],
  [-128, -72],
];

const GROUND_WIDTH = 760;
const GROUND_DEPTH = 1020;
const GROUND_SEGMENTS_X = 96;
const GROUND_SEGMENTS_Z = 132;
const ROAD_EDGE_LIFT_BLEND = 5.5;
const GROUND_UNDER_ROAD_CLEARANCE = 0.42;
const GROUND_UNDER_ROAD_BLEND = 10;

function smoothStep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function terrainRelief(x, z, distanceFromCenter = Infinity) {
  const roadHalfWidth = TRACK.roadWidth / 2;
  const offroadBlendStart = roadHalfWidth * 0.45;
  const offroadBlendEnd = roadHalfWidth + TRACK.shoulderWidth + 34;
  const offroadFactor = THREE.MathUtils.lerp(
    0.38,
    1,
    smoothStep(offroadBlendStart, offroadBlendEnd, distanceFromCenter),
  );
  const broadDunes = Math.sin(x * 0.013 + z * 0.008 + 1.7) * 2.6
    + Math.sin(x * 0.018 - z * 0.015 - 0.6) * 1.8
    + Math.sin((x + z) * 0.026 + 2.2) * 1.15;
  const surfaceRipple = Math.sin(x * 0.052 + z * 0.019) * 0.34
    + Math.sin(x * -0.031 + z * 0.047 + 0.8) * 0.24;

  return (broadDunes + surfaceRipple) * offroadFactor;
}

function roadLiftAtDistance(distanceFromCenter) {
  const roadLimit = TRACK.roadWidth / 2 + TRACK.shoulderWidth;
  return TRACK.roadY * (1 - smoothStep(roadLimit - 1.4, roadLimit + ROAD_EDGE_LIFT_BLEND, distanceFromCenter));
}

function groundClearanceAtDistance(distanceFromCenter) {
  const visualRoadLimit = TRACK.roadWidth / 2 + (TRACK.visualShoulderWidth ?? TRACK.shoulderWidth);
  const blend = smoothStep(visualRoadLimit - 0.5, visualRoadLimit + GROUND_UNDER_ROAD_BLEND, distanceFromCenter);
  return GROUND_UNDER_ROAD_CLEARANCE * (1 - blend);
}

function groundHeightAt(x, z, distanceFromCenter = Infinity) {
  return terrainRelief(x, z, distanceFromCenter);
}

function visualGroundHeightAt(x, z, distanceFromCenter = Infinity) {
  return groundHeightAt(x, z, distanceFromCenter) - groundClearanceAtDistance(distanceFromCenter);
}

function surfaceHeightAt(x, z, distanceFromCenter = Infinity) {
  return terrainRelief(x, z, distanceFromCenter) + roadLiftAtDistance(distanceFromCenter);
}

function makeCenterCurve() {
  const points = CENTER_POINTS.map(([x, z]) => new THREE.Vector3(x, surfaceHeightAt(x, z, 0), z));
  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

function createSamples(curve, count = 1800) {
  const samples = [];
  let length = 0;

  for (let i = 0; i < count; i += 1) {
    const progress = i / count;
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).setY(0).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

    if (i > 0) {
      length += horizontalDistance(point, samples[i - 1].point);
    }

    samples.push({
      progress,
      point,
      tangent,
      normal,
      distance: length,
    });
  }

  const closing = horizontalDistance(samples[0].point, samples[samples.length - 1].point);
  const totalLength = length + closing;

  for (let i = 0; i < samples.length; i += 1) {
    const previous = samples[(i - 1 + samples.length) % samples.length].point;
    const next = samples[(i + 1) % samples.length].point;
    const tangent = next.clone().sub(previous).setY(0).normalize();

    samples[i].tangent = tangent;
    samples[i].normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    samples[i].normalizedDistance = samples[i].distance / totalLength;
  }

  return { samples, totalLength };
}

function pointAtDistance(samples, totalLength, distance) {
  const wrapped = THREE.MathUtils.euclideanModulo(distance, totalLength);

  for (let i = 0; i < samples.length; i += 1) {
    const current = samples[i];
    const next = samples[(i + 1) % samples.length];
    const nextDistance = i === samples.length - 1 ? totalLength : next.distance;

    if (wrapped <= nextDistance) {
      const span = nextDistance - current.distance || 1;
      const alpha = (wrapped - current.distance) / span;
      const point = current.point.clone().lerp(next.point, alpha);
      const tangent = next.point.clone().sub(current.point).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      return { point, tangent, normal };
    }
  }

  return samples[0];
}

function createRoadGeometry(samples, totalLength, width) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfWidth = width / 2;

  for (const sample of samples) {
    const left = sample.point.clone().addScaledVector(sample.normal, halfWidth);
    const right = sample.point.clone().addScaledVector(sample.normal, -halfWidth);
    const v = (sample.distance / totalLength) * 32;
    left.y = surfaceHeightAt(left.x, left.z, halfWidth);
    right.y = surfaceHeightAt(right.x, right.z, halfWidth);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, v, 1, v);
  }

  for (let i = 0; i < samples.length; i += 1) {
    const next = (i + 1) % samples.length;
    const left = i * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;

    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRoadShoulderGeometry(samples, totalLength, roadWidth, shoulderWidth, side) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfWidth = roadWidth / 2;

  for (const sample of samples) {
    const roadEdge = sample.point.clone().addScaledVector(sample.normal, side * halfWidth);
    const desertEdge = sample.point.clone().addScaledVector(sample.normal, side * (halfWidth + shoulderWidth));
    const v = (sample.distance / totalLength) * 30;
    const roadEdgeY = surfaceHeightAt(roadEdge.x, roadEdge.z, halfWidth) - 0.004;
    const desertEdgeY = visualGroundHeightAt(desertEdge.x, desertEdge.z, halfWidth + shoulderWidth) - 0.012;

    if (side > 0) {
      positions.push(desertEdge.x, desertEdgeY, desertEdge.z, roadEdge.x, roadEdgeY, roadEdge.z);
      uvs.push(1, v, 0, v);
    } else {
      positions.push(roadEdge.x, roadEdgeY, roadEdge.z, desertEdge.x, desertEdgeY, desertEdge.z);
      uvs.push(0, v, 1, v);
    }
  }

  for (let i = 0; i < samples.length; i += 1) {
    const next = (i + 1) % samples.length;
    const left = i * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;

    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addStartLine(scene, samples, totalLength) {
  const start = pointAtDistance(samples, totalLength, 0);
  const lineLength = 2.55;
  const halfLength = lineLength / 2;
  const halfWidth = TRACK.roadWidth / 2;
  const texture = createStartLineTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    depthWrite: false,
  });
  const center = start.point.clone();
  const positions = [];

  for (const tangentSide of [-1, 1]) {
    for (const normalSide of [-1, 1]) {
      const point = center
        .clone()
        .addScaledVector(start.tangent, tangentSide * halfLength)
        .addScaledVector(start.normal, normalSide * halfWidth);
      const distanceFromCenter = Math.abs(normalSide * halfWidth);
      point.y = surfaceHeightAt(point.x, point.z, distanceFromCenter) + 0.088;
      positions.push(point.x, point.y, point.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0, 1,
    1, 1,
  ], 2));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.computeVertexNormals();

  const line = new THREE.Mesh(geometry, material);
  line.renderOrder = 4;
  scene.add(line);
}

function createStartLineTexture() {
  const texture = new THREE.TextureLoader().load('/assets/ui/start-finish-line.png?v=2');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createRoadLineMaterial(path) {
  const texture = new THREE.TextureLoader().load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

function createRoadLineStripGeometry(samples, totalLength, offset, width, heightOffset, patternLength) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const halfWidth = width / 2;
  const repeatCount = Math.max(1, Math.round(totalLength / patternLength));
  const stripSamples = [
    ...samples.map((sample) => ({ ...sample, lineDistance: sample.distance })),
    { ...samples[0], lineDistance: totalLength },
  ];

  for (const sample of stripSamples) {
    const center = sample.point.clone().addScaledVector(sample.normal, offset);
    const left = center.clone().addScaledVector(sample.normal, -halfWidth);
    const right = center.clone().addScaledVector(sample.normal, halfWidth);
    const v = (sample.lineDistance / totalLength) * repeatCount;
    left.y = surfaceHeightAt(left.x, left.z, Math.abs(offset - halfWidth)) + heightOffset;
    right.y = surfaceHeightAt(right.x, right.z, Math.abs(offset + halfWidth)) + heightOffset;

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, v, 1, v);
  }

  for (let i = 0; i < stripSamples.length - 1; i += 1) {
    const left = i * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;

    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function addHighwayLines(scene, samples, totalLength) {
  const yellowMaterial = createRoadLineMaterial('/assets/ui/roadline-center-spaced.png?v=3');
  const whiteMaterial = createRoadLineMaterial('/assets/ui/roadline-white.png?v=4');
  const centerPatchWidth = 0.72;
  const edgePatchWidth = 2.95;
  const halfWidth = TRACK.roadWidth / 2 - 1.05;

  for (const offset of [-0.46, 0.46]) {
    const line = new THREE.Mesh(
      createRoadLineStripGeometry(samples, totalLength, offset, centerPatchWidth, 0.086, 4.2),
      yellowMaterial,
    );
    line.renderOrder = 3;
    scene.add(line);
  }

  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(
      createRoadLineStripGeometry(samples, totalLength, side * halfWidth, edgePatchWidth, 0.084, 2.9),
      whiteMaterial,
    );
    line.renderOrder = 3;
    scene.add(line);
  }
}

function nearestTrackPosition(samples, totalLength, x, z) {
  let bestDistanceSq = Infinity;
  let bestProgress = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const current = samples[i];
    const next = samples[(i + 1) % samples.length];
    const segmentX = next.point.x - current.point.x;
    const segmentZ = next.point.z - current.point.z;
    const lengthSq = segmentX * segmentX + segmentZ * segmentZ || 1;
    const alpha = THREE.MathUtils.clamp(
      ((x - current.point.x) * segmentX + (z - current.point.z) * segmentZ) / lengthSq,
      0,
      1,
    );
    const closestX = current.point.x + segmentX * alpha;
    const closestZ = current.point.z + segmentZ * alpha;
    const dx = closestX - x;
    const dz = closestZ - z;
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestProgress = (current.normalizedDistance + alpha * (Math.sqrt(lengthSq) / totalLength)) % 1;
    }
  }

  return {
    distance: Math.sqrt(bestDistanceSq),
    progress: bestProgress,
  };
}

function createGroundGeometry(samples, totalLength) {
  const geometry = new THREE.PlaneGeometry(GROUND_WIDTH, GROUND_DEPTH, GROUND_SEGMENTS_X, GROUND_SEGMENTS_Z);
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    const { distance } = nearestTrackPosition(samples, totalLength, x, z);
    positions.setZ(i, visualGroundHeightAt(x, z, distance) - 0.035);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function createTrack(scene, textures) {
  const grassMaterial = new THREE.MeshStandardMaterial({
    map: textures.grass,
    color: 0xffffff,
    roughness: 0.96,
  });
  const roadMaterial = new THREE.MeshStandardMaterial({
    map: textures.road,
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.02,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    map: textures.roadEdge,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const curve = makeCenterCurve();
  const { samples, totalLength } = createSamples(curve);

  const ground = new THREE.Mesh(createGroundGeometry(samples, totalLength), grassMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const visualShoulderWidth = TRACK.visualShoulderWidth ?? TRACK.shoulderWidth;

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(createRoadShoulderGeometry(samples, totalLength, TRACK.roadWidth, visualShoulderWidth, side), shoulderMaterial);
    shoulder.receiveShadow = true;
    scene.add(shoulder);
  }

  const road = new THREE.Mesh(createRoadGeometry(samples, totalLength, TRACK.roadWidth), roadMaterial);
  road.receiveShadow = true;
  scene.add(road);

  addHighwayLines(scene, samples, totalLength);
  addStartLine(scene, samples, totalLength);

  return {
    centerPoint(progress) {
      return pointAtDistance(samples, totalLength, progress * totalLength).point;
    },
    getProgress(x, z) {
      return nearestTrackPosition(samples, totalLength, x, z).progress;
    },
    getSurfaceInfo(x, z) {
      const position = nearestTrackPosition(samples, totalLength, x, z);
      return {
        ...position,
        surface: position.distance <= TRACK.roadWidth / 2 + TRACK.shoulderWidth ? 'road' : 'desert',
        groundY: groundHeightAt(x, z, position.distance),
        surfaceY: surfaceHeightAt(x, z, position.distance),
      };
    },
    getGroundHeight(x, z) {
      const { distance } = nearestTrackPosition(samples, totalLength, x, z);
      return groundHeightAt(x, z, distance);
    },
    getAmbientGroundHeight(x, z) {
      return groundHeightAt(x, z);
    },
    getSurfaceHeight(x, z) {
      const { distance } = nearestTrackPosition(samples, totalLength, x, z);
      return surfaceHeightAt(x, z, distance);
    },
    isOnRoad(x, z) {
      return nearestTrackPosition(samples, totalLength, x, z).distance <= TRACK.roadWidth / 2 + TRACK.shoulderWidth;
    },
    getSurface(x, z) {
      const { distance } = nearestTrackPosition(samples, totalLength, x, z);
      if (distance <= TRACK.roadWidth / 2 + TRACK.shoulderWidth) return 'road';
      return 'desert';
    },
  };
}
