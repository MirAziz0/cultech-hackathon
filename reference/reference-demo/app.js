const MODEL_RESTORED = "__RESTORED__";
const MODEL_TODAY = "__TODAY__";
const S = 0.008; // build scale (m -> maquette)
const V = (x, y, z) => [x * S, z * S, -y * S];
const B = [
  {id:"palace", name:"Saray binası", date:"XV ƏSR", pos:V(-24,18,15), conf:"ok",
   text:"Şirvanşahların Bakıdakı iki mərtəbəli iqamətgahı, kompleksin əsas binası. Otaqlar dar dəhlizlər və pilləkənlərlə birləşir."},
  {id:"divan", name:"Divanxana", date:"XV ƏSR", pos:V(7,20,14.4), conf:"ok",
   text:"Arkadalı həyətin ortasında səkkizguşəli, günbəzli rotonda. Təyinatı mübahisəlidir: divan, yəni məclis zalı və ya türbə ola biləcəyi ehtimal olunur."},
  {id:"yahya", name:"Seyid Yəhya Bakuvi türbəsi", date:"XV ƏSR", pos:V(-4,0,16), conf:"ok",
   text:"Saray alimi Seyid Yəhya Bakuviyə aid edilən səkkizguşəli türbə, piramidal daş örtüklə. Xalq arasında “Dərviş türbəsi” də adlanır."},
  {id:"mosque", name:"Şah məscidi və minarə", date:"1441", pos:V(18,-6,27), conf:"ok",
   text:"Kompleksin məscidi. Minarədəki kitabə tikinti tarixini 1441-ci il kimi göstərir. Bərpa versiyasında minarə başlığı firuzəyi kaşı ilə təsəvvür edilib."},
  {id:"turbe", name:"Şirvanşahlar türbəsi", date:"1435", pos:V(26,-10,15.1), conf:"ok",
   text:"I Xəlilullahın ailə üzvləri üçün tikdirdiyi günbəzli türbə. Cənub tərəfdəki hündür, oyma bəzəkli portalı ilə tanınır."},
  {id:"murad", name:"Murad qapısı", date:"1585", pos:V(26,6,11.4), conf:"ok",
   text:"Osmanlı dövründə, Sultan III Muradın adı ilə tikilmiş daş portal. Kompleksin ən gec tikililərindən biridir."},
  {id:"bath", name:"Saray hamamı", date:"XV ƏSR", pos:V(22,-30,6), conf:"mid", dynamic:true,
   today:"Bu gün yalnız yarıyeraltı divar qalıqları var. Hamam XX əsrdə arxeoloji qazıntı zamanı aşkarlanıb.",
   past:"Qalıqların planı əsasında günbəzli otaqlarla bərpa edilib. Günbəzlərin hündürlüyü və forması təxminidir."},
  {id:"garden", name:"Aşağı bağ və hovuz", date:"BƏRPA", pos:V(-22,-22,3), conf:"hyp", pastOnly:true,
   text:"AI fərziyyəsi: dövrün saray ənənəsinə əsaslanan bağ və hovuz təsəvvürü. Real arxeoloji əsası yoxdur, nümunə kimi göstərilir."}
];
const PHOTO_Q = {palace:"Palace of the Shirvanshahs Baku", divan:"Divankhana Shirvanshahs Baku", yahya:"Seyid Yahya Bakuvi mausoleum Baku", mosque:"Shah mosque Shirvanshahs palace Baku", turbe:"Shirvanshahs mausoleum Baku", murad:"Murad gate Baku", bath:"Shirvanshahs palace bathhouse Baku", garden:"Palace of the Shirvanshahs Baku"};
const INSIDE = {divan:"Divanxananın içi", turbe:"Türbənin içi", mosque:"Şah məscidinin içi", bath:"Hamamın mərkəzi zalı"};
const INSIDE_NOTE = {divan:"Səkkizguşəli zal, divarlarda taxçalar, yuxarıda yazı qurşağı və günbəz.", turbe:"Kvadrat zal, künclərdə günbəzə keçid tağları, ortada daş sənduqələr.", mosque:"Mehrab, minbər, asma çıraq və döşəmədə xalça. Xalça naxışı təsəvvürdür.", bath:"Mərkəzi hovuz, oturacaq taxçaları, günbəzdə ulduzvari işıq dəlikləri."};
const LABEL = {ok:"Mövcuddur", mid:"Arxeoloji əsaslı", hyp:"AI fərziyyəsi"};
const view = document.getElementById("view"), cv = document.getElementById("cv"), labels = document.getElementById("labels");
const list = document.getElementById("list"), detail = document.getElementById("detail");
let era = "past", current = null, inside = null, saved = null, walking = false;

/* ---------- three.js scene ---------- */
const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true, alpha: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.physicallyCorrectLights = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
const hemi = new THREE.HemisphereLight(0xfff6e6, 0x6b5a45, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.25);
sun.position.set(-0.6, 1.1, 0.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left:-0.5, right:0.5, top:0.5, bottom:-0.5, near:0.1, far:3});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.0025;
sun.shadow.radius = 3;
scene.add(sun);

const controls = new THREE.OrbitControls(camera, cv);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.18;
controls.maxDistance = 2.2;
controls.maxPolarAngle = Math.PI * 0.47;
controls.target.set(0, 0.06, 0);
const HOME = {target: new THREE.Vector3(0, 0.06, 0), az: -38, pol: 58, dist: 1.05};
function orbitPos(target, azDeg, polDeg, dist){
  const az = THREE.MathUtils.degToRad(azDeg), pol = THREE.MathUtils.degToRad(polDeg);
  return new THREE.Vector3(
    target.x + dist * Math.sin(pol) * Math.sin(az),
    target.y + dist * Math.cos(pol),
    target.z + dist * Math.sin(pol) * Math.cos(az));
}
camera.position.copy(orbitPos(HOME.target, HOME.az, HOME.pol, HOME.dist));

const models = {};
function b64ToBuffer(d){
  const bin = atob(d.slice(d.indexOf(",") + 1));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
function loadModel(key, data){
  return new Promise((res, rej) => {
    new THREE.GLTFLoader().parse(b64ToBuffer(data), "", g => {
      g.scene.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      models[key] = g.scene; scene.add(g.scene); res();
    }, rej);
  });
}
Promise.all([loadModel("past", MODEL_RESTORED), loadModel("today", MODEL_TODAY)])
  .then(() => { document.getElementById("loading").hidden = true; applyEra(); })
  .catch(err => { document.getElementById("loading").textContent = "Maket yüklənmədi: " + (err && err.message || err); });

/* ---------- labels ---------- */
B.forEach(b => {
  b.v = new THREE.Vector3(...b.pos);
  const h = document.createElement("button");
  h.className = "hs"; h.type = "button";
  h.setAttribute("aria-label", b.name);
  h.innerHTML = `<span>${b.name}</span>`;
  h.addEventListener("click", () => select(b.id, true));
  labels.appendChild(h); b.hs = h;
  const li = document.createElement("li");
  li.innerHTML = `<button type="button"><span class="dot ${b.conf}"></span><span>${b.name}<small>${b.date}</small></span></button>`;
  li.firstChild.addEventListener("click", () => select(b.id, true));
  list.appendChild(li); b.li = li;
});
const tmp = new THREE.Vector3();
function placeLabels(){
  const w = view.clientWidth, h = view.clientHeight;
  const showNames = w > 520;
  B.forEach(b => {
    if (b.pastOnly && era === "today") { b.hs.hidden = true; return; }
    tmp.copy(b.v).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
    b.hs.hidden = !vis;
    b.hs.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px)`;
    if (showNames || b.id === current) delete b.hs.dataset.hideLabel; else b.hs.dataset.hideLabel = "";
  });
}

/* ---------- camera fly-to ---------- */
let fly = null;
function flyTo(target, dist){
  const dir = camera.position.clone().sub(controls.target).normalize();
  fly = {t: 0, fromT: controls.target.clone(), toT: target.clone(),
         fromP: camera.position.clone(), toP: target.clone().add(dir.multiplyScalar(dist))};
}
const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function resize(){
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view); resize();

const clock = new THREE.Clock();
function loop(){
  const dt = Math.min(clock.getDelta(), 0.05);
  if (walking){
    WALK.update(dt, camera, showZone);
    renderer.render(WALK.scene, camera);
    drawMini();
    requestAnimationFrame(loop);
    return;
  }
  if (fly){
    fly.t = reduceMotion ? 1 : Math.min(1, fly.t + 0.035);
    const e = 1 - Math.pow(1 - fly.t, 3);
    controls.target.lerpVectors(fly.fromT, fly.toT, e);
    camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (fly.t >= 1) fly = null;
  }
  controls.update();
  renderer.render(scene, camera);
  if (!inside) placeLabels();
  requestAnimationFrame(loop);
}
loop();

/* ---------- photos ---------- */
const lb = document.getElementById("lb"), lbImg = document.getElementById("lb-img"), lbCap = document.getElementById("lb-cap"), lbSrc = document.getElementById("lb-src");
let lbList = [], lbI = 0;
function gallery(key){
  const ps = (typeof PHOTOS !== "undefined" && PHOTOS[key]) || [];
  if (!ps.length) return "";
  return `<div class="gal-h">Real şəkillər</div><div class="gal">${ps.map((p, i) =>
    `<button type="button" class="ph" data-k="${key}" data-i="${i}" aria-label="${p.cap}"><img src="${p.src}" alt="${p.cap}"></button>`).join("")}</div>`;
}
function bindGallery(){
  detail.querySelectorAll(".ph").forEach(b => b.addEventListener("click", () => openLb(b.dataset.k, +b.dataset.i)));
}
function showLb(){
  const p = lbList[lbI];
  lbImg.src = p.src; lbImg.alt = p.cap; lbCap.textContent = p.cap;
  lbSrc.href = "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(p.file.replace(/ /g, "_"));
  document.getElementById("lb-n").textContent = `${lbI + 1} / ${lbList.length}`;
  document.getElementById("lb-prev").hidden = document.getElementById("lb-next").hidden = lbList.length < 2;
}
function openLb(k, i){ lbList = PHOTOS[k]; lbI = i; showLb(); lb.hidden = false; document.getElementById("lb-close").focus(); }
document.getElementById("lb-close").addEventListener("click", () => { lb.hidden = true; });
document.getElementById("lb-prev").addEventListener("click", () => { lbI = (lbI + lbList.length - 1) % lbList.length; showLb(); });
document.getElementById("lb-next").addEventListener("click", () => { lbI = (lbI + 1) % lbList.length; showLb(); });
lb.addEventListener("click", e => { if (e.target === lb) lb.hidden = true; });
document.addEventListener("keydown", e => {
  if (lb.hidden) return;
  if (e.key === "Escape") lb.hidden = true;
  if (e.key === "ArrowRight") document.getElementById("lb-next").click();
  if (e.key === "ArrowLeft") document.getElementById("lb-prev").click();
});

/* ---------- UI ---------- */
function render(){
  B.forEach(b => { b.li.hidden = b.pastOnly && era === "today"; });
  const b = B.find(x => x.id === current);
  if (!b || (b.pastOnly && era === "today")) {
    detail.innerHTML = `<div class="date">${era==="past"?"XV ƏSR · BƏRPA":"BU GÜN"}</div><h3>${era==="past"?"Kompleks tam halında":"Kompleks bu gün"}</h3>
      <p>${era==="past"
        ? "Bərpa versiyası hamamı, tam qala divarlarını və saray bağını göstərir. Rənglər hər hissənin nə qədər etibarlı olduğunu bildirir."
        : "Əsas binalar bu gün də dayanır. Hamam isə yalnız qalıqlar şəklindədir, divarların bəzi hissələri dağılıb."}</p>
      ${gallery("overview")}
      <p class="note" style="margin-top:10px">Binaya və ya siyahıdakı ada toxunun. Ümumi görünüşə qayıtmaq üçün maketə iki dəfə toxunun.</p>`;
    bindGallery();
  } else {
    const t = b.dynamic ? (era === "past" ? b.past : b.today) : b.text;
    const photo = `https://commons.wikimedia.org/w/index.php?title=Special:MediaSearch&type=image&search=${encodeURIComponent(PHOTO_Q[b.id])}`;
    detail.innerHTML = `<div class="date">${b.date}</div><h3>${b.name}</h3><p>${t}</p>
      <span class="badge"><span class="dot ${b.conf}"></span>${LABEL[b.conf]}</span>
      <div class="actions">${b.id === "palace" ? `<button type="button" class="btn primary" id="go-walk">İçəridə gəz</button>` : ""}${INSIDE[b.id] ? `<button type="button" class="btn primary" id="go-in">İçərisinə bax</button>` : ""}
      <a class="btn" href="${photo}" target="_blank" rel="noopener">Daha çox şəkil ↗</a></div>
      ${gallery(b.id)}`;
    bindGallery();
    const gi = document.getElementById("go-in"); if (gi) gi.addEventListener("click", () => enterInterior(b.id));
    const gw = document.getElementById("go-walk"); if (gw) gw.addEventListener("click", enterWalk);
  }
  B.forEach(x => {
    x.li.firstChild.setAttribute("aria-current", x.id === current ? "true" : "false");
    if (x.id === current) x.hs.dataset.active = ""; else delete x.hs.dataset.active;
  });
  document.getElementById("era").textContent = era === "past" ? "XV ƏSR · BƏRPA" : "BU GÜN · MÖVCUD VƏZİYYƏT";
}
function select(id, doFly){
  if (inside) exitInterior();
  if (walking) exitWalk();
  current = id; render();
  const b = B.find(x => x.id === id);
  if (doFly && b) flyTo(b.v, 0.42);
}
function applyEra(){
  if (models.past) models.past.visible = !inside && era === "past";
  if (models.today) models.today.visible = !inside && era === "today";
}
/* ---------- interiors ---------- */
const exitBtn = document.getElementById("exit-in"), inCap = document.getElementById("in-cap");
function enterInterior(id){
  const r = INT.get(id); if (!r) return;
  if (inside) exitInterior(true);
  inside = id; fly = null;
  saved = {pos: camera.position.clone(), target: controls.target.clone()};
  scene.add(r.group);
  hemi.visible = sun.visible = false; renderer.shadowMap.enabled = false;
  applyEra(); labels.hidden = true;
  camera.near = 0.05; camera.far = 80; camera.fov = 70; camera.updateProjectionMatrix();
  controls.target.set(0, r.eye, 0);
  camera.position.set(0, r.eye + 0.15, r.reach * 0.55);
  Object.assign(controls, {minDistance: 0.3, maxDistance: r.reach, minPolarAngle: 0.15, maxPolarAngle: Math.PI - 0.15, enablePan: false});
  document.querySelector(".toggle").hidden = true; document.getElementById("era").hidden = true;
  exitBtn.hidden = false; inCap.hidden = false;
  inCap.innerHTML = `<b>${INSIDE[id]}</b><span>${INSIDE_NOTE[id]} Təxmini bərpadır. Yuxarı baxmaq üçün sürüşdürün.</span>`;
  view.setAttribute("aria-label", INSIDE[id]);
}
function exitInterior(silent){
  if (!inside) return;
  scene.remove(INT.get(inside).group); inside = null;
  hemi.visible = sun.visible = true; renderer.shadowMap.enabled = true;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  applyEra(); labels.hidden = false;
  camera.near = 0.01; camera.far = 20; camera.fov = 35; camera.updateProjectionMatrix();
  Object.assign(controls, {minDistance: 0.18, maxDistance: 2.2, minPolarAngle: 0, maxPolarAngle: Math.PI * 0.47, enablePan: true});
  if (saved){ camera.position.copy(saved.pos); controls.target.copy(saved.target); }
  document.querySelector(".toggle").hidden = false; document.getElementById("era").hidden = false;
  exitBtn.hidden = true; inCap.hidden = true;
  view.setAttribute("aria-label", "Şirvanşahlar Sarayı kompleksinin 3D maketi");
}
exitBtn.addEventListener("click", () => exitInterior());

/* ---------- walk through the palace building ---------- */
const walkUi = document.getElementById("walk-ui"), mini = document.getElementById("mini"), mctx = mini.getContext("2d");
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
let miniColors = null;
function drawMini(){ WALK.drawMap(mctx, mini.width, mini.height, miniColors); }
function showZone(info, id){
  if (!info) return;
  inCap.hidden = false; inCap.innerHTML = `<b>${info[0]}</b><span>${info[1]}</span>`;
  zoneCard(id);
}
/* zone photo card: real photos of the place you just entered */
const ZPH = {
  court: [["facade", 0], ["garden", 0], ["overview", 0]],
  portal: [["palace", 0], ["entry2", 0]],
  vest: [["entry2", 0], ["palace", 0]],
  hall: [["dome", 1], ["expo", 0], ["dome", 0], ["palace", 1]],
  stair: [["stairs", 0], ["palace", 1]],
  ch3: [["palace", 1], ["dome", 1]],
  corr: [["expo", 0], ["palace", 2]],
  vest2: [["expo", 0], ["palace", 2]],
  r1: [["ceramic", 0], ["palace", 2]],
  r2: [["mosque", 1], ["silk", 0], ["bags", 0]],
  r3: [["palace", 2], ["ceramic", 0], ["bags", 0]],
};
const zc = document.getElementById("zcard"), zcImg = document.getElementById("zc-img"), zcCap = document.getElementById("zc-cap"), zcDots = document.getElementById("zc-dots");
let zcList = [], zcI = 0, zcTimer = null;
function zcShow(i){
  zcI = i; const p = zcList[i];
  zc.classList.remove("in"); void zc.offsetWidth; zc.classList.add("in");
  zcImg.src = p.src; zcImg.alt = p.cap; zcCap.textContent = p.cap;
  zcDots.innerHTML = zcList.map((_, j) => `<span${j === i ? ' class="on"' : ""}></span>`).join("");
}
function zoneCard(id){
  clearInterval(zcTimer);
  zcList = (ZPH[id] || []).map(([k, i]) => PHOTOS[k] && PHOTOS[k][i]).filter(Boolean);
  if (!zcList.length){ zc.hidden = true; return; }
  zc.hidden = false; zcShow(0);
  if (zcList.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    zcTimer = setInterval(() => zcShow((zcI + 1) % zcList.length), 5000);
}
document.getElementById("zc-open").addEventListener("click", () => {
  for (const k in WALK.state.keys) WALK.state.keys[k] = false;
  lbList = zcList; lbI = zcI; showLb(); lb.hidden = false; document.getElementById("lb-close").focus();
});
document.getElementById("zc-close").addEventListener("click", () => { clearInterval(zcTimer); zc.hidden = true; });
function enterWalk(){
  if (inside) exitInterior(true);
  walking = true; fly = null;
  saved = {pos: camera.position.clone(), target: controls.target.clone()};
  controls.enabled = false; renderer.shadowMap.enabled = false;
  labels.hidden = true;
  document.querySelector(".toggle").hidden = true; document.getElementById("era").hidden = true;
  camera.near = 0.05; camera.far = 150; camera.fov = 72; camera.updateProjectionMatrix();
  WALK.reset();
  miniColors = {bg: "rgba(20,17,14,.72)", floor: "#cdb98f", me: cssVar("--hyp") || "#e07a68"};
  walkUi.hidden = false; view.classList.add("walking");
  view.setAttribute("aria-label", "Saray binasının içində gəzinti");
  view.focus({preventScroll: true});
}
function exitWalk(){
  if (!walking) return;
  walking = false; for (const k in WALK.state.keys) WALK.state.keys[k] = false;
  controls.enabled = true; renderer.shadowMap.enabled = true;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  camera.rotation.set(0, 0, 0);
  camera.near = 0.01; camera.far = 20; camera.fov = 35; camera.updateProjectionMatrix();
  if (saved){ camera.position.copy(saved.pos); controls.target.copy(saved.target); }
  clearInterval(zcTimer); zc.hidden = true;
  labels.hidden = false; walkUi.hidden = true; inCap.hidden = true; view.classList.remove("walking");
  document.querySelector(".toggle").hidden = false; document.getElementById("era").hidden = false;
  view.setAttribute("aria-label", "Şirvanşahlar Sarayı kompleksinin 3D maketi");
}
document.getElementById("walk-exit").addEventListener("click", exitWalk);
// look by dragging
let drag = null;
cv.addEventListener("pointerdown", e => { if (!walking) return; drag = {x: e.clientX, y: e.clientY, id: e.pointerId}; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", e => { if (!walking || !drag || e.pointerId !== drag.id) return; WALK.look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; });
["pointerup", "pointercancel"].forEach(t => cv.addEventListener(t, () => { drag = null; }));
// keyboard
const KEYMAP = {KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", KeyD: "r", ArrowLeft: "tl", ArrowRight: "tr", ShiftLeft: "run", ShiftRight: "run"};
document.addEventListener("keydown", e => { if (!walking || !lb.hidden) return; const k = KEYMAP[e.code]; if (k){ WALK.state.keys[k] = true; e.preventDefault(); } if (e.code === "Escape") exitWalk(); });
document.addEventListener("keyup", e => { const k = KEYMAP[e.code]; if (k) WALK.state.keys[k] = false; });
window.addEventListener("blur", () => { for (const k in WALK.state.keys) WALK.state.keys[k] = false; });
// on-screen pad
document.querySelectorAll(".pad button").forEach(b => {
  const k = b.dataset.k, on = e => { e.preventDefault(); WALK.state.keys[k] = true; }, off = () => { WALK.state.keys[k] = false; };
  b.addEventListener("pointerdown", on); ["pointerup", "pointerleave", "pointercancel"].forEach(t => b.addEventListener(t, off));
});
function setEra(e){
  era = e; applyEra();
  document.getElementById("btn-past").setAttribute("aria-pressed", e === "past");
  document.getElementById("btn-today").setAttribute("aria-pressed", e === "today");
  render();
}
document.getElementById("btn-past").addEventListener("click", () => setEra("past"));
document.getElementById("btn-today").addEventListener("click", () => setEra("today"));
cv.addEventListener("dblclick", () => {
  if (inside || walking) return;
  current = null; render();
  fly = {t: 0, fromT: controls.target.clone(), toT: HOME.target.clone(),
         fromP: camera.position.clone(), toP: orbitPos(HOME.target, HOME.az, HOME.pol, HOME.dist)};
});
render();
