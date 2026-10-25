// 毎月1回実行して、ごはん屋さんのピックアップをホットペッパーのお店と紐づけ、
// ジャンル・予算・雰囲気（個室・飲み放題など）・写真を src/data/hotpepper.json に書き出す。
//
// 紐づけには店名が必要なので、Google から店名だけを取る（Place Details の Pro 枠、毎月の無料枠あり）。
// 店名は紐づけに使うだけで保存しない。一度紐づいたお店は次回からホットペッパーの ID で情報だけ取り直すので、
// Google への問い合わせは新しく増えたお店と、見つからなかったお店の再挑戦（90日ごと）だけになる。
//
// 使い方: .env に GOOGLE_PLACES_API_KEY と HOTPEPPER_API_KEY を入れて `npm run match-hotpepper`

import { readFile, writeFile } from 'node:fs/promises'

const googleKey = process.env.GOOGLE_PLACES_API_KEY
const hotpepperKey = process.env.HOTPEPPER_API_KEY
if (!googleKey || !hotpepperKey) {
  console.error('GOOGLE_PLACES_API_KEY と HOTPEPPER_API_KEY を設定してください（.env を確認してください）')
  process.exit(1)
}

const HOTPEPPER_URL = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/'
const RETRY_UNMATCHED_DAYS = 90
const MAX_DISTANCE_M = 200
const MIN_SIMILARITY = 0.55

// ホットペッパーの予算コード → 上限（円）
const BUDGET_MAX = {
  B009: 500, B010: 1000, B011: 1500, B001: 2000, B002: 3000, B003: 4000, B008: 5000,
  B004: 7000, B005: 10000, B006: 15000, B012: 20000, B013: 30000, B014: 99999,
}

const picksUrl = new URL('../src/data/picks.json', import.meta.url)
const outUrl = new URL('../src/data/hotpepper.json', import.meta.url)
const picks = JSON.parse(await readFile(picksUrl, 'utf8'))
let previous = { matched: {}, unmatched: {} }
try {
  previous = JSON.parse(await readFile(outUrl, 'utf8'))
} catch {
  // 初回
}
const today = new Date().toISOString().slice(0, 10)

let googleRequests = 0
let hotpepperRequests = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function hotpepper(params) {
  const url = new URL(HOTPEPPER_URL)
  url.search = new URLSearchParams({ key: hotpepperKey, format: 'json', ...params }).toString()
  for (let attempt = 0; ; attempt++) {
    hotpepperRequests++
    await sleep(200)
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      if (data.results.error) throw new Error(`HotPepper: ${JSON.stringify(data.results.error)}`)
      return data.results.shop ?? []
    }
    if (attempt >= 3) throw new Error(`HotPepper ${res.status}: ${await res.text()}`)
    await sleep(2000 * (attempt + 1))
  }
}

async function googleName(placeId) {
  googleRequests++
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ja`, {
    headers: { 'X-Goog-Api-Key': googleKey, 'X-Goog-FieldMask': 'displayName' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`)
  return (await res.json()).displayName?.text ?? null
}

function distanceM(a, b) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371000
}

function normalize(name) {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・･\-‐ー－_'’"“”「」『』()（）［］[\]【】〈〉<>!！?？.,、。&＆/]/g, '')
}

function bigrams(s) {
  const out = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

/** 店名の似ている度合い（0〜1）。片方がもう片方を含んでいれば高めにする */
function similarity(a, b) {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length >= 3 && long.includes(short)) return 0.9
  const bx = bigrams(x)
  const by = bigrams(y)
  if (!bx.length || !by.length) return 0
  const pool = [...by]
  let hit = 0
  for (const g of bx) {
    const i = pool.indexOf(g)
    if (i >= 0) {
      hit++
      pool.splice(i, 1)
    }
  }
  return (2 * hit) / (bx.length + by.length)
}

const yes = (v) => typeof v === 'string' && v.startsWith('あり')

function tagsOf(shop) {
  const tags = []
  if (yes(shop.private_room)) tags.push('個室')
  if (yes(shop.free_drink)) tags.push('飲み放題')
  if (yes(shop.free_food)) tags.push('食べ放題')
  if (yes(shop.tatami) || yes(shop.horigotatsu)) tags.push('座敷')
  if (typeof shop.charter === 'string' && shop.charter.startsWith('貸切可')) tags.push('貸切OK')
  if (typeof shop.non_smoking === 'string' && shop.non_smoking.includes('全面禁煙')) tags.push('禁煙')
  if (shop.midnight === '営業している') tags.push('深夜営業')
  if (typeof shop.child === 'string' && /歓迎|OK|可/.test(shop.child) && !/お断り|不可/.test(shop.child)) tags.push('子連れOK')
  if (yes(shop.lunch)) tags.push('ランチあり')
  return tags
}

function infoOf(shop) {
  return {
    id: shop.id,
    name: shop.name,
    genre: shop.genre?.name ?? '',
    catch: shop.genre?.catch || shop.catch || '',
    budget: shop.budget?.name ?? '',
    budgetAverage: shop.budget?.average ?? '',
    budgetMax: BUDGET_MAX[shop.budget?.code] ?? null,
    tags: tagsOf(shop),
    photo: shop.photo?.pc?.l ?? '',
    url: shop.urls?.pc ?? '',
  }
}

function bestMatch(name, pick, shops) {
  let best = null
  let bestScore = 0
  for (const shop of shops) {
    const d = distanceM(pick, { lat: Number(shop.lat), lng: Number(shop.lng) })
    if (d > MAX_DISTANCE_M) continue
    const score = similarity(name, shop.name)
    if (score > bestScore) {
      best = shop
      bestScore = score
    }
  }
  return bestScore >= MIN_SIMILARITY ? best : null
}

async function findShop(name, pick) {
  const token = name.normalize('NFKC').split(/\s+/).filter(Boolean)
  const keyword = token.find((t) => t.length >= 2) ?? name
  const near = { lat: pick.lat, lng: pick.lng }
  const withKeyword = await hotpepper({ ...near, range: 2, keyword, count: 50 })
  return bestMatch(name, pick, withKeyword) ?? bestMatch(name, pick, await hotpepper({ ...near, range: 1, count: 100 }))
}

const foodPicks = picks.filter((p) => p.categories.includes('lunch') || p.categories.includes('dinner'))
const matched = {}
const unmatched = {}

// 1) 前回紐づいたお店は、ホットペッパーの ID でまとめて最新情報を取り直す（20件ずつ）
const known = foodPicks.filter((p) => previous.matched[p.placeId])
for (let i = 0; i < known.length; i += 20) {
  const chunk = known.slice(i, i + 20)
  const shops = await hotpepper({ id: chunk.map((p) => previous.matched[p.placeId].id).join(','), count: 20 })
  const byId = new Map(shops.map((s) => [s.id, s]))
  for (const p of chunk) {
    const shop = byId.get(previous.matched[p.placeId].id)
    if (shop) matched[p.placeId] = infoOf(shop)
    // 掲載が終わったお店は次回また探し直す
  }
}

// 2) まだ紐づいていないお店を探す（見つからなかったお店は90日ごとに再挑戦）
const cutoff = new Date(Date.now() - RETRY_UNMATCHED_DAYS * 86400000).toISOString().slice(0, 10)
for (const p of foodPicks) {
  if (matched[p.placeId]) continue
  const lastTried = previous.unmatched[p.placeId]
  if (lastTried && lastTried > cutoff) {
    unmatched[p.placeId] = lastTried
    continue
  }
  const name = await googleName(p.placeId)
  const shop = name ? await findShop(name, p) : null
  if (shop) matched[p.placeId] = infoOf(shop)
  else unmatched[p.placeId] = today
}

await writeFile(outUrl, JSON.stringify({ matched, unmatched }, null, 1) + '\n')
console.log(
  `ごはん屋さん ${foodPicks.length} 件中 ${Object.keys(matched).length} 件をホットペッパーと紐づけ` +
    `（Google 店名 ${googleRequests} 回、ホットペッパー ${hotpepperRequests} 回）`,
)
