import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mkcert from "vite-plugin-mkcert"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
