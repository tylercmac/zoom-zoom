export class TargetDove {
  constructor(baseY = 63744) {
    this.baseY = baseY;
    this.reset();
  }

  reset() {
    this.minX = 280;
    this.maxX = 1920;
    this.pos = {
      x: (this.minX + this.maxX) * 0.5,
      y: this.baseY
    };
    this.speed = 220;
    this.facing = 1; // 1 = right, -1 = left
    this.size = { w: 26, h: 20 };
    this.wingPhase = 0;
    this.bobTimer = Math.random() * 100;
    this.isCaught = false;
    this.isCarried = false;
    this.catchTime = 0;
    this.strikeSpeed = 0;
    this.tooSlowCooldown = 0;
    this.startledTimer = 0;
  }

  update(dt) {
    if (this.tooSlowCooldown > 0) {
      this.tooSlowCooldown = Math.max(0, this.tooSlowCooldown - dt);
    }
    if (this.startledTimer > 0) {
      this.startledTimer = Math.max(0, this.startledTimer - dt);
    }

    if (this.isCaught) {
      this.catchTime += dt;
      // Drift downward slowly when struck
      this.pos.y += 180 * dt;
      this.pos.x += this.facing * 40 * dt;
      this.wingPhase += dt * 8;
      return;
    }

    this.bobTimer += dt * 2.2;
    this.pos.y = this.baseY + Math.sin(this.bobTimer) * 36;

    // Move horizontally (faster if startled)
    const currentSpeed = this.startledTimer > 0 ? this.speed * 1.8 : this.speed;
    this.pos.x += this.facing * currentSpeed * dt;

    // Turn around at boundaries
    if (this.pos.x >= this.maxX) {
      this.pos.x = this.maxX;
      this.facing = -1;
    } else if (this.pos.x <= this.minX) {
      this.pos.x = this.minX;
      this.facing = 1;
    }

    // Wing flap animation cycle
    this.wingPhase += dt * (this.startledTimer > 0 ? 32 : 14);
  }

  checkCollision(player) {
    if (this.isCaught) return null;

    const doveCenterX = this.pos.x + this.size.w * 0.5;
    const doveCenterY = this.pos.y + this.size.h * 0.5;

    const prevCenterX = (player.prevPos ? player.prevPos.x : player.pos.x) + player.size.w * 0.5;
    const prevCenterY = (player.prevPos ? player.prevPos.y : player.pos.y) + player.size.h * 0.5;

    const curCenterX = player.pos.x + player.size.w * 0.5;
    const curCenterY = player.pos.y + player.size.h * 0.5;

    // Continuous swept segment point-to-line collision distance
    const segX = curCenterX - prevCenterX;
    const segY = curCenterY - prevCenterY;
    const toDoveX = doveCenterX - prevCenterX;
    const toDoveY = doveCenterY - prevCenterY;
    const segLenSq = segX * segX + segY * segY;

    let dist;
    if (segLenSq === 0) {
      dist = Math.hypot(toDoveX, toDoveY);
    } else {
      const t = Math.max(0, Math.min(1, (toDoveX * segX + toDoveY * segY) / segLenSq));
      const closeX = prevCenterX + t * segX;
      const closeY = prevCenterY + t * segY;
      dist = Math.hypot(doveCenterX - closeX, doveCenterY - closeY);
    }

    const hitRadius = 44; // combined bounding radius
    if (dist <= hitRadius) {
      const speedMph = Math.round(Math.hypot(player.vel.x, player.vel.y) * 0.032);

      if (speedMph >= 200 && speedMph <= 210) {
        this.isCaught = true;
        this.strikeSpeed = speedMph;
        return { hit: true, status: 'caught', speed: speedMph };
      } else if (speedMph > 210) {
        if (this.tooSlowCooldown <= 0) {
          this.tooSlowCooldown = 0.8;
          this.startledTimer = 0.6;
          // Startled evasive flutter boost away
          this.facing = player.vel.x >= 0 ? 1 : -1;
          this.pos.x += this.facing * 40;
          return { hit: true, status: 'too_fast', speed: speedMph };
        }
      } else {
        if (this.tooSlowCooldown <= 0) {
          this.tooSlowCooldown = 0.8;
          this.startledTimer = 0.6;
          // Startled evasive flutter boost away
          this.facing = player.vel.x >= 0 ? 1 : -1;
          this.pos.x += this.facing * 40;
          return { hit: true, status: 'too_slow', speed: speedMph };
        }
      }
    }

    return null;
  }

  draw(ctx) {
    if (this.isCarried) return;

    ctx.save();
    ctx.translate(this.pos.x + this.size.w * 0.5, this.pos.y + this.size.h * 0.5);

    if (this.isCaught) {
      ctx.rotate(this.catchTime * 5 * this.facing);
      ctx.globalAlpha = Math.max(0, 1 - this.catchTime * 0.4);
    }

    ctx.scale(this.facing, 1);

    const wingSweep = Math.sin(this.wingPhase) * 14;

    // Back / Far Wing
    ctx.fillStyle = '#d9e2ec';
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.quadraticCurveTo(-16, -18 - wingSweep, -24, -14 - wingSweep * 0.6);
    ctx.quadraticCurveTo(-14, -2, -2, 2);
    ctx.closePath();
    ctx.fill();

    // Tail Feathers
    ctx.fillStyle = '#f0f4f8';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-24, -6);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-24, 6);
    ctx.closePath();
    ctx.fill();

    // Main Body
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 8, 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Belly Shading
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(-1, 2.5, 10, 5, 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(10, -2, 6, 5.5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(12, -3, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(15, -3);
    ctx.lineTo(22, -1);
    ctx.lineTo(15, 1);
    ctx.closePath();
    ctx.fill();

    // Near / Front Wing
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.quadraticCurveTo(10, -18 - wingSweep * 1.1, 20, -16 - wingSweep * 0.7);
    ctx.quadraticCurveTo(6, 4, -4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
