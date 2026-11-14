import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccounts, getAccountSummary } from "../services/api";
import UsageChart from "../components/UsageChart";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

const SORTABLE_COLUMNS = [
  { key: "name", label: "Account" },
  { key: "company", label: "Company" },
  { key: "country", label: "Country" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "current_month_minutes", label: "Minutes" },
  { key: "current_month_sms", label: "SMS" },
  { key: "cost_cents", label: "Cost" },
  { key: "last_active", label: "Last active" },
];

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatCost(cents) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }) {
  const styles = {
    active: "status-badge-success",
    trial: "bg-blue-50 text-blue-700",
    suspended: "bg-red-50 text-red-700",
  };

  const label = status
    ? status.charAt(0).toUpperCase() + status.slice(1)
    : "Unknown";

  return (
    <span
      className={`inline-flex w-[80px] justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
        styles[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {label}
    </span>
  );
}

function Accounts({
  onSelectAccount,
  dateRange,
  onDateRangeChange,
  selectedAccountIds = new Set(),
  onToggleSelectAccount,
  onToggleSelectAllCurrentPage,
  onClearSelection,
}) {
  const [accounts, setAccounts] = useState([]);
  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [country, setCountry] = useState("");
  const [debouncedCountry, setDebouncedCountry] = useState("");

  // Synchronized with parent dateRange
  const dateFrom = dateRange?.from || "";
  const dateTo = dateRange?.to || "";

  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState("asc");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // Summary chart state for direct visual synchronization with the date range
  const [showChart, setShowChart] = useState(true);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [selectedMetric, setSelectedMetric] = useState("minutes");
  const [summaryRetryCount, setSummaryRetryCount] = useState(0);

  // Tracks whether the first request has already been attempted.
  const hasLoadedRef = useRef(false);

  // Header checkbox indeterminate ref for accessible multi-selection
  const headerCheckboxRef = useRef(null);

  // Debounce search to avoid sending a request for every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  // Debounce country input so typing does not send one request per character.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCountry(country.trim().toUpperCase());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [country]);

  // Prepare parameters for the API.
  const requestParams = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch,
      status,
      plan,
      country: debouncedCountry,
      date_from: dateFrom,
      date_to: dateTo,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    [
      page,
      pageSize,
      debouncedSearch,
      status,
      plan,
      debouncedCountry,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
    ]
  );

  // Fetch accounts with AbortController for stale request cancellation and smooth 30s polling
  useEffect(() => {
    let cancelled = false;
    let timer;
    const abortController = new AbortController();

    async function loadAccounts() {
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await getAccounts(requestParams, {
          signal: abortController.signal,
        });

        if (cancelled) return;

        const records = result.data || [];
        const recordCount = result.total || 0;

        setAccounts(records);
        setTotal(recordCount);
        setError("");

        hasLoadedRef.current = true;

        // Correct the page if total count decreased
        const maxPage = Math.max(1, Math.ceil(recordCount / pageSize));
        if (page > maxPage) {
          setPage(maxPage);
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return; // Aborted cleanly
        }
        if (!cancelled) {
          setError(err.message || "Unable to load accounts.");
          hasLoadedRef.current = true;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);

          // Schedule next background refresh in 30 seconds
          timer = setTimeout(loadAccounts, 30000);
        }
      }
    }

    loadAccounts();

    return () => {
      cancelled = true;
      abortController.abort();
      clearTimeout(timer);
    };
  }, [requestParams, retryCount, pageSize, page]);

  // Fetch summary chart when date range changes — ensures BOTH chart and table update simultaneously
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function fetchSummary() {
      setSummaryLoading(true);
      setSummaryError("");

      try {
        const result = await getAccountSummary(
          {
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
          },
          { signal: abortController.signal }
        );

        if (!cancelled) {
          setSummaryData(result);
          setSummaryError("");
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return;
        }
        if (!cancelled) {
          setSummaryData(null);
          setSummaryError(err.message || "Unable to load chart data.");
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    }

    fetchSummary();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [dateFrom, dateTo, summaryRetryCount]);

  const retrySummary = useCallback(() => {
    setSummaryRetryCount((count) => count + 1);
  }, []);

  // Handle column sorting.
  function changeSort(column) {
    if (sortBy === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }

    setPage(1);
  }

  // Reset all filters.
  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatus("");
    setPlan("");
    setCountry("");
    setDebouncedCountry("");
    onDateRangeChange?.({ from: "", to: "" });
    setPage(1);
  }

  // Row selection logic
  const currentPageIds = useMemo(
    () => accounts.map((account) => account.id),
    [accounts]
  );

  const isAllCurrentPageSelected = useMemo(
    () =>
      currentPageIds.length > 0 &&
      currentPageIds.every((id) => selectedAccountIds.has(id)),
    [currentPageIds, selectedAccountIds]
  );

  const isSomeCurrentPageSelected = useMemo(
    () =>
      currentPageIds.some((id) => selectedAccountIds.has(id)),
    [currentPageIds, selectedAccountIds]
  );

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate =
        isSomeCurrentPageSelected && !isAllCurrentPageSelected;
    }
  }, [isSomeCurrentPageSelected, isAllCurrentPageSelected]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, total);
  const showInitialError = error && accounts.length === 0 && !loading;

  return (
    <div className="space-y-5">
      {/* Account count and refresh status */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-gray-500">Total registered accounts</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatNumber(total)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowChart((prev) => !prev)}
            className="ui-button ui-button-secondary !py-1 text-xs"
          >
            {showChart ? "Hide summary chart" : "Show summary chart"}
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span
              className={`h-2 w-2 rounded-full ${
                refreshing ? "bg-yellow-400 animate-pulse" : "bg-green-500"
              }`}
            />
            {refreshing
              ? "Updating live data..."
              : "Auto-refresh active (30s)"}
          </div>
        </div>
      </div>

      {/* Date-range filter updating both chart and table */}
      <section className="space-y-4 border-b border-gray-200 pb-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label
              htmlFor="account-search"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Search accounts
            </label>
            <input
              id="account-search"
              type="search"
              className="ui-input"
              placeholder="Search name, email or company..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="status-filter"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Status
            </label>
            <select
              id="status-filter"
              className="ui-select"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="plan-filter"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Plan
            </label>
            <select
              id="plan-filter"
              className="ui-select"
              value={plan}
              onChange={(event) => {
                setPlan(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All plans</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="country-filter"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Country code
            </label>
            <input
              id="country-filter"
              className="ui-input"
              placeholder="e.g. IN, US, CA"
              maxLength={2}
              value={country}
              onChange={(event) => {
                setCountry(event.target.value.toUpperCase());
                setPage(1);
              }}
            />
          </div>

          <div>
            <label
              htmlFor="signup-from"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Date range: From
            </label>
            <input
              id="signup-from"
              type="date"
              className="ui-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => {
                onDateRangeChange?.({
                  from: event.target.value,
                  to: dateTo,
                });
                setPage(1);
              }}
            />
          </div>

          <div>
            <label
              htmlFor="signup-to"
              className="mb-1.5 block text-xs font-medium text-gray-600"
            >
              Date range: To
            </label>
            <input
              id="signup-to"
              type="date"
              className="ui-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => {
                onDateRangeChange?.({
                  from: dateFrom,
                  to: event.target.value,
                });
                setPage(1);
              }}
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="ui-button ui-button-secondary w-full"
            >
              Clear filters
            </button>
          </div>
        </div>
      </section>

      {/* Summary Chart directly above table, updating synchronously with the date filter */}
      {showChart && (
        <UsageChart
          data={summaryData?.series || []}
          loading={summaryLoading}
          error={summaryError}
          onRetry={retrySummary}
          selectedMetric={selectedMetric}
          onMetricChange={setSelectedMetric}
        />
      )}

      {/* Initial loading error */}
      {showInitialError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-5"
        >
          <p className="text-sm font-medium text-red-700">
            Unable to load accounts.
          </p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="ui-button ui-button-secondary mt-3"
          >
            Try again
          </button>
        </div>
      )}

      {/* Persistent Selection Bar */}
      {selectedAccountIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-2 text-xs text-blue-900 transition-all">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-blue-800">
              {selectedAccountIds.size}
            </span>
            <span>
              {selectedAccountIds.size === 1 ? "account" : "accounts"} selected
              across pages
            </span>
          </div>

          <button
            type="button"
            onClick={onClearSelection}
            className="font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Accounts table */}
      <section className="ui-card !p-0">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              All accounts
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Select accounts using checkboxes or click to configure settings.
            </p>
          </div>

          {error && accounts.length > 0 && (
            <span className="text-xs text-red-600" role="status">
              Refresh failed. Showing previous data.
            </span>
          )}
        </div>

        {/* Table loading */}
        {loading && accounts.length === 0 ? (
          <div className="space-y-3 p-5" aria-label="Loading accounts">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-12 animate-pulse rounded-md bg-gray-100"
              />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-gray-900">No accounts found</p>
            <p className="mt-1 text-sm text-gray-500">
              Try changing your search or filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="ui-button ui-button-secondary mt-4"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="accounts-table w-full min-w-[1200px] text-left text-[13px]">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-gray-50 text-sm font-semibold text-gray-500">
                <tr>
                  {/* Select All on Current Page Checkbox */}
                  <th
                    scope="col"
                    className="px-4 py-3.5 text-center"
                    aria-label="Select all on this page"
                  >
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={isAllCurrentPageSelected}
                      onChange={() =>
                        onToggleSelectAllCurrentPage?.(currentPageIds)
                      }
                      aria-label="Select all accounts on this page"
                    />
                  </th>

                  {SORTABLE_COLUMNS.map((column) => {
                    const isStatus = column.key === "status";
                    const isNumeric = [
                      "current_month_minutes",
                      "current_month_sms",
                      "cost_cents",
                    ].includes(column.key);

                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          sortBy === column.key
                            ? sortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className={`whitespace-nowrap px-4 py-3.5 font-semibold tracking-tight ${
                          isStatus
                            ? "text-center"
                            : isNumeric
                              ? "text-right"
                              : "text-left"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => changeSort(column.key)}
                          className={`inline-flex w-full items-center gap-1 hover:text-gray-900 ${
                            isStatus
                              ? "justify-center"
                              : isNumeric
                                ? "justify-end"
                                : "justify-start"
                          }`}
                        >
                          {column.label}
                          <span aria-hidden="true">
                            {sortBy === column.key
                              ? sortDir === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}

                  <th
                    scope="col"
                    className="px-4 py-3.5 text-center font-semibold tracking-tight"
                  >
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="accounts-table-body">
                {accounts.map((account) => {
                  const isSelected = selectedAccountIds.has(account.id);

                  return (
                    <tr
                      key={account.id}
                      onClick={() => onToggleSelectAccount?.(account.id)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-50/70 hover:bg-blue-100/60"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {/* Checkbox cell */}
                      <td
                        className="px-4 py-4 text-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => onToggleSelectAccount?.(account.id)}
                          aria-label={`Select account ${account.name}`}
                        />
                      </td>

                      <td className="px-4 py-4">
                        <div className="min-w-[180px]">
                          <p className="text-[13px] font-semibold text-gray-900">
                            {account.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            {account.email}
                          </p>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        {account.company || "—"}
                      </td>

                      <td className="px-4 py-4 text-gray-600">
                        {account.country || "—"}
                      </td>

                      <td className="px-4 py-4 capitalize text-gray-600">
                        {account.plan || "—"}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <StatusBadge status={account.status} />
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums text-gray-600">
                        {formatNumber(account.current_month_minutes)}
                      </td>

                      <td className="px-4 py-4 text-right tabular-nums text-gray-600">
                        {formatNumber(account.current_month_sms)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-gray-600">
                        {formatCost(account.cost_cents)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        {formatDate(account.last_active)}
                      </td>

                      <td
                        className="px-4 py-4 text-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectAccount?.(account.id);
                          }}
                          className="whitespace-nowrap font-medium text-blue-600 hover:text-blue-800"
                        >
                          Configure →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-col justify-between gap-4 border-t border-gray-100 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <label htmlFor="page-size">Rows per page</label>

            <select
              id="page-size"
              className="ui-select !min-h-8 !w-auto !py-1"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            <span>
              Showing {firstRecord}–{lastRecord} of {formatNumber(total)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="ui-button ui-button-secondary !min-h-8 !px-3 text-xs"
            >
              Previous
            </button>

            <span className="px-2 text-xs text-gray-600">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="ui-button ui-button-secondary !min-h-8 !px-3 text-xs"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Accounts;
