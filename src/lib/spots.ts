import picksJson from '../data/picks.json'
import editorialJson from '../data/editorial.json'
import hotpepperJson from '../data/hotpepper.json'
import type { Category, Editorial, HotPepperInfo, Pick, Spot, UserSpot } from '../types'

const picks = picksJson as Pick[]
const editorial = editorialJson as Record<string, Editorial>
const hotpepper = (hotpepperJson as { matched: Record<string, HotPepperInfo> }).matched

export function buildSpots(userSpots: UserSpot[]): Spot[] {
  const fromPicks: Spot[] = picks.map((pick) => ({
    key: `pick:${pick.placeId}`,
    lat: pick.lat,
    lng: pick.lng,
    categories: pick.categories,
    pick,
    editorial: editorial[pick.placeId],
    hotpepper: hotpepper[pick.placeId],
  }))
  const fromUser: Spot[] = userSpots.map((userSpot) => ({
    key: `user:${userSpot.id}`,
    lat: userSpot.lat,
    lng: userSpot.lng,
    categories: [userSpot.category],
    userSpot,
  }))
  return [...fromPicks, ...fromUser]
}

/** 昼（5時〜15時）なら昼ごはん、それ以外は夜ごはんから始める */
export function defaultCategory(now = new Date()): Category {
  const hour = now.getHours()
  return hour >= 5 && hour < 15 ? 'lunch' : 'dinner'
}

/** Google マップアプリで開くリンク（API の呼び出しは発生しない） */
export function googleMapsUrl(spot: Spot): string {
  if (spot.pick) {
    return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}&query_place_id=${spot.pick.placeId}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export interface Filters {
  genre: string
  /** 予算の上限（円）。0 なら指定なし */
  budgetMax: number
  tags: string[]
}

export const EMPTY_FILTERS: Filters = { genre: '', budgetMax: 0, tags: [] }

export const BUDGET_OPTIONS = [
  { value: 1000, label: '〜1,000円' },
  { value: 2000, label: '〜2,000円' },
  { value: 3000, label: '〜3,000円' },
  { value: 5000, label: '〜5,000円' },
  { value: 10000, label: '〜10,000円' },
]

export const TAG_OPTIONS = ['個室', '飲み放題', '食べ放題', '座敷', '貸切OK', '禁煙', '深夜営業', '子連れOK']

export function hasFilters(f: Filters) {
  return f.genre !== '' || f.budgetMax > 0 || f.tags.length > 0
}

/** 絞り込みはホットペッパーの情報があるお店だけが対象 */
export function matchesFilters(spot: Spot, f: Filters) {
  if (!hasFilters(f)) return true
  const hp = spot.hotpepper
  if (!hp) return false
  if (f.genre && hp.genre !== f.genre) return false
  if (f.budgetMax > 0 && (hp.budgetMax === null || hp.budgetMax > f.budgetMax)) return false
  return f.tags.every((t) => hp.tags.includes(t))
}

/** データに出てくるジャンルを多い順に */
export function genresOf(spots: Spot[]) {
  const count = new Map<string, number>()
  for (const s of spots) if (s.hotpepper?.genre) count.set(s.hotpepper.genre, (count.get(s.hotpepper.genre) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
}
