# Team TPG

Geographic tools for GeoGuessr team coordination.

**Live site:** https://team-tpg.odder.dev

## Deployment

The site is hosted on GitHub Pages and deploys automatically when you push to `main`.

```bash
# Commit your changes
git add -A
git commit -m "Your commit message"

# Deploy
git push origin main
```

The site will be live within a few minutes at https://team-tpg.odder.dev

## Building WASM Module

If you modify the Rust code in `wasm-geo/`, rebuild the WASM module:

```bash
./build-wasm.sh
```

Requirements:
- Rust with `wasm32-unknown-unknown` target
- `wasm-bindgen-cli`

The script will install missing dependencies automatically.