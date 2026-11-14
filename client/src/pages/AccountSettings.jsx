
import { useEffect, useRef, useState } from "react";
import {
  getAccount,
  getAccountSettings,
  saveSettingsStep,
  submitAccountSettings,
} from "../services/api";

const STEP_TITLES = [
  "Basic information",
  "Plan and billing",
  "Usage limits",
  "Webhook configuration",
];

const EMPTY_FORM = {
  1: { name: "", email: "" },
  2: { plan: "", billing_country: "" },
  3: { minutes_cap: "", sms_cap: "" },
  4: { webhook_url: "" },
};

// Restore previously saved data.
function getFormFromDraft(draft, account) {
  return {
    1: {
      name: draft?.["1"]?.name ?? account?.name ?? "",
      email: draft?.["1"]?.email ?? account?.email ?? "",
    },
    2: {
      plan: draft?.["2"]?.plan ?? account?.plan ?? "",
      billing_country: draft?.["2"]?.billing_country ?? "",
    },
    3: {
      minutes_cap: draft?.["3"]?.minutes_cap ?? "",
      sms_cap: draft?.["3"]?.sms_cap ?? "",
    },
    4: {
      webhook_url: draft?.["4"]?.webhook_url ?? "",
    },
  };
}

// Validate fields before sending them to the API.
function validateStep(step, values) {
  const errors = {};

  if (step === 1) {
    if (!values.name.trim()) {
      errors.name = "Name is required.";
    }

    if (!values.email.trim()) {
      errors.email = "Email is required.";
    } else if (!values.email.includes("@")) {
      errors.email = "Enter a valid email address.";
    }
  }

  if (step === 2) {
    if (!values.plan) {
      errors.plan = "Please select a plan.";
    }

    if (!values.billing_country) {
      errors.billing_country = "Please select a billing country.";
    }
  }

  if (step === 4 && values.webhook_url.trim()) {
    if (
      !values.webhook_url.startsWith("http://") &&
      !values.webhook_url.startsWith("https://")
    ) {
      errors.webhook_url = "URL must start with http:// or https://.";
    }
  }

  return errors;
}

function AccountSettings({ accountId }) {
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [savedSteps, setSavedSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverMessage, setServerMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  // Refs keep the latest form values available to async functions.
  const formRef = useRef(form);
  const savedFormRef = useRef(savedForm);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    savedFormRef.current = savedForm;
  }, [savedForm]);

  // Load account details and saved drafts.
  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;

    async function fetchSettings() {
      try {
        const [accountResult, draftResult] = await Promise.all([
          getAccount(accountId),
          getAccountSettings(accountId),
        ]);

        if (cancelled) return;

        const restoredForm = getFormFromDraft(
          draftResult,
          accountResult
        );

        const completedSteps = Object.keys(draftResult || {})
          .map(Number)
          .filter((step) => step >= 1 && step <= 4);

        setAccount(accountResult);
        setForm(restoredForm);
        setSavedForm(restoredForm);
        setSavedSteps(completedSteps);
        setCurrentStep(1);
        setFieldErrors({});
        setServerMessage("");
        setSuccessMessage("");
        setLoadError("");
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error.message || "Unable to load account settings."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, [accountId, retryCount]);

  // Update a field in the current step.
  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [currentStep]: {
        ...previous[currentStep],
        [field]: value,
      },
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [field]: "",
    }));

    setServerMessage("");
    setSuccessMessage("");
  }

  function goToStep(step) {
    setCurrentStep(step);
    setFieldErrors({});
    setServerMessage("");
    setSuccessMessage("");
  }

  // Save the current step.
  async function saveCurrentStep() {
    const values = { ...formRef.current[currentStep] };

    // Convert numeric fields before sending them.
    if (currentStep === 3) {
      values.minutes_cap =
        values.minutes_cap === "" ? null : Number(values.minutes_cap);

      values.sms_cap =
        values.sms_cap === "" ? null : Number(values.sms_cap);
    }

    const localErrors = validateStep(currentStep, values);

    setFieldErrors(localErrors);
    setServerMessage("");
    setSuccessMessage("");

    if (Object.keys(localErrors).length > 0) {
      return false;
    }

    setSaving(true);

    try {
      const result = await saveSettingsStep(
        accountId,
        currentStep,
        values
      );

      const returnedData = result.data || values;

      setSavedForm((previous) => ({
        ...previous,
        [currentStep]: returnedData,
      }));

      setSavedSteps((previous) =>
        previous.includes(currentStep)
          ? previous
          : [...previous, currentStep]
      );

      setSuccessMessage("Draft saved successfully.");
      return true;
    } catch (error) {
      const response = error.data?.detail;

      // Handle errors reported for a particular step.
      if (response?.step) {
        const errorStep = Number(response.step);

        setCurrentStep(errorStep);
        setFieldErrors(response.errors || {});
        setServerMessage(
          "The server rejected this step. Review the highlighted fields."
        );
      } else {
        setServerMessage(
          error.message || "Unable to save this step."
        );
      }

      // Restore only the step whose save request failed.
      // Other steps remain unchanged.
      setForm((previous) => ({
        ...previous,
        [currentStep]: savedFormRef.current[currentStep],
      }));

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    const saved = await saveCurrentStep();

    if (saved && currentStep < 4) {
      goToStep(currentStep + 1);
    }
  }

  // Save the final step and submit all settings.
  async function handleSubmit() {
    const saved = await saveCurrentStep();

    if (!saved) return;

    setSubmitting(true);
    setServerMessage("");
    setSuccessMessage("");

    try {
      await submitAccountSettings(accountId);

      setSuccessMessage(
        "Account settings submitted successfully."
      );
    } catch (error) {
      const detail = error.data?.detail;

      if (detail?.missing_steps?.length) {
        const firstMissing = Number(detail.missing_steps[0]);

        setCurrentStep(firstMissing);
        setServerMessage(
          `Please complete Step ${firstMissing} before submitting.`
        );
      } else {
        setServerMessage(
          error.message || "Unable to submit account settings."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!accountId) {
    return (
      <div className="settings-summary">
        <p className="text-sm font-medium text-gray-900">
          No account selected
        </p>

        <p className="mt-1 text-sm text-gray-500">
          Open the Accounts page and select an account to configure it.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ui-card space-y-4" aria-label="Loading settings">
        <div className="h-5 w-48 animate-pulse rounded bg-gray-100" />
        <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
        <div className="h-32 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ui-card" role="alert">
        <p className="font-medium text-red-700">
          Unable to load account settings.
        </p>

        <p className="mt-1 text-sm text-gray-500">
          {loadError}
        </p>

        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setRetryCount((count) => count + 1);
          }}
          className="ui-button ui-button-secondary mt-4"
        >
          Retry
        </button>
      </div>
    );
  }

  const values = form[currentStep];
  const isLastStep = currentStep === 4;

  return (
    <div className="settings-page space-y-5">
      {/* Account heading */}
      <div className="ui-card">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Configuring account
        </p>

        <h2 className="mt-1 text-lg font-semibold text-gray-900">
          {account?.name || "Account"}
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          {account?.email || `Account ID: ${accountId}`}
        </p>
      </div>

      {/* Step navigation */}
      <section className="settings-steps">
        <div className="settings-step-grid">
          {STEP_TITLES.map((title, index) => {
            const step = index + 1;
            const active = currentStep === step;
            const completed = savedSteps.includes(step);

            return (
              <button
                key={step}
                type="button"
                onClick={() => goToStep(step)}
                aria-current={active ? "step" : undefined}
                className={`settings-step-button rounded-md border p-3 text-left focus-visible:border-green-500 ${
                  active
                    ? "is-active border-green-500"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold leading-none ${
                      completed
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {completed ? "✓" : step}
                  </span>

                  {completed && (
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-green-700">
                      Saved
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs font-semibold text-gray-800">
                  Step {step}
                </p>

                <p className="mt-0.5 text-xs text-gray-500">
                  {title}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Current step form */}
      <section className="ui-card">
        <div className="border-b border-gray-100 pb-4">
          <p className="text-xs font-medium text-green-700">
            STEP {currentStep} OF 4
          </p>

          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            {STEP_TITLES[currentStep - 1]}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Your changes are saved when you continue to the next step.
          </p>
        </div>

        {serverMessage && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {serverMessage}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="settings-success-message mt-4 rounded-md border p-3 text-sm"
          >
            {successMessage}
          </div>
        )}

        <div className="mt-5 space-y-4">
          {/* Step 1 */}
          {currentStep === 1 && (
            <>
              <FormField
                label="Account name"
                name="name"
                value={values.name}
                error={fieldErrors.name}
                onChange={updateField}
                placeholder="Enter account name"
              />

              <FormField
                label="Email address"
                name="email"
                type="email"
                value={values.email}
                error={fieldErrors.email}
                onChange={updateField}
                placeholder="name@example.com"
              />
            </>
          )}

          {/* Step 2 */}
          {currentStep === 2 && (
            <>
              <FormField
                label="Subscription plan"
                name="plan"
                type="select"
                value={values.plan}
                error={fieldErrors.plan}
                onChange={updateField}
                options={[
                  { value: "basic", label: "Basic" },
                  { value: "pro", label: "Pro" },
                  { value: "enterprise", label: "Enterprise" },
                ]}
              />

              <FormField
                label="Billing country"
                name="billing_country"
                type="select"
                value={values.billing_country}
                error={fieldErrors.billing_country}
                onChange={updateField}
                options={[
                  { value: "US", label: "United States (US)" },
                  { value: "IN", label: "India (IN)" },
                  { value: "GB", label: "United Kingdom (GB)" },
                  { value: "CA", label: "Canada (CA)" },
                  { value: "AU", label: "Australia (AU)" },
                ]}
              />
            </>
          )}

          {/* Step 3 */}
          {currentStep === 3 && (
            <>
              <FormField
                label="Monthly minutes cap"
                name="minutes_cap"
                type="number"
                min="0"
                value={values.minutes_cap}
                error={fieldErrors.minutes_cap}
                onChange={updateField}
                placeholder="Leave empty for no limit"
              />

              <FormField
                label="Monthly SMS cap"
                name="sms_cap"
                type="number"
                min="0"
                value={values.sms_cap}
                error={fieldErrors.sms_cap}
                onChange={updateField}
                placeholder="Leave empty for no limit"
              />

              <p className="text-xs text-gray-400">
                Both limits are optional. Leave them empty for no limit.
              </p>
            </>
          )}

          {/* Step 4 */}
          {currentStep === 4 && (
            <>
              <FormField
                label="Webhook URL"
                name="webhook_url"
                type="url"
                value={values.webhook_url}
                error={fieldErrors.webhook_url}
                onChange={updateField}
                placeholder="https://example.com/webhook"
              />

              <p className="text-xs text-gray-400">
                Optional. If provided, the URL must start with http:// or https://.
              </p>
            </>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="mt-7 flex flex-col-reverse justify-between gap-3 border-t border-gray-100 pt-4 sm:flex-row">
          <button
            type="button"
            disabled={currentStep === 1 || saving || submitting}
            onClick={() => goToStep(currentStep - 1)}
            className="ui-button ui-button-secondary"
          >
            Previous
          </button>

          {isLastStep ? (
            <button
              type="button"
              disabled={saving || submitting}
              onClick={handleSubmit}
              className="ui-button ui-button-primary"
            >
              {submitting ? "Submitting..." : "Save and submit"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || submitting}
              onClick={handleNext}
              className="ui-button ui-button-primary"
            >
              {saving ? "Saving..." : "Save and continue"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// Reusable input component.
function FormField({
  label,
  name,
  type = "text",
  value,
  error,
  onChange,
  placeholder,
  options = [],
  min,
}) {
  const inputId = `settings-${name}`;
  const errorId = `${inputId}-error`;

  const commonProps = {
    id: inputId,
    name,
    value,
    onChange: (event) => onChange(name, event.target.value),
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? errorId : undefined,
    className: `ui-input ${
      error ? "border-red-500 focus:border-red-500" : ""
    }`,
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-gray-700"
      >
        {label}
      </label>

      {type === "select" ? (
        <select {...commonProps}>
          <option value="">Select an option</option>

          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...commonProps}
          type={type}
          min={min}
          placeholder={placeholder}
        />
      )}

      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default AccountSettings;
