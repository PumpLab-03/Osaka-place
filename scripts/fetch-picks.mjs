// 週1回実行して、人気店・穴場のピックアップを src/data/picks.json に書き出す。
//
// Google Maps Platform の規約に合わせて、保存するのは place ID と位置情報（30日以内に更新）だけ。
// 店名・星・口コミ数は選ぶ判定にだけ使い、ファイルには残さない。
//
// 使い方: .env に GOOGLE_PLACES_API_KEY を入れて `npm run fetch-picks`

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
const MAX_PAGES = 3

const apiKey = process.env.GOOGLE_PLACES_API_KEY
if (!apiKey) {
  console.error('GOOGLE_PLACES_API_KEY が設定されていません（.env を確認してください）')
  process.exit(1)
}

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const areas = await readJson('../config/areas.json')
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

function distanceM(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function tierOf(place) {
  const rating = place.rating ?? 0
  const reviews = place.userRatingCount ?? 0
  const { popular, hidden } = filters
  if (rating >= popular.minRating && reviews >= popular.minReviews) return 'popular'
  if (rating >= hidden.minRating && reviews >= hidden.minReviews && reviews <= hidden.maxReviews) return 'hidden'
  return null
}

const isFoodPlace = (types) => types.some((t) => t === 'restaurant' || t === 'food' || t.endsWith('_restaurant'))

// 判定用の一時データ（店名はここだけで使い、書き出さない）
const candidates = new Map()

for (const area of areas) {
  for (const [category, conf] of Object.entries(categories)) {
    for (const query of conf.queries) {
      const body = {
        textQuery: `${area.name} ${query}`,
        languageCode: 'ja',
        regionCode: 'JP',
        pageSize: 20,
        minRating: filters.popular.minRating,
        locationBias: {
          circle: { center: { latitude: area.lat, longitude: area.lng }, radius: area.radiusM },
        },
        ...(conf.includedType ? { includedType: conf.includedType } : {}),
      }
      let pageToken
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await searchText(pageToken ? { ...body, pageToken } : body)
        for (const p of data.places ?? []) {
          if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
          const types = p.types ?? []
          if (types.some((t) => filters.excludeTypes.includes(t))) continue
          if (category === 'play' && isFoodPlace(types)) continue
          const loc = { lat: p.location.latitude, lng: p.location.longitude }
          if (distanceM(area, loc) > area.radiusM * 1.5) continue
          const tier = tierOf(p)
          if (!tier) continue

          const existing = candidates.get(p.id)
          if (existing) {
            if (!existing.categories.includes(category)) existing.categories.push(category)
            continue
          }
          candidates.set(p.id, {
            placeId: p.id,
            name: p.displayName?.text ?? '',
            lat: loc.lat,
            lng: loc.lng,
            area: area.id,
            categories: [category],
            tier,
          })
        }
        pageToken = data.nextPageToken
        if (!pageToken) break
      }
    }
  }
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
