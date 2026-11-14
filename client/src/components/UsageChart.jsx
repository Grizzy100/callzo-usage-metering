
import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const metrics = [
  { id: "minutes", label: "Minutes", color: "#3987FF" },
  { id: "sms", label: "SMS", color: "#22B8CF" },
  { id: "signups", label: "Signups", color: "#A78BFA" },
  { id: "cost_cents", label: "Cost", color: "#E5A12B" },
];

function UsageChart({
  data,
  loading,
  error,
  onRetry,
  selectedMetric,
  onMetricChange,
}) {
  const activeMetric = metrics.find(
    (metric) => metric.id === selectedMetric
  );

  const chartData = useMemo(() => {
    const step = data.length > 120 ? Math.ceil(data.length / 120) : 1;

    return data
      .filter((_, index) => index % step === 0 || index === data.length - 1)
      .map((item) => ({
        ...item,
        dateLabel: new Date(`${item.date}T00:00:00`).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric" }
        ),
        cost_cents: item.cost_cents / 100,
      }));
  }, [data]);

  const formatValue = (value) => {
    if (selectedMetric === "cost_cents") {
      return `$${Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    return Number(value).toLocaleString("en-US");
  };

  return (
    <section className="analytics-panel">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Usage analytics
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Track communication activity over time.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 rounded-md bg-gray-100 p-1">
          {metrics.map((metric) => (
            <button
              key={metric.id}
              type="button"
              onClick={() => onMetricChange(metric.id)}
              aria-pressed={selectedMetric === metric.id}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedMetric === metric.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-frame mt-6 w-full">
        <div className="chart-canvas">
          {loading ? (
            <div className="flex h-full animate-pulse items-center justify-center rounded-md bg-gray-50 text-sm text-gray-400">
              Loading usage data...
            </div>
          ) : error ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 rounded-md bg-red-50 p-5 text-center"
              role="alert"
            >
              <p className="text-sm font-medium text-red-700">
                Unable to load usage analytics.
              </p>
              <p className="text-xs text-red-600">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="ui-button ui-button-secondary"
              >
                Try again
              </button>
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              No usage data available for this date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="usageGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={activeMetric.color}
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor={activeMetric.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="var(--chart-grid)"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />

              <YAxis
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={(value) =>
                  selectedMetric === "cost_cents"
                    ? `$${value}`
                    : value.toLocaleString("en-US")
                }
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  color: "var(--color-text)",
                }}
                labelStyle={{ color: "var(--color-text)", fontWeight: 600 }}
                formatter={(value) => [
                  formatValue(value),
                  activeMetric.label,
                ]}
              />

              <Area
                type="monotone"
                dataKey={selectedMetric}
                stroke={activeMetric.color}
                strokeWidth={2}
                fill="url(#usageGradient)"
                activeDot={{ r: 5 }}
              />
            </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <span className="chart-axis-label chart-axis-label-y">
          {selectedMetric === "cost_cents" ? "USD" : activeMetric.label}
        </span>
        <span className="chart-axis-label chart-axis-label-x">
          Date
        </span>
      </div>
    </section>
  );
}

export default memo(UsageChart);
