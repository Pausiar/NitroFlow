import React from 'react'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'

interface Props {
  children: React.ReactNode
}

export function Layout({ children }: Props) {
  return (
    <div className="flex flex-col h-screen bg-fluent-bg text-fluent-text overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
