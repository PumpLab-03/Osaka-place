import { useState, type FormEvent } from 'react'
import { CATEGORY_LABEL, type Category, type UserSpot } from '../types'

interface Props {
  defaultCategory: Category
  onSave: (input: Pick<UserSpot, 'name' | 'category' | 'memo' | 'url'>) => void
  onCancel: () => void
}

export function AddSpotForm({ defaultCategory, onSave, onCancel }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>(defaultCategory)
  const [memo, setMemo] = useState('')
  const [url, setUrl] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      category,
      memo: memo.trim() || undefined,
      url: url.trim() || undefined,
    })
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>行きたい場所を追加</h2>
        <label>
          名前
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：気になってるカフェ" required autoFocus />
        </label>
        <label>
          種類
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          メモ
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="誰と行きたい、何を食べたい など" />
        </label>
        <label>
          URL（インスタやお店のページ）
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            やめる
          </button>
          <button type="submit" className="primary">
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
