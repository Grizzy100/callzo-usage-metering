
const API_BASE_URL = '/api';

// Convert parameters into a URL query string
function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  return query.toString();
}

// Common function for API requests
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Response may not contain JSON.
  }

  if (!response.ok) {
    const message =
      data?.detail?.message ||
      data?.detail ||
      data?.message ||
      `API request failed with status ${response.status}`;

    const error = new Error(
      typeof message === "string"
        ? message
        : JSON.stringify(message)
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

// Health check
export function getHealth() {
  return apiRequest('/health');
}

// Get accounts with pagination, search, filters and sorting
export function getAccounts(params = {}, options = {}) {
  const query = buildQuery(params);
  return apiRequest(`/accounts${query ? `?${query}` : ''}`, options);
}

// Get account usage summary for the chart
export function getAccountSummary(params = {}, options = {}) {
  const query = buildQuery(params);
  return apiRequest(`/accounts/summary${query ? `?${query}` : ''}`, options);
}

// Get an individual account
export function getAccount(id) {
  return apiRequest(`/accounts/${id}`);
}

// Get saved account settings
export function getAccountSettings(id) {
  return apiRequest(`/accounts/${id}/settings`);
}

// Save a settings step
export function saveSettingsStep(id, step, data) {
  return apiRequest(`/accounts/${id}/settings/step/${step}`, {
    method: 'PUT',
    body: JSON.stringify({ data })
  });
}

// Submit completed account settings
export function submitAccountSettings(id) {
  return apiRequest(`/accounts/${id}/settings/submit`, {
    method: 'POST'
  });
}
