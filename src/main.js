import Input from './input.js';
import Player from './player.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const speedReadout = document.getElementById('speed-readout');
const miniMapDistance = document.getElementById('mini-map-distance');
const miniMapAltitude = document.getElementById('mini-map-altitude');
const miniMapPlayer = document.getElementById('mini-map-player');

const world = {
  width: 2200,
  height: 80000,
  ground: { x: 0, y: 79650, w: 2200, h: 350 },
  perch: { x: 240, y: 220, w: 180, h: 18 },
  platforms: []
};

const input = new Input();
const player = new Player(world.perch.x + 24, world.perch.y - 22);
player.onPerch = true;
player.perchX = world.perch.x;
player.perchW = world.perch.w;

const stars = Array.from({ length: 700 }, () => ({
  x: Math.random() * world.width,
  y: Math.random() * world.height,
  r: Math.random() * 2.6 + 1,
  a: Math.random() * 0.9 + 0.2,
  pulse: Math.random() * 1000
}));

let camera = { x: 0, y: 0 };
let lastTime = performance.now();

function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function updateHud() {
  const speed = Math.min(210, Math.max(0, Math.hypot(player.vel.x, player.vel.y) * 0.032));
  speedReadout.textContent = `${Math.round(speed)}`;

  const distanceToWater = Math.max(0, world.ground.y - (player.pos.y + player.size.h / 2));
  const worldProgress = Math.min(100, Math.max(0, ((player.pos.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)) * 100));
  miniMapPlayer.style.top = `${worldProgress}%`;

  const distanceText = distanceToWater >= 1000 ? `${(distanceToWater / 1000).toFixed(1)}k` : `${Math.round(distanceToWater)}m`;
  miniMapDistance.textContent = `${distanceText}`;
  miniMapAltitude.textContent = `${Math.round(worldProgress)}%`;
}

function updateCamera() {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  camera.x = Math.max(0, Math.min(world.width - screenW, player.pos.x - screenW * 0.45));
  camera.y = Math.max(0, Math.min(world.height - screenH, player.pos.y - screenH * 0.5));
}

function update(dt) {
  if (input.consumeReset()) {
    player.reset(world.perch.x + 24, world.perch.y - 22);
    player.onPerch = true;
    player.perchX = world.perch.x;
    player.perchW = world.perch.w;
  }

  player.update(dt, input, [world.ground, world.perch]);
  updateCamera();
  updateHud();

  if (player.pos.y > world.height + 100) {
    player.pos.y = 120;
    player.vel.y = 0;
  }

  if (player.pos.x < 0) player.pos.x = 0;
  if (player.pos.x + player.size.w > world.width) player.pos.x = world.width - player.size.w;
}

function drawBackground() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#040b1a');
  sky.addColorStop(0.45, '#101c2d');
  sky.addColorStop(1, '#1b2e45');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const sx = (star.x - camera.x) * 1.1;
    const sy = (star.y - camera.y) * 1.1;
    if (sx < -10 || sy < -10 || sx > width + 10 || sy > height + 10) continue;
    const glow = 0.35 + (Math.sin((performance.now() + star.pulse) * 0.003) + 1) * 0.35;
    ctx.fillStyle = `rgba(255,255,255,${star.a + glow * 0.2})`;
    ctx.beginPath();
    ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  const g = world.ground;
  const p = world.perch;

  const water = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
  water.addColorStop(0, '#1e4d75');
  water.addColorStop(0.35, '#2b6d8f');
  water.addColorStop(1, '#173d63');
  ctx.fillStyle = water;
  ctx.fillRect(g.x, g.y, g.w, g.h);

  for (let i = 0; i < 24; i++) {
    const x = (i * 120 + (performance.now() * 0.03)) % (g.w + 120) - 120;
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, g.y + 26 + (i % 4) * 10);
    ctx.quadraticCurveTo(x + 22, g.y + 18 + (i % 4) * 10, x + 46, g.y + 26 + (i % 4) * 10);
    ctx.stroke();
  }

  ctx.fillStyle = '#b58d53';
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = '#f7d18b';
  ctx.fillRect(p.x, p.y, p.w, 3);
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  player.draw(ctx);
  ctx.restore();
}

function draw() {
  drawBackground();
  drawGround();
  drawPlayer();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(loop);

window.__game = { player, world, input };
