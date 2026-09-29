/**
 * Service Dependency Graph — interactive topology & blast radius engine.
 *
 * Real-time dependency mapping, Datadog-style connected path highlighting,
 * multi-metric overlays (Reliability, Blast Radius, Incidents),
 * expandable incident post-mortems with green fix playbooks,
 * and direct deep-linking into the Pre-Flight Risk Predictor.
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Network, AlertCircle, ArrowRight, ShieldAlert,
  AlertTriangle, Layers, ExternalLink, ChevronDown,
  ChevronUp, Copy, Check, Wrench, Activity, CheckCircle2
} from 'lucide-react';
import { api } from '../hooks/useApi';

/* Fixed node positions for balanced topology layout */
const NODE_POSITIONS = {
  gateway:       { x: 400, y: 70 },
  auth:          { x: 160, y: 190 },
  payments:      { x: 400, y: 190 },
  checkout:      { x: 640, y: 190 },
  inventory:     { x: 530, y: 340 },
  notifications: { x: 270, y: 340 },
};

const METRIC_VIEWS = [
  { id: 'reliability',  label: 'Reliability %',   desc: 'Deployment success rates' },
  { id: 'blast_radius', label: 'Blast Radius',    desc: 'Downstream dependency exposure' },
  { id: 'incidents',    label: 'Incident Volume', desc: 'Historical production outages' },
];

export default function ServiceGraph() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState('payments');
  const [serviceDetail, setServiceDetail] = useState(null);
  const [metricView, setMetricView] = useState('reliability');
  const [expandedIncidentId, setExpandedIncidentId] = useState(null);
  const [copiedFixId, setCopiedFixId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/impact')
      .then(data => {
        setGraphData(data);
        if (data.nodes?.length > 0) {
          handleNodeClick('payments');
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleNodeClick = async (service) => {
    setSelectedNode(service);
    setExpandedIncidentId(null);
    try {
      const detail = await api.get(`/impact/${service}`);
      setServiceDetail(detail);
    } catch (err) {
      console.error(err);
    }
  };

  const copyPlaybook = (text, id, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedFixId(id);
    setTimeout(() => setCopiedFixId(null), 2000);
  };

  const handleDeepLinkPredictor = () => {
    if (!serviceDetail?.service) return;
    navigate('/compare', { state: { service: serviceDetail.service } });
  };

  /* Sets of upstream callers and downstream dependencies for connected path highlighting */
  const upstreamSet = useMemo(() => new Set(serviceDetail?.upstream || []), [serviceDetail]);
  const downstreamSet = useMemo(() => new Set(serviceDetail?.downstream || []), [serviceDetail]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-[520px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!graphData) return null;

  const { nodes, edges } = graphData;

  /* Helper to determine node visual theme based on the active metric view */
  const getNodeTheme = (node) => {
    if (metricView === 'reliability') {
      const rate = node.failure_rate;
      if (rate >= 40) return { fill: 'rgba(239, 68, 68, 0.22)', stroke: '#ef4444', text: '#fca5a5', badge: '#ef4444', label: `${rate}% fail` };
      if (rate >= 25) return { fill: 'rgba(245, 158, 11, 0.22)', stroke: '#f59e0b', text: '#fde68a', badge: '#f59e0b', label: `${rate}% fail` };
      return { fill: 'rgba(16, 185, 129, 0.18)', stroke: '#10b981', text: '#6ee7b7', badge: '#10b981', label: `${100 - rate}% pass` };
    }

    if (metricView === 'blast_radius') {
      const downCount = (node.dependencies || []).length;
      if (downCount >= 3) return { fill: 'rgba(168, 85, 247, 0.22)', stroke: '#a855f7', text: '#d8b4fe', badge: '#a855f7', label: `${downCount} downstream` };
      if (downCount >= 1) return { fill: 'rgba(56, 189, 248, 0.22)', stroke: '#38bdf8', text: '#7dd3fc', badge: '#38bdf8', label: `${downCount} downstream` };
      return { fill: 'rgba(148, 163, 184, 0.15)', stroke: '#94a3b8', text: '#cbd5e1', badge: '#94a3b8', label: 'Leaf node (0)' };
    }

    /* incident count view */
    const inc = node.incident_count || 0;
    if (inc >= 4) return { fill: 'rgba(239, 68, 68, 0.22)', stroke: '#ef4444', text: '#fca5a5', badge: '#ef4444', label: `${inc} incidents` };
    if (inc >= 2) return { fill: 'rgba(245, 158, 11, 0.22)', stroke: '#f59e0b', text: '#fde68a', badge: '#f59e0b', label: `${inc} incidents` };
    return { fill: 'rgba(16, 185, 129, 0.18)', stroke: '#10b981', text: '#6ee7b7', badge: '#10b981', label: `${inc} incidents` };
  };

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      {/* Header with Metric View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Service Dependency Topology</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Upstream/downstream path tracing, blast radius modeling, and post-mortem resolution playbooks
          </p>
        </div>

        {/* 3-Way Metric View Controls */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-dark-950/80 border border-slate-800 self-start sm:self-auto">
          {METRIC_VIEWS.map(v => (
            <button
              key={v.id}
              onClick={() => setMetricView(v.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                metricView === v.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={v.desc}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Graph Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 min-w-0">
        {/* SVG Canvas */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden min-w-0">
          {/* Active Flow Legend Pill */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Inspecting Flow for <span className="text-white font-bold">{selectedNode}</span></span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Click any node to focus dependency chain
            </div>
          </div>

          <svg viewBox="0 0 800 440" className="w-full h-auto select-none my-2">
            <defs>
              {/* Dot Grid Pattern */}
              <pattern id="dotGrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.06)" />
              </pattern>

              {/* Arrow markers */}
              <marker id="arrowhead" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="rgba(148,163,184,0.3)" />
              </marker>
              <marker id="arrowhead-upstream" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="#a855f7" />
              </marker>
              <marker id="arrowhead-downstream" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 9 3.5, 0 7" fill="#38bdf8" />
              </marker>

              {/* Glow filter */}
              <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background Grid */}
            <rect width="800" height="440" fill="url(#dotGrid)" rx="16" />

            {/* Edges with Connected Path Highlighting */}
            {edges.map((edge, i) => {
              const from = NODE_POSITIONS[edge.source];
              const to = NODE_POSITIONS[edge.target];
              if (!from || !to) return null;

              const isOutgoing = edge.source === selectedNode && downstreamSet.has(edge.target);
              const isIncoming = upstreamSet.has(edge.source) && edge.target === selectedNode;
              const isConnected = isOutgoing || isIncoming;
              const isDimmed = selectedNode && !isConnected;

              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const offsetX = (dx / dist) * 40;
              const offsetY = (dy / dist) * 40;

              return (
                <g key={i} opacity={isDimmed ? 0.15 : 1} className="transition-opacity duration-300">
                  <line
                    x1={from.x + offsetX}
                    y1={from.y + offsetY}
                    x2={to.x - offsetX}
                    y2={to.y - offsetY}
                    stroke={
                      isIncoming
                        ? '#a855f7'
                        : isOutgoing
                        ? '#38bdf8'
                        : 'rgba(148, 163, 184, 0.25)'
                    }
                    strokeWidth={isConnected ? 3 : 1.5}
                    strokeDasharray={isConnected ? '6 4' : ''}
                    className={isConnected ? 'flow-line' : ''}
                    markerEnd={
                      isIncoming
                        ? 'url(#arrowhead-upstream)'
                        : isOutgoing
                        ? 'url(#arrowhead-downstream)'
                        : 'url(#arrowhead)'
                    }
                  />

                  {/* Edge Connection Direction Pill */}
                  {isConnected && (
                    <text
                      x={(from.x + to.x) / 2 + 8}
                      y={(from.y + to.y) / 2 - 8}
                      fontSize="9"
                      fill={isIncoming ? '#d8b4fe' : '#7dd3fc'}
                      fontWeight="bold"
                      className="font-mono"
                    >
                      {isIncoming ? 'CALLS ➔' : 'CASCADES ➔'}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const pos = NODE_POSITIONS[node.id];
              if (!pos) return null;

              const isSelected = selectedNode === node.id;
              const isUpstream = upstreamSet.has(node.id);
              const isDownstream = downstreamSet.has(node.id);
              const isInFlow = isSelected || isUpstream || isDownstream;
              const isDimmed = selectedNode && !isInFlow;

              const theme = getNodeTheme(node);

              return (
                <g
                  key={node.id}
                  className="cursor-pointer group"
                  onClick={() => handleNodeClick(node.id)}
                  opacity={isDimmed ? 0.28 : 1}
                  style={{ transition: 'opacity 0.25s ease' }}
                >
                  {/* Concentric Halo for Selected Node */}
                  {isSelected && (
                    <circle
                      cx={pos.x} cy={pos.y} r="54"
                      fill="none"
                      stroke={theme.stroke}
                      strokeWidth="2"
                      opacity="0.35"
                      filter="url(#nodeGlow)"
                      className="animate-pulse"
                    />
                  )}

                  {/* Flow Direction Indicator Ring for Callers / Dependents */}
                  {(isUpstream || isDownstream) && (
                    <circle
                      cx={pos.x} cy={pos.y} r="48"
                      fill="none"
                      stroke={isUpstream ? '#a855f7' : '#38bdf8'}
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      opacity="0.6"
                    />
                  )}

                  {/* Main Circle Node */}
                  <circle
                    cx={pos.x} cy={pos.y} r="38"
                    fill={theme.fill}
                    stroke={
                      isSelected
                        ? theme.stroke
                        : isUpstream
                        ? '#a855f7'
                        : isDownstream
                        ? '#38bdf8'
                        : 'rgba(255,255,255,0.15)'
                    }
                    strokeWidth={isSelected ? 2.5 : isUpstream || isDownstream ? 2 : 1.5}
                    className="transition-all duration-200 group-hover:scale-105"
                  />

                  {/* Status Indicator Dot */}
                  <circle
                    cx={pos.x + 24} cy={pos.y - 24} r="5"
                    fill={theme.badge}
                    stroke="#0c101b"
                    strokeWidth="2"
                  />

                  {/* Role Mini Badge (Upstream / Downstream) */}
                  {isUpstream && (
                    <text
                      x={pos.x} y={pos.y - 44}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#d8b4fe"
                      fontWeight="bold"
                      className="font-mono uppercase tracking-wider"
                    >
                      ▲ Caller
                    </text>
                  )}
                  {isDownstream && (
                    <text
                      x={pos.x} y={pos.y - 44}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#7dd3fc"
                      fontWeight="bold"
                      className="font-mono uppercase tracking-wider"
                    >
                      ▼ Dependency
                    </text>
                  )}

                  {/* Service Name */}
                  <text
                    x={pos.x} y={pos.y - 3}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="bold"
                    fill="#ffffff"
                    className="font-mono tracking-tight"
                  >
                    {node.id}
                  </text>

                  {/* Metric Sub-label */}
                  <text
                    x={pos.x} y={pos.y + 13}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isSelected ? theme.text : '#94a3b8'}
                    fontWeight="500"
                    className="font-mono"
                  >
                    {theme.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Dynamic Legend based on active metric view */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
            <div className="flex items-center gap-4 text-[11px] font-mono">
              {metricView === 'reliability' && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    &lt; 25% Fail (Stable)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    25-40% Fail (Elevated)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    &gt; 40% Fail (Fragile)
                  </span>
                </>
              )}
              {metricView === 'blast_radius' && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400" />
                    Tier-1 Core (≥3 Downstream)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    Tier-2 Branch (1-2 Downstream)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Leaf Node (0 Downstream)
                  </span>
                </>
              )}
              {metricView === 'incidents' && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    High Outage History (≥4)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Moderate Incidents (2-3)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Low Incidents (≤1)
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-3 border-t-2 border-purple-400" />
                Upstream Caller
              </span>
              <span className="flex items-center gap-1.5 text-sky-400">
                <span className="w-3 border-t-2 border-sky-400" />
                Downstream Dep
              </span>
            </div>
          </div>
        </div>

        {/* Service Detail Sidepanel */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between min-w-0">
          {!serviceDetail ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <Network className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm text-slate-400">Click a service in the topology to view dependency details</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header */}
                <div className="pb-3 border-b border-slate-800">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white font-mono">{serviceDetail.service}</h2>
                    <span className="text-xs font-mono font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                      Blast Radius: {serviceDetail.blast_radius}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Affects {serviceDetail.downstream.length} downstream and consumed by {serviceDetail.upstream.length} upstream microservices
                  </p>
                </div>

                {/* Downstream Dependencies */}
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
                    <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                    Downstream (Cascades into)
                  </h3>
                  {serviceDetail.downstream.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {serviceDetail.downstream.map(d => (
                        <button
                          key={d}
                          onClick={() => handleNodeClick(d)}
                          className="text-xs font-mono bg-sky-500/10 text-sky-300 hover:text-white px-2.5 py-1 rounded-lg border border-sky-500/25 hover:border-sky-500/50 transition-colors"
                          title={`Focus on ${d}`}
                        >
                          {d} ➔
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No downstream dependencies recorded</p>
                  )}
                </div>

                {/* Upstream Dependents */}
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
                    <ArrowRight className="w-3.5 h-3.5 text-purple-400 rotate-180" />
                    Upstream (Callers of {serviceDetail.service})
                  </h3>
                  {serviceDetail.upstream.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {serviceDetail.upstream.map(u => (
                        <button
                          key={u}
                          onClick={() => handleNodeClick(u)}
                          className="text-xs font-mono bg-purple-500/10 text-purple-300 hover:text-white px-2.5 py-1 rounded-lg border border-purple-500/25 hover:border-purple-500/50 transition-colors"
                          title={`Focus on ${u}`}
                        >
                          ◀ {u}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No upstream callers found</p>
                  )}
                </div>

                {/* Clickable Incidents with Green Fix Playbooks */}
                {serviceDetail.incidents?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-mono">
                      Recent Post-Mortems ({serviceDetail.incidents.length})
                    </h3>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {serviceDetail.incidents.map((inc) => {
                        const isExpanded = expandedIncidentId === inc.id;
                        return (
                          <div
                            key={inc.id}
                            onClick={() => setExpandedIncidentId(isExpanded ? null : inc.id)}
                            className="p-2.5 bg-[#090e18] border border-slate-800 hover:border-slate-700 rounded-xl text-xs space-y-1.5 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className={`badge badge-${inc.severity} text-[9px] py-0`}>
                                  {inc.severity}
                                </span>
                                {inc.version && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    v{inc.version}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-slate-300">
                                <span className="text-[10px] font-mono">
                                  {new Date(inc.deploy_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </div>
                            </div>

                            <p className="text-slate-300 leading-snug">{inc.summary}</p>

                            {/* Expanded Resolution Details & Fix Playbook */}
                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-slate-800 space-y-2 text-[11px] animate-fade-in" onClick={e => e.stopPropagation()}>
                                {inc.root_cause && (
                                  <div>
                                    <span className="text-slate-500 font-mono text-[10px] uppercase font-semibold">Root Cause:</span>
                                    <p className="text-slate-400 mt-0.5">{inc.root_cause}</p>
                                  </div>
                                )}

                                {inc.fix_applied && (
                                  <div className="p-2 rounded-lg bg-[#0c1220] border border-emerald-500/20 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-emerald-400 font-mono text-[10px] font-semibold flex items-center gap-1">
                                        <Wrench className="w-3 h-3" />
                                        Proven Green Fix
                                      </span>
                                      <button
                                        onClick={(e) => copyPlaybook(inc.fix_applied, inc.id, e)}
                                        className="text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1"
                                      >
                                        {copiedFixId === inc.id ? (
                                          <>
                                            <Check className="w-3 h-3 text-emerald-400" />
                                            <span className="text-emerald-400">Copied</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copy Fix</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto bg-black/40 p-1.5 rounded">
                                      {inc.fix_applied}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Direct Deep-Link Action into Risk Predictor */}
              <div className="pt-3 border-t border-slate-800 mt-4">
                <button
                  onClick={handleDeepLinkPredictor}
                  className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1.5 font-medium shadow-md shadow-blue-600/20"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Test Pre-Flight Risk on {serviceDetail.service}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
