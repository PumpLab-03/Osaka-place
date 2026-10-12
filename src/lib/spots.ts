import picksJson from '../data/picks.json'
import editorialJson from '../data/editorial.json'
import type { Category, Editorial, Pick, Spot, UserSpot } from '../types'

const picks = picksJson as Pick[]
const editorial = editorialJson as Record<string, Editorial>

export function buildSpots(userSpots: UserSpot[]): Spot[] {
  const fromPicks: Spot[] = picks.map((pick) => ({
    key: `pick:${pick.placeId}`,
    lat: pick.lat,
    lng: pick.lng,
    categories: pick.categories,
    pick,
    editorial: editorial[pick.placeId],
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
