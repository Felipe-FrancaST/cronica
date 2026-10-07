import * as THREE from 'three';
import { lightingCanvas, type SceneryLight, type MapLighting } from './scenery-lighting';

// Every emitter contributes to the ground field. A fixed pool lights nearby
// meshes in 3D, avoiding one shader/light/shadow pass per decorative object.
export class SceneryLightLayer {
  readonly group = new THREE.Group();
  private pool = Array.from({ length: 16 }, () => new THREE.PointLight('#ffd197', 0, 1, 1));
  private sources: SceneryLight[] = [];
  private mode: MapLighting = 'day';
  private budget = 16;
  private frustum = new THREE.Frustum();
  private matrix = new THREE.Matrix4();
  constructor(scene: THREE.Scene) {
    this.group.name = 'scenery-light-field';
    this.group.add(...this.pool);
    scene.add(this.group);
  }
  rebuild(width: number, height: number, mode: MapLighting, sources: SceneryLight[]) {
    this.sources = sources;
    this.mode = mode;
    this.updateVisibility();
    const previous = this.group.children.find((o) => o.name === 'light-glow') as
      THREE.Mesh | undefined;
    if (previous) {
      previous.geometry.dispose();
      const material = previous.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.group.remove(previous);
    }
    if (mode !== 'night' || !sources.length) return;
    const texture = new THREE.CanvasTexture(lightingCanvas(width, height, sources));
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    glow.name = 'light-glow';
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(width / 2, 0.13, height / 2);
    glow.renderOrder = 2;
    glow.raycast = () => {};
    this.group.add(glow);
  }
  setQuality(low: boolean) {
    this.budget = low ? 8 : 16;
    this.updateVisibility();
  }
  private updateVisibility() {
    for (let i = 0; i < this.pool.length; i++)
      this.pool[i].visible = i < Math.min(this.budget, this.sources.length);
  }
  update(camera: THREE.PerspectiveCamera) {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, THREE.WebGLCoordinateSystem);
    const point = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    const visible = this.sources
      .filter((source) => {
        sphere.center.set(source.x, source.height, source.y);
        sphere.radius = source.radius;
        return this.frustum.intersectsSphere(sphere);
      })
      .sort((a, b) => {
        const distance = (s: SceneryLight) =>
          point.set(s.x, s.height, s.y).distanceToSquared(camera.position) / s.strength;
        return distance(a) - distance(b);
      });
    for (let i = 0; i < this.pool.length; i++) {
      const light = this.pool[i],
        source = i < this.budget ? visible[i] : undefined;
      light.intensity = source ? source.strength * (this.mode === 'night' ? 6.5 : 1.2) : 0;
      if (!source) continue;
      light.position.set(source.x, Math.max(0.35, source.height), source.y);
      light.color.set(source.color);
      light.distance = source.radius;
    }
  }
}
