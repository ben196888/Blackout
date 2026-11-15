# BLACKOUT — WebGPU graphics benchmark report

A first-person, explorable rural village at night during a power outage, rendered with native WebGPU from a single self-contained `index.html`. Everything — geometry, materials, sky, lighting — is generated in code from a fixed seed.

## How to run

Open `index.html` in desktop Chrome/Edge with WebGPU (any recent version). No server, build step or network is needed; the file makes zero requests. Click to capture the mouse.

| Key | Action |
|---|---|
| W A S D / mouse | move / look (pointer lock) |
| Shift / Space | sprint / jump |
| F | flashlight |
| C | free camera (Q/E down/up, wheel changes speed; the flashlight stays with the player so the beam can be inspected) |
| P | performance overlay |
| H | hide help |
| [ ] | render scale 50–100 % |

URL options: `?seed=N` (different world), `?msaa=1` (disable 4× MSAA), `?perf` (overlay on at start).

## Deliverables and size

| File | Bytes |
|---|---|
| `index.html` (original, readable, runs as-is) | 137,953 |
| `index.min.html` (terser + WGSL whitespace strip) | 95,050 |
| `index.min.html` gzipped | 34,895 |

`screenshots/` holds six captures of the real renderer, for reference only.

## What is in the scene

- **Village**: 14 distinct buildings — brick general store (awning, boarded shop windows, sign), two-storey brick farmhouse with porch, hip-roof cottage, school, clapboard house, church with steeple and walled graveyard, gas station (kiosk, canopy, pumps, sign), corrugated garage, four more houses, a stone cottage, and a gambrel barn with silo. Each has windows (some boarded, broken or shuttered), doors, foundations and its own wall/roof materials.
- **Roads and paths**: main road, north and south streets, a loop road, and dirt paths to the tower, barn, shelter and church. Terrain is flattened under them; asphalt carries worn lane paint.
- **Damaged bridge**: the centre span has collapsed into the river, with exposed rebar, piers, debris, barricades with amber flashers and a "BRIDGE OUT" sign. The east road is separately blocked by a rockslide, a fallen tree and abandoned cars with dying hazard lights.
- **Communication tower**: 46 m red/white lattice mast on the hill with dishes, panel antennas, a blinking beacon, equipment hut and fenced compound.
- **Emergency shelter**: two red-cross tents with cots, generator-fed floodlights, a barrel fire with embers, a supply container, crates and signage.
- **Surroundings**: rolling terrain, a river valley, about 6,800 trees (conifers, broadleaf, dead trees), about 44,000 grass tufts, bushes, boulders, and a ring of mountains out to 1.6 km.
- **Abandonment details**: dead power lines with a toppled pole, abandoned cars, fences with missing sections, a well, bus stop, playground swing, laundry line, hay bales, street clutter.

## Rendering

- **Pipeline**: forward renderer into an `rgba16float` HDR target with 4× MSAA and reversed-Z `depth32float`; then bloom (quarter-res bright pass + separable blur), ACES tonemap, vignette, film grain.
- **Moonlight**: directional light with a 4096² shadow map, 3×3 PCF. The world is static, so the shadow map is rendered once at start-up and costs nothing per frame.
- **Local lights**: 16 point lights with inverse-square falloff and a smooth range window — floodlights, fire, beacon, flashers, hazard lights, candles, glow sticks — each with its own flicker pattern, matching emissive geometry and an additive halo.
- **Flashlight**: spot light with hot spot, corona, spill and reflector rings, inverse-square falloff, a single-scatter haze term, and CPU ray-marched eye adaptation (exposure drops when the beam lands on something close).
- **Atmosphere**: analytic height fog (thicker in the river valley, thinner on peaks) that shares its colour function with the sky, so distant terrain fades into the horizon; procedural sky with stars, moon disc and halo, and two drifting cloud layers with moonlit edges.
- **Materials**: 18 procedural materials evaluated in the fragment shader from world position — terrain (grass/dirt/rock/mud), plaster, brick, wood siding and planks, roof tiles, corrugated rusting metal, wet asphalt with puddle reflections, concrete, glass, foliage, bark, grass blades, water, emissive, painted metal, canvas, field stone, hazard stripes.
- **Particles**: 1,400 dust motes lit by the flashlight and nearby lights, plus fire embers; positions are computed in the vertex shader, so there is no CPU cost.
- **Wind**: foliage and grass sway in the vertex shader.

## Engine notes

- One vertex buffer (20 bytes per vertex) and one index buffer hold the whole world: 904,909 triangles, 1,192,318 vertices, split into 324 spatial chunks that are frustum-culled on the CPU. Grass chunks are also distance-culled and fade out.
- Player physics: gravity, jump, sprint, step-up onto low platforms, sliding collision against oriented boxes and cylinders through a spatial hash. Buildings, fences, vehicles, trees, the bridge rails and props all collide; the bridge decks are walkable and you can fall through the gap.
- The frame loop allocates no GPU resources; all buffers and textures are created at start-up or on resize.

## Measurements

**No hardware GPU was available where this was built**, so there is no measured frame rate for the target specification (1920×1080, mid-range desktop GPU). The only adapter here was SwiftShader, a CPU software rasteriser, driven through headless Chromium 153. Its frame times say nothing about a real GPU. The 60 FPS target is therefore **unverified**.

What was measured in that environment:

| Measurement | Result |
|---|---|
| JavaScript errors / WebGPU validation errors (original and minified, MSAA 1× and 4×, 160×90 to 1920×1080) | none |
| Network requests after the HTML loads | none |
| World generation time (4 vCPU container) | 0.5–1.1 s |
| CPU-side work per frame (physics, culling, uniforms, command encoding) | 0.2–0.4 ms |
| JS heap after forced GC, sampled over 200 frames while moving | 6.6–6.8 MB, flat |
| Draw calls per frame | 96–138 |
| Triangles submitted per frame after culling | 0.26–0.45 million |
| Software-rasterised frame at 1920×1080, 4× MSAA (not representative) | about 8.1 s |
| Scripted checks: walking, sprinting, jumping, blocked by store and church walls, falling through the bridge gap, flashlight toggle, free camera, overlay | all passed |

The in-page overlay (P) reports FPS, average and worst frame time, CPU time, draw calls, triangles, resolution and camera position, so real numbers can be read directly on target hardware.

## Limitations

- **Headless presentation**: in the test sandbox, presenting any WebGPU canvas lost the device (a bare clear did too). Testing therefore used `?offscreen`, which renders the identical frame to a texture and reads it back. The normal on-screen presentation path has not been exercised on a real display.
- **Frame rate on the target is unmeasured** (see above). If it falls short, `?msaa=1` and the render-scale keys are the cheapest levers; the fragment shader (procedural materials plus a 16-light loop) is the likely bottleneck.
- Buildings are closed shells with no interiors, apart from the tents, bus stop and gas canopy.
- Only the moon casts shadows; the flashlight and local lights do not.
- Moon shadows cover the 500 m area around the village; distant forest and mountains are unshadowed.
- The detailed terrain meets the distant ring with skirts rather than stitched level-of-detail, and far trees use a fixed lower-detail mesh.
- The collapsed span's collision is a staircase of boxes, so you can walk down it but not back up; the river banks are the way out.
