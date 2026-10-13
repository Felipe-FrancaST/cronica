import * as THREE from 'three';
import { lightingCanvas, type SceneryLight, type MapLighting } from './scenery-lighting';

// Every emitter contributes to the ground field. A fixed pool lights nearby
// meshes in 3D, avoiding one shader/light/shadow pass per decorative object.
export class SceneryLightLayer {
  readonly group = new THREE.Group();
  private pool = Array.from({ length: 16 }, () => new THREE.PointLight('#ffd197', 0, 1, 2));
  private sources: SceneryLight[] = [];
  private mode: MapLighting = 'day';
  private budget = 16;
  private frustum = new THREE.Frustum();
  private matrix = new THREE.Matrix4();
  private assignments: Array<SceneryLight | undefined> = new Array(16);
  private previousTime = 0;
  private signature = '';
  private point = new THREE.Vector3();
  private sphere = new THREE.Sphere();
  constructor(scene: THREE.Scene) {
    this.group.name = 'scenery-light-field';
    this.group.add(...this.pool);
    scene.add(this.group);
  }
  rebuild(width: number, height: number, mode: MapLighting, sources: SceneryLight[]) {
    const signature = JSON.stringify([width, height, mode, sources]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.sources = sources;
    this.mode = mode;
    const previous = this.group.children.find((o) => o.name === 'light-glow') as
      THREE.Mesh | undefined;
    if (previous) {
      previous.geometry.dispose();
      const material = previous.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.group.remove(previous);
    }
    if (!sources.length || typeof document === 'undefined') return;
    const texture = new THREE.CanvasTexture(lightingCanvas(width, height, sources));
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      opacity: mode === 'night' ? 1 : 0.22,
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
  }
  update(camera: THREE.PerspectiveCamera, time = performance.now(), immediate = false) {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, THREE.WebGLCoordinateSystem);
    const retained = new Set(this.assignments.map((s) => s?.id));
    const score = (s: SceneryLight) =>
      (this.point.set(s.x, s.height, s.y).distanceToSquared(camera.position) /
        Math.max(0.01, s.strength)) *
      (retained.has(s.id) ? 0.85 : 1);
    const visible = this.sources
      .filter((source) => {
        this.sphere.center.set(source.x, source.height, source.y);
        this.sphere.radius = source.radius;
        return this.frustum.intersectsSphere(this.sphere);
      })
      .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
      .slice(0, this.budget);
    const selected = new Map(visible.map((source) => [source.id, source]));
    const desired = this.assignments.map((source, i) =>
      i < this.budget && source ? selected.get(source.id) : undefined,
    );
    const used = new Set(desired.map((source) => source?.id));
    const remaining = visible.filter((source) => !used.has(source.id));
    for (let i = 0; i < this.budget; i++) desired[i] ??= remaining.shift();
    const delta = this.previousTime ? (time - this.previousTime) / 1000 : 1 / 60;
    this.previousTime = time;
    const blend = immediate ? 1 : 1 - Math.exp(-Math.max(0.001, Math.min(0.05, delta)) / 0.1);
    let changing = false;
    for (let i = 0; i < this.pool.length; i++) {
      const light = this.pool[i];
      const next = desired[i];
      const current = this.assignments[i];
      if (immediate || !current || current.id === next?.id || light.intensity < 0.01)
        this.assignments[i] = next;
      const source = this.assignments[i];
      const target =
        source && source.id === next?.id ? source.strength * (this.mode === 'night' ? 9 : 2) : 0;
      light.intensity += (target - light.intensity) * blend;
      if (Math.abs(target - light.intensity) < 0.01) light.intensity = target;
      else changing = true;
      if (source?.id !== next?.id) changing = true;
      // Keep the pool in the scene even at intensity zero: changing the number
      // of visible lights would recompile every scenery shader during a pan.
      light.visible = true;
      if (!source) continue;
      light.position.set(source.x, Math.max(0.35, source.height), source.y);
      light.color.set(source.color);
      light.distance = source.radius;
    }
    return changing;
  }
}
