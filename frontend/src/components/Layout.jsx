/**
 * Layout — top navigation + sidebar + main workspace area.
 *
 * Clean, distraction-free enterprise layout with no dummy filler tags.
 */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Clock, ShieldAlert, GitCompare, BrainCircuit,
  Network, MessageCircle, Database, Sparkles
} from 'lucide-react';
import JudgeTourModal from './JudgeTourModal';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/timeline', label: 'Timeline', icon: Clock },
  { to: '/compare', label: 'Pre-Flight Risk Gate', icon: ShieldAlert },
  { to: '/patterns', label: 'Patterns', icon: BrainCircuit },
  { to: '/graph', label: 'Service Graph', icon: Network },
  { to: '/ask', label: 'Ask Agent', icon: MessageCircle },
];

export default function Layout({ children }) {
  const [showTour, setShowTour] = useState(false);
  const location = useLocation();

  const currentNav = NAV_ITEMS.find(n => n.to === location.pathname) || NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-dark-950 text-gray-100 overflow-x-hidden w-full max-w-full">
      {/* Hackathon Judge Guided Tour Modal */}
      <JudgeTourModal isOpen={showTour} onClose={() => setShowTour(false)} />

      {/* ---- Sidebar ---- */}
      <aside className="w-60 flex-shrink-0 bg-[#0b0f19] border-r border-slate-800/80 flex flex-col sticky top-0 h-screen z-30">
        {/* Brand Header */}
        <div className="px-4 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-tight">PipelineMemory</span>
              <p className="text-[10px] text-slate-400 font-mono">DevOps Risk Intelligence</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2.5 mb-1.5 font-mono">
            Workspace
          </div>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Reviewer Tour CTA */}
        <div className="p-3 border-t border-slate-800/80 bg-[#080c14]">
          <button
            onClick={() => setShowTour(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Reviewer Guide</span>
          </button>
        </div>
      </aside>

      {/* ---- Main content area with Topbar ---- */}
      <div className="flex-1 min-w-0 min-h-screen flex flex-col overflow-x-hidden w-full max-w-full">
        {/* Top Navbar */}
        <header className="h-14 px-6 border-b border-slate-800/80 bg-[#090d16]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-mono">Workspace</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200 font-medium">{currentNav.label}</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-7 max-w-[1500px] w-full mx-auto page-enter overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
