import * as THREE from 'three';
import { darknessCells, visionCell, type VisionMap } from './vision';
import type { BattleMap, BattleToken } from './types';

/**
 * Screen-space darkness for 3D. Composite the mask into the SAME WebGL frame,
 * then draw only the player's own tokens again on top of it.
 *
 * Keeping the token render in WebGL preserves the original miniature, portrait,
 * selection ring and name label instead of replacing it with initials. No hole
 * is opened in the darkness mask, so the terrain and other tokens stay hidden.
 */
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
  private ownedTokens: Pick<BattleToken, 'id' | 'x' | 'y' | 'size'>[] = [];

  private maskTexture: THREE.CanvasTexture;
  private maskScene = new THREE.Scene();
  private maskCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private maskGeometry = new THREE.PlaneGeometry(2, 2);
  private maskMaterial: THREE.MeshBasicMaterial;
  private tokenScene = new THREE.Scene();

  constructor(_host: HTMLElement) {
    // The low-resolution canvas is only a texture source. Showing it as a DOM
    // overlay would cover the original 3D tokens after rendering them.
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 1;
    this.maskTexture = new THREE.CanvasTexture(this.canvas);
    this.maskTexture.colorSpace = THREE.SRGBColorSpace;
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.magFilter = THREE.LinearFilter;
    this.maskMaterial = new THREE.MeshBasicMaterial({
      map: this.maskTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mask = new THREE.Mesh(this.maskGeometry, this.maskMaterial);
    mask.frustumCulled = false;
    this.maskScene.add(mask);
    this.maskCamera.position.z = 1;
    // Give the reused player miniature the same readable lighting as the
    // ordinary scene, even when the game world's ambient light is absent.
    this.tokenScene.add(
      new THREE.DirectionalLight('#ffe9bb', 2.7),
      new THREE.HemisphereLight('#e9efe1', '#18251e', 2.3),
    );
  }

  setVision(vision: VisionMap | undefined) {
    this.vision = vision;
    this.revision++;
    this.previous = '';
  }

  setOwnedTokens(tokens: BattleToken[]) {
    this.ownedTokens = tokens.map(({ id, x, y, size }) => ({ id, x, y, size }));
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
  }

  draw(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    getTokenGroup: (tokenId: string) => THREE.Group | null,
  ) {
    if (!this.vision?.enabled && !this.hasShade) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const scale = Math.max(5, rect.width / 320, rect.height / 200);
    const w = Math.max(1, Math.round(rect.width / scale));
    const h = Math.max(1, Math.round(rect.height / scale));
    const signature = `${this.revision}:${w}:${h}:${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if (signature !== this.previous) {
      this.previous = signature;
      this.canvas.width = w;
      this.canvas.height = h;
      const context = this.canvas.getContext('2d', { alpha: true });
      if (!context) return;
      const image = context.createImageData(w, h);
      const origin = camera.position;
      const plane = camera.projectionMatrixInverse.clone().premultiply(camera.matrixWorld);
      // Raster ray/ground intersections using a matrix (no raycaster per pixel).
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
            image.data[i] = 2;
            image.data[i + 1] = 5;
            image.data[i + 2] = 12;
            image.data[i + 3] = 255;
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
      this.maskTexture.needsUpdate = true;
    }

    // Render the mask directly over the already-rendered 3D frame. Repainting
    // the original token on top is now possible without exposing any scenery.
    const autoClear = renderer.autoClear;
    const hiddenGroups: Array<{ group: THREE.Group; parent: THREE.Object3D; index: number }> = [];
    try {
      renderer.autoClear = false;
      renderer.render(this.maskScene, this.maskCamera);
      for (const token of this.ownedTokens) {
        const cx = Math.floor(token.x + token.size / 2);
        const cy = Math.floor(token.y + token.size / 2);
        const shaded = cx >= 0 && cy >= 0 && cx < this.levelWidth && cy < this.levelHeight &&
          (this.levels?.[cy * this.levelWidth + cx] ?? 0) > 0;
        if (visionCell(this.vision, cx, cy) && !shaded) continue;
        const group = getTokenGroup(token.id);
        if (!group?.parent) continue;
        const parent = group.parent;
        hiddenGroups.push({ group, parent, index: parent.children.indexOf(group) });
        this.tokenScene.add(group);
      }
      if (!hiddenGroups.length) return;
      // Original meshes, textures, sprites and labels are re-rendered. Only
      // controlled tokens are in tokenScene; there are no map cells or enemies.
      renderer.clearDepth();
      renderer.render(this.tokenScene, camera);
    } finally {
      // Restore scene ownership even if the browser loses its WebGL context.
      for (const { group, parent, index } of hiddenGroups) {
        parent.add(group);
        const current = parent.children.indexOf(group);
        if (index >= 0 && current !== index) {
          parent.children.splice(current, 1);
          parent.children.splice(Math.min(index, parent.children.length), 0, group);
        }
      }
      renderer.autoClear = autoClear;
    }
  }

  dispose() {
    this.maskTexture.dispose();
    this.maskGeometry.dispose();
    this.maskMaterial.dispose();
    this.maskScene.clear();
    this.tokenScene.clear();
    this.canvas.remove();
  }
}
