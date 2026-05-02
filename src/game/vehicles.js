import * as THREE from 'three';

const LOADED_CAR_GROUND_SINK = 0.06;
export const VEHICLE_GRAPHIC_SCALE = 1.5;

function enableShadows(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
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

export function createFallbackCar(bodyColor, accentColor) {
  const car = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.38,
    metalness: 0.3,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfe7ff,
    roughness: 0.12,
    metalness: 0.15,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.68,
    metalness: 0.05,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({
    color: 0x101010,
    roughness: 0.92,
    metalness: 0.02,
  });

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

  const tireGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.58, 18);
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

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff4bd,
    emissive: 0x8a6b25,
    emissiveIntensity: 0.5,
    roughness: 0.2,
  });
  const leftLight = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.08), headlightMaterial);
  leftLight.position.set(-0.75, 1.03, 3.02);
  car.add(leftLight);

  const rightLight = leftLight.clone();
  rightLight.position.x = 0.75;
  car.add(rightLight);

  car.scale.setScalar(VEHICLE_GRAPHIC_SCALE);
  enableShadows(car);
  return car;
}

export function prepareLoadedCar(model, targetSize = new THREE.Vector3(3.5, 2.0, 6.0)) {
  const root = model.clone(true);
  enableShadows(root);
  alignLengthToForwardAxis(root);

  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());

  if (size.lengthSq() === 0) {
    return root;
  }

  const scale = Math.min(targetSize.x / size.x, targetSize.y / size.y, targetSize.z / size.z)
    * VEHICLE_GRAPHIC_SCALE;
  root.scale.setScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const minY = scaledBounds.min.y;
  root.position.sub(center);
  root.position.y += center.y - minY - LOADED_CAR_GROUND_SINK;

  return root;
}

export function replaceVehicleVisual(vehicleRoot, currentVisual, nextVisual) {
  vehicleRoot.remove(currentVisual);
  vehicleRoot.add(nextVisual);
  return nextVisual;
}
