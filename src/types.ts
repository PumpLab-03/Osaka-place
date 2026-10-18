export type Category = 'lunch' | 'dinner' | 'play'

export const CATEGORY_LABEL: Record<Category, string> = {
  lunch: '昼ごはん',
  dinner: '夜ごはん',
  play: '遊び',
}

export const CATEGORY_COLOR: Record<Category, string> = {
  lunch: '#f4b400',
  dinner: '#3949ab',
  play: '#e91e63',
}

/** 自動ピックアップ（scripts/discover-picks.mjs が書き出し、refresh-locations.mjs が位置を更新する） */
export interface Pick {
  placeId: string
  lat: number
  lng: number
  area: string
  categories: Category[]
  tier: 'popular' | 'hidden'
  fetchedAt: string
}

/** 手書きの紹介（src/data/editorial.json に place ID をキーにして書く） */
export interface Editorial {
  name: string
  comment?: string
  menu?: { name: string; price?: string }[]
  checkedAt?: string
  officialUrl?: string
  tiktok?: boolean
}

/** ユーザーが自分で追加したピン */
export interface UserSpot {
  id: string
  name: string
  lat: number
  lng: number
  category: Category
  memo?: string
  url?: string
  createdAt: string
}

export interface Spot {
  key: string
  lat: number
  lng: number
  categories: Category[]
  pick?: Pick
  editorial?: Editorial
  userSpot?: UserSpot
}
