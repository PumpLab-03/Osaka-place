import { useEffect, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { googleMapsUrl } from '../lib/spots'
import { CATEGORY_LABEL, type Spot } from '../types'

interface Props {
  spot: Spot
  wanted: boolean
  onToggleWant: () => void
  onClose: () => void
  onDelete?: () => void
}

/**
 * 手書きの紹介がない自動ピックアップの店は、店名だけをタップ時に Google から取る。
 * （店名は保存できないため。Place Details の Pro 枠で、毎月の無料枠あり）
 */
function usePlaceName(placeId: string | undefined) {
  const places = useMapsLibrary('places')
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    setName(null)
    if (!places || !placeId) return
    let cancelled = false
    const place = new places.Place({ id: placeId, requestedLanguage: 'ja' })
    place
      .fetchFields({ fields: ['displayName'] })
      .then(() => {
        if (!cancelled) setName(place.displayName ?? null)
      })
      .catch(() => {
        if (!cancelled) setName(null)
      })
    return () => {
      cancelled = true
    }
  }, [places, placeId])

  return name
}

export function SpotCard({ spot, wanted, onToggleWant, onClose, onDelete }: Props) {
  const { pick, editorial, hotpepper, userSpot } = spot
  const fetchedName = usePlaceName(editorial || hotpepper || userSpot ? undefined : pick?.placeId)
  const name = editorial?.name ?? hotpepper?.name ?? userSpot?.name ?? fetchedName ?? '読み込み中…'

  return (
    <section className="card">
      <button className="close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <div className="badges">
        {spot.categories.map((c) => (
          <span key={c} className={`badge cat-${c}`}>
            {CATEGORY_LABEL[c]}
          </span>
        ))}
        {pick?.tier === 'popular' && <span className="badge">人気店</span>}
        {pick?.tier === 'hidden' && <span className="badge">穴場</span>}
        {editorial && <span className="badge accent">編集部おすすめ</span>}
        {editorial?.tiktok && <span className="badge accent">TikTokで話題</span>}
        {userSpot && <span className="badge">自分で追加</span>}
      </div>
      <h2>{name}</h2>

      {hotpepper && (
        <div className="hotpepper">
          {hotpepper.photo && (
            <a href={hotpepper.url} target="_blank" rel="noreferrer">
              <img src={hotpepper.photo} alt={hotpepper.name} loading="lazy" />
            </a>
          )}
          <div className="hp-info">
            {hotpepper.genre && <span className="badge">{hotpepper.genre}</span>}
            {hotpepper.budget && <p className="hp-budget">予算 {hotpepper.budgetAverage || hotpepper.budget}</p>}
            {hotpepper.catch && <p className="hp-catch">{hotpepper.catch}</p>}
          </div>
          {hotpepper.tags.length > 0 && (
            <div className="badges">
              {hotpepper.tags.map((t) => (
                <span key={t} className="badge">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {editorial?.comment && <p className="comment">{editorial.comment}</p>}
      {editorial?.menu && editorial.menu.length > 0 && (
        <div className="menu">
          <h3>おすすめメニュー</h3>
          <ul>
            {editorial.menu.map((m) => (
              <li key={m.name}>
                <span>{m.name}</span>
                {m.price && <span className="price">{m.price}</span>}
              </li>
            ))}
          </ul>
          {editorial.checkedAt && <p className="note">{editorial.checkedAt} 時点の情報です</p>}
        </div>
      )}
      {userSpot?.memo && <p className="comment">{userSpot.memo}</p>}

      <div className="card-actions">
        <button className={wanted ? 'want-btn on' : 'want-btn'} onClick={onToggleWant}>
          {wanted ? '♥ 行きたい' : '♡ 行きたい'}
        </button>
        <a className="link-btn" href={googleMapsUrl(spot)} target="_blank" rel="noreferrer">
          Googleマップで見る
        </a>
        {hotpepper?.url && (
          <a className="link-btn" href={hotpepper.url} target="_blank" rel="noreferrer">
            ホットペッパーで見る
          </a>
        )}
        {editorial?.officialUrl && (
          <a className="link-btn" href={editorial.officialUrl} target="_blank" rel="noreferrer">
            公式サイト
          </a>
        )}
        {userSpot?.url && (
          <a className="link-btn" href={userSpot.url} target="_blank" rel="noreferrer">
            保存したリンク
          </a>
        )}
        {onDelete && (
          <button className="delete-btn" onClick={onDelete}>
            削除
          </button>
        )}
      </div>
      {hotpepper && (
        <p className="credit">
          <a href="http://webservice.recruit.co.jp/" target="_blank" rel="noreferrer">
            Powered by ホットペッパーグルメ Webサービス
          </a>
        </p>
      )}
    </section>
  )
}
