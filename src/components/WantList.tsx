import { CATEGORY_LABEL, type Spot } from '../types'

interface Props {
  spots: Spot[]
  onSelect: (key: string) => void
}

export function WantList({ spots, onSelect }: Props) {
  if (spots.length === 0) {
    return (
      <section className="want-list empty">
        <p>まだ何もありません。ピンをタップして「♡ 行きたい」を押すと、ここに集まります。</p>
      </section>
    )
  }
  return (
    <section className="want-list">
      <ul>
        {spots.map((spot) => (
          <li key={spot.key}>
            <button onClick={() => onSelect(spot.key)}>
              <span className={`badge cat-${spot.categories[0]}`}>{CATEGORY_LABEL[spot.categories[0]]}</span>
              <span>{spot.editorial?.name ?? spot.userSpot?.name ?? 'おすすめのお店'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
