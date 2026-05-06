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

function makeCenterCurve() {
  const points = CENTER_POINTS.map(([x, z]) => new THREE.Vector3(x, TRACK.roadY, z));
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
      length += point.distanceTo(samples[i - 1].point);
    }

    samples.push({
      progress,
      point,
      tangent,
      normal,
      distance: length,
    });
  }

  const closing = samples[0].point.distanceTo(samples[samples.length - 1].point);
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
  const roadEdgeY = TRACK.roadY - 0.004;
  const desertEdgeY = TRACK.roadY - 0.012;

  for (const sample of samples) {
    const roadEdge = sample.point.clone().addScaledVector(sample.normal, side * halfWidth);
    const desertEdge = sample.point.clone().addScaledVector(sample.normal, side * (halfWidth + shoulderWidth));
    const v = (sample.distance / totalLength) * 30;

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
  const lineY = TRACK.roadY + 0.088;
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
      positions.push(point.x, lineY, point.z);
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

function createRoadLineStripGeometry(samples, totalLength, offset, width, y, patternLength) {
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

    positions.push(left.x, y, left.z, right.x, y, right.z);
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
      createRoadLineStripGeometry(samples, totalLength, offset, centerPatchWidth, TRACK.roadY + 0.086, 4.2),
      yellowMaterial,
    );
    line.renderOrder = 3;
    scene.add(line);
  }

  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(
      createRoadLineStripGeometry(samples, totalLength, side * halfWidth, edgePatchWidth, TRACK.roadY + 0.084, 2.9),
      whiteMaterial,
    );
    line.renderOrder = 3;
    scene.add(line);
  }
}

function nearestTrackPosition(samples, totalLength, x, z) {
  const target = new THREE.Vector3(x, TRACK.roadY, z);
  let bestDistanceSq = Infinity;
  let bestProgress = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const current = samples[i];
    const next = samples[(i + 1) % samples.length];
    const segment = next.point.clone().sub(current.point);
    const lengthSq = segment.lengthSq() || 1;
    const alpha = THREE.MathUtils.clamp(target.clone().sub(current.point).dot(segment) / lengthSq, 0, 1);
    const closest = current.point.clone().addScaledVector(segment, alpha);
    const distanceSq = closest.distanceToSquared(target);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestProgress = (current.normalizedDistance + alpha * (segment.length() / totalLength)) % 1;
    }
  }

  return {
    distance: Math.sqrt(bestDistanceSq),
    progress: bestProgress,
  };
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
  });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    map: textures.roadEdge,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 1020, 1, 1), grassMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const curve = makeCenterCurve();
  const { samples, totalLength } = createSamples(curve);
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
      };
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
