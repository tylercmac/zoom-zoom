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
  perch: { x: 0, y: 120, w: 2200, h: 24 },
  platforms: []
};

const input = new Input();
const player = new Player(window.innerWidth * 0.5 - 15, world.perch.y - 22);
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

const windStreaks = Array.from({ length: 26 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight,
  h: Math.random() * 80 + 24,
  alpha: Math.random() * 0.28 + 0.04,
  drift: Math.random() * 1.0 + 0.6
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
    player.reset(window.innerWidth * 0.5 - 15, world.perch.y - 22);
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

  const downwardSpeed = Math.max(0, player.vel.y);
  const parallaxBoost = 1 + Math.min(0.7, downwardSpeed / 2600);

  for (const star of stars) {
    const sx = (star.x - camera.x) * (1.1 + parallaxBoost * 0.16);
    const sy = (star.y - camera.y) * (1.1 + parallaxBoost * 0.2);
    if (sx < -10 || sy < -10 || sx > width + 10 || sy > height + 10) continue;
    const glow = 0.35 + (Math.sin((performance.now() + star.pulse) * 0.003) + 1) * 0.35;
    ctx.fillStyle = `rgba(255,255,255,${star.a + glow * 0.2})`;
    ctx.beginPath();
    ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const speedMph = Math.hypot(player.vel.x, player.vel.y) * 0.032;
  const windStrength = Math.min(1, Math.max(0, (speedMph - 120) / 140));
  if (windStrength > 0.01) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const streak of windStreaks) {
      const x = (streak.x + (performance.now() * 0.01 * streak.drift) + camera.x * 0.04) % (width + 40) - 20;
      const y = (streak.y + (performance.now() * 0.015 * streak.drift) + camera.y * 0.02) % (height + 40) - 20;
      const alpha = streak.alpha * (0.2 + windStrength);
      ctx.strokeStyle = `rgba(170, 214, 255, ${alpha})`;
      ctx.lineWidth = 0.8 + windStrength * 1.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + streak.h * (0.5 + windStrength));
      ctx.stroke();
    }
    ctx.restore();
  }

  const progress = Math.min(1, Math.max(0, (player.pos.y - world.perch.y) / Math.max(1, world.ground.y - world.perch.y)));
  const bayReveal = Math.min(1, Math.max(0, (progress - 0.42) / 0.38));
  if (bayReveal > 0.01) {
    const bayY = height * 0.72;
    const layerOffset = (camera.y * 0.07) % 120;

    ctx.save();
    ctx.globalAlpha = 0.18 + bayReveal * 0.28;
    const bay = ctx.createLinearGradient(0, bayY, 0, height);
    bay.addColorStop(0, 'rgba(86, 126, 170, 0.0)');
    bay.addColorStop(0.4, 'rgba(71, 112, 155, 0.15)');
    bay.addColorStop(1, 'rgba(20, 39, 60, 0.5)');
    ctx.fillStyle = bay;
    ctx.fillRect(0, bayY, width, height - bayY);

    ctx.fillStyle = 'rgba(72, 92, 110, 0.18)';
    ctx.beginPath();
    ctx.moveTo(0, bayY + 18 - layerOffset);
    ctx.lineTo(width * 0.18, bayY - 18 - layerOffset);
    ctx.lineTo(width * 0.4, bayY + 24 - layerOffset);
    ctx.lineTo(width * 0.62, bayY - 20 - layerOffset);
    ctx.lineTo(width * 0.86, bayY + 18 - layerOffset);
    ctx.lineTo(width, bayY + 12 - layerOffset);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

  ctx.fillStyle = '#8d1d1d';
  ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = '#b93a2d';
  ctx.fillRect(p.x, p.y + 6, p.w, 5);

  ctx.fillStyle = '#d9c7b5';
  for (let x = p.x + 18; x < p.x + p.w; x += 48) {
    ctx.fillRect(x, p.y + 10, 18, 7);
  }

  ctx.fillStyle = '#7f1c1c';
  for (let x = p.x + 30; x < p.x + p.w; x += 120) {
    ctx.fillRect(x, p.y - 32, 6, 32);
    ctx.fillRect(x + 24, p.y - 32, 6, 32);
  }

  ctx.strokeStyle = 'rgba(255, 220, 200, 0.38)';
  ctx.lineWidth = 1.5;
  for (let x = p.x + 12; x < p.x + p.w; x += 52) {
    ctx.beginPath();
    ctx.moveTo(x, p.y + 2);
    ctx.lineTo(x + 12, p.y - 20);
    ctx.stroke();
  }

  ctx.fillStyle = '#5d1111';
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
