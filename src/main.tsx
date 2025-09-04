import "framer-plugin/framer.css"

import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App.tsx"

// Reference the injected build version to ensure the JS bundle changes per release.
try {
    if (typeof __FRAMER_PLUGIN_VERSION__ !== 'undefined') {
        // Using console.debug keeps it out of user-facing noise and still affects bundle output.
        console.debug('[MojaveParticles] Build version', __FRAMER_PLUGIN_VERSION__)
    }
} catch {}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

ReactDOM.createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>
)
