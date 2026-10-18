import { useMemo, useState } from 'react'
import { AdvancedMarker, APIProvider, Map, Pin } from '@vis.gl/react-google-maps'
import { AddSpotForm } from './components/AddSpotForm'
import { SpotCard } from './components/SpotCard'
import { WantList } from './components/WantList'
import { buildSpots, defaultCategory, pickRandom } from './lib/spots'
import { loadUserSpots, loadWantList, saveUserSpots, saveWantList } from './lib/storage'
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category, type Spot, type UserSpot } from './types'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) || 'ca3105992e28c5cf360fb94e'
const OSAKA_CENTER = { lat: 34.6851, lng: 135.5016 }

type Tab = Category | 'want'
type LatLng = google.maps.LatLngLiteral

function glyphOf(spot: Spot) {
  if (spot.userSpot) return '自'
  if (spot.pick?.tier === 'hidden') return '穴'
  return undefined
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => defaultCategory())
  const [userSpots, setUserSpots] = useState<UserSpot[]>(loadUserSpots)
  const [want, setWant] = useState<string[]>(loadWantList)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [addMode, setAddMode] = useState(false)
  const [addAt, setAddAt] = useState<LatLng | null>(null)
  const [bounds, setBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null)

  const spots = useMemo(() => buildSpots(userSpots), [userSpots])
  const visible = useMemo(
    () => (tab === 'want' ? spots.filter((s) => want.includes(s.key)) : spots.filter((s) => s.categories.includes(tab))),
    [spots, tab, want],
  )
  const selected = spots.find((s) => s.key === selectedKey) ?? null

  const changeTab = (next: Tab) => {
    setTab(next)
    setSelectedKey(null)
    setHighlighted([])
  }

  const toggleWant = (key: string) => {
    const next = want.includes(key) ? want.filter((k) => k !== key) : [...want, key]
    setWant(next)
    saveWantList(next)
  }

  const updateUserSpots = (next: UserSpot[]) => {
    setUserSpots(next)
    saveUserSpots(next)
  }

  const omakase = () => {
    const inView = bounds
      ? visible.filter(
          (s) => s.lat >= bounds.south && s.lat <= bounds.north && s.lng >= bounds.west && s.lng <= bounds.east,
        )
      : visible
    const chosen = pickRandom(inView, 3)
    setHighlighted(chosen.map((s) => s.key))
    setSelectedKey(chosen[0]?.key ?? null)
  }

  if (!API_KEY) {
    return (
      <div className="setup">
        <h1>今日どこ行く？大阪</h1>
        <p>
          地図を表示するには <code>.env</code> に <code>VITE_GOOGLE_MAPS_API_KEY</code> を設定してください。
          手順は README を見てください。
        </p>
      </div>
    )
  }

  return (
    <APIProvider apiKey={API_KEY} language="ja" region="JP">
      <div className="app">
        <header className="header">
          <h1>今日どこ行く？</h1>
          <nav className="tabs">
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
              <button
                key={c}
                className={tab === c ? 'tab active' : 'tab'}
                style={tab === c ? { background: CATEGORY_COLOR[c] } : undefined}
                onClick={() => changeTab(c)}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
            <button className={tab === 'want' ? 'tab active want' : 'tab'} onClick={() => changeTab('want')}>
              ♡ 行きたい
            </button>
          </nav>
        </header>

        <div className={addMode ? 'map adding' : 'map'}>
          <Map
            mapId={MAP_ID}
            defaultCenter={OSAKA_CENTER}
            defaultZoom={14}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            onBoundsChanged={(e) => setBounds(e.detail.bounds)}
            onClick={(e) => {
              if (addMode && e.detail.latLng) {
                setAddAt(e.detail.latLng)
                setAddMode(false)
              } else {
                setSelectedKey(null)
              }
            }}
          >
            {visible.map((spot) => {
              const color = CATEGORY_COLOR[tab === 'want' ? spot.categories[0] : tab]
              return (
                <AdvancedMarker
                  key={spot.key}
                  position={{ lat: spot.lat, lng: spot.lng }}
                  onClick={() => setSelectedKey(spot.key)}
                  zIndex={highlighted.includes(spot.key) ? 10 : 1}
                >
                  <Pin
                    background={color}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    glyph={glyphOf(spot)}
                    scale={highlighted.includes(spot.key) || spot.key === selectedKey ? 1.4 : 1}
                  />
                </AdvancedMarker>
              )
            })}
          </Map>
          {addMode && <div className="hint">ピンを置きたい場所をタップしてください</div>}
        </div>

        {tab === 'want' && !selected && (
          <WantList spots={visible} onSelect={setSelectedKey} />
        )}

        <div className="actions">
          {tab !== 'want' && (
            <button className="action primary" onClick={omakase} disabled={visible.length === 0}>
              おまかせで3つ選ぶ
            </button>
          )}
          <button className="action" onClick={() => setAddMode((v) => !v)}>
            {addMode ? 'やめる' : '＋ピンを追加'}
          </button>
        </div>

        {selected && (
          <SpotCard
            spot={selected}
            wanted={want.includes(selected.key)}
            onToggleWant={() => toggleWant(selected.key)}
            onClose={() => setSelectedKey(null)}
            onDelete={
              selected.userSpot
                ? () => {
                    updateUserSpots(userSpots.filter((s) => s.id !== selected.userSpot!.id))
                    setWant(want.filter((k) => k !== selected.key))
                    saveWantList(want.filter((k) => k !== selected.key))
                    setSelectedKey(null)
                  }
                : undefined
            }
          />
        )}

        {addAt && (
          <AddSpotForm
            defaultCategory={tab === 'want' ? defaultCategory() : tab}
            onCancel={() => setAddAt(null)}
            onSave={(input) => {
              const spot: UserSpot = {
                ...input,
                id: crypto.randomUUID(),
                lat: addAt.lat,
                lng: addAt.lng,
                createdAt: new Date().toISOString(),
              }
              updateUserSpots([...userSpots, spot])
              const key = `user:${spot.id}`
              setWant([...want, key])
              saveWantList([...want, key])
              setAddAt(null)
              setSelectedKey(key)
            }}
          />
        )}
      </div>
    </APIProvider>
  )
}
