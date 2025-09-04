import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mkcert from "vite-plugin-mkcert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Read plugin version from framer.json to embed in the bundle.
let __PLUGIN_VERSION = '0.0.0'
try {
    const framerJsonPath = path.resolve(__dirname, 'framer.json')
    const framerJson = JSON.parse(fs.readFileSync(framerJsonPath, 'utf8'))
    __PLUGIN_VERSION = String(framerJson?.version ?? __PLUGIN_VERSION)
} catch {
    // ignore – fallback stays '0.0.0'
}

// Plugin to copy framer.json to dist
function copyFramerJson() {
    return {
        name: 'copy-framer-json',
        writeBundle() {
            const src = path.resolve(__dirname, 'framer.json')
            const dest = path.resolve(__dirname, 'dist/framer.json')
            fs.copyFileSync(src, dest)
        }
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    // Use relative base so built assets resolve correctly inside the plugin zip
    base: './',
    // Embed a build-time constant so the JS bundle changes across versions.
    define: {
        __FRAMER_PLUGIN_VERSION__: JSON.stringify(__PLUGIN_VERSION),
    },
    plugins: [mkcert(), react(), copyFramerJson()],
    server: {
        host: "localhost",
        port: 5173,
        strictPort: true,
        https: {
            key: fs.readFileSync(path.join(os.homedir(), ".vite-plugin-mkcert", "dev.pem")),
            cert: fs.readFileSync(path.join(os.homedir(), ".vite-plugin-mkcert", "cert.pem")),
            allowHTTP1: true,
        },
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            // Required for Chrome Private Network Access (public -> localhost)
            "Access-Control-Allow-Private-Network": "true",
        },
    },
    preview: {
        host: "localhost",
        port: 5173,
        strictPort: true,
        https: true,
    },
    build: {
        target: ["chrome89", "firefox89", "safari15", "edge89"],
    },
    esbuild: {
        target: ["chrome89", "firefox89", "safari15", "edge89"],
    },
    resolve: {
        alias: {
            // Force a single Three.js instance if ever used by this UI
            three: path.resolve(__dirname, "node_modules/three"),
        },
    },
    optimizeDeps: {
        // Dedupe Three.js to avoid multiple copies during dev
        dedupe: ["three"],
        esbuildOptions: {
            target: ["chrome89", "firefox89", "safari15", "edge89"],
        },
    },
})
