# Art direction brief — Gothic Nocturne

Technical frame

| Property            | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| Engine              | HTML5 canvas, plain JS, no build step                         |
| Native resolution   | 640×360 (16:9), integer-scaled, `image-rendering: pixelated`  |
| Tile size           | 32×32 px                                                     |
| Hero height         | ~64 px (2 tiles), anchor bottom-center                       |
| Transparency        | Chroma key: flat pure green `#00FF00` in generated sources    |
| Palette             | Quantized per family (≤48 colors sprites, ≤64 tiles/bg), no dither |
| Light direction     | Cold moonlight from upper-left, warm amber from candles      |

Shared STYLE block (prepended to every generation prompt)

> 32-bit era (mid-1990s console) 2D pixel art for a gothic horror
> side-scrolling action platformer. Crisp hard-edged pixel clusters, limited
> palette, flat shading with 2–3 tones per material, no anti-aliasing blur,
> no painterly or photoreal rendering, no 3D-render look. Palette: midnight
> indigo (#141a33) and deep violet shadows, desaturated steel-blue stone
> (#5b6b86 / #8a9ab5), bone ivory highlights (#e8e2c8), cold moonlight rim
> light from the upper-left, warm amber accents (#ffb347) only on flames and
> lit windows. Strict side view, orthographic, no perspective. No text, no
> labels, no watermark, no signature, no frame borders, no mockup UI.

Keyed-asset suffix (anything that is not a full-frame backdrop)

> The background must be one flat solid pure bright green (#00FF00) with no
> gradient, no vignette, no ground shadow, and nothing touching the image
> edges.

Provenance: all raw generations live in `art/raw/`, prompts in
`art/PROMPTS.md`, processing rules in `tools/asset_manifest.json`; outputs in
`assets/` are produced deterministically by `tools/process_assets.py`.
