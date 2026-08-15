export default class Player {
  constructor(x = 180, y = 300) {
    this.reset(x, y);
  }

  reset(x = 180, y = 300) {
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.size = { w: 28, h: 22 };
    this.grounded = false;
    this.onPerch = false;
    this.angle = 0;
    this.wingPhase = 0;
    this.flapBoost = 0;
    this.glideCharge = 0;
    this.diveCharge = 0;
    this.facing = 1;
    this.wasHoldingW = false;
    this.wasHoldingDown = false;
    this.perchX = 0;
    this.perchW = 0;
    this.takeoffEase = 0;
  }

  update(dt, input, platforms) {
    const moveX = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
    const flapPressed = input.consumeFlap();
    const holdingW = input.up() && !input.flap();
    const justPressedW = holdingW && !this.wasHoldingW;
    const holdS = input.down() && !input.flap();
    const justPressedDown = holdS && !this.wasHoldingDown;

    const gravity = 340;
    const flapAirImpulse = 300;
    const maxFlightSpeed = 6600;
    const directionBias = moveX !== 0 ? moveX : (this.vel.x >= 0 ? 1 : -1);

    if (this.onPerch) {
      this.vel.x = 0;
      this.vel.y = 0;
      this.grounded = true;
      this.pos.x = Math.min(Math.max(this.perchX, this.pos.x + moveX * 180 * dt), this.perchX + this.perchW - this.size.w);
      this.facing = moveX === 0 ? this.facing : (moveX > 0 ? 1 : -1);
      this.wingPhase += dt * 18;
      this.angle += (0 - this.angle) * 0.18;

      if (justPressedDown) {
        this.onPerch = false;
        this.grounded = false;
        this.vel.y = 40;
        this.pos.y = platforms[1].y + platforms[1].h + 6;
        this.takeoffEase = 1;
      }

      this.wasHoldingDown = holdS;
      this.wasHoldingW = holdingW;
      return;
    }

    if (this.takeoffEase > 0) {
      this.pos.y += 42 * dt;
      this.takeoffEase = Math.max(0, this.takeoffEase - dt * 2.8);
    }

    if (moveX !== 0) {
      const acceleration = 320 + Math.abs(this.vel.x) * 1.1;
      this.vel.x += moveX * acceleration * dt;
    } else {
      this.vel.x *= Math.pow(0.89, dt * 60);
    }

    if (holdingW) {
      if (justPressedW) {
        this.vel.y -= 160;
        this.vel.x += directionBias * 130;
        this.glideCharge = 1;
      }

      this.glideCharge = Math.max(0, this.glideCharge - dt * 2.1);
      const lift = 260 * dt * (0.45 + (1 - this.glideCharge) * 0.9);
      this.vel.y -= lift;
      this.vel.x += directionBias * (210 + Math.abs(this.vel.x) * 0.8) * dt;
      if (this.vel.y < -430) this.vel.y = -430;
    } else {
      this.glideCharge = Math.max(0, this.glideCharge - dt * 2.8);
    }

    if (holdS) {
      this.diveCharge = Math.min(4.8, this.diveCharge + dt * 0.58);
      const diveForce = 28 + this.diveCharge * 42 + Math.abs(this.vel.y) * 0.011;
      this.vel.y += diveForce * dt;
      this.vel.x += directionBias * (8 + this.diveCharge * 16 + Math.abs(this.vel.y) * 0.006) * dt;
    } else {
      this.diveCharge = Math.max(0, this.diveCharge - dt * 1.5);
    }

    this.vel.y += gravity * (holdingW ? 0.72 : 1) * dt;

    if (flapPressed) {
      this.vel.y -= flapAirImpulse * 0.66;
      const lateralBoost = moveX !== 0 ? directionBias * (32 + Math.abs(this.vel.x) * 0.08) : 0;
      this.vel.x += lateralBoost;
      this.glideCharge = 0;
      this.diveCharge = Math.max(0, this.diveCharge - 0.4);
      this.flapBoost = 1;
      this.grounded = false;
    } else {
      this.flapBoost *= 0.7;
    }

    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > maxFlightSpeed) {
      const scale = maxFlightSpeed / speed;
      this.vel.x *= scale;
      this.vel.y *= scale;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    this.grounded = false;
    const ground = platforms[0] || null;
    if (ground) {
      const enteringWater = this.pos.y + this.size.h > ground.y && this.pos.y < ground.y + ground.h;
      if (enteringWater) {
        const speed = Math.hypot(this.vel.x, this.vel.y);
        const drag = Math.min(0.76, 0.28 + speed / 1300);
        this.vel.x *= 1 - drag;
        this.vel.y *= 0.28;
        this.vel.y += 70 * dt;
        this.pos.y += 18 * dt;
        this.diveCharge = 0;
      }
    }

    const perch = platforms[1] || null;
    if (perch && this.vel.y >= 0) {
      const overlapsPerch = this.pos.x + this.size.w > perch.x && this.pos.x < perch.x + perch.w && this.pos.y + this.size.h > perch.y && this.pos.y < perch.y + perch.h;
      if (overlapsPerch) {
        this.pos.y = perch.y - this.size.h;
        this.vel.y = 0;
        this.vel.x = 0;
        this.onPerch = true;
        this.grounded = true;
        this.diveCharge = 0;
        this.perchX = perch.x;
        this.perchW = perch.w;
        this.pos.x = Math.min(Math.max(this.pos.x, perch.x), perch.x + perch.w - this.size.w);
      }
    }

    if (this.grounded) {
      this.vel.y = 0;
    }

    const targetFacing = Math.abs(this.vel.x) < 8 ? this.facing : (this.vel.x >= 0 ? 1 : -1);
    this.facing += (targetFacing - this.facing) * 0.22;
    this.wasHoldingW = holdingW;
    this.wasHoldingDown = holdS;

    this.wingPhase += dt * (this.flapBoost > 0.1 ? 34 : 6);
    const targetAngle = Math.max(-1.5, Math.min(1.5, this.vel.y / 240 + this.vel.x / 500));
    this.angle += (targetAngle - this.angle) * 0.22;
  }

  draw(ctx) {
    ctx.save();
    const divePose = this.diveCharge > 0.35 && Math.abs(this.vel.x) < 80;
    const wingSweep = this.flapBoost > 0.1 ? Math.sin(this.wingPhase) * 22 : Math.sin(this.wingPhase) * 5;

    ctx.translate(this.pos.x + this.size.w / 2, this.pos.y + this.size.h / 2);
    const idleStraight = Math.abs(this.vel.x) < 28 && Math.abs(this.vel.y) < 40;
    const stretchX = this.onPerch ? 1 : (divePose ? 0.9 : (idleStraight ? 1.12 : 1));
    const stretchY = this.onPerch ? 0.9 : (divePose ? 1.8 : (idleStraight ? 0.92 : 1));
    ctx.scale(this.facing * stretchX, stretchY);
    ctx.rotate(this.angle);

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(0, 0, idleStraight ? 17 : (divePose ? 12 : 16), this.onPerch ? 10 : (divePose ? 18 : (idleStraight ? 10 : 12)), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff9f43';
    ctx.beginPath();
    ctx.ellipse(-8, 3 + wingSweep * (this.onPerch ? 0.18 : (divePose ? 0.12 : 0.35)), this.onPerch ? 16 : (divePose ? 12 : 18), this.onPerch ? 8 : (divePose ? 16 : 10), -0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath();
    ctx.ellipse(6, 6, idleStraight ? 7 : 6, idleStraight ? 8.5 : 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff7f50';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(27, 4);
    ctx.lineTo(16, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1a1d24';
    ctx.beginPath();
    ctx.arc(8, -5, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
