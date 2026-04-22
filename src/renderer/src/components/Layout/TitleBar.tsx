import { BrandLogo } from './BrandLogo'

export function TitleBar() {
  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => window.electronAPI?.maximize()
  const handleClose = () => window.electronAPI?.close()

  return (
    <div className="titlebar-drag flex items-center justify-between h-10 bg-fluent-bg border-b border-fluent-border px-4 flex-shrink-0 select-none">
      <div className="flex items-center gap-2">
        <BrandLogo size={20} />
        <span className="text-xs text-fluent-textMuted ml-1">v1.0.0</span>
      </div>

      <div className="titlebar-no-drag flex items-center gap-1">
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-fluent-surface transition-colors"
          aria-label="Minimizar"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-fluent-surface transition-colors"
          aria-label="Maximizar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-600 transition-colors"
          aria-label="Cerrar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  )
}
