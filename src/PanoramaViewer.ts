import * as THREE from 'three';

export class PanoramaViewer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cylinder?: THREE.Mesh;

  /** 水平回転角度 (度) */
  private lon = 0;
  /** 垂直回転角度 (度) */
  private lat = 0;
  /** 垂直回転の上下限 (度) — 画像読み込み後に更新 */
  private latLimit = 45;

  /** カメラ視野角 (度) */
  private fov = 75;
  private readonly FOV_MIN = 30;
  private readonly FOV_MAX = 120;

  /** ドラッグ状態 */
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  /** ピンチズーム用 */
  private lastPinchDistance = 0;

  /** 慣性スクロール用 */
  private velocityLon = 0;
  private velocityLat = 0;
  private readonly INERTIA_DECAY = 0.92;

  /** アニメーションフレームID */
  private animFrameId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      this.fov,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 0);

    this.setupEventListeners();
    this.animate();

    window.addEventListener('resize', this.onResize);
  }

  // ──────────────────────────────────────────────
  // 画像読み込み
  // ──────────────────────────────────────────────

  loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          this.buildCylinder(texture);
          resolve();
        },
        undefined,
        reject,
      );
    });
  }

  private buildCylinder(texture: THREE.Texture): void {
    // 古いメッシュを破棄
    if (this.cylinder) {
      this.scene.remove(this.cylinder);
      this.cylinder.geometry.dispose();
      (this.cylinder.material as THREE.Material).dispose();
    }

    const imgW: number = (texture.image as HTMLImageElement).naturalWidth;
    const imgH: number = (texture.image as HTMLImageElement).naturalHeight;
    const aspect = imgW / imgH;

    // 水平方向は常に 360° としてマッピング（スマホパノラマは概ね全周対応）
    const RADIUS = 10;
    const THETA_LENGTH = Math.PI * 2; // 360°

    // 画像の縦横比からシリンダー高さを決定（正しい縦比を保つ）
    // 周囲長 = 2π × radius、高さ = 周囲長 / aspect
    const height = (THETA_LENGTH * RADIUS) / aspect;

    // 垂直制限角度: arctan(height/2 / radius)
    this.latLimit = THREE.MathUtils.radToDeg(Math.atan2(height / 2, RADIUS));

    const geometry = new THREE.CylinderGeometry(
      RADIUS,        // radiusTop
      RADIUS,        // radiusBottom
      height,        // height
      128,           // radialSegments（高精細）
      1,             // heightSegments
      true,          // openEnded（キャップなし）
      0,             // thetaStart
      THETA_LENGTH,  // thetaLength
    );

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide, // 内側から見る
    });

    this.cylinder = new THREE.Mesh(geometry, material);
    this.scene.add(this.cylinder);

    this.resetView();
  }

  // ──────────────────────────────────────────────
  // 視点リセット
  // ──────────────────────────────────────────────

  resetView(): void {
    this.lon = 0;
    this.lat = 0;
    this.fov = 75;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.velocityLon = 0;
    this.velocityLat = 0;
  }

  // ──────────────────────────────────────────────
  // イベントリスナー
  // ──────────────────────────────────────────────

  private setupEventListeners(): void {
    const el = this.renderer.domElement;

    // マウス
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });

    // タッチ
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);

    // キーボード
    window.addEventListener('keydown', this.onKeyDown);
  }

  private removeEventListeners(): void {
    const el = this.renderer.domElement;

    el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    el.removeEventListener('wheel', this.onWheel);

    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
  }

  // マウス操作
  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.velocityLon = 0;
    this.velocityLat = 0;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.velocityLon = -dx * 0.25;
    this.velocityLat = dy * 0.25;
    this.lon += this.velocityLon;
    this.lat += this.velocityLat;
    this.lat = Math.max(-this.latLimit, Math.min(this.latLimit, this.lat));
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.fov += e.deltaY * 0.04;
    this.fov = Math.max(this.FOV_MIN, Math.min(this.FOV_MAX, this.fov));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  };

  // タッチ操作
  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    this.velocityLon = 0;
    this.velocityLat = 0;
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastPointerX = e.touches[0].clientX;
      this.lastPointerY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      this.isDragging = false;
      this.lastPinchDistance = this.getPinchDistance(e);
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDragging) {
      const dx = e.touches[0].clientX - this.lastPointerX;
      const dy = e.touches[0].clientY - this.lastPointerY;
      this.velocityLon = -dx * 0.35;
      this.velocityLat = dy * 0.35;
      this.lon += this.velocityLon;
      this.lat += this.velocityLat;
      this.lat = Math.max(-this.latLimit, Math.min(this.latLimit, this.lat));
      this.lastPointerX = e.touches[0].clientX;
      this.lastPointerY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      const dist = this.getPinchDistance(e);
      const delta = this.lastPinchDistance - dist;
      this.fov += delta * 0.08;
      this.fov = Math.max(this.FOV_MIN, Math.min(this.FOV_MAX, this.fov));
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      this.lastPinchDistance = dist;
    }
  };

  private onTouchEnd = (): void => {
    this.isDragging = false;
  };

  private getPinchDistance(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // キーボード操作
  private onKeyDown = (e: KeyboardEvent): void => {
    const STEP = 3;
    switch (e.key) {
      case 'ArrowLeft':  this.lon -= STEP; break;
      case 'ArrowRight': this.lon += STEP; break;
      case 'ArrowUp':
        this.lat = Math.max(-this.latLimit, this.lat - STEP);
        break;
      case 'ArrowDown':
        this.lat = Math.min(this.latLimit, this.lat + STEP);
        break;
    }
  };

  // ウィンドウリサイズ
  private onResize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ──────────────────────────────────────────────
  // アニメーションループ
  // ──────────────────────────────────────────────

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);

    // 慣性スクロール（ドラッグ中は適用しない）
    if (!this.isDragging) {
      this.lon += this.velocityLon;
      this.lat += this.velocityLat;
      this.lat = Math.max(-this.latLimit, Math.min(this.latLimit, this.lat));
      this.velocityLon *= this.INERTIA_DECAY;
      this.velocityLat *= this.INERTIA_DECAY;
    }

    // 球面座標からカメラの向きを計算
    const phi   = THREE.MathUtils.degToRad(90 - this.lat);
    const theta = THREE.MathUtils.degToRad(this.lon);

    const target = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(target);

    this.renderer.render(this.scene, this.camera);
  };

  // ──────────────────────────────────────────────
  // 破棄
  // ──────────────────────────────────────────────

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
    this.removeEventListeners();
    if (this.cylinder) {
      this.cylinder.geometry.dispose();
      (this.cylinder.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
