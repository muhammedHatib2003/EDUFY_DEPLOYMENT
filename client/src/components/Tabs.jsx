export default function Tabs({ tabs = [], active, onChange }) {
  return (
    <div className="tabs tabs-boxed mb-3">
      {tabs.map((t) => (
        <a key={t.key} className={`tab ${active === t.key ? 'tab-active' : ''}`} onClick={() => onChange?.(t.key)}>
          {t.label}
        </a>
      ))}
    </div>
  )
}

