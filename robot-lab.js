/* <robot-lab> — interactive 3D showcase stage for iHouzz robots.
   Attributes: robot (kettybot|cocc), mode (studio|explode|xray|dims), spin (1|0), focus (-1..n), labels ("a|b|c"), base (path prefix)
   Emits window event 'robotlab:select' {detail:{index}} when a hotspot is clicked. */
(() => {
  if (customElements.get('robot-lab')) return;
  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0';
  let libs = null;
  const loadLibs = () => libs || (libs = Promise.all([
    import(CDN + '/+esm'),
    import(CDN + '/examples/jsm/loaders/GLTFLoader.js/+esm'),
    import(CDN + '/examples/jsm/controls/OrbitControls.js/+esm'),
    import(CDN + '/examples/jsm/environments/RoomEnvironment.js/+esm'),
    import(CDN + '/examples/jsm/postprocessing/EffectComposer.js/+esm'),
    import(CDN + '/examples/jsm/postprocessing/RenderPass.js/+esm'),
    import(CDN + '/examples/jsm/postprocessing/UnrealBloomPass.js/+esm'),
    import(CDN + '/examples/jsm/postprocessing/OutputPass.js/+esm'),
  ]));

  const ROBOTS = {
    kettybot: { url: 'kettybot/ban-trinh-dien.glb', dims: { h: '1.160 mm', w: '720 mm' },
      hs: [{ node: 9 }, { node: 5 }, { node: 1 }, { node: 2 }] },
    cocc: { url: 'cocc/cocc.glb', dims: { h: '1.150 mm', w: 'Ø 412 mm' },
      hs: [{ name: 'Man_Hinh_Mat' }, { name: 'Cam_Bien_Dinh' }, { name: 'Vong_Den' }, { name: 'Mat_Mam' }, { name: 'Man_Hinh_Than' }, { name: 'Cam_Bien_De' }] },
  };
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const CSS = `
  robot-lab .rl-hs{position:absolute;left:0;top:0;pointer-events:auto;display:flex;align-items:center;gap:10px;border:0;background:none;padding:0;cursor:pointer;font:600 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#fff;transition:opacity .25s}
  robot-lab .rl-dot{position:relative;flex:none;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;display:grid;place-items:center;background:rgba(6,10,20,.55);border:1px solid rgba(156,196,234,.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:transform .25s,background .25s}
  robot-lab .rl-dot::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:1px solid rgba(90,162,232,.7);animation:rlPulse 2.2s ease-out infinite}
  robot-lab .rl-hs:hover .rl-dot{transform:scale(1.15)}
  robot-lab .rl-hs[data-on="1"] .rl-dot{background:#2f7fd8;border-color:#fff;transform:scale(1.2)}
  robot-lab .rl-lbl{margin-top:-14px;padding:6px 10px;border-radius:99px;background:rgba(6,10,20,.72);border:1px solid rgba(156,196,234,.3);font:600 13px/1 'Be Vietnam Pro',system-ui,sans-serif;white-space:nowrap;opacity:0;transform:translateX(-6px);transition:opacity .2s,transform .2s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  robot-lab .rl-hs:hover .rl-lbl,robot-lab .rl-hs[data-on="1"] .rl-lbl{opacity:1;transform:none}
  robot-lab .rl-dim{visibility:hidden;position:absolute;left:0;top:0;padding:5px 9px;border-radius:6px;background:rgba(6,10,20,.8);border:1px solid rgba(156,196,234,.45);font:600 13px/1 'JetBrains Mono',ui-monospace,monospace;color:#cfe4f7;white-space:nowrap;transform:translate(-50%,-50%);transition:opacity .3s}
  robot-lab .rl-load{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:12px;font:500 13px/1.4 'JetBrains Mono',ui-monospace,monospace;color:#9cc4ea;letter-spacing:.08em;transition:opacity .4s;pointer-events:none;text-align:center}
  robot-lab .rl-bar{width:160px;height:2px;background:rgba(156,196,234,.2);overflow:hidden;border-radius:2px}
  robot-lab .rl-bar i{display:block;height:100%;width:0;background:#5aa2e8;transition:width .2s}
  @keyframes rlPulse{0%{transform:scale(.7);opacity:1}100%{transform:scale(1.5);opacity:0}}`;

  class RobotLab extends HTMLElement {
    static get observedAttributes() { return ['robot', 'mode', 'spin', 'focus', 'labels']; }
    connectedCallback() {
      if (this._init) return; this._init = true;
      if (!document.getElementById('rl-css')) { const s = document.createElement('style'); s.id = 'rl-css'; s.textContent = CSS; document.head.appendChild(s); }
      if (getComputedStyle(this).position === 'static') this.style.position = 'relative';
      this.style.display = 'block';
      this.innerHTML = '<canvas style="position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none;cursor:grab"></canvas><div data-layer style="position:absolute;inset:0;pointer-events:none;overflow:hidden"></div><div class="rl-load"><span data-msg>KHỞI TẠO KHÔNG GIAN 3D</span><span class="rl-bar"><i></i></span></div>';
      this._cache = {}; this._last = {};
      loadLibs().then(m => this._setup(m)).catch(() => this._msg('Không tải được thư viện 3D. Kiểm tra kết nối mạng.'));
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); this._io && this._io.disconnect();
      this._r && this._r.dispose(); this._init = false; this._ready = false;
    }
    attributeChangedCallback(n, o, v) {
      if (!this._ready || o === v) return;
      if (n === 'robot') this._switch();
      if (n === 'focus') this._applyFocus();
      if (n === 'labels') this._buildHotspots();
    }
    _msg(t) { const m = this.querySelector('[data-msg]'); if (m) m.textContent = t; const l = this.querySelector('.rl-load'); if (l) l.style.opacity = 1; }
    _progress(p) { const i = this.querySelector('.rl-bar i'); if (i) i.style.width = Math.round(p * 100) + '%'; }

    _setup([T, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }]) {
      this.T = T;
      const cv = this.querySelector('canvas');
      let r;
      try { r = new T.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }); }
      catch (e) { this._msg('Trình duyệt chưa bật WebGL nên không hiển thị được mô hình 3D.'); return; }
      this._r = r;
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; r.localClippingEnabled = true;
      const scene = this._scene = new T.Scene();
      scene.background = new T.Color('#060a14');
      scene.fog = new T.Fog('#060a14', 7, 16);
      const pm = new T.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
      const cam = this._cam = new T.PerspectiveCamera(28, 1, 0.05, 60);
      cam.position.set(2.4, 1.4, 3.4);
      const ctl = this._ctl = new OrbitControls(cam, cv);
      Object.assign(ctl, { enableDamping: true, dampingFactor: 0.06, minDistance: 1.4, maxDistance: 7, maxPolarAngle: 1.5, minPolarAngle: 0.2, enablePan: false, autoRotateSpeed: 0.9, rotateSpeed: 0.7 });
      ctl.target.set(0, 0.78, 0);
      ctl.addEventListener('start', () => { this._fly = null; this._touched = true; cv.style.cursor = 'grabbing'; });
      ctl.addEventListener('end', () => { cv.style.cursor = 'grab'; });

      const key = new T.DirectionalLight('#ffffff', 1.5); key.position.set(2.6, 4.2, 2.8); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: .5, far: 12 }); key.shadow.bias = -0.0004; key.shadow.radius = 6;
      scene.add(key);
      const rim = this._rim = new T.SpotLight('#3d8cff', 60, 12, 0.7, 0.6, 1.6); rim.position.set(-2.6, 2.8, -2.4); scene.add(rim); scene.add(rim.target); rim.target.position.set(0, .7, 0);
      const rim2 = new T.PointLight('#57d2ff', 8, 7, 1.8); rim2.position.set(2.6, .5, -2.2); scene.add(rim2);
      scene.add(new T.HemisphereLight('#9cc4ea', '#060a14', 0.15));

      // backdrop dome
      const dome = new T.Mesh(new T.SphereGeometry(30, 48, 24), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new T.Color('#0b1830') }, bot: { value: new T.Color('#03060d') } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = smoothstep(-.15,.6,vP.y); float g = pow(max(0.,1.-length(vP.xz*vec2(1.,1.4)-vec2(0.,-.6))),3.)*.35; gl_FragColor = vec4(mix(bot, top, h)+vec3(.05,.12,.26)*g,1.); }'
      }));
      scene.add(dome);
      // grid floor
      this._floorU = { uTime: { value: 0 }, uR: { value: .6 } };
      const floor = new T.Mesh(new T.PlaneGeometry(24, 24), new T.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: this._floorU,
        extensions: { derivatives: true },
        vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
        fragmentShader: `uniform float uTime; uniform float uR; varying vec2 vW;
          float grid(vec2 p, float s){ vec2 g = abs(fract(p/s-.5)-.5)/fwidth(p/s); return 1.-min(min(g.x,g.y),1.); }
          void main(){
            float d = length(vW);
            float fade = exp(-d*d*.09);
            float gl = grid(vW,.25)*.35 + grid(vW,1.)*.55;
            vec3 col = vec3(.2,.45,.8)*gl*fade*.55;
            float ring = smoothstep(.018,0.,abs(d-uR*1.18))*(.55+.45*sin(uTime*2.2));
            float ring2 = smoothstep(.01,0.,abs(d-uR*1.55))*.35;
            float sweep = smoothstep(.12,0.,abs(d - mod(uTime*.9, 6.)))*(1.-smoothstep(1.,6.,d))*.35;
            float pool = exp(-d*d*2.4)*.35;
            col += vec3(.35,.7,1.)*(ring+ring2) + vec3(.25,.55,1.)*sweep + vec3(.1,.25,.55)*pool;
            gl_FragColor = vec4(col, clamp(max(max(gl*fade*.6, ring+ring2), max(sweep,pool)),0.,1.));
          }`
      }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; scene.add(floor);
      const shadow = new T.Mesh(new T.PlaneGeometry(8, 8), new T.ShadowMaterial({ opacity: .55 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; shadow.receiveShadow = true; scene.add(shadow);
      // particles
      const N = 420, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, rr = 1 + Math.random() * 5.5; pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.random() * 3.6; pos[i * 3 + 2] = Math.sin(a) * rr; }
      const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
      this._dust = new T.Points(pg, new T.PointsMaterial({ color: '#8cc4ff', size: .018, transparent: true, opacity: .7, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
      scene.add(this._dust);
      // scan ring
      const scanMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { uO: { value: 0 } },
        vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform float uO; varying vec2 vU; void main(){ float d = length(vU-.5)*2.; float a = smoothstep(1.,.96,d)*smoothstep(.2,1.,d); a += smoothstep(.02,0.,abs(d-.98))*1.5; gl_FragColor = vec4(vec3(.35,.75,1.)*1.6, a*uO); }' });
      this._scanMat = scanMat;
      this._scan = new T.Mesh(new T.PlaneGeometry(1, 1), scanMat); this._scan.rotation.x = -Math.PI / 2; scene.add(this._scan);

      const comp = this._comp = new EffectComposer(r);
      comp.addPass(new RenderPass(scene, cam));
      this._bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.28, 0.5, 0.97); comp.addPass(this._bloom);
      comp.addPass(new OutputPass());

      this._loader = new GLTFLoader();
      this._ray = new T.Raycaster();
      this._clock = new T.Clock();
      this._fx = { explode: 0, xray: 0, dims: 0 };
      this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this); this._resize();
      this._visible = true;
      this._io = new IntersectionObserver(es => { this._visible = es[0].isIntersecting; }); this._io.observe(this);
      this.addEventListener('pointermove', e => { const b = this.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width - .5; this._rim.position.x = -2.6 + x * 2.4; });
      this._ready = true;
      this._switch();
      const loop = () => { this._raf = requestAnimationFrame(loop); this._frame(); };
      loop();
    }

    _resize() {
      if (!this._r) return;
      const w = Math.max(1, this.clientWidth), h = Math.max(1, this.clientHeight);
      this._r.setSize(w, h, false); this._comp.setSize(w, h);
      this._cam.aspect = w / h;
      
      this._cam.updateProjectionMatrix();
      if (this._cur && !this._touched && !(parseInt(this.getAttribute('focus'), 10) >= 0)) this._home();
    }

    _loadRobot(key) {
      if (this._cache[key]) return Promise.resolve(this._cache[key]);
      const T = this.T, cfg = ROBOTS[key]; const base = this.getAttribute('base') || 'robots/';
      return new Promise((res, rej) => this._loader.load(base + cfg.url, g => {
        const root = g.scene, holder = new T.Group(); holder.add(root);
        let box = new T.Box3().setFromObject(root); const size = box.getSize(new T.Vector3());
        root.scale.setScalar(1.55 / size.y); holder.updateMatrixWorld(true);
        box.setFromObject(root); const c = box.getCenter(new T.Vector3());
        root.position.x -= c.x; root.position.z -= c.z; root.position.y -= box.min.y; holder.updateMatrixWorld(true);
        box.setFromObject(root); const S = box.getSize(new T.Vector3());
        const R = { key, holder, height: S.y, radius: Math.max(S.x, S.z) / 2, width: S.x, depth: S.z, clip: new T.Plane(new T.Vector3(0, -1, 0), -0.05), parts: [], hs: [], inT: 0 };
        const lineMat = new T.LineBasicMaterial({ color: '#7cc0ff', transparent: true, opacity: 0, depthWrite: false, clippingPlanes: [R.clip] });
        R.lineMat = lineMat; const mats = new Set(); const meshes = [];
        root.traverse(o => { if (o.isMesh) meshes.push(o); });
        const midY = R.height / 2;
        const info = meshes.map(o => { const b = new T.Box3().setFromObject(o); return { o, b, c: b.getCenter(new T.Vector3()) }; });
        info.sort((a, b) => a.c.y - b.c.y);
        info.forEach((it, rank) => {
          const o = it.o; o.castShadow = true; o.receiveShadow = true;
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.clippingPlanes = [R.clip]; m.clipShadows = true; mats.add(m); });
          const xz = new T.Vector2(it.c.x, it.c.z); const radial = xz.length() > .03 ? xz.normalize().multiplyScalar(.22) : new T.Vector2();
          const off = new T.Vector3(radial.x, (it.c.y - midY) * .75 + (rank - info.length / 2) * .045, radial.y);
          const p = o.parent; const a = p.worldToLocal(it.c.clone()), b2 = p.worldToLocal(it.c.clone().add(off));
          R.parts.push({ o, base: o.position.clone(), delta: b2.sub(a) });
          const e = new T.LineSegments(new T.EdgesGeometry(o.geometry, 25), lineMat); e.renderOrder = 2; o.add(e);
        });
        R.mats = [...mats].map(m => ({ m, op: m.opacity, tr: m.transparent, dw: m.depthWrite }));
        // hotspots
        const findNode = h => h.name ? root.getObjectByName(h.name) : meshes.find(o => { const a = g.parser.associations.get(o); return a && a.nodes === h.node; });
        cfg.hs.forEach(h => {
          const o = findNode(h); if (!o) return;
          const b = new T.Box3().setFromObject(o); const cc = b.getCenter(new T.Vector3());
          const pt = new T.Vector3(cc.x, cc.y, T.MathUtils.lerp(cc.z, b.max.z, .92));
          const mesh = o.isMesh ? o : meshes.find(m => m.parent === o) || o;
          R.hs.push({ o: mesh, local: mesh.worldToLocal(pt.clone()) });
        });
        // dimension lines
        const dm = new T.LineBasicMaterial({ color: '#9cc4ea', transparent: true, opacity: 0, depthWrite: false });
        const X = R.width / 2 + .22, Z = R.depth / 2 + .3, H = R.height, tk = .05;
        const pts = [[X, 0, 0, X, H, 0], [X - tk, 0, 0, X + tk, 0, 0], [X - tk, H, 0, X + tk, H, 0], [-R.width / 2, 0.005, Z, R.width / 2, 0.005, Z], [-R.width / 2, 0.005, Z - tk, -R.width / 2, 0.005, Z + tk], [R.width / 2, 0.005, Z - tk, R.width / 2, 0.005, Z + tk], [-R.width / 2, H, 0, X, H, 0]].flat();
        const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
        R.dimLines = new T.LineSegments(dg, dm); R.dimMat = dm; holder.add(R.dimLines);
        R.dimPts = [new T.Vector3(X + .02, H / 2, 0), new T.Vector3(0, .005, Z + .02)]; R.dimTxt = [cfg.dims.h, cfg.dims.w];
        this._cache[key] = R; res(R);
      }, e => { if (e.total) this._progress(e.loaded / e.total); }, rej));
    }

    _switch() {
      const key = ROBOTS[this.getAttribute('robot')] ? this.getAttribute('robot') : 'kettybot';
      if (this._cur && this._cur.key === key) return;
      const tok = this._tok = (this._tok || 0) + 1;
      const ld = this.querySelector('.rl-load'); if (!this._cache[key] && ld) { this._msg('ĐANG TẢI MÔ HÌNH'); this._progress(0); }
      this._loadRobot(key).then(R => {
        if (tok !== this._tok) return;
        if (ld) ld.style.opacity = 0;
        if (this._cur) { const o = this._cur; this._out = o; o.outT = 0; }
        R.inT = 0; R.clip.constant = -0.05; this._scene.add(R.holder); this._cur = R;
        this._floorU.uR.value = R.radius;
        this._buildHotspots(); this._home();
      }).catch(() => this._msg('Không tải được mô hình 3D.'));
    }

    _home() {
      const R = this._cur; if (!R) return; const T = this.T;
      const d = (4.3 + R.height * .4) * Math.max(1, Math.sqrt(1.25 / this._cam.aspect));
      this._fly = { pos: new T.Vector3(.62, .38, .78).normalize().multiplyScalar(d).add(new T.Vector3(0, R.height * .3, 0)), tgt: new T.Vector3(0, R.height * .46, 0) };
    }
    _applyFocus() {
      const R = this._cur; if (!R) return; const T = this.T;
      const i = parseInt(this.getAttribute('focus'), 10);
      this._layer && this._layer.querySelectorAll('.rl-hs').forEach((b, k) => b.dataset.on = k === i ? '1' : '0');
      if (!(i >= 0) || !R.hs[i]) { this._home(); return; }
      const p = R.hs[i].o.localToWorld(R.hs[i].local.clone());
      const out = new T.Vector3(p.x, 0, p.z); if (out.length() < .05) out.set(.5, 0, 1); out.normalize();
      out.applyAxisAngle(new T.Vector3(0, 1, 0), .35);
      this._fly = { pos: p.clone().add(out.multiplyScalar(1.7)).add(new T.Vector3(0, .25, 0)), tgt: p.clone() };
    }

    _buildHotspots() {
      const layer = this._layer = this.querySelector('[data-layer]'); if (!layer || !this._cur) return;
      layer.innerHTML = '';
      const labels = (this.getAttribute('labels') || '').split('|');
      const focus = parseInt(this.getAttribute('focus'), 10);
      this._hsEls = this._cur.hs.map((h, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'rl-hs'; b.dataset.on = i === focus ? '1' : '0';
        b.setAttribute('aria-label', labels[i] || ('Điểm ' + (i + 1)));
        b.innerHTML = `<span class="rl-dot">${i + 1}</span><span class="rl-lbl">${(labels[i] || '').replace(/</g, '&lt;')}</span>`;
        b.addEventListener('click', e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('robotlab:select', { detail: { index: i } })); });
        layer.appendChild(b); return b;
      });
      this._dimEls = this._cur.dimTxt.map(t => { const d = document.createElement('div'); d.className = 'rl-dim'; d.textContent = t; layer.appendChild(d); return d; });
    }

    _frame() {
      if (!this._visible || !this._ready) return;
      const T = this.T, dt = Math.min(this._clock.getDelta(), .05), t = this._clock.elapsedTime;
      const R = this._cur, mode = this.getAttribute('mode') || 'studio';
      const k = Math.min(1, dt * 4);
      const fx = this._fx;
      fx.explode += ((mode === 'explode' ? 1 : 0) - fx.explode) * k;
      fx.xray += ((mode === 'xray' ? 1 : 0) - fx.xray) * k;
      fx.dims += ((mode === 'dims' ? 1 : 0) - fx.dims) * k;
      if (R) {
        if (R.inT < 1) { R.inT = Math.min(1, R.inT + dt / 1.6); const e = ease(R.inT); R.clip.constant = -0.05 + (R.height + .12) * e;
          this._scan.visible = true; this._scan.position.y = R.clip.constant; const s = R.radius * 2.7; this._scan.scale.set(s, s, 1); this._scanMat.uniforms.uO.value = Math.sin(Math.PI * R.inT);
        } else { this._scan.visible = false; R.clip.constant = 50; }
        R.parts.forEach(p => { p.o.position.copy(p.base).addScaledVector(p.delta, ease(Math.max(0, Math.min(1, fx.explode)))); });
        const xr = fx.xray;
        R.mats.forEach(({ m, op, tr, dw }) => { const want = xr > .02; m.transparent = want || tr; m.opacity = want ? op * (1 - xr * .9) : op; m.depthWrite = want ? xr < .5 && dw : dw; });
        R.lineMat.opacity = Math.max(xr * .95, fx.explode * .35);
        R.dimMat.opacity = fx.dims;
      }
      const O = this._out;
      if (O) { O.outT += dt / .7; O.clip.constant = (O.height + .05) * (1 - ease(Math.min(1, O.outT))); if (O.outT >= 1) { this._scene.remove(O.holder); O.parts.forEach(p => p.o.position.copy(p.base)); this._out = null; } }
      this._floorU.uTime.value = t;
      this._dust.rotation.y = t * .02; this._dust.position.y = Math.sin(t * .3) * .05;
      const focused = parseInt(this.getAttribute('focus'), 10) >= 0;
      this._ctl.autoRotate = this.getAttribute('spin') !== '0' && !focused && !this._fly;
      if (this._fly) {
        const f = Math.min(1, dt * 2.6);
        this._cam.position.lerp(this._fly.pos, f); this._ctl.target.lerp(this._fly.tgt, f);
        if (this._cam.position.distanceTo(this._fly.pos) < .01 && this._ctl.target.distanceTo(this._fly.tgt) < .01) this._fly = null;
      }
      this._ctl.update();
      this._comp.render();
      this._overlay();
    }

    _overlay() {
      const R = this._cur; if (!R || !this._hsEls) return; const T = this.T;
      const w = this.clientWidth, h = this.clientHeight, cam = this._cam, v = new T.Vector3();
      const meshes = R.parts.map(p => p.o);
      const hide = R.inT < .85 || this._fx.dims > .5;
      R.hs.forEach((hs, i) => {
        const el = this._hsEls[i]; if (!el) return;
        const wp = hs.o.localToWorld(hs.local.clone()); v.copy(wp).project(cam);
        const onScreen = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
        let occl = false;
        if (onScreen && !hide) { const dir = wp.clone().sub(cam.position); const dist = dir.length(); this._ray.set(cam.position, dir.normalize()); this._ray.far = dist; const hit = this._ray.intersectObjects(meshes, false)[0]; occl = !!hit && hit.distance < dist - .04 && this._fx.xray < .5; }
        el.style.transform = `translate(${(v.x + 1) / 2 * w}px,${(1 - v.y) / 2 * h}px)`;
        el.style.opacity = !onScreen || hide ? 0 : occl ? .28 : 1;
        el.style.pointerEvents = !onScreen || hide ? 'none' : 'auto';
      });
      (this._dimEls || []).forEach((el, i) => {
        v.copy(R.dimPts[i]).applyMatrix4(R.holder.matrixWorld).project(cam);
        el.style.left = ((v.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - v.y) / 2 * h) + 'px'; el.style.opacity = this._fx.dims; el.style.visibility = this._fx.dims < .02 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1 ? 'hidden' : 'visible';
      });
    }
  }
  customElements.define('robot-lab', RobotLab);
})();
