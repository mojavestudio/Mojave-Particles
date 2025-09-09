/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 800
 * @framerIntrinsicHeight 600
 */
/**
 * 🌟 MOJAVE PARTICLES v1.2.0
 * © 2025 Mojave Studio LLC - All Rights Reserved
 * Clean single component version
 */

// @ts-ignore
import { addPropertyControls, ControlType, Color, RenderTarget } from "framer"
import { useEffect, useRef, useState } from "react"

export default function MojaveParticles({
    amount = 50,
    size = { type: "Range", min: 1, max: 5 },
    opacity = { type: "Range", min: 0.1, max: 1 },
    move = { enable: true, speed: 2, direction: "none", random: false },
    color = "#ffffff",
    colors = [],
    backdrop,
    radius = 0,
    shape = { type: "circle" },
    hover = { enable: true, mode: "grab", force: 60 },
    modes = {},
    twinkle = { enable: false, speed: 1, minOpacity: 0.1, maxOpacity: 1 },
    glow = { enable: false, size: 3, intensity: 0.6 },
    previewMotion = true,
    style = {},
    width,
    height,
}: any) {
    const [isMounted, setIsMounted] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)
    const animationRef = useRef<number | null>(null)
    const seedSignatureRef = useRef<string>("")
    const particlesRef = useRef<any[]>([])
    const sizeScaleRef = useRef<number>(1)
    const lastTimeRef = useRef<number | null>(null)
    const lastDprRef = useRef<number>(1)
    const mouseRef = useRef<{ x: number; y: number; isHovering: boolean }>({
        x: -1,
        y: -1,
        isHovering: false,
    })

    // Normalize shape: accept nested `shape` and legacy flat keys `shapeType`/`shapeText`
    // @ts-ignore
    const __allProps = (arguments as any)[0] || {}
    const styleProp = (style || (__allProps as any).style) || {}
    const styleWidth = (styleProp as any).width
    const styleHeight = (styleProp as any).height
    const styleBorderRadius = (styleProp as any).borderRadius
    // Only sanitize background-related styles if a backdrop color is set; otherwise allow native layer Fill
    const shouldSanitizeBackground = backdrop != null && backdrop !== ""
    const safeStyle = shouldSanitizeBackground
        ? (Object.fromEntries(
            Object.entries(styleProp as any).filter(([k]) => !String(k).toLowerCase().startsWith("background"))
          ) as any)
        : (styleProp as any)
    const intrinsicW = 800
    const intrinsicH = 600
    const normalizedShape = {
        type: (shape && (shape as any).type) || (__allProps as any).shapeType || "circle",
        text: (shape && (shape as any).text) || (__allProps as any).shapeText,
    }
    // Dependencies for effects
    const shapeTypeDep = normalizedShape.type
    const shapeTextDep = normalizedShape.text

    // Normalize modes strictly from the current "modes" object to avoid sticky values
    // from hidden legacy controls when switching presets. If a preset doesn't include
    // a key, we treat it as "off" rather than falling back to previous values.
    const has = (obj: any, key: string) => obj && Object.prototype.hasOwnProperty.call(obj, key)
    const normalizedModes = {
        connect: has(modes, "connect") ? Boolean((modes as any).connect) : false,
        connectDistance: has(modes, "connectDistance") ? Number((modes as any).connectDistance) : 0,
        connectOpacity: has(modes, "connectOpacity") ? Number((modes as any).connectOpacity) : 0.2,
        connectWidth: has(modes, "connectWidth") ? Number((modes as any).connectWidth) : 1,
    }
    // Effect deps for modes
    const modesConnectDep = normalizedModes.connect
    const modesConnectDistDep = normalizedModes.connectDistance
    const modesConnectOpDep = normalizedModes.connectOpacity
    const modesConnectWidthDep = normalizedModes.connectWidth

    // Normalize boundary/out mode across known aliases (move.out, move.boundary, top-level out/outMode/boundary)
    const boundaryMode =
        (move && (move as any).out) ??
        (move && (move as any).boundary) ??
        (move && (move as any).outMode) ??
        (__allProps as any).out ??
        (__allProps as any).outMode ??
        (__allProps as any).boundary ??
        "bounce" // default behavior

    // Effect dep for boundary
    const boundaryDep = boundaryMode

    // Determine Framer render target
    const target =
        typeof (RenderTarget as any)?.current === "function"
            ? (RenderTarget as any).current()
            : undefined
    const inCanvas = target === RenderTarget.canvas
    const inPreview = target === RenderTarget.preview
    const inExport =
        target === RenderTarget.export || target === RenderTarget.thumbnail

    // Final switch for animation in the active target
    const isVisibleProp = (__allProps as any)?.visible
    const allowAnimation =
        move?.enable !== false && !inExport && !(inPreview && !previewMotion) && (isVisibleProp !== false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    useEffect(() => {
        if (!isMounted || !canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d", {
            alpha: true,
            desynchronized: false,
            colorSpace: "srgb",
            willReadFrequently: false,
        })
        if (!ctx) return

        // Color helpers
        function makeHex(colorInput: any): string {
            if (!colorInput) return "#ffffff"
            try {
                if (
                    typeof colorInput === "string" &&
                    colorInput.startsWith("var(--token-")
                ) {
                    const m = colorInput.match(
                        /var\(--token-[^,]+,\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)\)/
                    )
                    if (m) {
                        const [, r, g, b] = m
                        return `#${parseInt(r).toString(16).padStart(2, "0")}${parseInt(g).toString(16).padStart(2, "0")}${parseInt(b).toString(16).padStart(2, "0")}`
                    }
                }
                if (typeof colorInput === "object")
                    return Color.toHexString(colorInput)
                if (
                    typeof colorInput === "string" &&
                    colorInput.startsWith("#")
                )
                    return colorInput
                return Color.toHexString(Color(colorInput))
            } catch {
                return "#ffffff"
            }
        }

        // Try to extract the alpha channel from a Framer Color or CSS color string
        function getAlpha(colorInput: any): number {
            try {
                if (!colorInput) return 1
                // Framer Color object
                if (typeof colorInput === "object") {
                    try {
                        // Prefer Color.alpha if available
                        const a = (Color as any)?.alpha?.(Color(colorInput))
                        if (typeof a === "number" && !isNaN(a)) return a
                    } catch {}
                    // Fallback to parsing an rgb/rgba string if supported
                    try {
                        const rgb = (Color as any)?.toRgbString?.(Color(colorInput))
                        if (typeof rgb === "string") {
                            const m = rgb.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*(\d*\.?\d+)\s*)?\)/i)
                            if (m && m[1] != null) return Math.max(0, Math.min(1, parseFloat(m[1])))
                        }
                    } catch {}
                    return 1
                }
                // CSS color string with rgba()/hsla()
                if (typeof colorInput === "string") {
                    // 8-digit HEX (#RRGGBBAA)
                    const hex8 = colorInput.match(/^#([0-9a-fA-F]{8})$/)
                    if (hex8) {
                        const aa = parseInt(hex8[1].slice(6, 8), 16)
                        return Math.max(0, Math.min(1, aa / 255))
                    }
                    // 4-digit HEX (#RGBA)
                    const hex4 = colorInput.match(/^#([0-9a-fA-F]{4})$/)
                    if (hex4) {
                        const a = parseInt(hex4[1].slice(3, 4).repeat(2), 16)
                        return Math.max(0, Math.min(1, a / 255))
                    }
                    const rgba = colorInput.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)/i)
                    if (rgba && rgba[1] != null) return Math.max(0, Math.min(1, parseFloat(rgba[1])))
                    const hsla = colorInput.match(/hsla?\(\s*[-\d.]+\s*,\s*[-\d.]+%\s*,\s*[-\d.]+%\s*,\s*(\d*\.?\d+)\s*\)/i)
                    if (hsla && hsla[1] != null) return Math.max(0, Math.min(1, parseFloat(hsla[1])))
                    // Try the Color API on strings too (supports 8-digit hex and others)
                    try {
                        const a = (Color as any)?.alpha?.(Color(colorInput))
                        if (typeof a === "number" && !isNaN(a)) return a
                    } catch {}
                    return 1
                }
            } catch {}
            return 1
        }

        function hexToRgba(hex: string, alpha = 1) {
            const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
            if (!res) return `rgba(255,255,255,${alpha})`
            const r = parseInt(res[1], 16),
                g = parseInt(res[2], 16),
                b = parseInt(res[3], 16)
            return `rgba(${r}, ${g}, ${b}, ${alpha})`
        }

        // Convert diverse CSS/Framer color inputs into a concrete CSS rgb/rgba string
        function resolveCssColor(input: any): string | null {
            try {
                if (!input) return null
                // Framer Color object or any object supported by Color()
                if (typeof input === 'object') {
                    try {
                        const s = (Color as any)?.toRgbString?.(Color(input))
                        if (typeof s === 'string') return s
                    } catch {}
                }
                if (typeof input === 'string') {
                    const s = input.trim()
                    // Already rgb/rgba
                    if (/^rgba?\(/i.test(s)) return s
                    // 8-digit hex (#RRGGBBAA)
                    if (/^#([0-9a-fA-F]{8})$/.test(s)) {
                        const m = s.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)!
                        const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16), a = parseInt(m[4], 16) / 255
                        return `rgba(${r}, ${g}, ${b}, ${a})`
                    }
                    // 4-digit hex (#RGBA)
                    if (/^#([0-9a-fA-F]{4})$/.test(s)) {
                        const m = s.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/)!
                        const r = parseInt(m[1] + m[1], 16), g = parseInt(m[2] + m[2], 16), b = parseInt(m[3] + m[3], 16), a = parseInt(m[4] + m[4], 16) / 255
                        return `rgba(${r}, ${g}, ${b}, ${a})`
                    }
                    // 6-digit hex -> opaque rgb
                    if (/^#([0-9a-fA-F]{6})$/.test(s)) {
                        const m = s.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)!
                        const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16)
                        return `rgb(${r}, ${g}, ${b})`
                    }
                    // CSS var token — resolve via computed style
                    if (/^var\(/i.test(s)) {
                        const probe = document.createElement('span')
                        probe.style.position = 'absolute'
                        probe.style.visibility = 'hidden'
                        probe.style.pointerEvents = 'none'
                        probe.style.color = s
                        document.body.appendChild(probe)
                        const resolved = getComputedStyle(probe).color
                        probe.remove()
                        if (resolved && /^rgba?\(/i.test(resolved)) return resolved
                        // Fallback to extracting the var() fallback rgb in the string if present
                        const m = s.match(/rgb\([^\)]+\)/i)
                        if (m) return m[0]
                    }
                    // Last resort: try Color API on strings
                    try {
                        const via = (Color as any)?.toRgbString?.(Color(s))
                        if (typeof via === 'string') return via
                    } catch {}
                }
            } catch {}
            return null
        }

        function alphaFromCssColorString(s: string): number {
            if (!s) return 1
            const rgba = s.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i)
            if (rgba) return Math.max(0, Math.min(1, parseFloat(rgba[4])))
            if (/^rgb\(/i.test(s)) return 1
            return 1
        }

        function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
            const spikes = 5
            const outerRadius = r
            const innerRadius = r * 0.5
            let rot = Math.PI / 2 * 3
            let cx = x
            let cy = y
            let step = Math.PI / spikes
            ctx.beginPath()
            ctx.moveTo(cx, cy - outerRadius)
            for (let i = 0; i < spikes; i++) {
                cx = x + Math.cos(rot) * outerRadius
                cy = y + Math.sin(rot) * outerRadius
                ctx.lineTo(cx, cy)
                rot += step
                cx = x + Math.cos(rot) * innerRadius
                cy = y + Math.sin(rot) * innerRadius
                ctx.lineTo(cx, cy)
                rot += step
            }
            ctx.lineTo(x, y - outerRadius)
            ctx.closePath()
        }

        function renderParticleShape(
            ctx: CanvasRenderingContext2D,
            x: number,
            y: number,
            size: number,
            color: string,
            opacity: number,
        ) {
            if (normalizedShape.type === "text") {
                ctx.font = `${size * 2}px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, Arial`
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText((normalizedShape.text as any) || "⭐", x, y)
                return
            }
            // Resolve base color (supports tokens/rgba/hex) and combine with per-particle opacity
            const baseCss = resolveCssColor(color) || makeHex(color)
            let baseA = alphaFromCssColorString(baseCss)
            if (!isFinite(baseA)) baseA = 1
            const finalA = Math.max(0, Math.min(1, baseA * opacity))
            if (/^rgba\(/i.test(baseCss)) {
                // replace alpha in existing rgba
                const parts = baseCss.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i)!
                ctx.fillStyle = `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${finalA})`
            } else if (/^rgb\(/i.test(baseCss)) {
                const parts = baseCss.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i)!
                ctx.fillStyle = `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${finalA})`
            } else {
                // hex or other → convert via helper
                ctx.fillStyle = hexToRgba(makeHex(baseCss), finalA)
            }
            if (normalizedShape.type === "square") {
                const s = size * 2
                ctx.fillRect(x - size, y - size, s, s)
            } else if (normalizedShape.type === "star") {
                drawStar(ctx, x, y, size)
                ctx.fill()
            } else {
                // circle (default)
                ctx.beginPath()
                ctx.arc(x, y, size, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        const cols = (colors && colors.length ? colors : [color]).map(c => {
            const css = resolveCssColor(c)
            if (css) return css
            return makeHex(c)
        })

        // Grapheme-safe emoji segmentation (handles ZWJ sequences, flags, skin tones)
        function toEmojiArray(input?: string) {
            if (!input) return []
            try {
                // Prefer Intl.Segmenter for proper grapheme clusters
                // @ts-ignore
                const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" })
                // @ts-ignore
                return Array.from(seg.segment(String(input))).map((s: any) => s.segment).filter(Boolean)
            } catch {
                // Fallback: spread by code points (works for surrogate pairs, not ZWJ)
                return [...String(input)]
            }
        }
        const emojiList = normalizedShape.type === "text" ? toEmojiArray(String(normalizedShape.text || "")) : []

        // Canvas sizing
        const resizeCanvas = () => {
            const container = rootRef.current || canvas.parentElement
            if (!container) return
            const rect = typeof (container as any).getBoundingClientRect === "function" ? (container as any).getBoundingClientRect() : { width: (container as HTMLElement).clientWidth, height: (container as HTMLElement).clientHeight } as any
            const propW = (width ?? (__allProps as any)?.width) as number | undefined
            const propH = (height ?? (__allProps as any)?.height) as number | undefined
            const cw = Math.max(1, (typeof propW === 'number' ? propW : (rect.width || (container as HTMLElement).clientWidth)) || 800)
            const ch = Math.max(1, (typeof propH === 'number' ? propH : (rect.height || (container as HTMLElement).clientHeight)) || 600)
            const dpr = Math.max(1, window.devicePixelRatio || 1)
            lastDprRef.current = dpr
            const prevW = (canvas as any).logicalWidth || cw
            const prevH = (canvas as any).logicalHeight || ch
            canvas.width = Math.floor(cw * dpr)
            canvas.height = Math.floor(ch * dpr)
            // Use percentage sizing so canvas always fills the wrapper even if it resizes after paint
            canvas.style.width = `100%`
            canvas.style.height = `100%`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.imageSmoothingEnabled = true
            ;(canvas as any).logicalWidth = cw
            ;(canvas as any).logicalHeight = ch
            // Proportional sizing relative to component's intrinsic size
            const prevScale = sizeScaleRef.current || 1
            const computed = Math.min(cw / intrinsicW, ch / intrinsicH)
            const nextScale = Math.max(0.2, Math.min(2, computed))
            sizeScaleRef.current = nextScale

            // If particles were created when the canvas was tiny, re-seed on first real size
            const wasTiny = prevW <= 10 || prevH <= 10
            const nowGrown = cw > 10 && ch > 10
            if (!particlesRef.current || particlesRef.current.length === 0 || wasTiny && nowGrown) {
                createParticles()
            } else if (particlesRef.current && particlesRef.current.length && (prevW !== cw || prevH !== ch)) {
                // Otherwise, scale existing particle positions to fit the new logical size
                const sx = cw / prevW
                const sy = ch / prevH
                const sf = (prevScale > 0 ? nextScale / prevScale : 1)
                for (let i = 0; i < particlesRef.current.length; i++) {
                    const p = particlesRef.current[i]
                    p.x *= sx
                    p.y *= sy
                    p.vx *= sf
                    p.vy *= sf
                    p.size *= sf
                    if (p.emoji) {
                        p.sprite = makeEmojiSprite(p.emoji, p.size)
                    }
                }
            }
        }

        // Emoji sprite for smooth motion (avoids glyph grid snapping)
        function makeEmojiSprite(glyph: string, drawSize: number) {
            const dpr = Math.max(1, lastDprRef.current || window.devicePixelRatio || 1)
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

        // Particles
        function createParticles() {
            const cw = (canvas as any).logicalWidth || 800
            const ch = (canvas as any).logicalHeight || 600
            const s = sizeScaleRef.current || 1

            // Match preview speed exactly - direct pixel movement
            // Map speed units to ~0.20 px/frame at 60fps (≈12 px/s per unit).
            // Decoupled from size so the slider feels consistent.
            const baseSpeed = (move?.speed ?? 2) * 0.20
            const emojiChoices = ["⭐", "✨", "🌟", "💫", "🌙", "☀", "☾", "🪐"]

            const n = Math.max(0, amount || 50)
            const arr: any[] = []

            // Even spatial distribution using jittered grid sampling
            const aspect = cw / Math.max(1, ch)
            const colsCount = Math.max(1, Math.round(Math.sqrt(n * aspect)))
            const rowsCount = Math.max(1, Math.ceil(n / colsCount))
            const cellW = cw / colsCount
            const cellH = ch / rowsCount

            let placed = 0
            for (let r = 0; r < rowsCount && placed < n; r++) {
                for (let cidx = 0; cidx < colsCount && placed < n; cidx++) {
                    const c = cols[Math.floor(Math.random() * cols.length)]

                    // Random velocity - match preview exactly
                    let vx = 0, vy = 0
                    if (move?.enable !== false) {
                        switch (move?.direction) {
                            case "top": vy = -baseSpeed; break
                            case "bottom": vy = baseSpeed; break
                            case "left": vx = -baseSpeed; break
                            case "right": vx = baseSpeed; break
                            case "random":
                                vx = (Math.random() - 0.5) * baseSpeed * 2
                                vy = (Math.random() - 0.5) * baseSpeed * 2
                                break
                            default:
                                vx = (Math.random() - 0.5) * baseSpeed * 0.8
                                vy = (Math.random() - 0.5) * baseSpeed * 0.8
                                break
                        }
                    }

                    // Size calculation
                    let particleSize: number
                    if (size?.type === "Range") {
                        particleSize = Math.random() * ((size?.max || 5) - (size?.min || 1)) + (size?.min || 1)
                    } else {
                        particleSize = size?.value || 3
                    }
                    // Scale particle size with component size to stay proportional
                    particleSize *= s

                    // Opacity calculation
                    const particleOpacity = opacity?.type === "Range"
                        ? Math.random() * ((opacity?.max || 1) - (opacity?.min || 0.1)) + (opacity?.min || 0.1)
                        : (opacity?.value || 0.5)

                    // Multi-emoji support
                    let particleEmoji = undefined
                    if (normalizedShape.type === "text") {
                        if (emojiList.length > 0) {
                            particleEmoji = emojiList[placed % emojiList.length]
                        } else {
                            particleEmoji = emojiChoices[Math.floor(Math.random() * emojiChoices.length)]
                        }
                    }

                    const jitterX = (Math.random() * 0.8 + 0.1) // 10%..90%
                    const jitterY = (Math.random() * 0.8 + 0.1)
                    const x = cidx * cellW + jitterX * cellW
                    const y = r * cellH + jitterY * cellH

                    arr.push({
                        x,
                        y,
                        vx,
                        vy,
                        color: c,
                        size: particleSize,
                        baseOpacity: particleOpacity,
                        twinklePhase: Math.random() * Math.PI * 2,
                        emoji: particleEmoji,
                        sprite: particleEmoji ? makeEmojiSprite(particleEmoji, particleSize) : undefined,
                    })
                    placed++
                }
            }

            particlesRef.current = arr
        }

        // Draw helpers
        const clearAll = () => {
            ctx.save()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.restore()
        }

        const drawBackdrop = (width: number, height: number) => {
            if (!backdrop) return
            const css = resolveCssColor(backdrop)
            if (!css) return
            const a = alphaFromCssColorString(css)
            if (a <= 0) return
            ctx.save()
            ctx.globalAlpha = 1
            ctx.fillStyle = css
            ctx.fillRect(0, 0, width, height)
            ctx.restore()
        }

        // Connection rendering between particles
        function drawConnections(ps: any[], width: number, height: number) {
            if (!normalizedModes.connect) return
            const s = sizeScaleRef.current || 1
            const maxDist = (normalizedModes.connectDistance && normalizedModes.connectDistance > 0)
                ? normalizedModes.connectDistance * s
                : 120
            const baseOpacity = Math.max(0, Math.min(1, (normalizedModes.connectOpacity ?? 0.4)))
            const lineWidth = (normalizedModes.connectWidth && normalizedModes.connectWidth > 0)
                ? Math.max(0.25, normalizedModes.connectWidth * Math.max(0.75, Math.min(1.5, s)))
                : 1
            // Optional explicit connection color (resolve tokens & alpha)
            const connectColorRaw = (modes as any)?.connectColor
            const connectColorCss = connectColorRaw ? (resolveCssColor(connectColorRaw) || makeHex(connectColorRaw)) : undefined

            ctx.save()
            ctx.lineWidth = lineWidth
            for (let a = 0; a < ps.length; a++) {
                for (let b = a + 1; b < ps.length; b++) {
                    const p1 = ps[a]
                    const p2 = ps[b]
                    const dx = p1.x - p2.x
                    const dy = p1.y - p2.y
                    const d = Math.hypot(dx, dy)
                    if (d > maxDist) continue
                    const alpha = baseOpacity * (1 - d / maxDist)
                    if (alpha <= 0) continue
                    if (connectColorCss) {
                        const ca = alphaFromCssColorString(connectColorCss)
                        const useA = Math.max(0, Math.min(1, ca * alpha))
                        if (/^rgba\(/i.test(connectColorCss)) {
                            const parts = connectColorCss.match(/rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i)!
                            ctx.strokeStyle = `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${useA})`
                        } else if (/^rgb\(/i.test(connectColorCss)) {
                            const parts = connectColorCss.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i)!
                            ctx.strokeStyle = `rgba(${parts[1]}, ${parts[2]}, ${parts[3]}, ${useA})`
                        } else {
                            ctx.strokeStyle = hexToRgba(makeHex(connectColorCss), useA)
                        }
                    } else {
                        ctx.strokeStyle = hexToRgba('#ffffff', alpha)
                    }
                    ctx.beginPath()
                    ctx.moveTo(p1.x, p1.y)
                    ctx.lineTo(p2.x, p2.y)
                    ctx.stroke()
                }
            }
            ctx.restore()
        }

        const drawStaticParticles = () => {
            const width = (canvas as any).logicalWidth || canvas.width
            const height = (canvas as any).logicalHeight || canvas.height
            clearAll()
            drawBackdrop(width, height)

            const ps = particlesRef.current
            // Draw connections first so particles render on top
            drawConnections(ps, width, height)
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i]
                ctx.save()
                ctx.globalAlpha = p.baseOpacity
                if (normalizedShape.type === "text") {
                    const drawSize = p.size * 2
                    if (!p.sprite) p.sprite = makeEmojiSprite(p.emoji || "⭐", p.size)
                    ctx.imageSmoothingEnabled = true
                    ctx.drawImage(p.sprite, p.x - drawSize / 2, p.y - drawSize / 2, drawSize, drawSize)
                } else {
                    renderParticleShape(ctx, p.x, p.y, p.size, p.color, p.baseOpacity)
                }
                ctx.restore()
            }
        }

        // Animation loop - direct pixel movement to match preview
        const animate = () => {
            const width = (canvas as any).logicalWidth || canvas.width
            const height = (canvas as any).logicalHeight || canvas.height
            clearAll()
            drawBackdrop(width, height)

            const now = performance.now()
            const dt = lastTimeRef.current == null ? 16.666 : (now - lastTimeRef.current)
            lastTimeRef.current = now
            const step = Math.max(0.5, Math.min(2.5, dt / 16.666))
            try { (ctx as any).imageSmoothingEnabled = true; (ctx as any).imageSmoothingQuality = 'high' } catch {}

            const ps = particlesRef.current
            if (!ps || ps.length === 0) {
                animationRef.current = requestAnimationFrame(animate)
                return
            }

            // First pass: update positions & visuals already done above
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i]

                // Direct pixel movement (match preview exactly)
                if (move?.enable !== false) {
                    p.x += p.vx * step
                    p.y += p.vy * step

                    if (String(boundaryMode) === "bounce") {
                        // Bounce at edges with damping
                        const damping = 0.98
                        if (p.x - p.size < 0 || p.x + p.size > width) {
                            p.vx = -p.vx * damping
                            p.x = Math.max(p.size, Math.min(width - p.size, p.x))
                        }
                        if (p.y - p.size < 0 || p.y + p.size > height) {
                            p.vy = -p.vy * damping
                            p.y = Math.max(p.size, Math.min(height - p.size, p.y))
                        }
                    } else {
                        // Allow particles to leave the frame and respawn along the opposite edge
                        const offX = p.x < -p.size || p.x > width + p.size
                        const offY = p.y < -p.size || p.y > height + p.size
                        if (offX || offY) {
                            switch (move?.direction) {
                                case "bottom":
                                    p.x = Math.random() * width
                                    p.y = -p.size
                                    break
                                case "top":
                                    p.x = Math.random() * width
                                    p.y = height + p.size
                                    break
                                case "left":
                                    p.x = width + p.size
                                    p.y = Math.random() * height
                                    break
                                case "right":
                                    p.x = -p.size
                                    p.y = Math.random() * height
                                    break
                                default:
                                    // neutral/random → respawn above to emulate snowfall
                                    p.x = Math.random() * width
                                    p.y = -p.size
                                    break
                            }
                        }
                    }
                }

                // Calculate opacity with twinkle - match preview exactly
                let currentOpacity = p.baseOpacity
                if (twinkle?.enable) {
                    p.twinklePhase += (twinkle?.speed ?? 1) * 0.02 * step
                    const m = (Math.sin(p.twinklePhase) + 1) / 2
                    currentOpacity =
                        (twinkle?.minOpacity ?? 0.3) +
                        ((twinkle?.maxOpacity ?? 1) -
                            (twinkle?.minOpacity ?? 0.3)) *
                            m
                }
                // Save currentOpacity for use in drawing below, if needed
                p._currentOpacity = currentOpacity
            }

            // Second pass: draw connections with current positions
            drawConnections(ps, width, height)
            // Third pass: draw particles on top
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i]
                let renderSize = p.size
                // glow/hover/currentOpacity already computed in previous loop; recompute minimal bits here
                let currentOpacity = p._currentOpacity ?? p.baseOpacity
                if (twinkle?.enable) {
                    // twinklePhase already advanced above; recompute effective opacity
                    const m = (Math.sin(p.twinklePhase) + 1) / 2
                    currentOpacity = (twinkle?.minOpacity ?? 0.3) + ((twinkle?.maxOpacity ?? 1) - (twinkle?.minOpacity ?? 0.3)) * m
                }
                ctx.save()
                if (glow?.enable) {
                    ctx.shadowBlur = (glow?.size ?? 3) * p.size * 0.5
                    ctx.shadowColor = p.color
                    ctx.globalAlpha = (glow?.intensity ?? 0.6) * 0.5
                }
                if (hover?.enable && mouseRef.current?.isHovering) {
                    const dx = mouseRef.current.x - p.x
                    const dy = mouseRef.current.y - p.y
                    const d = Math.hypot(dx, dy)
                    const r = Math.max(10, Math.min(60, hover?.force || 100))
                    if (d < r) {
                        const t = (r - d) / r
                        if (hover.mode === "bubble") {
                            const scale = 1 + t
                            renderSize = p.size * scale
                        } else if (hover.mode === "attract") {
                            const strength = Math.min(hover?.force || 100, 60) * 0.001 * t
                            p.x += dx * strength
                            p.y += dy * strength
                        } else if (hover.mode === "repulse") {
                            const strength = Math.min(hover?.force || 100, 60) * 0.001 * t
                            p.x -= dx * strength
                            p.y -= dy * strength
                        }
                    }
                }
                ctx.globalAlpha = currentOpacity
                if (normalizedShape.type === "text") {
                    const drawSize = renderSize * 2
                    if (!p.sprite) p.sprite = makeEmojiSprite(p.emoji || "⭐", renderSize)
                    ctx.imageSmoothingEnabled = true
                    ctx.drawImage(p.sprite, p.x - drawSize / 2, p.y - drawSize / 2, drawSize, drawSize)
                } else {
                    renderParticleShape(ctx, p.x, p.y, renderSize, p.color, currentOpacity)
                }
                ctx.restore()
            }

            animationRef.current = requestAnimationFrame(animate)
        }

        // Mouse handlers
        // Use global pointer tracking so the canvas never intercepts events
        const handlePointerMove = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            const within = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
            if (within) {
                mouseRef.current = { x, y, isHovering: true }
            } else {
                mouseRef.current = { x: -1, y: -1, isHovering: false }
            }
        }

        const handleWindowBlur = () => {
            mouseRef.current.isHovering = false
        }

        // Initialize — wait for a meaningful canvas size to seed particles
        resizeCanvas()
        const logicalW = (canvas as any).logicalWidth || 0
        const logicalH = (canvas as any).logicalHeight || 0
        const nextSeedSig = JSON.stringify({
            amount,
            size,
            opacity,
            colors: (colors && colors.length ? colors : [color]),
            shapeType: normalizedShape.type,
            shapeText: normalizedShape.text || "",
        })
        const needReseed = seedSignatureRef.current !== nextSeedSig
        if (logicalW > 10 && logicalH > 10 && (needReseed || !particlesRef.current?.length)) {
            createParticles()
            seedSignatureRef.current = nextSeedSig
        }

        // Start/stop animation
        if (allowAnimation) {
            animationRef.current = requestAnimationFrame(animate)
        } else {
            drawStaticParticles()
        }

        // Event listeners
        const onWindowResize = () => {
            resizeCanvas()
            if (!allowAnimation) drawStaticParticles()
        }

        window.addEventListener("resize", onWindowResize)

        // Observe element size changes (Framer resizes won't always trigger window resize)
        let ro: ResizeObserver | null = null
        const containerEl = canvas.parentElement
        if (containerEl && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => {
                resizeCanvas()
                if (!allowAnimation) drawStaticParticles()
            })
            ro.observe(containerEl)
        }

        // Watch devicePixelRatio changes without polling: listen to common resolution breakpoints
        const mqs: MediaQueryList[] = [
            window.matchMedia('(min-resolution: 1.25dppx)'),
            window.matchMedia('(min-resolution: 1.5dppx)'),
            window.matchMedia('(min-resolution: 2dppx)'),
            window.matchMedia('(min-resolution: 3dppx)')
        ]
        const onDpr = () => {
            const current = Math.max(1, window.devicePixelRatio || 1)
            if (current !== lastDprRef.current) {
                lastDprRef.current = current
                resizeCanvas()
                if (!allowAnimation) drawStaticParticles()
            }
        }
        mqs.forEach(mq => mq.addEventListener?.('change', onDpr))

        // Pause when offscreen
        let io: IntersectionObserver | null = null
        io = new IntersectionObserver((entries) => {
            const entry = entries[0]
            if (!entry) return
            const onScreen = entry.isIntersecting && entry.intersectionRatio > 0
            if (onScreen) {
                if (allowAnimation && !animationRef.current) animationRef.current = requestAnimationFrame(animate)
            } else {
                if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null }
            }
        }, { root: null, threshold: [0, 0.01, 0.1] })
        io.observe(canvas)
        if (hover?.enable) {
            window.addEventListener("pointermove", handlePointerMove, { passive: true })
            window.addEventListener("pointerdown", handlePointerMove, { passive: true })
            window.addEventListener("blur", handleWindowBlur)
        }

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current)
            window.removeEventListener("resize", onWindowResize)
            if (ro) ro.disconnect()
            if (io) io.disconnect()
            mqs.forEach(mq => mq.removeEventListener?.('change', onDpr))
            if (hover?.enable) {
                window.removeEventListener("pointermove", handlePointerMove)
                window.removeEventListener("pointerdown", handlePointerMove)
                window.removeEventListener("blur", handleWindowBlur)
            }
            lastTimeRef.current = null
        }
    }, [
        isMounted,
        amount,
        backdrop,
        color,
        colors,
        move?.speed,
        move?.enable,
        move?.direction,
        move?.random,
        hover?.enable,
        hover?.mode,
        hover?.force,
        glow?.enable,
        glow?.size,
        glow?.intensity,
        twinkle?.enable,
        twinkle?.speed,
        twinkle?.minOpacity,
        twinkle?.maxOpacity,
        shapeTypeDep,
        shapeTextDep,
        size,
        opacity,
        previewMotion,
        modesConnectDep,
        modesConnectDistDep,
        modesConnectOpDep,
        modesConnectWidthDep,
        (modes as any)?.connectColor,
        boundaryDep,
    ])

    return (
        <div
            ref={rootRef}
            style={{
                // Default to intrinsic size; allow external fixed sizing to take effect via styleWidth/Height
                width: (styleWidth as any) ?? intrinsicW,
                height: (styleHeight as any) ?? intrinsicH,

                // Keep DOM background transparent only if we draw our own backdrop; otherwise allow native Fill
                background: shouldSanitizeBackground ? "transparent" : (safeStyle as any)?.background,
                borderRadius: styleBorderRadius ?? radius,
                display: "block",
                position: "relative",
                overflow: "hidden",
                minHeight: inCanvas ? "200px" : undefined,
                border: "0",
                outline: "0",
                margin: 0,
                padding: 0,
                boxSizing: "border-box",
                boxShadow: "none",
                transform: "translateZ(0)",
                WebkitTransform: "translateZ(0)",
                willChange: "transform",
                // Spread external styles (conditionally sanitized)
                ...(safeStyle as any),
            }}
            aria-hidden={true}
        >
            <canvas
                ref={canvasRef}
                style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    pointerEvents: "none",
                    backgroundColor: "transparent",
                    border: "0",
                    outline: "0",
                    margin: 0,
                    padding: 0,
                    boxSizing: "border-box",
                    boxShadow: "none",
                    transform: "translateZ(0)",
                    WebkitTransform: "translateZ(0)",
                    position: "relative",
                }}
            />
        </div>
    )
}

// Property Controls
addPropertyControls(MojaveParticles, {
    backdrop: { type: ControlType.Color, title: "Background", alpha: true, optional: true },
    color: { type: ControlType.Color, title: "Color", alpha: true },
    colors: {
        type: ControlType.Array,
        title: "Colors",
        control: { type: ControlType.Color },
    },
    amount: {
        type: ControlType.Number,
        title: "Amount",
        min: 0,
        max: 300,
        defaultValue: 50,
    },
    size: {
        type: ControlType.Object,
        title: "Size",
        controls: {
            type: {
                type: ControlType.Enum,
                options: ["Value", "Range"],
                defaultValue: "Range",
            },
            value: {
                type: ControlType.Number,
                defaultValue: 3,
                hidden: (size) => size.type === "Range",
            },
            min: {
                type: ControlType.Number,
                defaultValue: 1,
                hidden: (size) => size.type !== "Range",
            },
            max: {
                type: ControlType.Number,
                defaultValue: 5,
                hidden: (size) => size.type !== "Range",
            },
        },
    },
    opacity: {
        type: ControlType.Object,
        title: "Opacity",
        controls: {
            type: {
                type: ControlType.Enum,
                options: ["Value", "Range"],
                defaultValue: "Range",
            },
            value: {
                type: ControlType.Number,
                defaultValue: 0.5,
                hidden: (opacity) => opacity.type !== "Value",
            },
            min: {
                type: ControlType.Number,
                defaultValue: 0.1,
                hidden: (opacity) => opacity.type !== "Range",
            },
            max: {
                type: ControlType.Number,
                defaultValue: 1,
                hidden: (opacity) => opacity.type !== "Range",
            },
        },
    },
    shape: {
        type: ControlType.Object,
        title: "Shape",
        controls: {
            type: {
                type: ControlType.Enum,
                options: ["circle", "square", "star", "text"],
                defaultValue: "circle",
            },
            text: {
                type: ControlType.String,
                defaultValue: "⭐",
                hidden: (shape) => shape.type !== "text",
            },
        },
    },
    move: {
        type: ControlType.Object,
        title: "Move",
        controls: {
            enable: { type: ControlType.Boolean, defaultValue: true },
            direction: {
                type: ControlType.Enum,
                options: ["none", "top", "right", "bottom", "left", "random"],
                defaultValue: "none",
                hidden: (move) => !move.enable,
            },
            speed: {
                type: ControlType.Number,
                defaultValue: 2,
                min: 0,
                max: 50,
                step: 0.1,
                hidden: (move) => !move.enable,
            },
            random: {
                type: ControlType.Boolean,
                defaultValue: false,
                hidden: (move) => !move.enable,
            },
            // Hidden boundary aliases so plugin-sent values persist on insert
            out: {
                type: ControlType.Enum,
                options: ["bounce", "out"],
                defaultValue: "bounce",
                hidden: () => true,
            },
            boundary: {
                type: ControlType.Enum,
                options: ["bounce", "out"],
                defaultValue: "bounce",
                hidden: () => true,
            },
            outMode: {
                type: ControlType.Enum,
                options: ["bounce", "out"],
                defaultValue: "bounce",
                hidden: () => true,
            },
        },
    },
    hover: {
        type: ControlType.Object,
        title: "Hover",
        controls: {
            enable: { type: ControlType.Boolean, defaultValue: true },
            mode: {
                type: ControlType.Enum,
                options: ["grab", "bubble", "repulse", "attract"],
                defaultValue: "grab",
                hidden: (hover) => !hover.enable,
            },
            force: {
                type: ControlType.Number,
                defaultValue: 60,
                hidden: (hover) => !hover.enable,
            },
        },
    },
    twinkle: {
        type: ControlType.Object,
        title: "Twinkle",
        controls: {
            enable: {
                type: ControlType.Boolean,
                title: "Enable Twinkle",
                defaultValue: false,
            },
            speed: {
                type: ControlType.Number,
                title: "Speed",
                defaultValue: 1,
                min: 0.1,
                max: 5,
                step: 0.1,
                hidden: (twinkle) => !twinkle.enable,
            },
            minOpacity: {
                type: ControlType.Number,
                title: "Min Opacity",
                defaultValue: 0.1,
                min: 0,
                max: 1,
                step: 0.1,
                hidden: (twinkle) => !twinkle.enable,
            },
            maxOpacity: {
                type: ControlType.Number,
                title: "Max Opacity",
                defaultValue: 1,
                min: 0,
                max: 1,
                step: 0.1,
                hidden: (twinkle) => !twinkle.enable,
            },
        },
    },
    glow: {
        type: ControlType.Object,
        title: "Glow",
        controls: {
            enable: {
                type: ControlType.Boolean,
                title: "Enable Glow",
                defaultValue: false,
            },
            size: {
                type: ControlType.Number,
                title: "Size",
                defaultValue: 3,
                min: 0,
                max: 10,
                step: 0.1,
                hidden: (glow) => !glow.enable,
            },
            intensity: {
                type: ControlType.Number,
                title: "Intensity",
                defaultValue: 0.6,
                min: 0,
                max: 1,
                step: 0.1,
                hidden: (glow) => !glow.enable,
            },
        },
    },
    modes: {
        type: ControlType.Object,
        title: "Connections",
        controls: {
            connect: { type: ControlType.Boolean, title: "Enable", defaultValue: false },
            connectDistance: { type: ControlType.Number, title: "Distance", defaultValue: 120, min: 0, max: 600, step: 1 },
            connectOpacity: { type: ControlType.Number, title: "Opacity", defaultValue: 0.2, min: 0, max: 1, step: 0.05 },
            connectWidth: { type: ControlType.Number, title: "Width", defaultValue: 1, min: 0.25, max: 6, step: 0.25 },
            connectColor: { type: ControlType.Color, title: "Color", alpha: true },
        },
    },

    // Hidden legacy aliases so external inserts using flat keys are preserved
    // These do not appear in the UI but allow the plugin to pass flat props
    // that we already normalize in-component.
    shapeType: {
        type: ControlType.Enum,
        options: ["circle", "square", "star", "text"],
        defaultValue: "circle",
        hidden: () => true,
    },
    shapeText: {
        type: ControlType.String,
        defaultValue: "⭐",
        hidden: () => true,
    },

    // Legacy connection keys — kept hidden, mapped by normalization logic
    connectEnable: {
        type: ControlType.Boolean,
        defaultValue: false,
        hidden: () => true,
    },
    connectDistance: {
        type: ControlType.Number,
        defaultValue: 120,
        min: 0,
        max: 600,
        step: 1,
        hidden: () => true,
    },
    connectOpacity: {
        type: ControlType.Number,
        defaultValue: 0.2,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: () => true,
    },
    connectWidth: {
        type: ControlType.Number,
        defaultValue: 1,
        min: 0.25,
        max: 6,
        step: 0.25,
        hidden: () => true,
    },
    connectRadius: {
        type: ControlType.Number,
        defaultValue: 120,
        min: 0,
        max: 600,
        step: 1,
        hidden: () => true,
    },
    connectLinks: {
        type: ControlType.Boolean,
        defaultValue: false,
        hidden: () => true,
    },

    // Hidden top-level boundary aliases
    out: {
        type: ControlType.Enum,
        options: ["bounce", "out"],
        defaultValue: "bounce",
        hidden: () => true,
    },
    boundary: {
        type: ControlType.Enum,
        options: ["bounce", "out"],
        defaultValue: "bounce",
        hidden: () => true,
    },
    outMode: {
        type: ControlType.Enum,
        options: ["bounce", "out"],
        defaultValue: "bounce",
        hidden: () => true,
    },
    radius: { type: ControlType.Number, defaultValue: 0 },
    previewMotion: {
        type: ControlType.Boolean,
        title: "Preview Motion",
        defaultValue: true,
    },
})

// Also export a named specifier so shared-module insertion can target it explicitly
export { MojaveParticles }
