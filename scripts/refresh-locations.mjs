// 月2回実行して、src/data/picks.json の各お店の位置だけを Google から取り直す。
// Google の規約で位置情報は30日以内に更新する必要があるため。
// 位置（location）だけの取得は Place Details の Essentials 枠で、毎月の無料枠に収まる想定。
// 閉店などで取得できなくなったお店はリストから外す。
//
// 使い方: .env に GOOGLE_PLACES_API_KEY を入れて `npm run refresh-locations`

import { readFile, writeFile } from 'node:fs/promises'

const apiKey = process.env.GOOGLE_PLACES_API_KEY
if (!apiKey) {
  console.error('GOOGLE_PLACES_API_KEY が設定されていません（.env を確認してください）')
  process.exit(1)
}

const picksUrl = new URL('../src/data/picks.json', import.meta.url)
const picks = JSON.parse(await readFile(picksUrl, 'utf8'))
const fetchedAt = new Date().toISOString().slice(0, 10)

async function fetchLocation(placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'location' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.location ? { lat: data.location.latitude, lng: data.location.longitude } : null
}

const refreshed = []
let removed = 0
for (const pick of picks) {
  const loc = await fetchLocation(pick.placeId)
  if (!loc) {
    removed++
    continue
  }
  refreshed.push({ ...pick, ...loc, fetchedAt })
}

await writeFile(picksUrl, JSON.stringify(refreshed, null, 2) + '\n')
console.log(`位置を更新: ${refreshed.length} 件（取得できず外した店: ${removed} 件）`)
