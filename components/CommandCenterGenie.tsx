"use client";

import { useEffect, useRef } from "react";

// WebGL "genie" minimize: warps a captured image of the Command Center panel so it
// funnels down into a point at the bottom-center (the dock), with the content
// bending along the curve — the part CSS can't do. Plays once, then calls onDone.
// `canvas` is a pre-captured snapshot of the panel; `rect` is where the panel sits
// in the viewport (so the warp starts exactly aligned to the real panel).
export default function CommandCenterGenie({
  source,
  rect,
  direction = "close",
  durationMs = 540,
  onDone,
}: {
  source: HTMLCanvasElement | HTMLImageElement;
  rect: { left: number; top: number; right: number; bottom: number };
  direction?: "open" | "close";
  durationMs?: number;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const finish = () => doneRef.current();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Use the LAYOUT viewport (excludes the scrollbar) — the canvas is fixed
    // inset-0 so it's laid out at clientWidth, and the panel rect is measured in
    // the same space. Using window.innerWidth (which includes the scrollbar)
    // shifted the warp sideways relative to the real panel.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    cv.width = Math.round(vw * dpr);
    cv.height = Math.round(vh * dpr);

    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) {
      finish();
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const vs = compile(
      gl.VERTEX_SHADER,
      `attribute vec2 aUV;
       uniform vec4 uRect;   // x0 (left), yTop, x1 (right), yBot  in clip space
       uniform vec2 uDock;   // dock target in clip space
       uniform float uP;     // 0..1 minimize progress
       varying vec2 vUV;
       void main() {
         float u = aUV.x;
         float v = aUV.y;                       // 0 = panel top, 1 = panel bottom
         // Lower rows (near the dock) get sucked in first; the neck travels up.
         float pull = clamp(uP * 1.75 - (1.0 - v) * 0.75, 0.0, 1.0);
         pull = pull * pull * (3.0 - 2.0 * pull);
         float neck = mix(1.0, 0.045, pull);    // horizontal squeeze toward center
         float uu = 0.5 + (u - 0.5) * neck;
         float baseX = mix(uRect.x, uRect.z, uu);
         float baseY = mix(uRect.y, uRect.w, v);
         float x = mix(baseX, uDock.x, pull);
         float y = mix(baseY, uDock.y, pull * pull);
         gl_Position = vec4(x, y, 0.0, 1.0);
         vUV = aUV;
       }`,
    );
    const fs = compile(
      gl.FRAGMENT_SHADER,
      `precision highp float;
       uniform sampler2D uTex;
       uniform float uP;
       varying vec2 vUV;
       void main() {
         vec4 c = texture2D(uTex, vUV);
         float a = 1.0 - smoothstep(0.82, 1.0, uP);
         gl_FragColor = vec4(c.rgb, c.a * a);
       }`,
    );
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      finish();
      return;
    }
    gl.useProgram(prog);

    // Subdivided grid mesh over the panel quad.
    const COLS = 22;
    const ROWS = 54;
    const uvs: number[] = [];
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++) uvs.push(i / COLS, j / ROWS);
    }
    const idx: number[] = [];
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * (COLS + 1) + i;
        const b = a + 1;
        const c = a + (COLS + 1);
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    const aUV = gl.getAttribLocation(prog, "aUV");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    // Texture from the captured panel.
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    try {
      // A tainted capture (cross-origin content) throws here; fall back cleanly.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      finish();
      return;
    }

    const toClipX = (px: number) => (px / vw) * 2 - 1;
    const toClipY = (px: number) => 1 - (px / vh) * 2;
    const uRect = gl.getUniformLocation(prog, "uRect");
    const uDock = gl.getUniformLocation(prog, "uDock");
    const uP = gl.getUniformLocation(prog, "uP");
    gl.uniform4f(uRect, toClipX(rect.left), toClipY(rect.top), toClipX(rect.right), toClipY(rect.bottom));
    gl.uniform2f(uDock, 0.0, -1.04);
    gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

    gl.viewport(0, 0, cv.width, cv.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let raf = 0;
    let start = 0;
    const draw = (eased: number) => {
      gl.uniform1f(uP, eased);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    };
    const render = (now: number) => {
      if (!start) start = now;
      const raw = Math.min(1, (now - start) / durationMs);
      const s = raw * raw * (3 - 2 * raw); // smoothstep
      // uP: 0 = full panel, 1 = fully minimized into the dock.
      draw(direction === "open" ? 1 - s : s);
      if (raw < 1) raf = requestAnimationFrame(render);
      else finish();
    };
    raf = requestAnimationFrame(render);

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[120]" style={{ width: "100%", height: "100%" }} />;
}
