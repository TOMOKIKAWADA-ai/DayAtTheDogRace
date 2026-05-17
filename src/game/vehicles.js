import * as THREE from 'three';

const LOADED_CAR_GROUND_SINK = 0.06;
export const VEHICLE_GRAPHIC_SCALE = 1.5;

function enableShadows(root, enabled = true) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = enabled;
      child.receiveShadow = enabled;
    }
  });
}

function createVehicleMaterial(config, options = {}) {
  if (!options.simpleMaterials) {
    return new THREE.MeshStandardMaterial(config);
  }

  const materialConfig = {
    color: config.color,
    map: config.map ?? null,
    transparent: config.transparent ?? false,
    opacity: config.opacity ?? 1,
    alphaTest: config.alphaTest ?? 0,
    side: config.side ?? THREE.FrontSide,
  };

  if (config.emissive !== undefined) {
    materialConfig.emissive = config.emissive;
    materialConfig.emissiveIntensity = config.emissiveIntensity ?? 1;
  }

  return new THREE.MeshLambertMaterial(materialConfig);
}

function simplifyLoadedMaterial(material) {
  if (!material || material.isMeshLambertMaterial) return material;

  return new THREE.MeshLambertMaterial({
    name: material.name,
    color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
    map: material.map ?? null,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
    vertexColors: material.vertexColors,
  });
}

function simplifyLoadedMaterials(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => simplifyLoadedMaterial(material))
        : simplifyLoadedMaterial(child.material);
    }
  });
}

function alignLengthToForwardAxis(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.x > size.z * 1.25) {
    root.rotation.y -= Math.PI / 2;
  }
}

export function createFallbackCar(bodyColor, accentColor, options = {}) {
  const car = new THREE.Group();

  const bodyMaterial = createVehicleMaterial({
    color: bodyColor,
    roughness: 0.38,
    metalness: 0.3,
  }, options);
  const glassMaterial = createVehicleMaterial({
    color: 0xcfe7ff,
    roughness: 0.12,
    metalness: 0.15,
  }, options);
  const trimMaterial = createVehicleMaterial({
    color: accentColor,
    roughness: 0.68,
    metalness: 0.05,
  }, options);
  const tireMaterial = createVehicleMaterial({
    color: 0x101010,
    roughness: 0.92,
    metalness: 0.02,
  }, options);

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.92, 5.9), bodyMaterial);
  body.position.y = 0.92;
  car.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 1.8), bodyMaterial);
  hood.position.set(0, 1.2, 1.85);
  car.add(hood);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.86, 2.1), glassMaterial);
  cabin.position.set(0, 1.64, -0.35);
  car.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.18, 0.45), trimMaterial);
  spoiler.position.set(0, 1.55, -2.95);
  car.add(spoiler);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 0.18), trimMaterial);
  nose.position.set(0, 1.24, 3.04);
  car.add(nose);

  const tireGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.58, options.tireSegments ?? 18);
  tireGeometry.rotateZ(Math.PI / 2);
  const tirePositions = [
    [-1.85, 0.42, 1.8],
    [1.85, 0.42, 1.8],
    [-1.85, 0.42, -1.85],
    [1.85, 0.42, -1.85],
  ];

  for (const [x, y, z] of tirePositions) {
    const tire = new THREE.Mesh(tireGeometry, tireMaterial);
    tire.position.set(x, y, z);
    car.add(tire);
  }

  const headlightMaterial = createVehicleMaterial({
    color: 0xfff4bd,
    emissive: 0x8a6b25,
    emissiveIntensity: 0.5,
    roughness: 0.2,
  }, options);
  const leftLight = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.08), headlightMaterial);
  leftLight.position.set(-0.75, 1.03, 3.02);
  car.add(leftLight);

  const rightLight = leftLight.clone();
  rightLight.position.x = 0.75;
  car.add(rightLight);

  car.scale.setScalar(VEHICLE_GRAPHIC_SCALE);
  enableShadows(car, options.shadows ?? true);
  return car;
}

export function prepareLoadedCar(model, targetSize = new THREE.Vector3(3.5, 2.0, 6.0), options = {}) {
  const root = model.clone(true);
  const visual = new THREE.Group();
  enableShadows(root, options.shadows ?? true);
  if (options.simpleMaterials) simplifyLoadedMaterials(root);
  alignLengthToForwardAxis(root);

  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.lengthSq() === 0) {
    visual.add(root);
    return visual;
  }

  const scale = Math.min(targetSize.x / size.x, targetSize.y / size.y, targetSize.z / size.z)
    * VEHICLE_GRAPHIC_SCALE;
  root.scale.setScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const minY = scaledBounds.min.y;
  root.position.sub(center);
  root.position.y += center.y - minY - LOADED_CAR_GROUND_SINK;

  visual.add(root);
  return visual;
}

export function replaceVehicleVisual(vehicleRoot, currentVisual, nextVisual) {
  vehicleRoot.remove(currentVisual);
  vehicleRoot.add(nextVisual);
  return nextVisual;
}
