import * as THREE from 'three';
import { TRACK } from './config.js';

const CENTER_POINTS = [
  [-70, -132],
  [-12, -138],
  [42, -126],
  [78, -94],
  [114, -54],
  [150, -14],
  [185, 30],
  [210, 78],
  [207, 115],
  [190, 150],
  [160, 172],
  [118, 176],
  [82, 155],
  [58, 126],
  [24, 118],
  [-25, 146],
  [-70, 138],
  [-111, 102],
  [-136, 60],
  [-145, 18],
  [-139, -24],
  [-126, -66],
  [-105, -105],
];

function makeCenterCurve() {
  const points = CENTER_POINTS.map(([x, z]) => new THREE.Vector3(x, TRACK.roadY, z));
  return new THREE.CatmullRomCurve3(points, true, 'centripetal');
}

function createSamples(curve, count = 1200) {
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
  const blockWidth = 0.78;
  const blockDepth = TRACK.roadWidth / 8;
  const start = pointAtDistance(samples, totalLength, 0);
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f6ee, roughness: 0.55 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111514, roughness: 0.66 });

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const material = (row + col) % 2 === 0 ? white : black;
      const block = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, 0.045, blockDepth), material);
      const point = start.point
        .clone()
        .addScaledVector(start.tangent, (row - 0.5) * blockWidth)
        .addScaledVector(start.normal, (col - 3.5) * blockDepth);

      block.position.set(point.x, TRACK.roadY + 0.058, point.z);
      block.rotation.y = Math.atan2(start.tangent.x, start.tangent.z);
      block.receiveShadow = true;
      scene.add(block);
    }
  }
}

function addHighwayLines(scene, samples, totalLength) {
  const yellowMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8a13c,
    roughness: 0.74,
    emissive: 0x211707,
  });
  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8d0bd,
    roughness: 0.82,
    emissive: 0x16130f,
  });
  const centerGeometry = new THREE.BoxGeometry(0.32, 0.032, 3.9);
  const edgeGeometry = new THREE.BoxGeometry(0.28, 0.032, 2.8);
  const spacing = 6.2;
  const count = Math.floor(totalLength / spacing);
  const halfWidth = TRACK.roadWidth / 2 - 1.05;

  for (let i = 0; i < count; i += 1) {
    const base = pointAtDistance(samples, totalLength, i * spacing);

    for (const offset of [-0.46, 0.46]) {
      const line = new THREE.Mesh(centerGeometry, yellowMaterial);
      const point = base.point.clone().addScaledVector(base.normal, offset);
      line.position.set(point.x, TRACK.roadY + 0.062, point.z);
      line.rotation.y = Math.atan2(base.tangent.x, base.tangent.z);
      line.receiveShadow = true;
      scene.add(line);
    }

    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const line = new THREE.Mesh(edgeGeometry, whiteMaterial);
        const point = base.point.clone().addScaledVector(base.normal, side * halfWidth);
        line.position.set(point.x, TRACK.roadY + 0.064, point.z);
        line.rotation.y = Math.atan2(base.tangent.x, base.tangent.z);
        line.receiveShadow = true;
        scene.add(line);
      }
    }
  }
}

function createCactus(x, z, scale, material) {
  const cactus = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * scale, 0.55 * scale, 5.2 * scale, 8), material);
  trunk.position.y = 2.6 * scale;
  trunk.castShadow = true;
  cactus.add(trunk);

  const armGeometry = new THREE.CylinderGeometry(0.25 * scale, 0.31 * scale, 2.2 * scale, 8);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeometry, material);
    arm.position.set(side * 0.92 * scale, 2.95 * scale, 0);
    arm.rotation.z = side * Math.PI / 2.8;
    arm.castShadow = true;
    cactus.add(arm);

    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.26 * scale, 1.45 * scale, 8), material);
    tip.position.set(side * 1.72 * scale, 3.5 * scale, 0);
    tip.castShadow = true;
    cactus.add(tip);
  }

  cactus.position.set(x, 0, z);
  cactus.rotation.y = Math.random() * Math.PI * 2;
  return cactus;
}

function isClearOfTrack(samples, totalLength, x, z, clearance = 0) {
  return nearestTrackPosition(samples, totalLength, x, z).distance > TRACK.roadWidth / 2 + TRACK.shoulderWidth + clearance;
}

function addScenery(scene, samples, totalLength) {
  const cactusMaterial = new THREE.MeshStandardMaterial({ color: 0x586339, roughness: 0.96 });
  const brushMaterial = new THREE.MeshStandardMaterial({ color: 0x625130, roughness: 0.98 });
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7a65, roughness: 0.9 });

  const cactusPositions = [
    [-174, -104, 0.92],
    [-178, 106, 0.72],
    [190, 112, 0.8],
    [168, -86, 1.04],
    [-178, 8, 0.62],
    [186, 24, 0.86],
    [-12, 138, 0.58],
    [34, -132, 0.66],
    [178, 136, 0.68],
    [-150, -126, 0.76],
  ];

  for (const [x, z, scale] of cactusPositions) {
    if (!isClearOfTrack(samples, totalLength, x, z, 8)) continue;
    scene.add(createCactus(x, z, scale, cactusMaterial));
  }

  for (let i = 0; i < 44; i += 1) {
    const angle = (i / 44) * Math.PI * 2 + Math.random() * 0.08;
    const rx = 96 + Math.random() * 92;
    const rz = 70 + Math.random() * 58;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52 + Math.random() * 1.35), rockMaterial);
    rock.position.set(Math.cos(angle) * rx, 0.45, Math.sin(angle) * rz);
    if (!isClearOfTrack(samples, totalLength, rock.position.x, rock.position.z, 4)) continue;
    rock.rotation.set(i * 0.3, i * 0.18, i * 0.11);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  const brushGeometry = new THREE.ConeGeometry(0.8, 1.55, 7);
  for (let i = 0; i < 90; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radiusX = 34 + Math.random() * 155;
    const radiusZ = 26 + Math.random() * 105;
    const brush = new THREE.Mesh(brushGeometry, brushMaterial);
    brush.position.set(Math.cos(angle) * radiusX, 0.78, Math.sin(angle) * radiusZ);
    if (!isClearOfTrack(samples, totalLength, brush.position.x, brush.position.z, 4)) continue;
    brush.scale.setScalar(0.65 + Math.random() * 0.9);
    brush.rotation.set(0, Math.random() * Math.PI * 2, 0.1 - Math.random() * 0.2);
    brush.castShadow = true;
    scene.add(brush);
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
    color: 0xb0946a,
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

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 620, 1, 1), grassMaterial);
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
  addScenery(scene, samples, totalLength);

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
