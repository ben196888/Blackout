# BLACKOUT WebGPU — Automated 25 s Demo Tour

## Run the scene locally
Needs desktop Chrome (WebGPU). From the repo root:

```sh
cd blackout-webgpu
python3 -m http.server 8080
```

Normal first-person game: <http://localhost:8080/index.html> (click to enter; WASD, mouse, F flashlight).

## Start the tour
Open **<http://localhost:8080/index.html?demo=1>**. It starts by itself (no click, key or pointer lock), runs 25 s and freezes on the final frame.

| Time | Scene |
|---|---|
| 0–4 s | Village overview, title "BLACKOUT — From Board Game to 3D" |
| 4–9 s | First-person walk along the main road |
| 9–13 s | Night road, flashlight on |
| 13–18 s | Damaged bridge, then communication tower |
| 18–23 s | Emergency shelter |
| 23–25 s | Pull-up overview, closing title "AI Coding Agent POC \| November 2026" |

The camera path is a pure function of elapsed time (same world seed, any FPS). Reload the page to replay.

## Record on macOS (Chrome)
1. Open the `?demo=1` URL and let it load.
2. Size the window to 1280×720 (e.g. DevTools → device toolbar → 1280×720, or resize the window), then close DevTools.
3. Press **Cmd+Shift+5** → "Record Selected Portion" → select the page area (1280×720).
4. Start recording, then reload the page (Cmd+R) so the tour starts at the beginning; stop after ~27 s.

World generation takes a few seconds on load; the tour clock starts at the first rendered frame, so trim the lead-in if needed.

## Optional: frame capture
`?demo=1&capture=1` advances a fixed 1/30 s per rendered frame (750 frames total) so automated screenshots are deterministic. `window.BLK.demo.t` holds the current tour time. No video encoding is included.

## Back to normal gameplay
Remove `?demo=1` from the URL (open `index.html`). Without the parameter, none of the demo code runs.
