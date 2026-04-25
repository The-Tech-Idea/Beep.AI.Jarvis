/**
 * Orb Avatar - Floating energy orb with particle effects
 * Reacts to audio with pulsing, particle emission, and color shifts
 */
class OrbAvatar extends BaseAvatar {
  constructor(canvas, options = {}) {
    super(canvas, options);

    this.particles = [];
    this.maxParticles = 60;
    this.orbRadius = 80;
    this.rings = [];
    this.initRings();
  }

  initRings() {
    // Create orbital rings
    for (let i = 0; i < 3; i++) {
      this.rings.push({
        radius: 100 + i * 30,
        rotation: Math.random() * Math.PI * 2,
        speed: 0.3 + i * 0.2,
        tilt: 0.3 + i * 0.15,
        dots: Math.floor(8 + i * 4),
      });
    }
  }

  spawnParticle() {
    if (this.particles.length >= this.maxParticles) return;

    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    const radius = this.orbRadius * (0.8 + Math.random() * 0.4);

    this.particles.push({
      x: this.centerX + Math.cos(angle) * radius,
      y: this.centerY + Math.sin(angle) * radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      size: 2 + Math.random() * 4,
      hue: 160 + Math.random() * 20,
    });
  }

  updateParticles() {
    // Spawn particles based on audio level
    const spawnRate = Math.floor(this.audioLevel * 5);
    for (let i = 0; i < spawnRate; i++) {
      this.spawnParticle();
    }

    // Update existing particles
    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.02; // Float upward
      p.life -= p.decay;
      p.size *= 0.99;
      return p.life > 0 && p.size > 0.5;
    });
  }

  drawParticles() {
    this.particles.forEach((p) => {
      const alpha = p.life * 0.8;
      this.ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  drawOrb() {
    const pulse = 1 + this.audioLevel * 0.3;
    const radius = this.orbRadius * pulse;

    // Outer glow
    const glowRadius = radius + 40 + this.audioLevel * 60;
    this.drawGlow(
      this.centerX,
      this.centerY,
      glowRadius,
      this.colors.glow,
      0.4 + this.audioLevel * 0.3
    );

    // Core gradient
    const gradient = this.ctx.createRadialGradient(
      this.centerX - radius * 0.3,
      this.centerY - radius * 0.3,
      0,
      this.centerX,
      this.centerY,
      radius
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.3, this.colors.secondary);
    gradient.addColorStop(0.7, this.colors.primary);
    gradient.addColorStop(1, "rgba(90, 209, 179, 0.3)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner energy core
    const coreRadius = radius * 0.4;
    const coreGradient = this.ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      0,
      this.centerX,
      this.centerY,
      coreRadius
    );
    coreGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    coreGradient.addColorStop(0.5, "rgba(159, 249, 230, 0.6)");
    coreGradient.addColorStop(1, "transparent");

    this.ctx.fillStyle = coreGradient;
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, coreRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawRings() {
    this.rings.forEach((ring, index) => {
      ring.rotation += ring.speed * this.deltaTime * (1 + this.audioLevel);

      this.ctx.strokeStyle = `rgba(90, 209, 179, ${0.2 + index * 0.1})`;
      this.ctx.lineWidth = 1;

      // Draw elliptical ring
      this.ctx.save();
      this.ctx.translate(this.centerX, this.centerY);
      this.ctx.rotate(ring.rotation);
      this.ctx.scale(1, ring.tilt);

      this.ctx.beginPath();
      this.ctx.arc(0, 0, ring.radius + this.audioLevel * 20, 0, Math.PI * 2);
      this.ctx.stroke();

      // Draw dots on ring
      for (let i = 0; i < ring.dots; i++) {
        const angle = (i / ring.dots) * Math.PI * 2;
        const dotRadius = ring.radius + this.audioLevel * 20;
        const x = Math.cos(angle) * dotRadius;
        const y = Math.sin(angle) * dotRadius;

        this.ctx.fillStyle = this.colors.secondary;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 2 + this.audioLevel * 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    });
  }

  drawWaveform() {
    if (this.audioLevel < 0.05) return;

    const waveCount = 3;
    for (let w = 0; w < waveCount; w++) {
      const offset = (this.time * 2 + w * 0.5) % 1;
      const waveRadius = this.orbRadius + offset * 100;
      const alpha = (1 - offset) * 0.3 * this.audioLevel;

      this.ctx.strokeStyle = `rgba(90, 209, 179, ${alpha})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(this.centerX, this.centerY, waveRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  render() {
    this.updateParticles();
    this.drawWaveform();
    this.drawParticles();
    this.drawRings();
    this.drawOrb();

    // State indicators
    if (this.isThinking) {
      this.drawThinkingIndicator();
    }
    if (this.isListening) {
      this.drawListeningIndicator();
    }
  }

  drawThinkingIndicator() {
    const dotCount = 3;
    const dotSpacing = 20;
    const baseY = this.centerY + this.orbRadius + 50;

    for (let i = 0; i < dotCount; i++) {
      const x = this.centerX + (i - 1) * dotSpacing;
      const bounce = Math.sin(this.time * 5 + i * 0.5) * 8;

      this.ctx.fillStyle = this.colors.primary;
      this.ctx.beginPath();
      this.ctx.arc(x, baseY + bounce, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawListeningIndicator() {
    const barCount = 5;
    const barWidth = 4;
    const barSpacing = 8;
    const maxHeight = 30;
    const baseY = this.centerY - this.orbRadius - 40;

    for (let i = 0; i < barCount; i++) {
      const x =
        this.centerX + (i - (barCount - 1) / 2) * (barWidth + barSpacing);
      const height =
        (Math.sin(this.time * 8 + i * 0.8) * 0.5 + 0.5) *
        maxHeight *
        (0.3 + this.audioLevel * 0.7);

      this.ctx.fillStyle = this.colors.accent;
      this.ctx.fillRect(x - barWidth / 2, baseY - height, barWidth, height);
    }
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = OrbAvatar;
}
