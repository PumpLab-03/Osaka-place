// 3か月に1回実行して、繁華街のエリア名検索と、大阪府全体のマス目検索で人気店・穴場を探し、src/data/picks.json に書き出す。
// 位置情報は30日以内に更新する必要があるので、間は refresh-locations.mjs が月2回取り直す。
//
// Google Maps Platform の規約に合わせて、保存するのは place ID と位置情報だけ。
// 店名・星・口コミ数は選ぶ判定にだけ使い、ファイルには残さない。
//
// 使い方: .env に GOOGLE_PLACES_API_KEY を入れて `npm run discover-picks`

import { readFile, writeFile } from 'node:fs/promises'

const API_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.types',
  'places.businessStatus',
  'nextPageToken',
].join(',')

const apiKey = process.env.GOOGLE_PLACES_API_KEY
if (!apiKey) {
  console.error('GOOGLE_PLACES_API_KEY が設定されていません（.env を確認してください）')
  process.exit(1)
}

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const areas = await readJson('../config/areas.json')
const grid = await readJson('../config/grid.json')
const categories = await readJson('../config/categories.json')
const filters = await readJson('../config/filters.json')

let requestCount = 0

async function searchText(body) {
  requestCount++
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`)
  return res.json()
}

function tierOf(place) {
  const rating = place.rating ?? 0
  const reviews = place.userRatingCount ?? 0
  const { popular, hidden } = filters
  if (rating >= popular.minRating && reviews >= popular.minReviews) return 'popular'
  if (rating >= hidden.minRating && reviews >= hidden.minReviews && reviews <= hidden.maxReviews) return 'hidden'
  return null
}

function distanceM(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// 点が多角形の内側にあるか（レイキャスティング法）
function insidePolygon(lat, lng, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const inBox = (lat, lng, box) => lat >= box.south && lat < box.north && lng >= box.west && lng < box.east

// 府全体を cellKm 四方のマスに分け、中心部（dense）はさらに細かく分ける
function buildCells() {
  const lats = grid.polygon.map((p) => p[0])
  const lngs = grid.polygon.map((p) => p[1])
  const bounds = { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) }
  const cells = []
  const addCells = (box, cellKm, maxPages, skip) => {
    const dLat = cellKm / 111
    const dLng = cellKm / (111 * Math.cos((((box.south + box.north) / 2) * Math.PI) / 180))
    for (let lat = box.south; lat < box.north; lat += dLat) {
      for (let lng = box.west; lng < box.east; lng += dLng) {
        const center = [lat + dLat / 2, lng + dLng / 2]
        if (!insidePolygon(center[0], center[1], grid.polygon)) continue
        if (skip && skip(center[0], center[1])) continue
        cells.push({
          id: `${cellKm}-${cells.length}`,
          maxPages,
          rect: {
            low: { latitude: lat, longitude: lng },
            high: { latitude: Math.min(lat + dLat, box.north), longitude: Math.min(lng + dLng, box.east) },
          },
        })
      }
    }
  }
  addCells(grid.dense, grid.dense.cellKm, grid.dense.maxPages)
  addCells(bounds, grid.cellKm, grid.maxPages, (lat, lng) => inBox(lat, lng, grid.dense))
  return cells
}

const isFoodPlace = (types) => types.some((t) => t === 'restaurant' || t === 'food' || t.endsWith('_restaurant'))

// 判定用の一時データ（店名はここだけで使い、書き出さない）
const candidates = new Map()

function addCandidate(p, category, area) {
  if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return
  const types = p.types ?? []
  if (types.some((t) => filters.excludeTypes.includes(t))) return
  if (category === 'play' && isFoodPlace(types)) return
  const tier = tierOf(p)
  if (!tier) return

  const existing = candidates.get(p.id)
  if (existing) {
    if (!existing.categories.includes(category)) existing.categories.push(category)
    return
  }
  candidates.set(p.id, {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    area,
    categories: [category],
    tier,
  })
}

async function runQueries(categoryConfs, makeBody, maxPages, area, keep = () => true) {
  for (const [category, conf] of Object.entries(categoryConfs)) {
    for (const query of conf.queries) {
      const body = {
        ...makeBody(query),
        languageCode: 'ja',
        regionCode: 'JP',
        pageSize: 20,
        minRating: filters.popular.minRating,
        ...(conf.includedType ? { includedType: conf.includedType } : {}),
      }
      let pageToken
      for (let page = 0; page < maxPages; page++) {
        const data = await searchText(pageToken ? { ...body, pageToken } : body)
        for (const p of data.places ?? []) if (keep(p)) addCandidate(p, category, area)
        pageToken = data.nextPageToken
        if (!pageToken) break
      }
    }
  }
}

// ① 繁華街はエリア名で検索する（人気店を拾いやすい）
for (const area of areas) {
  await runQueries(
    categories.areaSearch,
    (query) => ({
      textQuery: `${area.name} ${query}`,
      locationBias: { circle: { center: { latitude: area.lat, longitude: area.lng }, radius: area.radiusM } },
    }),
    area.maxPages ?? 3,
    area.id,
    (p) => distanceM(area, { lat: p.location.latitude, lng: p.location.longitude }) <= area.radiusM * 1.5,
  )
}
console.log(`エリア検索後の候補: ${candidates.size} 件（問い合わせ ${requestCount} 回）`)

// ② 府全体をマス目で検索して、エリア検索で拾えなかった場所を埋める
const cells = buildCells()
console.log(`検索するマス: ${cells.length} 個`)
for (const cell of cells) {
  await runQueries(categories.gridSearch, (query) => ({ textQuery: query, locationRestriction: { rectangle: cell.rect } }), cell.maxPages, cell.id)
}

// チェーン店を除外: 同じ店名が大阪に複数あるか、除外リストに入っている店
// 「一蘭 道頓堀店本館」→「一蘭」のように、最初の空白より前をブランド名とみなす
const brandOf = (name) => name.replace(/[（(].*?[)）]/g, '').trim().split(/[\s　]+/)[0]
const branchCount = new Map()
for (const c of candidates.values()) {
  const brand = brandOf(c.name)
  branchCount.set(brand, (branchCount.get(brand) ?? 0) + 1)
}
const isChain = (name) =>
  filters.chainNameDenylist.some((chain) => name.includes(chain)) ||
  (branchCount.get(brandOf(name)) ?? 0) >= filters.chainMinBranches

const fetchedAt = new Date().toISOString().slice(0, 10)
const picks = [...candidates.values()]
  .filter((c) => !isChain(c.name))
  .map(({ name: _name, ...rest }) => ({ ...rest, fetchedAt }))

await writeFile(new URL('../src/data/picks.json', import.meta.url), JSON.stringify(picks, null, 2) + '\n')

const count = (tier) => picks.filter((p) => p.tier === tier).length
console.log(`Google への問い合わせ: ${requestCount} 回`)
console.log(`ピックアップ: ${picks.length} 件（人気店 ${count('popular')} / 穴場 ${count('hidden')}）`)
