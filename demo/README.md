# Automated gameplay demo

From the repository root, run:

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open current desktop Chrome with hardware acceleration enabled:
http://localhost:5173/?demo=1

The tour starts as soon as WebGPU finishes loading, requires no input, and holds
its final frame at 25 seconds. Reload to replay. The existing seed is 9173.

Sequence: 0–4s village/title; 4–9s main road; 9–13s flashlight exploration;
13–18s damaged crossing then tower; 18–23s shelter; 23–25s overview/closing title.

## Record on macOS

1. Set Chrome's content viewport to **1280×720** (DevTools device toolbar,
   Responsive, 1280 × 720, DPR 1; undock DevTools if needed).
2. Press **Shift–Command–5**, choose Record Selected Portion, and select the
   scene area. Start recording, then reload the demo tab.
3. After the closing title and full progress bar, stop recording from the macOS
   menu bar. Trim loading time from the beginning using QuickTime if desired.

Keep Chrome visible throughout the take. Recording uses normal elapsed time;
there is no fixed-timestep capture mode or video encoder. Actual smoothness
and capture resolution depend on your Mac and selected recording region.

Return to normal gameplay at http://localhost:5173/ (remove `demo=1`), then click
**Enter the valley**. WASD/mouse, F for flashlight, and other controls are unchanged.
`index.min.html?demo=1` runs the same tour from the minified artifact.
