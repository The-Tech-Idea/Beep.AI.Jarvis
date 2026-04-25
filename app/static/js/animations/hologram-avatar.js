/**
 * Hologram Avatar - 3D-style holographic head projection
 * Features wireframe mesh, scan lines, and glitch effects
 */
class HologramAvatar extends BaseAvatar {
  constructor(canvas, options = {}) {
    super(canvas, options);

    this.scanLineY = 0;
    this.glitchTimer = 0;
    this.glitchOffset = 0;
    this.gridPoints = this.generateHeadMesh();
    this.eyeTargetX = 0;
    this.eyeTargetY = 0;
    this.eyeX = 0;
    this.eyeY = 0;
  }

  generateHeadMesh() {
    const points = [];
    const rows = 12;
    const cols = 16;

    // Generate a simple head-shaped mesh
    for (let row = 0; row < rows; row++) {
      const rowPoints = [];
      const y = -80 + (row / (rows - 1)) * 160;

      for (let col = 0; col < cols; col++) {
        const angle = (col / cols) * Math.PI * 2;

        // Head shape profile - wider at top, narrower at chin
        let radius;
        const normalizedY = (row / (rows - 1)) * 2 - 1; // -1 to 1

        if (normalizedY < -0.3) {
          // Top of head
          radius = 50 + (1 - Math.pow(normalizedY + 0.3, 2)) * 20;
        } else if (normalizedY < 0.3) {
          // Face area - widest
          radius = 60;
        } else {
          // Chin - narrower
          radius = 60 - Math.pow(normalizedY - 0.3, 2) * 80;
        }

        radius = Math.max(20, radius);

        rowPoints.push({
          baseX: Math.cos(angle) * radius,
          baseY: y,
          baseZ: Math.sin(angle) * radius,
          x: 0,
          y: 0,
          z: 0,
        });
      }
      points.push(rowPoints);
    }

    return points;
  }

  updateMesh() {
    const time = this.time;
    const audioWave = this.audioLevel * 10;

    for (let row = 0; row < this.gridPoints.length; row++) {
      for (let col = 0; col < this.gridPoints[row].length; col++) {
        const point = this.gridPoints[row][col];

        // Add subtle wave motion
        const wave = Math.sin(time * 2 + row * 0.3 + col * 0.2) * 2;
        const audioOffset = Math.sin(time * 8 + row * 0.5) * audioWave;

        point.x = point.baseX + wave;
        point.y = point.baseY;
        point.z = point.baseZ + audioOffset;
      }
    }
  }

  projectPoint(x, y, z) {
    const perspective = 300;
    const scale = perspective / (perspective + z + 100);
    return {
      x: this.centerX + x * scale,
      y: this.centerY + y * scale,
      scale: scale,
    };
  }

  drawMesh() {
    const glitchX = this.glitchOffset;

    this.ctx.strokeStyle = `rgba(90, 209, 179, ${0.3 + this.audioLevel * 0.2})`;
    this.ctx.lineWidth = 1;

    // Draw horizontal lines
    for (let row = 0; row < this.gridPoints.length; row++) {
      this.ctx.beginPath();
      for (let col = 0; col <= this.gridPoints[row].length; col++) {
        const point = this.gridPoints[row][col % this.gridPoints[row].length];
        const projected = this.projectPoint(point.x + glitchX, point.y, point.z);

        if (col === 0) {
          this.ctx.moveTo(projected.x, projected.y);
        } else {
          this.ctx.lineTo(projected.x, projected.y);
        }
      }
      this.ctx.stroke();
    }

    // Draw vertical lines
    for (let col = 0; col < this.gridPoints[0].length; col++) {
      this.ctx.beginPath();
      for (let row = 0; row < this.gridPoints.length; row++) {
        const point = this.gridPoints[row][col];
        const projected = this.projectPoint(point.x + glitchX, point.y, point.z);

        if (row === 0) {
          this.ctx.moveTo(projected.x, projected.y);
        } else {
          this.ctx.lineTo(projected.x, projected.y);
        }
      }
      this.ctx.stroke();
    }
  }

  drawEyes() {
    // Smooth eye movement
    this.eyeX += (this.eyeTargetX - this.eyeX) * 0.1;
    this.eyeY += (this.eyeTargetY - this.eyeY) * 0.1;

    const eyeY = this.centerY - 20;
    const eyeSpacing = 25;
    const eyeWidth = this.isBlinking ? 12 : 8;
    const eyeHeight = this.isBlinking ? 2 : 10;

    // Left eye
    this.ctx.fillStyle = this.colors.secondary;
    this.ctx.beginPath();
    this.ctx.ellipse(
      this.centerX - eyeSpacing + this.eyeX * 3,
      eyeY + this.eyeY * 2,
      eyeWidth,
      eyeHeight,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Right eye
    this.ctx.beginPath();
    this.ctx.ellipse(
      this.centerX + eyeSpacing + this.eyeX * 3,
      eyeY + this.eyeY * 2,
      eyeWidth,
      eyeHeight,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Eye glow
    if (!this.isBlinking) {
      this.drawGlow(
        this.centerX - eyeSpacing + this.eyeX * 3,
        eyeY + this.eyeY * 2,
        20,
        "rgba(159, 249, 230, 0.3)"
      );
      this.drawGlow(
        this.centerX + eyeSpacing + this.eyeX * 3,
        eyeY + this.eyeY * 2,
        20,
        "rgba(159, 249, 230, 0.3)"
      );
    }
  }

  drawMouth() {
    const mouthY = this.centerY + 30;
    const mouthWidth = 40;
    const openAmount = this.audioLevel * 15;

    this.ctx.strokeStyle = this.colors.primary;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";

    if (this.isSpeaking && openAmount > 2) {
      // Open mouth when speaking
      this.ctx.beginPath();
      this.ctx.ellipse(
        this.centerX,
        mouthY,
        mouthWidth / 2,
        openAmount,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.stroke();
    } else {
      // Closed/neutral mouth
      this.ctx.beginPath();
      this.ctx.moveTo(this.centerX - mouthWidth / 2, mouthY);
      this.ctx.quadraticCurveTo(
        this.centerX,
        mouthY + 5,
        this.centerX + mouthWidth / 2,
        mouthY
      );
      this.ctx.stroke();
    }
  }

  drawScanLines() {
    // Moving scan line
    this.scanLineY += this.deltaTime * 100;
    if (this.scanLineY > this.height) {
      this.scanLineY = 0;
    }

    const gradient = this.ctx.createLinearGradient(0, this.scanLineY - 20, 0, this.scanLineY + 20);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.5, "rgba(90, 209, 179, 0.1)");
    gradient.addColorStop(1, "transparent");

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, this.scanLineY - 20, this.width, 40);

    // Static scan lines
    this.ctx.strokeStyle = "rgba(90, 209, 179, 0.03)";
    this.ctx.lineWidth = 1;
    for (let y = 0; y < this.height; y += 4) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  updateGlitch() {
    this.glitchTimer -= this.deltaTime;
    if (this.glitchTimer <= 0) {
      if (Math.random() < 0.1) {
        this.glitchOffset = (Math.random() - 0.5) * 20;
        this.glitchTimer = 0.05 + Math.random() * 0.1;
      } else {
        this.glitchOffset = 0;
        this.glitchTimer = 0.5 + Math.random() * 2;
      }
    }
  }

  drawHologramBase() {
    // Base platform
    const baseY = this.centerY + 100;
    const baseWidth = 120;
    const baseHeight = 10;

    this.ctx.fillStyle = "rgba(90, 209, 179, 0.1)";
    this.ctx.beginPath();
    this.ctx.ellipse(this.centerX, baseY, baseWidth, baseHeight, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = "rgba(90, 209, 179, 0.5)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.ellipse(this.centerX, baseY, baseWidth, baseHeight, 0, 0, Math.PI * 2);
    this.ctx.stroke();

    // Projection beam
    const beamGradient = this.ctx.createLinearGradient(
      this.centerX,
      baseY,
      this.centerX,
      this.centerY - 80
    );
    beamGradient.addColorStop(0, "rgba(90, 209, 179, 0.15)");
    beamGradient.addColorStop(1, "transparent");

    this.ctx.fillStyle = beamGradient;
    this.ctx.beginPath();
    this.ctx.moveTo(this.centerX - baseWidth, baseY);
    this.ctx.lineTo(this.centerX - 40, this.centerY - 80);
    this.ctx.lineTo(this.centerX + 40, this.centerY - 80);
    this.ctx.lineTo(this.centerX + baseWidth, baseY);
    this.ctx.closePath();
    this.ctx.fill();
  }

  render() {
    this.updateMesh();
    this.updateGlitch();

    this.drawScanLines();
    this.drawHologramBase();
    this.drawMesh();
    this.drawEyes();
    this.drawMouth();

    // Status indicator
    if (this.isThinking) {
      this.drawProcessingIndicator();
    }
  }

  drawProcessingIndicator() {
    const y = this.centerY + 70;
    const text = "PROCESSING";

    this.ctx.font = "bold 10px 'IBM Plex Mono', monospace";
    this.ctx.fillStyle = this.colors.primary;
    this.ctx.textAlign = "center";

    // Flashing text
    if (Math.floor(this.time * 4) % 2 === 0) {
      this.ctx.fillText(text, this.centerX, y);
    }

    // Loading bar
    const barWidth = 80;
    const barHeight = 4;
    const progress = (this.time % 2) / 2;

    this.ctx.fillStyle = "rgba(90, 209, 179, 0.2)";
    this.ctx.fillRect(this.centerX - barWidth / 2, y + 8, barWidth, barHeight);

    this.ctx.fillStyle = this.colors.primary;
    this.ctx.fillRect(
      this.centerX - barWidth / 2,
      y + 8,
      barWidth * progress,
      barHeight
    );
  }

  /**
   * Make eyes follow a point
   */
  lookAt(x, y) {
    this.eyeTargetX = Math.max(-1, Math.min(1, (x - this.centerX) / 100));
    this.eyeTargetY = Math.max(-1, Math.min(1, (y - this.centerY) / 100));
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = HologramAvatar;
}
