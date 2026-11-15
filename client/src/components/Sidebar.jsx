
function NavIcon({ type }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (type === "overview") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }

  if (type === "accounts") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.75.35l-.06.05h-3.4l-.06-.05a1.7 1.7 0 0 0-1.75-.35l-.08.02-1.7-2.94.06-.06A1.7 1.7 0 0 0 9.6 15l-.08-.04v-3.4l.08-.04a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-2.94.08.02a1.7 1.7 0 0 0 1.75-.35l.06-.05h3.4l.06.05a1.7 1.7 0 0 0 1.75.35l.08-.02 1.7 2.94-.06.06A1.7 1.7 0 0 0 19.4 11.5l.08.04v3.4z" transform="translate(-2 -1)" />
    </svg>
  );
}

function Sidebar({ activePage, onNavigate, isOpen, onClose }) {
  const menuItems = [
    { id: "overview", label: "Overview" },
    { id: "accounts", label: "Accounts" },
    { id: "settings", label: "Account Settings" },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      <aside
        id="main-sidebar"
        aria-label="Main navigation"
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[232px] flex-col
          sidebar-shell
          transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center gap-3 px-4">
          <img
            src="/callzo-logo-light.svg"
            alt="Callzo logo"
            className="sidebar-logo sidebar-logo-light h-9 w-auto"
          />
          <img
            src="/callzo-logo-dark.svg"
            alt="Callzo logo"
            className="sidebar-logo sidebar-logo-dark h-9 w-auto"
          />

          <div>
            <p className="text-base font-extrabold tracking-tight text-gray-900">
              callzo<span className="text-green-600">.</span>
            </p>
            <p className="text-[11px] text-gray-400">
              Admin workspace
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Workspace
          </p>

          {menuItems.map((item) => {
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                aria-current={isActive ? "page" : undefined}
                className={`
                  flex w-full items-center gap-3 rounded-md px-3 py-2
                  text-sm font-medium transition-colors
                  ${
                    isActive
                      ? "border-l-2 border-green-600 bg-green-50/70 text-green-700"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }
                `}
              >
                <NavIcon type={item.id} />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

      </aside>
    </>
  );
}

export default Sidebar;
