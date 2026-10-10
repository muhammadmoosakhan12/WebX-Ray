import React from 'react';

interface ScoreGaugeProps {
  score: number | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  label?: string;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  size = 'md',
  showLabel = true,
  label = 'Score'
}) => {
  const isUnavailable = score === null || score === undefined;
  const normalizedScore = isUnavailable ? 0 : Math.max(0, Math.min(100, Math.round(score)));

  // Muted status colors - strictly no neon, no glow
  let strokeColor = '#DC2626'; // Muted red
  let ratingText = 'Needs Work';
  let badgeColor = 'text-rose-700';

  if (isUnavailable) {
    strokeColor = '#94A3B8'; // Muted slate-400
    ratingText = 'Score unavailable';
    badgeColor = 'text-slate-500';
  } else if (normalizedScore >= 80) {
    strokeColor = '#059669'; // Muted green
    ratingText = 'Good';
    badgeColor = 'text-emerald-700';
  } else if (normalizedScore >= 50) {
    strokeColor = '#D97706'; // Soft amber
    ratingText = 'Needs Improvement';
    badgeColor = 'text-amber-700';
  }

  const dimensions = {
    sm: { size: 56, stroke: 5, fontSize: 'text-sm', subFontSize: 'text-[9px]' },
    md: { size: 96, stroke: 7, fontSize: 'text-2xl', subFontSize: 'text-[11px]' },
    lg: { size: 128, stroke: 8, fontSize: 'text-3xl', subFontSize: 'text-xs' },
    xl: { size: 160, stroke: 10, fontSize: 'text-4xl', subFontSize: 'text-sm' },
  }[size];

  const radius = (dimensions.size - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isUnavailable ? circumference : circumference - (normalizedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={dimensions.size}
          height={dimensions.size}
          className="transform -rotate-90 origin-center"
        >
          {/* Subtle light track */}
          <circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            stroke="#E5E7EB"
            strokeWidth={dimensions.stroke}
            fill="transparent"
          />
          {/* Progress circle without glow */}
          <circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={dimensions.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 0.6s ease',
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {isUnavailable ? (
            <>
              <span className={`font-mono font-medium tracking-tight text-[#6B7280] ${dimensions.fontSize}`}>
                --
              </span>
              <span className={`text-slate-400 font-normal ${dimensions.subFontSize}`}>
                N/A
              </span>
            </>
          ) : (
            <>
              <span className={`font-mono font-semibold tracking-tight text-[#202124] ${dimensions.fontSize}`}>
                {normalizedScore}
              </span>
              <span className={`text-[#6B7280] font-normal ${dimensions.subFontSize}`}>
                /100
              </span>
            </>
          )}
        </div>
      </div>

      {showLabel && (
        <div className="mt-2 text-center">
          <div className="text-[11px] uppercase tracking-wider text-[#6B7280] font-medium">{label}</div>
          <div className={`text-xs font-medium mt-0.5 ${badgeColor}`}>{ratingText}</div>
        </div>
      )}
    </div>
  );
};
