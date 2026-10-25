# AetherEye 3.0 — Interactive Orbital Intelligence

A cinematic 3D satellite-change inspection workspace built using **React 19 + TypeScript + Three.js / React Three Fiber**, upgraded with the strongest functions from two provided AetherEye v2 projects.

## Get started in VS Code

```bash
npm install
npm run dev
# http://localhost:4173
```

Validation: `npm test` (analysis and PDF tests), `npm run build` (TypeScript and Vite).

## Core functions

- Textured 3D Earth with orbit rings, subtle atmospheric glow, stable drag-to-rotate camera and depth-aware scene transitions.
- Interactive before/after imagery on physically separated 3D planes, togglable mask / heat maps and region pins.
- Responsive 2D swipe comparison when WebGL isn't available.
- Upload two PNG/JPEG/WebP images; entire RGB change-detection pipeline runs locally using Web Worker with main-thread fallback.
- Coarse-to-fine translation image alignment; optional exposure normalization; adaptive/Otsu threshold; morphological denoising; connected components; RGB land-cover transition heuristics.
- Inspect ranked regions, explain spectral proxies, filters, strengths and pixel-area metrics.
- Annotated PNG, JSON, CSV, multi-page PDF with image embedded.
- Calibrated surface area ONLY if metres-per-original-pixel (GSD) is supplied.
- High-contrast, reduced-motion-aware UI, bounded camera inputs, static-image fallback, and keyboard controls.

## Scientific disclaimer

The example pair is **synthetic illustrative imagery**. Detection labels are **hypotheses**, not verified disaster or causation findings; signal strength is a relative change score, not calibrated model confidence. The globe is a geographical navigation visualization and not a live satellite feed. Stylized depth used for 3D presentation is not actual digital elevation. Proper use requires georeferencing, co-registration, clouds and seasonality handling, field verification and multispectral or trained models.

## Prior work / attribution

This project integrates user-provided AetherEye v2 projects made with Claude and Grok, with substantial new React/TypeScript/R3F interface and camera architecture. The original classical analysis engine and dependency-free PDF writer have been preserved in `src/analysis` and `src/export`, respectively. The Earth texture and sample assets are illustrative. Disclose relevant code assistants and source contributions in submissions.

Vercel: Framework `Vite`, Build `npm run build`, Output `dist`. No API keys or Neon database required. Do not put secret keys in client-side source.
