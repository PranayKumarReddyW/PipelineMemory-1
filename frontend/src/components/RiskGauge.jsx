/**
 * RiskGauge — advanced semi-circular telemetry gauge for deployment risk.
 *
 * Custom SVG with multi-stop gradients, tick accents, glowing ambient light,
 * and clear gate verdict badge.
 */

export default function RiskGauge({ score = 0, level = 'Low', animate = true }) {
  const radius = 84;
  const circumference = Math.PI * radius; // semicircle
  const offset = circumference - (score / 100) * circumference;

  /* Color configuration based on risk */
  const getTheme = (s) => {
    if (s >= 75) {
      return {
        gradId: 'gaugeRed',
        stroke: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.45)',
        bgGlow: 'rgba(239, 68, 68, 0.12)',
        verdict: 'BLOCKED · High Failure Probability',
        verdictColor: 'text-red-400 bg-red-500/15 border-red-500/30 shadow-glow-rose',
      };
    }
    if (s >= 50) {
      return {
        gradId: 'gaugeOrange',
        stroke: '#f97316',
        glow: 'rgba(249, 115, 22, 0.45)',
        bgGlow: 'rgba(249, 115, 22, 0.12)',
        verdict: 'ELEVATED · Staged Rollout Recommended',
        verdictColor: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
      };
    }
    if (s >= 30) {
      return {
        gradId: 'gaugeAmber',
        stroke: '#f59e0b',
        glow: 'rgba(245, 158, 11, 0.4)',
        bgGlow: 'rgba(245, 158, 11, 0.1)',
        verdict: 'MODERATE · Monitor Telemetry',
        verdictColor: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      };
    }
    return {
      gradId: 'gaugeGreen',
      stroke: '#10b981',
      glow: 'rgba(16, 185, 129, 0.4)',
      bgGlow: 'rgba(16, 185, 129, 0.1)',
      verdict: 'SAFE · Automated Pass Gate',
      verdictColor: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30 shadow-glow-emerald',
    };
  };

  const theme = getTheme(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 220, height: 130 }}>
        <svg
          viewBox="0 0 220 130"
          className="w-full h-full overflow-visible"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="gaugeGreen" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#059669" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="gaugeAmber" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
            <linearGradient id="gaugeOrange" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#fb923c" />
            </linearGradient>
            <linearGradient id="gaugeRed" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#dc2626" />
              <stop offset="100%" stopColor="#f87171" />
            </linearGradient>

            {/* Glow Filter */}
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={theme.stroke} floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Background Ambient Arc */}
          <path
            d="M 26 112 A 84 84 0 0 1 194 112"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* Segment marks / Ticks */}
          <path
            d="M 26 112 A 84 84 0 0 1 194 112"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="14"
            strokeDasharray="2 12"
            strokeLinecap="round"
          />

          {/* Active Filled Arc */}
          <path
            d="M 26 112 A 84 84 0 0 1 194 112"
            fill="none"
            stroke={`url(#${theme.gradId})`}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animate ? offset : circumference}
            filter="url(#gaugeGlow)"
            className="gauge-circle"
          />
        </svg>

        {/* Center Numbers and Unit */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-black text-white tabular-nums tracking-tight">
              {score}
            </span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              /100
            </span>
          </div>
          <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase mt-0.5">
            Risk Index
          </span>
        </div>
      </div>

      {/* Decision Pill */}
      <div className={`mt-3 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wide border ${theme.verdictColor} flex items-center gap-1.5`}>
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.stroke }} />
        <span>{level} Risk</span>
      </div>

      {/* Verdict Subtext */}
      <p className="text-[11px] text-gray-400 mt-1.5 font-medium text-center">
        {theme.verdict}
      </p>
    </div>
  );
}

