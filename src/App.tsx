
import { framer, CanvasNode } from "framer-plugin"
import { Palette, Circle, DiamondsFour, Sparkle, Snowflake, LinkSimple, Rainbow, Planet, CirclesThree, Lightning, Heart, Fire, ArrowsLeftRight, StarFour } from "phosphor-react"
import { useState, useEffect, useRef } from "react"
import type { ReactNode } from "react"
import "./App.css"

// Debug logger: only logs in local development to avoid user console noise.
const __isLocal = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost'
function dlog(...args: any[]) {
  if (__isLocal) console.log(...args)
}

// Force boundary/out mode across all known aliases on a node's controls.
async function forceBoundaryAcrossAliases(framer: any, nodeId: string, mode: string) {
  try {
    const node = (await framer.getNode(nodeId)) as any
    const ctrls = (node?.controls ?? {}) as any
    const patch: any = {}

    // move bucket aliases
    if (typeof ctrls.move === 'object') {
      const outModes = { ...(ctrls.move?.outModes || {}), default: mode }
      patch.move = {
        ...ctrls.move,
        out: mode,
        boundary: mode,
        outMode: mode,
        outModes,
      }
    }

    // top-level aliases
    ;(patch as any).boundary = mode
    ;(patch as any).out = mode
    ;(patch as any).outMode = mode

    // optional legacy buckets
    if (typeof ctrls.physics === 'object') {
      patch.physics = { ...ctrls.physics, boundary: mode, mode }
    }
    if (typeof (ctrls as any).edges === 'object') {
      patch.edges = { ...(ctrls as any).edges, boundary: mode, mode }
    }
    if (typeof (ctrls as any).edge === 'object') {
      patch.edge = { ...(ctrls as any).edge, boundary: mode, mode }
    }

    if (Object.keys(patch).length) {
      const allowed = await framer.isAllowedTo('setAttributes')
      if (allowed) {
        await framer.setAttributes(nodeId, { controls: { ...ctrls, ...patch } })
      }
    }
  } catch (err) {
    console.warn('[forceBoundaryAcrossAliases] failed', err)
  }
}

 

// --- Shared module introspection (best-effort) ---
async function fetchModuleSource(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'omit', mode: 'cors' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (e) {
    console.warn('[Introspect] Failed to fetch module source:', e)
    return null
  }
}

function extractExportNames(src: string): string[] {
  const names = new Set<string>()
  // export default class/func … OR export default <Identifier>
  const reDefaultId = /export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
  let m: RegExpExecArray | null
  while ((m = reDefaultId.exec(src))) names.add('default')

  // export { X as default }
  const reAsDefault = /export\s*\{[^}]*?([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+default[^}]*?\}/g
  while ((m = reAsDefault.exec(src))) names.add('default')

  // Named exports: export function Name / export const Name / export class Name
  const reNamed = /export\s+(?:function|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g
  while ((m = reNamed.exec(src))) names.add(m[1])

  // Re-exports: export { A, B as C }
  const reBrace = /export\s*\{([^}]*)\}/g
  while ((m = reBrace.exec(src))) {
    const inner = m[1]
    inner.split(',').forEach(seg => {
      const n = seg.split(' as ')[0].trim()
      if (n) names.add(n)
    })
  }

  return Array.from(names)
}

function detectLocalOrMissingImports(src: string): { hasLocal: boolean; hasMissing: boolean; matches: string[] } {
  const matches = src.match(/(#framer\/local\/codeFile|!missing\/)\S*/g) || []
  return { hasLocal: matches.some(s => s.includes('#framer/local/codeFile')), hasMissing: matches.some(s => s.includes('!missing/')), matches }
}

// --- Property Controls schema introspection ---
// extractPropertyControlKeys was only used for diagnostics; remove to reduce bundle size

// Initialize UI at module level
framer.showUI({
    position: "top right",
    width: 320,
    height: 600,
    resizable: true,
    minWidth: 280,
    minHeight: 400,
})

// Always insert the shared component; never use local code files.

function useSelection() {
    const [selection, setSelection] = useState<CanvasNode[]>([])

    useEffect(() => {
        return framer.subscribeToSelection(setSelection)
    }, [])

    return selection
}

// Authentication verification function with optional first-use binding to Framer User ID
function verifyAccessJSONP(
    email: string,
    accessCode: string,
    { bind }: { bind?: boolean } = { bind: true }
): Promise<{ ok: boolean; valid?: boolean; bound?: boolean; project_name?: string; error?: string; reason?: string; action?: string }> {
    return new Promise(async (resolve) => {
        const cbName = `verifyCB_${Math.random().toString(36).slice(2)}`;

        // Resolve current Framer user id for binding/verification
        let framerUserId = "";
        try {
            const user = await framer.getCurrentUser();
            framerUserId = user?.id ?? "";
        } catch {
            framerUserId = "";
        }

        // Set up timeout to handle failed requests
        const timeout = setTimeout(() => {
            console.error("JSONP request timed out");
            delete (window as any)[cbName];
            if (script && script.parentNode) {
                script.remove();
            }
            resolve({ ok: false, error: "Request timed out. Please check your internet connection." });
        }, 15000); // 15 second timeout

        // Set up the callback function that Google Apps Script will call
        (window as any)[cbName] = (res: any) => {
            clearTimeout(timeout);
                if (__isLocal) {
                    dlog("JSONP response received:", res)
                    dlog("Response type:", typeof res)
                    dlog("Response keys:", Object.keys(res || {}))
                }

            // Normalize boolean-like strings coming from GAS
            try {
                if (res && typeof res.ok === "string") res.ok = res.ok === "true" || res.ok === "1";
                if (res && typeof res.valid === "string") res.valid = res.valid === "true" || res.valid === "1";
                if (res && typeof res.bound === "string") res.bound = res.bound === "true" || res.bound === "1";
            } catch {}

            // If there's an error about column headers, log it prominently
            if (res && res.error && res.error.includes('columns')) {
                console.error("🚨 SPREADSHEET COLUMN ERROR:", res.error);
                if (__isLocal) {
                    dlog("The Google Sheets spreadsheet needs columns named exactly: 'Client Email' and 'Access Code'")
                }
            }
            if (res && res.error && res.error.includes('Framer User ID')) {
                console.error("🚨 SPREADSHEET COLUMN MISSING: 'Framer User ID'");
                if (__isLocal) {
                    dlog("Add a 'Framer User ID' header at the end of Row 1, then redeploy your Apps Script web app:")
                    dlog("Endpoint:", "https://script.google.com/a/macros/mojavestud.io/s/AKfycbwWTayUzln5GbgKK1F04jmPeTt3XOULSja1_rWVbiLbYbdQa1xqQkFnV7kvqbqWtVia/exec")
                }
            }

            resolve(res);
            delete (window as any)[cbName];
            if (script && script.parentNode) {
                script.remove();
            }
        };

        // Updated endpoint with binding support (latest deployment)
        const base = "https://script.google.com/a/macros/mojavestud.io/s/AKfycbyZGWKLqUmZWBrBk-kUmndlLyvWzbDaz62O6OpsApKQ-lbWVjtZIED-aivmDQOht6Fs/exec";
        const params = new URLSearchParams({
            email,
            access_code: accessCode,
            callback: cbName,
        } as any);
        if (framerUserId) params.set("framer_user_id", framerUserId);
        if (bind) params.set("bind", "1");
        const url = `${base}?${params.toString()}`;

        if (__isLocal) dlog("Making JSONP authentication request to:", url)

        const script = document.createElement("script");
        script.onerror = () => {
            clearTimeout(timeout);
            console.error("JSONP script loading failed");
            console.error("This usually means the Google Apps Script is not published or accessible");
            console.error("Check that the script is published as a web app and accessible to 'Anyone'");
            console.error("Attempted URL:", url);
            console.error("Script element:", script);
            delete (window as any)[cbName];
            resolve({ ok: false, error: "Failed to connect to authentication service. The Google Apps Script may not be published or accessible." });
        };

        script.src = url;
        document.head.appendChild(script);
    });
}

export function App() {
    const selection = useSelection()
    const [canInsert, setCanInsert] = useState<boolean>(false)
    const [currentInstance, setCurrentInstance] = useState<CanvasNode | null>(null)
    
    // Authentication state
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)

    const [showLogin, setShowLogin] = useState<boolean>(false)
    const [email, setEmail] = useState<string>("")
    const [accessCode, setAccessCode] = useState<string>("")
    const [isVerifying, setIsVerifying] = useState<boolean>(false)
    const [verificationError, setVerificationError] = useState<string>("")
    const [projectName, setProjectName] = useState<string>("")
    
    const SESSION_LOCAL_KEY = "mojave:session"
    const SESSION_FORCE_FRESH_KEY = "mojave:requireFreshAuth"

    async function readUserScopedPluginData(key: string): Promise<string | null> {
        try {
            const user = await framer.getCurrentUser()
            const userId = user?.id ?? "unknown"
            const scopedKey = `${key}:${userId}`
            const val = await framer.getPluginData(scopedKey)
            return val ?? null
        } catch {
            return null
        }
    }

    async function writeUserScopedPluginData(key: string, value: string | null): Promise<void> {
        try {
            const allowed = await framer.isAllowedTo("setPluginData")
            if (!allowed) {
                console.warn("Permission denied: cannot set plugin data")
                return
            }
            const user = await framer.getCurrentUser()
            const userId = user?.id ?? "unknown"
            const scopedKey = `${key}:${userId}`
            await framer.setPluginData(scopedKey, value)
        } catch (error) {
            console.warn("Failed to write plugin data:", error)
        }
    }

    function getSessionFromLocal(): any | null {
        const raw = localStorage.getItem(SESSION_LOCAL_KEY)
        if (!raw) return null
        try { return JSON.parse(raw) } catch { return null }
    }

    function saveSessionLocal(session: any) {
        localStorage.setItem(SESSION_LOCAL_KEY, JSON.stringify(session))
    }

    function clearSessionLocal() {
        localStorage.removeItem(SESSION_LOCAL_KEY)
    }

    async function resetAuthMemory() {
        try { await writeUserScopedPluginData("session", "") } catch {}
        try {
            const allowed = await framer.isAllowedTo("setPluginData")
            if (allowed) {
                await framer.setPluginData("authentication", null)
            }
        } catch {}
        clearSessionLocal()
        localStorage.setItem(SESSION_FORCE_FRESH_KEY, "1")
        setIsAuthenticated(false)
        setShowLogin(true)
        framer.notify("Session reset. Please sign in again.", { variant: "info" })
    }

    async function checkSessionOnStart() {
        // 1) try local fast path
        // Respect a force-fresh flag (set after logout/tests)
        const forceFresh = localStorage.getItem(SESSION_FORCE_FRESH_KEY) === "1"
        let session: any | null = forceFresh ? null : getSessionFromLocal()

        // 2) try user-scoped plugin data
        if (!session) {
            const raw = await readUserScopedPluginData("session")
            if (raw) {
                try { session = JSON.parse(raw) } catch { session = null }
            }
        }

        // 3) fallback: legacy key (backward compatibility)
        if (!session) {
            const legacy = await framer.getPluginData("authentication")
            if (legacy) {
                try {
                    const obj = JSON.parse(legacy)
                    if (obj?.isAuthenticated) {
                        session = {
                            uid: "legacy",
                            email: obj.email,
                            projectName: obj.projectName,
                            exp: Date.now() + 1000 * 60 * 60 * 8,
                        }
                    }
                } catch {}
            }
        }

        // validate
        const now = Date.now()
        const valid = !!session && typeof session.exp === "number" && session.exp > now
        if (valid && !forceFresh) {
            setIsAuthenticated(true)
            if (session.email) setEmail(session.email)
            if (session.projectName) setProjectName(session.projectName)
            setShowLogin(false)
        } else {
            // No valid session → ensure state is clean and force UI to show login
            setIsAuthenticated(false)
            setShowLogin(true)
        }
    }

    async function persistSession(nextEmail: string, nextProjectName: string) {
        const user = await framer.getCurrentUser()
        const uid = user?.id ?? "unknown"
        const session = {
            uid,
            email: nextEmail,
            projectName: nextProjectName,
            exp: Date.now() + 1000 * 60 * 60 * 8,
        }
        saveSessionLocal(session)
        await writeUserScopedPluginData("session", JSON.stringify(session))
        // keep legacy key for compatibility
        try {
            const allowed = await framer.isAllowedTo("setPluginData")
            if (allowed) {
                await framer.setPluginData("authentication", JSON.stringify({ isAuthenticated: true, email: nextEmail, projectName: nextProjectName }))
            }
        } catch (error) {
            console.warn("Failed to set legacy authentication data:", error)
        }
    }

    useEffect(() => {
        (async () => {
            await checkSessionOnStart()
            // permissions
            try {
                const allowed = await framer.isAllowedTo("addComponentInstance")
                setCanInsert(allowed)
            } catch {
                setCanInsert(true)
            }
            // Auto-apply Lava Lamp preset on first load
            try { applyPreset("lavaLamp") } catch {}
        })()
    }, [])

    // Refs for uncontrolled inputs
    const emailRef = useRef<HTMLInputElement>(null)
    const accessCodeRef = useRef<HTMLInputElement>(null)
    
    // Comprehensive particle settings
    const [preset, setPreset] = useState("none")
    const [color, setColor] = useState("#ff6b35")
    const [colors, setColors] = useState<string[]>(["#ff6b35", "#ff8c42", "#ffa726", "#ff7043", "#ff5722", "#e64a19"])
    const [useMultipleColors, setUseMultipleColors] = useState(false)
    const [amount, setAmount] = useState(50)
    
    // Size settings
    const [sizeType, setSizeType] = useState("Range")
    const [sizeValue, setSizeValue] = useState(3)
    const [sizeMin, setSizeMin] = useState(1)
    const [sizeMax, setSizeMax] = useState(5)
    
    // Opacity settings
    const [opacityType, setOpacityType] = useState("Range")
    const [opacityValue, setOpacityValue] = useState(0.8)
    const [opacityMin, setOpacityMin] = useState(0.6)
    const [opacityMax, setOpacityMax] = useState(1)
    
    // Shape settings
    const [shapeType, setShapeType] = useState("circle")
    const [shapeText, setShapeText] = useState("●")
    const emojiPresets = ["●","★","✦","✧","✪","✩","✺","✹","✵","✷","✶","✳","✴","✻","☀","☾","☽","🌙","⭐","✨","💫","🌟"]
    
    // Movement settings
    const [moveEnable, setMoveEnable] = useState(true)
    const [direction, setDirection] = useState("top")
    const [speed, setSpeed] = useState(1)
    const [moveRandom, setMoveRandom] = useState(false)
    const [moveStraight, setMoveStraight] = useState(true)
    const [outMode, setOutMode] = useState("bounce")
    const [infinite, setInfinite] = useState(false)
    const [gravity, setGravity] = useState(false)
    const [gravityAcceleration, setGravityAcceleration] = useState(0.05)
    const [reverseGravity, setReverseGravity] = useState(false)
    
    // Effects
    const [twinkleEnable, setTwinkleEnable] = useState(true)
    const [twinkleSpeed, setTwinkleSpeed] = useState(0.8)
    const [twinkleMinOpacity, setTwinkleMinOpacity] = useState(0.3)
    const [twinkleMaxOpacity, setTwinkleMaxOpacity] = useState(1)
    
    const [glowEnable, setGlowEnable] = useState(true)
    const [glowIntensity, setGlowIntensity] = useState(0.6)
    const [glowSize, setGlowSize] = useState(3)
    
    const [borderEnable, setBorderEnable] = useState(false)
    const [borderColor, setBorderColor] = useState("#ffffff")
    const [borderWidth, setBorderWidth] = useState(2.5)
    
    // Hover interactions
    const [hoverEnable, setHoverEnable] = useState(false)
    const [hoverMode, setHoverMode] = useState("bubble")
    const [hoverForce, setHoverForce] = useState(100)
    
    // Connections
    const [connect, setConnect] = useState(0)
    const [connectRadius, setConnectRadius] = useState(0)
    const [connectLinks, setConnectLinks] = useState(0)
    const [connectColor, setConnectColor] = useState<string>("#ffffff")
    
    // Background
    const [backdrop, setBackdrop] = useState("#1a0f0f")
    const [backgroundOpacity, setBackgroundOpacity] = useState(1)
    
    // Canvas size
    const [canvasWidth, setCanvasWidth] = useState(800)
    const [canvasHeight, setCanvasHeight] = useState(600)
    
    // Additional state variables for presets
    const [fillEnable, setFillEnable] = useState(false)
    const [fillColor, setFillColor] = useState("#ff6b35")
    const [fillOpacity, setFillOpacity] = useState(0.5)
    const [borderOpacity, setBorderOpacity] = useState(1)
    const [connectEnable, setConnectEnable] = useState(false)
    const [connectDistance, setConnectDistance] = useState(100)
    const [connectOpacity, setConnectOpacity] = useState(1)
    const [hoverSmooth, setHoverSmooth] = useState(10)
    const [vibrateEnable, setVibrateEnable] = useState(false)
    const [vibrateFrequency, setVibrateFrequency] = useState(50)
    const [moveTrail, setMoveTrail] = useState(false)
    const [trailLength, setTrailLength] = useState(10)
    const [spinEnable, setSpinEnable] = useState(false)
    const [spinSpeed, setSpinSpeed] = useState(1)
    const [gravityEnable, setGravityEnable] = useState(false)
    const [growEnable, setGrowEnable] = useState(false)
    const [growSpeed, setGrowSpeed] = useState(1)
    const [growMin, setGrowMin] = useState(0.5)
    const [growMax, setGrowMax] = useState(2)

    // UI State
    const [activeSection, setActiveSection] = useState<string | null>("presets")



    // Helper functions for preset compatibility
    const setBoundaryBehavior = setOutMode
    const setTwinkleMin = setTwinkleMinOpacity
    const setTwinkleMax = setTwinkleMaxOpacity

    // Preset configurations
    const applyPreset = (presetName: string) => {
        // Reset transient features so they don't bleed between presets
        // Connections OFF by default; individual presets can turn them back on
        setConnectEnable(false)
        setConnect(0)
        setConnectRadius(0)
        setConnectLinks(0)
        setBorderEnable(false)
        switch (presetName) {
            case "emoji":
                setBackdrop("#0d0d0f")
                setBackgroundOpacity(1)
                // Use multiple emoji as text shapes by cycling during render via colors/shapeText not supported; set text shape default
                setColor("#ffffff")
                setColors(["#ffd166", "#f4a261", "#e9c46a", "#a8dadc", "#90e0ef"]) // tint shadows only
                setUseMultipleColors(false)
                setAmount(28)
                setSizeType("Range")
                setSizeValue(20)
                setSizeMin(14)
                setSizeMax(28)
                setOpacityType("Value")
                setOpacityValue(1)
                setShapeType("text")
                setShapeText("⭐✨🌟💫🌙☀☾🪐")
                setGlowEnable(true)
                setGlowIntensity(0.5)
                setGlowSize(3)
                setTwinkleEnable(true)
                setTwinkleSpeed(0.8)
                setTwinkleMin(0.6)
                setTwinkleMax(1)
                setMoveEnable(true)
                setDirection("none")
                setSpeed(1)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("bounce")
                setInfinite(true)
                // Disable hover in Emoji to avoid glyph jitter
                setHoverEnable(false)
                setHoverMode("bubble")
                setHoverForce(40)
                setHoverSmooth(10)
                break
            case "blackHole":
                setBackdrop("#000000")
                setBackgroundOpacity(1)
                setColor("#ffffff")
                setColors([])
                setAmount(50)
                setSizeType("Range")
                setSizeValue(3)
                setSizeMin(2)
                setSizeMax(4)
                setOpacityType("Range")
                setOpacityValue(0.7)
                setOpacityMin(0.5)
                setOpacityMax(1)
                setShapeType("circle")
                setGlowEnable(false)
                setTwinkleEnable(false)
                setMoveEnable(true)
                setDirection("none")
                setSpeed(1)
                setMoveRandom(false)
                setMoveStraight(false)
                setBoundaryBehavior("out")
                setInfinite(true)
                // Gentle suction toward cursor
                setHoverEnable(true)
                setHoverMode("attract")
                setHoverForce(35)
                setHoverSmooth(14)
                // Ensure no connection lines bleed in from other presets
                setConnect(0)
                setConnectRadius(0)
                break
            case "snow":
                setBackdrop("#0d1b2a")
                setBackgroundOpacity(1)
                setColor("#ffffff")
                setColors(["#ffffff", "#f8f9fa", "#e9ecef"])
                setAmount(100)
                setSizeType("Range")
                setSizeValue(4)
                setSizeMin(2)
                setSizeMax(8)
                setOpacityType("Range")
                setOpacityValue(0.8)
                setOpacityMin(0.6)
                setOpacityMax(1)
                setShapeType("circle")
                setGlowEnable(false)
                setTwinkleEnable(true)
                setTwinkleSpeed(0.2)
                setTwinkleMin(0.3)
                setTwinkleMax(0.8)
                setMoveEnable(true)
                setDirection("bottom")
                setSpeed(1)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("out")
                setVibrateEnable(false)
                setVibrateFrequency(8)
                setInfinite(true)
                setHoverEnable(false)
                break
            case "rainbow":
                // Twinkling multicolor stars (no trails/spin)
                setBackdrop("#000000")
                setBackgroundOpacity(1)
                setColor("#ffffff")
                setColors(["#ff6b6b", "#4ecdc4", "#45b7d1", "#feca57", "#a29bfe", "#39ff14", "#ff00ff"]) 
                setUseMultipleColors(true)
                setAmount(110)
                setSizeType("Range")
                setSizeValue(6)
                setSizeMin(4)
                setSizeMax(14)
                setOpacityType("Range")
                setOpacityMin(0.4)
                setOpacityMax(0.9)
                setShapeType("star")
                setGlowEnable(false)
                setTwinkleEnable(true)
                setTwinkleSpeed(2.2)
                setTwinkleMin(0.2)
                setTwinkleMax(1)
                setMoveEnable(true)
                setDirection("none")
                setSpeed(1)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("out")
                setMoveTrail(false)
                setSpinEnable(false)
                setInfinite(true)
                setHoverEnable(true)
                setHoverMode("bubble")
                setHoverForce(40)
                setHoverSmooth(10)
                break
            case "network":
                setBackdrop("#0a0a0a")
                setBackgroundOpacity(1)
                setColor("#4fc3f7")
                setColors(["#4fc3f7", "#29b6f6", "#03a9f4", "#039be5", "#0288d1"])
                // Connections must be white by default
                setConnectColor("#ffffff")
                setAmount(15)
                setSizeType("Range")
                setSizeValue(4)
                setSizeMin(2)
                setSizeMax(8)
                setOpacityType("Range")
                setOpacityValue(0.9)
                setOpacityMin(0.7)
                setOpacityMax(1)
                setShapeType("circle")
                setFillEnable(true)
                setFillColor("#4fc3f7")
                setFillOpacity(0.4)
                setBorderEnable(true)
                setBorderColor("#4fc3f7")
                setBorderWidth(1)
                setBorderOpacity(0.6)
                setGlowEnable(true)
                setGlowIntensity(0.4)
                setGlowSize(2)
                setTwinkleEnable(false)
                setMoveEnable(true)
                setDirection("none")
                setSpeed(1)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("bounce")
                setInfinite(false)
                setConnectEnable(true)
                setConnectDistance(200)
                setConnectOpacity(0.9)
                // Connections enabled only here; limit to 5 per particle
                setConnect(5)
                setConnectRadius(200)
                setConnectLinks(1)
                // Gentle attraction on hover
                setHoverEnable(true)
                setHoverMode("attract")
                setHoverForce(30)
                setHoverSmooth(16)
                break
            case "bubbles":
                setBackdrop("#001a33")
                setBackgroundOpacity(1)
                setColor("#66ccff")
                setColors(["#66ccff", "#99ddff", "#ccf0ff", "#ffffff"])
                setAmount(100)
                setSizeType("Range")
                setSizeValue(12)
                setSizeMin(8)
                setSizeMax(35)
                setOpacityType("Range")
                setOpacityValue(0.3)
                setOpacityMin(0.1)
                setOpacityMax(0.5)
                setShapeType("circle")
                setGlowEnable(false)
                setTwinkleEnable(true)
                setTwinkleSpeed(0.8)
                setTwinkleMin(0.1)
                setTwinkleMax(0.6)
                setMoveEnable(true)
                setDirection("top")
                setSpeed(1)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("out")
                setVibrateEnable(true)
                setVibrateFrequency(30)
                setInfinite(true)
                setHoverEnable(true)
                setHoverMode("bubble")
                setHoverForce(80)
                setHoverSmooth(20)
                break
            case "lazer":
                setBackdrop("#0a0a0a")
                setBackgroundOpacity(1)
                setColor("#ff0000")
                setColors(["#ff0000", "#ff4444", "#ff6666", "#ff8888", "#ffaaaa", "#ffcccc"])
                setAmount(20)
                setSizeType("Range")
                setSizeValue(25)
                setSizeMin(15)
                setSizeMax(60)
                setOpacityType("Range")
                setOpacityValue(0.7)
                setOpacityMin(0.2)
                setOpacityMax(0.9)
                setShapeType("circle")
                setFillEnable(true)
                setFillColor("#ff0000")
                setFillOpacity(0.3)
                setGlowEnable(true)
                setGlowIntensity(0.4)
                setGlowSize(2.5)
                setTwinkleEnable(true)
                setTwinkleSpeed(2)
                setTwinkleMin(0.3)
                setTwinkleMax(1)
                setMoveEnable(true)
                setDirection("random")
                setSpeed(2)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("bounce")
                setSpinEnable(true)
                setSpinSpeed(0.3)
                setVibrateEnable(true)
                setVibrateFrequency(20)
                setInfinite(true)
                setHoverEnable(true)
                setHoverMode("bubble")
                setHoverForce(60)
                setHoverSmooth(8)
                // No borders for lazer
                setBorderEnable(false)
                break
            case "galaxy":
                // Soft moving points with glow and flicker; no hover interaction
                setBackdrop("#0a0a1a")
                setBackgroundOpacity(1)
                setColor("#cfe2ff")
                setColors(["#ffffff", "#cfe2ff", "#bcd4f6", "#9fb7e5"])
                setUseMultipleColors(true)
                setAmount(90)
                setSizeType("Range")
                setSizeValue(2.5)
                setSizeMin(1.5)
                setSizeMax(4)
                setOpacityType("Range")
                setOpacityMin(0.4)
                setOpacityMax(1)
                setShapeType("circle")
                setGlowEnable(true)
                setGlowIntensity(0.35)
                setGlowSize(2.5)
                setTwinkleEnable(true)
                setTwinkleSpeed(0.9)
                setTwinkleMin(0.3)
                setTwinkleMax(1)
                setMoveEnable(true)
                setDirection("none")
                setSpeed(1)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("out")
                setMoveTrail(false)
                setSpinEnable(false)
                setInfinite(true)
                setHoverEnable(false)
                break
            case "neon":
                setBackdrop("#0a0a0a")
                setBackgroundOpacity(1)
                setColor("#ff00ff")
                // High-contrast neon palette
                setColors(["#ff00ff", "#00ffff", "#ffff00", "#ff0080", "#39ff14", "#00ffea"]) 
                setAmount(26)
                setSizeType("Range")
                setSizeValue(6)
                setSizeMin(4)
                setSizeMax(14)
                setOpacityType("Range")
                setOpacityMin(0.7)
                setOpacityMax(1)
                setShapeType("square")
                // Strong glow and rapid twinkle for flashing cubes
                setGlowEnable(true)
                setGlowIntensity(0.7)
                setGlowSize(3)
                setTwinkleEnable(true)
                setTwinkleSpeed(3)
                setTwinkleMin(0.3)
                setTwinkleMax(1)
                setMoveEnable(true)
                setDirection("none")
                setSpeed(2)
                setMoveRandom(true)
                setMoveStraight(false)
                setBoundaryBehavior("bounce")
                setVibrateEnable(true)
                setVibrateFrequency(100)
                setInfinite(true)
                setHoverEnable(true)
                setHoverMode("bubble")
                setHoverForce(120)
                setHoverSmooth(8)
                // Ensure connections off for Neon
                setConnect(0)
                setConnectRadius(0)
                break
            case "lavaLamp":
                setBackdrop("#1a0f0f")
                setBackgroundOpacity(1)
                setColor("#ff6b35")
                setColors(["#ff6b35", "#ff8c42", "#ffa726", "#ff7043", "#ff5722", "#e64a19"])
                setAmount(20)
                setSizeType("Range")
                setSizeValue(25)
                setSizeMin(12)
                setSizeMax(45)
                setOpacityType("Range")
                setOpacityValue(0.8)
                setOpacityMin(0.6)
                setOpacityMax(1)
                setShapeType("circle")
                setFillEnable(true)
                setFillColor("#ff6b35")
                setFillOpacity(0.5)
                setGlowEnable(true)
                setGlowIntensity(0.6)
                setGlowSize(3)
                setTwinkleEnable(true)
                setTwinkleSpeed(0.8)
                setTwinkleMin(0.3)
                setTwinkleMax(1)
                setMoveEnable(true)
                setDirection("top")
                setSpeed(1)
                setMoveRandom(false)
                setMoveStraight(true)
                setBoundaryBehavior("bounce")
                setGravityEnable(false)
                setGravityAcceleration(0.05)
                setInfinite(false)
                setGrowEnable(true)
                setGrowSpeed(0.5)
                setGrowMin(0.8)
                setGrowMax(1.5)
                // No borders for lava lamp blobs
                setBorderEnable(false)
                setHoverEnable(false)
                break
        }
        setPreset(presetName)

        // After changing controls, nudge the instance size by 1px to force
        // a resize event in the shared component so it re-seeds particles.
        // This is a safe workaround until the shared module ships reseed-on-controls-change.
        ;(async () => {
            try {
                if (!currentInstance) return
                const rect = await framer.getRect(currentInstance.id)
                const w = Math.round((rect as any)?.width ?? 0)
                const h = Math.round((rect as any)?.height ?? 0)
                if (w > 0 && h > 0) {
                    const canSet = await framer.isAllowedTo('setAttributes')
                    if (canSet) {
                        await framer.setAttributes(currentInstance.id, { width: (w + 1) as any } as any)
                        setTimeout(async () => {
                            try { await framer.setAttributes(currentInstance.id, { width: w as any } as any) } catch {}
                        }, 40)
                    }
                }
            } catch {}
        })()
    }

    // Handle authentication
    const handleLogin = async () => {
        const emailValue = emailRef.current?.value || ""
        const accessCodeValue = accessCodeRef.current?.value || ""
        
        if (!emailValue || !accessCodeValue) {
            setVerificationError("Please enter both email and access code")
            return
        }

        setIsVerifying(true)
        setVerificationError("")

        try {
            // Ensure no stale sessions can passively authenticate during verification
            try { await writeUserScopedPluginData("session", "") } catch {}
            clearSessionLocal()

            // Temporary bypass for development testing
            if (emailValue === "test@test.com" && accessCodeValue === "TEST-TEST-TEST-TEST-TEST") {
                setIsAuthenticated(true)
                setProjectName("Development Project")
                setShowLogin(false)
                await persistSession(emailValue, "Development Project")
                setEmail(emailValue)
                framer.notify("Welcome to Mojave Particles!", { variant: "success" })
                setIsVerifying(false)
                localStorage.removeItem(SESSION_FORCE_FRESH_KEY)
                return
            }

            // 1) Preflight to surface wrong_plugin without binding
            const precheck = await verifyAccessJSONP(emailValue, accessCodeValue, { bind: false })
            if (__isLocal) console.log('Verify payload (precheck):', JSON.stringify(precheck, null, 2))

            if (precheck && precheck.reason === "wrong_plugin") {
                setVerificationError("License found but plugin mismatch. Sheet says: not \"Particles\".")
                try { await writeUserScopedPluginData("session", "") } catch {}
                clearSessionLocal()
                setIsVerifying(false)
                return
            }

            // 2) Main verify with bind attempt (server auto-binds if needed)
            const resp = await verifyAccessJSONP(emailValue, accessCodeValue, { bind: true })
            if (__isLocal) console.log('Verify payload (bind):', JSON.stringify(resp, null, 2))

            // State machine handling per latest server contract
            if (!resp || resp.ok === false) {
                setVerificationError(`Server error: ${resp?.error ?? 'unknown'}`)
                try { await writeUserScopedPluginData("session", "") } catch {}
                clearSessionLocal()
                return
            }

            // Hard errors we should surface directly
            if (resp.reason === 'wrong_plugin') {
                setVerificationError('License found but plugin mismatch. Sheet says: not "Particles".')
                return
            }
            if (resp.reason === 'not_found') {
                setVerificationError('No license found for this email + code.')
                return
            }
            if (resp.reason === 'bound_to_other') {
                setVerificationError('This license is bound to a different Framer account.')
                return
            }
            if (resp.reason === 'bound_requires_user_id') {
                setVerificationError('Already bound; please sign into Framer so we can pass your user id and continue.')
                return
            }

            // Happy paths
            if (resp.valid && resp.bound) {
                setIsAuthenticated(true)
                setProjectName(resp.project_name || "")
                setShowLogin(false)
                await persistSession(emailValue, resp.project_name || "")
                setEmail(emailValue)
                framer.notify(`✅ ${resp.project_name || 'License'} is active (${resp.action || 'bound'}).`, { variant: "success" })
                localStorage.removeItem(SESSION_FORCE_FRESH_KEY)
                return
            }

            if (resp.valid && !resp.bound) {
                // Likely missing framer_user_id; ask user to sign in the Framer desktop app
                setVerificationError('We verified your license, but need your Framer user id to bind it. Please sign into Framer and try again.')
                try { await writeUserScopedPluginData("session", "") } catch {}
                clearSessionLocal()
                return
            }

            // Fallback
            setVerificationError('Unexpected response. Check logs.')
            try { await writeUserScopedPluginData("session", "") } catch {}
            clearSessionLocal()
        } catch (error) {
            console.error("Authentication error:", error)
            setVerificationError("Verification failed. Please check your internet connection and try again.")
        } finally {
            setIsVerifying(false)
        }
    }

    const handleLogout = async () => {
        setIsAuthenticated(false)
        setEmail("")
        setProjectName("")
        setAccessCode("")
        try { await writeUserScopedPluginData("session", "") } catch {}
        clearSessionLocal()
        // Force a fresh verification on next open
        localStorage.setItem(SESSION_FORCE_FRESH_KEY, "1")
        try {
            const allowed = await framer.isAllowedTo("setPluginData")
            if (allowed) {
                await framer.setPluginData("authentication", null)
            }
        } catch (error) {
            console.warn("Failed to clear legacy authentication data:", error)
        }
    }



    // Try multiple import specifiers for shared modules that export non-default names —
    // FORCE remote import by only using `importName` with a URL. Never attempt `name`.
    async function tryAddComponentInstance(url: string, attributes: any, candidates: string[]): Promise<CanvasNode | null> {
        const errors: any[] = []
        for (const candidate of candidates) {
            try {
                dlog(`[Insert] Trying specifier via importName (remote-only): ${candidate}`)
                const node = await framer.addComponentInstance({ url, name: candidate, attributes } as any)
                dlog(`[Insert] Success with importName specifier: ${candidate}`)
                return node as CanvasNode
            } catch (errImport) {
                errors.push({ type: 'importName', candidate, error: errImport })
                console.warn(`[Insert] Failed with importName='${candidate}':`, errImport)
            }
        }
        console.error("[Insert] All remote specifier attempts failed", errors)
        framer.notify("Could not resolve component export in shared module. See console for specifier attempts.", { variant: 'error' })
        return null
    }

    // Local Code File insertion removed; plugin only uses shared module.
// Removed local Code File insertion path to avoid referencing project-local files

    // Insert component as detached layers at an explicit layout position (x/y in px)
    async function tryAddDetachedLayers(url: string, layout: { x: number; y: number; width: number; height: number }, attributes: any): Promise<CanvasNode | null> {
        try {
            const allowed = await framer.isAllowedTo('addDetachedComponentLayers')
            if (!allowed) return null
        } catch { return null }
        try {
            const res: any = await (framer as any).addDetachedComponentLayers({ url, layout, attributes })
            // API returns an array of created nodes; pick the first top-level one
            const node = Array.isArray(res) ? res[0] : res
            return (node as CanvasNode) || null
        } catch (e) {
            console.warn('[Insert] addDetachedComponentLayers failed:', e)
            return null
        }
    }

    const handleInsertOrUpdate = async () => {
        // Compute a visible default line width and a stable connect color
        const __dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1
        const inferredConnectWidth = Math.max(1, Math.round(Math.min(2, __dpr))) // 1 on SDR, 2 on Retina
        const connectColorStable = connectColor || "#ffffff"
        const controls = {
            backdrop,
            backgroundOpacity,
            color: useMultipleColors ? colors[0] : color,
            colors: useMultipleColors ? colors : [],
            amount,
            size: sizeType === "Range" ? { type: sizeType, min: sizeMin, max: sizeMax } : { type: sizeType, value: sizeValue },
            opacity: opacityType === "Range" ? { type: opacityType, min: opacityMin, max: opacityMax } : { type: opacityType, value: opacityValue },
            shape: {
                type: shapeType,
                text:
                    typeof shapeText === "string"
                        ? shapeText
                        : Array.isArray(shapeText)
                        ? shapeText.join("")
                        : String(shapeText ?? ""),
            },
            move: { 
                enable: moveEnable, 
                speed, 
                direction, 
                random: moveRandom,
                straight: moveStraight,
                out: outMode,
                boundary: outMode,
                outMode: outMode,
                infinite,
                gravity,
                gravityAcceleration,
                reverseGravity
            },
            // Fallback for older builds expecting top-level boundary/outMode
            boundary: outMode,
            twinkle: {
                enable: twinkleEnable,
                speed: twinkleSpeed,
                minOpacity: twinkleMinOpacity,
                maxOpacity: twinkleMaxOpacity
            },
            glow: {
                enable: glowEnable,
                intensity: glowIntensity,
                size: glowSize
            },
            border: {
                enable: borderEnable,
                color: borderColor,
                width: borderWidth
            },
            hover: {
                enable: hoverEnable,
                mode: hoverMode,
                force: hoverForce,
                smooth: hoverSmooth
            },
            modes: {
                // Canonical keys the component expects
                connect: typeof connectEnable === "boolean" ? connectEnable : false,
                connectDistance:
                    typeof connectDistance === "number" && connectDistance > 0
                        ? connectDistance
                        : typeof connectRadius === "number"
                        ? connectRadius
                        : 120,
                connectOpacity:
                    typeof connectOpacity === "number" ? connectOpacity : 0.4,
                connectWidth: inferredConnectWidth,
                connectColor: connectColorStable,
            },
            // Legacy flat connection props for older builds of MojaveParticles
            connectEnable: (typeof connectEnable === "boolean" ? connectEnable : false),
            connectDistance: (
                typeof connectDistance === "number" && connectDistance > 0
                    ? connectDistance
                    : (typeof connectRadius === "number" ? connectRadius : 120)
            ),
            connectOpacity: (typeof connectOpacity === "number" ? connectOpacity : 0.4),
            connectWidth: inferredConnectWidth,
            // keep legacy names that some builds used
            connectLinks: !!connectLinks,
            connectRadius: (
                typeof connectRadius === "number" && connectRadius > 0
                    ? connectRadius
                    : (typeof connectDistance === "number" ? connectDistance : 120)
            ),
            // New props expected by MojaveParticles v1.2.0
            radius: 0,
            previewMotion: true
        }

        // Resolve target size: prefer current selection's rect, else fallback
        let desiredWidth = 800
        let desiredHeight = 600
        try {
            if (Array.isArray(selection) && selection.length > 0) {
                const container = selection[0]
                const containerRect = await framer.getRect(container.id as any)
                const cw = Math.round((containerRect as any)?.width ?? 0)
                const ch = Math.round((containerRect as any)?.height ?? 0)
                if (cw > 0 && ch > 0) {
                    desiredWidth = cw
                    desiredHeight = ch
                }
            }
        } catch {}

        // Use the EXACT pinned shared module URL for MojaveParticles (with @saveId).
        const COMPONENT_URL = "https://framer.com/m/MojaveParticles-7CfN.js@ll1Ex6R4Vj8rhaGyhOFv"
        // NOTE: Always import from remote URL; this plugin never references local code files.

        // Introspect the shared module to discover export names and potential local imports
        let candidateNames: string[] = ['MojaveParticles', 'default']
        try {
          const src = await fetchModuleSource(COMPONENT_URL)
          if (src) {
            const exportsFound = extractExportNames(src)
            if (exportsFound.length) {
              dlog('[Introspect] Exports discovered in module:', exportsFound)
              // Prioritize discovered names; keep fallbacks at the end
              const fallback = candidateNames.filter(n => !exportsFound.includes(n))
              candidateNames = [...exportsFound, ...fallback]
            } else {
              console.warn('[Introspect] No exports discovered in module source (minified or non-standard format).')
            }
            // --- Sanitize export names: Framer requires a valid import specifier
            // Keep only JavaScript identifiers or the literal 'default'.
            candidateNames = candidateNames.filter(
              (n) => n === 'default' || /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(n))
            )
            // De‑dupe while preserving order
            candidateNames = Array.from(new Set(candidateNames))
            const importIssues = detectLocalOrMissingImports(src)
            if (importIssues.hasLocal || importIssues.hasMissing) {
              console.warn('[Introspect] Module contains local or missing import specifiers. These will break shared usage:', importIssues.matches)
              const msg = 'MojaveParticles shared module references local or missing files (' + importIssues.matches.join(', ') + '). Re-publish the component from Framer so the shared module is self-contained (no #framer/local or !missing imports).'
              framer.notify(msg, { variant: 'error' })
              // Abort insertion entirely – this module cannot be instantiated reliably
              return
            }
          }
        } catch (e) {
          console.warn('[Introspect] Unexpected error:', e)
        }

        // --- Do NOT filter: remote builds rename/move controls; Framer ignores unknown keys anyway.
        const filteredControls = controls

        // Always insert new instance; editing should be done via Framer sidebar
        try {
            // Abort early if plugin environment appears unhealthy
            try {
              const alive = (framer as any)?.PluginHealth?.aliveSignal?.()
              if (alive === 2) {
                console.warn('[Health] Plugin in invalid state; aborting insert to avoid inconsistent behavior.')
                framer.notify('Plugin encountered an invalid state. Please reload the project or restart the plugin.', { variant: 'error' })
                return
              }
            } catch {}

            let instance: CanvasNode | null = null
            const insertAttrs = {
                width: desiredWidth,
                height: desiredHeight,
                // Prevent auto-sizing jitter on insert in some builds
                autoSize: false,
                constraints: { autoSize: "none" as const },
                // IMPORTANT: property control values must live under Node.controls
                controls: filteredControls,
            } as any

            // Ensure we always try the canonical export name first, then default
            if (!candidateNames.includes('MojaveParticles')) candidateNames.unshift('MojaveParticles')
            // Always include 'default' as a fallback, but de-duplicate
            if (!candidateNames.includes('default')) candidateNames.push('default')
            // Defensive: filter out any empty strings
            candidateNames = candidateNames.filter(Boolean)
            candidateNames = Array.from(new Set(candidateNames))

            // Desired layout coordinates (explicit x/y) to avoid editor breakpoint overlap
            const desiredLayout = { x: -900, y: 64, width: desiredWidth, height: desiredHeight }

            // 1) Try detached using remote shared module URL
            if (!instance) {
                instance = await tryAddDetachedLayers(COMPONENT_URL, desiredLayout, { controls: filteredControls })
            }

            // 2) Fallback to regular instance insertion if detached is unavailable
            if (!instance) {
                dlog("[Insert] Using remote module URL:", COMPONENT_URL)
                const specifierCandidates = candidateNames
                dlog('[Insert] Specifier candidates (ordered):', specifierCandidates)
                instance = await tryAddComponentInstance(COMPONENT_URL, insertAttrs, specifierCandidates)
            }

            if (!instance) throw new Error("Failed to create component instance")

            // If we used addDetachedComponentLayers, positioning is already applied via layout.
            // Otherwise, perform post-insert positioning as a fallback.
            try {
                const didDetached = false // doc reference only; we can't detect reliably here
                if (!didDetached) {
                    let parentIdForPosition: any = null
                    try {
                        const canSetParent = await framer.isAllowedTo('setParent')
                        const canvasRoot = await framer.getCanvasRoot()
                        if (canSetParent && canvasRoot?.id) {
                            await framer.setParent(instance.id, canvasRoot.id as any)
                            parentIdForPosition = canvasRoot.id
                        } else {
                            parentIdForPosition = Array.isArray(selection) && selection[0] ? selection[0].id : null
                        }
                    } catch { parentIdForPosition = Array.isArray(selection) && selection[0] ? selection[0].id : null }

                    const OFFSET_LEFT_PX = -900
                    const OFFSET_TOP = 64
                    const canSet = await framer.isAllowedTo('setAttributes')
                    if (canSet) {
                        let centerPercent: number | null = null
                        try {
                            const parentRect = parentIdForPosition ? await framer.getRect(parentIdForPosition) : null
                            const instRect = await framer.getRect(instance.id)
                            const pw = Math.max(1, Math.round((parentRect as any)?.width ?? 0))
                            const iw = Math.max(1, Math.round((instRect as any)?.width ?? desiredWidth))
                            centerPercent = (((OFFSET_LEFT_PX + iw / 2) - (pw / 2)) / pw) * 100
                        } catch {}

                        const applyPos = async () => {
                            try {
                                await framer.setAttributes(instance.id, {
                                    position: 'absolute' as const,
                                    centerX: (centerPercent != null ? (centerPercent as any) : (null as any)),
                                    left: (centerPercent == null ? (OFFSET_LEFT_PX as any) : (null as any)),
                                    top: OFFSET_TOP as any,
                                    right: null as any,
                                    bottom: null as any,
                                    centerY: null as any,
                                })
                            } catch {}
                        }
                        await applyPos()
                        setTimeout(applyPos, 50)
                        setTimeout(applyPos, 250)
                        setTimeout(applyPos, 800)
                    }
                }
            } catch (locErr) {
                console.warn('[Insert] Positioning/parenting failed:', locErr)
            }

            // Some versions of Framer may load the module asynchronously and apply defaults after insertion.
            // Ensure our intended values are applied by setting them once more after creation.
            try {
                const canSet = await framer.isAllowedTo('setAttributes')
                if (canSet) {
                  await framer.setAttributes(instance.id, { width: desiredWidth as any, height: desiredHeight as any, constraints: { autoSize: 'none' as const }, controls: filteredControls })
                  // Reseed kick: briefly bump amount by +1, then restore
                  try {
                    const kick = { ...filteredControls, amount: (amount || 0) + 1 }
                    await framer.setAttributes(instance.id, { controls: kick })
                    await new Promise(r => setTimeout(r, 30))
                    await framer.setAttributes(instance.id, { controls: filteredControls })
                  } catch {}
                } else {
                  console.warn('[Permissions] setAttributes not allowed; relying on initial insert attributes')
                }
            } catch (e2) {
                console.warn('setAttributes(width/height/controls) failed post-insert:', e2)
            }

            // --- Reconcile with the remote build’s actual control shape (ensures connections + emoji land) ---
            try {
              const nodeAfter = (await framer.getNode(instance.id)) as any

              // Ensure boundary mode sticks even if the module applies late defaults
              const boundaryMode =
                (controls?.move?.out) ||
                (controls?.move?.boundary) ||
                (controls?.move?.outMode) ||
                (controls as any)?.boundary ||
                'out'

              forceBoundaryAcrossAliases(framer, instance.id, boundaryMode)
              setTimeout(() => forceBoundaryAcrossAliases(framer, instance.id, boundaryMode), 60)
              setTimeout(() => forceBoundaryAcrossAliases(framer, instance.id, boundaryMode), 400)
              setTimeout(() => forceBoundaryAcrossAliases(framer, instance.id, boundaryMode), 1200)

              const currentCtrls = (nodeAfter?.controls ?? {}) as any
              const patch: any = {}

              // Resolve desired connection values from our UI state
              const wantConnectOn =
                typeof connectEnable === "boolean" ? connectEnable : !!connectLinks
              const wantDistance =
                typeof connectDistance === "number" && connectDistance > 0
                  ? connectDistance
                  : (typeof connectRadius === "number" ? connectRadius : 120)
              const wantOpacity = typeof connectOpacity === "number" ? connectOpacity : 0.4
              const __dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1
              const wantWidth = Math.max(1, Math.round(Math.min(2, __dpr)))
              const wantColor = connectColor || "#ffffff"

              // Modern 'modes' bucket
              if (typeof currentCtrls.modes === "object") {
                patch.modes = {
                  ...currentCtrls.modes,
                  connect: wantConnectOn,
                  connectDistance: wantDistance,
                  connectOpacity: wantOpacity,
                  connectWidth: wantWidth,
                  connectColor: wantColor,
                }
              }

              // Legacy flat keys
              const hasLegacy =
                "connectEnable" in currentCtrls ||
                "connectDistance" in currentCtrls ||
                "connectOpacity" in currentCtrls ||
                "connectWidth" in currentCtrls ||
                "connectRadius" in currentCtrls ||
                "connectLinks" in currentCtrls

              if (hasLegacy) {
                patch.connectEnable   = wantConnectOn
                patch.connectDistance = wantDistance
                patch.connectOpacity  = wantOpacity
                patch.connectWidth    = wantWidth
                patch.connectRadius   = wantDistance
                patch.connectLinks    = !!connectLinks
              }

              // Alternative 'links' bucket seen in some builds
              if (typeof currentCtrls.links === "object") {
                patch.links = {
                  ...currentCtrls.links,
                  enable: wantConnectOn,
                  distance: wantDistance,
                  opacity: wantOpacity,
                  width: wantWidth,
                  color: wantColor,
                }
              }

              // Ensure shape/emoji text lands for builds expecting glyphs on shape.text
              if (typeof currentCtrls.shape === "object") {
                const glyphText =
                  typeof shapeText === "string"
                    ? shapeText
                    : Array.isArray(shapeText)
                    ? shapeText.join("")
                    : String(shapeText ?? "")
                patch.shape = {
                  ...currentCtrls.shape,
                  type: shapeType,
                  text: glyphText,
                }
              }

              // Ensure boundary/out aliases are set for older/newer builds to avoid unintended bounce
              if (typeof currentCtrls.move === "object") {
                patch.move = {
                  ...currentCtrls.move,
                  out: outMode,
                  boundary: outMode,
                  outMode: outMode,
                }
              } else {
                // Some builds expect a top-level boundary
                patch.boundary = outMode
              }

              // Extra boundary aliases for other builds
              // If a top‑level 'out' or 'outMode' is honored, set them explicitly
              (patch as any).out = outMode
              ;(patch as any).outMode = outMode

              // If the remote exposes a physics bucket, align its boundary as well
              if (typeof currentCtrls.physics === "object") {
                patch.physics = {
                  ...currentCtrls.physics,
                  boundary: outMode,
                  mode: outMode,
                }
              }

              // Some builds use an 'edges' or 'edge' bucket
              if (typeof (currentCtrls as any).edges === "object") {
                patch.edges = {
                  ...(currentCtrls as any).edges,
                  mode: outMode,
                  boundary: outMode,
                }
              }
              if (typeof (currentCtrls as any).edge === "object") {
                patch.edge = {
                  ...(currentCtrls as any).edge,
                  mode: outMode,
                  boundary: outMode,
                }
              }

              // A few variants expect nested move.outModes.default
              if (typeof (currentCtrls as any).move === "object") {
                const existingMove = (currentCtrls as any).move
                const nextOutModes = {
                  ...(existingMove.outModes || {}),
                  default: outMode,
                }
                patch.move = {
                  ...patch.move,
                  outModes: nextOutModes,
                }
              }

              if (Object.keys(patch).length) {
                const canSet = await framer.isAllowedTo('setAttributes')
                if (canSet) {
                  await framer.setAttributes(instance.id, { controls: { ...currentCtrls, ...patch } })
                } else {
                  console.warn('[Permissions] Skipped setAttributes patch; permission denied')
                }
              }
            } catch (reconcileErr) {
              console.warn("[Reconcile] Failed to apply connection/emoji patch:", reconcileErr)
            }

            setCurrentInstance(instance)
            try {
                const node = await framer.getNode(instance.id)
                const rect = await framer.getRect(instance.id)
                const attrs: any = node as any
                if (window.location.hostname === "localhost") {
                    console.group("Mojave Particles — Insert Debug")
                    dlog("Outgoing controls:", filteredControls)
                    dlog("Node.controls after insert:", attrs?.controls)
                    try {
                        const desired = JSON.parse(JSON.stringify(filteredControls))
                        const actual = JSON.parse(JSON.stringify(attrs?.controls ?? {}))
                        const missing: string[] = []
                        const extra: string[] = []
                        const different: string[] = []
                        for (const k of Object.keys(desired)) {
                            if (!(k in actual)) missing.push(k)
                            else if (JSON.stringify(desired[k]) !== JSON.stringify(actual[k])) different.push(k)
                        }
                        for (const k of Object.keys(actual)) {
                            if (!(k in desired)) extra.push(k)
                        }
                        console.group('Controls schema diff (remote vs desired)')
                        dlog('Remote has EXTRA keys (ignored by plugin):', extra)
                        dlog('Desired keys MISSING on remote (stripped by Framer):', missing)
                        dlog('Keys present in both but different values after insert:', different)
                        console.groupEnd()
                    } catch (e) {
                        console.warn("Diff failed:", e)
                    }
                    console.groupEnd()
                    // --- Capability check: does this saved module support connection props? ---
                    try {
                        const supported = !!(
                            (attrs?.controls && (
                                (attrs.controls as any).modes && typeof (attrs.controls as any).modes === 'object' &&
                                ('connect' in (attrs.controls as any).modes || 'connectDistance' in (attrs.controls as any).modes)
                            )) ||
                            ('connectEnable' in (attrs?.controls || {})) ||
                            ('connectDistance' in (attrs?.controls || {})) ||
                            ('connectOpacity' in (attrs?.controls || {})) ||
                            ('connectWidth' in (attrs?.controls || {})) ||
                            ('connectRadius' in (attrs?.controls || {}))
                        )

                        if (!supported) {
                            console.warn('[MojaveParticles] The pinned component version does not expose any connection-related controls. Lines will not render in this build.')
                            framer.notify('Heads up: this component version doesn\'t support Connections. Use a newer saved version that adds Connection controls.', { variant: 'warning' })
                        }
                    } catch (capErr) {
                        console.warn('Capability check failed:', capErr)
                    }
                    // Validate that connection props survived serialization
                    try {
                        const c = (attrs?.controls || {}) as any
                        const m = (c.modes || {}) as any
                        dlog("Resolved connection props → modes:", m, " legacy:", {
                            connectEnable: c.connectEnable,
                            connectDistance: c.connectDistance,
                            connectOpacity: c.connectOpacity,
                            connectWidth: c.connectWidth,
                            connectRadius: c.connectRadius,
                        })
                        if (!("modes" in c) && !("connectEnable" in c || "connectDistance" in c || "connectOpacity" in c || "connectWidth" in c || "connectRadius" in c)) {
                            console.warn("No connection props present on node. This module version likely does not declare them in Property Controls.")
                        }
                    } catch (e) {
                        console.warn("Connection props validation failed:", e)
                    }
                    dlog("Node sizing traits:", {
                        width: attrs?.width,
                        height: attrs?.height,
                        position: attrs?.position,
                        borderRadius: attrs?.borderRadius,
                    })
                    dlog("Rect:", rect)
                }
                try {
                  const n = await framer.getNode(instance.id) as any
                  if (n?.constraints?.autoSize && n.constraints.autoSize !== 'none') {
                    const canSet = await framer.isAllowedTo('setAttributes')
                    if (canSet) {
                      await framer.setAttributes(instance.id, { width: 800 as any, height: 600 as any, constraints: { autoSize: 'none' as const } })
                    } else {
                      console.warn('[Permissions] Skipped autosize correction; permission denied')
                    }
                  }
                } catch {}
                framer.notify(`Inserted (w:${Math.round((rect as any)?.width ?? 0)} h:${Math.round((rect as any)?.height ?? 0)})`, { variant: "success" })
            } catch (dbgErr) {
                console.warn("Post-insert debug failed:", dbgErr)
                framer.notify("Inserted Mojave Particles!", { variant: "success" })
            }
        } catch (e) {
            console.error("Failed to insert component:", e)
            framer.notify("Failed to insert particles. Check plugin permissions.", { variant: "error" })
        }
    }

    // ----- Color utilities -----
    function hexToRgb(hex: string): { r: number; g: number; b: number } {
        const cleaned = hex.replace('#', '')
        const bigint = parseInt(cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned, 16)
        const r = (bigint >> 16) & 255
        const g = (bigint >> 8) & 255
        const b = bigint & 255
        return { r, g, b }
    }

    function getLuminance(hex: string): number {
        const { r, g, b } = hexToRgb(hex)
        const srgb = [r, g, b].map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
        return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
    }

    function getAccessibleTextColor(hex: string): string {
        // Choose white for dark colors, black for light colors
        try {
            const L = getLuminance(hex)
            return L > 0.5 ? '#000' : '#fff'
        } catch {
            return '#fff'
        }
    }

    function shadeColor(hex: string, percent: number): string {
        const { r, g, b } = hexToRgb(hex)
        const t = percent < 0 ? 0 : 255
        const p = Math.abs(percent) / 100
        const R = Math.round((t - r) * p) + r
        const G = Math.round((t - g) * p) + g
        const B = Math.round((t - b) * p) + b
        return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
    }

    const SectionHeader = ({ title, isActive, onClick }: { title: ReactNode, isActive: boolean, onClick: () => void }) => (
        <div 
            onClick={onClick}
            style={{
                padding: "8px 12px",
                background: isActive ? "var(--framer-color-bg-secondary, #2a2a2a)" : "transparent",
                border: "1px solid var(--framer-color-divider, #333)",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                fontWeight: 500
            }}
        >
            {title}
            <span style={{ fontSize: 12 }}>{isActive ? "−" : "+"}</span>
        </div>
    )

    // Live Preview Component
    const LivePreview = () => {
        const canvasRef = useRef<HTMLCanvasElement>(null)
        const animationRef = useRef<number | null>(null)
        const lastTimeRef = useRef<number | null>(null)
        const particlesRef = useRef<any[]>([])
        const helpHideTimerRef = useRef<number | null>(null)
        const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false)
        const mouseRef = useRef<{ x: number; y: number; hovering: boolean }>({ x: -1, y: -1, hovering: false })
        
        const previewWidth = 280
        const previewHeight = 120
        // Preview uses the same proportional rule as the inserted component
        const INTRINSIC_W = 800
        const INTRINSIC_H = 600
        const sizeScale = Math.max(0.25, Math.min(1.25, Math.min(previewWidth / INTRINSIC_W, previewHeight / INTRINSIC_H)))
        const distScale = sizeScale
        
        useEffect(() => {
            const canvas = canvasRef.current
            if (!canvas) return

            const ctx = canvas.getContext("2d")
            if (!ctx) return

            // Grapheme-safe emoji segmentation so ZWJ/skin tones/flags don't split
            function toEmojiArray(input?: string) {
                if (!input) return []
                try {
                    // @ts-ignore
                    const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" })
                    // @ts-ignore
                    return Array.from(seg.segment(String(input))).map((s: any) => s.segment).filter(Boolean)
                } catch {
                    return [...String(input)]
                }
            }

            canvas.width = previewWidth
            canvas.height = previewHeight
            // Hover listeners for preview interactions
            const onMove = (e: MouseEvent) => {
                const rect = canvas.getBoundingClientRect()
                mouseRef.current.x = e.clientX - rect.left
                mouseRef.current.y = e.clientY - rect.top
                mouseRef.current.hovering = true
            }
            const onLeave = () => {
                mouseRef.current.hovering = false
            }
            canvas.addEventListener('mousemove', onMove)
            canvas.addEventListener('mouseleave', onLeave)

            // Create particles for preview
            function createPreviewParticles() {
                const particles = []
                const previewAmount = Math.min(amount, 20) // Limit for performance
                const cols = useMultipleColors && colors.length > 0 ? colors : [color]
                const emojiList = shapeType === "text" ? toEmojiArray(String(shapeText || "")) : []
                const fallbackEmoji = ["⭐","✨","🌟","💫","🌙","☀","☾","🪐"]

                function makeEmojiSprite(glyph: string, drawSize: number) {
                    const dpr = Math.max(1, window.devicePixelRatio || 1)
                    const fontSize = Math.max(4, Math.floor(drawSize * 2))
                    const pad = Math.ceil(fontSize * 0.4)
                    const cw = fontSize + pad * 2
                    const ch = fontSize + pad * 2
                    const off = document.createElement('canvas')
                    off.width = Math.ceil(cw * dpr)
                    off.height = Math.ceil(ch * dpr)
                    const octx = off.getContext('2d')!
                    octx.setTransform(dpr, 0, 0, dpr, 0, 0)
                    octx.clearRect(0, 0, cw, ch)
                    octx.textAlign = 'center'
                    octx.textBaseline = 'middle'
                    octx.font = `${fontSize}px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial`
                    octx.fillText(glyph, cw / 2, ch / 2)
                    return off
                }

                for (let i = 0; i < previewAmount; i++) {
                    const particleColor = cols[Math.floor(Math.random() * cols.length)]

                    // Calculate particle size
                    let particleSize
                    if (sizeType === "Range") {
                        particleSize = Math.random() * (sizeMax - sizeMin) + sizeMin
                    } else if (sizeType === "Small") {
                        particleSize = Math.random() * 3 + 1
                    } else if (sizeType === "Medium") {
                        particleSize = Math.random() * 6 + 3
                    } else if (sizeType === "Large") {
                        particleSize = Math.random() * 10 + 6
                    } else {
                        particleSize = sizeValue
                    }

                    // Scale like the inserted component (relative to intrinsic size)
                    particleSize = Math.max(1, particleSize * sizeScale)

                    let vx = 0, vy = 0
                    // Map speed units to ~0.20 px/frame at 60fps (≈12 px/s per unit)
                    const baseSpeed = speed * 0.20

                    if (moveEnable) {
                        switch (direction) {
                            case "top":
                                vy = -baseSpeed
                                break
                            case "bottom":
                                vy = baseSpeed
                                break
                            case "left":
                                vx = -baseSpeed
                                break
                            case "right":
                                vx = baseSpeed
                                break
                            case "random":
                                vx = (Math.random() - 0.5) * baseSpeed * 2
                                vy = (Math.random() - 0.5) * baseSpeed * 2
                                break
                            default:
                                // Low-variance velocity for smooth drift
                                vx = (Math.random() - 0.5) * baseSpeed * 0.8
                                vy = (Math.random() - 0.5) * baseSpeed * 0.8
                                break
                        }
                    }

                    // For emoji preset, deterministically pick emoji per particle, fallback if none
                    const pickedEmoji = emojiList.length ? emojiList[i % emojiList.length] : fallbackEmoji[Math.floor(Math.random() * fallbackEmoji.length)]
                    const sprite = (shapeType === 'text') ? makeEmojiSprite(pickedEmoji, particleSize) : undefined
                    particles.push({
                        x: Math.random() * previewWidth,
                        y: Math.random() * previewHeight,
                        vx,
                        vy,
                        color: particleColor,
                        size: particleSize,
                        opacity: opacityType === "Range" ? 
                            Math.random() * (opacityMax - opacityMin) + opacityMin : 
                            opacityValue,
                        twinklePhase: Math.random() * Math.PI * 2,
                        originalSize: particleSize,
                        emoji: pickedEmoji,
                        sprite
                    })
                }
                particlesRef.current = particles
            }

            function animate() {
                if (!ctx) return
                ctx.clearRect(0, 0, previewWidth, previewHeight)
                const now = performance.now()
                const dt = lastTimeRef.current == null ? 16.666 : (now - lastTimeRef.current)
                lastTimeRef.current = now
                // Normalize to 60fps steps, clamp to avoid huge jumps if tab was inactive
                const step = Math.max(0.5, Math.min(2.5, dt / 16.666))

                // Set clipping region to ensure nothing draws outside canvas bounds
                ctx.save()
                ctx.beginPath()
                ctx.rect(0, 0, previewWidth, previewHeight)
                ctx.clip()
                // Favor smooth scaling quality
                try { (ctx as any).imageSmoothingEnabled = true; (ctx as any).imageSmoothingQuality = 'high' } catch {}

                // Draw background
                if (backdrop && backgroundOpacity > 0) {
                    ctx.save()
                    ctx.globalAlpha = backgroundOpacity
                    ctx.fillStyle = backdrop
                    ctx.fillRect(0, 0, previewWidth, previewHeight)
                    ctx.restore()
                }

                const particles = particlesRef.current

                // Draw network connections behind particles with per-particle cap
                const __connectOn = (typeof connectEnable === 'boolean' ? connectEnable : !!connectLinks)
                const __connectDist = (typeof connectDistance === 'number' && connectDistance > 0) ? connectDistance : (typeof connectRadius === 'number' ? connectRadius : 0)
                const __connectAlpha = (typeof connectOpacity === 'number' ? connectOpacity : 0.4)
                const __connectDistScaled = __connectDist * distScale
                if (__connectOn && __connectDist > 0) {
                    const maxLinks = Math.max(0, Math.min(10, connect))
                    for (let i = 0; i < particles.length; i++) {
                        const a = particles[i]
                        let linksDrawn = 0
                        for (let j = i + 1; j < particles.length; j++) {
                            if (linksDrawn >= maxLinks) break
                            const b = particles[j]
                            const dx = a.x - b.x
                            const dy = a.y - b.y
                            const dist = Math.hypot(dx, dy)
                            if (dist <= __connectDistScaled) {
                                const alpha = Math.max(0, Math.min(1, __connectAlpha * (1 - dist / __connectDistScaled)))
                                ctx.save()
                                ctx.globalAlpha = alpha
                                ctx.strokeStyle = connectColor || '#ffffff'
                                ctx.lineWidth = 1
                                ctx.beginPath()
                                ctx.moveTo(a.x, a.y)
                                ctx.lineTo(b.x, b.y)
                                ctx.stroke()
                                ctx.restore()
                                linksDrawn++
                            }
                        }
                    }
                }

                // Draw particles
                particles.forEach((particle) => {
                    // Update position
                    if (moveEnable) {
                        particle.x += particle.vx * step
                        particle.y += particle.vy * step
                        // Edge behavior respects selected boundary mode
                        if (outMode === 'bounce') {
                            const damping = 0.98
                            if (particle.x - particle.size < 0 || particle.x + particle.size > previewWidth) {
                                particle.vx = -particle.vx * damping
                                particle.x = Math.max(particle.size, Math.min(previewWidth - particle.size, particle.x))
                            }
                            if (particle.y - particle.size < 0 || particle.y + particle.size > previewHeight) {
                                particle.vy = -particle.vy * damping
                                particle.y = Math.max(particle.size, Math.min(previewHeight - particle.size, particle.y))
                            }
                        } else {
                            // outMode === 'out' (or anything else): let particles leave and respawn along the opposite edge
                            const offX = particle.x < -particle.size || particle.x > previewWidth + particle.size
                            const offY = particle.y < -particle.size || particle.y > previewHeight + particle.size
                            if (offX || offY) {
                                // Re-seed based on flow direction
                                switch (direction) {
                                    case 'bottom':
                                        // fell past bottom → respawn above top
                                        particle.x = Math.random() * previewWidth
                                        particle.y = -particle.size
                                        break
                                    case 'top':
                                        particle.x = Math.random() * previewWidth
                                        particle.y = previewHeight + particle.size
                                        break
                                    case 'left':
                                        particle.x = previewWidth + particle.size
                                        particle.y = Math.random() * previewHeight
                                        break
                                    case 'right':
                                        particle.x = -particle.size
                                        particle.y = Math.random() * previewHeight
                                        break
                                    default:
                                        // Neutral/none/random → prefer top respawn to evoke snowfall
                                        particle.x = Math.random() * previewWidth
                                        particle.y = -particle.size
                                        break
                                }
                            }
                        }
                    }
                    
                    // Skip drawing particles that are outside the visible canvas area
                    if (particle.x < -particle.size || particle.x > previewWidth + particle.size ||
                        particle.y < -particle.size || particle.y > previewHeight + particle.size) {
                        return
                    }
                    
                    // Calculate opacity with twinkle
                    let currentOpacity = particle.opacity
                    if (twinkleEnable) {
                        particle.twinklePhase += twinkleSpeed * 0.02 * step
                        const m = (Math.sin(particle.twinklePhase) + 1) / 2
                        currentOpacity = (twinkleMinOpacity ?? 0.3) + ((twinkleMaxOpacity ?? 1) - (twinkleMinOpacity ?? 0.3)) * m
                    }
                    
                    ctx.save()
                    
                    // Add glow effect if enabled
                    if (glowEnable) {
                        ctx.shadowBlur = glowSize * particle.size * 0.5
                        ctx.shadowColor = particle.color
                        ctx.globalAlpha = glowIntensity * 0.5
                    }
                    
                    // Hover interactions in preview: bubble, attract, repulse
                    let renderSize = particle.size
                    if (hoverEnable && mouseRef.current.hovering) {
                        const dx = mouseRef.current.x - particle.x
                        const dy = mouseRef.current.y - particle.y
                        const d = Math.hypot(dx, dy)
                        // Limit radius so not all particles are affected
                        const r = Math.max(10, Math.min(60, hoverForce || 100))
                        if (d < r) {
                            const t = (r - d) / r
                            // Emojis: avoid jittery size changes by weakening bubble scaling
                            if (hoverMode === 'bubble') {
                                const scale = 1 + t
                                renderSize = particle.size * scale
                            } else if (hoverMode === 'attract') {
                                // Pull toward cursor for a suction effect
                                const strength = (Math.min(hoverForce || 100, 60)) * 0.001 * t
                                particle.x += dx * strength
                                particle.y += dy * strength
                            } else if (hoverMode === 'repulse') {
                                // Push away from cursor
                                const strength = (Math.min(hoverForce || 100, 60)) * 0.001 * t
                                particle.x -= dx * strength
                                particle.y -= dy * strength
                            }
                        }
                    }

                    ctx.globalAlpha = currentOpacity
                    ctx.fillStyle = particle.color
                    
                    // Draw shape
                    ctx.beginPath()
                    switch (shapeType) {
                        case "circle":
                            ctx.arc(particle.x, particle.y, renderSize, 0, Math.PI * 2)
                            break
                        case "square":
                            ctx.rect(particle.x - renderSize, particle.y - renderSize, renderSize * 2, renderSize * 2)
                            break
                        case "triangle":
                            ctx.moveTo(particle.x, particle.y - renderSize)
                            ctx.lineTo(particle.x - renderSize, particle.y + renderSize)
                            ctx.lineTo(particle.x + renderSize, particle.y + renderSize)
                            ctx.closePath()
                            break
                        case "star":
                            const spikes = 5
                            const outerRadius = particle.size
                            const innerRadius = particle.size * 0.4
                            let rot = (Math.PI / 2) * 3
                            const step = Math.PI / spikes
                            ctx.moveTo(particle.x, particle.y - outerRadius)
                            for (let i = 0; i < spikes; i++) {
                                ctx.lineTo(particle.x + Math.cos(rot) * outerRadius, particle.y + Math.sin(rot) * outerRadius)
                                rot += step
                                ctx.lineTo(particle.x + Math.cos(rot) * innerRadius, particle.y + Math.sin(rot) * innerRadius)
                                rot += step
                            }
                            ctx.lineTo(particle.x, particle.y - outerRadius)
                            ctx.closePath()
                            break
                        case "text": {
                            const drawSize = renderSize * 2
                            if (!particle.sprite) {
                                const glyph = (shapeType === 'text') ? (particle.emoji || shapeText || "●") : (shapeText || "●")
                                particle.sprite = makeEmojiSprite(glyph, renderSize)
                            }
                            ctx.imageSmoothingEnabled = true
                            // Draw at subpixel positions for smooth motion
                            ctx.drawImage(particle.sprite, particle.x - drawSize / 2, particle.y - drawSize / 2, drawSize, drawSize)
                            ctx.restore()
                            return
                        }
                        default:
                            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
                            break
                    }
                    
                    if (shapeType !== "text") {
                        ctx.fill()
                    }
                    
                    // Add border if enabled
                    if (borderEnable && borderWidth > 0) {
                        ctx.strokeStyle = borderColor
                        ctx.lineWidth = borderWidth * 0.5
                        ctx.stroke()
                    }
                    
                    ctx.restore()
                })
                
                // Restore the main context (closes the clipping region)
                ctx.restore()
                
                animationRef.current = requestAnimationFrame(animate)
            }
            
            createPreviewParticles()
            animate()
            
            return () => {
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current)
                }
                lastTimeRef.current = null
            }
        }, [color, colors, useMultipleColors, amount, sizeType, sizeValue, sizeMin, sizeMax,
            opacityType, opacityValue, opacityMin, opacityMax, shapeType, shapeText,
            moveEnable, direction, speed, moveRandom, infinite, gravity, gravityAcceleration,
            twinkleEnable, twinkleSpeed, glowEnable, glowIntensity, glowSize,
            borderEnable, borderColor, borderWidth, backdrop, backgroundOpacity,
            connectEnable, connectDistance, connectOpacity, connectLinks, connectRadius, connectColor, outMode])

    return (
            <div style={{
                position: "fixed",
                top: "15px",
                left: "15px",
                right: "15px",
                zIndex: 10000,
                background: "var(--framer-color-bg, #1a1a1a)",
                border: "1px solid var(--framer-color-border, #333)",
                borderRadius: "8px",
                padding: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
            }}>
                <canvas
                    ref={canvasRef}
                    style={{
                        display: "block",
                        width: "100%",
                        height: "120px",
                        border: "1px solid var(--framer-color-border, #444)",
                        borderRadius: "4px",
                        background: backdrop || "#1a1a1a",
                        overflow: "hidden"
                    }}
                />

                {/* Help bubble overlay positioned so the corner of the preview aligns to the circle center */}
                <div 
                    className="help-bubble"
                    style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        transform: "translate(20%, -20%)",
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "var(--framer-color-tint, #0099ff)",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        pointerEvents: "auto",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                        zIndex: 10010
                    }}
                    title="Help Menu"
                    onMouseEnter={() => {
                        if (helpHideTimerRef.current) {
                            clearTimeout(helpHideTimerRef.current)
                            helpHideTimerRef.current = null
                        }
                        setIsHelpOpen(true)
                    }}
                    onMouseLeave={() => {
                        if (helpHideTimerRef.current) clearTimeout(helpHideTimerRef.current)
                        helpHideTimerRef.current = window.setTimeout(() => setIsHelpOpen(false), 250)
                    }}
                >
                    ?
                    <div
                        className="help-tooltip"
                        style={{
                            position: "absolute",
                            top: "30px",
                            right: "0",
                            background: "var(--framer-color-bg-secondary, #2a2a2a)",
                            padding: "8px 0",
                            borderRadius: "6px",
                            fontSize: "12px",
                            whiteSpace: "nowrap",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                            border: "1px solid var(--framer-color-border, #333)",
                            opacity: isHelpOpen ? 1 : 0,
                            visibility: isHelpOpen ? "visible" : "hidden",
                            transform: isHelpOpen ? "translateY(0)" : "translateY(-5px)",
                            transition: "opacity 0.15s ease, visibility 0.15s ease, transform 0.15s ease",
                            pointerEvents: isHelpOpen ? "auto" : "none",
                            zIndex: 10011,
                            minWidth: "120px"
                        }}
                        onMouseEnter={() => {
                            if (helpHideTimerRef.current) {
                                clearTimeout(helpHideTimerRef.current)
                                helpHideTimerRef.current = null
                            }
                            setIsHelpOpen(true)
                        }}
                        onMouseLeave={() => {
                            if (helpHideTimerRef.current) clearTimeout(helpHideTimerRef.current)
                            helpHideTimerRef.current = window.setTimeout(() => setIsHelpOpen(false), 250)
                        }}
                    >
                        <a 
                            href="https://mojavestud.io/portfolio/mojave-particles" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                                color: "var(--framer-color-tint, #0099ff)", 
                                textDecoration: "none",
                                display: "block",
                                padding: "6px 12px",
                                borderBottom: "1px solid var(--framer-color-border, #333)",
                                textAlign: "center"
                            }}
                        >
                            User Guide
                        </a>
                        <button
                            onClick={handleLogout}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--framer-color-text, #ffffff)",
                                cursor: "pointer",
                                padding: "6px 12px",
                                width: "100%",
                                textAlign: "center",
                                fontSize: "12px",
                                fontFamily: "inherit"
                            }}
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Welcome Screen Component
    const WelcomeScreen = () => (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "24px",
            textAlign: "center"
        }}>
            <div style={{
                background: "linear-gradient(135deg, #8b5cf6, #a855f7)",
                borderRadius: "50%",
                width: "80px",
                height: "80px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "32px",
                marginBottom: "24px",
                boxShadow: "0 8px 24px rgba(139, 92, 246, 0.3)"
            }}>
                <Planet size={36} color="#fff" />
            </div>
            
            <h1 style={{
                fontSize: "24px",
                fontWeight: "700",
                marginBottom: "8px",
                background: "linear-gradient(135deg, #8b5cf6, #a855f7)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
            }}>
                Welcome to Mojave Particles
            </h1>
            
            <p style={{
                fontSize: "14px",
                color: "var(--framer-color-text-secondary, #888)",
                marginBottom: "32px",
                lineHeight: "1.5",
                maxWidth: "280px"
            }}>
                Create stunning particle effects for your Framer projects with our premium particle system.
            </p>
            
            <button
                onClick={() => setShowLogin(true)}
                style={{
                    background: "linear-gradient(135deg, #8b5cf6, #a855f7)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    marginBottom: "16px",
                    width: "100%",
                    maxWidth: "200px"
                }}
            >
                Activate License
            </button>
            
            <a
                href="https://mojavestud.io/plugin-store"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: "inline-block",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid #8b5cf6",
                    color: "#8b5cf6",
                    background: "transparent",
                    textDecoration: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    width: "100%",
                    maxWidth: "200px",
                    textAlign: "center"
                }}
            >
                Purchase License
            </a>
        </div>
    )

    // Login Screen Component
    const LoginScreen = () => (
        <div style={{
            padding: "15px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            maxWidth: "360px",
            margin: "0 auto"
        }}>
            <div style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "15px"
            }}>
                <button
                    onClick={() => setShowLogin(false)}
                    style={{
                        background: "none",
                        border: "none",
                        color: "var(--framer-color-text, #fff)",
                        fontSize: "18px",
                        cursor: "pointer",
                        marginRight: "15px",
                        padding: "8px",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "32px",
                        height: "32px"
                    }}
                >
                    ←
                </button>
                <h2 style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    margin: 0,
                    color: "var(--framer-color-text, #fff)"
                }}>
                    Activate Your License
                </h2>
            </div>
            
            <div style={{ marginBottom: "15px" }}>
                <label style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "500",
                    marginBottom: "6px",
                    color: "var(--framer-color-text-secondary, #888)"
                }}>
                    Email Address
                </label>
                <input
                    ref={emailRef}
                    type="email"
                    defaultValue=""
                    placeholder="Enter your email address"
                    style={{
                        width: "100%",
                        padding: "12px 15px",
                        borderRadius: "8px",
                        border: "1px solid var(--framer-color-border, #333)",
                        background: "var(--framer-color-bg-tertiary, #2a2a2a)",
                        color: "var(--framer-color-text, #fff)",
                        fontSize: "14px",
                        boxSizing: "border-box",
                        outline: "none",
                        transition: "border-color 0.2s"
                    }}
                />
            </div>
            
            <div style={{ marginBottom: "15px" }}>
                <label style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "500",
                    marginBottom: "6px",
                    color: "var(--framer-color-text-secondary, #888)"
                }}>
                    Access Code
                </label>
                <input
                    ref={accessCodeRef}
                    type="text"
                    defaultValue=""
                    placeholder="MJVE-PLGN-XXXX-XXXX-XXXX"
                    onChange={(e) => {
                        e.target.value = e.target.value.toUpperCase()
                    }}
                    style={{
                        width: "100%",
                        padding: "12px 15px",
                        borderRadius: "8px",
                        border: "1px solid var(--framer-color-border, #333)",
                        background: "var(--framer-color-bg-tertiary, #2a2a2a)",
                        color: "var(--framer-color-text, #fff)",
                        fontSize: "14px",
                        fontFamily: "SF Mono, Monaco, monospace",
                        boxSizing: "border-box",
                        textTransform: "uppercase",
                        outline: "none",
                        transition: "border-color 0.2s",
                        letterSpacing: "0.5px"
                    }}
                />
            </div>
            
            {verificationError && (
                <div style={{
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    padding: "12px 15px",
                    fontSize: "12px",
                    color: "#ef4444",
                    marginBottom: "15px",
                    lineHeight: "1.4"
                }}>
                    {verificationError}
                </div>
            )}
            
            <button
                onClick={handleLogin}
                disabled={isVerifying}
                style={{
                    background: isVerifying ? "var(--framer-color-bg-secondary, #666)" : "linear-gradient(135deg, #8b5cf6, #a855f7)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    padding: "15px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: isVerifying ? "not-allowed" : "pointer",
                    opacity: isVerifying ? 0.5 : 1,
                    marginBottom: "15px",
                    transition: "all 0.2s",
                    outline: "none"
                }}
            >
                {isVerifying ? "Verifying..." : "Activate License"}
            </button>
            
            {/* Need help box */}
            <div style={{
                background: "var(--framer-color-bg-secondary, #2a2a2a)",
                borderRadius: "8px",
                padding: "15px",
                fontSize: "12px",
                color: "var(--framer-color-text-secondary, #888)",
                lineHeight: "1.4",
                border: "1px solid var(--framer-color-border, #333)",
                marginBottom: "10px"
            }}>
                <strong style={{ color: "var(--framer-color-text, #fff)" }}>Need help?</strong><br />
                Your access code was sent to your email after purchase. Check your spam folder if you can't find it.
            </div>

            {/* Lightweight purchase hyperlink under the help box */}
            <a
                href="https://mojavestud.io/plugin-store"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    color: "var(--framer-color-text-secondary, #8b5cf6)",
                    fontSize: "12px",
                    textDecoration: "underline",
                    alignSelf: "flex-start"
                }}
            >
                Purchase license
            </a>
        </div>
    )

    // Show welcome/login screens if not authenticated
    if (!isAuthenticated) {
        return (
            <main style={{ 
                background: "var(--framer-color-bg, #1a1a1a)", 
                color: "var(--framer-color-text, #ffffff)", 
                height: "100%",
                fontFamily: "var(--framer-font-family, system-ui)",
                fontSize: "14px",
                overflow: "hidden"
            }}>
                {showLogin ? <LoginScreen /> : <WelcomeScreen />}
            </main>
        )
    }

    return (
        <main style={{ 
            background: "var(--framer-color-bg, #1a1a1a)", 
            color: "var(--framer-color-text, #ffffff)", 
            padding: "15px", 
            height: "100%",
            fontFamily: "var(--framer-font-family, system-ui)",
            fontSize: "14px",
            overflow: "auto",
            position: "relative",
            overscrollBehavior: "contain"
        }}>
            {/* Top mask to ensure nothing is visible above the preview area */}
            <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: "15px",
                background: "var(--framer-color-bg, #1a1a1a)",
                zIndex: 10000,
                pointerEvents: "none"
            }} />
            {/* Removed old fixed help bubble; now rendered inside the preview container above */}

            {/* CSS for help tooltip hover effect */}
            <style dangerouslySetInnerHTML={{
                __html: `
                    .help-bubble:hover .help-tooltip,
                    .help-tooltip:hover {
                        opacity: 1 !important;
                        visibility: visible !important;
                        transform: translateY(0) !important;
                        pointer-events: auto !important;
                    }
                    .help-bubble:hover .help-tooltip button:hover,
                    .help-tooltip:hover button:hover {
                        background: var(--framer-color-bg, #1a1a1a) !important;
                    }
                    .help-bubble {
                        transition: none !important;
                    }
                    .help-tooltip {
                        transition: opacity 0.15s ease, visibility 0.15s ease, transform 0.15s ease !important;
                    }
                `
            }} />

            {/* Live Preview - Sticky at top (without text label) */}
            <LivePreview />
            
            {/* Presets */}
            {/* Spacer to offset the fixed preview height (preview + top margin) */}
            <div style={{ height: "150px" }} />

            <SectionHeader
                title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Sparkle size={16} /> Presets</span>} 
                isActive={activeSection === "presets"} 
                onClick={() => setActiveSection(activeSection === "presets" ? null : "presets")} 
            />
            
            {activeSection === "presets" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        {[ 
                            { key: "blackHole", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Planet size={14}/> Black Hole</span>), color: "#000000" },
                            { key: "snow", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Snowflake size={14}/> Snow</span>), color: "#e6f2ff" },
                            { key: "rainbow", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Rainbow size={14}/> Rainbow</span>), color: "#ff6b6b" },
                            { key: "network", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><LinkSimple size={14}/> Network</span>), color: "#4fc3f7" },
                            { key: "bubbles", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><CirclesThree size={14}/> Bubbles</span>), color: "#8bd6ff" },
                            { key: "lazer", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Lightning size={14}/> Lazer</span>), color: "#ff0000" },
                            { key: "galaxy", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Planet size={14}/> Galaxy</span>), color: "#7c3aed" },
                            { key: "neon", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Heart size={14}/> Neon</span>), color: "#ff00ff" },
                            { key: "emoji", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><StarFour size={14}/> Emoji</span>), color: "#ffd166" },
                            { key: "lavaLamp", name: (<span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}><Fire size={14}/> Lava Lamp</span>), color: "#ff6b35" }
                        ].map(({ key, name, color: presetColor }) => {
                            const light = shadeColor(presetColor, 12)
                            const dark = shadeColor(presetColor, -28)
                            const textColor = getAccessibleTextColor(dark)
                            const isActive = preset === key
                            return (
                                <button
                                    key={key}
                                    onClick={() => applyPreset(key)}
                                    style={{
                                        padding: "8px 6px",
                                        background: `linear-gradient(135deg, ${light}, ${dark})`,
                                        color: textColor,
                                        border: `1px solid ${isActive ? presetColor : "#333"}`,
                                        borderRadius: 6,
                                        fontSize: 11,
                                        fontWeight: isActive ? 700 : 500,
                                        cursor: "pointer",
                                        transition: "box-shadow 0.15s ease, transform 0.1s ease",
                                        boxShadow: isActive ? "0 0 0 2px var(--framer-color-tint) inset" : "none"
                                    }}
                                >
                                    {name}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Colors */}
            <SectionHeader 
                title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Palette size={16}/> Colors</span>} 
                isActive={activeSection === "colors"} 
                onClick={() => setActiveSection(activeSection === "colors" ? null : "colors")} 
            />
            
            {activeSection === "colors" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", fontSize: 12, marginBottom: 8 }}>
                            <input 
                                type="checkbox" 
                                checked={useMultipleColors} 
                                onChange={(e) => setUseMultipleColors(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Use Multiple Colors
                        </label>
                    </div>
                    
                    {!useMultipleColors ? (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Primary Color</label>
                            <input 
                                type="color" 
                                value={color} 
                                onChange={(e) => setColor(e.target.value)}
                                style={{ width: "100%", height: 32, border: "none", borderRadius: 4 }}
                            />
                        </div>
                    ) : (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Color Palette</label>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                                {colors.map((colorValue, index) => (
                                    <input 
                                        key={index}
                                        type="color" 
                                        value={colorValue} 
                                        onChange={(e) => {
                                            const newColors = [...colors]
                                            newColors[index] = e.target.value
                                            setColors(newColors)
                                        }}
                                        style={{ width: "100%", height: 28, border: "none", borderRadius: 4 }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Background</label>
                        <input 
                            type="color" 
                            value={backdrop} 
                            onChange={(e) => setBackdrop(e.target.value)}
                            style={{ width: "100%", height: 32, border: "none", borderRadius: 4 }}
                        />
                    </div>
                    
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Background Opacity: {backgroundOpacity}</label>
                        <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.1"
                            value={backgroundOpacity} 
                            onChange={(e) => setBackgroundOpacity(parseFloat(e.target.value))}
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>
            )}

            {/* Particles */}
            <SectionHeader 
                title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Circle size={16}/> Particles</span>} 
                isActive={activeSection === "particles"} 
                onClick={() => setActiveSection(activeSection === "particles" ? null : "particles")} 
            />
            
            {activeSection === "particles" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Amount: {amount}</label>
                        <input 
                            type="range" 
                            min="5" 
                            max="300" 
                            value={amount} 
                            onChange={(e) => setAmount(parseInt(e.target.value))}
                            style={{ width: "100%" }}
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Size Type</label>
                        <select 
                            value={sizeType} 
                            onChange={(e) => setSizeType(e.target.value)}
                            style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #333", background: "#2a2a2a", color: "#fff" }}
                        >
                            <option value="Range">Range</option>
                            <option value="Value">Fixed Value</option>
                            <option value="Small">Small</option>
                            <option value="Medium">Medium</option>
                            <option value="Large">Large</option>
                            <option value="ExtraLarge">Extra Large</option>
                        </select>
                    </div>

                    {sizeType === "Range" && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Min Size: {sizeMin}</label>
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="100" 
                                    value={sizeMin} 
                                    onChange={(e) => setSizeMin(parseInt(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Max Size: {sizeMax}</label>
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="200" 
                                    value={sizeMax} 
                                    onChange={(e) => setSizeMax(parseInt(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}

                    {sizeType === "Value" && (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Size: {sizeValue}</label>
                            <input 
                                type="range" 
                                min="1" 
                                max="100" 
                                value={sizeValue} 
                                onChange={(e) => setSizeValue(parseInt(e.target.value))}
                                style={{ width: "100%" }}
                            />
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Opacity Type</label>
                        <select 
                            value={opacityType} 
                            onChange={(e) => setOpacityType(e.target.value)}
                            style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #333", background: "#2a2a2a", color: "#fff" }}
                        >
                            <option value="Range">Range</option>
                            <option value="Value">Fixed Value</option>
                            <option value="Fade">Fade</option>
                            <option value="Normal">Normal</option>
                            <option value="Full">Full</option>
                        </select>
                    </div>

                    {opacityType === "Range" && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Min Opacity: {opacityMin}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1"
                                    value={opacityMin} 
                                    onChange={(e) => setOpacityMin(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Max Opacity: {opacityMax}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1"
                                    value={opacityMax} 
                                    onChange={(e) => setOpacityMax(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}

                    {opacityType === "Value" && (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Opacity: {opacityValue}</label>
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.1"
                                value={opacityValue} 
                                onChange={(e) => setOpacityValue(parseFloat(e.target.value))}
                                style={{ width: "100%" }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Shape */}
            <SectionHeader 
                title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><DiamondsFour size={16}/> Shape</span>} 
                isActive={activeSection === "shape"} 
                onClick={() => setActiveSection(activeSection === "shape" ? null : "shape")} 
            />
            
            {activeSection === "shape" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Shape Type</label>
                        <select 
                            value={shapeType} 
                            onChange={(e) => setShapeType(e.target.value)}
                            style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #333", background: "#2a2a2a", color: "#fff" }}
                        >
                            <option value="circle">Circle</option>
                            <option value="square">Square</option>
                            <option value="triangle">Triangle</option>
                            <option value="diamond">Diamond</option>
                            <option value="hexagon">Hexagon</option>
                            <option value="star">Star</option>
                            <option value="text">Text/Emoji</option>
                        </select>
                    </div>

                    {shapeType === "text" && (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Text/Emoji</label>
                            <input 
                                type="text" 
                                value={shapeText} 
                                onChange={(e) => setShapeText(e.target.value)}
                                placeholder="Enter text or emoji..."
                                style={{ 
                                    width: "100%", 
                                    padding: 8, 
                                    borderRadius: 4, 
                                    border: "1px solid #333", 
                                    background: "#2a2a2a", 
                                    color: "#fff",
                                    fontSize: 14
                                }}
                            />
                            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {emojiPresets.map((e) => (
                                    <button 
                                        key={e} 
                                        type="button"
                                        onClick={() => { setShapeType("text"); setShapeText(e); }}
                                        style={{ width: 28, height: 28, borderRadius: 6, background: "var(--framer-color-bg-tertiary)", border: "1px solid var(--framer-color-divider, #333)", color: "#fff", fontSize: 16, lineHeight: "26px" }}
                                    >{e}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Movement */}
            <SectionHeader
                title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><ArrowsLeftRight size={16}/> Movement</span>} 
                isActive={activeSection === "movement"} 
                onClick={() => setActiveSection(activeSection === "movement" ? null : "movement")} 
            />
            
            {activeSection === "movement" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                            <input 
                                type="checkbox" 
                                checked={moveEnable} 
                                onChange={(e) => setMoveEnable(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Enable Movement
                        </label>
                    </div>

                    {moveEnable && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Direction</label>
                                <select 
                                    value={direction} 
                                    onChange={(e) => setDirection(e.target.value)}
                                    style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #333", background: "#2a2a2a", color: "#fff" }}
                                >
                                    <option value="none">None</option>
                                    <option value="top">Up</option>
                                    <option value="bottom">Down</option>
                                    <option value="left">Left</option>
                                    <option value="right">Right</option>
                                    <option value="top-right">Top-Right</option>
                                    <option value="top-left">Top-Left</option>
                                    <option value="bottom-right">Bottom-Right</option>
                                    <option value="bottom-left">Bottom-Left</option>
                                    <option value="random">Random</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Speed: {speed}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    step="1" 
                                    value={speed} 
                                    onChange={(e) => setSpeed(parseInt(e.target.value, 10) || 0)}
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Out Mode</label>
                                <select 
                                    value={outMode} 
                                    onChange={(e) => setOutMode(e.target.value)}
                                    style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #333", background: "#2a2a2a", color: "#fff" }}
                                >
                                    <option value="bounce">Bounce</option>
                                    <option value="out">Out</option>
                                    <option value="destroy">Destroy</option>
                                    <option value="bounce-horizontal">Bounce Horizontal</option>
                                    <option value="bounce-vertical">Bounce Vertical</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                                    <input 
                                        type="checkbox" 
                                        checked={moveRandom} 
                                        onChange={(e) => setMoveRandom(e.target.checked)}
                                        style={{ marginRight: 8 }}
                                    />
                                    Random Movement
                                </label>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                                    <input 
                                        type="checkbox" 
                                        checked={moveStraight} 
                                        onChange={(e) => setMoveStraight(e.target.checked)}
                                        style={{ marginRight: 8 }}
                                    />
                                    Straight Movement
                                </label>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                                    <input 
                                        type="checkbox" 
                                        checked={infinite} 
                                        onChange={(e) => setInfinite(e.target.checked)}
                                        style={{ marginRight: 8 }}
                                    />
                                    Infinite Particles
                                </label>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                                    <input 
                                        type="checkbox" 
                                        checked={gravity} 
                                        onChange={(e) => setGravity(e.target.checked)}
                                        style={{ marginRight: 8 }}
                                    />
                                    Gravity
                                </label>
                            </div>

                            {gravity && (
                                <>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Gravity Force: {gravityAcceleration}</label>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="1" 
                                            step="0.01" 
                                            value={gravityAcceleration} 
                                            onChange={(e) => setGravityAcceleration(parseFloat(e.target.value))}
                                            style={{ width: "100%" }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: 12 }}>
                                        <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                                            <input 
                                                type="checkbox" 
                                                checked={reverseGravity} 
                                                onChange={(e) => setReverseGravity(e.target.checked)}
                                                style={{ marginRight: 8 }}
                                            />
                                            Reverse Gravity
                                        </label>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Effects */}
            <SectionHeader 
                title={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><StarFour size={16}/> Effects</span>} 
                isActive={activeSection === "effects"} 
                onClick={() => setActiveSection(activeSection === "effects" ? null : "effects")} 
            />
            
            {activeSection === "effects" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    {/* Twinkle */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                            <input 
                                type="checkbox" 
                                checked={twinkleEnable} 
                                onChange={(e) => setTwinkleEnable(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Twinkle Effect
                        </label>
                    </div>

                    {twinkleEnable && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Twinkle Speed: {twinkleSpeed}</label>
                                <input 
                                    type="range" 
                                    min="0.1" 
                                    max="5" 
                                    step="0.1" 
                                    value={twinkleSpeed} 
                                    onChange={(e) => setTwinkleSpeed(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Min Opacity: {twinkleMinOpacity}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={twinkleMinOpacity} 
                                    onChange={(e) => setTwinkleMinOpacity(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Max Opacity: {twinkleMaxOpacity}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={twinkleMaxOpacity} 
                                    onChange={(e) => setTwinkleMaxOpacity(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}

                    {/* Glow */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                            <input 
                                type="checkbox" 
                                checked={glowEnable} 
                                onChange={(e) => setGlowEnable(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Glow Effect
                        </label>
                    </div>

                    {glowEnable && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Glow Intensity: {glowIntensity}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={glowIntensity} 
                                    onChange={(e) => setGlowIntensity(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Glow Size: {glowSize}</label>
                                <input 
                                    type="range" 
                                    min="0.5" 
                                    max="5" 
                                    step="0.1" 
                                    value={glowSize} 
                                    onChange={(e) => setGlowSize(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}

                    {/* Border */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                            <input 
                                type="checkbox" 
                                checked={borderEnable} 
                                onChange={(e) => setBorderEnable(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Border
                        </label>
                    </div>

                    {borderEnable && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Border Color</label>
                                <input 
                                    type="color" 
                                    value={borderColor} 
                                    onChange={(e) => setBorderColor(e.target.value)}
                                    style={{ width: "100%", height: 32, border: "none", borderRadius: 4 }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Border Width: {borderWidth}</label>
                                <input 
                                    type="range" 
                                    min="0.1" 
                                    max="5" 
                                    step="0.1" 
                                    value={borderWidth} 
                                    onChange={(e) => setBorderWidth(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Interactions */}
            <SectionHeader 
                title="🖱️ Interactions" 
                isActive={activeSection === "interactions"} 
                onClick={() => setActiveSection(activeSection === "interactions" ? null : "interactions")} 
            />
            
            {activeSection === "interactions" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "flex", alignItems: "center", fontSize: 12 }}>
                            <input 
                                type="checkbox" 
                                checked={hoverEnable} 
                                onChange={(e) => setHoverEnable(e.target.checked)}
                                style={{ marginRight: 8 }}
                            />
                            Hover Effects
                        </label>
                    </div>

                    {hoverEnable && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Hover Mode</label>
                                <select 
                                    value={hoverMode} 
                                    onChange={(e) => setHoverMode(e.target.value)}
                                    style={{ width: "100%", padding: 6, borderRadius: 4, border: "1px solid #333", background: "#2a2a2a", color: "#fff" }}
                                >
                                    <option value="bubble">Bubble</option>
                                    <option value="grab">Grab</option>
                                    <option value="repulse">Repulse</option>
                                    <option value="attract">Attract</option>
                                    <option value="connect">Connect</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Force: {hoverForce}</label>
                                <input 
                                    type="range" 
                                    min="10" 
                                    max="500" 
                                    value={hoverForce} 
                                    onChange={(e) => setHoverForce(parseInt(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}

                    {/* Connections */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Connections: {connect}</label>
                        <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            value={connect} 
                            onChange={(e) => setConnect(parseInt(e.target.value))}
                            style={{ width: "100%" }}
                        />
                    </div>

                    {connect > 0 && (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Connection Radius: {connectRadius}</label>
                                <input 
                                    type="range" 
                                    min="50" 
                                    max="500" 
                                    value={connectRadius} 
                                    onChange={(e) => setConnectRadius(parseInt(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Connection Color</label>
                                <input
                                    type="color"
                                    value={connectColor}
                                    onChange={(e) => setConnectColor(e.target.value)}
                                    style={{ width: "100%", height: 32, border: "none", borderRadius: 4 }}
                                />
                            </div>

                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Connection Links: {connectLinks}</label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1"
                                    value={connectLinks} 
                                    onChange={(e) => setConnectLinks(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Canvas Size */}
            <SectionHeader 
                title="📐 Canvas Size" 
                isActive={activeSection === "canvas"} 
                onClick={() => setActiveSection(activeSection === "canvas" ? null : "canvas")} 
            />
            
            {activeSection === "canvas" && (
                <div style={{ marginBottom: 16, padding: "0 8px" }}>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Width: {canvasWidth}px</label>
                        <input 
                            type="range" 
                            min="200" 
                            max="1600" 
                            value={canvasWidth} 
                            onChange={(e) => setCanvasWidth(parseInt(e.target.value))}
                            style={{ width: "100%" }}
                        />
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <label style={{ display: "block", marginBottom: 6, fontSize: 12 }}>Height: {canvasHeight}px</label>
                        <input 
                            type="range" 
                            min="200" 
                            max="1200" 
                            value={canvasHeight} 
                            onChange={(e) => setCanvasHeight(parseInt(e.target.value))}
                            style={{ width: "100%" }}
                        />
                    </div>
                </div>
            )}

            <button 
                onClick={handleInsertOrUpdate} 
                disabled={!canInsert}
                style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "#6366f1",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: canInsert ? "pointer" : "not-allowed",
                    opacity: canInsert ? 1 : 0.5,
                    marginTop: 16
                }}
                title={!canInsert ? "Enable 'Add Component Instance' in plugin permissions" : undefined}
            >
                Insert Particles
            </button>
            

            {/* Copyright footer */}
            <div style={{
                marginTop: "15px",
                paddingTop: "15px",
                borderTop: "1px solid var(--framer-color-border, #333)",
                textAlign: "center"
            }}>
                <p style={{
                    fontSize: "11px",
                    color: "var(--framer-color-text-secondary, #888)",
                    margin: "0 0 8px 0"
                }}>
                    © Mojave Studio LLC | Custom Web Design Experts
                </p>
                <a 
                    href="https://mojavestud.io" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                        fontSize: "11px",
                        color: "var(--framer-color-tint, #0099ff)",
                        textDecoration: "none"
                    }}
                >
                    mojavestud.io
                </a>
            </div>
        </main>
    )
}

export default App
