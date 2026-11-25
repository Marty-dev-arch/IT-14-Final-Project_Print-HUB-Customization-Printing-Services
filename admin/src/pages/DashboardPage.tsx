import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, Layers, MessageSquare } from 'lucide-react';
import { apiRequest, SERVICE_NAMES } from '../lib/api';
import type { DashboardPayload } from '../types';

type ChartPeriod = 'daily' | 'weekly' | 'monthly';

export function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const payload = await apiRequest<DashboardPayload>('/api/admin/dashboard');
      setData(payload);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard(false);
    const interval = window.setInterval(() => {
      void loadDashboard(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  if (loading && !data) {
    return <p className="py-16 text-center text-base text-[#64748B]">Loading live dashboard...</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-sm text-[#DC2626]">
        {error}
      </div>
    );
  }

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const counts = data?.counts ?? { total: 0, pending: 0, answered: 0, completed: 0, clients: 0 };
  const fallbackDaily = (data?.dailyVolume ?? []).map((d) => ({
    label: d.label,
    incoming: d.count,
    resolved: 0,
  }));
  const activeSeries = data?.chartSeries?.[period] ?? fallbackDaily;

  const totalForPeriod = activeSeries.reduce((sum, pt) => sum + pt.incoming, 0);
  const maxBar = Math.max(1, ...activeSeries.map((pt) => pt.incoming));

  const svgW = 580;
  const svgH = 220;
  const padX = 24;
  const padTop = 22;
  const padBottom = 34;
  const plotW = svgW - padX * 2;
  const plotH = svgH - padTop - padBottom;
  const slotW = activeSeries.length > 0 ? plotW / activeSeries.length : plotW;
  const barW = Math.min(40, Math.max(20, slotW * 0.48));

  const totalForDist = Math.max(1, counts.pending + counts.answered + counts.completed);
  const statusRows = [
    { label: 'Completed', count: counts.completed, bar: '#4ADE80' },
    { label: 'Answered', count: counts.answered, bar: '#38BDF8' },
    { label: 'Pending', count: counts.pending, bar: '#FCA5A5' },
  ];

  const kpiItems = [
    { label: 'Total Inquiries', value: counts.total, icon: Layers, to: '/messages' },
    { label: 'Pending', value: counts.pending, icon: Clock3, to: '/messages?status=Pending' },
    { label: 'Answered', value: counts.answered, icon: MessageSquare, to: '/messages?status=Answered' },
    { label: 'Completed', value: counts.completed, icon: CheckCircle2, to: '/logs' },
  ] as const;

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">Dashboard</h1>
        <p className="mt-1 text-sm font-medium text-[#64748B]">{todayFormatted}</p>
      </div>

      {/* Flat KPI Strip */}
      <section className="grid grid-cols-2 divide-x divide-y sm:divide-y-0 divide-[#F1F5F9] rounded-2xl border border-[#EAE6DF] bg-white lg:grid-cols-4">
        {kpiItems.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="group flex items-start justify-between gap-3 p-5 sm:p-6 transition-colors hover:bg-[#F8FAFC] active:bg-[#E0F2FE]/60"
            >
              <div>
                <p className="text-sm font-medium text-[#64748B]">{card.label}</p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-[#0F172A] tabular-nums">
                  {card.value}
                </p>
              </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[#0F172A]">
                <Icon className="h-5 w-5 stroke-[1.8]" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </section>

      {/* Open Analytics Row (No Nested Outer Card Box) */}
      <section className="grid gap-8 lg:grid-cols-12 border-t border-[#EAE6DF] pt-6">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">Inquiry Chart</h2>
              <span className="rounded-full bg-[#F0F9FF] px-3 py-1 text-xs font-semibold text-[#0369A1] tabular-nums">
                {totalForPeriod} Inquiries
              </span>
            </div>

            <div className="flex items-center gap-1.5" role="group" aria-label="Chart period">
              {(['daily', 'weekly', 'monthly'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={period === key}
                  className={`rounded-full border px-3.5 py-1 text-xs capitalize transition-colors cursor-pointer ${
                    period === key
                      ? 'border-[#38BDF8] bg-[#38BDF8] font-semibold text-[#0F172A]'
                      : 'border-[#E2E8F0] bg-white font-medium text-[#64748B] hover:border-[#CBD5E1] hover:text-[#0F172A] active:border-[#38BDF8]'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-auto overflow-visible"
              role="img"
              aria-label="Inquiry volume bar chart"
            >
              {[0, 0.5, 1].map((frac) => {
                const y = padTop + plotH * (1 - frac);
                return (
                  <line
                    key={frac}
                    x1={padX}
                    y1={y}
                    x2={svgW - padX}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                );
              })}
              {activeSeries.map((pt, idx) => {
                const xCenter = padX + slotW * idx + slotW / 2;
                const h = Math.max(pt.incoming > 0 ? 14 : 4, (pt.incoming / maxBar) * plotH);
                const y = padTop + plotH - h;
                const fill = pt.incoming === 0 ? '#E2E8F0' : idx % 2 === 0 ? '#38BDF8' : '#0EA5E9';
                return (
                  <g key={`${period}-${pt.label}`}>
                    <rect x={xCenter - barW / 2} y={y} width={barW} height={h} rx="6" ry="6" fill={fill}>
                      <title>{`${pt.label}: ${pt.incoming}`}</title>
                    </rect>
                    {pt.incoming > 0 && (
                      <text
                        x={xCenter}
                        y={y - 7}
                        textAnchor="middle"
                        fontSize="11.5"
                        fontWeight="600"
                        fill="#0369A1"
                      >
                        {pt.incoming}
                      </text>
                    )}
                    <text
                      x={xCenter}
                      y={svgH - 8}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="500"
                      fill="#64748B"
                    >
                      {pt.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-5">
          <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">Status Split</h2>

          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
            {counts.total > 0 &&
              statusRows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    width: `${(row.count / totalForDist) * 100}%`,
                    backgroundColor: row.bar,
                  }}
                />
              ))}
          </div>

          <div className="space-y-3.5 pt-1">
            {statusRows.map((row) => {
              const pct = totalForDist > 0 ? Math.round((row.count / totalForDist) * 100) : 0;
              return (
                <div key={row.label} className="flex items-center justify-between text-[15px]">
                  <span className="flex items-center gap-2.5 font-medium text-[#0F172A]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.bar }} />
                    {row.label}
                  </span>
                  <span className="font-mono-code text-sm font-semibold text-[#64748B] tabular-nums">
                    {row.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Open Recent Customer Messages List (Unseen Only, No Nested Box) */}
      <section className="space-y-3 border-t border-[#EAE6DF] pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">Recent Customer Messages</h2>
          <Link to="/messages" className="text-sm font-semibold text-[#0284C7] hover:underline">
            Open inbox
          </Link>
        </div>

        {(data?.recentInquiries.length ?? 0) === 0 ? (
          <p className="py-6 text-sm text-[#64748B]">
            All customer messages have been seen or replied to.
          </p>
        ) : (
          <ul className="divide-y divide-[#EAE6DF]">
            {data!.recentInquiries.map((inq) => (
              <li key={inq.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[#0A0A0A]">
                    {inq.customerNameSnapshot}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold text-[#0A0A0A]">
                    {inq.orderItem || SERVICE_NAMES[inq.serviceId] || inq.serviceId} · {inq.message}
                  </p>
                </div>
                <Link to={`/messages?id=${inq.id}`} className="btn-admin-green shrink-0 text-sm py-1.5 px-4">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
