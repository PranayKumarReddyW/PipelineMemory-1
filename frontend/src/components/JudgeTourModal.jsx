import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, X, ArrowRight, ShieldAlert, Network,
  Brain, CheckCircle2, ChevronRight, Award, Zap
} from 'lucide-react';

const TOUR_STEPS = [
  {
    step: 1,
    title: '1. Executive Intelligence & Pipeline Health',
    subtitle: 'Systemic fragility tracking across microservices',
    path: '/',
    description:
      'CI/CD pipelines suffer from amnesia. PipelineMemory aggregates real-time deployment metrics, failure rates, and service fragility so engineering leaders can spot risk before rollouts.',
    badge: 'Overview',
    actionText: 'Go to Overview',
  },
  {
    step: 2,
    title: '2. Pre-Flight Risk Gate (Git Branch & AST Inspector)',
    subtitle: 'Evaluate real Git diffs across microservices before merging',
    path: '/compare',
    description:
      'Compare microservice branches (e.g. feature/db-migration-lock vs main). The agent extracts unified code diffs, detects static AST hazards (table locks, hardcoded secrets, sync I/O), queries Hindsight episodic memory, and delivers automated CI/CD gating verdicts.',
    badge: 'Risk Gate',
    actionText: 'Test Pre-Flight Gate',
  },
  {
    step: 3,
    title: '3. Event Timeline & Patch Diff Audit',
    subtitle: 'Chronological releases with error traces and unified patch diffs',
    path: '/timeline',
    description:
      'Audit production releases with inline runtime stack traces, root cause diagnostics, verified green playbooks, and unified patch diff toggles. Record past PR outcomes directly into Hindsight long-term memory.',
    badge: 'Timeline',
    actionText: 'View Event Timeline',
  },
  {
    step: 4,
    title: '4. Autonomous Failure Patterns & Playbooks',
    subtitle: 'Dynamically extracted failure correlations from pipeline history',
    path: '/patterns',
    description:
      'The agent continuously analyzes SQLite deployment telemetry to discover statistical failure patterns, severity multipliers, and preventative playbooks—automatically retaining them into Hindsight Cloud.',
    badge: 'Patterns',
    actionText: 'Explore Failure Patterns',
  },
  {
    step: 5,
    title: '5. Service Dependency Topology',
    subtitle: 'Trace service relationships and cascading blast radius',
    path: '/graph',
    description:
      'A visual topology mapping upstream and downstream service dependencies. Click any service to inspect connected callers, reliability indices, and failure history.',
    badge: 'Service Graph',
    actionText: 'Explore Service Graph',
  },
  {
    step: 6,
    title: '6. The Ultimate Proof: Memory vs Stateless AI',
    subtitle: 'Side-by-side comparison of generic LLM vs Hindsight',
    path: '/ask',
    description:
      'Ask the agent real production questions like "Why did payments fail recently?". Toggle the Compare Mode to see how a generic LLM gives useless textbook advice, while PipelineMemory cites exact deployments, authors, and root causes.',
    badge: 'Ask Agent',
    actionText: 'Experience Memory Proof',
  },
];

export default function JudgeTourModal({ isOpen, onClose }) {
  const [activeStep, setActiveStep] = useState(0);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const current = TOUR_STEPS[activeStep];

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl glass-panel p-6 rounded-xl border border-slate-700 bg-[#0c1220] shadow-modal my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">System Walkthrough & Verification Guide</h2>
                <span className="live-pill text-[10px] py-0.2">Hindsight Track</span>
              </div>
              <p className="text-xs text-slate-400">6 focused milestones demonstrating persistent memory for DevOps CI/CD</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 my-4">
          {TOUR_STEPS.map((s, idx) => (
            <button
              key={s.step}
              onClick={() => setActiveStep(idx)}
              className={`p-2 rounded-lg border text-left transition-colors ${
                activeStep === idx
                  ? 'bg-blue-600/15 border-blue-500/40'
                  : 'bg-[#080c14] border-slate-800 hover:border-slate-700 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[10px] font-mono font-semibold ${activeStep === idx ? 'text-blue-400' : 'text-slate-500'}`}>
                  0{s.step}
                </span>
                {activeStep > idx ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${activeStep === idx ? 'bg-blue-400' : 'bg-slate-700'}`} />
                )}
              </div>
              <div className="text-[11px] font-medium text-slate-300 truncate">{s.badge}</div>
            </button>
          ))}
        </div>

        {/* Active step display */}
        <div className="glass-card p-4 bg-[#080c14] rounded-lg border border-slate-800 mb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/25">
              {current.badge}
            </span>
            <span className="text-xs text-slate-400 font-mono">{current.subtitle}</span>
          </div>
          <h3 className="text-sm font-bold text-white mb-1.5">{current.title}</h3>
          <p className="text-xs text-slate-300 leading-relaxed">{current.description}</p>
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              disabled={activeStep === 0}
              onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
              className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
            >
              Back
            </button>
            <button
              disabled={activeStep === TOUR_STEPS.length - 1}
              onClick={() => setActiveStep(prev => Math.min(TOUR_STEPS.length - 1, prev + 1))}
              className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-40"
            >
              Next Step
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleNavigate(current.path)}
              className="btn-primary text-xs py-2 px-4 shadow-pipeline-500/30"
            >
              <span>{current.actionText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
