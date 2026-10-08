import * as THREE from 'three';
import { darknessCells, visionCell, type VisionMap } from './vision';
import type { BattleMap, BattleToken } from './types';

/** Low-resolution screen-space darkness mask for 3D. Updates only after scene renders. */
export class VisionLayer {
  readonly canvas: HTMLCanvasElement;
  private vision: VisionMap | undefined;
  private revision = 0;
  private levels: Uint8Array | null = null;
  private hasShade = false;
  private levelWidth = 0;
  private levelHeight = 0;
  private previous = '';
  private projector = new THREE.Vector3();
  private ownedTokens: Pick<BattleToken, 'x' | 'y' | 'size' | 'name'>[] = [];
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
    if (!vision?.enabled && !this.hasShade) this.canvas.style.display = 'none';
    else {
      // Avoid exposing an unmasked frame during camera/character updates.
      this.canvas.width = this.canvas.height = 1;
      const context = this.canvas.getContext('2d');
      if (context) { context.fillStyle = '#02050c'; context.fillRect(0, 0, 1, 1); }
      this.canvas.style.display = 'block';
    }
  }
  /** Player markers float above the blindfold. They reveal no cells or scenery. */
  setOwnedTokens(tokens: BattleToken[]) {
    this.ownedTokens = tokens.map(({ x, y, size, name }) => ({ x, y, size, name }));
    this.revision++;
    this.previous = '';
  }
  setEnvironment(map: BattleMap) {
    this.levels = darknessCells(map);
    this.hasShade = this.levels.some(Boolean);
    this.levelWidth = map.width;
    this.levelHeight = map.height;
    this.revision++;
    this.previous = '';
    if (this.vision?.enabled || this.hasShade) this.canvas.style.display = 'block';
    else this.canvas.style.display = 'none';
  }
  draw(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    if (!this.vision?.enabled && !this.hasShade) return;
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
        const cx = Math.floor(gx), cy = Math.floor(gy);
        const i = (y * w + x) * 4;
        if (this.vision?.enabled && (t < 0 || !visionCell(this.vision, cx, cy))) {
          image.data[i] = 2; image.data[i + 1] = 5; image.data[i + 2] = 12; image.data[i + 3] = 255;
        } else if (t >= 0 && cx >= 0 && cy >= 0 && cx < this.levelWidth && cy < this.levelHeight) {
          const level = this.levels?.[cy * this.levelWidth + cx] ?? 0;
          if (level) {
            image.data[i] = level === 3 ? 27 : 7;
            image.data[i + 1] = level === 3 ? 6 : 12;
            image.data[i + 2] = level === 3 ? 49 : 34;
            image.data[i + 3] = level === 1 ? 80 : level === 2 ? 150 : 190;
          }
        }
      }
    }
    context.putImageData(image, 0, 0);
    if (this.vision?.enabled) {
      for (const token of this.ownedTokens) {
        const cx = Math.floor(token.x + token.size / 2);
        const cy = Math.floor(token.y + token.size / 2);
        // Overlay only if the token would otherwise be hidden by the black mask.
        if (visionCell(this.vision, cx, cy)) continue;
        this.projector.set(token.x + token.size / 2, 0.5, token.y + token.size / 2).project(camera);
        if (this.projector.z < -1 || this.projector.z > 1) continue;
        const sx = (this.projector.x + 1) * w / 2;
        const sy = (1 - this.projector.y) * h / 2;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const radius = 7;
        context.beginPath();
        context.arc(sx, sy, radius, 0, Math.PI * 2);
        context.fillStyle = '#283329';
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = '#f0cc68';
        context.stroke();
        context.fillStyle = '#ffffff';
        context.font = 'bold 9px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(token.name.slice(0, 2).toUpperCase(), sx, sy);
      }
    }
  }
  dispose() { this.canvas.remove(); }
}
