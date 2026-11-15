
function StatIcon({ type }) {
  const common = {
    width: 21,
    height: 21,
    className: "metric-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (type === "accounts") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8M16 14a5.5 5.5 0 0 1 4.5 5" />
      </svg>
    );
  }

  if (type === "minutes") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (type === "sms") {
    return (
      <svg {...common}>
        <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
        <path d="M7.5 11.5h.01M12 11.5h.01M16.5 11.5h.01" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        $
      </text>
    </svg>
  );
}

function StatCard({ title, value, description, icon, loading }) {
  return (
    <div className="metric-block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>

          <div className="mt-3">
            {loading ? (
              <div className="h-8 w-28 animate-pulse rounded bg-gray-100" />
            ) : (
              <p className="text-2xl font-semibold tracking-tight text-gray-900">
                {value}
              </p>
            )}
          </div>

          <p className="mt-2 text-xs text-gray-400">{description}</p>
        </div>

        <StatIcon type={icon} />
      </div>
    </div>
  );
}

export default StatCard;
