import { useState } from 'react'
import { BUDGET_OPTIONS, EMPTY_FILTERS, hasFilters, TAG_OPTIONS, type Filters } from '../lib/spots'

interface Props {
  filters: Filters
  genres: string[]
  resultCount: number
  onChange: (next: Filters) => void
}

export function FilterBar({ filters, genres, resultCount, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const active = hasFilters(filters)

  const toggleTag = (tag: string) =>
    onChange({
      ...filters,
      tags: filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag],
    })

  return (
    <div className="filters">
      <div className="filters-row">
        <button className={active ? 'filter-toggle on' : 'filter-toggle'} onClick={() => setOpen((v) => !v)}>
          絞り込み{active ? `（${resultCount}件）` : ''} {open ? '▲' : '▼'}
        </button>
        {active && (
          <button className="filter-clear" onClick={() => onChange(EMPTY_FILTERS)}>
            クリア
          </button>
        )}
      </div>
      {open && (
        <div className="filters-panel">
          <div className="filters-selects">
            <select value={filters.genre} onChange={(e) => onChange({ ...filters, genre: e.target.value })}>
              <option value="">ジャンル：すべて</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={filters.budgetMax}
              onChange={(e) => onChange({ ...filters, budgetMax: Number(e.target.value) })}
            >
              <option value={0}>予算：指定なし</option>
              {BUDGET_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="chips">
            {TAG_OPTIONS.map((t) => (
              <button
                key={t}
                className={filters.tags.includes(t) ? 'chip on' : 'chip'}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="note">ホットペッパーに載っているお店だけが対象です</p>
        </div>
      )}
    </div>
  )
}
