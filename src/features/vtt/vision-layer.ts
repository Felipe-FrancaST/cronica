import * as THREE from 'three';
import { visionCell, type VisionMap } from './vision';

/** Low-resolution screen-space darkness mask for 3D. Updates only after scene renders. */
export class VisionLayer {
  readonly canvas: HTMLCanvasElement;
  private vision: VisionMap | undefined;
  private revision = 0;
  private previous = '';
  private projector = new THREE.Vector3();
  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vtt-vision-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
  }
  setVision(vision: VisionMap | undefined) {
    this.vision = vision;
    this.revision++;
    this.previous = '';
    if (!vision?.enabled) this.canvas.style.display = 'none';
    else {
      // Avoid exposing an unmasked frame during camera/character updates.
      this.canvas.width = this.canvas.height = 1;
      const context = this.canvas.getContext('2d');
      if (context) { context.fillStyle = '#02050c'; context.fillRect(0, 0, 1, 1); }
      this.canvas.style.display = 'block';
    }
  }
  draw(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    if (!this.vision?.enabled) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const scale = Math.max(5, rect.width / 320, rect.height / 200);
    const w = Math.max(1, Math.round(rect.width / scale)), h = Math.max(1, Math.round(rect.height / scale));
    const signature = `${this.revision}:${w}:${h}:${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if (signature === this.previous) return;
    this.previous = signature;
    this.canvas.width = w; this.canvas.height = h;
    const context = this.canvas.getContext('2d', { alpha: true });
    if (!context) return;
    const image = context.createImageData(w, h);
    const origin = camera.position;
    const plane = camera.projectionMatrixInverse.clone().premultiply(camera.matrixWorld);
    // Raster ray/ground intersections using a matrix (no raycaster or geometry per pixel).
    for (let y = 0; y < h; y++) {
      const ny = 1 - 2 * (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const nx = 2 * (x + 0.5) / w - 1;
        this.projector.set(nx, ny, 0.5).applyMatrix4(plane);
        const dy = this.projector.y - origin.y;
        const t = dy < -0.000001 ? -origin.y / dy : -1;
        const gx = origin.x + (this.projector.x - origin.x) * t;
        const gy = origin.z + (this.projector.z - origin.z) * t;
        if (t < 0 || !visionCell(this.vision, Math.floor(gx), Math.floor(gy))) {
          const i = (y * w + x) * 4;
          image.data[i] = 2; image.data[i + 1] = 5; image.data[i + 2] = 12; image.data[i + 3] = 255;
        }
      }
    }
    context.putImageData(image, 0, 0);
  }
  dispose() { this.canvas.remove(); }
}
