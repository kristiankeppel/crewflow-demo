(function () {
const {
  BASE_OPTIONS,
  DEFAULT_RULES,
  FLEET_OPTIONS,
  PILOT_POSITIONS,
  ROLE_OPTIONS,
  createBlankState,
  createDefaultProfile,
  createSeedState,
} = window.CrewFlowData;

const {
  countHiddenMarketplacePosts,
  formatHours,
  getDaySwapMatches,
  getFlightById,
  getFlightsForDate,
  getIncomingSwapRequests,
  getNotifications,
  getOutgoingSwapRequests,
  getRecommendedSwaps,
  getScheduleMetrics,
  getStatusesForDate,
  getSwapCandidates,
  getUserById,
  getUserFlights,
  getVisibleMarketplacePosts,
  isFlightOffered,
  summarizeValidation,
  validateOpenTimeClaim,
  validateSwapProposal,
} = window.CrewFlowEngine;

const STORAGE_KEY = "crewflow-demo-state-v2";
const root = document.getElementById("app");

const formatters = {
  month: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }),
  shortDate: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }),
  fullDate: new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }),
  weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }),
  time: new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }),
};

const TAB_LABELS = {
  calendar: "Calendar",
  marketplace: "Marketplace",
  requests: "Requests",
  profile: "Profile",
};

let state = loadState();
let swipeState = null;

root.addEventListener("click", handleClick);
root.addEventListener("submit", handleSubmit);
root.addEventListener("change", handleChange);
root.addEventListener("touchstart", handleTouchStart, { passive: true });
root.addEventListener("touchend", handleTouchEnd, { passive: true });

render();

function loadState() {
  const blank = createBlankState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return blank;
    }
    const parsed = JSON.parse(raw);
    return {
      ...blank,
      ...parsed,
      rules: { ...DEFAULT_RULES, ...(parsed.rules || {}) },
      marketplaceFilters: {
        ...blank.marketplaceFilters,
        ...(parsed.marketplaceFilters || {}),
      },
      sheet: parsed.sheet || null,
    };
  } catch (error) {
    return blank;
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function commit() {
  saveState();
  render();
}

function render() {
  document.body.dataset.theme = state.theme || "dark";
  root.innerHTML = state.profile ? renderAppShell() : renderOnboarding();
  syncOnboardingVisibility();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nowLocalDateTime() {
  const current = new Date();
  return `${toIsoDate(current)}T${String(current.getHours()).padStart(2, "0")}:${String(
    current.getMinutes(),
  ).padStart(2, "0")}`;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  return new Date(value);
}

function shiftMonth(monthString, offset) {
  const [year, month] = monthString.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return toIsoDate(date).slice(0, 7);
}

function formatMonth(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return formatters.month.format(new Date(year, month - 1, 1));
}

function formatDate(dateString) {
  return formatters.fullDate.format(new Date(`${dateString}T12:00`));
}

function formatShortDate(dateString) {
  return formatters.shortDate.format(new Date(`${dateString}T12:00`));
}

function formatTimeRange(startValue, endValue) {
  return `${formatters.time.format(parseDate(startValue))} - ${formatters.time.format(
    parseDate(endValue),
  )}`;
}

function getCurrentUser() {
  return state.profile ? getUserById(state, "me") : null;
}

function getSelectedFlight() {
  return getFlightById(state, state.selectedMyFlightId);
}

function ensureSelectedFlight() {
  const myFlights = getUserFlights(state, "me");
  if (!myFlights.length) {
    state.selectedMyFlightId = "";
    return;
  }
  if (!myFlights.some((flight) => flight.id === state.selectedMyFlightId)) {
    state.selectedMyFlightId = myFlights[0].id;
  }
}

function setBanner(type, text) {
  state.banner = { type, text };
}

function addNotification(type, title, body, relatedId) {
  state.notifications.unshift({
    id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    title,
    body,
    relatedId: relatedId || "",
    createdAt: nowLocalDateTime(),
    read: false,
  });
}

function addAudit(action, detail) {
  state.auditLog.unshift({
    id: `a-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: nowLocalDateTime(),
    action,
    detail,
  });
}

function getDepartureWindow(departureTime) {
  const hours = parseDate(departureTime).getHours();
  if (hours < 12) {
    return "morning";
  }
  if (hours < 18) {
    return "afternoon";
  }
  return "evening";
}

function filterMarketplacePosts(posts) {
  const filters = state.marketplaceFilters;
  const layoverNeedle = filters.layover.trim().toLowerCase();
  return posts.filter(function (entry) {
    const flight = entry.flight;
    if (filters.date && flight.date !== filters.date) {
      return false;
    }
    if (filters.base !== "all" && flight.base !== filters.base) {
      return false;
    }
    if (filters.fleet !== "all" && flight.aircraftType !== filters.fleet) {
      return false;
    }
    if (
      filters.departureWindow !== "all" &&
      getDepartureWindow(flight.departureTime) !== filters.departureWindow
    ) {
      return false;
    }
    if (filters.tripLength === "same-day" && flight.tripLengthDays > 1) {
      return false;
    }
    if (filters.tripLength === "layover" && flight.tripLengthDays === 1) {
      return false;
    }
    if (
      layoverNeedle &&
      !String(flight.layoverLocation || "").toLowerCase().includes(layoverNeedle)
    ) {
      return false;
    }
    return true;
  });
}

function getFlightSwapSummary(flightId) {
  const eligibleCandidates = getSwapCandidates(state, "me", flightId).filter(function (candidate) {
    return candidate.validation.eligible;
  });
  return {
    count: eligibleCandidates.length,
    topMatches: eligibleCandidates.slice(0, 3),
  };
}

function findOpenPostByFlightId(flightId) {
  return state.openTimePosts.find(function (post) {
    return post.flightId === flightId && post.status === "open";
  });
}

function getCompletedRequests() {
  return state.swapRequests
    .filter(function (request) {
      return request.status !== "pending";
    })
    .map(function (request) {
      return {
        request: request,
        requester: getUserById(state, request.requesterId),
        targetUser: getUserById(state, request.targetUserId),
        requesterFlight: getFlightById(state, request.requesterFlightId),
        targetFlight: getFlightById(state, request.targetFlightId),
      };
    })
    .sort(function (left, right) {
      return parseDate(right.request.createdAt).getTime() - parseDate(left.request.createdAt).getTime();
    });
}

function getIncomingRequestRows() {
  return getIncomingSwapRequests(state, "me");
}

function getOutgoingRequestRows() {
  return getOutgoingSwapRequests(state, "me");
}

function renderOnboarding() {
  const defaults = createDefaultProfile();
  return `
    <section class="auth-shell">
      <div class="auth-copy">
        <p class="eyebrow">CrewFlow</p>
        <h2>The fastest way for crew to trade, offer, and protect legal flying.</h2>
        <p>
          Built for quick roster decisions between flights, on layovers, and during turnarounds.
          Load the demo profile to explore the dark-mode mobile experience.
        </p>
        <div class="hero-points">
          <div class="hero-point">
            <strong>30 sec</strong>
            <span>target time to find and send a swap</span>
          </div>
          <div class="hero-point">
            <strong>4 tabs</strong>
            <span>calendar, marketplace, requests, profile</span>
          </div>
          <div class="hero-point">
            <strong>0 illegal</strong>
            <span>swaps allowed through the rule engine</span>
          </div>
        </div>
      </div>
      <form class="panel-card onboarding-card" data-form="onboarding">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Sign In</p>
            <h3>Load a verified crew profile</h3>
          </div>
          <p class="muted">Email verification now, company verification later.</p>
        </div>
        <label class="field">
          <span>Role</span>
          <select name="role">
            ${ROLE_OPTIONS.map(function (role) {
              return `<option value="${role}" ${
                role === defaults.role ? "selected" : ""
              }>${escapeHtml(role)}</option>`;
            }).join("")}
          </select>
        </label>
        <label class="field" data-position-field>
          <span>Pilot position</span>
          <select name="position">
            ${PILOT_POSITIONS.map(function (position) {
              return `<option value="${position}" ${
                position === defaults.position ? "selected" : ""
              }>${escapeHtml(position)}</option>`;
            }).join("")}
          </select>
        </label>
        <label class="field">
          <span>Base</span>
          <select name="base">
            ${BASE_OPTIONS.map(function (base) {
              return `<option value="${base}" ${
                base === defaults.base ? "selected" : ""
              }>${escapeHtml(base)}</option>`;
            }).join("")}
          </select>
        </label>
        <label class="field">
          <span>Fleet</span>
          <select name="fleet">
            ${FLEET_OPTIONS.map(function (fleet) {
              return `<option value="${fleet}" ${
                fleet === defaults.fleet ? "selected" : ""
              }>${escapeHtml(fleet)}</option>`;
            }).join("")}
          </select>
        </label>
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" value="${escapeHtml(defaults.email)}" required />
        </label>
        <label class="field">
          <span>Employee ID</span>
          <input type="text" name="employeeId" placeholder="Optional" />
        </label>
        <label class="field">
          <span>Airline</span>
          <input type="text" name="airline" value="${escapeHtml(defaults.airline)}" />
        </label>
        <button class="button button--primary" type="submit">Open CrewFlow Demo</button>
      </form>
    </section>
  `;
}

function renderAppShell() {
  ensureSelectedFlight();
  const me = getCurrentUser();
  const metrics = getScheduleMetrics(state, "me");
  const notifications = getNotifications(state);
  const unreadCount = notifications.filter(function (note) {
    return !note.read;
  }).length;

  return `
    ${renderBanner()}
    <section class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Roster Live</p>
          <h2>${escapeHtml(TAB_LABELS[state.activeTab] || "Calendar")}</h2>
          <p class="screen-subtitle">${escapeHtml(me.base)} base · ${escapeHtml(
            me.fleet,
          )} · ${escapeHtml(me.role === "Pilot" ? me.position : "Flight Attendant")}</p>
        </div>
        <div class="header-pills">
          ${renderStatusPill(metrics.legal ? "available" : "conflict", metrics.legal ? "Legal" : "Review")}
          ${renderStatusPill("info", `${unreadCount} alerts`)}
        </div>
      </header>
      <div class="screen-frame">
        ${renderActiveScreen()}
      </div>
      <nav class="tabbar" aria-label="Primary">
        ${renderTabButton("calendar", "Calendar", unreadCount)}
        ${renderTabButton("marketplace", "Marketplace", 0)}
        ${renderTabButton("requests", "Requests", metrics.pendingIncoming)}
        ${renderTabButton("profile", "Profile", 0)}
      </nav>
    </section>
    ${renderBottomSheet()}
  `;
}

function renderActiveScreen() {
  if (state.activeTab === "marketplace") {
    return renderMarketplaceScreen();
  }
  if (state.activeTab === "requests") {
    return renderRequestsScreen();
  }
  if (state.activeTab === "profile") {
    return renderProfileScreen();
  }
  return renderCalendarScreen();
}

function renderBanner() {
  if (!state.banner) {
    return "";
  }
  return `
    <section class="inline-banner inline-banner--${escapeHtml(state.banner.type)}">
      <p>${escapeHtml(state.banner.text)}</p>
      <button type="button" class="button button--ghost button--small" data-action="dismiss-banner">
        Dismiss
      </button>
    </section>
  `;
}

function renderTabButton(tab, label, count) {
  return `
    <button
      type="button"
      class="tabbar__button ${state.activeTab === tab ? "is-active" : ""}"
      data-action="set-tab"
      data-tab="${tab}"
    >
      <span class="tabbar__label">${escapeHtml(label)}</span>
      ${count ? `<span class="tabbar__count">${count}</span>` : ""}
    </button>
  `;
}

function renderCalendarScreen() {
  const myFlights = getUserFlights(state, "me");
  const selectedDate =
    state.selectedDate ||
    (myFlights[0] ? myFlights[0].date : "") ||
    `${state.currentMonth}-01`;
  const selectedFlights = getFlightsForDate(state, "me", selectedDate);
  const selectedStatuses = getStatusesForDate(state, "me", selectedDate);
  const dayMatches = getDaySwapMatches(state, "me", selectedDate).filter(function (candidate) {
    return candidate.validation.eligible;
  });
  const nextFlight = myFlights.find(function (flight) {
    return flight.date >= toIsoDate(new Date());
  }) || myFlights[0];
  const metrics = getScheduleMetrics(state, "me");

  return `
    <section class="screen-stack">
      <div class="summary-strip">
        <article class="summary-card">
          <span class="summary-card__label">Next duty</span>
          <strong>${escapeHtml(nextFlight ? nextFlight.flightNumber : "No duty")}</strong>
          <span>${escapeHtml(nextFlight ? formatShortDate(nextFlight.date) : "Roster clear")}</span>
        </article>
        <article class="summary-card">
          <span class="summary-card__label">Open fits</span>
          <strong>${metrics.matchingOpenTime}</strong>
          <span>ready to request</span>
        </article>
        <article class="summary-card">
          <span class="summary-card__label">Pending</span>
          <strong>${metrics.pendingIncoming}</strong>
          <span>waiting on you</span>
        </article>
      </div>

      <section class="panel-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Monthly View</p>
            <h3>${escapeHtml(formatMonth(state.currentMonth))}</h3>
          </div>
          <div class="toolbar">
            <button type="button" class="button button--ghost button--small" data-action="prev-month">Prev</button>
            <button type="button" class="button button--ghost button--small" data-action="jump-today">Today</button>
            <button type="button" class="button button--ghost button--small" data-action="next-month">Next</button>
          </div>
        </div>
        ${renderCalendarGrid(selectedDate)}
      </section>

      <section class="panel-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Daily View</p>
            <h3>${escapeHtml(formatDate(selectedDate))}</h3>
          </div>
          ${renderStatusPill("info", selectedFlights.length ? `${selectedFlights.length} duty` : "Off day")}
        </div>
        <div class="daily-stack">
          ${
            selectedStatuses.length
              ? `<div class="pill-row">${selectedStatuses
                  .map(function (status) {
                    return renderStatusPill("off", status.label);
                  })
                  .join("")}</div>`
              : ""
          }
          ${
            selectedFlights.length
              ? selectedFlights.map(renderRosterFlightCard).join("")
              : `<article class="offday-card">
                  <strong>${selectedStatuses.length ? escapeHtml(selectedStatuses[0].label) : "No assigned flight"}</strong>
                  <p>${selectedStatuses.length ? "Your roster is protected for this day." : "Tap another day in the calendar to inspect duty details."}</p>
                </article>`
          }
          <div class="match-strip">
            <div class="subhead">
              <h4>Best swap matches</h4>
              <span>${dayMatches.length}</span>
            </div>
            ${
              dayMatches.length
                ? dayMatches
                    .slice(0, 3)
                    .map(function (candidate) {
                      return renderMiniMatch(candidate);
                    })
                    .join("")
                : `<p class="muted">No same-day legal swaps are available for this date yet.</p>`
            }
          </div>
        </div>
      </section>
    </section>
  `;
}

function renderCalendarGrid(selectedDate) {
  const [year, month] = state.currentMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells = [];
  const totalCells = Math.ceil((offset + totalDays) / 7) * 7;

  for (let index = 0; index < totalCells; index += 1) {
    const date = new Date(year, month - 1, 1 - offset + index);
    const isoDate = toIsoDate(date);
    const inMonth = date.getMonth() === month - 1;
    const flights = getFlightsForDate(state, "me", isoDate);
    const statuses = getStatusesForDate(state, "me", isoDate);
    const swapReady = flights.some(function (flight) {
      return getFlightSwapSummary(flight.id).count > 0;
    });
    let tone = "empty";
    let note = "";

    if (statuses.length) {
      tone = "off";
      note = statuses[0].label;
    }
    if (flights.length) {
      tone = swapReady ? "swap" : "assigned";
      note = flights[0].flightNumber;
    }

    cells.push(`
      <button
        type="button"
        class="calendar-day ${inMonth ? "" : "is-muted"} ${selectedDate === isoDate ? "is-selected" : ""} tone-${tone}"
        data-action="select-date"
        data-date="${isoDate}"
      >
        <span class="calendar-day__number">${date.getDate()}</span>
        <span class="calendar-day__note">${escapeHtml(note || "")}</span>
        ${flights.length ? `<span class="calendar-day__count">${flights.length}</span>` : ""}
      </button>
    `);
  }

  return `
    <div class="calendar-weekdays">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        .map(function (label) {
          return `<span>${label}</span>`;
        })
        .join("")}
    </div>
    <div class="calendar-grid">${cells.join("")}</div>
  `;
}

function renderRosterFlightCard(flight) {
  const summary = getFlightSwapSummary(flight.id);
  const tone = summary.count ? "swap" : "assigned";
  return `
    <article
      class="roster-card tone-${tone}"
      data-action="open-flight-sheet"
      data-flight-id="${flight.id}"
      data-context="calendar"
      data-swipe-flight-id="${flight.id}"
    >
      <div class="roster-card__head">
        <div>
          <strong>${escapeHtml(flight.flightNumber)}</strong>
          <p>${escapeHtml(flight.departureAirport)} to ${escapeHtml(flight.arrivalAirport)}</p>
        </div>
        ${renderStatusPill(summary.count ? "available" : "assigned", summary.count ? `${summary.count} swaps` : "Assigned")}
      </div>
      <div class="roster-card__meta">
        <span>${escapeHtml(formatTimeRange(flight.departureTime, flight.arrivalTime))}</span>
        <span>Duty ${escapeHtml(formatHours(flight.totalDutyHours))}</span>
        <span>${escapeHtml(flight.aircraftType)}</span>
      </div>
      <div class="roster-card__footer">
        <span>Swipe left to offer</span>
        <button type="button" class="button button--ghost button--small" data-action="open-flight-sheet" data-flight-id="${flight.id}" data-context="calendar">
          View
        </button>
      </div>
    </article>
  `;
}

function renderMiniMatch(candidate) {
  return `
    <article class="mini-match">
      <div>
        <strong>${escapeHtml(candidate.flight.flightNumber)}</strong>
        <p>${escapeHtml(candidate.owner.name)} · ${escapeHtml(candidate.flight.departureAirport)} to ${escapeHtml(candidate.flight.arrivalAirport)}</p>
      </div>
      <button
        type="button"
        class="button button--ghost button--small"
        data-action="open-flight-sheet"
        data-flight-id="${candidate.flight.id}"
        data-context="swap-target"
      >
        Review
      </button>
    </article>
  `;
}

function renderMarketplaceScreen() {
  const visiblePosts = filterMarketplacePosts(getVisibleMarketplacePosts(state, "me"));
  const hiddenCount = countHiddenMarketplacePosts(state, "me");

  return `
    <section class="screen-stack">
      <section class="panel-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Open Time Feed</p>
            <h3>Marketplace</h3>
          </div>
          ${renderStatusPill("info", `${hiddenCount} hidden`)}
        </div>
        <form class="filter-row" data-form="marketplace-filters">
          <label class="filter-chip">
            <span>Date</span>
            <input type="date" name="date" value="${escapeHtml(state.marketplaceFilters.date)}" />
          </label>
          <label class="filter-chip">
            <span>Base</span>
            <select name="base">
              ${renderOptions(["all"].concat(BASE_OPTIONS), state.marketplaceFilters.base, {
                all: "All bases",
              })}
            </select>
          </label>
          <label class="filter-chip">
            <span>Fleet</span>
            <select name="fleet">
              ${renderOptions(["all"].concat(FLEET_OPTIONS), state.marketplaceFilters.fleet, {
                all: "All fleets",
              })}
            </select>
          </label>
          <label class="filter-chip">
            <span>Time</span>
            <select name="departureWindow">
              ${renderOptions(["all", "morning", "afternoon", "evening"], state.marketplaceFilters.departureWindow, {
                all: "Any",
                morning: "Morning",
                afternoon: "Afternoon",
                evening: "Evening",
              })}
            </select>
          </label>
          <label class="filter-chip">
            <span>Trip</span>
            <select name="tripLength">
              ${renderOptions(["all", "same-day", "layover"], state.marketplaceFilters.tripLength, {
                all: "Any",
                "same-day": "Same-day",
                layover: "Layover",
              })}
            </select>
          </label>
          <label class="filter-chip filter-chip--search">
            <span>Layover</span>
            <input
              type="text"
              name="layover"
              placeholder="Search airport"
              value="${escapeHtml(state.marketplaceFilters.layover)}"
            />
          </label>
          <button
            type="button"
            class="button button--ghost button--small filter-reset"
            data-action="clear-marketplace-filters"
          >
            Clear
          </button>
        </form>
      </section>

      <section class="screen-stack">
        ${
          visiblePosts.length
            ? visiblePosts.map(renderMarketplaceCard).join("")
            : `<article class="panel-card empty-card">
                <strong>No flights match the current filter set.</strong>
                <p>Widen the feed by changing base, fleet, or time-of-day filters.</p>
              </article>`
        }
      </section>
    </section>
  `;
}

function renderMarketplaceCard(entry) {
  const post = entry.post;
  const flight = entry.flight;
  const owner = entry.owner;
  const validation = entry.validation;
  const badgeTone = validation.eligible ? "available" : "conflict";

  return `
    <article
      class="market-card"
      data-action="open-flight-sheet"
      data-flight-id="${flight.id}"
      data-context="marketplace"
    >
      <div class="market-card__head">
        <div>
          <strong>${escapeHtml(flight.flightNumber)}</strong>
          <p>${escapeHtml(flight.departureAirport)} to ${escapeHtml(flight.arrivalAirport)} · ${escapeHtml(
            flight.position === "Flight Attendant" ? "FA" : flight.position,
          )}</p>
        </div>
        ${renderStatusPill(badgeTone, validation.eligible ? "Available" : "Conflict")}
      </div>
      <div class="market-card__meta">
        <span>${escapeHtml(formatShortDate(flight.date))}</span>
        <span>${escapeHtml(formatTimeRange(flight.departureTime, flight.arrivalTime))}</span>
        <span>${escapeHtml(flight.aircraftType)}</span>
        <span>${escapeHtml(owner.name)}</span>
      </div>
      <p class="market-card__note">
        ${
          validation.eligible
            ? "Clean request path. This pickup keeps your roster legal."
            : escapeHtml(validation.errors[0] || "Blocked by policy.")
        }
      </p>
      <div class="market-card__footer">
        <button
          type="button"
          class="button button--ghost button--small"
          data-action="open-flight-sheet"
          data-flight-id="${flight.id}"
          data-context="marketplace"
        >
          View details
        </button>
        <button
          type="button"
          class="button button--primary button--small"
          data-action="take-open-time"
          data-post-id="${post.id}"
          ${validation.eligible ? "" : "disabled"}
        >
          Request This Flight
        </button>
      </div>
    </article>
  `;
}

function renderRequestsScreen() {
  const incoming = getIncomingRequestRows();
  const outgoing = getOutgoingRequestRows();
  const completed = getCompletedRequests();
  let rows = incoming;

  if (state.requestsTab === "outgoing") {
    rows = outgoing;
  }
  if (state.requestsTab === "completed") {
    rows = completed;
  }

  return `
    <section class="screen-stack">
      <section class="panel-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Request Center</p>
            <h3>Incoming · Outgoing · Completed</h3>
          </div>
        </div>
        <div class="segment-control">
          ${renderSegment("incoming", "Incoming", incoming.length)}
          ${renderSegment("outgoing", "Outgoing", outgoing.length)}
          ${renderSegment("completed", "Completed", completed.length)}
        </div>
      </section>
      ${
        rows.length
          ? rows
              .map(function (row) {
                return state.requestsTab === "completed"
                  ? renderCompletedRequestCard(row)
                  : renderPendingRequestCard(row, state.requestsTab);
              })
              .join("")
          : `<article class="panel-card empty-card">
              <strong>No ${escapeHtml(state.requestsTab)} requests right now.</strong>
              <p>Your request traffic will show up here with side-by-side flight comparisons.</p>
            </article>`
      }
    </section>
  `;
}

function renderSegment(tab, label, count) {
  return `
    <button
      type="button"
      class="segment-control__button ${state.requestsTab === tab ? "is-active" : ""}"
      data-action="set-requests-tab"
      data-tab="${tab}"
    >
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function renderPendingRequestCard(entry, mode) {
  const yourFlight = mode === "incoming" ? entry.targetFlight : entry.requesterFlight;
  const theirFlight = mode === "incoming" ? entry.requesterFlight : entry.targetFlight;
  const otherParty = mode === "incoming" ? entry.requester : entry.targetUser;
  const validation = entry.validation || { eligible: true, errors: [], requesterErrors: [], targetErrors: [] };
  const messages = summarizeValidation(validation);

  return `
    <article class="panel-card request-card">
      <div class="request-card__header">
        <div>
          <p class="eyebrow">${mode === "incoming" ? "Incoming" : "Outgoing"}</p>
          <h3>${escapeHtml(otherParty.name)}</h3>
        </div>
        ${renderStatusPill("pending", "Pending")}
      </div>
      <div class="request-compare">
        ${renderFlightComparison("Your Flight", yourFlight)}
        ${renderFlightComparison("Their Flight", theirFlight)}
      </div>
      <p class="request-note">${escapeHtml(entry.request.notes || "Swap request generated from the quick flow.")}</p>
      ${
        messages.length && mode === "incoming"
          ? `<div class="warning-inline">${escapeHtml(messages[0])}</div>`
          : ""
      }
      <div class="request-actions">
        ${
          mode === "incoming"
            ? `
              <button type="button" class="button button--primary" data-action="accept-swap" data-request-id="${entry.request.id}">
                Accept
              </button>
              <button type="button" class="button button--ghost" data-action="decline-swap" data-request-id="${entry.request.id}">
                Decline
              </button>
            `
            : renderStatusPill("info", "Awaiting response")
        }
      </div>
    </article>
  `;
}

function renderCompletedRequestCard(entry) {
  const yourFlight =
    entry.request.requesterId === "me" ? entry.requesterFlight : entry.targetFlight;
  const theirFlight =
    entry.request.requesterId === "me" ? entry.targetFlight : entry.requesterFlight;
  const tone = entry.request.status === "accepted" ? "available" : "conflict";
  const label = entry.request.status === "accepted" ? "Accepted" : "Rejected";

  return `
    <article class="panel-card request-card">
      <div class="request-card__header">
        <div>
          <p class="eyebrow">Completed</p>
          <h3>${escapeHtml(formatShortDate(entry.request.createdAt.slice(0, 10)))}</h3>
        </div>
        ${renderStatusPill(tone, label)}
      </div>
      <div class="request-compare">
        ${renderFlightComparison("Your Flight", yourFlight)}
        ${renderFlightComparison("Their Flight", theirFlight)}
      </div>
    </article>
  `;
}

function renderFlightComparison(label, flight) {
  return `
    <div class="compare-card">
      <span class="compare-card__label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(flight.flightNumber)}</strong>
      <p>${escapeHtml(flight.departureAirport)} to ${escapeHtml(flight.arrivalAirport)}</p>
      <span>${escapeHtml(formatShortDate(flight.date))}</span>
      <span>${escapeHtml(formatTimeRange(flight.departureTime, flight.arrivalTime))}</span>
    </div>
  `;
}

function renderProfileScreen() {
  const me = getCurrentUser();
  const notifications = getNotifications(state).slice(0, 3);
  const metrics = getScheduleMetrics(state, "me");

  return `
    <section class="screen-stack">
      <section class="panel-card profile-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Crew Profile</p>
            <h3>${escapeHtml(me.name)}</h3>
          </div>
          ${renderStatusPill("info", state.theme === "dark" ? "Dark mode" : "Light mode")}
        </div>
        <div class="profile-grid">
          ${renderProfileStat("Role", me.role)}
          ${renderProfileStat("Position", me.position)}
          ${renderProfileStat("Base", me.base)}
          ${renderProfileStat("Fleet", me.fleet)}
          ${renderProfileStat("Airline", me.airline)}
          ${renderProfileStat("Pending", String(metrics.pendingIncoming))}
        </div>
        <div class="profile-actions">
          <button type="button" class="button button--ghost" data-action="toggle-theme">
            Switch to ${state.theme === "dark" ? "light" : "dark"} mode
          </button>
          <button type="button" class="button button--ghost" data-action="reset-demo">
            Reset demo
          </button>
        </div>
      </section>

      <section class="panel-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Alerts</p>
            <h3>Recent notifications</h3>
          </div>
        </div>
        ${
          notifications.length
            ? notifications
                .map(function (notification) {
                  return `
                    <article class="alert-row ${notification.read ? "" : "is-unread"}">
                      <div>
                        <strong>${escapeHtml(notification.title)}</strong>
                        <p>${escapeHtml(notification.body)}</p>
                      </div>
                      <span>${escapeHtml(formatShortDate(notification.createdAt.slice(0, 10)))}</span>
                    </article>
                  `;
                })
                .join("")
            : `<p class="muted">No alerts yet.</p>`
        }
      </section>

      <section class="panel-card">
        <div class="panel-head panel-head--tight">
          <div>
            <p class="eyebrow">Demo Admin</p>
            <h3>Legality settings</h3>
          </div>
        </div>
        <form class="rules-grid" data-form="rules-form">
          <label class="field">
            <span>Min Rest</span>
            <input type="number" min="8" max="24" step="1" name="minRestHours" value="${state.rules.minRestHours}" />
          </label>
          <label class="field">
            <span>Duty / Day</span>
            <input type="number" min="8" max="18" step="1" name="maxDutyHoursPerDay" value="${state.rules.maxDutyHoursPerDay}" />
          </label>
          <label class="field">
            <span>7-Day Hours</span>
            <input type="number" min="20" max="60" step="1" name="maxFlightHours7Days" value="${state.rules.maxFlightHours7Days}" />
          </label>
          <label class="field">
            <span>28-Day Hours</span>
            <input type="number" min="60" max="120" step="1" name="maxFlightHours28Days" value="${state.rules.maxFlightHours28Days}" />
          </label>
          <label class="field">
            <span>Consecutive Days</span>
            <input type="number" min="3" max="10" step="1" name="maxConsecutiveDays" value="${state.rules.maxConsecutiveDays}" />
          </label>
          <label class="field">
            <span>Days Off</span>
            <input type="number" min="4" max="15" step="1" name="minDaysOffPerMonth" value="${state.rules.minDaysOffPerMonth}" />
          </label>
          <label class="toggle-row">
            <input type="checkbox" name="allowCrossBase" ${state.rules.allowCrossBase ? "checked" : ""} />
            <span>Allow cross-base swaps</span>
          </label>
        </form>
      </section>
    </section>
  `;
}

function renderProfileStat(label, value) {
  return `
    <article class="profile-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderStatusPill(tone, label) {
  return `<span class="status-pill tone-${tone}">${escapeHtml(label)}</span>`;
}

function renderBottomSheet() {
  if (!state.sheet) {
    return "";
  }
  if (state.sheet.type === "flight") {
    return renderFlightSheet();
  }
  if (state.sheet.type === "swap-flow") {
    return renderSwapSheet();
  }
  return "";
}

function renderFlightSheet() {
  const flight = getFlightById(state, state.sheet.flightId);
  if (!flight) {
    return "";
  }
  const owner = getUserById(state, flight.assignedUserId);
  const isMine = flight.assignedUserId === "me";
  const marketPost = findOpenPostByFlightId(flight.id);
  const openValidation = marketPost ? validateOpenTimeClaim(state, "me", flight.id) : null;
  const swapSummary = isMine ? getRecommendedSwaps(state, "me", flight.id).filter(function (candidate) {
    return candidate.validation.eligible;
  }) : [];
  const subtitle = `${flight.departureAirport} to ${flight.arrivalAirport}`;
  const statusTone = isMine
    ? "assigned"
    : marketPost
    ? openValidation && openValidation.eligible
      ? "available"
      : "conflict"
    : "pending";
  const statusLabel = isMine
    ? "Assigned"
    : marketPost
    ? openValidation && openValidation.eligible
      ? "Open Time"
      : "Conflict"
    : "Swap Target";
  const layoverSummary = flight.tripLengthDays > 1
    ? `${flight.tripLengthDays} days · ${flight.layoverLocation || "Layover"}`
    : "Turn"
  ;

  return `
    <section class="sheet-layer">
      <button type="button" class="sheet-backdrop" data-action="close-sheet" aria-label="Close"></button>
      <div class="sheet-panel">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <p class="eyebrow">Flight Detail</p>
            <h3>${escapeHtml(flight.flightNumber)}</h3>
            <p class="sheet-subtitle">${escapeHtml(subtitle)} · ${escapeHtml(formatShortDate(flight.date))}</p>
          </div>
          ${renderStatusPill(statusTone, statusLabel)}
        </div>
        <div class="sheet-grid">
          <div class="sheet-metric">
            <span>Flight</span>
            <strong>${escapeHtml(formatTimeRange(flight.departureTime, flight.arrivalTime))}</strong>
          </div>
          <div class="sheet-metric">
            <span>Duty</span>
            <strong>${escapeHtml(formatTimeRange(flight.dutyStart, flight.dutyEnd))}</strong>
          </div>
          <div class="sheet-metric">
            <span>Total duty</span>
            <strong>${escapeHtml(formatHours(flight.totalDutyHours))}</strong>
          </div>
          <div class="sheet-metric">
            <span>Rest after duty</span>
            <strong>${escapeHtml(formatHours(flight.requiredRestHoursAfterDuty))}</strong>
          </div>
          <div class="sheet-metric">
            <span>Aircraft</span>
            <strong>${escapeHtml(flight.aircraftType)}</strong>
          </div>
          <div class="sheet-metric">
            <span>Trip</span>
            <strong>${escapeHtml(layoverSummary)}</strong>
          </div>
          <div class="sheet-metric">
            <span>Crew</span>
            <strong>${escapeHtml(owner ? owner.name : "Unavailable")}</strong>
          </div>
          <div class="sheet-metric">
            <span>Status</span>
            <strong>${escapeHtml(statusLabel)}</strong>
          </div>
        </div>
        ${
          !isMine && marketPost && openValidation && !openValidation.eligible
            ? `<div class="warning-inline">${escapeHtml(openValidation.errors[0] || "Blocked by legality checks.")}</div>`
            : ""
        }
        ${
          !isMine && !marketPost
            ? `<div class="inline-note">This duty is not in open time. Use a direct swap request instead.</div>`
            : ""
        }
        ${
          isMine && swapSummary.length
            ? `<div class="sheet-recs">
                <div class="subhead">
                  <h4>Best swap matches</h4>
                  <span>${swapSummary.length}</span>
                </div>
                ${swapSummary
                  .slice(0, 3)
                  .map(function (candidate) {
                    return `<button
                      type="button"
                      class="quick-row"
                      data-action="open-flight-sheet"
                      data-flight-id="${candidate.flight.id}"
                      data-context="swap-target"
                    >
                      <strong>${escapeHtml(candidate.flight.flightNumber)}</strong>
                      <span>${escapeHtml(candidate.owner.name)} · ${escapeHtml(formatShortDate(candidate.flight.date))}</span>
                    </button>`;
                  })
                  .join("")}
              </div>`
            : ""
        }
        <div class="sheet-actions">
          ${
            isMine
              ? `
                <button type="button" class="button button--primary" data-action="offer-open-time" data-flight-id="${flight.id}">
                  Offer This Flight
                </button>
                <button type="button" class="button button--ghost" data-action="open-swap-flow" data-flight-id="${flight.id}" data-mode="choose-target">
                  Request Swap
                </button>
              `
              : `
                ${
                  marketPost
                    ? `<button
                        type="button"
                        class="button button--primary"
                        data-action="take-open-time"
                        data-post-id="${marketPost.id}"
                        ${openValidation.eligible ? "" : "disabled"}
                      >
                        Request This Flight
                      </button>`
                    : ""
                }
                <button type="button" class="button button--ghost" data-action="open-swap-flow" data-flight-id="${flight.id}" data-mode="choose-mine">
                  Request Swap
                </button>
              `
          }
        </div>
      </div>
    </section>
  `;
}

function renderSwapSheet() {
  const sheet = state.sheet;
  if (!sheet || sheet.type !== "swap-flow") {
    return "";
  }

  let title = "Choose a flight";
  let intro = "Select the flight to use in this request.";
  let cards = [];
  let selectedKey = sheet.selectedFlightId || "";
  let canSend = false;

  if (sheet.mode === "choose-target") {
    const sourceFlight = getFlightById(state, sheet.flightId);
    const candidates = getSwapCandidates(state, "me", sheet.flightId)
      .filter(function (candidate) {
        return candidate.validation.eligible;
      })
      .slice(0, 8);

    title = "Request Swap";
    intro = sourceFlight
      ? `Choose the flight you want in exchange for ${sourceFlight.flightNumber}.`
      : intro;
    cards = candidates.map(function (candidate) {
      return {
        id: candidate.flight.id,
        title: candidate.flight.flightNumber,
        subtitle: `${candidate.owner.name} · ${formatShortDate(candidate.flight.date)}`,
        detail: `${candidate.flight.departureAirport} to ${candidate.flight.arrivalAirport} · ${formatTimeRange(
          candidate.flight.departureTime,
          candidate.flight.arrivalTime,
        )}`,
        tone: "available",
      };
    });
    canSend = !!selectedKey;
  } else {
    const targetFlight = getFlightById(state, sheet.flightId);
    const myChoices = getUserFlights(state, "me")
      .map(function (flight) {
        return {
          flight: flight,
          validation: validateSwapProposal(state, "me", flight.id, sheet.flightId),
        };
      })
      .filter(function (entry) {
        return entry.validation.eligible;
      })
      .slice(0, 8);

    title = "Request Swap";
    intro = targetFlight
      ? `Pick one of your flights to offer for ${targetFlight.flightNumber}.`
      : intro;
    cards = myChoices.map(function (entry) {
      return {
        id: entry.flight.id,
        title: entry.flight.flightNumber,
        subtitle: `${formatShortDate(entry.flight.date)} · ${entry.flight.aircraftType}`,
        detail: `${entry.flight.departureAirport} to ${entry.flight.arrivalAirport} · ${formatTimeRange(
          entry.flight.departureTime,
          entry.flight.arrivalTime,
        )}`,
        tone: "assigned",
      };
    });
    canSend = !!selectedKey;
  }

  return `
    <section class="sheet-layer">
      <button type="button" class="sheet-backdrop" data-action="close-sheet" aria-label="Close"></button>
      <div class="sheet-panel">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <p class="eyebrow">Swap Flow</p>
            <h3>${escapeHtml(title)}</h3>
            <p class="sheet-subtitle">${escapeHtml(intro)}</p>
          </div>
          ${renderStatusPill("pending", "3 taps max")}
        </div>
        <div class="choice-stack">
          ${
            cards.length
              ? cards
                  .map(function (card) {
                    return `
                      <button
                        type="button"
                        class="choice-card ${selectedKey === card.id ? "is-selected" : ""}"
                        data-action="select-swap-choice"
                        data-flight-id="${card.id}"
                      >
                        <div>
                          <strong>${escapeHtml(card.title)}</strong>
                          <p>${escapeHtml(card.subtitle)}</p>
                        </div>
                        <span>${escapeHtml(card.detail)}</span>
                      </button>
                    `;
                  })
                  .join("")
              : `<article class="empty-card">
                  <strong>No legal choices available.</strong>
                  <p>The rule engine could not find a compliant swap path for this request.</p>
                </article>`
          }
        </div>
        <div class="sheet-actions">
          <button type="button" class="button button--ghost" data-action="close-sheet">Cancel</button>
          <button type="button" class="button button--primary" data-action="send-swap-request" ${canSend ? "" : "disabled"}>
            Send Request
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderOptions(values, selectedValue, labels) {
  return values
    .map(function (value) {
      return `<option value="${escapeHtml(value)}" ${
        value === selectedValue ? "selected" : ""
      }>${escapeHtml((labels && labels[value]) || value)}</option>`;
    })
    .join("");
}

function syncOnboardingVisibility() {
  const roleSelect = root.querySelector('form[data-form="onboarding"] select[name="role"]');
  const positionField = root.querySelector("[data-position-field]");
  const positionSelect = root.querySelector('form[data-form="onboarding"] select[name="position"]');
  if (!roleSelect || !positionField || !positionSelect) {
    return;
  }
  const isPilot = roleSelect.value === "Pilot";
  positionField.classList.toggle("is-hidden", !isPilot);
  positionSelect.disabled = !isPilot;
}

function handleClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "dismiss-banner") {
    state.banner = null;
    commit();
    return;
  }

  if (action === "set-tab") {
    state.activeTab = actionTarget.dataset.tab;
    state.sheet = null;
    commit();
    return;
  }

  if (action === "set-requests-tab") {
    state.requestsTab = actionTarget.dataset.tab;
    commit();
    return;
  }

  if (action === "clear-marketplace-filters") {
    state.marketplaceFilters = createBlankState().marketplaceFilters;
    commit();
    return;
  }

  if (action === "select-date") {
    state.selectedDate = actionTarget.dataset.date;
    commit();
    return;
  }

  if (action === "prev-month" || action === "next-month") {
    state.currentMonth = shiftMonth(state.currentMonth, action === "next-month" ? 1 : -1);
    state.selectedDate = `${state.currentMonth}-01`;
    commit();
    return;
  }

  if (action === "jump-today") {
    const today = new Date();
    state.currentMonth = toIsoDate(today).slice(0, 7);
    state.selectedDate = toIsoDate(today);
    commit();
    return;
  }

  if (action === "open-flight-sheet") {
    state.sheet = {
      type: "flight",
      flightId: actionTarget.dataset.flightId,
      context: actionTarget.dataset.context || "calendar",
    };
    commit();
    return;
  }

  if (action === "close-sheet") {
    state.sheet = null;
    commit();
    return;
  }

  if (action === "open-swap-flow") {
    state.sheet = {
      type: "swap-flow",
      flightId: actionTarget.dataset.flightId,
      mode: actionTarget.dataset.mode,
      selectedFlightId: "",
    };
    commit();
    return;
  }

  if (action === "select-swap-choice") {
    if (state.sheet && state.sheet.type === "swap-flow") {
      state.sheet.selectedFlightId = actionTarget.dataset.flightId;
      commit();
    }
    return;
  }

  if (action === "send-swap-request") {
    handleSendSwapRequest();
    return;
  }

  if (action === "offer-open-time") {
    handleOfferOpenTime(actionTarget.dataset.flightId);
    return;
  }

  if (action === "take-open-time") {
    handleTakeOpenTime(actionTarget.dataset.postId);
    return;
  }

  if (action === "accept-swap") {
    handleAcceptSwap(actionTarget.dataset.requestId);
    return;
  }

  if (action === "decline-swap") {
    handleDeclineSwap(actionTarget.dataset.requestId);
    return;
  }

  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    commit();
    return;
  }

  if (action === "reset-demo") {
    window.localStorage.removeItem(STORAGE_KEY);
    state = createBlankState();
    render();
  }
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) {
    return;
  }

  event.preventDefault();

  if (form.dataset.form === "onboarding") {
    const values = new FormData(form);
    const role = String(values.get("role") || "Pilot");
    state = createSeedState({
      role: role,
      position: role === "Pilot" ? String(values.get("position") || "Captain") : "Flight Attendant",
      base: String(values.get("base") || "POS"),
      fleet: String(values.get("fleet") || "A320"),
      airline: String(values.get("airline") || "Caribbean Connect"),
      employeeId: String(values.get("employeeId") || ""),
      email: String(values.get("email") || ""),
    });
    commit();
  }
}

function handleChange(event) {
  const form = event.target.closest("form[data-form]");

  if (form && form.dataset.form === "onboarding") {
    syncOnboardingVisibility();
    return;
  }

  if (!form || !state.profile) {
    return;
  }

  if (form.dataset.form === "marketplace-filters") {
    state.marketplaceFilters = {
      ...state.marketplaceFilters,
      [event.target.name]: event.target.value,
    };
    commit();
    return;
  }

  if (form.dataset.form === "rules-form") {
    state.rules = {
      ...state.rules,
      minRestHours: Number(form.elements.minRestHours.value),
      maxDutyHoursPerDay: Number(form.elements.maxDutyHoursPerDay.value),
      maxFlightHours7Days: Number(form.elements.maxFlightHours7Days.value),
      maxFlightHours28Days: Number(form.elements.maxFlightHours28Days.value),
      maxConsecutiveDays: Number(form.elements.maxConsecutiveDays.value),
      minDaysOffPerMonth: Number(form.elements.minDaysOffPerMonth.value),
      allowCrossBase: form.elements.allowCrossBase.checked,
    };
    setBanner("info", "Rule settings updated. The roster and swap suggestions were recalculated.");
    commit();
  }
}

function handleTouchStart(event) {
  const card = event.target.closest("[data-swipe-flight-id]");
  if (!card || !event.changedTouches || !event.changedTouches.length) {
    return;
  }
  swipeState = {
    flightId: card.dataset.swipeFlightId,
    startX: event.changedTouches[0].clientX,
  };
}

function handleTouchEnd(event) {
  if (!swipeState || !event.changedTouches || !event.changedTouches.length) {
    return;
  }
  const deltaX = event.changedTouches[0].clientX - swipeState.startX;
  const flightId = swipeState.flightId;
  swipeState = null;

  if (deltaX < -70) {
    handleOfferOpenTime(flightId, true);
  }
}

function handleOfferOpenTime(flightId, fromSwipe) {
  const flight = getFlightById(state, flightId);
  if (!flight) {
    return;
  }
  if (isFlightOffered(state, flightId)) {
    setBanner("info", `${flight.flightNumber} is already listed in open time.`);
    commit();
    return;
  }

  state.openTimePosts.unshift({
    id: `ot-${Date.now()}`,
    flightId: flightId,
    postedByUserId: "me",
    status: "open",
    bids: [],
    postedAt: nowLocalDateTime(),
  });

  addAudit("Open time posted", `You released ${flight.flightNumber} to the marketplace.`);
  addNotification("system", "Flight posted", `${flight.flightNumber} is now in open time.`, flightId);
  state.sheet = null;
  setBanner("success", fromSwipe ? `${flight.flightNumber} offered with a quick swipe.` : `${flight.flightNumber} was added to open time.`);
  commit();
}

function handleTakeOpenTime(postId) {
  const post = state.openTimePosts.find(function (item) {
    return item.id === postId;
  });
  if (!post) {
    return;
  }

  const flight = getFlightById(state, post.flightId);
  const owner = flight ? getUserById(state, flight.assignedUserId) : null;
  const validation = validateOpenTimeClaim(state, "me", post.flightId);

  if (!flight || !owner) {
    setBanner("conflict", "This open-time listing is no longer available.");
    commit();
    return;
  }

  if (!validation.eligible) {
    setBanner("conflict", summarizeValidation(validation).join(" "));
    commit();
    return;
  }

  const existingBid = post.bids.find(function (bid) {
    return bid.bidderId === "me";
  });
  if (existingBid) {
    setBanner("info", "You already requested this flight.");
    commit();
    return;
  }

  post.bids.push({
    id: `bid-${Date.now()}`,
    bidderId: "me",
    requestedAt: nowLocalDateTime(),
    status: post.bids.length ? "pending" : "accepted",
  });

  if (post.bids.length === 1) {
    flight.assignedUserId = "me";
    post.status = "filled";
    addAudit("Open time awarded", `You picked up ${flight.flightNumber} from ${owner.name}.`);
    addNotification("market_match", "Flight awarded", `${flight.flightNumber} was added to your roster.`, post.id);
    setBanner("success", `${flight.flightNumber} passed legality checks and is now on your schedule.`);
  } else {
    addAudit("Open time requested", `You requested ${flight.flightNumber}.`);
    addNotification("market_match", "Request pending", `${flight.flightNumber} now has multiple bids.`, post.id);
    setBanner("info", `Your request for ${flight.flightNumber} is pending ranking.`);
  }

  ensureSelectedFlight();
  state.sheet = null;
  commit();
}

function handleSendSwapRequest() {
  if (!state.sheet || state.sheet.type !== "swap-flow" || !state.sheet.selectedFlightId) {
    return;
  }

  let sourceFlightId = "";
  let targetFlightId = "";

  if (state.sheet.mode === "choose-target") {
    sourceFlightId = state.sheet.flightId;
    targetFlightId = state.sheet.selectedFlightId;
  } else {
    sourceFlightId = state.sheet.selectedFlightId;
    targetFlightId = state.sheet.flightId;
  }

  submitSwapRequest(sourceFlightId, targetFlightId);
}

function submitSwapRequest(sourceFlightId, targetFlightId) {
  const sourceFlight = getFlightById(state, sourceFlightId);
  const targetFlight = getFlightById(state, targetFlightId);
  const targetUser = targetFlight ? getUserById(state, targetFlight.assignedUserId) : null;
  const validation = validateSwapProposal(state, "me", sourceFlightId, targetFlightId);

  if (!sourceFlight || !targetFlight || !targetUser) {
    setBanner("conflict", "The selected swap path is no longer available.");
    commit();
    return;
  }

  if (!validation.eligible) {
    setBanner("conflict", summarizeValidation(validation).join(" "));
    commit();
    return;
  }

  const duplicate = state.swapRequests.find(function (request) {
    return (
      request.status === "pending" &&
      request.requesterId === "me" &&
      request.requesterFlightId === sourceFlightId &&
      request.targetFlightId === targetFlightId
    );
  });

  if (duplicate) {
    setBanner("info", "That swap request is already pending.");
    commit();
    return;
  }

  state.swapRequests.unshift({
    id: `sr-${Date.now()}`,
    requesterId: "me",
    targetUserId: targetUser.id,
    requesterFlightId: sourceFlightId,
    targetFlightId: targetFlightId,
    status: "pending",
    createdAt: nowLocalDateTime(),
    notes: "Sent from the quick swap flow.",
  });

  addAudit("Swap request sent", `You proposed ${sourceFlight.flightNumber} for ${targetFlight.flightNumber}.`);
  addNotification("swap_request", "Swap request sent", `${sourceFlight.flightNumber} is waiting on ${targetUser.name}.`, targetFlightId);
  state.sheet = null;
  setBanner("success", `Swap request sent for ${sourceFlight.flightNumber} and ${targetFlight.flightNumber}.`);
  commit();
}

function handleAcceptSwap(requestId) {
  const request = state.swapRequests.find(function (entry) {
    return entry.id === requestId;
  });
  if (!request) {
    return;
  }

  const validation = validateSwapProposal(
    state,
    request.requesterId,
    request.requesterFlightId,
    request.targetFlightId,
  );

  if (!validation.eligible) {
    setBanner("conflict", summarizeValidation(validation).join(" "));
    commit();
    return;
  }

  const requesterFlight = getFlightById(state, request.requesterFlightId);
  const targetFlight = getFlightById(state, request.targetFlightId);
  const requester = getUserById(state, request.requesterId);
  if (!requesterFlight || !targetFlight || !requester) {
    setBanner("conflict", "Swap data became unavailable.");
    commit();
    return;
  }

  const requesterOwnerId = requesterFlight.assignedUserId;
  const targetOwnerId = targetFlight.assignedUserId;
  requesterFlight.assignedUserId = targetOwnerId;
  targetFlight.assignedUserId = requesterOwnerId;
  request.status = "accepted";

  addAudit("Swap approved", `${requester.name} exchanged ${requesterFlight.flightNumber} with your ${targetFlight.flightNumber}.`);
  addNotification("swap_request", "Swap approved", `${requesterFlight.flightNumber} and ${targetFlight.flightNumber} were exchanged.`, request.id);
  setBanner("success", "Swap approved and revalidated successfully.");
  commit();
}

function handleDeclineSwap(requestId) {
  const request = state.swapRequests.find(function (entry) {
    return entry.id === requestId;
  });
  if (!request) {
    return;
  }
  request.status = "rejected";
  addAudit("Swap declined", "You declined a pending swap request.");
  addNotification("swap_request", "Swap declined", "The original flights remain unchanged.", request.id);
  setBanner("info", "Swap request declined.");
  commit();
}
})();
