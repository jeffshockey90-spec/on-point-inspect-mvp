type TrendPoint = {
  label: string;
  inspections: number;
  revenue: number;
};

function compactMoney(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(value)}`;
}

function BarChart({
  points,
  color,
}: {
  points: { label: string; value: number; display: string }[];
  color: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const width = 320;
  const height = 110;
  const gap = 6;
  const barWidth = (width - gap * (points.length + 1)) / points.length;

  return (
    <svg viewBox={`0 0 ${width} ${height + 22}`} className="mt-3 w-full">
      {points.map((point, index) => {
        const barHeight = Math.max(3, (point.value / max) * height);
        const x = gap + index * (barWidth + gap);
        const y = height - barHeight;
        const isLast = index === points.length - 1;

        return (
          <g key={point.label + index}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill={isLast ? color : `${color}55`}
            />
            <text
              x={x + barWidth / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#94a3b8"
            >
              {point.display}
            </text>
            <text
              x={x + barWidth / 2}
              y={height + 15}
              textAnchor="middle"
              fontSize="9"
              fill="#64748b"
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Two 6-month bar charts (inspections + collected revenue), hand-rolled in SVG
// so there's no charting dependency. Rendered from the server dashboard.
export default function DashboardTrends({ data }: { data: TrendPoint[] }) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-[#0b1220] p-6 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-300">
            Trends
          </p>
          <h2 className="mt-1 text-2xl font-black text-white">Last 6 months</h2>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            Inspections
          </p>
          <BarChart
            color="#2dd4bf"
            points={data.map((point) => ({
              label: point.label,
              value: point.inspections,
              display: String(point.inspections),
            }))}
          />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
            Revenue collected
          </p>
          <BarChart
            color="#34d399"
            points={data.map((point) => ({
              label: point.label,
              value: point.revenue,
              display: compactMoney(point.revenue),
            }))}
          />
        </div>
      </div>
    </section>
  );
}
