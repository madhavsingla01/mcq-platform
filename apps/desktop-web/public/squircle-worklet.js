/**
 * G2 Curvature Continuity Squircle Paint Worklet
 *
 * Implements mathematical G2 continuous curvature (superellipse Lamé geometry)
 * with zero curvature step at transition points (matching straight edges seamlessly).
 *
 * Exponent n ≈ 4.0 - 4.4 produces Apple / iOS / Figma level G2 corner smoothing.
 */

class SquirclePainter {
  static get inputProperties() {
    return [
      '--squircle-radius',
      '--squircle-smooth',
      '--squircle-fill',
      '--squircle-border-width',
      '--squircle-border-color',
    ];
  }

  paint(ctx, geom, properties) {
    const width = geom.width;
    const height = geom.height;

    // Parse radius
    const rawRadius = properties.get('--squircle-radius')?.toString().trim();
    let radius = parseFloat(rawRadius) || 14;
    const maxR = Math.min(width, height) / 2;
    if (radius > maxR) radius = maxR;
    if (radius < 0) radius = 0;

    // Exponent n: 2 = circle/ellipse, 4.2 = standard G2 squircle, 5 = ultra-smoothed
    const rawSmooth = properties.get('--squircle-smooth')?.toString().trim();
    const n = Math.max(2.0, parseFloat(rawSmooth) || 4.2);
    const exponent = 2 / n;

    // Fill & Border
    const fill = properties.get('--squircle-fill')?.toString().trim() || '#000000';
    const borderWidth = parseFloat(properties.get('--squircle-border-width')?.toString()) || 0;
    const borderColor = properties.get('--squircle-border-color')?.toString().trim() || 'transparent';

    ctx.beginPath();

    const STEPS_PER_CORNER = 16;

    // Function to calculate squircle coordinate offset for an angle theta
    function getOffset(theta, r) {
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = r * Math.sign(cosT) * Math.pow(Math.abs(cosT), exponent);
      const y = r * Math.sign(sinT) * Math.pow(Math.abs(sinT), exponent);
      return { x, y };
    }

    // 1. Start at top-left straight edge junction
    ctx.moveTo(radius, 0);

    // 2. Top Edge to Top-Right
    ctx.lineTo(width - radius, 0);

    // Top-Right Corner: theta from -PI/2 to 0
    for (let i = 1; i <= STEPS_PER_CORNER; i++) {
      const theta = -Math.PI / 2 + (Math.PI / 2) * (i / STEPS_PER_CORNER);
      const { x, y } = getOffset(theta, radius);
      ctx.lineTo((width - radius) + x, radius + y);
    }

    // 3. Right Edge to Bottom-Right
    ctx.lineTo(width, height - radius);

    // Bottom-Right Corner: theta from 0 to PI/2
    for (let i = 1; i <= STEPS_PER_CORNER; i++) {
      const theta = (Math.PI / 2) * (i / STEPS_PER_CORNER);
      const { x, y } = getOffset(theta, radius);
      ctx.lineTo((width - radius) + x, (height - radius) + y);
    }

    // 4. Bottom Edge to Bottom-Left
    ctx.lineTo(radius, height);

    // Bottom-Left Corner: theta from PI/2 to PI
    for (let i = 1; i <= STEPS_PER_CORNER; i++) {
      const theta = Math.PI / 2 + (Math.PI / 2) * (i / STEPS_PER_CORNER);
      const { x, y } = getOffset(theta, radius);
      ctx.lineTo(radius + x, (height - radius) + y);
    }

    // 5. Left Edge to Top-Left
    ctx.lineTo(0, radius);

    // Top-Left Corner: theta from PI to 3PI/2
    for (let i = 1; i <= STEPS_PER_CORNER; i++) {
      const theta = Math.PI + (Math.PI / 2) * (i / STEPS_PER_CORNER);
      const { x, y } = getOffset(theta, radius);
      ctx.lineTo(radius + x, radius + y);
    }

    ctx.closePath();

    // Fill path (used for background painting or mask clipping)
    ctx.fillStyle = fill;
    ctx.fill();

    // Optional border stroke
    if (borderWidth > 0 && borderColor !== 'transparent') {
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      ctx.stroke();
    }
  }
}

// Register Paint Worklet
if (typeof registerPaint !== 'undefined') {
  registerPaint('squircle', SquirclePainter);
  registerPaint('g2-squircle', SquirclePainter);
}
