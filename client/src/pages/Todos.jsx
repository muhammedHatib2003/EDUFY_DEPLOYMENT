import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Plus, Trash2, Clock, Calendar, Hash } from 'lucide-react'

const STORAGE_KEY = 'graedufy_simple_todos'

const makeId = () => {
  const g = typeof crypto !== 'undefined' ? crypto : undefined
  if (g?.randomUUID) return g.randomUUID()
  return `${Date.now()}-${Math.random()}`
}

function loadTodos() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((i) => i && typeof i === 'object' && i.title)
      .map((i) => ({
        ...i,
        id: i.id || makeId(),
        done: !!i.done,
        createdAt: i.createdAt || Date.now(),
      }))
  } catch {
    return []
  }
}

function saveTodos(items) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

function formatDate(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Todos() {
  const [items, setItems] = useState(loadTodos)
  const [form, setForm] = useState({ title: '', notes: '' })
  const [isFormFocused, setIsFormFocused] = useState(false)
  const remaining = useMemo(() => items.filter((i) => !i.done).length, [items])

  const updateItems = (updater) => {
    setItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveTodos(next)
      return next
    })
  }

  const sortedItems = useMemo(() => {
    const next = [...items]
    next.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
    return next
  }, [items])

  const addItem = () => {
    const title = form.title.trim()
    if (!title) return
    updateItems((prev) => [
      {
        id: makeId(),
        title,
        notes: form.notes.trim(),
        done: false,
        createdAt: Date.now(),
      },
      ...prev,
    ])
    setForm({ title: '', notes: '' })
    setIsFormFocused(false)
  }

  const toggleItem = (id) => {
    updateItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }

  const deleteItem = (id) => {
    updateItems((prev) => prev.filter((i) => i.id !== id))
  }

  const clearCompleted = () => {
    updateItems((prev) => prev.filter((i) => !i.done))
  }

  const completionPercentage = items.length > 0 
    ? Math.round((items.filter(i => i.done).length / items.length) * 100) 
    : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CheckCircle2 className="text-primary" size={24} />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">To-do List</h1>
            <p className="text-sm text-base-content/70 flex items-center gap-2">
              <Clock size={14} />
              Private • Local storage • {items.length} total tasks
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-primary">{remaining}</div>
          <div className="text-sm text-base-content/70">remaining</div>
        </div>
      </div>

      {/* Progress Bar */}
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-base-content/70">Progress</span>
            <span className="font-medium">{completionPercentage}% complete</span>
          </div>
          <div className="h-2 bg-base-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Task Card - Compact Layout */}
      <div className={`card border-2 ${isFormFocused ? 'border-primary/30' : 'border-base-200'} bg-base-100 shadow-md transition-all`}>
        <div className="card-body p-4 space-y-4">
          <div className="space-y-3">
            {/* Main Input Row */}
            <div className="flex gap-2">
              <input
                className="input input-bordered flex-1 focus:ring-1 focus:ring-primary/20 focus:border-primary"
                placeholder="What needs to be done?"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                onFocus={() => setIsFormFocused(true)}
                onBlur={() => setIsFormFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && form.title.trim()) {
                    e.preventDefault()
                    addItem()
                  }
                }}
              />
              <button 
                className="btn btn-primary gap-2"
                onClick={addItem} 
                disabled={!form.title.trim()}
              >
                <Plus size={18} />
                Add
              </button>
            </div>
            
            {/* Notes Input */}
            <div className="relative">
              <textarea
                className="textarea textarea-bordered w-full focus:ring-1 focus:ring-primary/20 focus:border-primary pt-8"
                rows={2}
                placeholder=" "
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <label className="absolute top-2 left-4 text-xs text-base-content/60 pointer-events-none transition-all">
                Add details, notes, or context... (optional)
              </label>
              {form.notes && (
                <div className="absolute top-2 right-4 text-xs text-base-content/40">
                  {form.notes.length}/500
                </div>
              )}
            </div>
          </div>
          
          {/* Helper Text */}
          <div className="text-xs text-base-content/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Press Enter to save</span>
              <span className="text-base-content/30">•</span>
              <span>{form.title.trim() ? 'Ready to add' : 'Enter a title'}</span>
            </div>
            {form.title.trim() && (
              <div className="text-primary font-medium">
                {remaining + 1} task{remaining + 1 !== 1 ? 's' : ''} total
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="card border border-base-200 bg-base-100 shadow-lg">
        <div className="card-body p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">Your Tasks</h3>
              <div className="badge badge-primary badge-lg">
                {items.length} total
              </div>
            </div>
            
            {items.filter(i => i.done).length > 0 && (
              <button 
                onClick={clearCompleted}
                className="btn btn-sm btn-ghost text-error hover:text-error hover:bg-error/10"
              >
                <Trash2 size={16} />
                Clear Completed
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-center py-10">
              <div className="p-4 rounded-full bg-base-200 inline-block mb-4">
                <CheckCircle2 className="text-base-content/40" size={32} />
              </div>
              <h4 className="font-medium text-lg mb-2">No tasks yet</h4>
              <p className="text-base-content/70">
                Add your first task above to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className={`group flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 ${
                    item.done 
                      ? 'border-base-200 bg-base-50' 
                      : 'border-base-300 bg-base-100 hover:border-primary/50 hover:shadow-md'
                  }`}
                >
                  <button
                    className={`btn btn-sm btn-circle transition-all ${
                      item.done 
                        ? 'btn-success bg-success/20 text-success border-success/20' 
                        : 'btn-ghost border-2 border-base-300 hover:border-primary hover:bg-primary/10'
                    }`}
                    aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                    onClick={() => toggleItem(item.id)}
                  >
                    {item.done ? (
                      <CheckCircle2 size={20} />
                    ) : (
                      <Circle size={20} />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`font-semibold text-base truncate ${
                        item.done ? 'line-through text-base-content/60' : ''
                      }`}>
                        {item.title}
                      </div>
                      {item.done && (
                        <span className="badge badge-sm badge-success opacity-80">Done</span>
                      )}
                    </div>
                    
                    {item.notes && (
                      <p className="text-sm text-base-content/70 whitespace-pre-wrap leading-relaxed">
                        {item.notes}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs text-base-content/50 flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(item.createdAt)}
                      </div>
                      <div className="text-xs text-base-content/50 flex items-center gap-1">
                        <Hash size={12} />
                        {item.id.substring(0, 8)}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    className="btn btn-sm btn-circle btn-ghost text-base-content/40 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Delete task"
                    onClick={() => deleteItem(item.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {items.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-base-200 text-sm text-base-content/70">
              <div>
                {remaining} of {items.length} tasks remaining
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-success" />
                {items.filter(i => i.done).length} completed
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-sm text-base-content/50 py-4">
        <p>All tasks are stored locally in your browser • Data persists between sessions</p>
      </div>
    </div>
  )
}