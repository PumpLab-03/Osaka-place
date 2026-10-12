import type { UserSpot } from '../types'

const WANT_KEY = 'osaka-place:want'
const USER_SPOTS_KEY = 'osaka-place:user-spots'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できない環境（プライベートモード等）では、その場限りで動かす
  }
}

export const loadWantList = () => load<string[]>(WANT_KEY, [])
export const saveWantList = (keys: string[]) => save(WANT_KEY, keys)
export const loadUserSpots = () => load<UserSpot[]>(USER_SPOTS_KEY, [])
export const saveUserSpots = (spots: UserSpot[]) => save(USER_SPOTS_KEY, spots)
