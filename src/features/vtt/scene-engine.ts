import * as THREE from 'three';
import { mapCellMetres } from './scenery-dimensions';
import { addSceneryMeshes, terrainMaterial } from './scenery-meshes';
import { surfaceObjectAt } from './scenery-surfaces';
import { SceneryLightLayer } from './scenery-light-layer';
import { sceneryLights, normalizeLighting, type MapLighting } from './scenery-lighting';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gridToWorld, worldToCell } from './interaction';
import { factionColor, effectBoundary, type EffectPreview } from './effects';
import type {
  BattleMap,
  BattleMapCell,
  BattleMapObject,
  BattleFogCell,
  BattleToken,
  GridPoint,
  MovementResult,
} from './types';
import type { CameraCommand, NavigationMode, SceneQuality } from './viewport-types';

function disposeGroup(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse((object) => {
    if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry)
      geometries.add(object.geometry);
    if ('material' in object) {
      const values = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of values) {
        if (!(material instanceof THREE.Material)) continue;
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  group.clear();
}

function textureFromCanvas(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function floorCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#303c32';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const noise = ((x * 37 + y * 17) % 23) / 160;
      ctx.fillStyle = `rgba(170,181,157,${noise})`;
      ctx.fillRect(x, y, 3, 3);
    }
  }
  return canvas;
}

function portraitCanvas(token: BattleToken, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(128, 128, 123, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#27352e';
  ctx.beginPath();
  ctx.arc(128, 128, 111, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4e6bf';
  ctx.font = '600 76px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(token.name.slice(0, 2).toUpperCase(), 128, 133);
  return canvas;
}

function labelSprite(name: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const text = name.length > 26 ? `${name.slice(0, 25)}…` : name;
  ctx.font = '600 30px sans-serif';
  canvas.width = Math.ceil(Math.min(510, ctx.measureText(text).width + 28));
  canvas.height = 72;
  ctx.font = '600 30px sans-serif';
  ctx.fillStyle = 'rgba(9,15,12,.9)';
  ctx.beginPath();
  ctx.roundRect(0, 2, canvas.width, 64, 10);
  ctx.fill();
  ctx.fillStyle = '#eee3c5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 34, canvas.width - 24);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: textureFromCanvas(canvas), depthWrite: false }),
  );
  sprite.name = 'token-label';
  sprite.userData.pixelWidth = canvas.width * 0.38;
  sprite.userData.pixelHeight = canvas.height * 0.38;
  sprite.position.y = 1.55;
  sprite.raycast = () => {};
  return sprite;
}

export interface ScenePick {
  objectId?: string;
  cell: GridPoint | null;
  tokenId: string | null;
}
interface TokenVisual {
  group: THREE.Group;
  key: string;
}

/** Owns GPU resources and projection only. Rules and writes remain outside this class. */
export class TacticalSceneEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 5000);
  readonly controls: OrbitControls;
  private board = new THREE.Group();
  private terrain = new THREE.Group();
  private fog = new THREE.Group();
  private scenery = new THREE.Group();
  private tokenLayer = new THREE.Group();
  private overlay = new THREE.Group();
  private tokens = new Map<string, TokenVisual>();
  private animations = new Map<
    string,
    { from: THREE.Vector3; to: THREE.Vector3; started: number }
  >();
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.025);
  private light = new THREE.DirectionalLight('#ffe9bb', 2.7);
  private hemisphere = new THREE.HemisphereLight('#e9efe1', '#18251e', 2.3);
  private localLights: SceneryLightLayer;
  private lightObjects: BattleMapObject[] = [];
  private lightFog: BattleFogCell[] = [];
  private observer: ResizeObserver;
  private frame = 0;
  private disposed = false;
  private sceneryClock = { value: 0 };
  private ambientMotion = false;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;
  private quality: SceneQuality = 'balanced';
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private boardRevision = 0;
  private selectedId: string | null = null;
  private activeId: string | null = null;
  private map: BattleMap;
  private polar = Math.PI / 3.3;
  private azimuth = Math.PI / 5;
  private onAssetError: () => void;
  private onUnavailable: () => void;
  private pendingImages = new Set<HTMLImageElement>();

  constructor(
    host: HTMLElement,
    map: BattleMap,
    quality: SceneQuality,
    onUnavailable: () => void,
    onAssetError: () => void,
  ) {
    this.map = map;
    this.onAssetError = onAssetError;
    this.onUnavailable = onUnavailable;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'default',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setClearColor('#101813');
    this.renderer.domElement.setAttribute('aria-label', 'Mapa tático 3D interativo');
    this.renderer.domElement.setAttribute('tabindex', '0');
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.controls.dampingFactor = 0.13;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.minPolarAngle = 0.015;
    this.controls.maxPolarAngle = Math.PI / 2.3;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = Math.max(map.width, map.height) * 6 + 20;
    this.controls.rotateSpeed = 0.6;
    this.controls.addEventListener('change', this.invalidate);
    this.scene.add(this.board, this.terrain, this.scenery, this.tokenLayer, this.overlay, this.fog);
    this.scene.add(this.hemisphere);
    this.localLights = new SceneryLightLayer(this.scene);
    this.light.position.set(map.width * 0.2, Math.max(map.width, map.height), map.height * 0.2);
    this.light.target.position.set(map.width / 2, 0, map.height / 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.left = -map.width;
    this.light.shadow.camera.right = map.width;
    this.light.shadow.camera.top = map.height;
    this.light.shadow.camera.bottom = -map.height;
    this.light.shadow.camera.far = Math.max(map.width, map.height) * 4 + 50;
    this.light.shadow.normalBias = 0.08;
    this.scene.add(this.light, this.light.target);
    this.setQuality(quality);
    this.configureNavigation('play');
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.motionQuery.addEventListener('change', this.visibilityChanged);
    this.renderer.shadowMap.autoUpdate = false;
    let firstResize = true;
    const resize = () => {
      if (this.disposed) return;
      const width = Math.max(1, host.clientWidth),
        height = Math.max(1, host.clientHeight);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      if (firstResize) {
        firstResize = false;
        this.fit();
      }
      this.invalidate();
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(host);
    resize();
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.onUnavailable();
  };
  private visibilityChanged = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (this.ambientTimer) clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    } else this.invalidate();
  };

  invalidate = () => {
    if (!this.disposed && !this.frame && !document.hidden)
      this.frame = requestAnimationFrame(this.render);
  };

  private render = () => {
    this.frame = 0;
    if (this.ambientTimer) clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
    if (this.disposed || document.hidden) return;
    const changed = this.controls.update();
    const time = performance.now();
    this.sceneryClock.value = this.motionQuery.matches ? 0 : time / 1000;
    if (this.animations.size) this.renderer.shadowMap.needsUpdate = true;
    for (const [id, animation] of this.animations) {
      const token = this.tokens.get(id);
      if (!token) {
        this.animations.delete(id);
        continue;
      }
      const t = Math.min(1, (time - animation.started) / 220);
      token.group.position.lerpVectors(animation.from, animation.to, 1 - (1 - t) ** 3);
      if (t === 1) this.animations.delete(id);
    }
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.localLights.update(this.camera);
    const cameraPoint = new THREE.Vector3();
    const viewportHeight = Math.max(1, this.renderer.domElement.clientHeight);
    for (const [id, visual] of this.tokens) {
      const label = visual.group.getObjectByName('token-label') as THREE.Sprite;
      label.getWorldPosition(cameraPoint).applyMatrix4(this.camera.matrixWorldInverse);
      const unitsPerPixel =
        (2 * Math.abs(cameraPoint.z) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
        viewportHeight;
      const cellPixels = visual.group.scale.x / unitsPerPixel;
      label.visible = id === this.selectedId || id === this.activeId || cellPixels >= 24;
      label.scale.set(
        (label.userData.pixelWidth * unitsPerPixel) / visual.group.scale.x,
        (label.userData.pixelHeight * unitsPerPixel) / visual.group.scale.y,
        1,
      );
    }
    this.renderer.render(this.scene, this.camera);
    if ((changed && this.controls.enableDamping) || this.animations.size) this.invalidate();
    else if (this.ambientMotion && this.quality === 'balanced' && !this.motionQuery.matches)
      this.ambientTimer = setTimeout(() => this.invalidate(), 33);
  };

  setQuality(quality: SceneQuality) {
    this.quality = quality;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.5),
    );
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.localLights.setQuality(quality === 'low');
    this.invalidate();
  }

  configureNavigation(mode: NavigationMode) {
    // Playing reserves the primary pointer for tokens. Two touches always navigate.
    this.controls.mouseButtons.LEFT =
      mode === 'orbit' ? THREE.MOUSE.ROTATE : mode === 'pan' ? THREE.MOUSE.PAN : null;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    this.controls.touches.ONE =
      mode === 'orbit' ? THREE.TOUCH.ROTATE : mode === 'pan' ? THREE.TOUCH.PAN : null;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  }

  private clearLayer(layer: THREE.Group) {
    disposeGroup(layer);
  }

  setBoard(map: BattleMap, backgroundUrl: string | null) {
    this.renderer.shadowMap.needsUpdate = true;
    const resized = this.map.width !== map.width || this.map.height !== map.height;
    this.map = map;
    this.setLighting(normalizeLighting(map.lighting));
    this.controls.maxDistance = Math.max(map.width, map.height) * 6 + 20;
    this.clearLayer(this.board);
    const revision = ++this.boardRevision;
    const center = new THREE.Vector3(map.width / 2, 0, map.height / 2);
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(map.width + 0.55, 0.4, map.height + 0.55),
      new THREE.MeshStandardMaterial({ color: '#1c2720', roughness: 0.7, metalness: 0.2 }),
    );
    plinth.position.copy(center).setY(-0.22);
    plinth.receiveShadow = true;
    this.board.add(plinth);
    const floorTexture = textureFromCanvas(floorCanvas());
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(map.width / 3, map.height / 3);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: floorTexture,
      roughness: 0.93,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.height), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(center).setY(0.015);
    floor.receiveShadow = true;
    this.board.add(floor);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(plinth.geometry),
      new THREE.LineBasicMaterial({ color: '#a0844d', transparent: true, opacity: 0.55 }),
    );
    edges.position.copy(plinth.position);
    this.board.add(edges);
    if (map.grid_visible) {
      const points: number[] = [];
      for (let x = 0; x <= map.width; x++) points.push(x, 0.034, 0, x, 0.034, map.height);
      for (let y = 0; y <= map.height; y++) points.push(0, 0.034, y, map.width, 0.034, y);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const night = normalizeLighting(map.lighting) === 'night';
      const grid = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: night ? '#a9bedb' : '#d4c797',
          transparent: true,
          opacity: map.grid_opacity * (night ? 0.38 : 1),
        }),
      );
      grid.name = 'grid-lines';
      this.board.add(grid);
    }
    const image = backgroundUrl ? new Image() : null;
    if (image) {
      this.pendingImages.add(image);
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        this.pendingImages.delete(image);
        if (this.disposed || revision !== this.boardRevision) return;
        const canvas = document.createElement('canvas');
        const ratio = Math.min(2048 / Math.max(map.width, map.height), 64);
        canvas.width = Math.max(1, Math.round(map.width * ratio));
        canvas.height = Math.max(1, Math.round(map.height * ratio));
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#303c32';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          image,
          (map.background_offset_x / map.cell_size) * ratio,
          (map.background_offset_y / map.cell_size) * ratio,
          map.width * map.background_scale * ratio,
          map.height * map.background_scale * ratio,
        );
        const texture = textureFromCanvas(canvas);
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        floorMaterial.map?.dispose();
        floorMaterial.map = texture;
        floorMaterial.needsUpdate = true;
        this.invalidate();
      };
      image.onerror = () => {
        this.pendingImages.delete(image);
        if (!this.disposed && revision === this.boardRevision) this.onAssetError();
      };
      image.src = backgroundUrl!;
    }
    this.light.position.set(map.width * 0.2, Math.max(map.width, map.height), map.height * 0.2);
    this.light.target.position.copy(center);
    this.light.shadow.camera.left = -map.width;
    this.light.shadow.camera.right = map.width;
    this.light.shadow.camera.top = map.height;
    this.light.shadow.camera.bottom = -map.height;
    this.light.shadow.camera.far = Math.max(map.width, map.height) * 4 + 50;
    this.light.shadow.camera.updateProjectionMatrix();
    if (resized) this.fit();
    this.invalidate();
  }

  setTerrain(cells: BattleMapCell[]) {
    this.renderer.shadowMap.needsUpdate = true;
    this.clearLayer(this.terrain);
    const buckets = new Map<string, BattleMapCell[]>();
    for (const cell of cells) {
      const type = cell.blocked
        ? 'blocked'
        : /water|água|agua|ice|gelo/i.test(cell.terrain_type)
          ? 'water'
          : cell.movement_cost > 1
            ? 'difficult'
            : 'custom';
      const list = buckets.get(type) ?? [];
      list.push(cell);
      buckets.set(type, list);
    }
    for (const [type, entries] of buckets) {
      const height = type === 'blocked' ? 0.95 : type === 'difficult' ? 0.14 : 0.05;
      const material = terrainMaterial(
        type === 'water' ? 'water' : type === 'blocked' ? 'stone' : 'ground',
      );
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.94, height, 0.94),
        material,
        entries.length,
      );
      const matrix = new THREE.Matrix4();
      entries.forEach((cell, index) =>
        mesh.setMatrixAt(
          index,
          matrix.makeTranslation(cell.x + 0.5, cell.z + height / 2 + 0.035, cell.y + 0.5),
        ),
      );
      mesh.userData.cells = entries;
      mesh.castShadow = type === 'blocked';
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.terrain.add(mesh);
      if (type === 'blocked') {
        const caps = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.99, 0.08, 0.99),
          new THREE.MeshStandardMaterial({ color: '#939482', roughness: 0.9 }),
          entries.length,
        );
        entries.forEach((cell, index) =>
          caps.setMatrixAt(
            index,
            matrix.makeTranslation(cell.x + 0.5, cell.z + height + 0.035, cell.y + 0.5),
          ),
        );
        caps.userData.cells = entries;
        caps.computeBoundingSphere();
        this.terrain.add(caps);
      }
    }
    this.invalidate();
  }

  setScenery(objects: BattleMapObject[]) {
    this.lightObjects = objects;
    this.refreshLights();
    this.clearLayer(this.scenery);
    addSceneryMeshes(this.scenery, objects, this.sceneryClock, mapCellMetres(this.map));
    this.ambientMotion = objects.some(
      (o) =>
        o.object_type === 'fire' ||
        o.object_type === 'campfire' ||
        (o.object_type === 'torch' && (!o.metadata.variant || o.metadata.variant === 'default')),
    );
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }

  setTokens(
    tokens: BattleToken[],
    urls: Record<string, string>,
    selectedId: string | null,
    activeId: string | null,
  ) {
    this.renderer.shadowMap.needsUpdate = true;
    this.selectedId = selectedId;
    this.activeId = activeId;
    const ids = new Set(tokens.map((token) => token.id));
    for (const [id, visual] of this.tokens) {
      if (!ids.has(id)) {
        this.tokenLayer.remove(visual.group);
        disposeGroup(visual.group);
        this.tokens.delete(id);
        this.animations.delete(id);
      }
    }
    for (const token of tokens) {
      const color = factionColor(token);
      const key = `${token.name}:${token.size}:${token.visible}:${urls[token.id] ?? ''}:${color}:${token.id === selectedId}:${token.id === activeId}`;
      let visual = this.tokens.get(token.id);
      const position = gridToWorld(token, token.size);
      const target = new THREE.Vector3(position.x, position.y + 0.04, position.z);
      if (!visual || visual.key !== key) {
        const previous = visual?.group.position.clone();
        if (visual) {
          this.tokenLayer.remove(visual.group);
          disposeGroup(visual.group);
        }
        const group = this.createToken(token, color, urls[token.id]);
        if (token.id === selectedId || token.id === activeId) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.45 * token.size, 0.5 * token.size, 36),
            new THREE.MeshBasicMaterial({
              color: token.id === selectedId ? '#efcd74' : '#e7ede9',
              side: THREE.DoubleSide,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.03;
          group.add(ring);
        }
        group.position.copy(previous ?? target);
        this.tokenLayer.add(group);
        visual = { group, key };
        this.tokens.set(token.id, visual);
      }
      if (visual.group.position.distanceTo(target) > 0.001) {
        if (this.controls.enableDamping)
          this.animations.set(token.id, {
            from: visual.group.position.clone(),
            to: target,
            started: performance.now(),
          });
        else visual.group.position.copy(target);
      }
    }
    this.invalidate();
  }

  private createToken(token: BattleToken, color: string, url?: string) {
    const group = new THREE.Group();
    group.userData.tokenId = token.id;
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.28,
      roughness: 0.45,
      transparent: !token.visible,
      opacity: token.visible ? 1 : 0.42,
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.15, 24), material);
    base.position.y = 0.09;
    base.castShadow = true;
    group.add(base);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 0.46, 16), material);
    body.position.y = 0.39;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), material);
    head.position.y = 0.72;
    group.add(head);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.025, 8, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: !token.visible,
        opacity: token.visible ? 1 : 0.42,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    group.add(ring);
    const canvas = portraitCanvas(token, color);
    const texture = textureFromCanvas(canvas);
    const portrait = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        depthWrite: false,
        transparent: true,
        opacity: token.visible ? 1 : 0.42,
      }),
    );
    portrait.scale.set(0.83, 0.83, 1);
    portrait.position.y = 0.95;
    group.add(portrait);
    group.add(labelSprite(token.visible ? token.name : `${token.name} · oculto`));
    group.scale.setScalar(Math.max(0.25, token.size));
    if (url) {
      const image = new Image();
      this.pendingImages.add(image);
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        this.pendingImages.delete(image);
        if (this.disposed || !group.parent) return;
        const ctx = canvas.getContext('2d')!;
        ctx.save();
        ctx.beginPath();
        ctx.arc(128, 128, 111, 0, Math.PI * 2);
        ctx.clip();
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        ctx.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          17,
          17,
          222,
          222,
        );
        ctx.restore();
        texture.needsUpdate = true;
        this.invalidate();
      };
      image.onerror = () => {
        this.pendingImages.delete(image);
        if (!this.disposed && group.parent) this.onAssetError();
      };
      image.src = url;
    }
    return group;
  }

  setOverlay(
    reachable: Map<string, number>,
    preview: MovementResult | null,
    from: BattleToken | null,
    hover: GridPoint | null,
    effect?: EffectPreview | null,
  ) {
    this.clearLayer(this.overlay);
    const tiles = (points: GridPoint[], color: string, opacity: number, level: number) => {
      if (!points.length) return;
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.91, 0.91),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        points.length,
      );
      const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      const matrix = new THREE.Matrix4();
      points.forEach((point, index) => {
        matrix.copy(rotation);
        matrix.setPosition(point.x + 0.5, level, point.y + 0.5);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.computeBoundingSphere();
      this.overlay.add(mesh);
    };
    if (effect) {
      tiles(
        effect.cells,
        !effect.valid
          ? '#ef7777'
          : effect.kind === 'healing' || effect.kind === 'temporary'
            ? '#69e3a9'
            : effect.kind === 'damage'
              ? '#ee8265'
              : '#73c8ee',
        0.7,
        0.24,
      );
      const area = this.overlay.children.at(-1);
      if (area instanceof THREE.InstancedMesh) {
        (area.material as THREE.MeshBasicMaterial).depthTest = false;
        area.renderOrder = 12;
      }
      const outline = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(
          effectBoundary(effect.cells).flatMap(([a, b]) => [
            new THREE.Vector3(a.x, 0.27, a.y),
            new THREE.Vector3(b.x, 0.27, b.y),
          ]),
        ),
        new THREE.LineBasicMaterial({
          color: effect.valid ? '#fff4cb' : '#ff5353',
          depthTest: false,
        }),
      );
      outline.renderOrder = 13;
      this.overlay.add(outline);
    }
    tiles(
      [...reachable.keys()].map((key) => {
        const [x, y] = key.split(':').map(Number);
        return { x, y };
      }),
      '#8bbf92',
      0.2,
      0.205,
    );
    if (preview?.path.length && from) {
      const color = preview.allowed ? '#eed28a' : '#db756b';
      tiles(preview.path, color, 0.38, 0.22);
      const points = [from, ...preview.path].map(
        (point) => new THREE.Vector3(point.x + 0.5, 0.245, point.y + 0.5),
      );
      this.overlay.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color }),
        ),
      );
      const end = preview.path[preview.path.length - 1];
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.28, 24),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(end.x + 0.5, 0.25, end.y + 0.5);
      this.overlay.add(marker);
    }
    if (hover) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(hover.x, 0.26, hover.y),
        new THREE.Vector3(hover.x + 1, 0.26, hover.y),
        new THREE.Vector3(hover.x + 1, 0.26, hover.y + 1),
        new THREE.Vector3(hover.x, 0.26, hover.y + 1),
        new THREE.Vector3(hover.x, 0.26, hover.y),
      ]);
      this.overlay.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#fff0bf' })));
    }
    this.invalidate();
  }

  pick(clientX: number, clientY: number, inspect = false, groundOnly = false): ScenePick {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return { cell: null, tokenId: null };
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    if (!groundOnly) {
      // Only tokens consume the click in play mode. Broad surface meshes must never redirect it to their anchor.
      const hits = this.raycaster.intersectObjects(
        inspect ? [this.scenery] : [this.tokenLayer],
        true,
      );
      for (const hit of hits) {
        if (inspect && hit.object.userData.surfacePlan) {
          const owner = surfaceObjectAt(
            hit.object.userData.surfacePlan,
            hit.point.x,
            hit.point.z,
            hit.object.userData.surfaceKey,
          );
          if (owner)
            return {
              cell: worldToCell(hit.point.x, hit.point.z, this.map.width, this.map.height),
              tokenId: null,
              objectId: owner.id,
            };
        }
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.tokenId) object = object.parent;
        if (object?.userData.tokenId) {
          const visual = this.tokens.get(object.userData.tokenId);
          return {
            cell: visual
              ? worldToCell(
                  visual.group.position.x,
                  visual.group.position.z,
                  this.map.width,
                  this.map.height,
                )
              : null,
            tokenId: object.userData.tokenId,
          };
        }
        if (inspect && hit.instanceId !== undefined && hit.object.userData.sceneryCells)
          return {
            cell: hit.object.userData.sceneryCells[hit.instanceId],
            tokenId: null,
            objectId: hit.object.userData.sceneryIds?.[hit.instanceId],
          };
      }
    }
    const p = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    return {
      cell: p ? worldToCell(p.x, p.z, this.map.width, this.map.height) : null,
      tokenId: null,
    };
  }

  setFog(cells: BattleFogCell[], master: boolean) {
    this.lightFog = cells;
    this.refreshLights();
    this.clearLayer(this.fog);
    if (cells.length) {
      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1.006, 1.006),
        new THREE.MeshBasicMaterial({
          color: '#000000',
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: master ? 0.88 : 1,
        }),
        cells.length,
      );
      const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2),
        matrix = new THREE.Matrix4();
      cells.forEach((c, i) => {
        matrix.copy(rotation).setPosition(c.x + 0.5, 0.29, c.y + 0.5);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.renderOrder = 1000;
      mesh.computeBoundingSphere();
      this.fog.add(mesh);
    }
    this.invalidate();
  }

  setLighting(mode: MapLighting) {
    this.map = { ...this.map, lighting: mode };
    this.hemisphere.color.set(mode === 'night' ? '#869aca' : '#e9efe1');
    this.hemisphere.groundColor.set(mode === 'night' ? '#111829' : '#18251e');
    this.hemisphere.intensity = mode === 'night' ? 0.48 : 2.3;
    this.light.color.set(mode === 'night' ? '#a8c5ff' : '#ffe9bb');
    this.light.intensity = mode === 'night' ? 0.62 : 2.7;
    this.renderer.setClearColor(mode === 'night' ? '#080e1c' : '#101813');
    this.renderer.toneMappingExposure = mode === 'night' ? 1.02 : 1.1;
    const grid = this.board.getObjectByName('grid-lines') as THREE.LineSegments | undefined;
    if (grid) {
      const material = grid.material as THREE.LineBasicMaterial;
      material.color.set(mode === 'night' ? '#a9bedb' : '#d4c797');
      material.opacity = this.map.grid_opacity * (mode === 'night' ? 0.38 : 1);
    }
    this.refreshLights();
    this.renderer.shadowMap.needsUpdate = true;
    this.invalidate();
  }
  private refreshLights() {
    this.localLights.rebuild(
      this.map.width,
      this.map.height,
      normalizeLighting(this.map.lighting),
      sceneryLights(this.lightObjects, this.map, this.lightFog),
    );
  }

  private settleControls() {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  private fit() {
    this.settleControls();
    const radius = Math.hypot(this.map.width, this.map.height) / 2 + 1.2;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.02;
    this.controls.target.set(this.map.width / 2, 0, this.map.height / 2);
    this.camera.position
      .copy(this.controls.target)
      .add(new THREE.Vector3().setFromSphericalCoords(distance, this.polar, this.azimuth));
    this.controls.update();
    this.controls.saveState();
    this.invalidate();
  }

  command(command: CameraCommand) {
    this.settleControls();
    if (command.action === 'fit') this.fit();
    else if (command.action === 'zoom-in') {
      this.controls.dollyIn(1 / 1.2);
      this.controls.update();
    } else if (command.action === 'zoom-out') {
      this.controls.dollyOut(1 / 1.2);
      this.controls.update();
    } else if (command.action === 'rotate-left' || command.action === 'rotate-right') {
      this.controls.rotateLeft(command.action === 'rotate-left' ? Math.PI / 4 : -Math.PI / 4);
      this.controls.update();
    } else if (command.action === 'center' || command.action === 'focus') {
      const selected = this.selectedId ? this.tokens.get(this.selectedId) : null;
      const target =
        command.action === 'focus' && selected
          ? selected.group.position.clone().setY(0)
          : new THREE.Vector3(this.map.width / 2, 0, this.map.height / 2);
      this.camera.position.add(target.clone().sub(this.controls.target));
      this.controls.target.copy(target);
      if (command.action === 'focus' && selected) {
        const distance = Math.max(
          this.controls.minDistance,
          Math.min(this.controls.getDistance(), 12 * selected.group.scale.x),
        );
        const direction = this.camera.position.clone().sub(target).normalize();
        this.camera.position.copy(target).add(direction.multiplyScalar(distance));
      }
      this.controls.update();
    } else if (command.action === 'isometric' || command.action === 'top') {
      this.polar = command.action === 'top' ? 0.015 : Math.PI / 3.3;
      this.azimuth = command.action === 'top' ? 0 : Math.PI / 5;
      const distance = this.controls.getDistance();
      this.camera.position
        .copy(this.controls.target)
        .add(new THREE.Vector3().setFromSphericalCoords(distance, this.polar, this.azimuth));
      this.controls.update();
    }
    this.invalidate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.ambientTimer) clearTimeout(this.ambientTimer);
    this.motionQuery.removeEventListener('change', this.visibilityChanged);
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    for (const image of this.pendingImages) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }
    this.pendingImages.clear();
    disposeGroup(this.scene);
    this.light.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.tokens.clear();
    this.animations.clear();
  }
}
