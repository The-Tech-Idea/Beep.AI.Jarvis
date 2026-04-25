/**
 * Waveform Avatar - Circular audio waveform visualization
 * Creates a dynamic ring that responds to audio frequencies
 */
class WaveformAvatar extends BaseAvatar {
  constructor(canvas, options = {}) {
    super(canvas, options);

    this.frequencyBands = 64;
    this.frequencies = new Array(this.frequencyBands).fill(0);
    this.targetFrequencies = new Array(this.frequencyBands).fill(0);
    this.history = [];
    this.maxHistory = 30;
    this.rotation = 0;
  }

  /**
   * Set frequency data from audio analyzer
   */
  setFrequencies(data) {
    if (data && data.length) {
      const step = Math.floor(data.length / this.frequencyBands);
      for (let i = 0; i < this.frequencyBands; i++) {
        this.targetFrequencies[i] = data[i * step] / 255;
      }
    }
  }

  updateFrequencies() {
    // Smooth frequency transitions
    for (let i = 0; i < this.frequencyBands; i++) {
      const target = this.isListening || this.isSpeaking
        ? this.targetFrequencies[i]
        : Math.sin(this.time * 2 + i * 0.2) * 0.1 + 0.1;
      this.frequencies[i] += (target - this.frequencies[i]) * 0.2;
    }

    // Store history for trail effect
    this.history.unshift([...this.frequencies]);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }
  }

  drawCenterCore() {
    const baseRadius = 60;
    const pulse = 1 + this.audioLevel * 0.2;
    const radius = baseRadius * pulse;

    // Glow
    this.drawGlow(
      this.centerX,
      this.centerY,
      radius + 30,
      this.colors.glow,
      0.5
    );

    // Core circle
    const gradient = this.ctx.createRadialGradient(
      this.centerX,
      this.centerY,
      0,
      this.centerX,
      this.centerY,
      radius
    );
    gradient.addColorStop(0, this.colors.secondary);
    gradient.addColorStop(0.5, this.colors.primary);
    gradient.addColorStop(1, "rgba(90, 209, 179, 0.2)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner ring
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius * 0.6, 0, Math.PI * 2);
    this.ctx.stroke();

    // Eye/status indicator
    if (!this.isBlinking) {
      this.ctx.fillStyle = "#ffffff";
      this.ctx.beginPath();
      this.ctx.arc(this.centerX, this.centerY, 8, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawWaveformRing(frequencies, radiusOffset, alpha, lineWidth) {
    const baseRadius = 100 + radiusOffset;

    this.ctx.strokeStyle = `rgba(90, 209, 179, ${alpha})`;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    this.ctx.beginPath();

    for (let i = 0; i <= this.frequencyBands; i++) {
      const idx = i % this.frequencyBands;
      const angle =
        (i / this.frequencyBands) * Math.PI * 2 - Math.PI / 2 + this.rotation;
      const amplitude = frequencies[idx] * 50 * (1 + this.audioLevel * 0.5);
      const r = baseRadius + amplitude;

      const x = this.centerX + Math.cos(angle) * r;
      const y = this.centerY + Math.sin(angle) * r;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.closePath();
    this.ctx.stroke();
  }

  drawHistory() {
    this.history.forEach((frequencies, index) => {
      const alpha = ((this.maxHistory - index) / this.maxHistory) * 0.15;
      const radiusOffset = index * 2;
      this.drawWaveformRing(frequencies, radiusOffset, alpha, 1);
    });
  }

  drawMainWaveform() {
    // Shadow/glow layer
    this.ctx.shadowColor = this.colors.glow;
    this.ctx.shadowBlur = 20;
    this.drawWaveformRing(this.frequencies, 0, 0.8, 3);
    this.ctx.shadowBlur = 0;

    // Main ring
    this.drawWaveformRing(this.frequencies, 0, 1, 2);
  }

  drawFrequencyBars() {
    const innerRadius = 70;
    const maxBarLength = 25;

    for (let i = 0; i < this.frequencyBands; i++) {
      const angle =
        (i / this.frequencyBands) * Math.PI * 2 - Math.PI / 2 + this.rotation;
      const barLength = this.frequencies[i] * maxBarLength;

      const x1 = this.centerX + Math.cos(angle) * innerRadius;
      const y1 = this.centerY + Math.sin(angle) * innerRadius;
      const x2 = this.centerX + Math.cos(angle) * (innerRadius - barLength);
      const y2 = this.centerY + Math.sin(angle) * (innerRadius - barLength);

      const alpha = 0.3 + this.frequencies[i] * 0.7;
      this.ctx.strokeStyle = `rgba(159, 249, 230, ${alpha})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }

  drawOuterRing() {
    const radius = 160 + this.audioLevel * 20;

    this.ctx.strokeStyle = "rgba(90, 209, 179, 0.2)";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 10]);
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Rotating markers
    const markerCount = 8;
    for (let i = 0; i < markerCount; i++) {
      const angle = (i / markerCount) * Math.PI * 2 + this.time * 0.5;
      const x = this.centerX + Math.cos(angle) * radius;
      const y = this.centerY + Math.sin(angle) * radius;

      this.ctx.fillStyle = this.colors.primary;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  render() {
    this.rotation += this.deltaTime * 0.2 * (1 + this.audioLevel);
    this.updateFrequencies();

    this.drawOuterRing();
    this.drawHistory();
    this.drawMainWaveform();
    this.drawFrequencyBars();
    this.drawCenterCore();

    // State text
    if (this.isThinking) {
      this.drawStatusText("Processing...");
    } else if (this.isListening) {
      this.drawStatusText("Listening");
    } else if (this.isSpeaking) {
      this.drawStatusText("Speaking");
    }
  }

  drawStatusText(text) {
    this.ctx.font = "12px 'Space Grotesk', sans-serif";
    this.ctx.fillStyle = this.colors.muted || "#9fb0c4";
    this.ctx.textAlign = "center";
    this.ctx.fillText(text, this.centerX, this.centerY + 90);
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = WaveformAvatar;
}
