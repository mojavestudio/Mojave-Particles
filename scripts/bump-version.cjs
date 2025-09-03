#!/usr/bin/env node
/**
 * Bump version in framer.json and package.json.
 * Usage: node scripts/bump-version.cjs [patch|minor|major]
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const type = (process.argv[2] || 'patch').toLowerCase()
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error(`[bump] Unknown type "${type}". Use patch|minor|major`)
  process.exit(1)
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}
function bump(ver, kind) {
  const m = String(ver || '0.1.0').match(/^(\d+)\.(\d+)\.(\d+)$/)
  let major = 0, minor = 1, patch = 0
  if (m) { major = +m[1]; minor = +m[2]; patch = +m[3] }
  if (kind === 'major') { major++; minor = 0; patch = 0 }
  else if (kind === 'minor') { minor++; patch = 0 }
  else { patch++ }
  return `${major}.${minor}.${patch}`
}

const framerPath = path.join(root, 'framer.json')
const pkgPath = path.join(root, 'package.json')

const framer = readJSON(framerPath)
const pkg = readJSON(pkgPath)

const current = framer.version || pkg.version || '0.1.0'
const next = bump(current, type)

framer.version = next
pkg.version = next

writeJSON(framerPath, framer)
writeJSON(pkgPath, pkg)

console.log(`[bump] ${current} -> ${next}`)

