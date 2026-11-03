import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import { Doughnut, Bar, Line, Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
} from "chart.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler
);

const statuses = [
  "Wishlist",
  "Applying",
  "Applied",
  "Application Received",
  "In Review",
  "Under Review",
  "Shortlisted",
  "Interview Scheduled",
  "Assessment",
  "Selected",
  "Offer Received",
  "Screening",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];

const JOB_ROLE_OPTIONS = [
  "Data Analyst",
  "Data Scientist",
  "Python Developer",
  "Software Engineer",
  "Software Developer",
  "Backend Developer",
  "Frontend Developer",
  "Full Stack Developer",
  "React Developer",
  "Java Developer",
  "Machine Learning Engineer",
  "AI Engineer",
  "ML Engineer",
  "Data Engineer",
  "DevOps Engineer",
  "Cloud Engineer",
  "SQL Developer",
  "Business Analyst",
  "Web Developer",
  "QA Engineer",
  "Test Engineer",
  "Product Analyst",
  "Product Manager",
  "Cybersecurity Analyst",
  "Security Engineer",
  "Site Reliability Engineer",
  "iOS Developer",
  "Android Developer",
  "Mobile App Developer",
  "UI/UX Designer",
  "UX Designer",
  "Technical Writer",
  "Database Administrator",
  "Network Engineer",
  "Systems Administrator",
  "Salesforce Developer",
  ".NET Developer",
  "PHP Developer",
  "Go Developer",
  "Rust Developer",
  "ETL Developer",
  "Data Warehouse Engineer",
  "Research Scientist",
  "Prompt Engineer",
  "Technical Project Manager",
  "Scrum Master",
  "Other",
];

const RECOMMENDED_JOB_LOCATIONS = [
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Mumbai",
  "Delhi",
  "New Delhi",
  "Chennai",
  "Kolkata",
  "Ahmedabad",
  "Gurugram",
  "Noida",
  "Kochi",
  "Thiruvananthapuram",
  "Jaipur",
  "Chandigarh",
  "Indore",
  "Coimbatore",
  "Mysuru",
  "Visakhapatnam",
  "Nagpur",
  "Surat",
  "Vadodara",
  "Bhopal",
  "Lucknow",
  "Bhubaneswar",
  "Remote",
  "All India",
];


const statusIcons = {
  Wishlist: "☆",
  Applying: "↻",
  Applied: "●",
  "Application Received": "✓",
  "Under Review": "◉",
  Shortlisted: "★",
  "Interview Scheduled": "◎",
  Assessment: "▣",
  Selected: "✓",
  "Offer Received": "✦",
  Screening: "◉",
  Interview: "◎",
  Offer: "✓",
  Rejected: "×",
  Withdrawn: "−",
};
// ============================================================
// JOBTRACKER GLOBAL DATA SYNCHRONIZATION
// ============================================================

const JOBTRACKER_SYNC_EVENT = "jobtracker:data-changed";
const JOBTRACKER_POLL_INTERVAL = 10000;

const dispatchJobTrackerSync = (detail = {}) => {
  try {
    window.dispatchEvent(
      new CustomEvent(JOBTRACKER_SYNC_EVENT, {
        detail: {
          ...detail,
          timestamp: Date.now(),
        },
      })
    );
  } catch {
    window.dispatchEvent(new Event(JOBTRACKER_SYNC_EVENT));
  }
};

const cacheBustParams = () => ({
  _t: Date.now(),
});

const apiGetJobs = () =>
  api.get("/jobs", {
    params: cacheBustParams(),
  });

const syncMailboxApplicationStatuses = async () => {
  const connectionResponse = await api.get("/recruiter-messages/status");
  if (!connectionResponse.data?.connected) {
    return { connected: false, messages: [] };
  }

  const messagesResponse = await api.get("/recruiter-messages");
  return {
    connected: true,
    messages: Array.isArray(messagesResponse.data)
      ? messagesResponse.data
      : [],
  };
};

const apiGetInterviews = () =>
  api.get("/interviews", {
    params: cacheBustParams(),
  });

const createSyncRefresh = (refresh) => {
  const onDataChanged = () => {
    refresh();
  };

  const onFocus = () => {
    refresh();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  };

  window.addEventListener(JOBTRACKER_SYNC_EVENT, onDataChanged);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      refresh();
    }
  }, JOBTRACKER_POLL_INTERVAL);

  return () => {
    window.removeEventListener(JOBTRACKER_SYNC_EVENT, onDataChanged);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearInterval(timer);
  };
};

const LOCATION_OPTIONS = [
  "All Locations",
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Ireland", "Netherlands", "Singapore", "United Arab Emirates", "Japan",
  "New Zealand", "Switzerland", "Sweden", "Denmark", "Norway", "Finland",
  "Spain", "Italy", "Belgium", "Austria", "South Korea", "Hong Kong", "Saudi Arabia",
  "Qatar", "South Africa", "Brazil", "Mexico"
];

const GLOBAL_SKILLS = [
  { name: "Python", value: 1200 }, { name: "SQL", value: 1100 },
  { name: "JavaScript", value: 980 }, { name: "React", value: 860 },
  { name: "AWS", value: 790 }, { name: "Docker", value: 720 },
  { name: "Java", value: 680 }, { name: "Kubernetes", value: 610 },
  { name: "Git", value: 570 }, { name: "FastAPI", value: 520 }
];

const LOCATION_GROUPS = [
  { label: "India", options: LOCATION_OPTIONS.slice(0, 37) },
  { label: "International", options: LOCATION_OPTIONS.slice(37) },
];

function LocationSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 330 });
  const ref = React.useRef(null);

  const updateMenuPosition = () => {
    const trigger = ref.current?.querySelector(".location-picker-trigger");
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const maxHeight = Math.min(390, window.innerHeight - 24);
    const top = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - maxHeight - 12));
    setMenuPosition({ top, left, width });
  };

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const handleMove = () => updateMenuPosition();
    window.addEventListener("resize", handleMove);
    window.addEventListener("scroll", handleMove, true);
    return () => {
      window.removeEventListener("resize", handleMove);
      window.removeEventListener("scroll", handleMove, true);
    };
  }, [open]);

  const filteredGroups = LOCATION_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase())),
  })).filter((group) => group.options.length);

  const choose = (location) => {
    onChange(location);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={`location-picker ${open ? "open" : ""}`} ref={ref}>
      <button type="button" className="location-picker-trigger" onClick={(event) => {
        event.stopPropagation();
        setOpen((v) => !v);
      }} aria-expanded={open}>
        <span className="location-picker-icon">⌖</span>
        <span className="location-picker-value" title={value}>{value}</span>
        <span className="location-picker-chevron">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <div
          className="location-picker-menu location-picker-menu-fixed"
          style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="location-picker-search">
            <span>⌕</span>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search state or country..." />
            {query && <button type="button" onClick={() => setQuery("")}>×</button>}
          </div>
          <div className="location-picker-list">
            {filteredGroups.length ? filteredGroups.map((group) => (
              <div className="location-group" key={group.label}>
                <div className="location-group-title">{group.label}</div>
                {group.options.map((location) => (
                  <button type="button" key={location} className={`location-option ${value === location ? "selected" : ""}`} onClick={() => choose(location)}>
                    <span>{location}</span>{value === location && <b>✓</b>}
                  </button>
                ))}
              </div>
            )) : <div className="location-empty">No matching location found.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuSelect({ value, onChange, options, placeholder = "Select" }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const ref = React.useRef(null);
  const triggerRef = React.useRef(null);

  const updateMenuPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const desiredHeight = Math.min(280, Math.max(44, options.length * 40 + 10));
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < Math.min(180, desiredHeight) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, openUp ? spaceAbove : spaceBelow));

    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      maxHeight,
      top: openUp
        ? Math.max(viewportPadding, rect.top - Math.min(desiredHeight, maxHeight) - 6)
        : rect.bottom + 6,
    });
  };

  useEffect(() => {
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);

    const reposition = () => {
      if (open) updateMenuPosition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, options.length]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (!current) {
        window.requestAnimationFrame(updateMenuPosition);
      }
      return next;
    });
  };

  const selected = options.find((option) => String(option.value) === String(value));

  return (
    <div className={`menu-select ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className="menu-select-trigger"
        ref={triggerRef}
        onClick={toggle}
        aria-expanded={open}
      >
        <span className={selected ? "" : "placeholder"}>
          {selected?.label || placeholder}
        </span>
        <span className="menu-select-chevron">{open ? "⌃" : "⌄"}</span>
      </button>

      {open && (
        <div className="menu-select-menu menu-select-menu-fixed" style={menuStyle}>
          {options.length ? options.map((option) => (
            <button
              type="button"
              key={String(option.value)}
              className={`menu-select-option ${String(option.value) === String(value) ? "selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <b>✓</b>}
            </button>
          )) : (
            <div className="menu-select-empty">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}

function normalizeAccounts() {
  try { return JSON.parse(localStorage.getItem("jobtracker_accounts") || "[]"); }
  catch { return []; }
}

function saveAccount(user, token) {
  const accounts = normalizeAccounts().filter((a) => a.email !== user.email);
  accounts.unshift({ name: user.name, email: user.email, token });
  localStorage.setItem("jobtracker_accounts", JSON.stringify(accounts.slice(0, 8)));
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accounts, setAccounts] = useState(() => normalizeAccounts());
  const selectAccount = (account) => {
    setForm((current) => ({
      ...current,
      email: account.email,
      password: "",
    }));

    setAccountMenuOpen(false);
    setError("");
  };

  const removeSavedAccount = (email) => {
    const next = normalizeAccounts().filter(
      (account) => account.email !== email
    );

    localStorage.setItem(
      "jobtracker_accounts",
      JSON.stringify(next)
    );

    setAccounts(next);

    if (form.email === email) {
      setForm((current) => ({
        ...current,
        email: "",
        password: "",
      }));
    }
  };

  const submit = async (e) => {
  e.preventDefault();

  setError("");
  setBusy(true);

  const email = String(form.email || "")
    .trim()
    .toLowerCase();

  const password = String(form.password || "");

  if (!email) {
    setError("Please enter your email address.");
    setBusy(false);
    return;
  }

  if (!password) {
    setError("Please enter your password.");
    setBusy(false);
    return;
  }

  try {
    const endpoint =
      mode === "login"
        ? "/auth/login"
        : "/auth/register";

    const payload =
      mode === "login"
        ? {
            email,
            password,
          }
        : {
            name: String(form.name || "").trim(),
            email,
            password,
          };

    const response = await api.post(endpoint, payload);

    if (!response.data?.access_token || !response.data?.user) {
      throw new Error("Invalid authentication response from server.");
    }

    localStorage.setItem(
      "token",
      response.data.access_token
    );

    localStorage.setItem(
      "jobtracker_active_email",
      email
    );

    saveAccount(
      response.data.user,
      response.data.access_token
    );

    setAccounts(normalizeAccounts());

    onLogin(response.data.user);

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    console.error("STATUS:", err.response?.status);
    console.error("DATA:", err.response?.data);

    const detail = err.response?.data?.detail;

    if (err.response?.status === 401) {
      setError(
        "Incorrect email or password. Please check your credentials or create the account again."
      );
    } else if (err.response?.status === 404) {
      setError(
        "Authentication service was not found. Check that the backend is running."
      );
    } else if (err.response?.status === 422) {
      setError(
        Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail || "Invalid email or password format."
      );
    } else if (detail) {
      setError(
        Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail
      );
    } else {
      setError(
        "Unable to sign in. Please make sure the backend server is running."
      );
    }
  } finally {
    setBusy(false);
  }
};

  const accountLabel =
    form.email || "Select a saved account";

  return (
    <div className="auth-page">
      <div className="auth-shell">

        {/* LEFT BRAND PANEL */}
        <section className="auth-brand-panel">

          <div className="auth-brand">
            <span className="brand-mark auth-brand-mark">
              JT
            </span>

            <strong>JobTracker</strong>
          </div>

          <div className="auth-brand-copy">

            <span className="auth-kicker">
              AI-POWERED JOB SEARCH
            </span>

            <h1>
              Turn your job search into a system.
            </h1>

            <p>
              Track applications, interviews, resumes
              and skill gaps from one focused workspace.
            </p>

            <div className="auth-feature-list">

              <div>
                <span>✓</span>

                <div>
                  <strong>
                    Application tracking
                  </strong>

                  <small>
                    Keep every opportunity organized.
                  </small>
                </div>
              </div>

              <div>
                <span>✓</span>

                <div>
                  <strong>
                    Interview management
                  </strong>

                  <small>
                    Never lose track of the next round.
                  </small>
                </div>
              </div>

              <div>
                <span>✓</span>

                <div>
                  <strong>
                    AI-ready insights
                  </strong>

                  <small>
                    Understand skills and career gaps.
                  </small>
                </div>
              </div>

            </div>
          </div>

          <div className="auth-brand-footer">
            Your private career workspace
          </div>

        </section>


        {/* RIGHT AUTH PANEL */}
        <section className="auth-form-panel">

          <div className="auth-mobile-brand">
            <span className="brand-mark">
              JT
            </span>

            <strong>
              JobTracker
            </strong>
          </div>


          <div className="auth-form-wrap">

            <div className="auth-heading">

              <span className="auth-kicker">
                WELCOME BACK
              </span>

              <h2>
                {mode === "login"
                  ? "Sign in to your account"
                  : "Create your account"}
              </h2>

              <p>
                {mode === "login"
                  ? "Continue managing your job search."
                  : "Set up your personal job-search workspace."}
              </p>

            </div>


            {/* AUTH FORM */}
            <form
              className="auth-card"
              onSubmit={submit}
              autoComplete="on"
            >

              {/* NAME */}
              {mode === "register" && (
                <label>
                  Full name

                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name: e.target.value,
                      })
                    }
                    required
                  />
                </label>
              )}


              {/* EMAIL */}
              <label>
                Email address

                <div className="auth-account-picker">

                  <input
                    name="username"
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        email: e.target.value,
                      })
                    }
                    required
                  />


                  {/* SAVED ACCOUNT BUTTON */}
                  {mode === "login" &&
                    accounts.length > 0 && (
                      <button
                        type="button"
                        className="auth-account-trigger"
                        aria-label="Select saved account"
                        aria-expanded={accountMenuOpen}
                        onClick={() =>
                          setAccountMenuOpen(
                            (value) => !value
                          )
                        }
                      >
                        ▾
                      </button>
                    )}


                  {/* SAVED ACCOUNT MENU */}
                  {accountMenuOpen && (
                    <div className="auth-account-menu">

                      {accounts.map((account) => (

                        <div
                          className="auth-account-option"
                          key={account.email}
                        >

                          {/* SELECT ACCOUNT */}
                          <button
                            type="button"
                            onClick={() =>
                              selectAccount(account)
                            }
                          >

                            <span className="auth-account-avatar">
                              {account.name
                                ?.slice(0, 1)
                                .toUpperCase() ||
                                account.email
                                  .slice(0, 1)
                                  .toUpperCase()}
                            </span>

                            <span>
                              <strong>
                                {account.email}
                              </strong>

                              <small>
                                {account.name ||
                                  "Saved account"}
                              </small>
                            </span>

                          </button>


                          {/* REMOVE ACCOUNT */}
                          <button
                            type="button"
                            className="auth-account-remove"
                            aria-label={`Remove ${account.email}`}
                            onClick={() =>
                              removeSavedAccount(
                                account.email
                              )
                            }
                          >
                            ×
                          </button>

                        </div>

                      ))}

                    </div>
                  )}

                </div>


                {/* ACCOUNT HINT */}
                {mode === "login" &&
                  accounts.length > 0 && (
                    <small className="auth-field-hint">
                      {accountLabel}
                    </small>
                  )}

              </label>


              {/* PASSWORD */}
              <label>
                Password

                <div className="auth-password-wrap">

                  <input
                    name="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete={
                      mode === "login"
                        ? "current-password"
                        : "new-password"
                    }
                    placeholder="8–72 characters"
                    value={form.password}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        password: e.target.value,
                      })
                    }
                    minLength={8}
                    required
                  />


                  {/* SHOW / HIDE PASSWORD */}
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() =>
                      setShowPassword(
                        (value) => !value
                      )
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2.1 12s3.4-6 9.9-6 9.9 6 9.9 6-3.4 6-9.9 6-9.9-6-9.9-6Z" />
                        <circle cx="12" cy="12" r="2.8" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18" />
                        <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 9.9 7 9.9 7a17.6 17.6 0 0 1-3.1 4.1M6.1 6.2C3.6 8 2.1 12 2.1 12S5.5 19 12 19a10.8 10.8 0 0 0 4.1-.8" />
                        <path d="M9.2 9.2a4 4 0 0 0 5.6 5.6" />
                      </svg>
                    )}
                  </button>

                </div>

              </label>


              {/* ERROR */}
              {error && (
                <div className="auth-error">
                  <span>!</span>
                  {error}
                </div>
              )}


              {/* SUBMIT */}
              <button
                className="auth-submit"
                disabled={busy}
              >
                {busy
                  ? "Please wait…"
                  : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              </button>

            </form>


            {/* LOGIN / REGISTER SWITCH */}
            <div className="auth-switch">

              <span>
                {mode === "login"
                  ? "Don't have an account?"
                  : "Already have an account?"}
              </span>

              <button
                type="button"
                onClick={() => {
                  setError("");

                  setMode(
                    mode === "login"
                      ? "register"
                      : "login"
                  );

                  setAccountMenuOpen(false);
                }}
              >
                {mode === "login"
                  ? "Create one"
                  : "Sign in"}
              </button>

            </div>

          </div>


          <small className="auth-privacy">
            Secure session · Passwords are handled by
            your browser/password manager, not stored
            by JobTracker.
          </small>

        </section>

      </div>
    </div>
  );
}


function AIAnalysis() {
  const [resumes, setResumes] = useState([]);
  const [resumeId, setResumeId] = useState("");

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobDescriptions, setJobDescriptions] = useState([]);

  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [jobAnalysis, setJobAnalysis] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [previousMatches, setPreviousMatches] = useState([]);

  const [loadingData, setLoadingData] = useState(true);
  const [analyzingJob, setAnalyzingJob] = useState(false);
  const [matching, setMatching] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* ============================================================
     MATCH IDENTITY
     Same user + same resume + same job/JD = one match row.
  ============================================================ */

  const getMatchKey = (match) => [
    match?.resume_id ?? "none",
    match?.job_id ?? "none",
    match?.job_description_id ?? "none",
  ].join("|");

  const dedupeMatches = (matches) => {
    const seen = new Set();
    const result = [];

    for (const item of Array.isArray(matches) ? matches : []) {
      const key = getMatchKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }

    return result;
  };

  /* ============================================================
     LOAD RESUMES + JOB DESCRIPTIONS + MATCH HISTORY
  ============================================================ */

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setError("");

      try {
        const [resumeResponse, matchResponse, jdResponse] =
          await Promise.allSettled([
            api.get("/resumes"),
            api.get("/ai/matches"),
            api.get("/ai/job-descriptions"),
          ]);

        if (resumeResponse.status === "fulfilled") {
          const list = Array.isArray(resumeResponse.value.data)
            ? resumeResponse.value.data
            : [];

          setResumes(list);

          if (list.length > 0) {
            setResumeId(String(list[0].id));
          }
        } else {
          setError(
            resumeResponse.reason?.response?.data?.detail ||
              "Unable to load resumes."
          );
        }

        if (matchResponse.status === "fulfilled") {
          const matches = Array.isArray(matchResponse.value.data)
            ? matchResponse.value.data
            : [];

          setPreviousMatches(dedupeMatches(matches));
        }

        if (jdResponse.status === "fulfilled") {
          const descriptions = Array.isArray(jdResponse.value.data)
            ? jdResponse.value.data
            : [];

          setJobDescriptions(descriptions);
        }
      } catch (err) {
        console.error("AI Analysis data loading failed:", err);
        setError(
          err.response?.data?.detail ||
            "Unable to load AI analysis data."
        );
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  const selectedResume = useMemo(
    () =>
      resumes.find(
        (resume) => String(resume.id) === String(resumeId)
      ) || null,
    [resumes, resumeId]
  );

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  /* ============================================================
     RESUME CHANGE
  ============================================================ */

  const handleResumeChange = (value) => {
    setResumeId(String(value));
    setResumeAnalysis(null);
    setMatchResult(null);
    clearMessages();
  };

  /* ============================================================
     ANALYZE JOB DESCRIPTION
  ============================================================ */

  const analyzeJobDescription = async () => {
    clearMessages();

    if (!selectedResume) {
      setError("Please select a resume first.");
      return;
    }

    if (!jobDescription.trim()) {
      setError("Please paste the job description before analyzing it.");
      return;
    }

    if (jobDescription.trim().length < 30) {
      setError("Job description must contain at least 30 characters.");
      return;
    }

    setAnalyzingJob(true);

    try {
      const response = await api.post("/ai/job-description", {
        title: jobTitle.trim() || "Job Description",
        text: jobDescription.trim(),
      });

      setJobAnalysis(response.data);
      setJobTitle(response.data?.title || jobTitle.trim() || "Job Description");
      setMatchResult(null);

      // Keep the job-description list in sync so Recent Match history
      // can display the real job title instead of an ID.
      try {
        const jdResponse = await api.get("/ai/job-descriptions");
        setJobDescriptions(
          Array.isArray(jdResponse.data) ? jdResponse.data : []
        );
      } catch (refreshError) {
        console.warn("Unable to refresh job descriptions:", refreshError);
      }

      setSuccess("Job description analyzed successfully.");
    } catch (err) {
      console.error("Job description analysis failed:", err);
      setJobAnalysis(null);
      setError(
        err.response?.data?.detail ||
          "Unable to analyze the job description."
      );
    } finally {
      setAnalyzingJob(false);
    }
  };

  /* ============================================================
     MATCH RESUME WITH JOB
  ============================================================ */

  const matchResumeToJob = async () => {
    clearMessages();

    if (!selectedResume) {
      setError("Please select a resume first.");
      return;
    }

    if (!jobAnalysis?.id) {
      setError("Please analyze the job description first.");
      return;
    }

    setMatching(true);

    try {
      // Resume analysis is loaded automatically. There is no separate
      // Analyze Resume button in Step 1.
      if (!resumeAnalysis) {
        const resumeResponse = await api.get(
          `/ai/resume/${selectedResume.id}`
        );
        setResumeAnalysis(resumeResponse.data);
      }

      const response = await api.post("/ai/match", {
        resume_id: Number(selectedResume.id),
        job_description_id: Number(jobAnalysis.id),
      });

      setMatchResult(response.data);

      /*
        The backend is the source of truth. Reload Recent Match Analyses
        after every match so an UPDATE is shown as one row instead of
        being appended as a duplicate.
      */
      try {
        const historyResponse = await api.get("/ai/matches");
        const serverMatches = Array.isArray(historyResponse.data)
          ? historyResponse.data
          : [];
        setPreviousMatches(dedupeMatches(serverMatches));
      } catch (historyError) {
        // Fallback keeps the UI correct even if the history refresh fails.
        setPreviousMatches((current) =>
          dedupeMatches([
            response.data,
            ...current.filter(
              (item) => getMatchKey(item) !== getMatchKey(response.data)
            ),
          ])
        );
        console.warn("Unable to refresh match history:", historyError);
      }

      setSuccess(
        "Resume matched successfully. The existing Resume + Job match was updated when it already existed."
      );
    } catch (err) {
      console.error("Resume matching failed:", err);
      setError(
        err.response?.data?.detail ||
          "Unable to match the resume with the job description."
      );
    } finally {
      setMatching(false);
    }
  };

  const clearJobDescription = () => {
    setJobTitle("");
    setJobDescription("");
    setJobAnalysis(null);
    setMatchResult(null);
    clearMessages();
  };

  const getScoreClass = (score) => {
    const value = Number(score || 0);
    if (value >= 80) return "strong";
    if (value >= 60) return "medium";
    return "weak";
  };

  const getJobName = (match) => {
    if (
      jobAnalysis?.id &&
      Number(match?.job_description_id) === Number(jobAnalysis.id)
    ) {
      return jobAnalysis.title || jobTitle || "Job Description";
    }

    const savedJobDescription = jobDescriptions.find(
      (item) => Number(item.id) === Number(match?.job_description_id)
    );

    if (savedJobDescription?.title) {
      return savedJobDescription.title;
    }

    if (match?.job) return match.job;
    if (match?.title) return match.title;
    if (match?.job_id) return `Saved Job #${match.job_id}`;
    if (match?.job_description_id) {
      return `Job Description #${match.job_description_id}`;
    }

    return "Job Description";
  };

  return (
    <div className="ai-analysis-page">
      <section className="ai-analysis-hero">
        <div>
          <div className="eyebrow">AI CAREER ANALYSIS</div>
          <h2>Analyze your resume against a real job description.</h2>
          <p>
            Select a resume, paste a job description, and compare your skills
            with the actual requirements of the role.
          </p>
        </div>
        <div className="ai-analysis-badge">✦ Resume Intelligence</div>
      </section>

      <section className="ai-step-card">
        <div className="ai-step-header">
          <div className="ai-step-number">01</div>
          <div className="ai-step-heading">
            <span className="ai-step-label">STEP 1</span>
            <h3>SELECT RESUME</h3>
            <p>
              Choose the resume version you want to compare against the job
              description.
            </p>
          </div>
        </div>

        <div className="ai-job-form">
          <div className="ai-field">
            <label>Resume version</label>
            <MenuSelect
              value={resumeId}
              onChange={handleResumeChange}
              options={resumes.map((resume) => ({
                value: String(resume.id),
                label: resume.name || `Resume #${resume.id}`,
              }))}
              placeholder={
                loadingData
                  ? "Loading resumes..."
                  : resumes.length
                  ? "Select resume"
                  : "No resumes available"
              }
            />
          </div>

          {selectedResume && (
            <div className="ai-selected-resume-card">
              <div className="ai-selected-resume-icon">CV</div>
              <div>
                <span className="ai-selected-resume-label">SELECTED RESUME</span>
                <strong>{selectedResume.name || `Resume #${selectedResume.id}`}</strong>
              </div>
              <span className="ai-selected-resume-status">Ready</span>
            </div>
          )}
        </div>
      </section>

      <section className="ai-step-card">
        <div className="ai-step-header">
          <div className="ai-step-number">02</div>
          <div className="ai-step-heading">
            <span className="ai-step-label">STEP 2</span>
            <h3>JOB DESCRIPTION</h3>
            <p>
              Paste the complete job description. The analyzer will detect
              required skills and important keywords.
            </p>
          </div>
        </div>

        <div className="ai-job-form">
          <div className="ai-field">
            <label htmlFor="ai-job-title">Job title</label>
            <input
              id="ai-job-title"
              type="text"
              value={jobTitle}
              onChange={(event) => {
                setJobTitle(event.target.value);
                setJobAnalysis(null);
                setMatchResult(null);
                clearMessages();
              }}
              placeholder="Example: Python Developer"
              className="ai-job-title-input"
            />
          </div>

          <div className="ai-field">
            <div className="ai-description-label-row">
              <label htmlFor="ai-job-description">Job description</label>
              <span className="ai-required-label">Required</span>
            </div>

            <textarea
              id="ai-job-description"
              value={jobDescription}
              onChange={(event) => {
                setJobDescription(event.target.value);
                setJobAnalysis(null);
                setMatchResult(null);
                clearMessages();
              }}
              placeholder={
                "Paste the complete job description here...\n\n" +
                "Example:\n" +
                "We are looking for a Python Developer with experience in Python, SQL, FastAPI, REST APIs and PostgreSQL.\n\n" +
                "Responsibilities:\n" +
                "- Develop backend applications\n" +
                "- Build REST APIs\n" +
                "- Work with SQL databases\n\n" +
                "Requirements:\n" +
                "- Strong Python knowledge\n" +
                "- SQL and database experience\n" +
                "- Git/GitHub"
              }
              rows={14}
              className="ai-job-description-input"
            />

            <div className="ai-description-footer">
              <span>{jobDescription.length.toLocaleString()} characters</span>
              <span>
                {jobDescription.length > 0 && jobDescription.length < 30
                  ? "Minimum 30 characters"
                  : "Ready for analysis"}
              </span>
            </div>
          </div>

          <div className="ai-step-actions">
            <button
              type="button"
              className="ai-clear-button"
              onClick={clearJobDescription}
              disabled={!jobTitle && !jobDescription && !jobAnalysis}
            >
              <span className="ai-button-icon">↺</span>
              Clear
            </button>

            <button
              type="button"
              className="ai-analyze-button"
              onClick={analyzeJobDescription}
              disabled={
                analyzingJob ||
                !selectedResume ||
                !jobDescription.trim() ||
                jobDescription.trim().length < 30
              }
            >
              <span className="ai-button-icon">✦</span>
              {analyzingJob ? "Analyzing Job..." : "Analyze Job Description"}
            </button>
          </div>

          {error && <div className="resume-alert error ai-inline-alert">{error}</div>}
          {success && <div className="resume-alert success ai-inline-alert">{success}</div>}

          {jobAnalysis && (
            <div className="ai-job-analysis-result">
              <div className="ai-result-header">
                <div className="ai-result-status">✓</div>
                <div>
                  <div className="ai-result-label">JOB ANALYSIS COMPLETE</div>
                  <h3>{jobAnalysis.title || jobTitle || "Job Description"}</h3>
                </div>
              </div>

              <div className="ai-result-stats">
                <div className="ai-result-stat">
                  <strong>{jobAnalysis.detected_skills?.length || 0}</strong>
                  <span>Skills detected</span>
                </div>
                <div className="ai-result-stat">
                  <strong>{jobAnalysis.keywords?.length || 0}</strong>
                  <span>Keywords detected</span>
                </div>
                <div className="ai-result-stat">
                  <strong>{jobAnalysis.character_count || jobDescription.length || 0}</strong>
                  <span>Characters</span>
                </div>
              </div>

              {jobAnalysis.detected_skills?.length > 0 && (
                <div>
                  <div className="eyebrow">REQUIRED SKILLS</div>
                  <div className="ai-required-skills">
                    {jobAnalysis.detected_skills.map((skill) => (
                      <span className="ai-required-skill" key={skill}>{skill}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {jobAnalysis && (
        <section className="ai-step-card">
          <div className="ai-step-header">
            <div className="ai-step-number">03</div>
            <div className="ai-step-heading">
              <span className="ai-step-label">STEP 3</span>
              <h3>RESUME MATCHING</h3>
              <p>
                Compare your selected resume with the detected requirements of
                this job.
              </p>
            </div>
          </div>

          <div className="ai-job-form">
            <div className="ai-match-preview">
              <div className="ai-match-preview-item">
                <span>RESUME</span>
                <strong>{selectedResume?.name || "Selected resume"}</strong>
              </div>

              <div className="ai-match-arrow" aria-hidden="true">→</div>

              <div className="ai-match-preview-item">
                <span>JOB</span>
                <strong>{jobAnalysis.title || jobTitle || "Job Description"}</strong>
              </div>
            </div>

            <div className="ai-match-flow-note">
              <span className="ai-flow-dot">✓</span>
              <div>
                <strong>Exact match tracking</strong>
                <small>
                  The same resume + same job description updates the existing
                  match instead of creating another history row.
                </small>
              </div>
            </div>

            <div className="ai-step-actions ai-match-action-row">
              <button
                type="button"
                className="ai-analyze-button"
                onClick={matchResumeToJob}
                disabled={matching || !selectedResume || !jobAnalysis?.id}
              >
                <span className="ai-button-icon">✦</span>
                {matching ? "Matching Resume..." : "Match Resume to Job"}
              </button>
            </div>
          </div>
        </section>
      )}

      {resumeAnalysis && (
        <section className="panel ai-analysis-card">
          <div className="eyebrow">RESUME ANALYSIS</div>
          <h3>{resumeAnalysis.name || selectedResume?.name || "Resume"}</h3>
          <p>
            {resumeAnalysis.summary || "Resume analysis completed successfully."}
          </p>

          {resumeAnalysis.detected_skills?.length > 0 && (
            <div className="ai-all-skills-grid" style={{ marginTop: "18px" }}>
              {resumeAnalysis.detected_skills.map((skill) => (
                <span className="ai-resume-skill-pill" key={skill}>{skill}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {matchResult && (
        <>
          <section className="ai-match-result-context">
            <div className="ai-match-result-heading">
              <div>
                <div className="eyebrow">MATCH RESULT</div>
                <h3>Resume-to-job comparison</h3>
              </div>
              <span className={`ai-match-status-badge ${getScoreClass(matchResult.score)}`}>
                {Number(matchResult.score || 0).toFixed(1)}% match
              </span>
            </div>

            <div className="ai-match-result-pair">
              <div className="ai-match-result-box">
                <span>RESUME</span>
                <strong>
                  {matchResult.resume || selectedResume?.name || "Selected resume"}
                </strong>
                <small>Resume version #{matchResult.resume_id || selectedResume?.id || "—"}</small>
              </div>

              <div className="ai-match-result-connector" aria-hidden="true">
                <span>→</span>
              </div>

              <div className="ai-match-result-box">
                <span>JOB</span>
                <strong>
                  {matchResult.job || jobAnalysis.title || jobTitle || "Job Description"}
                </strong>
                <small>
                  {matchResult.company || "Job description analyzed"}
                </small>
              </div>
            </div>
          </section>

          <section className="ai-analysis-summary">
            <div className={`ai-analysis-score-card ${getScoreClass(matchResult.score)}`}>
              <span>Resume Match</span>
              <strong>{Number(matchResult.score || 0).toFixed(1)}%</strong>
              <small>overall match score</small>
            </div>

            <div className="ai-analysis-stat">
              <strong>{Number(matchResult.skill_score || 0).toFixed(1)}%</strong>
              <span>Skill score</span>
            </div>

            <div className="ai-analysis-stat">
              <strong>{Number(matchResult.keyword_score || 0).toFixed(1)}%</strong>
              <span>Keyword score</span>
            </div>

            <div className="ai-analysis-stat">
              <strong>{matchResult.matched_skills?.length || 0}</strong>
              <span>Matched skills</span>
            </div>

            <div className="ai-analysis-stat">
              <strong>{matchResult.missing_skills?.length || 0}</strong>
              <span>Missing skills</span>
            </div>
          </section>

          <section className="ai-analysis-grid">
            <div className="panel ai-analysis-card">
              <div className="eyebrow">MATCHED SKILLS</div>
              <h3>Skills your resume already covers</h3>
              <div className="job-market-skill-pills">
                {(matchResult.matched_skills || []).map((skill) => (
                  <span className="matched" key={skill}>✓ {skill}</span>
                ))}
              </div>
              {!matchResult.matched_skills?.length && (
                <p>No matching technical skills were detected.</p>
              )}
            </div>

            <div className="panel ai-analysis-card">
              <div className="eyebrow">MISSING SKILLS</div>
              <h3>Skills detected in the job but not in your resume</h3>
              <div className="job-market-skill-pills">
                {(matchResult.missing_skills || []).map((skill) => (
                  <span className="missing" key={skill}>× {skill}</span>
                ))}
              </div>
              {!matchResult.missing_skills?.length && (
                <p>No missing technical skills were detected.</p>
              )}
            </div>
          </section>

          <section className="panel ai-analysis-card">
            <div className="eyebrow">KEYWORD MATCH</div>
            <h3>Job-description terminology found in your resume</h3>
            <div className="job-market-skill-pills">
              {(matchResult.keyword_matches || []).map((keyword) => (
                <span className="matched" key={keyword}>{keyword}</span>
              ))}
            </div>
            {!matchResult.keyword_matches?.length && (
              <p>No high-signal job-description keywords matched the resume.</p>
            )}
          </section>

          <section className="panel ai-analysis-card">
            <div className="eyebrow">RECOMMENDATIONS</div>
            <h3>What you should improve</h3>
            <div className="ai-recommendation-list">
              {(matchResult.recommendations || []).map((recommendation, index) => (
                <div className="ai-recommendation-row" key={`${recommendation}-${index}`}>
                  <b>{index + 1}</b>
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
            {!matchResult.recommendations?.length && (
              <p>No additional recommendations were returned.</p>
            )}
          </section>

          <section className="panel ai-analysis-card">
            <div className="eyebrow">HOW THE SCORE WORKS</div>
            <h3>Resume-to-job matching</h3>
            <p>
              The current matching engine uses detected technical skills and
              high-signal job-description keywords.
            </p>
            <div className="ai-score-explanation-grid">
              <div className="ai-score-explanation-card">
                <strong>80%</strong>
                <span>Technical skill alignment</span>
              </div>
              <div className="ai-score-explanation-card">
                <strong>20%</strong>
                <span>Job-description keyword alignment</span>
              </div>
            </div>
          </section>
        </>
      )}

      {previousMatches.length > 0 && (
        <section className="panel ai-analysis-card">
          <div className="eyebrow">RECENT MATCH ANALYSES</div>
          <div className="ai-history-heading">
            <div>
              <h3>Previous resume matches</h3>
              <p>One row per Resume + Job Description combination.</p>
            </div>
            <span className="ai-history-count">{previousMatches.length} unique match{previousMatches.length === 1 ? "" : "es"}</span>
          </div>

          <div className="ai-match-history">
            <table>
              <thead>
                <tr>
                  <th>Resume</th>
                  <th>Job</th>
                  <th>Score</th>
                  <th>Matched</th>
                  <th>Missing</th>
                </tr>
              </thead>
              <tbody>
                {previousMatches.slice(0, 10).map((match) => {
                  const resume = resumes.find(
                    (item) => Number(item.id) === Number(match.resume_id)
                  );

                  return (
                    <tr key={`${getMatchKey(match)}-${match.id}`}>
                      <td>
                        <div className="ai-history-primary">
                          {resume?.name || match.resume || `Resume #${match.resume_id}`}
                        </div>
                      </td>
                      <td>
                        <div className="ai-history-primary">{getJobName(match)}</div>
                      </td>
                      <td>
                        <span className={`ai-history-score ${getScoreClass(match.score)}`}>
                          {Number(match.score || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td>{match.matched_skills?.length || 0}</td>
                      <td>{match.missing_skills?.length || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!jobAnalysis && !matchResult && (
        <section className="job-market-empty ai-analysis-empty">
          <div className="job-market-empty-icon">✦</div>
          <h3>
            {loadingData
              ? "Loading your resumes..."
              : selectedResume
              ? `Ready to analyze ${selectedResume.name}`
              : "Select a resume to begin"}
          </h3>
          <p>
            {loadingData
              ? "Fetching your saved resume versions."
              : "Select a resume, paste a job description, and analyze the job to begin matching."}
          </p>
        </section>
      )}
    </div>
  );
}

function profileStorageKey(email) {
  return `jobtracker_profile_${String(email || "guest").toLowerCase()}`;
}

function readStoredProfile(user) {
  try {
    return JSON.parse(localStorage.getItem(profileStorageKey(user?.email)) || "{}") || {};
  } catch {
    return {};
  }
}

function getStoredProfilePhoto(user) {
  return readStoredProfile(user).photo || "";
}

function ProfileAvatar({ user, photo, className = "profile-avatar" }) {
  return photo ? (
    <img className={`${className} profile-photo`} src={photo} alt="Profile" />
  ) : (
    <div className={className}>{user?.name?.slice(0, 1).toUpperCase() || "U"}</div>
  );
}

function ProfilePerformance({ user, onNavigate, onOpenApplication }) {
  const [resumes, setResumes] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
    company: "",
    status: "",
    response_type: "",
  });

  useEffect(() => {
    api.get("/resumes")
      .then((resumeResponse) => {
        setResumes(Array.isArray(resumeResponse.data) ? resumeResponse.data : []);
      })
      .catch((error) => {
        setProfileError(error.response?.data?.detail || "Unable to load profile performance details.");
      })
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    setActivityLoading(true);
    setActivityError("");
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value)
    );
    api.get("/response-activity", { params })
      .then((response) => {
        if (active) setActivity(response.data);
      })
      .catch((error) => {
        if (active) {
          setActivity(null);
          setActivityError(error.response?.data?.detail || "Unable to load response analytics.");
        }
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });
    return () => { active = false; };
  }, [filters]);

  const profile = readStoredProfile(user);
  const photo = profile.photo || "";
  const completionItems = [
    ["Basic details", Boolean(user?.name && user?.email && profile.phone && (profile.location || profile.city))],
    ["Profile photo", Boolean(photo)],
    ["Professional summary", Boolean(profile.headline && profile.summary)],
    ["Education", Boolean(profile.degree && profile.institution && profile.graduationYear)],
    ["Skills", Boolean(profile.skills || resumes.some((r) => Array.isArray(r.skills) && r.skills.length))],
    ["Experience / projects", Boolean(profile.experience || profile.projects)],
    ["Career preferences", Boolean(profile.preferredRoles && profile.preferredLocations)],
    ["Professional links", Boolean(profile.linkedin || profile.github || profile.portfolio)],
    ["Resume uploaded", resumes.length > 0],
  ];
  const completion = Math.round((completionItems.filter(([, ok]) => ok).length / completionItems.length) * 100);
  const metrics = activity?.metrics || {};
  const chartColors = ["#4c7cf3", "#31a887", "#f0a641", "#8c68d8", "#e36c73", "#47a8c8", "#6f7f95", "#db8b5a", "#789b4a"];
  const statusChart = {
    labels: (activity?.statusDistribution || []).map((item) => item.status),
    datasets: [{
      data: (activity?.statusDistribution || []).map((item) => item.count),
      backgroundColor: chartColors,
      borderWidth: 0,
    }],
  };
  const trendChart = {
    labels: (activity?.monthlyTrends || []).map((item) => item.month),
    datasets: [
      {
        label: "Applications",
        data: (activity?.monthlyTrends || []).map((item) => item.applications),
        borderColor: "#4c7cf3",
        backgroundColor: "rgba(76,124,243,.12)",
        tension: 0.35,
        fill: true,
      },
      {
        label: "Meaningful responses",
        data: (activity?.monthlyTrends || []).map((item) => item.responses),
        borderColor: "#31a887",
        backgroundColor: "rgba(49,168,135,.10)",
        tension: 0.35,
        fill: true,
      },
    ],
  };
  const distributionChart = {
    labels: (activity?.responseDistribution || []).map((item) => item.type),
    datasets: [{
      label: "Response events",
      data: (activity?.responseDistribution || []).map((item) => item.events),
      backgroundColor: chartColors,
      borderRadius: 6,
    }],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
  };
  const responseBarOptions = {
    ...chartOptions,
    indexAxis: "y",
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 } },
      y: { grid: { display: false } },
    },
  };

  return (
    <div className="phase1-page">
      <section className="profile-performance-hero panel">
        <div className="performance-profile">
          <ProfileAvatar user={user} photo={photo} className="performance-avatar" />
          <div><div className="eyebrow">PROFILE PERFORMANCE</div><h2>{user?.name}</h2><p>{profile.headline || "Complete your profile to improve job recommendations."}</p></div>
        </div>
        <div className="performance-score"><strong>{completion}%</strong><span>Profile completion</span></div>
      </section>

      {activityError && <section className="panel performance-details"><div className="page-error">{activityError}</div><button className="secondary" type="button" onClick={() => setFilters((current) => ({ ...current }))}>Retry analytics</button></section>}

      <section className="performance-grid response-summary-grid">
        {[
          ["Applications submitted", metrics.totalSubmitted, "Unique submitted applications"],
          ["Awaiting response", metrics.awaitingResponse, "No meaningful employer decision yet"],
          ["Application received", metrics.applicationReceived, "Acknowledgements; not counted as decisions"],
          ["Recruiter responses", metrics.recruiterResponses, "Includes positive and negative decisions"],
          ["Interviews", metrics.interviewInvitations, "Applications with an interview invitation"],
          ["Offers", metrics.offers, `${metrics.offerConversionRate || 0}% of submitted applications`],
          ["Rejected", metrics.rejected, `${metrics.rejectionRate || 0}% of submitted applications`],
          ["Under review", metrics.underReview, "Current application status"],
          ["Shortlisted", metrics.shortlisted, "Unique applications"],
          ["Assessments", metrics.assessmentInvitations, "Applications with an assessment invitation"],
          ["Withdrawn", metrics.withdrawn, "Submitted applications later withdrawn"],
        ].map(([label, count, detail]) => <div className="panel performance-card response-metric-card" key={label}>
          <span>{label}</span><strong>{activityLoading ? "—" : count ?? 0}</strong><small>{detail}</small>
        </div>)}
      </section>

      <section className="panel performance-details">
        <div className="section-heading"><div><div className="eyebrow">PROFILE CHECKLIST</div><h2>Build a stronger profile</h2></div><button type="button" className="action-blue-button profile-edit-button" onClick={() => onNavigate("my-profile")}>Edit My Profile</button></div>
        <div className="performance-checklist">
          {completionItems.map(([label, ok]) => <div key={label} className={ok ? "done" : "missing"}><span>{ok ? "✓" : "!"}</span><strong>{label}</strong><small>{ok ? "Completed" : "Add this information"}</small></div>)}
        </div>
      </section>

      <section className="panel performance-details response-analytics">
        <div className="section-heading">
          <div><div className="eyebrow">JOB SEARCH ACTIVITY</div><h2>Response activity</h2><p className="muted-text">Response rate excludes application acknowledgements. Rates use unique submitted applications as the denominator.</p></div>
          <div className="response-rate-badge"><strong>{activityLoading ? "—" : `${metrics.responseRate || 0}%`}</strong><span>Overall response rate</span></div>
        </div>
        <div className="response-conversion-grid">
          <div><span>Interview conversion</span><strong>{activityLoading ? "—" : `${metrics.interviewConversionRate || 0}%`}</strong><small>Interviewed applications ÷ submitted applications</small></div>
          <div><span>Offer conversion</span><strong>{activityLoading ? "—" : `${metrics.offerConversionRate || 0}%`}</strong><small>Offer applications ÷ submitted applications</small></div>
          <div><span>Rejection rate</span><strong>{activityLoading ? "—" : `${metrics.rejectionRate || 0}%`}</strong><small>Rejected applications ÷ submitted applications</small></div>
        </div>
        <form className="response-filter-grid" onSubmit={(event) => event.preventDefault()}>
          <label><span>Applied from</span><input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} /></label>
          <label><span>Applied through</span><input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} /></label>
          <label><span>Company</span><select value={filters.company} onChange={(event) => setFilters((current) => ({ ...current, company: event.target.value }))}><option value="">All companies</option>{(activity?.filterOptions?.companies || []).map((company) => <option key={company}>{company}</option>)}</select></label>
          <label><span>Current status</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{(activity?.filterOptions?.statuses || []).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label><span>Response type</span><select value={filters.response_type} onChange={(event) => setFilters((current) => ({ ...current, response_type: event.target.value }))}><option value="">All response types</option>{(activity?.filterOptions?.responseTypes || []).map((type) => <option key={type}>{type}</option>)}</select></label>
          <button type="button" className="secondary response-filter-reset" onClick={() => setFilters({ date_from: "", date_to: "", company: "", status: "", response_type: "" })}>Clear filters</button>
        </form>
        {activityLoading && <div className="loading">Loading response analytics…</div>}
        {!activityLoading && !activityError && (
          <>
            <div className="response-chart-grid">
              <article className="response-chart-card"><h3>Applications by status</h3>{statusChart.labels.length ? <div className="response-chart-canvas response-doughnut"><Doughnut data={statusChart} options={doughnutOptions} /> </div> : <div className="response-chart-empty">No application status data for these filters.</div>}</article>
              <article className="response-chart-card response-trend-card"><h3>Monthly applications and responses</h3>{(activity.monthlyTrends || []).length ? <div className="response-chart-canvas"><Line data={trendChart} options={chartOptions} /></div> : <div className="response-chart-empty">No dated applications or responses for these filters.</div>}</article>
              <article className="response-chart-card response-distribution-card"><h3>Response distribution <small>Event counts</small></h3>{(activity.responseDistribution || []).some((item) => item.events) ? <div className="response-chart-canvas response-distribution-canvas"><Bar data={distributionChart} options={responseBarOptions} /></div> : <div className="response-chart-empty">No response events for these filters.</div>}</article>
            </div>
            <div className="section-heading response-recent-heading"><div><div className="eyebrow">APPLICATION ACTIVITY</div><h2>Recent Company Responses</h2><p className="muted-text">One row per application. Select a row to view its timeline and matched email history.</p></div><span className="muted-text">{activity.recentResponses?.length || 0} applications</span></div>
            {activity.recentResponses?.length ? <div className="response-recent-list">{activity.recentResponses.map((item) => (
              <button type="button" className="response-recent-row" key={item.applicationId} onClick={() => onOpenApplication(item.applicationId)}>
                <span className="response-company-role"><strong>{item.company || "Company not specified"}</strong><small>{item.role || "Role not specified"}</small></span>
                <span><small>Applied</small><strong>{item.applicationDate || "Not recorded"}</strong></span>
                <span><small>Latest response</small><strong>{item.latestResponseDate ? new Date(item.latestResponseDate).toLocaleDateString() : "No date recorded"}</strong></span>
                <span className={`response-status-pill response-status-${String(item.status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{item.status || "Unknown"}</span>
                <span className="response-latest-type"><small>{item.responseType}</small><strong>{item.emailSubject || (item.responseType === "Awaiting Response" ? "No employer response recorded" : "Status update")}</strong></span>
                <span className="response-open-arrow" aria-hidden="true">→</span>
              </button>
            ))}</div> : <div className="response-chart-empty response-list-empty">{activity.metrics?.totalSubmitted ? "No applications match these filters." : "No submitted applications yet. Add applications to see your response activity."}</div>}
          </>
        )}
      </section>

      {profileError && <div className="page-error">{profileError}</div>}
      {profileLoading && <div className="loading">Loading profile performance details…</div>}
    </div>
  );
}

function MyProfile({ user, onProfileUpdated }) {
  const existing = readStoredProfile(user);
  const [form, setForm] = useState({
    headline: existing.headline || "",
    summary: existing.summary || "",
    phone: existing.phone || "",
    location: existing.location || "",
    city: existing.city || "",
    country: existing.country || "India",
    currentRole: existing.currentRole || "",
    experience: existing.experience || "",
    skills: existing.skills || "",
    degree: existing.degree || "",
    institution: existing.institution || "",
    graduationYear: existing.graduationYear || "",
    cgpa: existing.cgpa || "",
    certifications: existing.certifications || "",
    projects: existing.projects || "",
    achievements: existing.achievements || "",
    careerObjective: existing.careerObjective || "",
    availability: existing.availability || "Immediate",
    languages: existing.languages || "English, Telugu",
    linkedin: existing.linkedin || "",
    github: existing.github || "",
    portfolio: existing.portfolio || "",
    preferredRoles: existing.preferredRoles || "",
    preferredLocations: existing.preferredLocations || "",
    workMode: existing.workMode || "Any",
    employmentType: existing.employmentType || "Full-time",
    expectedSalary: existing.expectedSalary || "",
    noticePeriod: existing.noticePeriod || "",
    photo: existing.photo || "",
  });
  const initialSavedAt = localStorage.getItem(`${profileStorageKey(user.email)}_saved_at`) || "";
  const [saved, setSaved] = useState(Boolean(initialSavedAt || Object.keys(existing).length));
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [saveNotice, setSaveNotice] = useState(false);

  const update = (key, value) => { setSaved(false); setForm((prev) => ({ ...prev, [key]: value })); };
  const uploadPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) { alert("Please choose an image smaller than 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => update("photo", String(reader.result || ""));
    reader.readAsDataURL(file);
  };
  const save = (event) => {
    event.preventDefault();
    const timestamp = new Date().toISOString();
    localStorage.setItem(profileStorageKey(user.email), JSON.stringify(form));
    localStorage.setItem(`${profileStorageKey(user.email)}_saved_at`, timestamp);
    window.dispatchEvent(new Event("jobtracker-profile-updated"));
    setSaved(true);
    setSavedAt(timestamp);
    setSaveNotice(true);
    window.setTimeout(() => setSaveNotice(false), 2600);
    onProfileUpdated?.();
  };

  return (
    <div className="phase1-page">
      <section className="profile-page-grid profile-page-grid-wide">
        <form className="panel profile-edit-card profile-edit-card-wide" onSubmit={save}>
          <div className="section-heading"><div><div className="eyebrow">MY PROFILE</div><h2>Professional profile</h2><p className="muted-text">Add the information recruiters usually need before shortlisting a candidate.</p></div><span className={`save-badge ${saved ? "saved" : "unsaved"}`}>{saved ? `✓ Profile saved${savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "● Unsaved changes"}</span></div>

          <div className="profile-photo-editor">
            <ProfileAvatar user={user} photo={form.photo} className="profile-editor-avatar" />
            <div><strong>{user.name}</strong><p>{user.email}</p><label className="secondary upload-photo-button">Change photo<input type="file" accept="image/*" onChange={uploadPhoto} hidden /></label></div>
          </div>

          <div className="profile-section-title"><span>01</span><div><strong>About you</strong><small>Identity and professional positioning</small></div></div>
          <div className="form-grid profile-form-grid">
            <label><span>Professional headline</span><input value={form.headline} onChange={(e) => update("headline", e.target.value)} placeholder="Python Developer | Data Analyst" /></label>
            <label><span>Current / target role</span><input value={form.currentRole} onChange={(e) => update("currentRole", e.target.value)} placeholder="Data Analyst" /></label>
            <label><span>Phone</span><input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="Phone number" /></label>
            <label><span>Email</span><input value={user.email || ""} readOnly /></label>
            <label><span>City</span><input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Mysuru" /></label>
            <label><span>Country</span><input value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="India" /></label>
            <label className="wide profile-summary-editor"><span>Profile summary <small>{form.summary.length}/500 characters</small></span><textarea maxLength={500} value={form.summary} onChange={(e) => update("summary", e.target.value)} placeholder="Write 3–5 lines covering your degree, strongest skills, internship/projects, measurable work and the role you are targeting." /><small className="field-help">Tip: mention your strongest technologies, project impact, internship experience and the type of role you want.</small><div className="summary-quick-add"><button type="button" className="summary-chip" onClick={() => update("summary", `${form.summary}${form.summary ? " " : ""}Computer Science graduate with hands-on experience in Python, SQL and data analysis.`)}>＋ Add opening</button><button type="button" className="summary-chip" onClick={() => update("summary", `${form.summary}${form.summary ? " " : ""}Built data-driven projects and interactive dashboards using Python, SQL and web technologies.`)}>＋ Add project line</button><button type="button" className="summary-chip" onClick={() => update("summary", `${form.summary}${form.summary ? " " : ""}Seeking entry-level opportunities in Data Analytics, Python Development or Full-Stack Development.`)}>＋ Add career goal</button></div></label>
          </div>

          <div className="profile-section-title"><span>02</span><div><strong>Skills & experience</strong><small>Make your technical profile searchable</small></div></div>
          <div className="form-grid profile-form-grid">
            <label className="wide"><span>Technical skills</span><textarea value={form.skills} onChange={(e) => update("skills", e.target.value)} placeholder="Python, SQL, Pandas, JavaScript, React, FastAPI, Git" /></label>
            <label><span>Total experience</span><input value={form.experience} onChange={(e) => update("experience", e.target.value)} placeholder="Fresher / 1 year / 2 years" /></label>
            <label><span>Location</span><input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="City, State" /></label>
            <label className="wide"><span>Projects</span><textarea value={form.projects} onChange={(e) => update("projects", e.target.value)} placeholder="Project name — technology — what you built / achieved" /></label>
            <label className="wide"><span>Certifications</span><textarea value={form.certifications} onChange={(e) => update("certifications", e.target.value)} placeholder="Certification name — issuing organization — year" /></label>
          </div>

          <div className="profile-section-title"><span>03</span><div><strong>Education</strong><small>Academic background</small></div></div>
          <div className="form-grid profile-form-grid">
            <label><span>Degree</span><input value={form.degree} onChange={(e) => update("degree", e.target.value)} placeholder="B.Tech" /></label>
            <label><span>Institution</span><input value={form.institution} onChange={(e) => update("institution", e.target.value)} placeholder="University / College" /></label>
            <label><span>Graduation year</span><input value={form.graduationYear} onChange={(e) => update("graduationYear", e.target.value)} placeholder="2026" /></label>
            <label><span>CGPA / GPA</span><input value={form.cgpa} onChange={(e) => update("cgpa", e.target.value)} placeholder="7.84" /></label>
          </div>

          <div className="profile-section-title"><span>04</span><div><strong>Achievements & career objective</strong><small>Add details that differentiate you from other applicants</small></div></div>
          <div className="form-grid profile-form-grid">
            <label className="wide"><span>Achievements</span><textarea value={form.achievements} onChange={(e) => update("achievements", e.target.value)} placeholder="Awards, hackathons, academic achievements, measurable project results, leadership or other accomplishments." /></label>
            <label className="wide"><span>Career objective</span><textarea value={form.careerObjective} onChange={(e) => update("careerObjective", e.target.value)} placeholder="What type of role, work and growth are you targeting?" /></label>
            <label><span>Availability</span><select value={form.availability} onChange={(e) => update("availability", e.target.value)}><option>Immediate</option><option>Within 15 days</option><option>Within 30 days</option><option>Within 60 days</option><option>Not available</option></select></label>
          </div>

          <div className="profile-section-title"><span>05</span><div><strong>Career preferences</strong><small>Use these details for better job targeting</small></div></div>
          <div className="form-grid profile-form-grid">
            <label className="wide"><span>Preferred roles</span><input value={form.preferredRoles} onChange={(e) => update("preferredRoles", e.target.value)} placeholder="Data Analyst, Python Developer, Full Stack Developer" /></label>
            <label className="wide"><span>Preferred locations</span><input value={form.preferredLocations} onChange={(e) => update("preferredLocations", e.target.value)} placeholder="Bengaluru, Hyderabad, Pune, Remote" /></label>
            <label><span>Work mode</span><select value={form.workMode} onChange={(e) => update("workMode", e.target.value)}><option>Any</option><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label>
            <label><span>Employment type</span><select value={form.employmentType} onChange={(e) => update("employmentType", e.target.value)}><option>Full-time</option><option>Internship</option><option>Part-time</option><option>Contract</option></select></label>
            <label><span>Expected salary</span><input value={form.expectedSalary} onChange={(e) => update("expectedSalary", e.target.value)} placeholder="₹4–6 LPA" /></label>
            <label><span>Notice period</span><input value={form.noticePeriod} onChange={(e) => update("noticePeriod", e.target.value)} placeholder="Immediate / 30 days" /></label>
            <label><span>Languages</span><input value={form.languages} onChange={(e) => update("languages", e.target.value)} placeholder="English, Telugu, Hindi" /></label>
          </div>

          <div className="profile-section-title"><span>06</span><div><strong>Professional links</strong><small>Let recruiters verify your work</small></div></div>
          <div className="form-grid profile-form-grid">
            <label><span>LinkedIn</span><input value={form.linkedin} onChange={(e) => update("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." /></label>
            <label><span>GitHub</span><input value={form.github} onChange={(e) => update("github", e.target.value)} placeholder="https://github.com/..." /></label>
            <label className="wide"><span>Portfolio / Website</span><input value={form.portfolio} onChange={(e) => update("portfolio", e.target.value)} placeholder="https://your-portfolio.com" /></label>
          </div>

          <div className="actions"><button type="submit" className="primary">Save profile</button></div>
        </form>

        <aside className="profile-side-column">
          <section className="panel profile-summary-card"><div className="eyebrow">PROFILE SUMMARY</div><h2>{form.headline || "Add your headline"}</h2><p>{form.summary || "Your professional summary will appear here after you save it."}</p><div className="profile-summary-list"><div><span>Experience</span><strong>{form.experience || "Not added"}</strong></div><div><span>Target roles</span><strong>{form.preferredRoles || "Not added"}</strong></div><div><span>Work mode</span><strong>{form.workMode}</strong></div><div><span>Location</span><strong>{form.location || form.city || "Not added"}</strong></div></div></section>
          <section className="panel profile-summary-help"><div className="eyebrow">EDITING GUIDE</div><h2>How to keep your profile strong</h2><div className="profile-help-step"><b>1</b><span>Edit any field on the left.</span></div><div className="profile-help-step"><b>2</b><span>Use the summary quick-add buttons to build your summary.</span></div><div className="profile-help-step"><b>3</b><span>Add projects, achievements and career preferences.</span></div><div className="profile-help-step"><b>4</b><span>Click <strong>Save profile</strong> to update the preview.</span></div></section>
        </aside>
      </section>

      {saveNotice && (
        <div className="profile-save-modal-overlay" role="status" aria-live="polite">
          <div className="profile-save-modal">
            <div className="profile-save-icon">✓</div>
            <div>
              <strong>Profile saved successfully</strong>
              <p>Your profile changes are saved in this browser for your account.</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setSaveNotice(false)}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SavedJobsPage({ user, onNavigate }) {
  const key = `jobtracker_saved_jobs_${String(
    user?.email || "guest"
  ).trim().toLowerCase()}`;

  const [jobs, setJobs] = useState([]);

  const load = () => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(key) || "[]"
      );

      setJobs(Array.isArray(stored) ? stored : []);
    } catch {
      setJobs([]);
    }
  };

  useEffect(() => {
    load();

    const cleanup = createSyncRefresh(load);

    const storageHandler = (event) => {
      if (event.key === key) {
        load();
      }
    };

    window.addEventListener("storage", storageHandler);

    return () => {
      cleanup();
      window.removeEventListener("storage", storageHandler);
    };
  }, [key]);

  const remove = (id) => {
    const next = jobs.filter(
      (job) => String(job.id) !== String(id)
    );

    localStorage.setItem(
      key,
      JSON.stringify(next)
    );

    setJobs(next);

    dispatchJobTrackerSync({
      type: "saved-job-removed",
      jobId: id,
    });
  };

  return (
    <div className="phase1-page">
      <section className="panel opportunities-panel">

        <div className="section-heading">
          <div>
            <div className="eyebrow">
              OPPORTUNITIES
            </div>

            <h2>Saved jobs</h2>

            <p className="muted-text">
              Jobs you bookmarked from the live market.
            </p>
          </div>

          <button
            type="button"
            className="action-blue-button saved-find-jobs-button"
            onClick={() =>
              onNavigate("opportunities-search")
            }
          >
            Find jobs
          </button>
        </div>

        {jobs.length ? (
          <div className="saved-job-list">

            {jobs.map((job) => (
              <article
                className="saved-job-row"
                key={`${job.id}-${job.source || "saved"}`}
              >

                <div>
                  <strong>
                    {job.title}
                  </strong>

                  <span>
                    {job.company} ·{" "}
                    {job.location ||
                      "Location not specified"}
                  </span>

                  <small>
                    {job.url
                      ? "External application available"
                      : "Saved opportunity"}
                  </small>
                </div>

                <div>

                  <button
                    type="button"
                    className="action-blue-button compact-action"
                    onClick={() => {
                      if (job.url) {
                        window.open(
                          job.url,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }
                    }}
                  >
                    View job
                  </button>

                  <button
                    type="button"
                    className="action-red-button saved-remove-button"
                    onClick={() => remove(job.id)}
                  >
                    Remove
                  </button>

                </div>

              </article>
            ))}

          </div>
        ) : (
          <div className="empty">
            <h3>No saved jobs yet</h3>

            <p>
              Save opportunities from Search Jobs
              and they will appear here.
            </p>
          </div>
        )}

      </section>
    </div>
  );
}

function ApplicationProcessPage({ jobId, onNavigate, returnPage = "applications" }) {
  const [job, setJob] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [applicationEmails, setApplicationEmails] = useState([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [checkingAutomaticStatus, setCheckingAutomaticStatus] = useState(false);
  const [lastAutomaticStatusCheck, setLastAutomaticStatusCheck] = useState(null);
  const [automaticStatusError, setAutomaticStatusError] = useState("");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [followUpSettings, setFollowUpSettings] = useState({ intervalDays: 7, enabled: true });
  const [statusDraft, setStatusDraft] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const automaticSyncInProgress = useRef(false);

  const loadApplication = async () => {
    if (!jobId) return;
    setLoading(true);
    setError("");
    try {
      const [jobResponse, interviewResponse, timelineResponse, reminderResponse] = await Promise.all([
        api.get("/jobs"),
        api.get("/interviews"),
        api.get(`/jobs/${jobId}/timeline`),
        api.get("/reminders"),
      ]);
      const foundJob = (Array.isArray(jobResponse.data) ? jobResponse.data : []).find((item) => String(item.id) === String(jobId));
      setJob(foundJob || null);
      setStatusDraft(foundJob?.status || "Applied");
      setInterviews((Array.isArray(interviewResponse.data) ? interviewResponse.data : []).filter((item) => String(item.job_id) === String(jobId)));
      setStatusHistory(Array.isArray(timelineResponse.data?.history) ? timelineResponse.data.history : []);
      setApplicationEmails(Array.isArray(timelineResponse.data?.emails) ? timelineResponse.data.emails : []);
      setReminders((Array.isArray(reminderResponse.data?.reminders) ? reminderResponse.data.reminders : []).filter((item) => String(item.applicationId) === String(jobId)));
      setFollowUpSettings(reminderResponse.data?.settings || { intervalDays: 7, enabled: true });
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to load this application.");
    } finally {
      setLoading(false);
    }
  };

  const checkAutomaticStatus = async () => {
    if (!jobId || automaticSyncInProgress.current) return;
    automaticSyncInProgress.current = true;
    setCheckingAutomaticStatus(true);
    setAutomaticStatusError("");

    try {
      const syncResult = await syncMailboxApplicationStatuses();
      setGmailConnected(syncResult.connected);
      setLastAutomaticStatusCheck(new Date());
      if (!syncResult.connected) return;

      const [jobResponse, timelineResponse] = await Promise.all([
        apiGetJobs(),
        api.get(`/jobs/${jobId}/timeline`, { params: cacheBustParams() }),
      ]);
      const updatedJob = (Array.isArray(jobResponse.data) ? jobResponse.data : [])
        .find((item) => String(item.id) === String(jobId));
      if (updatedJob) {
        setJob(updatedJob);
        setStatusDraft(updatedJob.status || "Applied");
      }
      setStatusHistory(Array.isArray(timelineResponse.data?.history) ? timelineResponse.data.history : []);
      setApplicationEmails(Array.isArray(timelineResponse.data?.emails) ? timelineResponse.data.emails : []);
      window.dispatchEvent(new Event("jobtracker:data-changed"));
    } catch (syncError) {
      setAutomaticStatusError(
        syncError.response?.data?.detail || "Unable to check for automatic company updates."
      );
    } finally {
      automaticSyncInProgress.current = false;
      setCheckingAutomaticStatus(false);
    }
  };

  useEffect(() => {
    loadApplication();
    checkAutomaticStatus();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") checkAutomaticStatus();
    }, 60_000);
    const onFocus = () => checkAutomaticStatus();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [jobId]);

  const stages = [
    { title: "Applied", detail: "Application submitted or manually tracked.", statuses: ["applied"] },
    { title: "Application Received", detail: "Confirmation from the company or ATS.", statuses: ["application received"] },
    { title: "In Review", detail: "The employer is reviewing the application.", statuses: ["in review", "under review", "screening"] },
    { title: "Shortlisted", detail: "The employer moves the application forward.", statuses: ["shortlisted"] },
    { title: "Assessment", detail: "An assessment or technical test is requested.", statuses: ["assessment"] },
    { title: "Interview", detail: "An interview is scheduled or underway.", statuses: ["interview", "interview scheduled"] },
    { title: "Offer", detail: "An offer has been received or the candidate selected.", statuses: ["offer", "offer received", "selected"] },
    { title: "Rejected", detail: "The employer has declined the application.", statuses: ["rejected"] },
    { title: "Withdrawn", detail: "The application was withdrawn.", statuses: ["withdrawn"] },
  ];
  const status = String(job?.status || "Applied");
  const normalizedStatus = status.trim().toLowerCase();
  const statusIndex = stages.findIndex((stage) => stage.statuses.includes(normalizedStatus));
  const isTerminalStatus = ["offer", "offer received", "selected", "rejected", "withdrawn"].includes(normalizedStatus);
  const progress = statusIndex < 0 ? 0 : isTerminalStatus ? 100 : Math.round(((statusIndex + 1) / 6) * 100);

  const saveStatus = async () => {
    if (!job || statusDraft === status) return;
    if (!window.confirm(`Change ${job.company} · ${job.role} from ${status} to ${statusDraft}?`)) return;
    setActionError("");
    try {
      await api.put(`/jobs/${job.id}`, {
        status: statusDraft,
        status_reason: statusReason.trim() || "Manually updated by the applicant.",
      });
      window.dispatchEvent(new Event("jobtracker:data-changed"));
      setStatusReason("");
      await loadApplication();
    } catch (err) {
      setActionError(err.response?.data?.detail || "Unable to update application status.");
    }
  };

  const connectGmail = async () => {
    setConnectingGmail(true);
    setAutomaticStatusError("");
    try {
      const response = await api.get("/recruiter-messages/connect");
      if (!response.data?.authorization_url) {
        throw new Error("Google authorization URL was not returned.");
      }
      window.location.href = response.data.authorization_url;
    } catch (connectError) {
      setAutomaticStatusError(
        connectError.response?.data?.detail || connectError.message || "Unable to connect Gmail."
      );
      setConnectingGmail(false);
    }
  };

  const saveFollowUpSettings = async (event) => {
    event.preventDefault();
    setActionError("");
    try {
      const response = await api.put("/reminders/settings", {
        interval_days: Number(followUpSettings.intervalDays),
        enabled: followUpSettings.enabled,
      });
      setFollowUpSettings(response.data);
      await loadApplication();
    } catch (err) {
      setActionError(err.response?.data?.detail || "Unable to save follow-up settings.");
    }
  };

  const updateReminder = async (reminderId, payload) => {
    setActionError("");
    try {
      await api.patch(`/reminders/${reminderId}`, payload);
      await loadApplication();
    } catch (err) {
      setActionError(err.response?.data?.detail || "Unable to update reminder.");
    }
  };

  if (loading) return <div className="loading">Loading application journey…</div>;
  if (error || !job) return <section className="panel"><div className="page-error">{error || "Application not found."}</div><button className="secondary" onClick={() => onNavigate(returnPage)}>← Back to applications</button></section>;

  return <div className="phase1-page">
    <section className="panel application-process-page-head">
      <button type="button" className="text-action process-back-button" onClick={() => onNavigate("applications")}>← Back to Applications</button>
      <div className="application-process-hero-content">
        <div className="application-process-company-mark" aria-hidden="true">
          {(job.company || "?").trim().charAt(0).toUpperCase()}
        </div>
        <div className="application-process-title">
          <div className="eyebrow">APPLICATION DETAILS</div>
          <h2>{job.role || "Role not specified"}</h2>
          <p>{job.company || "Company not specified"} <span>·</span> {job.location || "Location not specified"}</p>
        </div>
        <div className={`application-process-status status-${status.toLowerCase()}`}>
          <span aria-hidden="true">●</span>
          {status}
        </div>
      </div>
      <div className="process-page-meta">
        <span><small>Applied on</small><strong>{job.applied_date || "Date not recorded"}</strong></span>
        <span><small>Current stage</small><strong>{status}</strong></span>
        <span><small>Journey progress</small><strong>{progress}%</strong></span>
      </div>
    </section>

    <section className="panel application-process-page-card">
      <div className="application-process-section-heading">
        <div>
          <div className="eyebrow">YOUR PROGRESS</div>
          <h2>Application journey</h2>
          <p>Track each confirmed step from submission through joining.</p>
        </div>
        <span className="application-process-stage-count">{statusIndex < 0 ? "Status not mapped" : `${status} · ${progress}%`}</span>
      </div>
      <div className={`automatic-status-card ${gmailConnected ? "connected" : ""}`}>
        <span className="automatic-status-icon" aria-hidden="true">{gmailConnected ? "↻" : "✉"}</span>
        <div className="automatic-status-copy">
          <strong>{gmailConnected ? "Automatic email status checks are on" : "Connect Gmail for automatic status updates"}</strong>
          <p>{gmailConnected
            ? "We check for new recruiter emails while you use the tracker. Clear, matched company updates are added to this timeline automatically."
            : "Connect your mailbox to detect status changes from company emails. Application portals do not provide a shared status feed."}</p>
          {lastAutomaticStatusCheck && <small>{checkingAutomaticStatus ? "Checking for company updates…" : `Last checked ${lastAutomaticStatusCheck.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</small>}
          {automaticStatusError && <small className="automatic-status-error">{automaticStatusError}</small>}
        </div>
        {gmailConnected
          ? <button type="button" className="automatic-status-refresh" onClick={checkAutomaticStatus} disabled={checkingAutomaticStatus}>{checkingAutomaticStatus ? "Checking…" : "Check now"}</button>
          : <button type="button" className="automatic-status-connect" onClick={connectGmail} disabled={connectingGmail}>{connectingGmail ? "Connecting…" : "Connect Gmail"}</button>}
      </div>
      <div className="application-process-page-timeline">{stages.map((stage, index) => {
        const event = [...statusHistory].reverse().find((item) => stage.statuses.includes(String(item.status || "").toLowerCase()));
        const current = stage.statuses.includes(normalizedStatus);
        const branch = index >= 6;
        const done = branch ? current : current || (statusIndex > index && index < 6);
        const fallbackTimestamp = index === 0 ? job.applied_date : null;
        return <div className={`process-page-stage ${done ? "done" : ""} ${current ? "current" : ""}`} key={stage.title}>
          <div className="process-page-marker">{done ? "✓" : index + 1}</div>
          <div className="process-page-stage-copy">
            <strong>{stage.title}</strong>
            {current && <span className="process-current-label">CURRENT STAGE</span>}
            <p>{stage.detail}</p>
            <small className="timeline-event-meta">
              {event?.timestamp ? new Date(event.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : fallbackTimestamp || "No timestamp recorded"}
              {" · "}{event?.source ? `Source: ${event.source}` : index === 0 ? "Source: application record" : "No recorded event"}
              {event?.reason ? ` · ${event.reason}` : ""}
            </small>
          </div>
        </div>;
      })}</div>
      <details className="manual-status-disclosure">
        <summary>Correct status manually <span>Optional fallback</span></summary>
        <div className="manual-status-controls">
          <label>Status
            <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
              {statuses.filter((item) => item !== "Wishlist" && item !== "Applying").map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>Reason (optional)
            <input value={statusReason} onChange={(event) => setStatusReason(event.target.value)} placeholder="Why are you correcting the status?" />
          </label>
          <button type="button" className="action-blue-button" disabled={statusDraft === status} onClick={saveStatus}>Save correction</button>
        </div>
      </details>
      {actionError && <div className="page-error">{actionError}</div>}
      <div className="process-evidence-box"><span className="process-evidence-icon" aria-hidden="true">i</span><div><strong>Verified history only</strong><p>Timestamp and source are shown when recorded. Earlier stages are not assigned invented dates.</p></div></div>
    </section>

    <section className="panel application-process-page-card application-email-history">
      <div className="application-process-section-heading">
        <div><div className="eyebrow">EMAIL HISTORY</div><h2>Recruiter messages</h2><p>Gmail messages matched to this application.</p></div>
        <span className="application-process-stage-count">{applicationEmails.length} email{applicationEmails.length === 1 ? "" : "s"}</span>
      </div>
      {applicationEmails.length ? <div className="application-email-list">{applicationEmails.map((email) => (
        <article className="application-email-card" key={email.id}>
          <div className="application-email-heading">
            <strong>{email.subject || "Recruiter update"}</strong>
            <span>{email.detectedStatus || "No status detected"}</span>
          </div>
          <small>{email.sender || "Sender not available"} · {email.receivedAt ? new Date(email.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date not recorded"}</small>
          <p>{email.statusUpdated ? "This email updated the application status." : "This email did not change the application status."}</p>
          <small>Match: {email.matchingReviewStatus || "matched"} · Confidence not available</small>
          <details><summary>Open original email</summary><pre>{email.message || "Email content is unavailable."}</pre></details>
        </article>
      ))}</div> : <div className="empty"><strong>No matched emails yet.</strong><span>Unmatched messages remain available for review in Recruiter Messages.</span></div>}
    </section>

    <section className="panel application-process-page-card application-reminders">
      <div className="application-process-section-heading">
        <div><div className="eyebrow">FOLLOW-UP REMINDERS</div><h2>Stay in touch</h2><p>Reminders are generated for applications without a recent update.</p></div>
      </div>
      <form className="follow-up-settings" onSubmit={saveFollowUpSettings}>
        <label>Remind me after
          <input type="number" min="1" max="90" value={followUpSettings.intervalDays} onChange={(event) => setFollowUpSettings((current) => ({ ...current, intervalDays: event.target.value }))} />
          days
        </label>
        <label className="follow-up-enabled"><input type="checkbox" checked={followUpSettings.enabled} onChange={(event) => setFollowUpSettings((current) => ({ ...current, enabled: event.target.checked }))} /> Enable reminders</label>
        <button type="submit" className="secondary">Save reminder settings</button>
      </form>
      {reminders.length ? <div className="application-reminder-list">{reminders.map((reminder) => {
        const overdue = new Date(reminder.dueAt) < new Date();
        return <article className="application-reminder-row" key={reminder.id}>
          <div><strong>{overdue ? "Overdue follow-up" : "Upcoming follow-up"}</strong><span>Due {new Date(reminder.dueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>
          <input type="datetime-local" value={rescheduleValue} onChange={(event) => setRescheduleValue(event.target.value)} aria-label="New reminder date" />
          <button type="button" className="secondary" disabled={!rescheduleValue} onClick={() => { const dueAt = new Date(rescheduleValue).toISOString(); updateReminder(reminder.id, { due_at: dueAt }); setRescheduleValue(""); }}>Reschedule</button>
          <button type="button" className="secondary" onClick={() => updateReminder(reminder.id, { complete: true })}>Complete</button>
        </article>;
      })}</div> : <div className="empty"><strong>No pending follow-up reminders.</strong><span>Terminal statuses such as offers, rejections and withdrawals are excluded.</span></div>}
    </section>

    <section className="panel application-interview-rounds-card">
      <div className="application-process-section-heading">
        <div><div className="eyebrow">UPCOMING</div><h2>Interview schedule</h2><p>Confirmed interviews linked to this application.</p></div>
        <button type="button" className="interview-navigation-button interview-navigation-open" onClick={() => onNavigate("interviews")}>View all interviews <span aria-hidden="true">→</span></button>
      </div>
      {interviews.length ? <div className="application-round-list">{interviews.map((item) => <div className="application-round-row" key={item.id}><div><strong>{item.round_name || "Interview"}</strong><span>{item.interview_date ? new Date(item.interview_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date not set"} · {item.type || "Online"}</span><small>{item.interviewer || "Interviewer not added"}</small></div><button className="secondary" onClick={() => { localStorage.setItem("jobtracker_prep_interview_id", String(item.id)); onNavigate("interview-prep"); }}>Prepare →</button></div>)}</div> : <div className="empty"><strong>No interview round scheduled yet.</strong><span>When an interview is scheduled, its preparation plan will appear here.</span></div>}
    </section>
  </div>;
}

function AppliedJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    api.get("/jobs").then((r) => setJobs(Array.isArray(r.data) ? r.data.filter((j) => !["Wishlist", "Withdrawn"].includes(j.status)) : [])).catch(() => setJobs([])).finally(() => setLoading(false));
  }, []);
  const filtered = filter === "All" ? jobs : jobs.filter((job) => String(job.status || "Applied") === filter);
  const counts = { All: jobs.length, Applied: jobs.filter((j) => j.status === "Applied").length, Screening: jobs.filter((j) => j.status === "Screening").length, Interview: jobs.filter((j) => j.status === "Interview").length, Offer: jobs.filter((j) => j.status === "Offer").length };
  return <div className="phase1-page applied-jobs-page">
    <section className="panel applied-jobs-hero"><div><div className="eyebrow">SUBMITTED APPLICATIONS</div><h2>Applied Jobs</h2><p className="muted-text">Only jobs you have submitted are shown here. Use Applications to manage details and open the full application process.</p></div><div className="applied-jobs-summary"><strong>{jobs.length}</strong><span>submitted applications</span></div></section>
    <section className="applied-jobs-filters">{Object.keys(counts).map((key) => <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}><strong>{counts[key]}</strong><span>{key}</span></button>)}</section>
    <section className="panel applied-jobs-list-card"><div className="section-heading"><div><div className="eyebrow">YOUR SUBMISSIONS</div><h2>Applied job list</h2></div><span className="muted-text">{filtered.length} shown</span></div>
      {loading ? <div className="loading">Loading applied jobs…</div> : filtered.length ? <div className="applied-simple-list">{filtered.map((job) => <article className="applied-simple-card" key={job.id}><div className="applied-simple-main"><strong>{job.company || "Company not specified"}</strong><h3>{job.role || "Role not specified"}</h3><div className="applied-simple-meta"><span>{job.location || "Location not specified"}</span><span>Applied {job.applied_date || "date not recorded"}</span></div></div><div className="applied-simple-status"><span className={`status-badge ${String(job.status || "Applied").toLowerCase()}`}>{job.status || "Applied"}</span><small>Tracked application</small></div></article>)}</div> : <div className="empty"><strong>No submitted jobs found.</strong><span>Add an application from Applications or apply through Search Jobs.</span></div>}
    </section></div>;
}

function RecommendedJobsPage({ user, onNavigate }) {
  const [jobs, setJobs] = useState([]);
  const [query, setQuery] = useState("Python Developer");
  const [location, setLocation] = useState("Bengaluru");
  const [loading, setLoading] = useState(false);
  const [resume, setResume] = useState(null);
  const search = async (event) => { event?.preventDefault(); setLoading(true); try { const [r, rr] = await Promise.all([api.get("/job-market/search", { params:{ query, location, country:"India", page:1, results_per_page:20 }}), api.get("/resumes")]); const list=Array.isArray(rr.data)?rr.data:[]; const latest=[...list].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null; setResume(latest); const skills=new Set((latest?.skills||[]).map((s)=>String(s).toLowerCase().trim())); const ranked=(r.data?.jobs||[]).map((job)=>{const js=[...(job.skills||[])].map((s)=>String(s).toLowerCase().trim()); const match=js.length?Math.round(js.filter((s)=>skills.has(s)).length/new Set(js).size*100):0; return {...job, _match:match};}).sort((a,b)=>b._match-a._match); setJobs(ranked); } catch { setJobs([]); } finally { setLoading(false); } };
  useEffect(() => { search(); }, []);
  return (
    <div className="phase1-page recommended-jobs-page">
      <section className="panel opportunities-panel">
        <div className="recommended-jobs-heading">
          <div>
            <div className="eyebrow">OPPORTUNITIES</div>
            <h2>Recommended jobs</h2>
            <p className="muted-text">Find opportunities that fit your resume and skills.</p>
          </div>
          <span className="recommended-live-badge"><i /> Live job search</span>
        </div>

        <form className="opportunity-search" onSubmit={search}>
          <label>
            <span>Job role</span>
            <MenuSelect
              value={query}
              onChange={(value) => setQuery(String(value))}
              options={JOB_ROLE_OPTIONS.map((role) => ({ value: role.trim(), label: role.trim() }))}
              placeholder="Choose a job role"
            />
          </label>
          <label>
            <span>Location</span>
            <MenuSelect
              value={location}
              onChange={(value) => setLocation(String(value))}
              options={RECOMMENDED_JOB_LOCATIONS.map((place) => ({ value: place, label: place }))}
              placeholder="Choose a location"
            />
          </label>
          <button type="submit" className="action-blue-button recommended-search-button" disabled={loading}>
            {loading ? "Searching…" : "Search jobs"}
          </button>
        </form>

        {resume && (
          <div className="opportunity-note">
            <span className="recommended-resume-icon">✓</span>
            <span>Personalized with resume <strong>{resume.name}</strong></span>
          </div>
        )}

        {loading ? (
          <div className="recommended-loading"><span className="spinner" /> Finding jobs for you…</div>
        ) : jobs.length ? (
          <div className="recommendation-list">
            {jobs.slice(0, 8).map((job) => (
              <article className="recommendation-row" key={`${job.id}-${job.source}`}>
                <div className="recommended-job-info">
                  <strong>{job.title}</strong>
                  <span>{job.company} <i>·</i> {job.location || "Location not specified"}</span>
                  {!!job.skills?.length && <small>{job.skills.slice(0, 6).join(" · ")}</small>}
                </div>
                <div className="recommendation-actions">
                  <b className="recommended-match">{job._match}% <small>match</small></b>
                  <button
                    type="button"
                    className="recommended-view-button"
                    onClick={() => job.url && window.open(job.url, "_blank", "noopener,noreferrer")}
                    disabled={!job.url}
                  >
                    View job
                  </button>
                  <button type="button" className="recommended-track-button" onClick={() => onNavigate("applications")}>
                    Track
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="recommended-empty">
            <span aria-hidden="true">⌕</span>
            <strong>No recommendations found</strong>
            <p>Try another job role or location to broaden your search.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function RecruiterMessagesPage({ user }) {
  const [messages, setMessages] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState("");
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const syncInProgressRef = useRef(false);
  const readMessagesKey = `jobtracker_read_recruiter_messages_${user?.email || "guest"}`;
  const updatedMessagesKey = `jobtracker_updated_recruiter_messages_${user?.email || "guest"}`;
  const [viewedMessageIds, setViewedMessageIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(readMessagesKey) || "[]");
    } catch {
      return [];
    }
  });
  const [updatedMessages, setUpdatedMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(updatedMessagesKey) || "[]");
    } catch {
      return [];
    }
  });
  const [messageFilter, setMessageFilter] = useState("all");
  const [applicationFilter, setApplicationFilter] = useState(null);
  const [expandedMessageId, setExpandedMessageId] = useState(null);
  const [reviewSelections, setReviewSelections] = useState({});

  useEffect(() => {
    setViewedMessageIds([]);
    setUpdatedMessages([]);
    setMessageFilter("all");
    setExpandedMessageId(null);
    try {
      setViewedMessageIds(JSON.parse(localStorage.getItem(readMessagesKey) || "[]"));
      setUpdatedMessages(JSON.parse(localStorage.getItem(updatedMessagesKey) || "[]"));
    } catch {
      setError("Unable to load saved recruiter message state.");
    }
  }, [readMessagesKey, updatedMessagesKey]);

  const normalize = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const classifyEmail = (item) => item.detectedStatus || null;

  const refreshReviewState = (incoming) => {
    const updated = incoming
      .filter((item) => item.statusUpdated)
      .map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        company: item.matchedCompany || item.company,
        role: item.matchedRole || item.role,
        status: item.detectedStatus,
        subject: item.subject,
      }));
    setUpdatedMessages(updated);
    localStorage.setItem(updatedMessagesKey, JSON.stringify(updated));
  };

  const refreshStoredData = async () => {
    const [storedMessagesResponse, applicationsResponse] = await Promise.all([
      api.get("/recruiter-messages/messages"),
      api.get("/jobs"),
    ]);
    const storedMessages = Array.isArray(storedMessagesResponse.data)
      ? storedMessagesResponse.data
      : [];
    const appList = Array.isArray(applicationsResponse.data)
      ? applicationsResponse.data
      : [];
    setMessages(storedMessages);
    setApplications(appList);
    refreshReviewState(storedMessages);
    return storedMessages;
  };

  const loadMessages = async () => {
    setLoading(true);
    setError("");
    try {
      const statusResponse = await api.get("/recruiter-messages/status");
      const connectedNow = Boolean(statusResponse.data?.connected);
      setConnected(connectedNow);
      setConnectedEmail(statusResponse.data?.email || "");

      await refreshStoredData();

      if (connectedNow && !syncInProgressRef.current) {
        syncInProgressRef.current = true;
        try {
          const syncResponse = await api.get("/recruiter-messages");
          const syncedMessages = Array.isArray(syncResponse.data) ? syncResponse.data : [];
          setMessages(syncedMessages);
          refreshReviewState(syncedMessages);
          setLastSync(new Date());
          if (syncedMessages.some((item) => item.statusUpdated)) {
            window.dispatchEvent(new Event("jobtracker:data-changed"));
          }
        } catch (syncError) {
          setError(
            syncError.response?.data?.detail || "Gmail sync failed. Your saved messages are still available."
          );
          try {
            const savedMessages = await refreshStoredData();
            if (savedMessages.some((item) => item.statusUpdated)) {
              window.dispatchEvent(new Event("jobtracker:data-changed"));
            }
          } catch (refreshError) {
            setError(
              `${syncError.response?.data?.detail || "Gmail sync failed."} Saved messages could not be refreshed: ${
                refreshError.response?.data?.detail || refreshError.message
              }`
            );
          }
        } finally {
          syncInProgressRef.current = false;
        }
      } else if (!connectedNow) {
        setLastSync(null);
      }
    } catch (err) {
      const status = err.response?.status;
      setError(status === 503
        ? (err.response?.data?.detail || "Gmail integration is not configured in the backend.")
        : (err.response?.data?.detail || "Unable to load recruiter messages."));
    } finally {
      setLoading(false);
    }
  };

  const connectGmail = async () => {
    setConnecting(true);
    setError("");
    try {
      const response = await api.get("/recruiter-messages/connect");
      if (!response.data?.authorization_url) throw new Error("Google authorization URL was not returned.");
      window.location.href = response.data.authorization_url;
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Unable to start Gmail connection.");
      setConnecting(false);
    }
  };

  const syncMessages = async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setSyncing(true);
    setError("");
    try {
      const response = await api.post("/recruiter-messages/sync");
      const applicationsResponse = await api.get("/jobs");
      const incoming = Array.isArray(response.data) ? response.data : [];
      const appList = Array.isArray(applicationsResponse.data) ? applicationsResponse.data : [];
      setMessages(incoming);
      setApplications(appList);
      refreshReviewState(incoming);
      setLastSync(new Date());
      if (incoming.some((item) => item.statusUpdated)) {
        window.dispatchEvent(new Event("jobtracker:data-changed"));
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to sync recruiter messages.");
      try {
        const savedMessages = await refreshStoredData();
        if (savedMessages.some((item) => item.statusUpdated)) {
          window.dispatchEvent(new Event("jobtracker:data-changed"));
        }
      } catch (refreshError) {
        setError(
          `${err.response?.data?.detail || "Unable to sync recruiter messages."} Saved messages could not be refreshed: ${
            refreshError.response?.data?.detail || refreshError.message
          }`
        );
      }
    } finally {
      setSyncing(false);
      syncInProgressRef.current = false;
    }
  };

  const reviewMessageMatch = async (item) => {
    const applicationId = Number(reviewSelections[item.id]);
    if (!applicationId) return;

    setError("");
    try {
      const response = await api.put(
        `/recruiter-messages/${encodeURIComponent(item.id)}/review`,
        { application_id: applicationId }
      );
      const applicationsResponse = await api.get("/jobs");
      const appList = Array.isArray(applicationsResponse.data)
        ? applicationsResponse.data
        : [];
      setMessages((previous) =>
        previous.map((message) =>
          message.id === item.id ? response.data : message
        )
      );
      setApplications(appList);
      if (response.data.statusUpdated) {
        window.dispatchEvent(new Event("jobtracker:data-changed"));
      }
      refreshReviewState(
        messages.map((message) =>
          message.id === item.id ? response.data : message
        )
      );
    } catch (err) {
      setError(
        err.response?.data?.detail || "Unable to save the reviewed email match."
      );
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailState = params.get("gmail");
    if (gmailState === "cancelled") setError("Gmail connection was cancelled.");
    loadMessages();
  }, [user?.email]);

  useEffect(() => {
    if (!connected) return undefined;
    const timer = window.setInterval(loadMessages, 300000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const submittedStatuses = new Set([
    "applied",
    "application received",
    "in review",
    "under review",
    "shortlisted",
    "interview scheduled",
    "assessment",
    "selected",
    "offer received",
    "screening",
    "interview",
    "offer",
    "rejected",
  ]);
  const applicationStatuses = applications.map((application) =>
    normalize(application.status)
  );
  const appliedJobsCount = applicationStatuses.filter((status) =>
    submittedStatuses.has(status)
  ).length;
  const interviewStageCount = applicationStatuses.filter((status) =>
    ["interview scheduled", "interview"].includes(status)
  ).length;
  const offersReceivedCount = applicationStatuses.filter((status) =>
    ["offer received", "offer"].includes(status)
  ).length;
  const rejectedCount = applicationStatuses.filter((status) => status === "rejected").length;
  const selectedCount = applicationStatuses.filter((status) => status === "selected").length;
  const updatedMessageRecords = messages.filter((message) => message.statusUpdated);
  const applicationFilterStatuses = {
    appliedJobs: new Set([
      "applied",
      "application received",
      "under review",
      "shortlisted",
      "interview scheduled",
      "assessment",
      "selected",
      "offer received",
      "screening",
      "interview",
      "offer",
      "rejected",
    ]),
    interviewStage: new Set(["interview scheduled", "interview"]),
    offersReceived: new Set(["offer received", "offer"]),
    rejected: new Set(["rejected"]),
    selected: new Set(["selected"]),
  };
  const filteredApplications = applicationFilter
    ? applications.filter((application) =>
        applicationFilterStatuses[applicationFilter].has(normalize(application.status))
      )
    : [];
  const filteredMessages = messages.filter((item) => {
    if (messageFilter === "new") {
      return item.id &&
        (!viewedMessageIds.includes(item.id) || expandedMessageId === item.id);
    }
    if (messageFilter === "interviews") return classifyEmail(item) === "Interview";
    if (messageFilter === "updated") {
      return updatedMessageRecords.some((record) => record.id === item.id);
    }
    return true;
  });

  const openMessageFilter = (filter) => {
    setApplicationFilter(null);
    setMessageFilter(filter);
    setExpandedMessageId(null);
  };

  const openApplicationFilter = (filter) => {
    setApplicationFilter(filter);
    setExpandedMessageId(null);
  };

  const toggleMessage = (item) => {
    const messageId = item.id;
    setExpandedMessageId((current) => current === messageId ? null : messageId);
    if (messageId && !viewedMessageIds.includes(messageId)) {
      setViewedMessageIds((current) => {
        const next = [...current, messageId];
        localStorage.setItem(readMessagesKey, JSON.stringify(next));
        return next;
      });
    }
  };

  return <div className="phase1-page recruiter-messages-page">
    <section className="panel opportunities-panel">
      <div className="section-heading recruiter-messages-header">
        <div>
          <div className="eyebrow">APPLICATION INTELLIGENCE</div>
          <h2>Recruiter Messages</h2>
          <p className="muted-text">Gmail messages are matched to your tracked applications and strong status signals can update them automatically.</p>
          {connected && <small className="recruiter-connected-badge">● Gmail connected{connectedEmail ? ` · ${connectedEmail}` : ""}</small>}
        </div>
        {connected && (
          <div className="recruiter-header-actions">
            <button type="button" className="action-blue-button recruiter-sync-button" onClick={syncMessages} disabled={syncing}>
              {syncing ? "Syncing…" : "↻ Check for updates"}
            </button>
          </div>
        )}
      </div>

      <div className="recruiter-message-summary" aria-label="Application and message summary">
        <button type="button" className={`recruiter-summary-tile recruiter-summary-stat ${applicationFilter === "appliedJobs" ? "active" : ""}`} aria-pressed={applicationFilter === "appliedJobs"} title="Applications with a submitted or later status" onClick={() => openApplicationFilter("appliedJobs")}><strong>{appliedJobsCount}</strong><span>Applied jobs</span></button>
        <button type="button" className={`recruiter-summary-tile ${messageFilter === "all" ? "active" : ""}`} aria-pressed={messageFilter === "all"} onClick={() => openMessageFilter("all")}><strong>{messages.length}</strong><span>Total messages</span></button>
        <button type="button" className={`recruiter-summary-tile recruiter-summary-stat ${applicationFilter === "offersReceived" ? "active" : ""}`} aria-pressed={applicationFilter === "offersReceived"} title="Applications with an offer status" onClick={() => openApplicationFilter("offersReceived")}><strong>{offersReceivedCount}</strong><span>Offers</span></button>
        <button type="button" className={`recruiter-summary-tile recruiter-summary-stat ${applicationFilter === "rejected" ? "active" : ""}`} aria-pressed={applicationFilter === "rejected"} title="Rejected applications" onClick={() => openApplicationFilter("rejected")}><strong>{rejectedCount}</strong><span>Rejected</span></button>
        <button type="button" className={`recruiter-summary-tile recruiter-summary-stat ${applicationFilter === "interviewStage" ? "active" : ""}`} aria-pressed={applicationFilter === "interviewStage"} title="Interview scheduled or interview status" onClick={() => openApplicationFilter("interviewStage")}><strong>{interviewStageCount}</strong><span>Interview</span></button>
        <button type="button" className={`recruiter-summary-tile recruiter-summary-stat ${applicationFilter === "selected" ? "active" : ""}`} aria-pressed={applicationFilter === "selected"} title="Selected applications" onClick={() => openApplicationFilter("selected")}><strong>{selectedCount}</strong><span>Selected</span></button>
      </div>

      {lastSync && <div className="recruiter-sync-meta">Last checked {lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · checks every 5 minutes while this page is open</div>}
      {error && <div className="recruiter-sync-notice">{error}</div>}

      {updatedMessageRecords.length > 0 && (
        <div className="recruiter-automation-notice">
          <strong>Application updates detected</strong>
          {updatedMessageRecords.slice(0, 4).map((item) => (
            <span key={`${item.id}-${item.detectedStatus || item.status}`}>✓ {item.company} · {item.role} → <b>{item.detectedStatus || "Updated"}</b></span>
          ))}
        </div>
      )}

      {applicationFilter ? (
        <div className="recruiter-application-results">
          <div className="recruiter-application-results-heading">
            <strong>
              {applicationFilter === "appliedJobs" && "Applied jobs"}
              {applicationFilter === "interviewStage" && "Interview applications"}
              {applicationFilter === "offersReceived" && "Offer applications"}
              {applicationFilter === "rejected" && "Rejected applications"}
              {applicationFilter === "selected" && "Selected applications"}
            </strong>
            <span>{filteredApplications.length} application{filteredApplications.length === 1 ? "" : "s"}</span>
          </div>
          {filteredApplications.length ? (
            <div className="applied-simple-list">
              {filteredApplications.map((application) => (
                <article className="applied-simple-card" key={application.id}>
                  <div className="applied-simple-main">
                    <strong>{application.company || "Company not specified"}</strong>
                    <h3>{application.role || "Role not specified"}</h3>
                    <div className="applied-simple-meta">
                      <span>{application.location || "Location not specified"}</span>
                      <span>Applied {application.applied_date || "date not recorded"}</span>
                    </div>
                  </div>
                  <div className="applied-simple-status">
                    <span className={`status-badge ${String(application.status || "Applied").toLowerCase()}`}>{application.status || "Applied"}</span>
                    <small>Tracked application</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="recruiter-empty">
              <strong>No applications in this stage</strong>
              <span>Applications will appear here when their status matches this summary.</span>
            </div>
          )}
        </div>
      ) : loading ? <div className="loading">Checking Gmail for recruiter updates…</div> : filteredMessages.length ? (
        <div className="recruiter-message-list">
          {filteredMessages.map((item) => {
            const detectedStatus = classifyEmail(item);
            const isExpanded = expandedMessageId === item.id;
            const wasViewed = viewedMessageIds.includes(item.id);
            const didUpdateApplication = Boolean(item.statusUpdated);
            return (
              <article
                className={`recruiter-message-card ${isExpanded ? "expanded" : ""}`}
                key={item.id || `${item.company}-${item.receivedAt}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={(event) => {
                  if (!event.target.closest("button, select")) toggleMessage(item);
                }}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    toggleMessage(item);
                  }
                }}
              >
                <div className="recruiter-message-icon">✉</div>
                <div className="recruiter-message-content">
                  <div className="recruiter-message-top">
                    <div><strong>{item.matchedCompany || item.company || "Company"}</strong><span>{item.matchedRole || item.role || "Role not specified"}{item.sender ? ` · ${item.sender}` : ""}</span></div>
                    <span className="recruiter-status">{detectedStatus || (didUpdateApplication ? "Application updated" : wasViewed ? "Read" : item.status || "New")}</span>
                  </div>
                  <h3>{item.subject || "Recruiter update"}</h3>
                  <p className={isExpanded ? "recruiter-message-full" : ""}>{item.message || item.body || "Recruiter message received."}</p>
                  <div className="recruiter-message-footer">
                    <span>{item.receivedAt ? new Date(item.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Recently received"}</span>
                    {detectedStatus && <b>Detected: {detectedStatus}</b>}
                    {didUpdateApplication && <b>Application status updated</b>}
                    {!didUpdateApplication && detectedStatus && item.applicationId && <b>Application not updated</b>}
                    <span>Match: {{ needs_review: "Needs review", matched: "Matched", unmatched: "Unmatched" }[item.matchingReviewStatus] || "Unmatched"}</span>
                    {item.applicationId && <span>Application: {item.matchedRole || item.role}</span>}
                    <span className="recruiter-message-expand-hint">{isExpanded ? "Click to collapse" : "Click to read"}</span>
                  </div>
                  {item.matchReviewRequired && (
                    <div className="recruiter-message-review" onClick={(event) => event.stopPropagation()}>
                      <label>
                        Review match
                        <select
                          value={reviewSelections[item.id] || ""}
                          onChange={(event) =>
                            setReviewSelections((previous) => ({
                              ...previous,
                              [item.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select an application</option>
                          {applications.map((application) => (
                            <option key={application.id} value={application.id}>
                              {application.company} · {application.role}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="action-blue-button"
                        disabled={!reviewSelections[item.id]}
                        onClick={() => reviewMessageMatch(item)}
                      >
                        Confirm match
                      </button>
                      <span>{item.matchReviewReason || "This email was not matched automatically."}</span>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="recruiter-empty">
          <div className="recruiter-empty-icon">✉</div>
          <strong>{messages.length ? "No messages in this filter" : connected ? "No recruiter messages found" : "Connect Gmail to receive recruiter messages"}</strong>
          <span>{messages.length ? "Choose another summary tile to view a different group of messages." : connected ? "No job-related recruiter emails were found in the selected Gmail window." : "Your tracker can read job-related emails such as application confirmations, interview invitations, assessments and offer updates."}</span>
          {!messages.length && <button type="button" className="action-blue-button" onClick={connected ? syncMessages : connectGmail} disabled={syncing || connecting}>{connected ? (syncing ? "Syncing…" : "↻ Check for updates") : (connecting ? "Connecting…" : "Connect Gmail")}</button>}
        </div>
      )}
    </section>
  </div>;
}
function PageShell({ title, user, children }) {
  return (
    <>
      <header>
        <div>
          <div className="eyebrow">JOB SEARCH WORKSPACE</div>
          <h1>{title}</h1>
          <span>Welcome back, {user.name?.split(" ")[0]}.</span>
        </div>
        <div className="header-pill">● Data synced</div>
      </header>
      {children}
    </>
  );
}

function Dashboard({ user, accounts, onNavigate, onLogout, onSwitchAccount, profilePhoto }) {
  const [d, setD] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [interviewLoadError, setInterviewLoadError] = useState("");
  const [trendMetric, setTrendMetric] = useState("Applications");
  const [skillLocation, setSkillLocation] = useState("All Locations");
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [readNotifications, setReadNotifications] = useState(() => { try { return JSON.parse(localStorage.getItem(`jobtracker_read_notifications_${user?.email}`) || "[]"); } catch { return []; } });
  const [kanbanMenuPosition, setKanbanMenuPosition] = useState(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [openKanbanMenu, setOpenKanbanMenu] = useState(null);

  useEffect(() => {
    try {
      setReadNotifications(JSON.parse(localStorage.getItem(`jobtracker_read_notifications_${user?.email}`) || "[]"));
    } catch {
      setReadNotifications([]);
    }
  }, [user?.email]);

  useEffect(() => {
    const closeProfileMenu = (event) => {
      if (!event.target.closest(".profile-menu-wrap")) setProfileOpen(false);
    };
    document.addEventListener("mousedown", closeProfileMenu);
    return () => document.removeEventListener("mousedown", closeProfileMenu);
  }, []);

  useEffect(() => {
    const closeKanbanMenu = (event) => {
      if (!event.target.closest(".kanban-card-menu-wrap") && !event.target.closest(".kanban-card-menu")) {
        setOpenKanbanMenu(null);
        setKanbanMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", closeKanbanMenu);
    return () => document.removeEventListener("mousedown", closeKanbanMenu);
  }, []);

  const load = async () => {
  const [
    dashboardResult,
    jobsResult,
    interviewsResult,
    resumesResult,
  ] = await Promise.allSettled([
    api.get("/dashboard"),
    api.get("/jobs"),
    api.get("/interviews", {
      params: { _t: Date.now() },
    }),
    api.get("/resumes"),
  ]);

  const loadedJobs =
    jobsResult.status === "fulfilled" &&
    Array.isArray(jobsResult.value.data)
      ? jobsResult.value.data
      : [];

  const loadedInterviews =
    interviewsResult.status === "fulfilled" &&
    Array.isArray(interviewsResult.value.data)
      ? interviewsResult.value.data
      : [];

  /*
   * STAGE 3
   * Only interviews belonging to applications
   * that are CURRENTLY in Interview status
   * are active in the user portal.
   */
  const activeInterviews = loadedInterviews.filter(
    (interview) => {
      const linkedJob = loadedJobs.find(
        (job) =>
          String(job?.id) ===
          String(interview?.job_id)
      );

      return (
        linkedJob &&
        String(linkedJob.status || "")
          .trim()
          .toLowerCase() === "interview"
      );
    }
  );

  const loadedResumes =
    resumesResult.status === "fulfilled" &&
    Array.isArray(resumesResult.value.data)
      ? resumesResult.value.data
      : [];

  setJobs(loadedJobs);
  setInterviews(activeInterviews);
  setResumes(loadedResumes);

  setInterviewLoadError(
    interviewsResult.status === "rejected"
      ? (
          interviewsResult.reason?.response?.data?.detail ||
          "Interview schedule could not be loaded."
        )
      : ""
  );

  if (
    dashboardResult.status === "fulfilled" &&
    dashboardResult.value.data
  ) {
    setD(dashboardResult.value.data);
    return;
  }

  // Fallback if /dashboard fails.
  const statusBreakdown = [
    "Wishlist",
    "Applied",
    "Screening",
    "Interview",
    "Offer",
    "Rejected",
    "Withdrawn",
  ]
    .map((status) => ({
      status,
      count: loadedJobs.filter(
        (job) =>
          String(job.status || "")
            .toLowerCase() ===
          status.toLowerCase()
      ).length,
    }))
    .filter((item) => item.count > 0);

  const submitted = loadedJobs.filter(
    (job) =>
      !["Wishlist", "Withdrawn"].includes(
        job.status
      )
  ).length;

  const responded = loadedJobs.filter(
    (job) =>
      ![
        "Wishlist",
        "Applied",
        "Withdrawn",
      ].includes(job.status)
  ).length;

  setD({
    submitted_applications: submitted,
    applications_with_interviews:
      activeInterviews.length,
    offers: loadedJobs.filter(
      (job) => job.status === "Offer"
    ).length,
    response_rate: submitted
      ? Math.round(
          (responded / submitted) * 100
        )
      : 0,
    status_breakdown: statusBreakdown,
  });

  console.error(
    "Dashboard aggregate endpoint failed:",
    dashboardResult.reason
  );
};

  useEffect(() => {
    load();

    const refreshDashboard = () => load();
    window.addEventListener("jobtracker:data-changed", refreshDashboard);
    window.addEventListener("focus", refreshDashboard);
    const refreshTimer = window.setInterval(refreshDashboard, 30000);

    return () => {
      window.removeEventListener("jobtracker:data-changed", refreshDashboard);
      window.removeEventListener("focus", refreshDashboard);
      window.clearInterval(refreshTimer);
    };
  }, []);

  if (!d) return <div className="loading">Loading dashboard…</div>;

  // Use the live /jobs response for tracked-application counts.
  // Wishlist items are valid tracked applications, but the backend's
  // submitted_applications intentionally excludes them from rate metrics.
  const totalTracked = jobs.length;
  const submitted = Number(d.submitted_applications || 0);
  const wishlist = jobs.filter((j) => String(j.status || "").trim().toLowerCase() === "wishlist").length;
  // Count unique applications that are either in the Interview stage
  // or have an actual interview record. This keeps the Home metric in
  // sync when an application status is changed to Interview manually.
  const interviewApplicationIds = new Set(
    jobs
      .filter(
        (job) =>
          String(job?.status || "").trim().toLowerCase() === "interview"
      )
      .map((job) => String(job.id))
  );

  interviews.forEach((interview) => {
    if (interview?.job_id != null) {
      interviewApplicationIds.add(String(interview.job_id));
    }
  });

  const interviewed = jobs.filter(
  (job) =>
    String(job?.status || "")
      .trim()
      .toLowerCase() === "interview"
).length;
  const offers = Number(d.offers || 0);
  const responseRate = Number(d.response_rate || 0);

  const statusCount = (name) => {
  const normalized = String(name || "").trim().toLowerCase();

  // Always use the latest /jobs response.
  // The /dashboard aggregate can be stale immediately after
  // an interview changes an application's status.
  return jobs.filter(
    (job) =>
      String(job?.status || "").trim().toLowerCase() === normalized
  ).length;
};

  const applied = statusCount("Applied");
  const interview = statusCount("Interview");
  const screening = statusCount("Screening");
  const rejected = statusCount("Rejected");
  const offer = statusCount("Offer");

  const responseCount = Math.round((submitted * responseRate) / 100);

  const latestResume = [...resumes].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
  const normalizeMatchSkill = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const resumeSkillSet = new Set((latestResume?.skills || []).map(normalizeMatchSkill).filter(Boolean));
  const profileForMatch = readStoredProfile(user);
  const profileRoles = String(profileForMatch.preferredRoles || profileForMatch.currentRole || profileForMatch.headline || "").toLowerCase();
  const profileLocation = String(profileForMatch.location || profileForMatch.city || "").toLowerCase();

  const calculatedMatchScore = (job) => {
    const providerScore = Number(job?.match_score);
    if (Number.isFinite(providerScore) && providerScore >= 0) return providerScore;

    const required = [...new Set((Array.isArray(job?.required_skills) ? job.required_skills : [])
      .map(normalizeMatchSkill).filter(Boolean))];
    const matched = required.filter((skill) => resumeSkillSet.has(skill));
    const skillScore = required.length ? (matched.length / required.length) * 70 : 0;
    const roleText = String(job?.role || job?.title || "").toLowerCase();
    const roleScore = profileRoles && roleText && (roleText.split(/\s+/).some((word) => word.length > 2 && profileRoles.includes(word)) ? 20 : 0);
    const jobLocation = String(job?.location || "").toLowerCase();
    const locationScore = profileLocation && jobLocation && jobLocation.includes(profileLocation) ? 10 : 0;
    const availableWeight = (required.length ? 70 : 0) + (profileRoles ? 20 : 0) + (profileLocation ? 10 : 0);
    if (!availableWeight) return null;
    return Math.round((skillScore + roleScore + locationScore) / availableWeight * 100);
  };

  const matchScore = jobs
    .map(calculatedMatchScore)
    .filter((x) => Number.isFinite(x));

  const averageMatch = matchScore.length
    ? Math.round(matchScore.reduce((a, b) => a + b, 0) / matchScore.length)
    : null;

  const recentJobs = [...jobs]
    .sort((a, b) => String(b.applied_date || b.created_at || "").localeCompare(String(a.applied_date || a.created_at || "")))
    .slice(0, 5);

  const hasResume = Boolean(latestResume);
  const hasJobRequirements = jobs.some((job) => Array.isArray(job?.required_skills) && job.required_skills.length);

  const dashboardMatchedSkills = hasResume && hasJobRequirements
    ? [...new Set(
        jobs.flatMap((job) => Array.isArray(job?.required_skills) ? job.required_skills : [])
          .map(normalizeMatchSkill)
          .filter((skill) => skill && resumeSkillSet.has(skill))
      )]
    : [];

  const dashboardMissingSkills = hasResume && hasJobRequirements
    ? [...new Set(
        jobs.flatMap((job) => Array.isArray(job?.required_skills) ? job.required_skills : [])
          .map(normalizeMatchSkill)
          .filter((skill) => skill && !resumeSkillSet.has(skill))
      )]
    : [];

  const dashboardSuggestion = dashboardMissingSkills.length
    ? `Consider adding evidence of ${dashboardMissingSkills.slice(0, 2).map((skill) => skill.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(" and ")} through relevant projects or experience.`
    : "Your current resume covers the detected skills in your tracked job requirements.";

  const filteredJobs = skillLocation === "All Locations"
    ? jobs
    : jobs.filter((j) => String(j.location || "").toLowerCase().includes(skillLocation.toLowerCase()));

  const derivedSkills = {};
  filteredJobs.forEach((job) => {
    (Array.isArray(job.required_skills) ? job.required_skills : []).forEach((skill) => {
      const name = String(skill).trim();
      if (name) derivedSkills[name] = (derivedSkills[name] || 0) + 1;
    });
  });
  const skillList = Object.entries(derivedSkills)
    .map(([name, value]) => ({ name, value: value * 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const displaySkills = skillList.length ? skillList : GLOBAL_SKILLS;

  const now = new Date();
  const weeks = Array.from({ length: 5 }, (_, index) => {
    const end = new Date(now);
    end.setDate(now.getDate() - (4 - index) * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return { start, end, label: end.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) };
  });

  const inWeek = (dateValue, week) => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    return !Number.isNaN(date.getTime()) && date >= week.start && date <= new Date(week.end.getTime() + 86399999);
  };

  const metricForWeek = (week) => {
    if (trendMetric === "Applications") return jobs.filter((j) => inWeek(j.applied_date, week)).length;
    if (trendMetric === "Interviews") return interviews.filter((i) => inWeek(i.interview_date, week)).length;
    if (trendMetric === "Offers") return jobs.filter((j) => j.status === "Offer" && inWeek(j.applied_date, week)).length;
    if (trendMetric === "Rejected") return jobs.filter((j) => j.status === "Rejected" && inWeek(j.applied_date, week)).length;
    if (trendMetric === "Screening") return jobs.filter((j) => j.status === "Screening" && inWeek(j.applied_date, week)).length;
    if (trendMetric === "Response Rate") {
      const total = jobs.filter((j) => inWeek(j.applied_date, week)).length;
      const responded = jobs.filter((j) => inWeek(j.applied_date, week) && !["Wishlist", "Applied"].includes(j.status)).length;
      return total ? Math.round((responded / total) * 100) : 0;
    }
    const total = jobs.filter((j) => inWeek(j.applied_date, week)).length;
    const offerCount = jobs.filter((j) => j.status === "Offer" && inWeek(j.applied_date, week)).length;
    return total ? Math.round((offerCount / total) * 100) : 0;
  };

  const trendLabels = weeks.map((w) => w.label);
  const trendValues = weeks.map(metricForWeek);

  const trendData = {
    labels: trendLabels,
    datasets: [{
      label: trendMetric,
      data: trendValues,
      borderWidth: 3,
      borderColor: "#1677ff",
      backgroundColor: "rgba(22,119,255,.14)",
      pointBackgroundColor: "#1677ff",
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,
      pointRadius: 4,
      fill: true,
      tension: 0.38,
    }],
  };

  // Personalized skill comparison. Never use hardcoded resume/job skills here.
  const jobSkillDemand = {};
  jobs.forEach((job) => {
    const requiredSkills = Array.isArray(job?.required_skills) ? job.required_skills : [];
    [...new Set(requiredSkills.map(normalizeMatchSkill).filter(Boolean))].forEach((skill) => {
      jobSkillDemand[skill] = (jobSkillDemand[skill] || 0) + 1;
    });
  });

  const topRequiredSkills = Object.entries(jobSkillDemand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const radarLabels = topRequiredSkills.map(([skill]) =>
    skill.replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
  const maxDemand = Math.max(1, ...topRequiredSkills.map(([, count]) => count));
  const radarData = {
    labels: radarLabels,
    datasets: [
      {
        label: "Your Skills",
        data: topRequiredSkills.map(([skill]) => (resumeSkillSet.has(skill) ? 100 : 0)),
        borderColor: "#1683ff",
        backgroundColor: "rgba(22,131,255,.18)",
        borderWidth: 2,
        pointRadius: 2,
      },
      {
        label: "Job Requirements",
        data: topRequiredSkills.map(([, count]) => Math.round((count / maxDemand) * 100)),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,.12)",
        borderWidth: 2,
        pointRadius: 2,
      },
    ],
  };

  const statusLabels = ["Wishlist", "Applied", "Interviewing", "Offer", "Rejected"];
  const statusValues = [
    wishlist,
    applied,
    interview + screening,
    offer,
    rejected,
  ];

  const donutData = {
    labels: statusLabels,
    datasets: [{
      data: statusValues.some(Boolean) ? statusValues : [1, 0, 0, 0],
      backgroundColor: ["#7645d7", "#1683ff", "#18b7a0", "#f7b928", "#f26b6b"],
      borderWidth: 0,
      hoverOffset: 5,
    }],
  };

  const barData = {
    labels: displaySkills.map((x) => x.name),
    datasets: [{
      label: "Demand",
      data: displaySkills.map((x) => x.value),
      backgroundColor: [
        "#1559a6", "#2c7fe5", "#43b9bc", "#54c89a", "#f2b544",
        "#f27a45", "#ec668d", "#d957a7", "#8a67d8", "#a88be8"
      ],
      borderRadius: 4,
      borderSkipped: false,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: {
        position: "top",
        labels: { usePointStyle: true, boxWidth: 7, padding: 12 },
      },
    },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 20, backdropColor: "transparent", color: "#8090a8" },
        grid: { color: "rgba(60,80,110,.12)" },
        angleLines: { color: "rgba(60,80,110,.12)" },
        pointLabels: { color: "#61728c", font: { size: 10, weight: "600" } },
      },
    },
  };

  const barOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "rgba(60,80,110,.10)" },
        ticks: { color: "#718198", font: { size: 10 } },
      },
      y: {
        grid: { display: false },
        ticks: { color: "#334155", font: { size: 10, weight: "600" } },
      },
    },
  };

  const displayScore = (job) => {
    const score = calculatedMatchScore(job);
    return Number.isFinite(score) ? `${Math.round(score)}%` : "—";
  };

  const scoreClass = (job) => {
    const n = calculatedMatchScore(job);
    if (!Number.isFinite(n)) return "score-neutral";
    if (n >= 85) return "score-high";
    if (n >= 70) return "score-mid";
    return "score-low";
  };

  const interviewCountByJob = interviews.reduce((counts, item) => {
    const key = String(item.job_id);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  const kanbanGroups = [
    { title: "Wishlist", color: "purple", items: jobs.filter((j) => j.status === "Wishlist").slice(0, 8) },
    { title: "Applied", color: "blue", items: jobs.filter((j) => j.status === "Applied").slice(0, 8) },
    { title: "Interviewing", color: "green", items: jobs.filter((j) => j.status === "Interview" || j.status === "Screening").slice(0, 8) },
    { title: "Offer", color: "yellow", items: jobs.filter((j) => j.status === "Offer").slice(0, 8) },
    { title: "Rejected", color: "red", items: jobs.filter((j) => j.status === "Rejected").slice(0, 8) },
  ];

  const deleteDashboardApplication = async (job) => {
    if (!job?.id) return;
    const confirmed = window.confirm(`Delete the ${job.role || "application"} application from ${job.company || "this company"}? This will also remove its linked interviews.`);
    if (!confirmed) return;

    try {
      const linkedInterviews = interviews.filter((item) => String(item.job_id) === String(job.id));
      for (const interview of linkedInterviews) {
        await api.delete(`/interviews/${interview.id}`);
      }
      await api.delete(`/jobs/${job.id}`);
      setOpenKanbanMenu(null);
      setKanbanMenuPosition(null);
      await load();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Unable to delete this application.");
    }
  };

  const searchTerm = globalSearch.trim().toLowerCase();
  const globalSearchResults = searchTerm ? [
    ...jobs.map((job) => ({ type: "application", title: job.role || job.title || "Application", meta: `${job.company || "Company"}${job.location ? ` · ${job.location}` : ""}`, page: "applications" })),
    ...interviews.map((item) => ({ type: "interview", title: item.role || item.position || item.company || "Interview", meta: `${item.company || "Interview"}${item.interview_date ? ` · ${new Date(item.interview_date).toLocaleDateString("en-IN")}` : ""}`, page: "interviews" })),
    { type: "page", title: "Applications", meta: "Manage and search applications", page: "applications" },
    { type: "page", title: "Interviews", meta: "Track interview rounds", page: "interviews" },
    { type: "page", title: "Resumes", meta: "Manage resume versions", page: "resumes" },
    { type: "page", title: "Search Jobs", meta: "Find live job opportunities", page: "opportunities-search" },
  ].filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(searchTerm)).slice(0, 7) : [];

  const notifications = [
    ...interviews.slice(0, 3).map((item) => ({ id: `interview-${item.id}`, title: `Interview: ${item.company || item.role || "Upcoming interview"}`, meta: item.interview_date ? new Date(item.interview_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Interview scheduled", icon: "◷" })),
    ...(offers > 0 ? [{ id: "offers", title: `${offers} offer${offers === 1 ? "" : "s"} received`, meta: "Review your offer applications", icon: "✓" }] : []),
    ...(submitted > 0 ? [{ id: "applications", title: `${submitted} application${submitted === 1 ? "" : "s"} tracked`, meta: "Your dashboard is up to date", icon: "▤" }] : []),
  ].slice(0, 5);
  const unreadCount = notifications.filter((item) => !readNotifications.includes(item.id)).length;
  const markNotificationRead = (id) => {
    const next = Array.from(new Set([...readNotifications, id]));
    setReadNotifications(next);
    localStorage.setItem(`jobtracker_read_notifications_${user?.email}`, JSON.stringify(next));
  };
  const markAllNotificationsRead = () => {
    const next = notifications.map((item) => item.id);
    setReadNotifications(next);
    localStorage.setItem(`jobtracker_read_notifications_${user?.email}`, JSON.stringify(next));
  };

  return (
    <>
      <header className="phase4-header">
        <div className="dashboard-header-identity">
          <ProfileAvatar user={user} photo={profilePhoto} className="dashboard-header-avatar" />
          <div>
            <div className="welcome-small">Home</div>
            <h1>{user.name} <span className="wave">👋</span></h1>
            <p>Your job-search home: track applications, interviews, offers and progress.</p>
          </div>
        </div>
        <div className="header-tools">
          <div className="header-search-wrap">
            <button type="button" className={`header-search-trigger ${searchOpen ? "active" : ""}`} aria-label="Search" aria-expanded={searchOpen} onClick={() => { setSearchOpen((v) => !v); setNotificationOpen(false); }}><span>⌕</span><span className="header-search-placeholder">Search applications, interviews, jobs...</span></button>
            {searchOpen && (
              <div className="header-popover search-popover">
                <div className="popover-search-box"><span>⌕</span><input autoFocus value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Search applications, interviews..." /><button type="button" onClick={() => { setGlobalSearch(""); setSearchOpen(false); }}>×</button></div>
                <div className="popover-results">
                  {globalSearch ? (globalSearchResults.length ? globalSearchResults.map((result, index) => (
                    <button type="button" key={`${result.title}-${index}`} className="popover-result" onClick={() => { onNavigate(result.page); setSearchOpen(false); setGlobalSearch(""); }}>
                      <span className="popover-result-icon">{result.type === "interview" ? "◷" : result.type === "application" ? "▤" : "⌂"}</span>
                      <span><strong>{result.title}</strong><small>{result.meta}</small></span>
                    </button>
                  )) : <div className="popover-empty">No matching results.</div>) : <div className="popover-empty">Search your applications, interviews and workspace pages.</div>}
                </div>
              </div>
            )}
          </div>
          <div className="header-action-wrap">
            <button type="button" className={`icon-button notification ${notificationOpen ? "active" : ""}`} aria-label="Notifications" aria-expanded={notificationOpen} onClick={() => { setNotificationOpen((v) => !v); setSearchOpen(false); }}>🔔{unreadCount > 0 && <i />}</button>
            {notificationOpen && (
              <div className="header-popover notification-popover">
                <div className="notification-head"><div><strong>Notifications</strong><small>{unreadCount ? `${unreadCount} unread` : "All caught up"}</small></div><div className="notification-head-actions"><button type="button" className="mark-read-button" onClick={markAllNotificationsRead} disabled={!unreadCount}>Mark all as read</button><button type="button" onClick={() => setNotificationOpen(false)}>×</button></div></div>
                <div className="notification-list">
                  {notifications.length ? notifications.map((item) => { const isRead = readNotifications.includes(item.id); return <button type="button" className={`notification-item ${isRead ? "read" : "unread"}`} key={item.id} onClick={() => markNotificationRead(item.id)}><span className="notification-item-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.meta}</small></span>{!isRead && <b className="notification-unread-dot" />}</button>; }) : <div className="popover-empty">You're all caught up.</div>}
                </div>
              </div>
            )}
          </div>
          <div className="profile-menu-wrap">
            <button type="button" className="profile-chip" onClick={(event) => { event.stopPropagation(); setProfileOpen((v) => !v); }} aria-expanded={profileOpen}>
              <strong>{user.name}</strong><span>{profileOpen ? "⌃" : "⌄"}</span>
            </button>
            {profileOpen && (
              <div className="profile-dropdown" onMouseDown={(event) => event.stopPropagation()}>
                <div className="profile-dropdown-head">
                  <ProfileAvatar user={user} photo={profilePhoto} className="account-avatar large" />
                  <div><strong>{user.name}</strong><small>{user.email}</small></div>
                </div>
                <div className="profile-dropdown-label">SWITCH ACCOUNT</div>
                {accounts.length ? accounts.map((account) => (
                  <button type="button" key={account.email} className={account.email === user.email ? "current-account" : ""} onClick={() => { setProfileOpen(false); onSwitchAccount(account); }}>
                    <span className="account-avatar">{account.name?.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{account.name}</strong><small>{account.email}</small></span>
                    {account.email === user.email && <b>✓</b>}
                  </button>
                )) : <div className="profile-empty">No saved accounts yet.</div>}
                <button type="button" onClick={onLogout}>↪ Logout</button>
              </div>
            )}
          </div>
          <div className="date-chip">▣ &nbsp; {new Date().toLocaleDateString("en-IN", {
            weekday: "short", day: "2-digit", month: "short", year: "numeric"
          })}</div>
        </div>
      </header>

      <section className="phase4-metrics">
        <Metric icon="▤" title="Total Applications" value={totalTracked} note={`${submitted} submitted · ${wishlist} wishlist`} tone="blue" />
        <Metric icon="☆" title="Wishlist" value={wishlist} note="Saved opportunities" tone="purple" />
        <Metric
          icon="▣"
          title="Interviews"
          value={interviewed}
          note={
            interviewLoadError
              ? "Interview records could not be loaded"
              : `${interviewed} application${interviewed === 1 ? "" : "s"} in interview stage`
          }
          tone="green"
        />
        <Metric icon="♛" title="Offers" value={offers} note={`${submitted ? Math.round((offers / submitted) * 100) : 0}% offer rate`} tone="yellow" />
        <Metric icon="✉" title="Response Rate" value={`${responseRate}%`} note={`${responseCount} of ${submitted} responded`} tone="purple" />
        <Metric
          icon="◎"
          title="Avg. Match Score"
          value={averageMatch == null ? "—" : `${averageMatch}%`}
          note={averageMatch == null ? "Add a resume and job skills to calculate" : `Calculated from resume + job skills: ${matchScore.length} jobs`}
          tone="peach"
        />
      </section>

      <section className="status-strip">
        <div className="status-strip-title"><span className="eyebrow">APPLICATIONS</span><h2>Application Status Distribution</h2><p>Current status across your tracked applications.</p></div>
        <div className="status-strip-chart"><Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, animation: false, cutout: "68%", plugins: { legend: { display: false } }, events: [] }} /><div className="status-strip-center"><strong>{totalTracked}</strong><span>Total</span></div></div>
        <div className="status-strip-legend">
          {[["Wishlist", wishlist, "#7645d7"],["Applied", applied, "#1683ff"],["Interviewing", interview + screening, "#18b7a0"],["Offer", offer, "#f7b928"],["Rejected", rejected, "#f26b6b"]].map(([label, value, color]) => <div key={label}><i style={{ background: color }} /><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>

      <section className="phase4-grid top-grid">
        <Panel title="Application Trend (Last 5 Weeks)" className="trend-panel">
          <select className="panel-select trend-metric-select" value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)}>{["Applications", "Interviews", "Offers", "Rejected", "Screening", "Response Rate", "Success Rate"].map((metric) => <option key={metric}>{metric}</option>)}</select>
          <div className="chart-box trend-chart"><Line data={trendData} options={chartOptions} /></div>
        </Panel>

        <Panel title="Skill Match Overview" className="radar-panel">
          {!hasResume ? (
            <div className="dashboard-empty-state radar-empty-state">
              <strong>Upload a resume to see your skill match.</strong>
              <span>This comparison uses your saved resume skills and tracked job requirements.</span>
              <button className="view-button" onClick={() => onNavigate("resumes")}>Upload Resume →</button>
            </div>
          ) : !hasJobRequirements ? (
            <div className="dashboard-empty-state radar-empty-state">
              <strong>No job requirements available yet.</strong>
              <span>Search or track jobs to compare your resume skills against them.</span>
              <button className="view-button" onClick={() => onNavigate("opportunities-search")}>Search Jobs →</button>
            </div>
          ) : (
            <div className="chart-box radar-chart"><Radar data={radarData} options={radarOptions} /></div>
          )}
        </Panel>

        <Panel title="Top 10 In-Demand Tech Skills" className="skills-panel">
          <LocationSelect value={skillLocation} onChange={setSkillLocation} />
          <div className="skills-source-note">{skillList.length ? `Based on ${filteredJobs.length} matching applications` : "Showing global baseline until matching job-market data is connected"}</div>
          <div className="chart-box skills-chart"><Bar data={barData} options={barOptions} /></div>
        </Panel>
      </section>

      <section className="phase4-grid middle-grid">
        <Panel title="Recent Job Matches" className="matches-panel" action={<button className="action-blue-button compact-action" onClick={() => onNavigate("applications")}>View all →</button>}>
          {!hasResume ? (
            <div className="dashboard-empty-state">
              <strong>Upload a resume to see personalized job matches.</strong>
              <span>Your resume skills will be compared with the requirements of your tracked jobs.</span>
              <button className="view-button" onClick={() => onNavigate("resumes")}>Upload Resume →</button>
            </div>
          ) : recentJobs.length ? (
            <div className="matches-table-wrap">
              <table className="matches-table">
                <thead>
                  <tr><th>Job Title</th><th>Company</th><th>Location</th><th>Match Score</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {recentJobs.map((job, index) => (
                    <tr key={job.id || `${job.company}-${index}`}>
                      <td><strong>{job.role || job.title}</strong></td>
                      <td>{job.company}</td>
                      <td>{job.location || "—"}</td>
                      <td><span className={`score-pill ${scoreClass(job)}`}>{displayScore(job)}</span></td>
                      <td><button className="view-button" onClick={() => onNavigate("applications")}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <strong>No tracked jobs to match yet.</strong>
              <span>Search jobs and save or track opportunities to see personalized matches here.</span>
              <button className="view-button" onClick={() => onNavigate("opportunities-search")}>Search Jobs →</button>
            </div>
          )}
        </Panel>

        <Panel title="💡 AI Feedback & Skill Gaps" className="feedback-panel">
          {!hasResume ? (
            <div className="feedback-box suggestion">
              <span>!</span>
              <div>
                <strong>Upload a resume to unlock personalized feedback</strong>
                <p>Your matched skills, missing skills, and improvement suggestions will be calculated from your resume and tracked job requirements.</p>
                <button className="view-button" onClick={() => onNavigate("resumes")}>Upload Resume →</button>
              </div>
            </div>
          ) : !hasJobRequirements ? (
            <div className="feedback-box suggestion">
              <span>!</span>
              <div>
                <strong>Search or track jobs to generate skill gaps</strong>
                <p>Your resume is available, but there are no job requirements to compare against yet.</p>
                <button className="view-button" onClick={() => onNavigate("opportunities-search")}>Search Jobs →</button>
              </div>
            </div>
          ) : (
            <>
              <div className="feedback-box matched"><span>✓</span><div><strong>Matched Skills</strong><p>{dashboardMatchedSkills.length ? dashboardMatchedSkills.slice(0, 8).map((skill) => skill.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", ") : "No matching skills detected yet."}</p></div></div>
              <div className="feedback-box missing"><span>×</span><div><strong>Missing Skills</strong><p>{dashboardMissingSkills.length ? dashboardMissingSkills.slice(0, 8).map((skill) => skill.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(", ") : "No missing skills detected."}</p></div></div>
              <div className="feedback-box suggestion"><span>!</span><div><strong>AI Suggestion</strong><p>{dashboardSuggestion}</p></div></div>
            </>
          )}
        </Panel>
      </section>

      <section className="kanban-section panel">
        <div className="kanban-title">
          <h2>My Applications Kanban</h2>
          <button type="button" className="action-blue-button kanban-add-application-button" onClick={() => onNavigate("applications")}>＋ Add Application</button>
        </div>
        <div className="phase4-kanban">
          {kanbanGroups.map((group) => (
            <div className={`phase4-kanban-col ${group.color}`} key={group.title}>
              <div className="kanban-col-head">
                <strong>{group.title}</strong>
                <span>{group.items.length}</span>
              </div>
              <div className="kanban-items">
                {group.items.length ? group.items.map((job) => (
                  <div className="phase4-job-card" key={job.id}>
                    <div>
                      <strong>{job.role}</strong>
                      <span>{job.company}</span>
                    </div>
                    <small>
                      {job.applied_date ? new Date(job.applied_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                      {group.title === "Interviewing" && (interviewCountByJob[String(job.id)] || 0) > 0 ? ` · ${interviewCountByJob[String(job.id)]} interview${interviewCountByJob[String(job.id)] === 1 ? "" : "s"}` : ""}
                    </small>
                    <div className="kanban-card-menu-wrap">
                      <button
                        type="button"
                        className="kanban-more-button"
                        aria-label={`More actions for ${job.role || "application"}`}
                        aria-expanded={openKanbanMenu === job.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (openKanbanMenu === job.id) {
                            setOpenKanbanMenu(null);
                            setKanbanMenuPosition(null);
                            return;
                          }
                          const rect = event.currentTarget.getBoundingClientRect();
                          const width = 200;
                          const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
                          const top = rect.bottom + 8 + 150 > window.innerHeight ? Math.max(12, rect.top - 8 - 150) : rect.bottom + 8;
                          setKanbanMenuPosition({ top, left });
                          setOpenKanbanMenu(job.id);
                        }}
                      >
                        ⋯
                      </button>
                      {openKanbanMenu === job.id && (
                        <div className="kanban-card-menu kanban-card-menu-fixed" style={kanbanMenuPosition || undefined} onClick={(event) => event.stopPropagation()}>
                          <button type="button" onClick={() => { setOpenKanbanMenu(null); setKanbanMenuPosition(null); onNavigate("applications"); }}>View application</button>
                          <button type="button" onClick={() => { setOpenKanbanMenu(null); setKanbanMenuPosition(null); onNavigate("interviews"); }}>Go to Interviews</button>
                          <button type="button" className="danger-text" onClick={() => deleteDashboardApplication(job)}>Delete application</button>
                        </div>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="kanban-empty">No {group.title.toLowerCase()} applications</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Metric({ icon, title, value, note, tone }) {
  return (
    <div className={`phase4-metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

function Panel({ title, children, className = "", action }) {
  return (
    <section className={`phase4-panel ${className}`}>
      <div className="phase4-panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="phase4-panel-body">{children}</div>
    </section>
  );
}

function Applications({ onOpenProcess }) {
  const [jobs, setJobs] = useState([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [checkingAutomaticStatus, setCheckingAutomaticStatus] = useState(false);
  const [lastAutomaticStatusCheck, setLastAutomaticStatusCheck] = useState(null);
  const [automaticStatusError, setAutomaticStatusError] = useState("");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [viewMode, setViewMode] = useState("board");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingJobId, setUpdatingJobId] = useState(null);
  const jobsRef = useRef([]);
  const automaticSyncInProgress = useRef(false);

  const setLoadedJobs = (nextJobs) => {
    const previousJobs = jobsRef.current;
    const previousStatuses = new Map(previousJobs.map((job) => [String(job.id), job.status]));
    const changed = previousJobs.length > 0 && (
      previousJobs.length !== nextJobs.length ||
      nextJobs.some((job) => previousStatuses.get(String(job.id)) !== job.status)
    );
    jobsRef.current = nextJobs;
    setJobs(nextJobs);
    if (changed) window.dispatchEvent(new Event("jobtracker:data-changed"));
  };

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError("");

    try {
      const r = await api.get("/jobs", { params: { _t: Date.now() } });
      setLoadedJobs(Array.isArray(r.data) ? r.data : []);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load applications."
      );
      setLoadedJobs([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const checkAutomaticStatus = async () => {
    if (automaticSyncInProgress.current) return;
    automaticSyncInProgress.current = true;
    setCheckingAutomaticStatus(true);
    setAutomaticStatusError("");

    try {
      const syncResult = await syncMailboxApplicationStatuses();
      setGmailConnected(syncResult.connected);
      setLastAutomaticStatusCheck(new Date());
      if (syncResult.connected) await load({ quiet: true });
    } catch (syncError) {
      setAutomaticStatusError(
        syncError.response?.data?.detail || "Unable to check for automatic company updates."
      );
    } finally {
      automaticSyncInProgress.current = false;
      setCheckingAutomaticStatus(false);
    }
  };

  const connectGmail = async () => {
    setConnectingGmail(true);
    setAutomaticStatusError("");
    try {
      const response = await api.get("/recruiter-messages/connect");
      if (!response.data?.authorization_url) {
        throw new Error("Google authorization URL was not returned.");
      }
      window.location.href = response.data.authorization_url;
    } catch (connectError) {
      setAutomaticStatusError(
        connectError.response?.data?.detail || connectError.message || "Unable to connect Gmail."
      );
      setConnectingGmail(false);
    }
  };

  useEffect(() => {
    let active = true;

    const refreshApplications = async () => {
      if (!active) return;
      await load({ quiet: true });
    };

    const initialTimer = window.setTimeout(() => {
      load();
      checkAutomaticStatus();
    }, 280);
    const automaticStatusTimer = window.setInterval(() => {
      if (active && document.visibilityState === "visible") checkAutomaticStatus();
    }, 60_000);
    const checkOnFocus = () => checkAutomaticStatus();
    window.addEventListener("focus", checkOnFocus);

    const cleanupSync = createSyncRefresh(
      refreshApplications
    );

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(automaticStatusTimer);
      window.removeEventListener("focus", checkOnFocus);
      cleanupSync();
    };
  }, []);

  const normalized = (value) => String(value || "").trim().toLowerCase();
  const interviewStatuses = ["interview", "interview scheduled"];
  const offerStatuses = ["offer", "offer received", "selected"];
  const closedStatuses = ["rejected", "withdrawn"];
  const activeStatuses = ["wishlist", "applying", "applied", "application received", "in review", "under review", "screening", "shortlisted", "assessment"];
  const statusOf = (job) => normalized(job.status || "Applied");
  const matchesQuickFilter = (job) => {
    const status = statusOf(job);
    if (quickFilter === "active") return activeStatuses.includes(status);
    if (quickFilter === "interviews") return interviewStatuses.includes(status);
    if (quickFilter === "offers") return offerStatuses.includes(status);
    return true;
  };
  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesSearch = !query || [
        job.company,
        job.role,
        job.location,
        ...(job.required_skills || []),
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = !filter || statusOf(job) === normalized(filter);
      return matchesSearch && matchesStatus && matchesQuickFilter(job);
    });
  }, [jobs, search, filter, quickFilter]);

  const counts = {
    total: jobs.length,
    active: jobs.filter((job) => activeStatuses.includes(statusOf(job))).length,
    interviews: jobs.filter((job) => interviewStatuses.includes(statusOf(job))).length,
    offers: jobs.filter((job) => offerStatuses.includes(statusOf(job))).length,
  };

  const boardGroups = [
    { key: "active", title: "In progress", hint: "Application journey", statuses: activeStatuses },
    { key: "interviews", title: "Interviews", hint: "Conversations ahead", statuses: interviewStatuses },
    { key: "offers", title: "Offers", hint: "Good things happen", statuses: offerStatuses },
    { key: "closed", title: "Closed", hint: "Completed journeys", statuses: closedStatuses },
  ];

  const remove = async (id) => {
    if (!id) return;

    if (!window.confirm("Delete this application?")) {
      return;
    }

    try {
      await api.delete(`/jobs/${id}`);

      dispatchJobTrackerSync({
        type: "job-deleted",
        jobId: id,
      });

      await load();
    } catch (err) {
      window.alert(
        err.response?.data?.detail ||
          "Unable to delete this application."
      );
    }
  };

  const markAsApplied = async (job) => {
    if (!job?.id || job.status !== "Applying") return;

    setUpdatingJobId(job.id);
    setError("");
    try {
      await api.put(`/jobs/${job.id}`, { status: "Applied" });
      dispatchJobTrackerSync({
        type: "job-status-updated",
        jobId: job.id,
        status: "Applied",
      });
      await load();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to update this application to Applied."
      );
    } finally {
      setUpdatingJobId(null);
    }
  };

  const statusOptions = [
    { value: "", label: "All statuses" },
    ...statuses.map((s) => ({
      value: s,
      label: s,
    })),
  ];

  const renderApplicationCard = (job) => (
    <article className="application-board-card" key={job.id}>
      <div className="application-board-card-top">
        <span className="application-company-avatar" aria-hidden="true">
          {(job.company || "?").trim().charAt(0).toUpperCase()}
        </span>
        <span className={`status status-${String(job.status || "Applied").toLowerCase()}`}>
          {statusIcons[job.status] || "●"} {job.status || "Applied"}
        </span>
      </div>
      <h3>{job.company || "Company not specified"}</h3>
      <p className="application-board-role">{job.role || "Role not specified"}</p>
      <div className="application-board-meta">
        {job.location && <span>⌖ {job.location}</span>}
        <span>Applied {job.applied_date || "date not recorded"}</span>
      </div>
      {(job.required_skills || []).length > 0 && (
        <div className="application-board-skills">
          {job.required_skills.slice(0, 3).map((skill) => <span key={skill}>{skill}</span>)}
          {job.required_skills.length > 3 && <span>+{job.required_skills.length - 3}</span>}
        </div>
      )}
      <div className="application-board-actions">
        {job.status === "Applying" && (
          <button
            type="button"
            className="application-quick-action"
            disabled={updatingJobId === job.id}
            onClick={() => markAsApplied(job)}
          >
            {updatingJobId === job.id ? "Updating…" : "✓ Mark applied"}
          </button>
        )}
        <button type="button" className="application-open-action" onClick={() => onOpenProcess?.(job.id)}>
          View details <span aria-hidden="true">↗</span>
        </button>
        <button type="button" className="application-delete-action" onClick={() => remove(job.id)} aria-label={`Delete ${job.company || "application"}`}>
          ×
        </button>
      </div>
    </article>
  );

  return (
    <div className="applications-workspace">
      <section className="applications-welcome">
        <div className="applications-welcome-copy">
          <span className="applications-kicker"><span /> YOUR JOB SEARCH, IN ONE PLACE</span>
          <h2>Every opportunity has a next step.</h2>
          <p>Keep your momentum going. Your applications and progress, all in one view.</p>
        </div>
        <div className="applications-welcome-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="orbit-star">✦</span>
          <span className="orbit-check">✓</span>
          <span className="orbit-dot" />
        </div>
      </section>

      <section className={`applications-auto-sync ${gmailConnected ? "connected" : ""}`}>
        <span className="applications-auto-sync-icon" aria-hidden="true">{gmailConnected ? "↻" : "✉"}</span>
        <div>
          <strong>{gmailConnected ? "Company email updates are being checked automatically" : "Connect Gmail to automatically detect company updates"}</strong>
          <p>{gmailConnected
            ? "New matched recruiter emails update your application status while this workspace is open."
            : "Status updates can only be detected from connected company emails; most application portals don’t offer a shared status feed."}</p>
          {lastAutomaticStatusCheck && <small>{checkingAutomaticStatus ? "Checking now…" : `Last checked ${lastAutomaticStatusCheck.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}</small>}
          {automaticStatusError && <small className="applications-auto-sync-error">{automaticStatusError}</small>}
        </div>
        {gmailConnected
          ? <button type="button" onClick={checkAutomaticStatus} disabled={checkingAutomaticStatus}>{checkingAutomaticStatus ? "Checking…" : "Check now"}</button>
          : <button type="button" onClick={connectGmail} disabled={connectingGmail}>{connectingGmail ? "Connecting…" : "Connect Gmail"}</button>}
      </section>

      <section className="application-summary-grid" aria-label="Application summaries">
        {[
          { key: "all", label: "All applications", value: counts.total, note: "Across your search", icon: "▤", tone: "blue" },
          { key: "active", label: "In progress", value: counts.active, note: "Moving forward", icon: "↗", tone: "teal" },
          { key: "interviews", label: "Interviews", value: counts.interviews, note: "Time to shine", icon: "◷", tone: "violet" },
          { key: "offers", label: "Offers", value: counts.offers, note: "Your next chapter", icon: "✦", tone: "amber" },
        ].map((item) => (
          <button
            type="button"
            key={item.key}
            className={`application-summary-card ${item.tone} ${quickFilter === item.key ? "selected" : ""}`}
            onClick={() => setQuickFilter(item.key)}
            aria-pressed={quickFilter === item.key}
          >
            <span className="application-summary-icon">{item.icon}</span>
            <span className="application-summary-label">{item.label}</span>
            <strong>{item.value}</strong>
            <span className="application-summary-note">{item.note}<span aria-hidden="true">→</span></span>
          </button>
        ))}
      </section>

      <section className="application-workspace-toolbar" aria-label="Application controls">
        <div className="application-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search applications"
            placeholder="Search company, role, location or skill"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
        </div>
        <div className="application-toolbar-actions">
          <label className="application-status-filter">
            <span className="sr-only">Filter by application status</span>
            <MenuSelect value={filter} onChange={setFilter} options={statusOptions} placeholder="All statuses" />
          </label>
          <div className="application-view-toggle" role="group" aria-label="Application layout">
            <button type="button" className={viewMode === "board" ? "active" : ""} onClick={() => setViewMode("board")} aria-pressed={viewMode === "board"}>▦ <span>Board</span></button>
            <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"}>☷ <span>List</span></button>
          </div>
          <button type="button" className="application-refresh-button" onClick={() => load()} disabled={loading} aria-label="Refresh applications">
            <span className={loading ? "refreshing" : ""}>↻</span>
          </button>
        </div>
      </section>

      <div className="application-results-heading">
        <div>
          <h2>{quickFilter === "all" ? "Your applications" : quickFilter === "active" ? "In progress" : quickFilter === "interviews" ? "Interview stage" : "Offers"}</h2>
          <span>{loading ? "Updating your workspace…" : `${visibleJobs.length} of ${jobs.length} ${jobs.length === 1 ? "opportunity" : "opportunities"}`}</span>
        </div>
        {(search || filter || quickFilter !== "all") && (
          <button type="button" className="application-clear-filters" onClick={() => { setSearch(""); setFilter(""); setQuickFilter("all"); }}>
            Clear filters <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <section className="application-loading-state"><span className="spinner" />Loading your applications…</section>
      ) : visibleJobs.length ? viewMode === "board" ? (
        <section className="application-board" aria-label="Applications grouped by stage">
          {boardGroups.map((group) => {
            const groupJobs = visibleJobs.filter((job) => group.statuses.includes(statusOf(job)));
            return (
              <div className={`application-board-column ${group.key}`} key={group.key}>
                <div className="application-board-column-head">
                  <div><span className="application-column-indicator" /><h3>{group.title}</h3><span className="application-column-count">{groupJobs.length}</span></div>
                  <p>{group.hint}</p>
                </div>
                <div className="application-board-list">
                  {groupJobs.length ? groupJobs.map(renderApplicationCard) : <div className="application-board-empty">Nothing here yet</div>}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="application-list-panel">
          <div className="application-list-scroll">
            <table className="application-list-table">
              <thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Applied</th><th>Skills</th><th>Actions</th></tr></thead>
              <tbody>
                {visibleJobs.map((job) => (
                  <tr key={job.id}>
                    <td><strong>{job.company || "Company not specified"}</strong><small>{job.location || "Location not set"}</small></td>
                    <td>{job.role || "Role not specified"}</td>
                    <td><span className={`status status-${String(job.status || "Applied").toLowerCase()}`}>{statusIcons[job.status] || "●"} {job.status || "Applied"}</span></td>
                    <td>{job.applied_date || "—"}</td>
                    <td>{(job.required_skills || []).slice(0, 3).join(", ") || "—"}</td>
                    <td className="application-list-actions">
                      {job.status === "Applying" && <button type="button" className="small mark-applied-button" disabled={updatingJobId === job.id} onClick={() => markAsApplied(job)}>{updatingJobId === job.id ? "Updating…" : "Mark applied"}</button>}
                      <button type="button" className="small" onClick={() => onOpenProcess?.(job.id)}>View</button>
                      <button type="button" className="small danger" onClick={() => remove(job.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="application-empty-state">
          <div className="application-empty-icon">⌕</div>
          <h3>{jobs.length ? "No opportunities match these filters" : "Your next opportunity starts here"}</h3>
          <p>{jobs.length ? "Try a different search or clear your filters." : "Track roles you’re excited about and keep every next step in view."}</p>
          {jobs.length > 0 && <button type="button" className="application-empty-reset" onClick={() => { setSearch(""); setFilter(""); setQuickFilter("all"); }}>Clear filters</button>}
        </section>
      )}
      <section className="application-sync-footer">
        <span className="application-sync-footer-icon">✦</span>
        <div><strong>Stay in the loop</strong><p>Connect Gmail in Recruiter Messages to spot recruiter replies and application updates.</p></div>
        <span className="application-sync-footer-badge">EMAIL SYNC</span>
      </section>
    </div>
  );
}

function JobForm({ close, saved }) {
  const [f, setF] = useState({
    company: "",
    role: "",
    location: "",
    job_url: "",
    source: "JobTracker",
    status: "Applied",
    applied_date: new Date()
      .toISOString()
      .slice(0, 10),
    salary: "",
    notes: "",
    required_skills: [],
    resume_version_id: null,
  });

  const [skills, setSkills] = useState("");

  const save = async (e) => {
    e.preventDefault();

    const data = {
      ...f,
      // A newly submitted application always starts at Applied.
      // Later status changes are expected to come from the company.
      status: "Applied",
      required_skills: skills
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };

    try {
      const response = await api.post("/jobs", data);
      const savedJob = response?.data || {};

      dispatchJobTrackerSync({
        type: "job-created",
        jobId: savedJob?.id || null,
        status: savedJob?.status || "Applied",
      });

      window.dispatchEvent(
        new Event("jobtracker:data-changed")
      );

      close();
      await saved();
    } catch (err) {
      window.alert(
        err.response?.data?.detail ||
          err.message ||
          "Unable to submit application."
      );
    }
  };

  return (
    <div className="modal">
      <form
        className="modal-card"
        onSubmit={save}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">APPLICATION</div>
            <h2>Submit application</h2>
          </div>

          <button
            type="button"
            className="close"
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="application-company-control-note">
          <strong>Company-controlled status</strong>
          <span>
            This application will start as <b>Applied</b>.
            The company can later update screening, interview,
            offer or rejection status through the integration.
          </span>
        </div>

        <div className="form-grid">
          {["company", "role", "location", "job_url", "source", "salary"].map(
            (k) => (
              <input
                key={k}
                placeholder={k.replace("_", " ")}
                value={f[k] || ""}
                onChange={(e) =>
                  setF({
                    ...f,
                    [k]: e.target.value,
                  })
                }
                required={
                  k === "company" ||
                  k === "role"
                }
              />
            )
          )}

          <div className="application-readonly-status">
            <span>Status</span>
            <strong>
              {statusIcons.Applied || "●"} Applied
            </strong>
            <small>
              Locked after submission. Company updates this status.
            </small>
          </div>

          <input
            type="date"
            value={f.applied_date}
            onChange={(e) =>
              setF({
                ...f,
                applied_date: e.target.value,
              })
            }
          />

          <input
            className="wide"
            placeholder="Required skills: Python, SQL, React, FastAPI"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />

          <textarea
            className="wide"
            placeholder="Notes"
            value={f.notes || ""}
            onChange={(e) =>
              setF({
                ...f,
                notes: e.target.value,
              })
            }
          />
        </div>

        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={close}
          >
            Cancel
          </button>
          <button type="submit">
            Submit application
          </button>
        </div>
      </form>
    </div>
  );
}

function MarketInsightsPage() {
  const [query, setQuery] = useState("Python Developer");
  const [location, setLocation] = useState("Bengaluru");
  const [country, setCountry] = useState("India");
  const [resumes, setResumes] = useState([]);
  const [resumeId, setResumeId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/resumes").then((r) => {
      const list = Array.isArray(r.data) ? r.data : [];
      setResumes(list);
      const latest = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
      if (latest?.id) setResumeId(String(latest.id));
    }).catch(() => setResumes([]));
  }, []);

  const load = async (event) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = { query: query.trim() || "Python Developer", location: location.trim(), country, page: 1, results_per_page: 50 };
      if (resumeId) params.resume_id = resumeId;
      const response = await api.get("/job-market/insights", { params, timeout: 20000 });
      setData(response.data || null);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.detail || "Unable to load market insights. Check the backend Adzuna configuration and try again.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const topSkills = Array.isArray(data?.top_skills) ? data.top_skills.slice(0, 10) : [];
  const topCompanies = Array.isArray(data?.top_companies) ? data.top_companies.slice(0, 8) : [];
  const contractTypes = Array.isArray(data?.contract_types) ? data.contract_types : [];
  const maxSkill = Math.max(1, ...topSkills.map((x) => Number(x.count || x.percentage || 0)));
  const maxCompany = Math.max(1, ...topCompanies.map((x) => Number(x.count || x.value || 0)));
  const maxContract = Math.max(1, ...contractTypes.map((x) => Number(x.count || x.value || 0)));

  return <div className="job-market-page insights-page">
    <section className="job-market-hero"><div><div className="eyebrow">MARKET INTELLIGENCE</div><h2>Live job-market insights</h2><p>See demand, companies, contract types and resume-market fit for the selected role and location.</p></div><div className="job-market-source"><span className="job-market-source-dot" /> Live · Adzuna</div></section>

    <form className="job-market-search-card" onSubmit={load}>
      <div className="job-market-search-grid">
        <label><span>Job role</span><MenuSelect value={query} onChange={(v) => setQuery(String(v))} options={JOB_ROLE_OPTIONS.map((v) => ({ value: v, label: v }))} placeholder="Select role" /></label>
        <label><span>Location</span><MenuSelect value={location} onChange={(v) => setLocation(String(v))} options={LOCATION_OPTIONS.slice(0, 37).map((v) => ({ value: v, label: v }))} placeholder="Select location" /></label>
        <label><span>Country</span><MenuSelect value={country} onChange={(v) => setCountry(String(v))} options={["India", "United Kingdom", "United States", "Canada", "Australia", "Germany", "France", "Ireland", "Netherlands", "Singapore", "New Zealand", "South Africa", "Brazil", "Mexico"].map((v) => ({ value: v, label: v }))} /></label>
        <label><span>Resume version</span><MenuSelect value={resumeId} onChange={(v) => setResumeId(String(v))} options={resumes.map((r) => ({ value: String(r.id), label: r.name || `Resume #${r.id}` }))} placeholder={resumes.length ? "Select resume" : "Latest / none"} /></label>
        <button className="job-market-search-button" type="submit" disabled={loading}>{loading ? "Analyzing…" : "Load insights"}</button>
      </div>
    </form>

    {error && <div className="job-market-alert error">{error}</div>}
    {loading && <section className="job-market-loading"><span className="spinner" /><span>Loading live market insights…</span></section>}

    {!loading && data && <>
      <section className="job-market-summary"><div><strong>{Number(data.total_jobs_available || 0).toLocaleString("en-IN")}</strong><span>matching listings</span></div><div><strong>{data.jobs_analyzed || 0}</strong><span>jobs analyzed</span></div><div><strong>{data.resume_match?.match_percentage ?? 0}%</strong><span>resume market match</span></div><div className="job-market-summary-note">Market match compares the selected resume skills with skills detected across the analyzed listings.</div></section>

      <section className="insights-chart-grid">
        <div className="panel insights-chart-card"><div className="eyebrow">SKILL DEMAND</div><h3>Top 10 requested skills</h3><p className="muted-text">Number of analyzed listings mentioning each skill.</p>{topSkills.length ? <div className="insight-bars">{topSkills.map((item, index) => { const value = Number(item.count || 0); return <div className="insight-bar-row" key={item.skill}><div className="insight-bar-label"><b>{index + 1}</b><span>{item.skill}</span><strong>{item.percentage ?? value}%</strong></div><div className="insight-bar-track"><i style={{ width: `${Math.max(4, Math.min(100, value / maxSkill * 100))}%` }} /></div></div>; })}</div> : <div className="empty">No skill demand data returned.</div>}</div>

        <div className="panel insights-chart-card"><div className="eyebrow">COMPANY DEMAND</div><h3>Companies appearing most often</h3><p className="muted-text">Company frequency in the analyzed listings.</p>{topCompanies.length ? <div className="insight-bars">{topCompanies.map((item, index) => { const value = Number(item.count || item.value || 0); return <div className="insight-bar-row" key={item.company || item.name || index}><div className="insight-bar-label"><b>{index + 1}</b><span>{item.company || item.name}</span><strong>{value}</strong></div><div className="insight-bar-track company"><i style={{ width: `${Math.max(4, Math.min(100, value / maxCompany * 100))}%` }} /></div></div>; })}</div> : <div className="empty">No company data returned.</div>}</div>

        <div className="panel insights-chart-card"><div className="eyebrow">CONTRACT TYPES</div><h3>Employment type distribution</h3><p className="muted-text">Contract information returned by the provider.</p>{contractTypes.length ? <div className="insight-bars compact">{contractTypes.map((item, index) => { const value = Number(item.count || item.value || 0); return <div className="insight-bar-row" key={item.type || item.name || index}><div className="insight-bar-label"><span>{item.type || item.name}</span><strong>{value}</strong></div><div className="insight-bar-track contract"><i style={{ width: `${Math.max(4, Math.min(100, value / maxContract * 100))}%` }} /></div></div>; })}</div> : <div className="empty">Contract type data is not available for these listings.</div>}</div>

        <div className="panel insights-chart-card salary-chart-card"><div className="eyebrow">SALARY SNAPSHOT</div><h3>Average salary range</h3><div className="salary-insight-grid"><div><span>Average minimum</span><strong>{data.salary?.average_min ? `₹${Number(data.salary.average_min).toLocaleString("en-IN")}` : "Not available"}</strong></div><div><span>Average maximum</span><strong>{data.salary?.average_max ? `₹${Number(data.salary.average_max).toLocaleString("en-IN")}` : "Not available"}</strong></div></div><p className="muted-text">Only listings that reported salary values are included.</p></div>
      </section>

      {data.resume_match && <section className="panel job-market-resume-fit standalone"><div className="job-market-resume-fit-head"><div><div className="eyebrow">RESUME GAP ANALYSIS</div><h3>{data.resume_match.resume_name || "Selected resume"}</h3><p>Skills matched against the current live market.</p></div><div className="job-market-resume-score"><strong>{data.resume_match.match_percentage}%</strong><span>market skill match</span></div></div><div className="job-market-resume-fit-grid"><div><span className="job-market-fit-label matched">✓ Matched skills</span><div className="job-market-skill-pills">{(data.resume_match.matched_skills || []).map((s) => <span className="matched" key={s}>{s}</span>)}</div></div><div><span className="job-market-fit-label missing">× Missing skills</span><div className="job-market-skill-pills">{(data.resume_match.missing_skills || []).slice(0, 15).map((s) => <span className="missing" key={s}>{s}</span>)}</div></div></div></section>}
    </>}

    {!loading && !data && !error && <section className="panel insights-empty-state"><div className="eyebrow">INSIGHTS</div><h2>Load live market data</h2><p>Choose a role and location, then click Load insights.</p><button className="primary" onClick={load}>Load insights</button></section>}
  </div>;
}

function JobMarket({ user }) {
  const indianLocations = new Set(LOCATION_OPTIONS.slice(0, 37));
  const internationalCountries = LOCATION_OPTIONS.slice(37);

  const countryOptions = internationalCountries.map((country) => ({
    value: country,
    label: country,
  }));
  const [query, setQuery] = useState("Python Developer");
  const [location, setLocation] = useState("Bengaluru");
  const [country, setCountry] = useState("India");
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const resultsPerPage = 20;
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resumes, setResumes] = useState([]);
  const [searchResumeId, setSearchResumeId] = useState("");
  const [addingId, setAddingId] = useState(null);
  const [matchJob, setMatchJob] = useState(null);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [analyzedResumeId, setAnalyzedResumeId] = useState("");
  const [activeResumeId, setActiveResumeId] = useState("");
  const [analyzingScore, setAnalyzingScore] = useState(false);
  const [insights, setInsights] = useState(null);
  const [marketFilters, setMarketFilters] = useState({ jobType: "", workMode: "", experience: "", minSalary: "", maxSalary: "", skill: "", posted: "" });
  const [savedJobs, setSavedJobs] = useState([]);
  const [trackedApplications, setTrackedApplications] = useState([]);
  const [trackingStatus, setTrackingStatus] = useState({});

  useEffect(() => {
    api.get("/resumes")
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.items) ? r.data.items : [];
        setResumes(data);
      })
      .catch(() => setResumes([]));
  }, []);

  const savedJobsStorageKey = `jobtracker_saved_jobs_${String(user?.email || "guest").toLowerCase()}`;

  useEffect(() => {
    try {
      setSavedJobs(JSON.parse(localStorage.getItem(savedJobsStorageKey) || "[]"));
    } catch {
      setSavedJobs([]);
    }
  }, [savedJobsStorageKey]);

  const loadTrackedApplications = async () => {
    try {
      const response = await api.get("/jobs");
      setTrackedApplications(Array.isArray(response.data) ? response.data : []);
    } catch {
      setTrackedApplications([]);
    }
  };

  useEffect(() => {
    loadTrackedApplications();

    const handleDataChanged = () => loadTrackedApplications();
    window.addEventListener("jobtracker:data-changed", handleDataChanged);
    return () => window.removeEventListener("jobtracker:data-changed", handleDataChanged);
  }, []);

  const toggleSavedJob = (job) => {
    const exists = savedJobs.some((item) => String(item.id) === String(job.id));
    const next = exists ? savedJobs.filter((item) => String(item.id) !== String(job.id)) : [...savedJobs, job];
    localStorage.setItem(savedJobsStorageKey, JSON.stringify(next));
    setSavedJobs(next);
  };

  const latestResume = useMemo(() => {
    if (!resumes.length) return null;
    return [...resumes].sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return bTime - aTime;
    })[0];
  }, [resumes]);

  useEffect(() => {
    if (!searchResumeId && latestResume?.id) {
      setSearchResumeId(String(latestResume.id));
      setActiveResumeId(String(latestResume.id));
    }
  }, [latestResume, searchResumeId]);

  // Keep frontend job-level matching consistent with the backend:
  // use the latest resume version, not a union of all historical resumes.
  const activeResume = useMemo(() => {
    return (
      resumes.find((resume) => String(resume.id) === String(activeResumeId)) ||
      latestResume
    );
  }, [resumes, activeResumeId, latestResume]);

  const resumeSkills = useMemo(() => {
    const values = Array.isArray(activeResume?.skills) ? activeResume.skills : [];
    return new Set(
      values
        .map((skill) => String(skill).trim().toLowerCase())
        .filter(Boolean)
    );
  }, [activeResume]);

  const calculateMatch = (job) => {
    const skills = Array.isArray(job.skills) ? job.skills : [];
    if (!skills.length || !resumeSkills.size) return null;

    const normalizedRequired = [
      ...new Set(
        skills
          .map((skill) => String(skill).trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    const matched = normalizedRequired.filter((skill) => resumeSkills.has(skill));

    return normalizedRequired.length
      ? Math.round((matched.length / normalizedRequired.length) * 100)
      : null;
  };

  const marketInsights = useMemo(() => {
    const skillCounts = new Map();
    const companyCounts = new Map();
    const locationCounts = new Map();
    const salaries = [];
    const matches = [];

    jobs.forEach((job) => {
      const company = String(job.company || "Unknown Company").trim();
      const jobLocation = String(job.location || "Location not specified").trim();

      companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
      locationCounts.set(jobLocation, (locationCounts.get(jobLocation) || 0) + 1);

      (Array.isArray(job.skills) ? job.skills : []).forEach((skill) => {
        const clean = String(skill).trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        const existing = skillCounts.get(key) || { name: clean, count: 0 };
        existing.count += 1;
        skillCounts.set(key, existing);
      });

      const min = Number(job.salary_min);
      const max = Number(job.salary_max);
      if (Number.isFinite(min) && min > 0) salaries.push(min);
      if (Number.isFinite(max) && max > 0) salaries.push(max);

      const match = calculateMatch(job);
      if (match != null) matches.push(match);
    });

    const sortCounts = (map) =>
      Array.from(map.values())
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 6);

    const skillRanking = sortCounts(skillCounts);
    const companyRanking = Array.from(companyCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5);

    const locationRanking = Array.from(locationCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5);

    const averageSalary = salaries.length
      ? Math.round(salaries.reduce((sum, value) => sum + value, 0) / salaries.length)
      : null;

    const averageMatch = matches.length
      ? Math.round(matches.reduce((sum, value) => sum + value, 0) / matches.length)
      : null;

    return {
      skillRanking,
      companyRanking,
      locationRanking,
      averageSalary,
      averageMatch,
      salaryCount: salaries.length,
      matchCount: matches.length,
    };
  }, [jobs, resumeSkills]);

  const searchJobs = async (event, requestedPage = 1) => {
  event?.preventDefault();

  setLoading(true);
  setError("");
  setMessage("");

  // Use the resume selected in the search form for listing match scores.
  const resumeForSearch = resumes.find(
    (resume) => String(resume.id) === String(searchResumeId)
  ) || latestResume;

  if (resumeForSearch?.id) {
    setActiveResumeId(String(resumeForSearch.id));
    setAnalyzedResumeId(String(resumeForSearch.id));
  }

  try {
    const params = {
      query: query.trim(),
      location: location === "All Locations" ? "" : location.trim(),
      country,
      page: requestedPage,
      results_per_page: resultsPerPage,
    };

    const [response, insightsResponse] = await Promise.all([
      api.get("/job-market/search", { params }),
      api.get("/job-market/insights", {
        params: {
          query: query.trim(),
          location: location === "All Locations" ? "" : location.trim(),
          country,
          page: 1,
          results_per_page: 50,
        },
      }),
    ]);

    const data = response.data || {};
    const insightsData = insightsResponse.data || {};

    setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    setTotal(Number(data.total || 0));
    setInsights(insightsData);
    setPage(requestedPage);
    setSearched(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  } catch (err) {
    setJobs([]);
    setTotal(0);
    setSearched(true);
    setError(
      err.response?.data?.detail ||
      "Unable to load jobs. Check the Job Market API."
    );
  } finally {
    setLoading(false);
  }
};

  const handleLocationChange = (nextLocation) => {
    setLocation(nextLocation);

    if (indianLocations.has(nextLocation) || nextLocation === "All Locations") {
      setCountry("India");
    } else if (internationalCountries.includes(nextLocation)) {
      setCountry(nextLocation);
    }
  };

  const formatSalary = (job) => {
    if (job.salary_min == null && job.salary_max == null) return "Salary not specified";
    const min = job.salary_min != null ? `₹${Number(job.salary_min).toLocaleString("en-IN")}` : "";
    const max = job.salary_max != null ? `₹${Number(job.salary_max).toLocaleString("en-IN")}` : "";
    if (min && max) return `${min} – ${max}`;
    return min || max;
  };

  const formatDate = (value) => {
    if (!value) return "Recently posted";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently posted" : date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const normalizeJobUrl = (url) => {
    if (!url) return "";
    return String(url).trim().replace(/\/$/, "").toLowerCase();
  };

  const getTrackedApplication = (job) => {
    const targetUrl = normalizeJobUrl(job?.url);
    if (!targetUrl) return null;
    return trackedApplications.find(
      (application) => normalizeJobUrl(application?.job_url) === targetUrl
    ) || null;
  };

  const trackApplication = async (job, status = "Applying", resumeId = null) => {
    const resumeToAttach = resumeId || searchResumeId || activeResume?.id || null;
    const existing = getTrackedApplication(job);
    const isApplyFlow = status === "Applying";

    setAddingId(job.id);
    setTrackingStatus((current) => ({ ...current, [job.id]: status }));
    setMessage("");
    setError("");

    // Open the company page immediately from the user's click. Doing this before
    // the awaited API call prevents browser popup blockers from stopping the tab.
    if (isApplyFlow && job.url) {
      window.open(job.url, "_blank", "noopener,noreferrer");
    }

    const payload = {
      company: job.company || "Unknown Company",
      role: job.title || "Untitled Job",
      location: job.location || null,
      job_url: job.url || null,
      source: "Adzuna",
      status,
      applied_date: new Date().toISOString().slice(0, 10),
      salary: formatSalary(job),
      notes: isApplyFlow
        ? `Application started from Job Market. Apply on the company website. Posted: ${formatDate(job.created)}.`
        : `Tracked from Job Market. Posted: ${formatDate(job.created)}.`,
      required_skills: Array.isArray(job.skills) ? job.skills : [],
      resume_version_id: resumeToAttach ? Number(resumeToAttach) : null,
    };

    try {
      if (existing?.id) {
        // A saved/Wishlist job becomes Applying when the user starts the
        // external application. We never require a second manual action.
        await api.put(`/jobs/${existing.id}`, { status: isApplyFlow ? "Applying" : status });
      } else {
        await api.post("/jobs", payload);
      }

      await loadTrackedApplications();
      window.dispatchEvent(new Event("jobtracker:data-changed"));

      if (isApplyFlow) {
        setMessage(`✓ "${job.title}" was added to Applications as Applying. Gmail will update it to Applied when a confirmation email is detected.`);
      } else {
        setMessage(`Updated "${job.title}" to ${status}.`);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to create or update this application.");
    } finally {
      setAddingId(null);
      setTrackingStatus((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
    }
  };

  // Kept for compatibility with older parts of the component. New Search Jobs
  // flow always starts at Applying; Gmail confirmation moves it to Applied.
  const addToApplications = async (job, resumeId = null) => {
    await trackApplication(job, "Applying", resumeId);
  };

  const openMatchModal = (job) => {
    setMatchJob(job);
    const resumeId = activeResume?.id ? String(activeResume.id) : "";
    setSelectedResumeId(resumeId);
    setAnalyzedResumeId(resumeId);
    setActiveResumeId(resumeId);
    setError("");
    setMessage("");
  };

  const closeMatchModal = () => {
    setMatchJob(null);
    setSelectedResumeId(activeResume?.id ? String(activeResume.id) : "");
    setAnalyzedResumeId(activeResume?.id ? String(activeResume.id) : "");
  };

  const analyzeSelectedResume = () => {
    if (!selectedResumeId || !matchJob) return;

    setAnalyzingScore(true);

    // Keep the score tied to the resume the user explicitly chose.
    // A small timeout lets the UI show the analysis action before recalculating.
    window.setTimeout(() => {
      setAnalyzedResumeId(String(selectedResumeId));
      setActiveResumeId(String(selectedResumeId));
      setAnalyzingScore(false);
    }, 250);
  };

  const getJobMatchDetails = (job, resumeId = "") => {
    const requiredSkills = Array.isArray(job?.skills) ? job.skills : [];

    const selectedResume = resumes.find(
      (resume) => String(resume.id) === String(resumeId)
    );

    const sourceResume = selectedResume || latestResume;

    const resumeSkillSet = new Set(
      (Array.isArray(sourceResume?.skills) ? sourceResume.skills : [])
        .map((skill) => String(skill).trim().toLowerCase())
        .filter(Boolean)
    );

    const matchedSkills = requiredSkills.filter((skill) =>
      resumeSkillSet.has(String(skill).trim().toLowerCase())
    );
    const missingSkills = requiredSkills.filter((skill) =>
      !resumeSkillSet.has(String(skill).trim().toLowerCase())
    );

    const uniqueRequired = [...new Map(
      requiredSkills.map((skill) => [
        String(skill).trim().toLowerCase(),
        String(skill).trim(),
      ])
    ).values()];

    const uniqueMatched = [...new Map(
      matchedSkills.map((skill) => [
        String(skill).trim().toLowerCase(),
        String(skill).trim(),
      ])
    ).values()];

    const uniqueMissing = [...new Map(
      missingSkills.map((skill) => [
        String(skill).trim().toLowerCase(),
        String(skill).trim(),
      ])
    ).values()];

    const score = uniqueRequired.length
      ? Math.round((uniqueMatched.length / uniqueRequired.length) * 100)
      : null;

    return {
      requiredSkills: uniqueRequired,
      matchedSkills: uniqueMatched,
      missingSkills: uniqueMissing,
      score,
    };
  };

  const recommendedJobs = useMemo(() => {
    if (!jobs.length) return [];

    const targetTerms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2);

    const targetLocation = String(location || "").trim().toLowerCase();

    return jobs
      .map((job) => {
        const details = getJobMatchDetails(
          job,
          activeResume?.id ? String(activeResume.id) : ""
        );
        const title = String(job.title || "").toLowerCase();
        const jobLocation = String(job.location || "").toLowerCase();

        const titleHits = targetTerms.filter((term) => title.includes(term)).length;
        const roleScore = targetTerms.length
          ? Math.min(100, Math.round((titleHits / targetTerms.length) * 100))
          : 50;

        const locationScore = targetLocation && targetLocation !== "all locations"
          ? jobLocation.includes(targetLocation) ? 100 : 0
          : 50;

        const skillScore = details.score == null ? 0 : details.score;

        // Transparent recommendation score:
        // skills 70% + role 20% + location 10%.
        const recommendationScore = Math.round(
          skillScore * 0.7 +
          roleScore * 0.2 +
          locationScore * 0.1
        );

        return {
          ...job,
          recommendationScore,
          recommendationDetails: details,
          roleScore,
          locationScore,
        };
      })
      .sort((a, b) =>
        b.recommendationScore - a.recommendationScore ||
        (b.recommendationDetails.score ?? -1) - (a.recommendationDetails.score ?? -1)
      )
      .slice(0, 5);
  }, [jobs, query, location, activeResume, resumes]);

  const filteredMarketJobs = useMemo(() => {
    const f = marketFilters;
    return jobs.filter((job) => {
      const text = `${job.title || ""} ${job.description || ""} ${(job.skills || []).join(" ")}`.toLowerCase();
      const type = `${job.contract_type || ""} ${job.contract_time || ""}`.toLowerCase();
      const locationText = String(job.location || "").toLowerCase();
      const min = Number(job.salary_min || 0);
      const max = Number(job.salary_max || 0);
      const created = job.created ? new Date(job.created).getTime() : 0;
      const ageDays = created ? Math.floor((Date.now() - created) / 86400000) : null;
      const workMode = f.workMode;
      const experience = f.experience;
      const skillOk = !f.skill || text.includes(f.skill.toLowerCase());
      const typeOk = !f.jobType || type.includes(f.jobType.toLowerCase());
      const modeOk = !workMode || text.includes(workMode.toLowerCase());
      const expOk = !experience || text.includes(experience.toLowerCase());
      const minOk = !f.minSalary || max >= Number(f.minSalary);
      const maxOk = !f.maxSalary || (min === 0 || min <= Number(f.maxSalary));
      const postedOk = !f.posted || ageDays == null || (f.posted === "1" ? ageDays <= 1 : f.posted === "3" ? ageDays <= 3 : f.posted === "7" ? ageDays <= 7 : ageDays <= 30);
      return skillOk && typeOk && modeOk && expOk && minOk && maxOk && postedOk && (f.location || true) && (locationText || true);
    });
  }, [jobs, marketFilters]);

  const clearResults = () => {
  setJobs([]);
  setTotal(0);
  setPage(1);
  setInsights(null);
  setSearched(false);
  setError("");
  setMessage("");
};

  return (
    <div className="job-market-page">
      <section className="job-market-hero">
        <div>
          <div className="eyebrow">LIVE JOB MARKET</div>
          <h2>Find jobs that match your skills.</h2>
          <p>Search live listings from Adzuna and save opportunities directly to your application tracker.</p>
        </div>
        <div className="job-market-source">
          <span className="job-market-source-dot" />
          Live · Adzuna
        </div>
      </section>

      <form className="job-market-search-card" onSubmit={searchJobs}>
        <div className="job-market-search-grid">
          <label>
  <span>Job role</span>
  <MenuSelect
    value={query}
    onChange={(value) => {
      setQuery(value);
      setPage(1);
    }}
    options={JOB_ROLE_OPTIONS.map((role) => ({
      value: role,
      label: role,
    }))}
    placeholder="Select job role"
  />
</label>

          <label>
            <span>Location</span>
            <LocationSelect value={location} onChange={handleLocationChange} />
          </label>

          <label>
            <span>Country</span>
            <MenuSelect
              value={country}
              onChange={(value) => {
                setCountry(value);
                if (!internationalCountries.includes(location) && value !== "India") {
                  setLocation("");
                }
              }}
              options={[{ value: "India", label: "India" }, ...countryOptions]}
              placeholder="Select country"
            />
          </label>

          <label className="job-market-resume-field">
            <span>Resume version</span>
            <MenuSelect
              value={searchResumeId}
              onChange={(value) => {
                setSearchResumeId(String(value));
                setPage(1);
              }}
              options={resumes.map((resume) => ({
                value: String(resume.id),
                label: resume.name || `Resume #${resume.id}`,
              }))}
              placeholder={resumes.length ? "Select resume" : "No resumes"}
            />
          </label>

          <button
            className="job-market-search-button"
            type="submit"
            disabled={loading || !resumes.length}
            title={!resumes.length ? "Upload a resume before searching with resume matching" : "Search jobs using the selected resume"}
          >
            {loading ? "Searching…" : "Search jobs"}
          </button>
        </div>

        <div className="job-market-search-footer">
          <span>
            Search by role, location, country and the selected resume. Match scores use that resume's stored skills.
          </span>
          {searched && (
            <button type="button" className="job-market-clear" onClick={clearResults}>
              Clear results
            </button>
          )}
        </div>
      </form>

      {error && <div className="job-market-alert error">{error}</div>}
      {message && <div className="job-market-alert success">{message}</div>}

      {searched && !loading && !error && (
        <div className="job-market-summary">
          <div>
            <strong>{jobs.length}</strong>
            <span>jobs loaded</span>
          </div>
          <div>
            <strong>{total.toLocaleString("en-IN")}</strong>
            <span>matching listings</span>
          </div>
          <div>
            <strong>{resumes.length}</strong>
            <span>resume versions</span>
          </div>
          <div className="job-market-summary-note">
            Matching against <strong>{activeResume?.name || "selected resume"}</strong>. Change the resume above and search again to recalculate listing scores.
          </div>
        </div>
      )}

      {searched && !loading && !error && jobs.length > 0 && (
        <section className="job-market-insights">
          <div className="job-market-insights-head">
            <div>
              <div className="eyebrow">MARKET INTELLIGENCE</div>
              <h2>What these loaded listings tell you</h2>
              <p>Market demand cards use the listings currently loaded on this page; resume fit uses the backend analysis of 50 listings.</p>
            </div>
            <span className="job-market-insights-live">LIVE DATA</span>
          </div>

          <div className="job-market-insight-grid">
            <div className="job-market-insight-card">
              <div className="job-market-insight-title">Top skills in loaded listings</div>
              {marketInsights.skillRanking.length ? (
                <div className="job-market-ranking">
                  {marketInsights.skillRanking.map((item, index) => {
                    const max = marketInsights.skillRanking[0]?.count || 1;
                    return (
                      <div className="job-market-ranking-row" key={item.name}>
                        <span className="job-market-ranking-name">
                          <b>{index + 1}</b>{item.name}
                        </span>
                        <span className="job-market-ranking-bar">
                          <i style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
                        </span>
                        <strong>{item.count}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="job-market-insight-empty">No skills were extracted from these listings.</p>
              )}
            </div>

            <div className="job-market-insight-card">
              <div className="job-market-insight-title">Top hiring companies in loaded listings</div>
              {marketInsights.companyRanking.length ? (
                <div className="job-market-ranking compact">
                  {marketInsights.companyRanking.map((item, index) => {
                    const max = marketInsights.companyRanking[0]?.count || 1;
                    return (
                      <div className="job-market-ranking-row" key={item.name}>
                        <span className="job-market-ranking-name">
                          <b>{index + 1}</b>{item.name}
                        </span>
                        <span className="job-market-ranking-bar">
                          <i style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
                        </span>
                        <strong>{item.count}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="job-market-insight-empty">Company information is unavailable.</p>
              )}
            </div>

            <div className="job-market-insight-card job-market-metrics-card">
              <div className="job-market-insight-title">Salary & match snapshot</div>
              <div className="job-market-metric">
                <span>Average salary data</span>
                <strong>
                  {marketInsights.averageSalary
                    ? `₹${marketInsights.averageSalary.toLocaleString("en-IN")}`
                    : "Not available"}
                </strong>
                <small>
                  {marketInsights.salaryCount
                    ? `${marketInsights.salaryCount} salary values found in the loaded listings`
                    : "Listings did not provide salary values"}
                </small>
              </div>
              <div className="job-market-metric">
                <span>Resume market match</span>
                <strong>
                  {insights?.resume_match?.match_percentage != null
                    ? `${insights.resume_match.match_percentage}%`
                    : "—"}
                </strong>
                <small>
                  {insights?.jobs_analyzed
                    ? `Based on ${insights.jobs_analyzed} analyzed listings`
                    : "Search the market to calculate your resume match"}
                </small>
              </div>
            </div>
          </div>

          <div className="job-market-insight-footer">
            <div>
              <strong>Top locations in loaded listings</strong>
              <div className="job-market-location-pills">
                {marketInsights.locationRanking.map((item) => (
                  <span key={item.name}>{item.name} · {item.count}</span>
                ))}
              </div>
            </div>
            <small>
              These are descriptive statistics from the current result set, not a prediction of the overall job market.
            </small>
          </div>

          {insights?.resume_match && (
            <section className="job-market-resume-fit">
              <div className="job-market-resume-fit-head">
                <div>
                  <div className="eyebrow">YOUR RESUME</div>
                  <h3>{insights.resume_match.resume_name || "Latest resume version"}</h3>
                  <p>Compared with skills found across the first 50 matching listings.</p>
                </div>
                <div className="job-market-resume-score">
                  <strong>{insights.resume_match.match_percentage}%</strong>
                  <span>market skill match</span>
                </div>
              </div>

              <div className="job-market-resume-fit-grid">
                <div>
                  <span className="job-market-fit-label matched">✓ Matched skills</span>
                  <div className="job-market-skill-pills">
                    {(insights.resume_match.matched_skills || []).map((skill) => (
                      <span className="matched" key={skill}>{skill}</span>
                    ))}
                    {!insights.resume_match.matched_skills?.length && <small>No matching skills detected.</small>}
                  </div>
                </div>

                <div>
                  <span className="job-market-fit-label missing">× Missing skills</span>
                  <div className="job-market-skill-pills">
                    {(insights.resume_match.missing_skills || []).slice(0, 10).map((skill) => (
                      <span className="missing" key={skill}>{skill}</span>
                    ))}
                    {!insights.resume_match.missing_skills?.length && <small>No missing market skills detected.</small>}
                  </div>
                </div>
              </div>

              {!!insights.resume_match.recommendations?.length && (
                <div className="job-market-recommendations">
                  <div className="job-market-fit-label recommendation">Recommended next skills</div>
                  <div className="job-market-recommendation-list">
                    {insights.resume_match.recommendations.slice(0, 5).map((item, index) => (
                      <div className="job-market-recommendation" key={item.skill}>
                        <b>{index + 1}</b>
                        <div>
                          <strong>{item.skill}</strong>
                          <small>{item.market_percentage}% of analyzed listings mention this skill</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </section>
      )}

      {searched && !loading && !error && recommendedJobs.length > 0 && (
        <section className="job-recommendations">
          <div className="job-recommendations-head">
            <div>
              <div className="eyebrow">PERSONALIZED RECOMMENDATIONS</div>
              <h2>Jobs that fit your current resume</h2>
              <p>
                Ranked from the current search using skills, role alignment and location.
                Skill match carries the highest weight.
                {activeResume?.name ? ` Scoring against ${activeResume.name}.` : ""}
              </p>
            </div>
            <span className="job-recommendations-badge">TOP {recommendedJobs.length}</span>
          </div>

          <div className="job-recommendations-list">
            {recommendedJobs.map((job, index) => {
              const details = job.recommendationDetails;
              const score = job.recommendationScore;
              const scoreClass = score >= 80 ? "high" : score >= 60 ? "medium" : "low";

              return (
                <article className="job-recommendation-card" key={`${job.id}-${job.source}-recommendation`}>
                  <div className="job-recommendation-rank">{index + 1}</div>

                  <div className="job-recommendation-main">
                    <div className="job-recommendation-title-row">
                      <div>
                        <h3>{job.title}</h3>
                        <strong>{job.company}</strong>
                      </div>
                      <span className={`job-recommendation-score ${scoreClass}`}>
                        {score}%
                        <small>recommendation</small>
                      </span>
                    </div>

                    <div className="job-recommendation-meta">
                      <span>⌖ {job.location || "Location not specified"}</span>
                      <span>Skills: {details.score == null ? "—" : `${details.score}%`}</span>
                      <span>Role: {job.roleScore}%</span>
                    </div>

                    <div className="job-recommendation-reasons">
                      <span className="positive">
                        ✓ {details.matchedSkills.length} matched skill{details.matchedSkills.length === 1 ? "" : "s"}
                      </span>
                      <span>
                        {details.missingSkills.length} missing
                      </span>
                      {job.location && job.location.toLowerCase().includes(String(location || "").toLowerCase()) && location !== "All Locations" && (
                        <span className="positive">✓ Location match</span>
                      )}
                    </div>
                  </div>

                  <div className="job-recommendation-actions">
                    {job.url && (
                      <button
                        type="button"
                        className="recommendation-action-button recommendation-view-button"
                        onClick={() => window.open(job.url, "_blank", "noopener,noreferrer")}
                      >
                        <span aria-hidden="true">↗</span> View job
                      </button>
                    )}
                    <button
                      type="button"
                      className="recommendation-action-button recommendation-match-button"
                      onClick={() => openMatchModal(job)}
                    >
                      <span aria-hidden="true">◈</span> Match Resume
                    </button>
                    {(() => {
                      const tracked = getTrackedApplication(job);
                      const status = String(tracked?.status || "").trim();
                      const busy = addingId === job.id;

                      if (status === "Applied") {
                        return (
                          <button type="button" className="recommendation-action-button recommendation-tracked-button" disabled>
                            ✓ Applied
                          </button>
                        );
                      }

                      if (status === "Applying") {
                        return (
                          <button
                            type="button"
                            className="recommendation-action-button recommendation-tracked-button"
                            disabled={busy}
                            onClick={() => job.url && window.open(job.url, "_blank", "noopener,noreferrer")}
                          >
                            {busy ? "Opening…" : "✓ Application Tracked"}
                          </button>
                        );
                      }

                      return (
                        <button
                          type="button"
                          className="recommendation-action-button recommendation-apply-button"
                          disabled={busy}
                          onClick={() => trackApplication(job, "Applying")}
                        >
                          <span aria-hidden="true">{busy && trackingStatus[job.id] === "Applying" ? "◌" : "↗"}</span>
                          {busy && trackingStatus[job.id] === "Applying" ? "Opening…" : "Apply & Track"}
                        </button>
                      );
                    })()}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!searched && (
        <section className="job-market-empty">
          <div className="job-market-empty-icon">⌕</div>
          <h3>Search the live job market</h3>
          <p>Choose a role and location, then search to load current listings.</p>
        </section>
      )}

      {loading && (
        <section className="job-market-loading">
          <span className="spinner" />
          <span>Loading live job listings…</span>
        </section>
      )}

      {!loading && searched && !error && jobs.length === 0 && (
        <section className="job-market-empty">
          <div className="job-market-empty-icon">⌕</div>
          <h3>No jobs found</h3>
          <p>Try a broader role, a different location, or another country.</p>
        </section>
      )}

      {!loading && jobs.length > 0 && (
        <section className="job-market-results">
          <div className="job-market-results-head">
            <div>
              <h2>Job listings</h2>
              <p>Showing the first {jobs.length} live results.</p>
            </div>
            <span className="job-market-count">{total.toLocaleString("en-IN")} total</span>
          </div>

          <div className="job-market-list">
            {filteredMarketJobs.map((job) => {
              const match = calculateMatch(job);
              const matchClass = match == null ? "neutral" : match >= 80 ? "high" : match >= 60 ? "medium" : "low";

              return (
                <article className="job-market-card" key={`${job.id}-${job.source}`}>
                  <div className="job-market-card-main">
                    <div className="job-market-company-mark">
                      {(job.company || "C").slice(0, 1).toUpperCase()}
                    </div>

                    <div className="job-market-card-content">
                      <div className="job-market-card-top">
                        <div>
                          <h3>{job.title}</h3>
                          <strong>{job.company}</strong>
                        </div>
                        <span className={`job-market-match ${matchClass}`}>
                          {match == null ? "Match —" : `${match}% match`}
                        </span>
                      </div>

                      <div className="job-market-meta">
                        <span>⌖ {job.location || "Location not specified"}</span>
                        <span>◷ {formatDate(job.created)}</span>
                        {job.contract_time && <span>▣ {job.contract_time.replace("_", " ")}</span>}
                        {job.contract_type && <span>◆ {job.contract_type}</span>}
                      </div>

                      <p className="job-market-description">
                        {String(job.description || "No description available.").replace(/<[^>]*>/g, "").slice(0, 320)}
                        {String(job.description || "").length > 320 ? "…" : ""}
                      </p>

                      <div className="job-market-skills">
                        {(job.skills || []).slice(0, 8).map((skill) => {
                          const matched = resumeSkills.has(String(skill).trim().toLowerCase());
                          return (
                            <span key={skill} className={matched ? "matched" : ""}>
                              {matched ? "✓ " : ""}{skill}
                            </span>
                          );
                        })}
                        {!job.skills?.length && <span>No extracted skills</span>}
                      </div>
                    </div>
                  </div>

                  <div className="job-market-card-side">
                    <strong>{formatSalary(job)}</strong>
                    {job.salary_predicted && (job.salary_min != null || job.salary_max != null) && (
                      <small>Estimated salary</small>
                    )}
                    <div className="job-market-card-actions">
                      {job.url && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => window.open(job.url, "_blank", "noopener,noreferrer")}
                        >
                          View job
                        </button>
                      )}
                      <button
                        type="button"
                        className="match-button"
                        onClick={() => openMatchModal(job)}
                      >
                        Match Resume
                      </button>
                      <button type="button" className={`save-job-button ${savedJobs.some((item) => String(item.id) === String(job.id)) ? "saved" : ""}`} onClick={() => toggleSavedJob(job)} aria-label={savedJobs.some((item) => String(item.id) === String(job.id)) ? "Remove saved job" : "Save job"}>★ {savedJobs.some((item) => String(item.id) === String(job.id)) ? "Saved" : "Save"}</button>
                      {(() => {
                        const tracked = getTrackedApplication(job);
                        const status = String(tracked?.status || "").trim();
                        const busy = addingId === job.id;

                        if (status === "Applied") {
                          return (
                            <button type="button" className="primary" disabled>
                              ✓ Applied
                            </button>
                          );
                        }

                        if (status === "Applying") {
                          return (
                            <button
                              type="button"
                              className="primary"
                              disabled={busy}
                              onClick={() => job.url && window.open(job.url, "_blank", "noopener,noreferrer")}
                            >
                              {busy ? "Opening…" : "✓ Application Tracked"}
                            </button>
                          );
                        }

                        return (
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() => trackApplication(job, "Applying")}
                          >
                            {busy && trackingStatus[job.id] === "Applying" ? "Opening…" : "Apply & Track"}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!loading && searched && !error && jobs.length > 0 && (
        <div className="job-market-pagination">
          <button
            type="button"
            className="pagination-button"
            disabled={page === 1 || loading}
            onClick={() => searchJobs(null, page - 1)}
          >
            ← Previous
          </button>

          <div className="pagination-pages">
            {Array.from(
              {
                length: Math.min(5, Math.max(1, Math.ceil(total / resultsPerPage))),
              },
              (_, index) => {
                const totalPages = Math.ceil(total / resultsPerPage);
                let pageNumber;

                if (totalPages <= 5) {
                  pageNumber = index + 1;
                } else if (page <= 3) {
                  pageNumber = index + 1;
                } else if (page >= totalPages - 2) {
                  pageNumber = totalPages - 4 + index;
                } else {
                  pageNumber = page - 2 + index;
                }

                return (
                  <button
                    type="button"
                    key={pageNumber}
                    className={`pagination-page ${pageNumber === page ? "active" : ""}`}
                    onClick={() => searchJobs(null, pageNumber)}
                    disabled={loading}
                    aria-current={pageNumber === page ? "page" : undefined}
                  >
                    {pageNumber}
                  </button>
                );
              }
            )}
          </div>

          <button
            type="button"
            className="pagination-button"
            disabled={page >= Math.ceil(total / resultsPerPage) || loading}
            onClick={() => searchJobs(null, page + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {matchJob && (() => {
        const details = getJobMatchDetails(matchJob, analyzedResumeId);
        const selectedResume = resumes.find((resume) => String(resume.id) === String(selectedResumeId)) || latestResume;
        const analyzedResume = resumes.find((resume) => String(resume.id) === String(analyzedResumeId)) || latestResume;
        const scoreNeedsAnalysis = String(selectedResumeId || "") !== String(analyzedResumeId || "");
        const displayDetails = scoreNeedsAnalysis
          ? {
              ...details,
              score: null,
              matchedSkills: [],
              missingSkills: [],
            }
          : details;

        return (
          <div className="job-match-modal-overlay" onMouseDown={closeMatchModal}>
            <section className="job-match-modal" onMouseDown={(event) => event.stopPropagation()}>
              <div className="job-match-modal-head">
                <div>
                  <div className="eyebrow">JOB-SPECIFIC ANALYSIS</div>
                  <h2>{matchJob.title}</h2>
                  <p>{matchJob.company} · {matchJob.location || "Location not specified"}</p>
                </div>
                <button type="button" className="job-match-modal-close" onClick={closeMatchModal}>×</button>
              </div>

              <div className="job-match-score-row">
                <div className={`job-match-score ${displayDetails.score == null ? "neutral" : displayDetails.score >= 80 ? "high" : displayDetails.score >= 60 ? "medium" : "low"}`}>
                  <strong>{displayDetails.score == null ? "—" : `${displayDetails.score}%`}</strong>
                  <span>Resume match</span>
                </div>

                <div className="job-match-resume-select">
                  <label>
                    <span>Resume version</span>
                    <select
                      value={selectedResumeId}
                      onChange={(event) => {
                        // Changing the dropdown does not silently change the score.
                        // The user must explicitly run the analysis.
                        setSelectedResumeId(event.target.value);
                      }}
                    >
                      {!resumes.length && <option value="">No resume versions</option>}
                      {resumes.map((resume) => (
                        <option key={resume.id} value={resume.id}>
                          {resume.name || `Resume #${resume.id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    {selectedResume
                      ? scoreNeedsAnalysis
                        ? `Selected ${selectedResume.name || "resume"} — click Analyze Resume Score to recalculate.`
                        : `Score analyzed against ${Array.isArray(analyzedResume?.skills) ? analyzedResume.skills.length : 0} stored skills.`
                      : "Add a resume version to calculate a personalized match."}
                  </small>
                </div>
              </div>

              <div className="job-match-modal-grid">
                <div>
                  <span className="job-market-fit-label matched">✓ Matched skills</span>
                  <div className="job-market-skill-pills">
                    {displayDetails.matchedSkills.map((skill) => (
                      <span className="matched" key={skill}>{skill}</span>
                    ))}
                    {!displayDetails.matchedSkills.length && <small>No matched skills detected.</small>}
                  </div>
                </div>

                <div>
                  <span className="job-market-fit-label missing">× Missing skills</span>
                  <div className="job-market-skill-pills">
                    {displayDetails.missingSkills.map((skill) => (
                      <span className="missing" key={skill}>{skill}</span>
                    ))}
                    {!displayDetails.missingSkills.length && <small>No missing extracted skills.</small>}
                  </div>
                </div>
              </div>

              <div className="job-match-required">
                <span className="job-market-fit-label">Required skills extracted from this listing</span>
                <div className="job-market-skill-pills">
                  {displayDetails.requiredSkills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                  {!displayDetails.requiredSkills.length && <small>No skills were extracted from this listing.</small>}
                </div>
              </div>

              <div className="job-match-analysis-action">
                <button
                  type="button"
                  className="primary"
                  disabled={!selectedResumeId || analyzingScore || !resumes.length}
                  onClick={analyzeSelectedResume}
                >
                  {analyzingScore ? "Analyzing score…" : "Analyze Resume Score"}
                </button>
                {scoreNeedsAnalysis && (
                  <small>Resume changed. Run the analysis to update the match score and skill breakdown.</small>
                )}
              </div>

              <div className="job-match-modal-actions">
                <button type="button" className="secondary" onClick={closeMatchModal}>Close</button>
                {matchJob.url && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => window.open(matchJob.url, "_blank", "noopener,noreferrer")}
                  >
                    View job
                  </button>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={addingId === matchJob.id}
                  onClick={async () => {
                    await addToApplications(matchJob, selectedResumeId || null);
                    closeMatchModal();
                  }}
                >
                  {addingId === matchJob.id ? "Adding…" : "＋ Add to Applications"}
                </button>
              </div>
            </section>
          </div>
        );
      })()}
    </div>
  );
}

function InterviewPreparationPage({ interviewId, onNavigate }) {
  const [interview, setInterview] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!interviewId) return;
    Promise.all([api.get("/interviews"), api.get("/jobs")]).then(([i, j]) => {
      const found = (Array.isArray(i.data) ? i.data : []).find((item) => String(item.id) === String(interviewId));
      setInterview(found || null);
      const foundJob = (Array.isArray(j.data) ? j.data : []).find((item) => String(item.id) === String(found?.job_id));
      setJob(foundJob || null);
      setNotes(localStorage.getItem(`jobtracker_prep_notes_${interviewId}`) || found?.notes || "");
    }).catch((err) => setError(err.response?.data?.detail || "Unable to load interview preparation."))
      .finally(() => setLoading(false));
  }, [interviewId]);

  if (loading) return <div className="loading">Loading interview preparation…</div>;
  if (error || !interview) return <section className="panel"><div className="page-error">{error || "Interview not found."}</div><button type="button" className="interview-navigation-button interview-navigation-back" onClick={() => onNavigate("interviews")}><span aria-hidden="true">←</span> Back to Interviews</button></section>;

  const role = String(job?.role || "the role");
  const company = job?.company || "the company";
  const round = interview.round_name || "Interview";
  const skills = Array.isArray(job?.required_skills) ? job.required_skills.filter(Boolean).slice(0, 12) : [];
  const lower = role.toLowerCase();
  const questions = lower.includes("data") ? ["Explain your strongest data project from problem to result.", "How do you clean, validate and handle missing data?", "Explain JOIN, GROUP BY, HAVING and window functions in SQL.", "How would you explain a dashboard insight to a non-technical stakeholder?"] : lower.includes("python") ? ["Walk through a Python project you built end-to-end.", "Explain list, tuple, set and dictionary with practical use cases.", "How would you design and test a REST API in Python?", "How do you handle errors, logging and performance in Python?"] : lower.includes("software") || lower.includes("developer") || lower.includes("engineer") ? ["Walk through one project and defend your technical decisions.", "Explain a frontend → API → database request flow.", "How do you debug a bug that only occurs in production?", "What trade-offs did you make in a recent project?"] : ["Tell me about yourself in 60–90 seconds.", `Why do you want to work at ${company}?`, "Describe a difficult problem and how you solved it.", "What are your strongest technical skills and where are you improving?"];
  const roundQuestions = String(round).toLowerCase().includes("hr") ? ["Tell me about yourself.", "Why this company and role?", "Describe a challenge or conflict and how you handled it.", "What are your career goals?"] : String(round).toLowerCase().includes("manager") ? ["How do you prioritize competing tasks?", "Describe a decision you made with incomplete information.", "How do you handle feedback?", "How would you communicate a project delay?"] : questions;
  const companyQuestions = [
    `Why are you interested in ${company} and this ${role} role?`,
    `What do you understand about ${company}'s products or services, and who uses them?`,
    `Which recent company initiative or challenge interests you, and why?`,
    `How would your experience help ${company} address a challenge relevant to this role?`,
  ];
  const checklist = ["Research the company and product/service.", "Read the job description and map your experience to each major requirement.", "Review every project and technology listed on your resume.", "Prepare a 60–90 second introduction.", "Practice the technical questions for this role.", "Prepare 3 questions to ask the interviewer.", "Test your camera, microphone and internet if online.", "Keep your resume, portfolio and project links ready."];
  const toggle = (index) => setChecked((prev) => ({ ...prev, [index]: !prev[index] }));
  const saveNotes = () => { localStorage.setItem(`jobtracker_prep_notes_${interviewId}`, notes); alert("Preparation notes saved."); };

  return <div className="phase1-page interview-prep-page">
    <section className="panel interview-prep-hero">
      <button type="button" className="interview-navigation-button interview-navigation-back" onClick={() => onNavigate("interviews")}><span aria-hidden="true">←</span> Back to Interviews</button>
      <div className="eyebrow">INTERVIEW PREPARATION</div>
      <h2>{company}</h2><p>{role} · {round} · {interview.type || "Online"}</p>
      <div className="interview-prep-meta"><div><span>Scheduled</span><strong>{new Date(interview.interview_date).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}</strong></div><div><span>Interviewer</span><strong>{interview.interviewer || "Not added"}</strong></div><div><span>Location / type</span><strong>{interview.type || "Online"}</strong></div></div>
    </section>

    <div className="interview-prep-dashboard-grid">
      <section className="panel interview-prep-section-card"><div className="eyebrow">YOUR CHECKLIST</div><h3>Complete before the interview</h3>{checklist.map((item, index) => <label className={`prep-check-row ${checked[index] ? "checked" : ""}`} key={item}><input type="checkbox" checked={Boolean(checked[index])} onChange={() => toggle(index)} /><span>{item}</span></label>)}<div className="prep-progress"><strong>{Object.values(checked).filter(Boolean).length}/{checklist.length}</strong><span>completed</span><i><b style={{ width: `${Math.round(Object.values(checked).filter(Boolean).length / checklist.length * 100)}%` }} /></i></div></section>
      <section className="panel interview-prep-section-card"><div className="eyebrow">ROLE & ROUND</div><h3>What you should revise</h3><div className="prep-focus-box"><strong>Role focus</strong><p>{role} — connect your answers to your actual projects and measurable outcomes.</p></div><div className="prep-focus-box"><strong>Round focus</strong><p>{round} — use concise answers, concrete examples and evidence from your experience.</p></div>{skills.length ? <><strong className="prep-subtitle">Required skills</strong><div className="prep-skill-list">{skills.map((skill) => <span key={skill}>{skill}</span>)}</div></> : <p className="muted-text">No required skills were stored for this application. Review the original job description.</p>}</section>
    </div>

    <section className="panel interview-prep-section-card"><div className="eyebrow">PRACTICE</div><h3>Questions you should be able to answer</h3><div className="prep-question-grid">{roundQuestions.map((q, index) => <article key={q}><b>{index + 1}</b><p>{q}</p></article>)}</div></section>

    <section className="panel interview-prep-section-card"><div className="eyebrow">COMPANY-FOCUSED PRACTICE</div><h3>Prepare for {company}</h3><p className="company-prep-intro">Use these prompts to connect your answers to the company. Verify facts from its official website, recent announcements and the job description—these are practice questions, not predictions.</p><div className="prep-question-grid">{companyQuestions.map((question, index) => <article key={question}><b>{index + 1}</b><p>{question}</p></article>)}</div></section>

    <section className="panel interview-prep-section-card"><div className="eyebrow">YOUR STORIES</div><h3>Prepare STAR examples</h3><div className="star-grid"><div><b>S — Situation</b><p>What was the context or problem?</p></div><div><b>T — Task</b><p>What responsibility did you own?</p></div><div><b>A — Action</b><p>What exactly did you do and why?</p></div><div><b>R — Result</b><p>What changed? Use numbers where you can.</p></div></div></section>

    <section className="panel interview-prep-section-card"><div className="eyebrow">ASK THE INTERVIEWER</div><h3>Good questions to prepare</h3><ul className="prep-question-list"><li>What would success look like in the first 90 days?</li><li>What are the biggest technical or business challenges for this role?</li><li>How does the team review code, analysis or project work?</li><li>What are the next steps after this interview?</li></ul></section>

    <section className="panel interview-prep-section-card"><div className="eyebrow">PRIVATE NOTES</div><h3>Write your final preparation notes</h3><textarea className="prep-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Project examples, achievements, technical topics to revise, questions to ask, interviewer hints, etc." /><div className="actions"><button className="primary" onClick={saveNotes}>Save preparation notes</button></div></section>
  </div>;
}

function Interviews({ onPrepare }) {
  const [items, setItems] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [interviewsResult, jobsResult] =
        await Promise.allSettled([
          api.get("/interviews", {
            params: { _t: Date.now() },
          }),
          api.get("/jobs", {
            params: { _t: Date.now() },
          }),
        ]);

      const rawInterviews =
  interviewsResult.status === "fulfilled" &&
  Array.isArray(interviewsResult.value.data)
    ? interviewsResult.value.data
    : [];

const loadedJobs =
  jobsResult.status === "fulfilled" &&
  Array.isArray(jobsResult.value.data)
    ? jobsResult.value.data
    : [];

/*
 * Only applications that are CURRENTLY in the
 * Interview stage should appear on this page.
 *
 * If company changes:
 *
 * Interview → Offer
 *
 * the old interview record will no longer be
 * displayed as an active interview.
 */

const interviewJobIds = new Set(
  loadedJobs
    .filter(
      (job) =>
        String(job?.status || "")
          .trim()
          .toLowerCase() === "interview"
    )
    .map((job) => String(job.id))
);

const actualInterviews = rawInterviews.filter(
  (interview) =>
    interview?.job_id != null &&
    interviewJobIds.has(
      String(interview.job_id)
    )
);

      setJobs(loadedJobs);

      if (interviewsResult.status !== "fulfilled") {
        setError(
          interviewsResult.reason?.response?.data?.detail ||
            "Unable to load interview details."
        );

        setItems([]);
        return;
      }

      setError("");

      /*
       * If a company changes an application to
       * Interview before sending the actual date/time,
       * show a pending interview card.
       *
       * Once the company sends the real interview record,
       * the pending card automatically disappears.
       */

      const actualJobIds = new Set(
        actualInterviews
          .filter(
            (interview) => interview?.job_id != null
          )
          .map((interview) =>
            String(interview.job_id)
          )
      );

      const pendingInterviews = loadedJobs
        .filter((job) => {
          const status = String(
            job?.status || ""
          )
            .trim()
            .toLowerCase();

          return (
            status === "interview" &&
            !actualJobIds.has(String(job.id))
          );
        })
        .map((job) => ({
          id: `application-interview-${job.id}`,
          job_id: job.id,
          round_name: "Interview stage",
          interview_date: null,
          interviewer: "",
          type: "",
          notes:
            "Waiting for company interview details.",
          result: "Pending",
          isApplicationInterview: true,
        }));

      setItems([
        ...actualInterviews,
        ...pendingInterviews,
      ]);
    } catch (err) {
      console.error(
        "Interview loading failed:",
        err
      );

      setItems([]);
      setJobs([]);

      setError(
        err.response?.data?.detail ||
          "Unable to load interviews."
      );
    }
  };

  /*
   * Automatically refresh when:
   * - company data changes
   * - browser gets focus
   * - tab becomes visible
   * - polling interval runs
   */
  useEffect(() => {
    let active = true;

    const refresh = async () => {
      if (!active) return;

      try {
        await load();
      } catch (err) {
        console.error(
          "Interview refresh failed:",
          err
        );
      }
    };

    refresh();

    const cleanupSync =
      createSyncRefresh(refresh);

    return () => {
      active = false;
      cleanupSync();
    };
  }, []);

  return (
    <>
      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div
        className="page-actions"
        style={{
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <div className="eyebrow">
            INTERVIEW TRACKING
          </div>

          <h2
            style={{
              marginBottom: 6,
            }}
          >
            Interview schedule
          </h2>

          <p>
            Company interview updates will appear
            here automatically.
          </p>
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 999,
            background: "#eef6ff",
            border: "1px solid #d7e8ff",
            color: "#1769d2",
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#2388ff",
            }}
          />

          Company synced
        </div>
      </div>

      {/* =====================================================
          ERROR
      ====================================================== */}

      {error && (
        <div
          className="resume-alert error"
          style={{
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* =====================================================
          INTERVIEW LIST
      ====================================================== */}

      <section
        className="panel"
        style={{
          padding: 0,
          overflow: "hidden",
        }}
      >
        {items.length ? (
          <div
            style={{
              display: "grid",
              gap: 0,
            }}
          >
            {items.map(
              (interview, index) => {
                const linkedJob = jobs.find(
                  (job) =>
                    String(job.id) ===
                    String(interview.job_id)
                );

                const isPending =
                  Boolean(
                    interview.isApplicationInterview
                  );

                const title =
                  linkedJob?.title ||
                  linkedJob?.role ||
                  `Job #${interview.job_id}`;

                const company =
                  linkedJob?.company ||
                  "Company";

                const interviewDate =
                  interview.interview_date
                    ? new Date(
                        interview.interview_date
                      )
                    : null;

                const validDate =
                  interviewDate &&
                  !Number.isNaN(
                    interviewDate.getTime()
                  );

                const formattedDate = validDate
                  ? interviewDate.toLocaleDateString(
                      "en-IN",
                      {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }
                    )
                  : null;

                const formattedTime = validDate
                  ? interviewDate.toLocaleTimeString(
                      "en-IN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )
                  : null;

                return (
                  <article
                    key={interview.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(260px, 1.4fr) minmax(220px, 1fr) auto",
                      gap: 24,
                      alignItems: "center",
                      padding: "24px 28px",
                      borderBottom:
                        index <
                        items.length - 1
                          ? "1px solid #e7edf5"
                          : "none",
                      background: isPending
                        ? "#fbfdff"
                        : "#ffffff",
                    }}
                  >
                    {/* =================================================
                        LEFT SIDE
                    ================================================== */}

                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            display:
                              "inline-flex",
                            alignItems:
                              "center",
                            padding:
                              "5px 10px",
                            borderRadius: 999,
                            background:
                              isPending
                                ? "#fff7e8"
                                : "#edf8f2",
                            color:
                              isPending
                                ? "#a96700"
                                : "#168653",
                            border: `1px solid ${
                              isPending
                                ? "#f4dfb7"
                                : "#ccebd9"
                            }`,
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing:
                              ".04em",
                            textTransform:
                              "uppercase",
                          }}
                        >
                          {isPending
                            ? "Interview stage"
                            : "Scheduled interview"}
                        </span>
                      </div>

                      <h3
                        style={{
                          margin: 0,
                          fontSize: 19,
                          lineHeight: 1.25,
                          color: "#14233d",
                          fontWeight: 800,
                        }}
                      >
                        {title}
                      </h3>

                      <div
                        style={{
                          marginTop: 5,
                          color: "#5e718e",
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {company}
                      </div>

                      {!isPending && (
                        <div
                          style={{
                            marginTop: 10,
                            color: "#687b96",
                            fontSize: 13,
                          }}
                        >
                          {interview.round_name ||
                            "Interview"}

                          {interview.type
                            ? ` · ${interview.type}`
                            : ""}
                        </div>
                      )}
                    </div>

                    {/* =================================================
                        DATE / PENDING INFORMATION
                    ================================================== */}

                    <div
                      style={{
                        minWidth: 0,
                        padding: "14px 16px",
                        borderRadius: 14,
                        background: isPending
                          ? "#fffaf0"
                          : "#f5f8fc",
                        border: `1px solid ${
                          isPending
                            ? "#f3e4c7"
                            : "#e3eaf3"
                        }`,
                      }}
                    >
                      {isPending ? (
                        <>
                          <div
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: 9,
                              color: "#8a5a00",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 18,
                              }}
                            >
                              ◷
                            </span>

                            Schedule pending
                          </div>

                          <div
                            style={{
                              marginTop: 6,
                              color: "#7b8798",
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            Waiting for company
                            interview details
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            style={{
                              color: "#14233d",
                              fontWeight: 800,
                              fontSize: 15,
                            }}
                          >
                            {formattedDate ||
                              "Date not set"}
                          </div>

                          {formattedTime && (
                            <div
                              style={{
                                marginTop: 3,
                                color: "#526783",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {formattedTime}
                            </div>
                          )}

                          <div
                            style={{
                              marginTop: 6,
                              color: "#7b8798",
                              fontSize: 12,
                            }}
                          >
                            {interview.interviewer ||
                              "Interviewer not specified"}
                          </div>
                        </>
                      )}
                    </div>

                    {/* =================================================
                        COMPANY CONTROLLED STATUS
                    ================================================== */}

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 7,
                        color: "#2388ff",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span>●</span>

                      {isPending
                        ? "Company will update"
                        : "Company synced"}
                      {!isPending && (
                        <button
                          type="button"
                          className="interview-card-prepare"
                          onClick={() => onPrepare?.(interview.id)}
                        >
                          Prepare →
                        </button>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </div>
        ) : (
          /* =====================================================
             EMPTY STATE
          ====================================================== */

          <div className="interviews-empty-state">
            <div className="interviews-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect x="8" y="12" width="32" height="28" rx="6" />
                <path d="M16 8v8M32 8v8M8 20h32M16 27h5M27 27h5M16 33h5" />
              </svg>
            </div>
            <div className="interviews-empty-copy">
              <span className="eyebrow">YOUR SCHEDULE</span>
              <h3>No interviews scheduled yet</h3>
              <p>
                When a company confirms an interview, its date, time and
                details will appear here automatically.
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function Resumes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState({
    name: "",
    skills: "",
    file: null,
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/resumes", {
        params: {
          _t: Date.now(),
        },
      });

      const data = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.items)
          ? response.data.items
          : [];

      setItems(data);
    } catch (err) {
      console.error("Resume loading failed:", err);

      setItems([]);

      setError(
        err.response?.data?.detail ||
          "Unable to load resumes. Check that the resume API is running."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /*
   * UPLOAD RESUME
   */
  const uploadFile = async (event) => {
    const form = event.currentTarget;
    event.preventDefault();

    if (!upload.file) {
      setError("Please choose a resume file.");
      return;
    }
    if (upload.file.size > 4 * 1024 * 1024) {
      setError("Resume files must be no larger than 4 MB.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const data = new FormData();

      data.append("file", upload.file);
      data.append(
        "name",
        upload.name.trim() || upload.file.name
      );
      data.append("skills", upload.skills);

      const uploadResponse = await api.post(
        "/resumes/upload",
        data
      );

      setUpload({
        name: "",
        skills: "",
        file: null,
      });

      /*
       * Reset the file input after successful upload.
       */
      form.reset();

      let uploadMessage = "Resume uploaded successfully.";

      try {
        const analysisResponse = await api.post(
          `/resumes/${uploadResponse.data.id}/analyze`
        );
        const detectedSkills = Array.isArray(
          analysisResponse.data?.automatic_skills
        )
          ? analysisResponse.data.automatic_skills
          : [];

        uploadMessage = detectedSkills.length
          ? `Resume uploaded. Automatically detected ${detectedSkills.length} skill${
              detectedSkills.length === 1 ? "" : "s"
            }: ${detectedSkills.join(", ")}.`
          : "Resume uploaded, but no skills were detected. You can add them in the optional skills field.";
      } catch (analysisError) {
        console.error("Resume skill detection failed:", analysisError);

        const detail = analysisError.response?.data?.detail;
        const reason = Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : detail;

        uploadMessage = `Resume uploaded, but automatic skill detection failed${
          reason ? `: ${reason}` : "."
        }`;
      }

      setMessage(uploadMessage);
      await load();
    } catch (err) {
      console.error("Resume upload failed:", err);

      const detail = err.response?.data?.detail;
      const reason = Array.isArray(detail)
        ? detail.map((item) => item.msg).join(", ")
        : typeof detail === "string"
          ? detail
          : "";

      setError(
        reason ||
          (err.response?.status
            ? `Resume upload failed (HTTP ${err.response.status}).`
            : "Unable to reach the resume upload service. Please try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * OPEN RESUME
   */
  const openResume = async (resume) => {
    if (!resume?.id || !resume?.file_name) {
      setMessage(
        "This resume has no uploaded file to open."
      );
      setError("");
      return;
    }

    setOpeningId(resume.id);
    setMessage("");
    setError("");

    try {
      /*
       * Use axios so the authentication token is included.
       */
      const response = await api.get(
        `/resumes/${resume.id}/file`,
        {
          responseType: "blob",
        }
      );

      const blobUrl = URL.createObjectURL(
        response.data
      );

      const newTab = window.open(
        blobUrl,
        "_blank",
        "noopener,noreferrer"
      );

      /*
       * If the browser blocks the popup,
       * open the file in the current tab.
       */
      if (!newTab) {
        window.location.href = blobUrl;
      }

      /*
       * Release temporary object URL later.
       */
      window.setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 60000);
    } catch (err) {
      console.error("Resume opening failed:", err);

      setError(
        err.response?.data?.detail ||
          "Unable to open this resume."
      );
    } finally {
      setOpeningId(null);
    }
  };

  /*
   * ============================================================
   * DELETE RESUME
   * ============================================================
   *
   * This is the function you should be able to find easily.
   *
   * Frontend request:
   *
   * DELETE /api/resumes/{resume_id}
   *
   * The backend must provide:
   *
   * @router.delete("/{resume_id}")
   *
   * in backend/app/routers/resumes.py
   */
  const handleDeleteResume = async (resume) => {
    if (!resume?.id) {
      setError("Invalid resume.");
      return;
    }

    const resumeName =
      resume.name ||
      resume.file_name ||
      "this resume";

    const confirmed = window.confirm(
      `Delete "${resumeName}"?\n\n` +
        "This will remove the saved resume record and uploaded file."
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(resume.id);
    setMessage("");
    setError("");

    try {
      /*
       * DELETE request to backend.
       */
      await api.delete(
        `/resumes/${resume.id}`
      );

      /*
       * Immediately remove it from the UI.
       *
       * This makes the resume disappear without
       * requiring a full page refresh.
       */
      setItems((currentItems) =>
        currentItems.filter(
          (item) =>
            String(item.id) !==
            String(resume.id)
        )
      );

      setMessage(
        "Resume deleted successfully."
      );

      /*
       * Tell other JobTracker components that
       * resume data changed.
       */
      try {
        window.dispatchEvent(
          new CustomEvent(
            "jobtracker:data-changed",
            {
              detail: {
                type: "resume-deleted",
                resumeId: resume.id,
                timestamp: Date.now(),
              },
            }
          )
        );
      } catch {
        window.dispatchEvent(
          new Event(
            "jobtracker:data-changed"
          )
        );
      }
    } catch (err) {
      console.error(
        "Resume deletion failed:",
        err
      );

      setError(
        err.response?.data?.detail ||
          "Unable to delete resume. Check the backend DELETE /resumes/{id} endpoint."
      );
    } finally {
      setDeletingId(null);
    }
  };

  /*
   * FORMAT SKILLS
   */
  const formatSkills = (skills) => {
    if (Array.isArray(skills)) {
      const validSkills = skills.filter(Boolean);

      return validSkills.length
        ? validSkills.join(", ")
        : "—";
    }

    return skills || "—";
  };

  /*
   * FORMAT DATE
   */
  const formatDate = (value) => {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  /*
   * KEYBOARD ACCESSIBILITY
   */
  const handleRowKeyDown = (
    event,
    resume
  ) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();

      if (resume?.file_name) {
        openResume(resume);
      }
    }
  };

  return (
    <>
      <div className="section-title">
        <div>
          <h2>Resumes</h2>

          <p>
            Upload your resume versions and
            manage them from one place.
          </p>
        </div>
      </div>

      {/* ALERTS */}

      {(error || message) && (
        <div
          className={`resume-alert ${
            error ? "error" : "success"
          }`}
        >
          {error || message}
        </div>
      )}

      {/* =========================================================
          UPLOAD RESUME
         ========================================================= */}

      <div className="resume-upload-single">
        <Panel title="Upload resume">
          <form
            className="stack-form"
            onSubmit={uploadFile}
          >
            <input
              type="text"
              placeholder="Version name"
              value={upload.name}
              onChange={(event) =>
                setUpload({
                  ...upload,
                  name: event.target.value,
                })
              }
            />

            <input
              type="text"
              placeholder="Optional skills (e.g. Python, SQL, React)"
              value={upload.skills}
              onChange={(event) =>
                setUpload({
                  ...upload,
                  skills:
                    event.target.value,
                })
              }
            />
            <small>
              Skills are detected automatically from readable PDF and DOCX resumes.
            </small>

            <label
              className="resume-file-picker"
              htmlFor="resume-file"
            >
              <span className="resume-file-icon" aria-hidden="true">
                ↑
              </span>
              <span className="resume-file-copy">
                <strong>
                  {upload.file?.name || "Choose a resume file"}
                </strong>
                <small>
                  {upload.file
                    ? `${(upload.file.size / (1024 * 1024)).toFixed(1)} MB · 4 MB maximum`
                    : "PDF, DOC or DOCX · 4 MB maximum"}
                </small>
              </span>
              <span className="resume-file-action">Browse files</span>
              <input
                id="resume-file"
                className="resume-file-input"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(event) =>
                  setUpload({
                    ...upload,
                    file:
                      event.target.files?.[0] ||
                      null,
                  })
                }
                required
              />
            </label>

            <button
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Uploading…"
                : "Upload file"}
            </button>
          </form>
        </Panel>
      </div>

      {/* =========================================================
          SAVED RESUMES
         ========================================================= */}

      <section className="panel resume-list-panel">
        <div className="resume-list-head">
          <div>
            <h2>Saved resumes</h2>

            <p>
              {loading
                ? "Loading resumes…"
                : `${items.length} resume${
                    items.length === 1
                      ? ""
                      : "s"
                  } saved`}
            </p>
          </div>

          <button
            type="button"
            className="refresh-button"
            onClick={load}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>

        {/* LOADING */}

        {loading ? (
          <div className="resume-empty-state">
            Loading your resumes…
          </div>
        ) : items.length ? (
          /* RESUME TABLE */
          <div className="resume-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resume</th>
                  <th>Skills</th>
                  <th>Created</th>
                  <th>File</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {items.map(
                  (resume, index) => (
                    <tr
                      key={
                        resume.id ||
                        `${resume.name}-${index}`
                      }
                      className={
                        resume.file_name
                          ? "resume-clickable-row"
                          : "resume-no-file-row"
                      }
                      onClick={() => {
                        if (
                          resume.file_name
                        ) {
                          openResume(resume);
                        }
                      }}
                      onKeyDown={(event) =>
                        handleRowKeyDown(
                          event,
                          resume
                        )
                      }
                      tabIndex={
                        resume.file_name
                          ? 0
                          : -1
                      }
                      title={
                        resume.file_name
                          ? "Click to open resume"
                          : "No uploaded file"
                      }
                    >
                      <td>
                        <strong>
                          {resume.name ||
                            "Untitled resume"}
                        </strong>
                      </td>

                      <td>
                        {formatSkills(
                          resume.skills
                        )}
                      </td>

                      <td>
                        {formatDate(
                          resume.created_at
                        )}
                      </td>

                      <td>
                        {openingId ===
                        resume.id
                          ? "Opening…"
                          : resume.file_name
                            ? `↗ ${resume.file_name}`
                            : "No file"}
                      </td>

                      <td
                        onClick={(event) =>
                          event.stopPropagation()
                        }
                      >
                        <button
                          type="button"
                          className="small danger resume-delete-button"
                          disabled={
                            deletingId ===
                            resume.id
                          }
                          onClick={() =>
                            handleDeleteResume(
                              resume
                            )
                          }
                        >
                          {deletingId ===
                          resume.id
                            ? "Deleting…"
                            : "Delete"}
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="resume-empty-state">
            <strong>
              No resumes yet.
            </strong>

            <span>
              Upload a PDF, DOC or DOCX above.
            </span>
          </div>
        )}
      </section>
    </>
  );
}


/* ================================================================
   KEEP YOUR EXISTING App() FUNCTION BELOW
   ================================================================ */

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [prepInterviewId, setPrepInterviewId] = useState("");
  const [processJobId, setProcessJobId] = useState("");
  const [accounts, setAccounts] = useState(normalizeAccounts());
  const [profilePhoto, setProfilePhoto] = useState("");

  useEffect(() => {
    if (!user) return;

    setProfilePhoto(
      getStoredProfilePhoto(user)
    );

    const refreshProfile = () =>
      setProfilePhoto(
        getStoredProfilePhoto(user)
      );

    window.addEventListener(
      "jobtracker-profile-updated",
      refreshProfile
    );

    return () =>
      window.removeEventListener(
        "jobtracker-profile-updated",
        refreshProfile
      );
  }, [user]);

  useEffect(() => {
    if (user?.email) {
      localStorage.setItem(
        "jobtracker_active_email",
        user.email
      );
    }
  }, [user]);

  useEffect(() => {
    const token =
      localStorage.getItem("token");

    if (!token) return;

    api
      .get("/auth/me")
      .then((response) => {
        setUser(response.data);

        saveAccount(
          response.data,
          token
        );

        setAccounts(
          normalizeAccounts()
        );
      })
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      });
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const hash =
        window.location.hash || "";

      if (
        hash.startsWith(
          "#interview-prep="
        )
      ) {
        const id =
          hash.split("=")[1];

        if (id) {
          setPrepInterviewId(id);
          setPage(
            "interview-prep"
          );
        }
      }
    };

    handleHash();

    window.addEventListener(
      "hashchange",
      handleHash
    );

    return () =>
      window.removeEventListener(
        "hashchange",
        handleHash
      );
  }, []);

  const handleLogin = (
    nextUser
  ) => {
    setUser(nextUser);
    setAccounts(
      normalizeAccounts()
    );
    setPage("dashboard");
  };

  const logout = () => {
    localStorage.removeItem(
      "token"
    );

    setUser(null);
    setPage("dashboard");
  };

  const switchAccount = async (
    account
  ) => {
    const previousToken =
      localStorage.getItem(
        "token"
      );

    try {
      localStorage.setItem(
        "token",
        account.token
      );

      const response =
        await api.get(
          "/auth/me"
        );

      setUser(response.data);
      setPage("dashboard");

      setAccounts(
        normalizeAccounts()
      );
    } catch (error) {
      if (previousToken) {
        localStorage.setItem(
          "token",
          previousToken
        );
      } else {
        localStorage.removeItem(
          "token"
        );
      }

      const remaining =
        normalizeAccounts().filter(
          (item) =>
            item.email !==
            account.email
        );

      localStorage.setItem(
        "jobtracker_accounts",
        JSON.stringify(
          remaining
        )
      );

      setAccounts(remaining);

      console.error(
        "Account switch failed:",
        error
      );
    }
  };

  if (!user) {
    return (
      <Auth
        onLogin={handleLogin}
      />
    );
  }

  const nav = [
    ["dashboard", "Home", "⌂"],
    [
      "applications",
      "Applications",
      "▤",
    ],
    [
      "interviews",
      "Interviews",
      "◷",
    ],
    [
      "resumes",
      "Resumes",
      "▣",
    ],
    [
      "ai-analysis",
      "AI Analysis",
      "✦",
    ],
  ];

  const opportunities = [
    [
      "opportunities-search",
      "Search Jobs",
      "⌕",
    ],
    [
      "opportunities-applied",
      "Applied Jobs",
      "●",
    ],
    [
      "opportunities-recommended",
      "Recommended Jobs",
      "✦",
    ],
    [
      "opportunities-saved",
      "Saved Jobs",
      "★",
    ],
    [
      "opportunities-messages",
      "Recruiter Messages",
      "✉",
    ],
  ];

  const tools = [
    [
      "profile-performance",
      "Profile Performance",
      "◈",
    ],
    [
      "my-profile",
      "My Profile",
      "◎",
    ],
    [
      "insights",
      "Insights",
      "▥",
    ],
  ];

  return (
    <div className="app">
      <aside className="phase4-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark small">
            JT
          </span>

          <strong>
            JobTracker
          </strong>
        </div>

        <div className="nav-label">
          WORKSPACE
        </div>

        <nav>
          {nav.map(
            ([
              key,
              label,
              icon,
            ]) => (
              <button
                type="button"
                key={key}
                className={
                  page === key
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPage(key)
                }
              >
                <span>
                  {icon}
                </span>

                {label}
              </button>
            )
          )}
        </nav>

        <div className="nav-divider" />

        <div className="nav-label">
          OPPORTUNITIES
        </div>

        <nav>
          {opportunities.map(
            ([
              key,
              label,
              icon,
            ]) => (
              <button
                type="button"
                key={key}
                className={
                  page === key
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPage(key)
                }
              >
                <span>
                  {icon}
                </span>

                {label}
              </button>
            )
          )}
        </nav>

        <div className="nav-divider" />

        <div className="nav-label">
          TOOLS
        </div>

        <nav>
          {tools.map(
            ([
              key,
              label,
              icon,
            ]) => (
              <button
                type="button"
                key={key}
                className={
                  page === key
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPage(key)
                }
              >
                <span>
                  {icon}
                </span>

                {label}
              </button>
            )
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-mini">
            <div className="avatar">
              {user.name
                ?.slice(0, 1)
                .toUpperCase()}
            </div>

            <div>
              <strong>
                {user.name}
              </strong>

              <small>
                {user.email}
              </small>
            </div>
          </div>

          <button
            type="button"
            className="logout"
            onClick={logout}
          >
            ↪ &nbsp; Logout
          </button>
        </div>
      </aside>

      <main className="phase4-main">
        {page === "dashboard" ? (
          <Dashboard
            user={user}
            accounts={accounts}
            onNavigate={setPage}
            onLogout={logout}
            onSwitchAccount={
              switchAccount
            }
            profilePhoto={
              profilePhoto
            }
          />
        ) : page ===
          "applications" ? (
          <PageShell
            title="Applications"
            user={user}
          >
            <Applications
              onOpenProcess={(
                id
              ) => {
                setProcessJobId(
                  String(id)
                );
                setPage(
                  "application-process"
                );
              }}
            />
          </PageShell>
        ) : page ===
          "interviews" ? (
          <PageShell
            title="Interviews"
            user={user}
          >
            <Interviews
              onPrepare={(id) => {
                setPrepInterviewId(String(id));
                localStorage.setItem(
                  "jobtracker_prep_interview_id",
                  String(id)
                );
                setPage("interview-prep");
              }}
            />
          </PageShell>
        ) : page ===
          "resumes" ? (
          <PageShell
            title="Resumes"
            user={user}
          >
            <Resumes />
          </PageShell>
        ) : page ===
          "ai-analysis" ? (
          <PageShell
            title="AI Analysis"
            user={user}
          >
            <AIAnalysis />
          </PageShell>
        ) : page ===
          "opportunities-search" ? (
          <PageShell
            title="Search Jobs"
            user={user}
          >
            <JobMarket
              user={user}
            />
          </PageShell>
        ) : page ===
          "opportunities-applied" ? (
          <PageShell
            title="Applied Jobs"
            user={user}
          >
            <AppliedJobsPage
              onOpenProcess={(
                id
              ) => {
                setProcessJobId(
                  String(id)
                );
                setPage(
                  "application-process"
                );
              }}
            />
          </PageShell>
        ) : page ===
          "application-process" ? (
          <PageShell
            title="Application Process"
            user={user}
          >
            <ApplicationProcessPage
              jobId={
                processJobId
              }
              onNavigate={
                setPage
              }
            />
          </PageShell>
        ) : page ===
          "interview-prep" ? (
          <InterviewPreparationPage
            interviewId={
              prepInterviewId ||
              localStorage.getItem(
                "jobtracker_prep_interview_id"
              )
            }
            onNavigate={
              setPage
            }
          />
        ) : page ===
          "opportunities-recommended" ? (
          <PageShell
            title="Recommended Jobs"
            user={user}
          >
            <RecommendedJobsPage
              user={user}
              onNavigate={
                setPage
              }
            />
          </PageShell>
        ) : page ===
          "opportunities-saved" ? (
          <PageShell
            title="Saved Jobs"
            user={user}
          >
            <SavedJobsPage
              user={user}
              onNavigate={
                setPage
              }
            />
          </PageShell>
        ) : page ===
          "opportunities-messages" ? (
          <PageShell
            title="Recruiter Messages"
            user={user}
          >
            <RecruiterMessagesPage />
          </PageShell>
        ) : page ===
          "profile-performance" ? (
          <PageShell
            title="Profile Performance"
            user={user}
          >
            <ProfilePerformance
              user={user}
              onNavigate={
                setPage
              }
              onOpenApplication={(jobId) => {
                setProcessJobId(String(jobId));
                setPage("application-process");
              }}
            />
          </PageShell>
        ) : page ===
          "my-profile" ? (
          <PageShell
            title="My Profile"
            user={user}
          >
            <MyProfile
              user={user}
              onProfileUpdated={() =>
                setProfilePhoto(
                  getStoredProfilePhoto(
                    user
                  )
                )
              }
            />
          </PageShell>
        ) : page ===
          "insights" ? (
          <PageShell
            title="Insights"
            user={user}
          >
            <MarketInsightsPage />
          </PageShell>
        ) : null}
      </main>
    </div>
  );
}

export default App;