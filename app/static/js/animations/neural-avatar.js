/**
 * Neural Avatar - Neural network visualization with connected nodes
 * Shows AI "thinking" with dynamic node connections and pulses
 */
class NeuralAvatar extends BaseAvatar {
  constructor(canvas, options = {}) {
    super(canvas, options);

    this.nodes = [];
    this.connections = [];
    this.pulses = [];
    this.centralNode = null;
    this.layers = [];

    this.initNetwork();
  }

  initNetwork() {
    // Create central "brain" node
    this.centralNode = {
      x: this.centerX,
      y: this.centerY,
      radius: 30,
      pulseRadius: 30,
      connections: [],
    };

    // Create layers of nodes around the center
    const layerConfigs = [
      { count: 6, radius: 80, nodeRadius: 12 },
      { count: 10, radius: 130, nodeRadius: 8 },
      { count: 14, radius: 170, nodeRadius: 5 },
    ];

    layerConfigs.forEach((config, layerIndex) => {
      const layer = [];
      for (let i = 0; i < config.count; i++) {
        const angle = (i / config.count) * Math.PI * 2 - Math.PI / 2;
        const node = {
          x: this.centerX + Math.cos(angle) * config.radius,
          y: this.centerY + Math.sin(angle) * config.radius,
          baseX: this.centerX + Math.cos(angle) * config.radius,
          baseY: this.centerY + Math.sin(angle) * config.radius,
          radius: config.nodeRadius,
          angle: angle,
          layer: layerIndex,
          activity: 0,
          targetActivity: 0,
        };
        layer.push(node);
        this.nodes.push(node);
      }
      this.layers.push(layer);
    });

    // Create connections
    this.createConnections();
  }

  createConnections() {
    // Connect central to first layer
    this.layers[0].forEach((node) => {
      this.connections.push({
        from: this.centralNode,
        to: node,
        strength: 0.8 + Math.random() * 0.2,
      });
    });

    // Connect adjacent layers
    for (let l = 0; l < this.layers.length - 1; l++) {
      const currentLayer = this.layers[l];
      const nextLayer = this.layers[l + 1];

      currentLayer.forEach((node, i) => {
        // Connect to nearby nodes in next layer
        const connectCount = 2 + Math.floor(Math.random() * 2);
        const startIdx = Math.floor((i / currentLayer.length) * nextLayer.length);

        for (let c = 0; c < connectCount; c++) {
          const targetIdx = (startIdx + c) % nextLayer.length;
          this.connections.push({
            from: node,
            to: nextLayer[targetIdx],
            strength: 0.3 + Math.random() * 0.4,
          });
        }
      });
    }

    // Connect within same layer (sparse)
    this.layers.forEach((layer) => {
      for (let i = 0; i < layer.length; i++) {
        if (Math.random() < 0.3) {
          const nextIdx = (i + 1) % layer.length;
          this.connections.push({
            from: layer[i],
            to: layer[nextIdx],
            strength: 0.2 + Math.random() * 0.2,
          });
        }
      }
    });
  }

  spawnPulse(fromNode, toNode) {
    this.pulses.push({
      from: fromNode,
      to: toNode,
      progress: 0,
      speed: 0.02 + Math.random() * 0.03,
      size: 3 + Math.random() * 3,
    });
  }

  updateNodes() {
    const time = this.time;

    // Update node positions with subtle movement
    this.nodes.forEach((node) => {
      const wobble = Math.sin(time * 2 + node.angle * 3) * 3;
      const breathe = Math.sin(time * 1.5) * 2;

      node.x = node.baseX + Math.cos(node.angle) * wobble;
      node.y = node.baseY + Math.sin(node.angle) * wobble + breathe;

      // Update activity
      node.activity += (node.targetActivity - node.activity) * 0.1;
      node.targetActivity *= 0.95; // Decay
    });

    // Trigger activity based on audio/state
    if (this.isThinking || this.isSpeaking || this.audioLevel > 0.1) {
      const activeCount = Math.floor(3 + this.audioLevel * 10);
      for (let i = 0; i < activeCount; i++) {
        const randomNode = this.nodes[Math.floor(Math.random() * this.nodes.length)];
        randomNode.targetActivity = 0.5 + Math.random() * 0.5;

        // Spawn pulses from active nodes
        if (Math.random() < 0.3) {
          const conn = this.connections.find((c) => c.from === randomNode || c.to === randomNode);
          if (conn) {
            this.spawnPulse(conn.from, conn.to);
          }
        }
      }
    }

    // Update central node pulse
    this.centralNode.pulseRadius = 30 + this.audioLevel * 20 + Math.sin(time * 3) * 5;
  }

  updatePulses() {
    this.pulses = this.pulses.filter((pulse) => {
      pulse.progress += pulse.speed * (1 + this.audioLevel);

      if (pulse.progress >= 1) {
        // Activate destination node
        if (pulse.to.targetActivity !== undefined) {
          pulse.to.targetActivity = Math.min(1, pulse.to.targetActivity + 0.3);
        }
        return false;
      }
      return true;
    });

    // Limit pulse count
    while (this.pulses.length > 50) {
      this.pulses.shift();
    }
  }

  drawConnections() {
    this.connections.forEach((conn) => {
      const activity = Math.max(
        conn.from.activity || 0,
        conn.to.activity || 0,
        this.audioLevel * 0.3
      );
      const alpha = 0.1 + activity * 0.3;

      this.ctx.strokeStyle = `rgba(90, 209, 179, ${alpha})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(conn.from.x, conn.from.y);
      this.ctx.lineTo(conn.to.x, conn.to.y);
      this.ctx.stroke();
    });
  }

  drawPulses() {
    this.pulses.forEach((pulse) => {
      const x = pulse.from.x + (pulse.to.x - pulse.from.x) * pulse.progress;
      const y = pulse.from.y + (pulse.to.y - pulse.from.y) * pulse.progress;

      // Glow
      this.drawGlow(x, y, pulse.size * 3, "rgba(159, 249, 230, 0.5)");

      // Core
      this.ctx.fillStyle = this.colors.secondary;
      this.ctx.beginPath();
      this.ctx.arc(x, y, pulse.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  drawNodes() {
    // Draw outer layer nodes first
    for (let l = this.layers.length - 1; l >= 0; l--) {
      this.layers[l].forEach((node) => {
        const activity = node.activity;
        const radius = node.radius * (1 + activity * 0.3);

        // Node glow
        if (activity > 0.1) {
          this.drawGlow(
            node.x,
            node.y,
            radius * 3,
            `rgba(90, 209, 179, ${activity * 0.3})`
          );
        }

        // Node body
        const gradient = this.ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          radius
        );
        gradient.addColorStop(0, `rgba(159, 249, 230, ${0.5 + activity * 0.5})`);
        gradient.addColorStop(1, `rgba(90, 209, 179, ${0.2 + activity * 0.3})`);

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Node border
        this.ctx.strokeStyle = `rgba(159, 249, 230, ${0.3 + activity * 0.5})`;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      });
    }
  }

  drawCentralNode() {
    const node = this.centralNode;
    const activity = 0.5 + this.audioLevel * 0.5;

    // Outer pulse rings
    for (let i = 0; i < 3; i++) {
      const ringRadius = node.pulseRadius + i * 15;
      const alpha = (0.2 - i * 0.05) * activity;

      this.ctx.strokeStyle = `rgba(90, 209, 179, ${alpha})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Central glow
    this.drawGlow(node.x, node.y, node.radius * 2, this.colors.glow, 0.6);

    // Central core
    const gradient = this.ctx.createRadialGradient(
      node.x - node.radius * 0.3,
      node.y - node.radius * 0.3,
      0,
      node.x,
      node.y,
      node.radius
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.4, this.colors.secondary);
    gradient.addColorStop(1, this.colors.primary);

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner eye effect
    if (!this.isBlinking) {
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawStatusText() {
    let text = "";
    if (this.isThinking) text = "Processing";
    else if (this.isListening) text = "Listening";
    else if (this.isSpeaking) text = "Speaking";
    else text = "Ready";

    this.ctx.font = "11px 'Space Grotesk', sans-serif";
    this.ctx.fillStyle = "rgba(159, 249, 230, 0.6)";
    this.ctx.textAlign = "center";
    this.ctx.fillText(text.toUpperCase(), this.centerX, this.height - 20);
  }

  render() {
    this.updateNodes();
    this.updatePulses();

    this.drawConnections();
    this.drawNodes();
    this.drawPulses();
    this.drawCentralNode();
    this.drawStatusText();
  }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
  module.exports = NeuralAvatar;
}
