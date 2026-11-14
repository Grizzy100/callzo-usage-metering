
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import StatCard from "../components/StatCard";
import UsageChart from "../components/UsageChart";
import {
  getHealth,
  getAccountSummary,
} from "../services/api";

const EMPTY_SERIES = [];

// Format a date as YYYY-MM-DD using local time.
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Default range: previous 90 days.
function getDefaultDates() {
  const end = new Date();
  const start = new Date();

  start.setDate(start.getDate() - 90);

  return {
    from: formatDate(start),
    to: formatDate(end),
  };
}

function Overview({ dateRange, onDateRangeChange }) {
  const [accountCount, setAccountCount] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const [selectedMetric, setSelectedMetric] = useState("minutes");

  const effectiveRange = useMemo(
    () => dateRange || getDefaultDates(),
    [dateRange]
  );

  // Health request is independent of the chart request.
  useEffect(() => {
    let active = true;

    async function loadHealth() {
      try {
        const result = await getHealth();

        if (active) {
          setAccountCount(result.accounts);
        }
      } catch {
        if (active) {
          setAccountCount(null);
        }
      } finally {
        if (active) {
          setHealthLoading(false);
        }
      }
    }

    loadHealth();

    return () => {
      active = false;
    };
  }, []);

  // Load summary whenever the applied date range or retry changes.
  useEffect(() => {
    let active = true;

    async function fetchSummary() {
      try {
        const result = await getAccountSummary({
          date_from: effectiveRange.from,
          date_to: effectiveRange.to,
        });

        if (active) {
          setSummary(result);
          setSummaryError("");
        }
      } catch (error) {
        if (active) {
          setSummary(null);
          setSummaryError(
            error.message || "Please try again."
          );
        }
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      active = false;
    };
  }, [effectiveRange.from, effectiveRange.to, retryCount]);

  // Calculate totals from the returned daily records.
  const totals = useMemo(() => {
    const series = summary?.series || [];

    return series.reduce(
      (result, item) => ({
        minutes: result.minutes + item.minutes,
        sms: result.sms + item.sms,
        cost: result.cost + item.cost_cents,
        signups: result.signups + item.signups,
      }),
      {
        minutes: 0,
        sms: 0,
        cost: 0,
        signups: 0,
      }
    );
  }, [summary]);

  function applyDateRange(event) {
    event.preventDefault();
    // The date range is already synchronized reactively
    setRetryCount((count) => count + 1);
  }

  const retrySummary = useCallback(() => {
    setSummaryLoading(true);
    setSummaryError("");
    setRetryCount((count) => count + 1);
  }, []);

  function formatNumber(value) {
    return Number(value).toLocaleString("en-US");
  }

  function formatCost(cents) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  }

  return (
    <div>
      {/* Date range */}
      <form
        onSubmit={applyDateRange}
        className="reporting-toolbar"
      >
        <div>
          <p className="eyebrow">Reporting window</p>
          <h2 className="mt-1 text-base font-bold text-gray-900">
            Usage period
          </h2>

          <p className="mt-1 text-xs text-gray-500">
            Compare account activity across a specific date range.
          </p>
        </div>

        <div className="reporting-fields">
          <div className="reporting-field">
            <label
              htmlFor="date-from"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              From
            </label>

            <input
              id="date-from"
              type="date"
              className="ui-input mt-1"
              value={effectiveRange.from}
              max={effectiveRange.to}
              onChange={(event) =>
                onDateRangeChange?.({
                  from: event.target.value,
                  to: effectiveRange.to,
                })
              }
            />
          </div>

          <div className="reporting-field">
            <label
              htmlFor="date-to"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              To
            </label>

            <input
              id="date-to"
              type="date"
              className="ui-input mt-1"
              value={effectiveRange.to}
              min={effectiveRange.from}
              onChange={(event) =>
                onDateRangeChange?.({
                  from: effectiveRange.from,
                  to: event.target.value,
                })
              }
            />
          </div>

          <button
            type="submit"
            className="ui-button ui-button-primary"
          >
            Apply
          </button>
        </div>
      </form>

      {/* Metric cards */}
      <div className="metric-grid">
        <StatCard
          title="Total Accounts"
          value={
            accountCount === null
              ? "Unavailable"
              : formatNumber(accountCount)
          }
          description="Registered accounts"
          icon="accounts"
          loading={healthLoading}
        />

        <StatCard
          title="Total Minutes"
          value={formatNumber(totals.minutes)}
          description="Minutes used in selected period"
          icon="minutes"
          loading={summaryLoading}
        />

        <StatCard
          title="Total SMS"
          value={formatNumber(totals.sms)}
          description="Messages sent in selected period"
          icon="sms"
          loading={summaryLoading}
        />

        <StatCard
          title="Usage Cost"
          value={formatCost(totals.cost)}
          description="Cost in selected period"
          icon="cost"
          loading={summaryLoading}
        />
      </div>

      {/* Usage chart */}
      <UsageChart
        data={summary?.series || EMPTY_SERIES}
        loading={summaryLoading}
        error={summaryError}
        onRetry={retrySummary}
        selectedMetric={selectedMetric}
        onMetricChange={setSelectedMetric}
      />

      {/* Additional information */}
      <div className="insight-grid">
        <div className="insight-item">
          <p className="eyebrow">Acquisition</p>
          <p className="mt-1 text-sm font-bold text-gray-900">New signups</p>

          <p className="mt-2 text-xl font-semibold text-gray-900">
            {summaryLoading ? "..." : formatNumber(totals.signups)}
          </p>

          <p className="mt-1 text-xs text-gray-400">During the selected period</p>
        </div>

        <div className="insight-item">
          <p className="eyebrow">System status</p>
          <p className="mt-1 text-sm font-bold text-gray-900">API connection</p>

          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                healthLoading
                  ? "bg-yellow-400"
                  : accountCount !== null
                    ? "bg-green-500"
                    : "bg-red-500"
              }`}
            />

            <p className="text-sm font-semibold text-gray-900">
              {healthLoading
                ? "Checking..."
                : accountCount !== null
                  ? "Connected"
                  : "Unavailable"}
            </p>
          </div>

          <p className="mt-1 text-xs text-gray-400">Live service health check</p>
        </div>
      </div>
    </div>
  );
}

export default Overview;
