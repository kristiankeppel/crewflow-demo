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

const STORAGE_KEY = "crewflow-demo-state-v1";
const root = document.getElementById("app");

const formatters = {
  month: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }),
  weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }),
  fullDate: new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }),
  shortDate: new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }),
  time: new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }),
};

let state = loadState();

root.addEventListener("click", handleClick);
root.addEventListener("submit", handleSubmit);
root.addEventListener("input", handleInput);
root.addEventListener("change", handleChange);

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
    };
  } catch (error) {
    return blank;
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  root.innerHTML = state.profile ? renderDashboard() : renderOnboarding();
  syncOnboardingVisibility();
}

function commit() {
  saveState();
  render();
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
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  const hours = String(current.getHours()).padStart(2, "0");
  const minutes = String(current.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
  const value = new Date(year, month - 1 + offset, 1);
  return toIsoDate(value).slice(0, 7);
}

function startOfWeek(dateString) {
  const source = new Date(`${dateString}T12:00`);
  const day = source.getDay();
  const normalized = day === 0 ? -6 : 1 - day;
  source.setDate(source.getDate() + normalized);
  return source;
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

function addNotification(type, title, body, relatedId = "") {
  state.notifications.unshift({
    id: `n-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type,
    title,
    body,
    relatedId,
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

function createStatusPill(tone, label) {
  return `<span class="status-pill status-pill--${tone}">${escapeHtml(label)}</span>`;
}

function formatDate(dateString) {
  return formatters.fullDate.format(new Date(`${dateString}T12:00`));
}

function formatMonth(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return formatters.month.format(new Date(year, month - 1, 1));
}

function formatShortDate(dateString) {
  return formatters.shortDate.format(new Date(`${dateString}T12:00`));
}

function formatTimeRange(startValue, endValue) {
  return `${formatters.time.format(parseDate(startValue))} - ${formatters.time.format(
    parseDate(endValue),
  )}`;
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

  return posts.filter(({ flight }) => {
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

function renderOnboarding() {
  const defaults = createDefaultProfile();

  return `
    <section class="card landing-card">
      <div class="landing-copy">
        <p class="eyebrow">Crew onboarding</p>
        <h2>Set up a legal roster view in under a minute.</h2>
        <p>
          This demo starts with a verified crew profile, loads a sample month,
          and turns on the legality engine for every open-time and swap action.
        </p>
        <div class="landing-metrics">
          <div class="mini-stat">
            <strong>Zero</strong>
            <span>illegal swaps can pass approval</span>
          </div>
          <div class="mini-stat">
            <strong>&lt; 60s</strong>
            <span>to request a swap from the dashboard</span>
          </div>
          <div class="mini-stat">
            <strong>Web + Mobile</strong>
            <span>responsive cockpit-style experience</span>
          </div>
        </div>
      </div>
      <form class="panel-form onboarding-form" data-form="onboarding">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Profile</p>
            <h3>Build your crew identity</h3>
          </div>
          <p class="panel-note">Email verification is captured here and company verification is ready to extend later.</p>
        </div>
        <label class="field">
          <span>Role</span>
          <select name="role">
            ${ROLE_OPTIONS.map(
              (role) =>
                `<option value="${role}" ${
                  role === defaults.role ? "selected" : ""
                }>${escapeHtml(role)}</option>`,
            ).join("")}
          </select>
        </label>
        <label class="field" data-position-field>
          <span>Pilot position</span>
          <select name="position">
            ${PILOT_POSITIONS.map(
              (position) =>
                `<option value="${position}" ${
                  position === defaults.position ? "selected" : ""
                }>${escapeHtml(position)}</option>`,
            ).join("")}
          </select>
        </label>
        <label class="field">
          <span>Base</span>
          <select name="base">
            ${BASE_OPTIONS.map(
              (base) =>
                `<option value="${base}" ${
                  base === defaults.base ? "selected" : ""
                }>${escapeHtml(base)}</option>`,
            ).join("")}
          </select>
        </label>
        <label class="field">
          <span>Aircraft type / fleet</span>
          <select name="fleet">
            ${FLEET_OPTIONS.map(
              (fleet) =>
                `<option value="${fleet}" ${
                  fleet === defaults.fleet ? "selected" : ""
                }>${escapeHtml(fleet)}</option>`,
            ).join("")}
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
        <button class="button button--primary" type="submit">Load demo roster</button>
      </form>
    </section>
  `;
}

function renderDashboard() {
  ensureSelectedFlight();

  const me = getCurrentUser();
  const myFlights = getUserFlights(state, "me");
  const metrics = getScheduleMetrics(state, "me");
  const selectedFlight = getSelectedFlight() || myFlights[0];
  const selectedDate =
    state.selectedDate ||
    (myFlights[0] ? myFlights[0].date : "") ||
    state.currentMonth;
  const selectedDateFlights = getFlightsForDate(state, "me", selectedDate);
  const selectedStatuses = getStatusesForDate(state, "me", selectedDate);
  const allMarketplacePosts = getVisibleMarketplacePosts(state, "me");
  const marketplacePosts = filterMarketplacePosts(allMarketplacePosts);
  const hiddenCount = countHiddenMarketplacePosts(state, "me");
  const swapCandidates = selectedFlight
    ? getSwapCandidates(state, "me", selectedFlight.id).slice(0, 8)
    : [];
  const recommendedSwaps = selectedFlight
    ? getRecommendedSwaps(state, "me", selectedFlight.id)
    : [];
  const incomingRequests = getIncomingSwapRequests(state, "me");
  const outgoingRequests = getOutgoingSwapRequests(state, "me");
  const dayMatches = getDaySwapMatches(state, "me", selectedDate).slice(0, 5);
  const notifications = getNotifications(state);
  const cabinLabel = me.role === "Pilot" ? me.position : "Cabin Crew";

  return `
    ${renderBanner()}
    <section class="card hero-card">
      <div class="hero-copy">
        <p class="eyebrow">Active profile</p>
        <h2>${escapeHtml(me.role)} ${escapeHtml(cabinLabel)} · ${escapeHtml(me.base)}</h2>
        <p>
          ${escapeHtml(me.airline)} roster loaded for ${escapeHtml(me.fleet)} operations. Swaps, open time pickup requests, and approvals are being screened against rest, duty, flight time, base, and qualification rules.
        </p>
        <div class="hero-chips">
          ${createStatusPill("info", me.role)}
          ${createStatusPill("info", cabinLabel)}
          ${createStatusPill("info", me.base)}
          ${createStatusPill("info", me.fleet)}
          ${createStatusPill(metrics.legal ? "available" : "conflict", metrics.legal ? "Compliant" : "Review needed")}
        </div>
      </div>
      <div class="hero-actions">
        <button class="button button--primary" type="button" data-action="jump-next-flight">Jump to next duty</button>
        <button class="button button--ghost" type="button" data-action="reset-demo">Start over</button>
      </div>
    </section>

    <section class="stats-row">
      ${renderStatCard("Assigned duties", String(metrics.dutyCount), "Your active monthly flying roster")}
      ${renderStatCard("Open time fits", String(metrics.matchingOpenTime), "Qualified duties ready to request")}
      ${renderStatCard("Pending approvals", String(metrics.pendingIncoming), "Requests waiting on your decision")}
      ${renderStatCard("Rule set", state.rules.allowCrossBase ? "Cross-base on" : "Base locked", "Policy controls recalculate instantly")}
    </section>

    <div class="dashboard-grid">
      <section class="card card--wide">
        ${renderCalendarCard(selectedDate)}
      </section>
      <aside class="card card--sidebar">
        ${renderDayDetailCard(selectedDate, selectedDateFlights, selectedStatuses, dayMatches)}
      </aside>
      <section class="card card--wide">
        ${renderMarketplaceCard(marketplacePosts, hiddenCount)}
      </section>
      <section class="card card--sidebar">
        ${renderSwapCenter(selectedFlight, swapCandidates, recommendedSwaps)}
      </section>
      <section class="card card--half">
        ${renderRequestsCard(incomingRequests, outgoingRequests)}
      </section>
      <section class="card card--half">
        ${renderNotificationCard(notifications)}
      </section>
      <section class="card card--half">
        ${renderRulesCard()}
      </section>
      <section class="card card--half">
        ${renderAuditCard()}
      </section>
    </div>
  `;
}

function renderBanner() {
  if (!state.banner) {
    return "";
  }

  return `
    <section class="banner banner--${escapeHtml(state.banner.type)}">
      <p>${escapeHtml(state.banner.text)}</p>
      <button type="button" class="button button--ghost button--small" data-action="dismiss-banner">Dismiss</button>
    </section>
  `;
}

function renderStatCard(label, value, detail) {
  return `
    <article class="card stat-card">
      <span class="stat-card__label">${escapeHtml(label)}</span>
      <strong class="stat-card__value">${escapeHtml(value)}</strong>
      <p class="stat-card__detail">${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderCalendarCard(selectedDate) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Schedule</p>
        <h3>${escapeHtml(formatMonth(state.currentMonth))}</h3>
      </div>
      <div class="section-actions">
        <button type="button" class="button button--ghost button--small" data-action="prev-month">Prev</button>
        <button type="button" class="button button--ghost button--small" data-action="next-month">Next</button>
        <button type="button" class="button ${
          state.calendarMode === "month" ? "button--primary" : "button--ghost"
        } button--small" data-action="toggle-calendar" data-mode="month">Month</button>
        <button type="button" class="button ${
          state.calendarMode === "week" ? "button--primary" : "button--ghost"
        } button--small" data-action="toggle-calendar" data-mode="week">Week</button>
      </div>
    </div>
    <div class="legend">
      ${createStatusPill("available", "Available")}
      ${createStatusPill("pending", "Pending")}
      ${createStatusPill("conflict", "Conflict")}
      ${createStatusPill("info", "Reserve / Off")}
    </div>
    ${
      state.calendarMode === "month"
        ? renderMonthGrid(selectedDate)
        : renderWeekStrip(selectedDate)
    }
  `;
}

function renderMonthGrid(selectedDate) {
  const [year, month] = state.currentMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const firstDayIndex = (firstDay.getDay() + 6) % 7;
  const totalDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDayIndex + totalDays) / 7) * 7;
  const cells = [];

  for (let index = 0; index < totalCells; index += 1) {
    const cellDate = new Date(year, month - 1, 1 - firstDayIndex + index);
    const isoDate = toIsoDate(cellDate);
    const inMonth = cellDate.getMonth() === month - 1;
    cells.push(renderCalendarCell(isoDate, inMonth, selectedDate));
  }

  return `
    <div class="calendar-grid calendar-grid--header">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        .map((label) => `<span>${label}</span>`)
        .join("")}
    </div>
    <div class="calendar-grid">${cells.join("")}</div>
  `;
}

function renderWeekStrip(selectedDate) {
  const start = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    const isoDate = toIsoDate(value);
    const flights = getFlightsForDate(state, "me", isoDate);
    const statuses = getStatusesForDate(state, "me", isoDate);
    return `
      <button type="button" class="week-day ${
        isoDate === selectedDate ? "is-selected" : ""
      }" data-action="select-date" data-date="${isoDate}">
        <div>
          <span class="week-day__weekday">${escapeHtml(
            formatters.weekday.format(value),
          )}</span>
          <strong>${escapeHtml(formatShortDate(isoDate))}</strong>
        </div>
        <div class="week-day__summary">
          ${
            flights.length
              ? `<span>${flights.length} duty${flights.length > 1 ? "ies" : ""}</span>`
              : `<span>No flights</span>`
          }
          ${
            statuses.length
              ? `<span>${escapeHtml(statuses.map((status) => status.label).join(" · "))}</span>`
              : ""
          }
        </div>
      </button>
    `;
  });

  return `<div class="week-strip">${days.join("")}</div>`;
}

function renderCalendarCell(date, inMonth, selectedDate) {
  const flights = getFlightsForDate(state, "me", date);
  const statuses = getStatusesForDate(state, "me", date);
  const isToday = date === toIsoDate(new Date());
  const isSelected = date === selectedDate;
  const preview = [...flights.map((flight) => flight.flightNumber), ...statuses.map((status) => status.label)].slice(0, 2);
  const extraCount = flights.length + statuses.length - preview.length;

  return `
    <button type="button" class="calendar-cell ${inMonth ? "" : "is-muted"} ${
      isSelected ? "is-selected" : ""
    } ${isToday ? "is-today" : ""}" data-action="select-date" data-date="${date}">
      <div class="calendar-cell__top">
        <span class="calendar-cell__day">${new Date(`${date}T12:00`).getDate()}</span>
        ${
          flights.length
            ? `<span class="calendar-cell__count">${flights.length}</span>`
            : ""
        }
      </div>
      <div class="calendar-cell__events">
        ${preview
          .map((item) =>
            `<span class="event-pill ${
              item === "Reserve" || item === "Day Off" ? "event-pill--info" : "event-pill--flight"
            }">${escapeHtml(item)}</span>`,
          )
          .join("")}
        ${extraCount > 0 ? `<span class="event-pill event-pill--more">+${extraCount}</span>` : ""}
      </div>
    </button>
  `;
}

function renderDayDetailCard(selectedDate, flights, statuses, dayMatches) {
  const selectedFlight = getSelectedFlight();
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Day details</p>
        <h3>${escapeHtml(formatDate(selectedDate))}</h3>
      </div>
    </div>
    <div class="stack">
      ${
        statuses.length
          ? `<div class="chip-row">${statuses
              .map((status) => createStatusPill("info", status.label))
              .join("")}</div>`
          : ""
      }
      ${
        flights.length
          ? flights.map((flight) => renderMyFlightCard(flight, selectedFlight)).join("")
          : `<div class="empty-state">
              <strong>No assigned flight duty</strong>
              <p>Open time and same-day swap suggestions still appear below if they fit your qualifications.</p>
            </div>`
      }
      <div class="subsection">
        <div class="subsection__head">
          <h4>Same-day swap opportunities</h4>
          <span>${dayMatches.length}</span>
        </div>
        ${
          dayMatches.length
            ? dayMatches
                .map((match) =>
                  renderMiniOpportunity(
                    `${match.flight.flightNumber} · ${match.owner.name}`,
                    `${match.flight.departureAirport} to ${match.flight.arrivalAirport} · ${formatTimeRange(
                      match.flight.departureTime,
                      match.flight.arrivalTime,
                    )}`,
                    match.validation.eligible ? "available" : "conflict",
                    match.validation.eligible
                      ? "Request swap"
                      : summarizeValidation(match.validation)[0] || "Conflict",
                  ),
                )
                .join("")
            : `<p class="muted">No same-day matches for the selected day yet.</p>`
        }
      </div>
    </div>
  `;
}

function renderMyFlightCard(flight, selectedFlight) {
  const offered = isFlightOffered(state, flight.id);
  return `
    <article class="flight-card ${
      selectedFlight && selectedFlight.id === flight.id ? "is-selected" : ""
    }">
      <div class="flight-card__head">
        <div>
          <strong>${escapeHtml(flight.flightNumber)}</strong>
          <p>${escapeHtml(flight.departureAirport)} to ${escapeHtml(flight.arrivalAirport)}</p>
        </div>
        <div class="chip-row">
          ${createStatusPill("info", flight.aircraftType)}
          ${createStatusPill("info", flight.base)}
        </div>
      </div>
      <div class="flight-card__meta">
        <span>Flight ${formatTimeRange(flight.departureTime, flight.arrivalTime)}</span>
        <span>Duty ${formatTimeRange(flight.dutyStart, flight.dutyEnd)}</span>
        <span>Duty ${formatHours(flight.totalDutyHours)}</span>
        <span>Rest after ${flight.requiredRestHoursAfterDuty}h</span>
        <span>${flight.tripLengthDays > 1 ? `Layover ${escapeHtml(flight.layoverLocation)}` : "Same-day trip"}</span>
      </div>
      <div class="flight-card__actions">
        <button type="button" class="button button--ghost button--small" data-action="select-my-flight" data-flight-id="${flight.id}">
          Use for swap search
        </button>
        <button
          type="button"
          class="button button--primary button--small"
          data-action="offer-open-time"
          data-flight-id="${flight.id}"
          ${offered ? "disabled" : ""}
        >
          ${offered ? "Listed in open time" : "Offer to open time"}
        </button>
      </div>
    </article>
  `;
}

function renderMiniOpportunity(title, detail, tone, summary) {
  return `
    <article class="mini-opportunity">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
      <div class="mini-opportunity__side">
        ${createStatusPill(tone, tone === "available" ? "Available" : "Conflict")}
        <span>${escapeHtml(summary)}</span>
      </div>
    </article>
  `;
}

function renderMarketplaceCard(posts, hiddenCount) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Open time marketplace</p>
        <h3>Filtered by qualification and policy</h3>
      </div>
      <span class="section-note">${hiddenCount} restricted posting${hiddenCount === 1 ? "" : "s"} hidden by airline/role permissions</span>
    </div>
    <form class="filter-form" data-form="marketplace-filters">
      <label class="field">
        <span>Date</span>
        <input type="date" name="date" value="${escapeHtml(state.marketplaceFilters.date)}" />
      </label>
      <label class="field">
        <span>Base</span>
        <select name="base">
          ${renderOptions(["all", ...BASE_OPTIONS], state.marketplaceFilters.base, {
            all: "All bases",
          })}
        </select>
      </label>
      <label class="field">
        <span>Aircraft</span>
        <select name="fleet">
          ${renderOptions(["all", ...FLEET_OPTIONS], state.marketplaceFilters.fleet, {
            all: "All fleets",
          })}
        </select>
      </label>
      <label class="field">
        <span>Departure</span>
        <select name="departureWindow">
          ${renderOptions(
            ["all", "morning", "afternoon", "evening"],
            state.marketplaceFilters.departureWindow,
            {
              all: "All windows",
              morning: "Morning",
              afternoon: "Afternoon",
              evening: "Evening",
            },
          )}
        </select>
      </label>
      <label class="field">
        <span>Trip</span>
        <select name="tripLength">
          ${renderOptions(
            ["all", "same-day", "layover"],
            state.marketplaceFilters.tripLength,
            {
              all: "Any length",
              "same-day": "Same-day",
              layover: "Layover",
            },
          )}
        </select>
      </label>
      <label class="field">
        <span>Layover</span>
        <input type="text" name="layover" placeholder="Airport code" value="${escapeHtml(
          state.marketplaceFilters.layover,
        )}" />
      </label>
    </form>
    <div class="stack">
      ${
        posts.length
          ? posts.map((entry) => renderOpenTimeCard(entry)).join("")
          : `<div class="empty-state">
              <strong>No matching open time duties</strong>
              <p>Adjust the filters or change your rule settings to widen the recommendation pool.</p>
            </div>`
      }
    </div>
  `;
}

function renderOpenTimeCard({ post, flight, owner, validation }) {
  const isMine = owner.id === "me";
  const tone = isMine ? "pending" : validation.eligible ? "available" : "conflict";
  const message = isMine
    ? "Posted by you"
    : validation.eligible
      ? "Clear to request"
      : validation.errors[0] || "Blocked by policy";

  return `
    <article class="opportunity-card">
      <div class="opportunity-card__head">
        <div>
          <strong>${escapeHtml(flight.flightNumber)}</strong>
          <p>${escapeHtml(flight.departureAirport)} to ${escapeHtml(flight.arrivalAirport)}</p>
        </div>
        <div class="chip-row">
          ${createStatusPill(tone, tone === "available" ? "Available" : tone === "pending" ? "Listed" : "Conflict")}
          ${createStatusPill("info", flight.aircraftType)}
        </div>
      </div>
      <div class="opportunity-card__meta">
        <span>${escapeHtml(formatShortDate(flight.date))}</span>
        <span>Flight ${formatTimeRange(flight.departureTime, flight.arrivalTime)}</span>
        <span>Duty ${formatHours(flight.totalDutyHours)}</span>
        <span>${flight.tripLengthDays > 1 ? `Layover ${escapeHtml(flight.layoverLocation)}` : "Same-day trip"}</span>
        <span>Base ${escapeHtml(flight.base)}</span>
        <span>From ${escapeHtml(owner.name)}</span>
      </div>
      <p class="opportunity-card__note">${escapeHtml(message)}</p>
      ${
        !validation.eligible && !isMine
          ? `<ul class="message-list">${validation.errors
              .slice(0, 3)
              .map((error) => `<li>${escapeHtml(error)}</li>`)
              .join("")}</ul>`
          : ""
      }
      <div class="flight-card__actions">
        <button
          type="button"
          class="button button--primary button--small"
          data-action="take-open-time"
          data-post-id="${post.id}"
          ${validation.eligible && !isMine ? "" : "disabled"}
        >
          ${post.bids.length ? `Request to take (${post.bids.length} bid${post.bids.length > 1 ? "s" : ""})` : "Request to take"}
        </button>
      </div>
    </article>
  `;
}

function renderSwapCenter(selectedFlight, candidates, recommended) {
  const myFlights = getUserFlights(state, "me");

  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Swap center</p>
        <h3>One-tap swap proposals</h3>
      </div>
    </div>
    <div class="subsection">
      <div class="subsection__head">
        <h4>Your flights</h4>
        <span>${myFlights.length}</span>
      </div>
      <div class="selector-row">
        ${myFlights
          .map(
            (flight) => `
              <button
                type="button"
                class="selector-chip ${
                  selectedFlight && selectedFlight.id === flight.id ? "is-selected" : ""
                }"
                data-action="select-my-flight"
                data-flight-id="${flight.id}"
              >
                <strong>${escapeHtml(flight.flightNumber)}</strong>
                <span>${escapeHtml(formatShortDate(flight.date))}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
    ${
      selectedFlight
        ? `
        <div class="stack">
          <article class="flight-card flight-card--compact">
            <div class="flight-card__head">
              <div>
                <strong>Selected: ${escapeHtml(selectedFlight.flightNumber)}</strong>
                <p>${escapeHtml(selectedFlight.departureAirport)} to ${escapeHtml(
                    selectedFlight.arrivalAirport,
                  )} · ${escapeHtml(formatShortDate(selectedFlight.date))}</p>
              </div>
              ${createStatusPill("info", selectedFlight.aircraftType)}
            </div>
          </article>
          <div class="subsection">
            <div class="subsection__head">
              <h4>Recommended swaps</h4>
              <span>${recommended.length}</span>
            </div>
            ${
              recommended.length
                ? recommended
                    .map((candidate) =>
                      renderSwapCandidate(candidate, selectedFlight.id, true),
                    )
                    .join("")
                : `<p class="muted">No recommendations available for this duty yet.</p>`
            }
          </div>
          <div class="subsection">
            <div class="subsection__head">
              <h4>All candidates</h4>
              <span>${candidates.length}</span>
            </div>
            ${
              candidates.length
                ? candidates.map((candidate) => renderSwapCandidate(candidate, selectedFlight.id)).join("")
                : `<p class="muted">No swap candidates available for the selected flight.</p>`
            }
          </div>
        </div>
      `
        : `<div class="empty-state">
            <strong>Select one of your duties</strong>
            <p>The swap center will rank legal alternatives by timing and route similarity.</p>
          </div>`
    }
  `;
}

function renderSwapCandidate(candidate, selectedFlightId, compact = false) {
  const messages = summarizeValidation(candidate.validation);
  return `
    <article class="opportunity-card ${compact ? "opportunity-card--compact" : ""}">
      <div class="opportunity-card__head">
        <div>
          <strong>${escapeHtml(candidate.flight.flightNumber)}</strong>
          <p>${escapeHtml(candidate.owner.name)} · ${escapeHtml(candidate.owner.base)} · ${escapeHtml(
            candidate.owner.fleet,
          )}</p>
        </div>
        <div class="chip-row">
          ${createStatusPill(
            candidate.validation.eligible ? "available" : "conflict",
            candidate.validation.eligible ? "Legal" : "Blocked",
          )}
          ${createStatusPill("info", `Score ${Math.round(candidate.score)}`)}
        </div>
      </div>
      <div class="opportunity-card__meta">
        <span>${escapeHtml(formatShortDate(candidate.flight.date))}</span>
        <span>${escapeHtml(candidate.flight.departureAirport)} to ${escapeHtml(candidate.flight.arrivalAirport)}</span>
        <span>Flight ${formatTimeRange(candidate.flight.departureTime, candidate.flight.arrivalTime)}</span>
        <span>${candidate.flight.tripLengthDays > 1 ? `Layover ${escapeHtml(candidate.flight.layoverLocation)}` : "Same-day trip"}</span>
      </div>
      ${
        !candidate.validation.eligible
          ? `<ul class="message-list">${messages
              .slice(0, 3)
              .map((message) => `<li>${escapeHtml(message)}</li>`)
              .join("")}</ul>`
          : ""
      }
      <div class="flight-card__actions">
        <button
          type="button"
          class="button button--primary button--small"
          data-action="request-swap"
          data-flight-id="${candidate.flight.id}"
          data-selected-flight-id="${selectedFlightId}"
          ${candidate.validation.eligible ? "" : "disabled"}
        >
          Request swap
        </button>
      </div>
    </article>
  `;
}

function renderRequestsCard(incoming, outgoing) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Approvals</p>
        <h3>Incoming and outgoing requests</h3>
      </div>
    </div>
    <div class="subsection">
      <div class="subsection__head">
        <h4>Needs your response</h4>
        <span>${incoming.length}</span>
      </div>
      ${
        incoming.length
          ? incoming.map((entry) => renderIncomingRequest(entry)).join("")
          : `<p class="muted">No incoming requests right now.</p>`
      }
    </div>
    <div class="subsection">
      <div class="subsection__head">
        <h4>Sent by you</h4>
        <span>${outgoing.length}</span>
      </div>
      ${
        outgoing.length
          ? outgoing
              .map(
                (entry) => `
                  <article class="mini-opportunity">
                    <div>
                      <strong>${escapeHtml(entry.requesterFlight.flightNumber)} for ${escapeHtml(
                        entry.targetFlight.flightNumber,
                      )}</strong>
                      <p>${escapeHtml(entry.targetUser.name)} · awaiting response</p>
                    </div>
                    <div class="mini-opportunity__side">
                      ${createStatusPill("pending", "Pending")}
                    </div>
                  </article>
                `,
              )
              .join("")
          : `<p class="muted">You have not sent any swap requests yet.</p>`
      }
    </div>
  `;
}

function renderIncomingRequest(entry) {
  const messages = summarizeValidation(entry.validation);
  return `
    <article class="request-card">
      <div class="request-card__head">
        <div>
          <strong>${escapeHtml(entry.requester.name)}</strong>
          <p>${escapeHtml(entry.requesterFlight.flightNumber)} for ${escapeHtml(entry.targetFlight.flightNumber)}</p>
        </div>
        ${createStatusPill(
          entry.validation.eligible ? "available" : "conflict",
          entry.validation.eligible ? "Ready" : "Re-check needed",
        )}
      </div>
      <p class="request-card__detail">${escapeHtml(entry.request.notes || "Swap request awaiting action.")}</p>
      ${
        messages.length
          ? `<ul class="message-list">${messages
              .slice(0, 3)
              .map((message) => `<li>${escapeHtml(message)}</li>`)
              .join("")}</ul>`
          : ""
      }
      <div class="flight-card__actions">
        <button type="button" class="button button--primary button--small" data-action="accept-swap" data-request-id="${entry.request.id}">
          Accept
        </button>
        <button type="button" class="button button--ghost button--small" data-action="decline-swap" data-request-id="${entry.request.id}">
          Decline
        </button>
      </div>
    </article>
  `;
}

function renderNotificationCard(notifications) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Notifications</p>
        <h3>Live crew updates</h3>
      </div>
    </div>
    <div class="stack">
      ${
        notifications.length
          ? notifications
              .slice(0, 6)
              .map(
                (notification) => `
                  <article class="notification-item ${notification.read ? "" : "is-unread"}">
                    <div>
                      <strong>${escapeHtml(notification.title)}</strong>
                      <p>${escapeHtml(notification.body)}</p>
                    </div>
                    <div class="notification-item__side">
                      <span>${escapeHtml(formatShortDate(notification.createdAt.slice(0, 10)))}</span>
                      ${
                        notification.read
                          ? createStatusPill("info", "Read")
                          : `<button type="button" class="button button--ghost button--small" data-action="mark-notification-read" data-notification-id="${notification.id}">Mark read</button>`
                      }
                    </div>
                  </article>
                `,
              )
              .join("")
          : `<p class="muted">No notifications yet.</p>`
      }
    </div>
  `;
}

function renderRulesCard() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Rules</p>
        <h3>Legality & policy engine</h3>
      </div>
      <span class="section-note">Adjusting a rule instantly refreshes conflicts, recommendations, and approval outcomes.</span>
    </div>
    <form class="rule-form" data-form="rules-form">
      <label class="field">
        <span>Minimum rest (hours)</span>
        <input type="number" min="8" max="24" step="1" name="minRestHours" value="${state.rules.minRestHours}" />
      </label>
      <label class="field">
        <span>Max duty / day</span>
        <input type="number" min="8" max="18" step="1" name="maxDutyHoursPerDay" value="${state.rules.maxDutyHoursPerDay}" />
      </label>
      <label class="field">
        <span>Max flight hours / 7 days</span>
        <input type="number" min="20" max="60" step="1" name="maxFlightHours7Days" value="${state.rules.maxFlightHours7Days}" />
      </label>
      <label class="field">
        <span>Max flight hours / 28 days</span>
        <input type="number" min="60" max="120" step="1" name="maxFlightHours28Days" value="${state.rules.maxFlightHours28Days}" />
      </label>
      <label class="field">
        <span>Max consecutive days</span>
        <input type="number" min="3" max="10" step="1" name="maxConsecutiveDays" value="${state.rules.maxConsecutiveDays}" />
      </label>
      <label class="field">
        <span>Min days off / month</span>
        <input type="number" min="4" max="15" step="1" name="minDaysOffPerMonth" value="${state.rules.minDaysOffPerMonth}" />
      </label>
      <label class="toggle">
        <input type="checkbox" name="allowCrossBase" ${state.rules.allowCrossBase ? "checked" : ""} />
        <span>Allow cross-base trades</span>
      </label>
    </form>
  `;
}

function renderAuditCard() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Audit log</p>
        <h3>Every action is traceable</h3>
      </div>
    </div>
    <div class="stack">
      ${
        state.auditLog.length
          ? state.auditLog
              .slice(0, 8)
              .map(
                (entry) => `
                  <article class="log-item">
                    <div>
                      <strong>${escapeHtml(entry.action)}</strong>
                      <p>${escapeHtml(entry.detail)}</p>
                    </div>
                    <span>${escapeHtml(formatShortDate(entry.time.slice(0, 10)))}</span>
                  </article>
                `,
              )
              .join("")
          : `<p class="muted">Audit history will appear here.</p>`
      }
    </div>
  `;
}

function renderOptions(values, selectedValue, labels = {}) {
  return values
    .map(
      (value) => `
        <option value="${escapeHtml(value)}" ${
          value === selectedValue ? "selected" : ""
        }>
          ${escapeHtml(labels[value] || value)}
        </option>
      `,
    )
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

  const { action } = actionTarget.dataset;

  if (action === "select-date") {
    state.selectedDate = actionTarget.dataset.date;
    commit();
    return;
  }

  if (action === "toggle-calendar") {
    state.calendarMode = actionTarget.dataset.mode;
    commit();
    return;
  }

  if (action === "prev-month" || action === "next-month") {
    const direction = action === "next-month" ? 1 : -1;
    state.currentMonth = shiftMonth(state.currentMonth, direction);
    state.selectedDate = `${state.currentMonth}-01`;
    commit();
    return;
  }

  if (action === "dismiss-banner") {
    state.banner = null;
    commit();
    return;
  }

  if (action === "select-my-flight") {
    state.selectedMyFlightId = actionTarget.dataset.flightId;
    const selectedFlight = getSelectedFlight();
    if (selectedFlight) {
      state.selectedDate = selectedFlight.date;
    }
    commit();
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

  if (action === "request-swap") {
    handleRequestSwap(actionTarget.dataset.flightId);
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

  if (action === "mark-notification-read") {
    const notification = state.notifications.find(
      (item) => item.id === actionTarget.dataset.notificationId,
    );
    if (notification) {
      notification.read = true;
      commit();
    }
    return;
  }

  if (action === "reset-demo") {
    window.localStorage.removeItem(STORAGE_KEY);
    state = createBlankState();
    render();
    return;
  }

  if (action === "jump-next-flight") {
    const nextFlight =
      getUserFlights(state, "me").find((flight) => flight.date >= toIsoDate(new Date())) ||
      getUserFlights(state, "me")[0];
    if (nextFlight) {
      state.selectedMyFlightId = nextFlight.id;
      state.selectedDate = nextFlight.date;
      commit();
    }
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
    const role = values.get("role");
    const profile = {
      role,
      position:
        role === "Pilot"
          ? String(values.get("position") || "Captain")
          : "Flight Attendant",
      base: String(values.get("base") || "POS"),
      fleet: String(values.get("fleet") || "A320"),
      airline: String(values.get("airline") || "Caribbean Connect").trim(),
      employeeId: String(values.get("employeeId") || "").trim(),
      email: String(values.get("email") || "").trim(),
    };

    state = createSeedState(profile);
    commit();
  }
}

function handleInput(event) {
  const form = event.target.closest("form[data-form]");
  if (form && form.dataset.form === "onboarding") {
    syncOnboardingVisibility();
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
      [event.target.name]:
        event.target.type === "checkbox" ? event.target.checked : event.target.value,
    };
    commit();
  }

  if (form.dataset.form === "rules-form") {
    updateRulesFromForm(form);
  }
}

function updateRulesFromForm(form) {
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
  setBanner(
    "info",
    "Rule settings updated. All swaps and open-time matches have been recalculated.",
  );
  commit();
}

function handleOfferOpenTime(flightId) {
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
    flightId,
    postedByUserId: "me",
    status: "open",
    bids: [],
    postedAt: nowLocalDateTime(),
  });

  addAudit("Open time posted", `You released ${flight.flightNumber} to the marketplace.`);
  addNotification(
    "system",
    "Flight posted to open time",
    `${flight.flightNumber} is now available for qualified crew to request.`,
    flightId,
  );
  setBanner(
    "success",
    `${flight.flightNumber} was added to open time. Qualified crew can now request it.`,
  );
  commit();
}

function handleTakeOpenTime(postId) {
  const post = state.openTimePosts.find((item) => item.id === postId);
  if (!post) {
    return;
  }

  const flight = getFlightById(state, post.flightId);
  const owner = flight ? getUserById(state, flight.assignedUserId) : null;
  const validation = validateOpenTimeClaim(state, "me", post.flightId);

  if (!flight || !owner) {
    setBanner("conflict", "This open time posting is no longer available.");
    commit();
    return;
  }

  if (!validation.eligible) {
    setBanner("conflict", summarizeValidation(validation).join(" "));
    commit();
    return;
  }

  const existingBid = post.bids.find((bid) => bid.bidderId === "me");
  if (existingBid) {
    setBanner("info", "You already requested this flight.");
    commit();
    return;
  }

  const bid = {
    id: `bid-${Date.now()}`,
    bidderId: "me",
    requestedAt: nowLocalDateTime(),
    status: post.bids.length ? "pending" : "accepted",
  };

  post.bids.push(bid);

  if (post.bids.length === 1) {
    flight.assignedUserId = "me";
    post.status = "filled";
    addAudit(
      "Open time awarded",
      `You picked up ${flight.flightNumber} from ${owner.name}.`,
    );
    addNotification(
      "market_match",
      "Open time confirmed",
      `${flight.flightNumber} was assigned to your roster after a legality check.`,
      post.id,
    );
    setBanner(
      "success",
      `${flight.flightNumber} was added to your schedule and passed all legality checks.`,
    );
  } else {
    addAudit("Open time requested", `You placed a pickup request for ${flight.flightNumber}.`);
    addNotification(
      "market_match",
      "Open time request sent",
      `${flight.flightNumber} now has multiple bids. Your request is pending ranking.`,
      post.id,
    );
    setBanner(
      "info",
      `Your request for ${flight.flightNumber} is pending because other bids already exist.`,
    );
  }

  ensureSelectedFlight();
  commit();
}

function handleRequestSwap(targetFlightId) {
  const selectedFlight = getSelectedFlight();
  if (!selectedFlight) {
    setBanner("conflict", "Choose one of your flights before sending a swap request.");
    commit();
    return;
  }

  const targetFlight = getFlightById(state, targetFlightId);
  const targetUser = targetFlight ? getUserById(state, targetFlight.assignedUserId) : null;
  const validation = validateSwapProposal(state, "me", selectedFlight.id, targetFlightId);

  if (!targetFlight || !targetUser) {
    setBanner("conflict", "Swap target is no longer available.");
    commit();
    return;
  }

  if (!validation.eligible) {
    setBanner("conflict", summarizeValidation(validation).join(" "));
    commit();
    return;
  }

  const duplicate = state.swapRequests.find(
    (request) =>
      request.status === "pending" &&
      request.requesterId === "me" &&
      request.requesterFlightId === selectedFlight.id &&
      request.targetFlightId === targetFlightId,
  );
  if (duplicate) {
    setBanner("info", "That swap request is already pending.");
    commit();
    return;
  }

  state.swapRequests.unshift({
    id: `sr-${Date.now()}`,
    requesterId: "me",
    targetUserId: targetUser.id,
    requesterFlightId: selectedFlight.id,
    targetFlightId,
    status: "pending",
    createdAt: nowLocalDateTime(),
    notes: "Generated from the swap center.",
  });

  addAudit(
    "Swap request sent",
    `You proposed ${selectedFlight.flightNumber} for ${targetFlight.flightNumber}.`,
  );
  addNotification(
    "swap_request",
    "Swap request submitted",
    `${selectedFlight.flightNumber} is waiting on ${targetUser.name} to respond.`,
    targetFlightId,
  );
  setBanner(
    "success",
    `Swap request sent for ${selectedFlight.flightNumber} and ${targetFlight.flightNumber}.`,
  );
  commit();
}

function handleAcceptSwap(requestId) {
  const request = state.swapRequests.find((entry) => entry.id === requestId);
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
    setBanner("conflict", "Swap data became unavailable before approval.");
    commit();
    return;
  }

  const requesterId = requesterFlight.assignedUserId;
  const targetUserId = targetFlight.assignedUserId;
  requesterFlight.assignedUserId = targetUserId;
  targetFlight.assignedUserId = requesterId;
  request.status = "accepted";

  state.notifications.forEach((notification) => {
    if (notification.relatedId === request.id) {
      notification.read = true;
    }
  });

  addAudit(
    "Swap approved",
    `${requester.name} exchanged ${requesterFlight.flightNumber} with your ${targetFlight.flightNumber}.`,
  );
  addNotification(
    "swap_request",
    "Swap approved",
    `${requesterFlight.flightNumber} and ${targetFlight.flightNumber} were exchanged after legality re-validation.`,
    request.id,
  );
  ensureSelectedFlight();
  setBanner(
    "success",
    `Swap approved. ${requesterFlight.flightNumber} and ${targetFlight.flightNumber} were exchanged successfully.`,
  );
  commit();
}

function handleDeclineSwap(requestId) {
  const request = state.swapRequests.find((entry) => entry.id === requestId);
  if (!request) {
    return;
  }

  const targetFlight = getFlightById(state, request.targetFlightId);

  request.status = "rejected";
  state.notifications.forEach((notification) => {
    if (notification.relatedId === request.id) {
      notification.read = true;
    }
  });

  addAudit(
    "Swap declined",
    `You declined a pending request for ${
      targetFlight ? targetFlight.flightNumber : "the selected duty"
    }.`,
  );
  addNotification(
    "swap_request",
    "Swap declined",
    "A pending swap request was declined and the original rosters remain unchanged.",
    request.id,
  );
  setBanner("info", "Swap request declined.");
  commit();
}
})();
