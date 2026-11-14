import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

const Overview = lazy(() => import("./pages/Overview"));
const Accounts = lazy(() => import("./pages/Accounts"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));

const pages = {
  overview: {
    title: "Overview",
    heading: "Usage overview",
    description: "Monitor account activity and communication usage.",
  },
  accounts: {
    title: "Accounts",
    heading: "Manage accounts",
    description: "Search, filter and manage your customer accounts.",
  },
  settings: {
    title: "Account Settings",
    heading: "Account configuration",
    description: "Manage account details, plans and usage limits.",
  },
};

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    from: formatDate(start),
    to: formatDate(end),
  };
}

function NotFound() {
  return (
    <div className="empty-state ui-card">
      <div className="empty-state-icon">404</div>
      <p className="eyebrow">Page not found</p>
      <h1 className="mt-2 text-xl font-bold text-gray-900">
        That workspace view does not exist.
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        Use the navigation to return to your account workspace.
      </p>
    </div>
  );
}

function PageFallback() {
  return (
    <div
      className="ui-card flex min-h-[320px] items-center justify-center text-sm text-gray-500"
      aria-label="Loading page"
    >
      Loading page...
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(null);

  // Shared date range synchronized across the Summary Chart and Accounts Table
  const [dateRange, setDateRange] = useState(getDefaultDates);

  // Stable row selection preserved across pagination, sorting, and background refreshes
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => new Set());

  const toggleSelectAccount = useCallback((id) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAllCurrentPage = useCallback((currentPageIds) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => next.has(id));
      if (allSelected) {
        currentPageIds.forEach((id) => next.delete(id));
      } else {
        currentPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAccountIds(new Set());
  }, []);

  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem("callzo-theme");

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("callzo-theme", theme);
  }, [theme]);

  const currentPage = pages[activePage] || pages.overview;
  const isUnknownPath =
    window.location.pathname !== "/" &&
    window.location.pathname !== "/index.html";

  if (isUnknownPath) {
    return <NotFound />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="app-main">
        <main className="app-content">
          <Header
            title={currentPage.title}
            onMenuClick={() => setIsSidebarOpen(true)}
            theme={theme}
            onToggleTheme={() =>
              setTheme((current) =>
                current === "dark" ? "light" : "dark"
              )
            }
          />

          <div className="page-intro">
            <h1>{currentPage.heading}</h1>
            <p>{currentPage.description}</p>
          </div>

          <Suspense fallback={<PageFallback />}>
            {activePage === "overview" && (
              <Overview
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
              />
            )}

            {activePage === "accounts" && (
              <Accounts
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                selectedAccountIds={selectedAccountIds}
                onToggleSelectAccount={toggleSelectAccount}
                onToggleSelectAllCurrentPage={toggleSelectAllCurrentPage}
                onClearSelection={clearSelection}
                onSelectAccount={(accountId) => {
                  setSelectedAccountId(accountId);
                  setActivePage("settings");
                }}
              />
            )}

            {activePage === "settings" && (
              <AccountSettings
                key={selectedAccountId || "no-account"}
                accountId={selectedAccountId}
              />
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default App;
