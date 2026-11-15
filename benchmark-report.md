# BLACKOUT — benchmark report

## Deliverables and running

- `index.html`: the complete, standalone scene, including CSS, JavaScript, WGSL, geometry generation, and interface.
- `index.min.html`: the same scene with JavaScript/CSS and inter-tag whitespace minified.
- No application runtime packages, image files, models, fonts, remote assets, engine, or build step are needed. The existing repository's React/Vite application is not imported by this deliverable.

Open either HTML file in current desktop Chrome with WebGPU and hardware acceleration enabled. If local-file access is restricted by browser policy, serve this directory on localhost, for example `python3 -m http.server 5173 --bind 127.0.0.1`, then visit `http://localhost:5173`. Internet access is not required. Click **Enter the valley** to capture the mouse. Escape releases it; the same button resumes exploration.

## Implementation

The scene uses native WebGPU only. Fixed seed **9173** generates Rook Valley: ten houses of varying dimensions and surface treatments, including an illuminated emergency shelter with a medical cross and porch; interconnected roads and paths; fences, grass, a conifer belt, bare trees, mountain ridges, utility poles and sagging wires; an abandoned pickup, crates, barrels and benches; a washed-out bridge and physical road barrier; and a braced communications tower and equipment hut on a raised eastern ridge. A sloping path reaches the tower.

Weathered plaster, masonry, planks, roof seams, gravel, wet patches, metal, dark windows, vegetation, and water are produced mathematically in WGSL. Lighting combines cool moonlight, a cached 2048² directional shadow map with 3×3 PCF, local amber lights with inverse-square-style falloff and subtle flicker, emissive shelter details and a blinking tower beacon. The player flashlight has a smooth cone, brighter center, normal-dependent illumination, and distance falloff. The sky has procedural stars, slowly moving noise clouds, a mottled moon and halo. Distance/height-dependent haze, tone mapping, and a restrained vignette unify the scene.

WASD movement, mouse-look with pointer lock, sprint, jump, gravity, terrain following, and axis-separated substepped collision are implemented. Major building volumes, the vehicle, utility poles, tower platform, bridge edges, and the barricade have collision. The free camera permits full inspection; returning to walking inside an obstacle safely resets to the entrance. UI includes a heading indicator, tracked player map, help, render scale, fog and sensitivity controls, flashlight and camera toggles, and optional telemetry.

### Controls

| Input | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Shift / Space | Sprint / jump |
| F | Flashlight |
| V | Walk / free camera |
| Space / Ctrl in free camera | Rise / descend |
| M / P | Map / performance overlay |
| H / ? | Hide HUD / help |
| Esc | Release mouse |

## Validation performed

Validation date: **2026-11-15**.

1. **JavaScript parsing:** both original and minified module scripts passed `node --check`.
2. **Scene and movement checks:** `node scripts/benchmark-check.cjs` passed. Checks cover finite geometry, ten buildings, upward roof normals, road geometry, depressed water-channel terrain, walking displacement, sustained building collision, jump height and landing, free-camera ascent, and sustained barricade collision. Source checks found no external asset links or network APIs.
3. **Native WebGPU validation:** extracted, unchanged WGSL and generated vertex/uniform data were submitted through `wgpu-py` to the Vulkan **SwiftShader Device (Subzero), CPU adapter**. Main and shadow shaders compiled; shadow, sky and world pipelines were created; all three passes rendered and texture readback succeeded without validation errors. This validates actual shaders and rendering commands, not a mock renderer.
4. **Flashlight rendering:** a second render with only the flashlight uniform toggled changed the rendered image; the mean absolute difference was **4.303/255 across RGBA channels**. Both rendered views were visually inspected during development. This is a functional image-difference check, not a quality or speed score.
5. **Browser validation limitation:** the managed preview initially attempted the repository's Vite script, which had no installed dependencies. A dedicated static-preview configuration then failed because the managed relay timed out. The shared browser failed to initialize with `the gaas-browser node_repl sandbox cannot be disabled`. A separate installed headless Chromium run was blocked from opening the local artifact with `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy settings were changed. Consequently, browser WebGPU initialization, pointer-lock behavior, DOM presentation, browser resize behavior, and sustained interactive browsing have **not** been verified here. Native rendering and movement tests do not substitute for those checks.

## Performance observations

| Property | Result |
| --- | --- |
| Generated scene triangles | **62,227** |
| World vertex-buffer size | **7,467,240 bytes** |
| Buildings / major collision volumes | **10 / 21** |
| Steady-state draw calls | **2**: sky + world |
| First frame | **1 additional** cached shadow draw |
| Native validation image | **1440 × 900** |
| Shadow map | **2048 × 2048**, depth32float |
| Browser FPS at 1920 × 1080 | **Not measured** |
| Mid-range GPU 60 FPS target | **Not verified** |
| Long-run browser memory stability | **Not measured** |

Native software render submission plus synchronous readback took approximately **1.44 seconds** in the final check. This one-off CPU-adapter result includes readback and startup effects; it is **not** a browser frame-time benchmark and must not be interpreted as desktop GPU performance.

The on-screen P overlay reports rolling requestAnimationFrame FPS and frame time, draw calls, scene triangle count, actual framebuffer dimensions, camera mode and coordinates. These are CPU/RAF timings, not GPU timestamp queries. Render resolution follows the selected scale and device pixel ratio (capped at 1.5), bounded by the GPU texture limit. At DPR 1, a 1920 × 1080 viewport with Native selected renders 1920 × 1080.

Geometry and pipelines are created before exploration is enabled. The world is batched into one static vertex buffer. The static directional shadow pass is cached. Timing history is bounded to 600 samples; resize destroys the previous depth texture. These design choices limit allocation growth, but are not a substitute for a long-running browser memory measurement.

## Artifact sizes

Measured UTF-8 file sizes:

| Artifact | Bytes | KiB |
| --- | ---: | ---: |
| Original `index.html` | **46,053** | **44.97** |
| Minified `index.min.html` | **45,152** | **44.09** |

The source is already compact. The minification retains readable WGSL string contents and does not rename JavaScript identifiers. No compression such as gzip is included in these sizes. Reproduce using `python3 scripts/minify-benchmark.py` with the development-only `rjsmin` and `rcssmin` packages installed. Running either HTML artifact requires none of those tools.

## Limitations and remaining acceptance work

- Visuals are a stylized, low-poly procedural environment. Buildings are exterior collision volumes, not enterable interiors. Some decorative objects and fences do not have collision.
- Moonlight casts shadows. Point lights and the flashlight do not cast their own shadow maps and can illuminate across intervening walls. The lighting model approximates roughness and diffuse/specular response rather than implementing a complete physically based material system.
- Fog is analytic distance/height haze, not volumetric ray marching. Water has animated surface variation and specular response, not planar reflections. There is no particle system, audio, temporal antialiasing, LOD, or occlusion culling.
- The scene has no survival progression, inventory, multiplayer, or persistence; this is an exploration/rendering benchmark.
- Native shader validation and geometry/physics tests passed. Full functional acceptance remains pending in a desktop browser that permits WebGPU and pointer lock. Run at 1920 × 1080 on the target GPU, traverse the roads and ridge, toggle F/V/M/P, resize and change quality, test Escape/resume, and record at least 60 seconds of steady-state telemetry before claiming the 60 FPS target or stable pacing.

## Reproducing the native checks

`node scripts/benchmark-check.cjs` extracts renderer input into the system temporary directory under `blackout-benchmark` and runs the geometry/physics assertions. For optional native rendering, install development-only `wgpu` and `Pillow`, then run `python3 scripts/benchmark-gpu.py`. The script uses a locally available SwiftShader Vulkan ICD when present and saves diagnostic render images in that temporary directory. These files are test outputs and are never loaded by the HTML.
