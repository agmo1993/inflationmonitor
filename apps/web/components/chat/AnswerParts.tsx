"use client";

import type { AnswerPart } from "@/lib/chat/answer";
import { colors } from "@/lib/ui/theme";

function Cite({ source, period }: { source?: string; period?: string }) {
  if (!source && !period) return null;
  return (
    <p className="im-cite" data-testid="cite">
      Source: {source ?? "—"}
      {period ? ` · Period: ${period}` : ""}
    </p>
  );
}

function LineChart({
  points,
  stroke = colors.accentBlue,
}: {
  points: Array<{ period: string; value: number }>;
  stroke?: string;
}) {
  if (!points.length) return null;
  const w = 560;
  const h = 160;
  const pad = 16;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const coords = points.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1);
    const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg
      className="im-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="timeseries chart"
      data-testid="chart-timeseries"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        points={coords.join(" ")}
      />
      {points.map((p, i) => {
        const [x, y] = coords[i]!.split(",").map(Number);
        return <circle key={p.period} cx={x} cy={y} r="3" fill={stroke} />;
      })}
    </svg>
  );
}

function BarChart({
  bars,
}: {
  bars: Array<{ label: string; value: number }>;
}) {
  if (!bars.length) return null;
  const w = 560;
  const h = 160;
  const pad = 24;
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  const barW = (w - pad * 2) / bars.length - 12;
  return (
    <svg
      className="im-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="bar chart"
      data-testid="chart-bar"
    >
      {bars.map((b, i) => {
        const bh = ((b.value / max) * (h - pad * 2)) || 0;
        const x = pad + i * ((w - pad * 2) / bars.length);
        const y = h - pad - bh;
        return (
          <g key={b.label}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={bh}
              rx="6"
              fill={colors.accentBlue}
              opacity={0.85}
            />
            <text
              x={x + barW / 2}
              y={h - 6}
              textAnchor="middle"
              fill={colors.inkMuted}
              fontSize="11"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AnswerPartsView({ parts }: { parts: AnswerPart[] }) {
  return (
    <div data-testid="answer-parts">
      {parts.map((part, idx) => {
        const key = `${part.type}-${idx}`;
        if (part.type === "text") {
          return (
            <div className="im-part" key={key}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{part.text}</p>
            </div>
          );
        }
        if (part.type === "stat_cards") {
          return (
            <div className="im-part" key={key} data-testid="part-stat_cards">
              {part.title && <h3 className="im-part-title">{part.title}</h3>}
              <div className="im-stat-grid">
                {part.cards.map((c) => (
                  <div className="im-stat-card" key={c.label}>
                    <span>{c.label}</span>
                    <strong>{c.value}</strong>
                    {c.hint && <span>{c.hint}</span>}
                  </div>
                ))}
              </div>
              <Cite source={part.source} period={part.period} />
            </div>
          );
        }
        if (part.type === "timeseries") {
          return (
            <div className="im-part" key={key} data-testid="part-timeseries">
              <h3 className="im-part-title">{part.title}</h3>
              <LineChart points={part.points} />
              <Cite source={part.source} period={part.period} />
            </div>
          );
        }
        if (part.type === "bar") {
          return (
            <div className="im-part" key={key} data-testid="part-bar">
              <h3 className="im-part-title">{part.title}</h3>
              <BarChart bars={part.bars} />
              <Cite source={part.source} period={part.period} />
            </div>
          );
        }
        if (part.type === "compare") {
          return (
            <div className="im-part" key={key} data-testid="part-compare">
              <h3 className="im-part-title">{part.title}</h3>
              {part.series.map((s, i) => (
                <div key={s.id} style={{ marginBottom: 8 }}>
                  <div className="im-cite">{s.label}</div>
                  <LineChart
                    points={s.points}
                    stroke={i === 0 ? colors.accentBlue : "#d44df0"}
                  />
                </div>
              ))}
              <Cite source={part.source} period={part.period} />
            </div>
          );
        }
        if (part.type === "table") {
          return (
            <div className="im-part" key={key} data-testid="part-table">
              <h3 className="im-part-title">{part.title}</h3>
              <table className="im-table">
                <thead>
                  <tr>
                    {part.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {part.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Cite source={part.source} period={part.period} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
