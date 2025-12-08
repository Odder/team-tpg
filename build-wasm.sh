#!/bin/bash

# Build script for WASM geo module
# Requires: cargo, wasm-bindgen-cli

set -e

cd "$(dirname "$0")/wasm-geo"

echo "Building WASM module..."

# Check for wasm32 target
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
    echo "Adding wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Build with cargo
echo "Compiling Rust to WASM..."
cargo build --release --target wasm32-unknown-unknown

# Check for wasm-bindgen
if ! command -v wasm-bindgen &> /dev/null; then
    echo "Installing wasm-bindgen-cli..."
    cargo install wasm-bindgen-cli --version 0.2.106
fi

# Generate JS bindings
echo "Generating JS bindings..."
mkdir -p pkg
wasm-bindgen target/wasm32-unknown-unknown/release/geo_wasm.wasm \
    --out-dir pkg \
    --target web

echo ""
echo "Build complete!"
echo "Output files:"
ls -la pkg/
echo ""
echo "The WASM module is ready to use."
