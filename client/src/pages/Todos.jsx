import { useMemo, useState, useEffect } from 'react'
import { CheckCircle2, Circle, Plus, Trash2, Clock, Calendar, Hash, Filter, TrendingUp, ListChecks, Sun, Moon, ChevronDown, ChevronUp, Tag, Star, AlertCircle } from 'lucide-react'

const STORAGE_KEY = 'graedufy_simple_todos'
const COLOR_THEMES = ['primary', 'secondary', 'accent', 'success']

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
        priority: i.priority || 'medium',
        color: i.color || COLOR_THEMES[Math.floor(Math.random() * COLOR_THEMES.length)],
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
  const [filter, setFilter] = useState('all') // 'all', 'active', 'completed'
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  const remaining = useMemo(() => items.filter((i) => !i.done).length, [items])

  // Toggle dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  const updateItems = (updater) => {
    setItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveTodos(next)
      return next
    })
  }

  const filteredItems = useMemo(() => {
    let filtered = [...items]
    if (filter === 'active') filtered = filtered.filter(i => !i.done)
    if (filter === 'completed') filtered = filtered.filter(i => i.done)
    
    return filtered.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      }
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
  }, [items, filter])

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
        priority: 'medium',
        color: COLOR_THEMES[Math.floor(Math.random() * COLOR_THEMES.length)],
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

  const togglePriority = (id) => {
    updateItems((prev) => prev.map((i) => {
      if (i.id === id) {
        const priorities = ['low', 'medium', 'high']
        const currentIndex = priorities.indexOf(i.priority)
        const nextIndex = (currentIndex + 1) % priorities.length
        return { ...i, priority: priorities[nextIndex] }
      }
      return i
    }))
  }

  const completionPercentage = items.length > 0 
    ? Math.round((items.filter(i => i.done).length / items.length) * 100) 
    : 0

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'text-error'
      case 'medium': return 'text-warning'
      case 'low': return 'text-info'
      default: return 'text-base-content'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-100 via-base-100 to-base-200 dark:from-base-300 dark:via-base-300 dark:to-base-400 p-3 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 md:p-6 bg-base-100 dark:bg-base-300 rounded-2xl shadow-lg border border-base-200 dark:border-base-400">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="p-3 bg-gradient-to-br from-primary to-primary/80 rounded-xl shadow-md">
                <ListChecks className="text-white" size={28} />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-accent rounded-full flex items-center justify-center text-xs font-bold text-white">
                {items.length}
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Task Manager
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm text-base-content/70 dark:text-base-content/60">
                <div className="flex items-center gap-1">
                  <Clock size={14} />
                  <span>Private • Local storage</span>
                </div>
                <div className="hidden md:block text-base-content/30">•</div>
                <div className="flex items-center gap-1">
                  <TrendingUp size={14} />
                  <span>{completionPercentage}% progress</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl md:text-3xl font-bold text-primary">{remaining}</div>
              <div className="text-sm text-base-content/70 dark:text-base-content/60">tasks left</div>
            </div>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="btn btn-circle btn-ghost hover:bg-base-200 dark:hover:bg-base-400"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{items.length}</div>
                  <div className="text-sm opacity-70">Total</div>
                </div>
                <div className="p-2 rounded-lg bg-primary/10">
                  <ListChecks className="text-primary" size={20} />
                </div>
              </div>
            </div>
          </div>
          
          <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{remaining}</div>
                  <div className="text-sm opacity-70">Active</div>
                </div>
                <div className="p-2 rounded-lg bg-warning/10">
                  <AlertCircle className="text-warning" size={20} />
                </div>
              </div>
            </div>
          </div>
          
          <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{items.filter(i => i.done).length}</div>
                  <div className="text-sm opacity-70">Done</div>
                </div>
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="text-success" size={20} />
                </div>
              </div>
            </div>
          </div>
          
          <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-sm">
            <div className="card-body p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{completionPercentage}%</div>
                  <div className="text-sm opacity-70">Progress</div>
                </div>
                <div className="p-2 rounded-lg bg-accent/10">
                  <TrendingUp className="text-accent" size={20} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {items.length > 0 && (
          <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-md">
            <div className="card-body p-4 md:p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Task Progress</span>
                  <span className="text-primary font-bold">{completionPercentage}%</span>
                </div>
                <div className="h-3 bg-base-200 dark:bg-base-400 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-700 rounded-full"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm opacity-70">
                  <span>{items.filter(i => i.done).length} completed</span>
                  <span>{remaining} remaining</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Add & Filter Bar */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
          {/* Quick Add */}
          <div className="flex-1">
            <div className={`card border-2 transition-all duration-300 ${
              isFormFocused 
                ? 'border-primary shadow-lg shadow-primary/10' 
                : 'border-base-200 dark:border-base-400 shadow-sm'
            } bg-base-100 dark:bg-base-300`}>
              <div className="card-body p-4">
                <div className="flex gap-2">
                  <input
                    className="input input-bordered flex-1 focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-base-400 dark:border-base-500"
                    placeholder="✏️ Add a new task..."
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
                    className="btn btn-primary gap-2 shadow-md"
                    onClick={addItem} 
                    disabled={!form.title.trim()}
                  >
                    <Plus size={20} />
                    <span className="hidden md:inline">Add</span>
                  </button>
                </div>
                {form.title.trim() && (
                  <div className="mt-2 text-sm text-primary font-medium">
                    Press Enter or click Add to save
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="flex gap-2">
            <div className="join join-vertical md:join-horizontal">
              <button
                className={`btn join-item ${filter === 'all' ? 'btn-active' : 'btn-ghost'}`}
                onClick={() => setFilter('all')}
              >
                All ({items.length})
              </button>
              <button
                className={`btn join-item ${filter === 'active' ? 'btn-active' : 'btn-ghost'}`}
                onClick={() => setFilter('active')}
              >
                Active ({remaining})
              </button>
              <button
                className={`btn join-item ${filter === 'completed' ? 'btn-active' : 'btn-ghost'}`}
                onClick={() => setFilter('completed')}
              >
                Done ({items.filter(i => i.done).length})
              </button>
            </div>
          </div>
        </div>

        {/* Notes Input (Collapsible) */}
        {isFormFocused && (
          <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-sm animate-slideDown">
            <div className="card-body p-4">
              <div className="relative">
                <textarea
                  className="textarea textarea-bordered w-full focus:ring-2 focus:ring-primary/30 focus:border-primary dark:bg-base-400 dark:border-base-500 pt-8"
                  rows={3}
                  placeholder=" "
                  value={form.notes}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  }}
                />
                <label className="absolute top-3 left-4 text-sm text-base-content/60 pointer-events-none">
                  Add details or notes... (optional)
                </label>
                <div className="absolute top-3 right-4 text-xs opacity-50">
                  {form.notes.length}/500
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        <div className="card bg-base-100 dark:bg-base-300 border border-base-200 dark:border-base-400 shadow-lg">
          <div className="card-body p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">Your Tasks</h2>
                <div className="badge badge-primary badge-lg font-bold">
                  {filteredItems.length} {filter !== 'all' ? filter : ''}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {items.filter(i => i.done).length > 0 && (
                  <button 
                    onClick={clearCompleted}
                    className="btn btn-sm btn-error btn-outline gap-2"
                  >
                    <Trash2 size={16} />
                    Clear Completed
                  </button>
                )}
                <div className="dropdown dropdown-end">
                  <label tabIndex={0} className="btn btn-sm btn-ghost">
                    <Filter size={18} />
                    <span className="hidden md:inline">Sort</span>
                  </label>
                  <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 dark:bg-base-300 rounded-box w-52">
                    <li><a onClick={() => setFilter('all')}>All Tasks</a></li>
                    <li><a onClick={() => setFilter('active')}>Active First</a></li>
                    <li><a onClick={() => setFilter('completed')}>Completed First</a></li>
                  </ul>
                </div>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-10 md:py-16">
                <div className="p-4 rounded-full bg-base-200 dark:bg-base-400 inline-block mb-4 animate-bounce">
                  {filter === 'completed' ? (
                    <CheckCircle2 className="text-success" size={48} />
                  ) : (
                    <ListChecks className="text-base-content/40" size={48} />
                  )}
                </div>
                <h4 className="font-bold text-xl mb-2">
                  {filter === 'completed' ? 'No completed tasks' : 'No tasks yet'}
                </h4>
                <p className="text-base-content/70 dark:text-base-content/60 max-w-md mx-auto">
                  {filter === 'completed' 
                    ? 'Complete some tasks to see them here' 
                    : 'Add your first task above to get started'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`group relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                      item.done 
                        ? 'border-base-200 dark:border-base-400 bg-base-50 dark:bg-base-400/30' 
                        : `border-l-4 border-l-${item.color} border-base-300 dark:border-base-500 bg-base-100 dark:bg-base-300 hover:shadow-lg`
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3 md:gap-4">
                        {/* Toggle Button */}
                        <button
                          className={`btn btn-circle transition-all duration-300 transform hover:scale-110 ${
                            item.done 
                              ? 'btn-success bg-success/20 border-success/30' 
                              : 'btn-ghost border-2 border-base-300 dark:border-base-500 hover:border-primary'
                          }`}
                          aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                          onClick={() => toggleItem(item.id)}
                        >
                          {item.done ? (
                            <CheckCircle2 size={22} />
                          ) : (
                            <Circle size={22} />
                          )}
                        </button>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                            <div className={`font-semibold text-lg truncate ${
                              item.done ? 'line-through opacity-60' : ''
                            }`}>
                              {item.title}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => togglePriority(item.id)}
                                className={`btn btn-xs gap-1 ${getPriorityColor(item.priority)}`}
                              >
                                <Star size={12} fill="currentColor" />
                                {item.priority}
                              </button>
                              
                              {item.done && (
                                <span className="badge badge-success badge-sm">Completed</span>
                              )}
                            </div>
                          </div>
                          
                          {/* Notes (Expandable) */}
                          {item.notes && (
                            <div className="mt-2">
                              <button
                                onClick={() => setExpandedTaskId(expandedTaskId === item.id ? null : item.id)}
                                className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 mb-2"
                              >
                                {expandedTaskId === item.id ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                                Notes
                              </button>
                              
                              {(expandedTaskId === item.id || !isMobile()) && (
                                <p className="text-base-content/70 dark:text-base-content/60 whitespace-pre-wrap bg-base-200 dark:bg-base-400/50 rounded-lg p-3 text-sm leading-relaxed animate-fadeIn">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          )}
                          
                          {/* Meta Info */}
                          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-base-200 dark:border-base-400">
                            <div className="text-xs flex items-center gap-1 opacity-70">
                              <Calendar size={12} />
                              {formatDate(item.createdAt)}
                            </div>
                            <div className="text-xs flex items-center gap-1 opacity-70">
                              <Tag size={12} />
                              <div className={`badge badge-xs badge-${item.color}`} />
                            </div>
                            <div className="text-xs flex items-center gap-1 opacity-70">
                              <Hash size={12} />
                              {item.id.substring(0, 6)}
                            </div>
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            className="btn btn-sm btn-circle btn-ghost text-error hover:bg-error/10 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all"
                            aria-label="Delete task"
                            onClick={() => {
                              if (window.confirm('Are you sure you want to delete this task?')) {
                                deleteItem(item.id)
                              }
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Line */}
                    {item.done && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-success to-success/50 rounded-b-xl" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {filteredItems.length > 0 && (
              <div className="mt-6 pt-4 border-t border-base-200 dark:border-base-400">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-success" />
                    <span>{items.filter(i => i.done).length} completed tasks</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-primary font-medium">
                      {remaining} task{remaining !== 1 ? 's' : ''} remaining
                    </div>
                    <div className="text-base-content/70">
                      Showing {filteredItems.length} of {items.length}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <div className="text-sm text-base-content/50 dark:text-base-content/60 mb-2">
            <p className="flex flex-wrap items-center justify-center gap-2">
              <span>🔒 Your data is stored locally in your browser</span>
              <span className="hidden md:inline">•</span>
              <span>📱 Fully responsive design</span>
              <span className="hidden md:inline">•</span>
              <span>🔄 Auto-saves every change</span>
            </p>
          </div>
          <div className="text-xs opacity-50">
            Made with ❤️ • {new Date().getFullYear()}
          </div>
        </div>
      </div>

      {/* Mobile Add Button */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <button
          onClick={addItem}
          disabled={!form.title.trim()}
          className="btn btn-primary btn-circle shadow-xl w-14 h-14 text-white"
          aria-label="Add task"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Mobile Swipe Instructions */}
      <div className="md:hidden text-center text-xs opacity-60 pt-4">
        <p>💡 Swipe left on tasks to see delete option</p>
      </div>
    </div>
  )
}

// Helper function to detect mobile
function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth < 768
}