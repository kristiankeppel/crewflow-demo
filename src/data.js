const ROLE_OPTIONS = ["Pilot", "Flight Attendant"];
const PILOT_POSITIONS = ["Captain", "First Officer"];
const BASE_OPTIONS = ["POS", "JFK", "LHR", "MIA", "YYZ", "BGI"];
const FLEET_OPTIONS = ["A320", "737", "ATR"];

const DEFAULT_RULES = {
  minRestHours: 12,
  maxDutyHoursPerDay: 14,
  maxFlightHours7Days: 40,
  maxFlightHours28Days: 100,
  maxConsecutiveDays: 6,
  minDaysOffPerMonth: 8,
  allowCrossBase: false,
};

const NAME_BANK = {
  captain: ["Maya Lewis", "Andre King", "Naomi Hart", "Darius Webb"],
  firstOfficer: ["Lina Shah", "Jonah Price", "Evan Brooks", "Tariq Bell"],
  flightAttendant: [
    "Arianna Cole",
    "Sienna Ford",
    "Micah Ross",
    "Nadia Clarke",
  ],
};

const ROUTE_LIBRARY = {
  POS: [
    { departure: "POS", arrival: "MIA", departureTime: "08:10", arrivalTime: "12:00", tripLengthDays: 1 },
    { departure: "POS", arrival: "JFK", departureTime: "07:30", arrivalTime: "13:00", tripLengthDays: 2, layoverLocation: "JFK" },
    { departure: "POS", arrival: "BGI", departureTime: "14:20", arrivalTime: "15:25", tripLengthDays: 1 },
    { departure: "POS", arrival: "GEO", departureTime: "16:10", arrivalTime: "17:20", tripLengthDays: 1 },
    { departure: "POS", arrival: "TAB", departureTime: "11:20", arrivalTime: "11:45", tripLengthDays: 1 },
  ],
  JFK: [
    { departure: "JFK", arrival: "MIA", departureTime: "09:15", arrivalTime: "12:35", tripLengthDays: 1 },
    { departure: "JFK", arrival: "LHR", departureTime: "18:40", arrivalTime: "06:30", tripLengthDays: 2, layoverLocation: "LHR" },
    { departure: "JFK", arrival: "POS", departureTime: "10:30", arrivalTime: "16:00", tripLengthDays: 1 },
    { departure: "JFK", arrival: "BOS", departureTime: "14:10", arrivalTime: "15:20", tripLengthDays: 1 },
  ],
  LHR: [
    { departure: "LHR", arrival: "JFK", departureTime: "10:45", arrivalTime: "13:10", tripLengthDays: 2, layoverLocation: "JFK" },
    { departure: "LHR", arrival: "AMS", departureTime: "12:30", arrivalTime: "14:05", tripLengthDays: 1 },
    { departure: "LHR", arrival: "CDG", departureTime: "16:00", arrivalTime: "18:20", tripLengthDays: 1 },
    { departure: "LHR", arrival: "POS", departureTime: "11:20", arrivalTime: "17:00", tripLengthDays: 2, layoverLocation: "POS" },
  ],
  MIA: [
    { departure: "MIA", arrival: "POS", departureTime: "07:50", arrivalTime: "11:35", tripLengthDays: 1 },
    { departure: "MIA", arrival: "JFK", departureTime: "13:20", arrivalTime: "16:20", tripLengthDays: 1 },
    { departure: "MIA", arrival: "BGI", departureTime: "15:30", arrivalTime: "19:15", tripLengthDays: 2, layoverLocation: "BGI" },
    { departure: "MIA", arrival: "YYZ", departureTime: "18:05", arrivalTime: "21:10", tripLengthDays: 1 },
  ],
  YYZ: [
    { departure: "YYZ", arrival: "JFK", departureTime: "08:00", arrivalTime: "09:35", tripLengthDays: 1 },
    { departure: "YYZ", arrival: "POS", departureTime: "10:20", arrivalTime: "15:20", tripLengthDays: 2, layoverLocation: "POS" },
    { departure: "YYZ", arrival: "LHR", departureTime: "18:45", arrivalTime: "06:35", tripLengthDays: 2, layoverLocation: "LHR" },
    { departure: "YYZ", arrival: "MIA", departureTime: "14:00", arrivalTime: "17:05", tripLengthDays: 1 },
  ],
  BGI: [
    { departure: "BGI", arrival: "POS", departureTime: "09:10", arrivalTime: "10:15", tripLengthDays: 1 },
    { departure: "BGI", arrival: "MIA", departureTime: "12:25", arrivalTime: "16:10", tripLengthDays: 1 },
    { departure: "BGI", arrival: "JFK", departureTime: "16:40", arrivalTime: "21:10", tripLengthDays: 2, layoverLocation: "JFK" },
  ],
};

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDateTime(date) {
  const isoDate = toIsoDate(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${isoDate}T${hours}:${minutes}`;
}

function buildDateTime(dateString, timeString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hours, minutes] = timeString.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function shiftTime(dateString, timeString, minutesDelta) {
  const value = buildDateTime(dateString, timeString);
  value.setMinutes(value.getMinutes() + minutesDelta);
  return toLocalDateTime(value);
}

function diffHours(startValue, endValue) {
  const start = typeof startValue === "string" ? new Date(startValue) : startValue;
  const end = typeof endValue === "string" ? new Date(endValue) : endValue;
  return Number(((end.getTime() - start.getTime()) / 36e5).toFixed(1));
}

function daysInMonth(referenceDate) {
  return new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0,
  ).getDate();
}

function dateAtOffset(monthStart, offset) {
  const limit = daysInMonth(monthStart);
  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    Math.min(offset, limit),
  );
}

function pickName(role, position, index) {
  if (role === "Pilot" && position === "Captain") {
    return NAME_BANK.captain[index % NAME_BANK.captain.length];
  }
  if (role === "Pilot") {
    return NAME_BANK.firstOfficer[index % NAME_BANK.firstOfficer.length];
  }
  return NAME_BANK.flightAttendant[index % NAME_BANK.flightAttendant.length];
}

function nextBase(base) {
  const index = BASE_OPTIONS.indexOf(base);
  return BASE_OPTIONS[(index + 1 + BASE_OPTIONS.length) % BASE_OPTIONS.length];
}

function nextFleet(fleet) {
  const index = FLEET_OPTIONS.indexOf(fleet);
  return FLEET_OPTIONS[(index + 1 + FLEET_OPTIONS.length) % FLEET_OPTIONS.length];
}

function sanitizeProfile(profile) {
  const normalizedRole = profile.role || "Pilot";
  return {
    name: profile.name || "You",
    role: normalizedRole,
    position:
      normalizedRole === "Pilot"
        ? profile.position || "Captain"
        : "Flight Attendant",
    base: profile.base || "POS",
    fleet: profile.fleet || "A320",
    airline: profile.airline || "Caribbean Connect",
    employeeId: profile.employeeId || "",
    email: profile.email || "crew@crewflow.demo",
  };
}

function createUser(id, baseProfile, overrides = {}) {
  return {
    id,
    name: overrides.name || pickName(baseProfile.role, baseProfile.position, Number(id.replace(/\D/g, "")) || 0),
    role: overrides.role || baseProfile.role,
    position:
      (overrides.role || baseProfile.role) === "Pilot"
        ? overrides.position || baseProfile.position
        : "Flight Attendant",
    base: overrides.base || baseProfile.base,
    fleet: overrides.fleet || baseProfile.fleet,
    airline: overrides.airline || baseProfile.airline,
    employeeId: overrides.employeeId || `${id.toUpperCase()}-ID`,
    email: overrides.email || `${id}@crewflow.demo`,
    seniority: overrides.seniority || 10,
  };
}

function routeForBase(base, index) {
  const routes = ROUTE_LIBRARY[base] || ROUTE_LIBRARY.POS;
  const route = routes[index % routes.length];
  return {
    ...route,
    departure: base,
  };
}

function createFlight({
  id,
  date,
  user,
  routeIndex,
  flightNumber,
  base,
  aircraftType,
  status = "assigned",
  departureTime,
  arrivalTime,
  tripLengthDays,
  layoverLocation,
}) {
  const route = routeForBase(base || user.base, routeIndex);
  const actualDepartureTime = departureTime || route.departureTime;
  const actualArrivalTime = arrivalTime || route.arrivalTime;
  const actualTripLength = tripLengthDays || route.tripLengthDays || 1;
  const actualLayover =
    actualTripLength > 1 ? layoverLocation || route.layoverLocation || route.arrival : "";

  const departureAt = buildDateTime(date, actualDepartureTime);
  const arrivalAt = buildDateTime(date, actualArrivalTime);
  if (arrivalAt <= departureAt) {
    arrivalAt.setDate(arrivalAt.getDate() + 1);
  }

  const dutyStart = shiftTime(date, actualDepartureTime, -60);
  const dutyEndDate = new Date(arrivalAt);
  dutyEndDate.setMinutes(dutyEndDate.getMinutes() + 45);

  return {
    id,
    date,
    flightNumber,
    departureAirport: route.departure,
    arrivalAirport: route.arrival,
    departureTime: toLocalDateTime(departureAt),
    arrivalTime: toLocalDateTime(arrivalAt),
    dutyStart,
    dutyEnd: toLocalDateTime(dutyEndDate),
    layoverLocation: actualLayover,
    tripLengthDays: actualTripLength,
    totalDutyHours: diffHours(dutyStart, toLocalDateTime(dutyEndDate)),
    blockHours: diffHours(toLocalDateTime(departureAt), toLocalDateTime(arrivalAt)),
    requiredRestHoursAfterDuty: DEFAULT_RULES.minRestHours,
    aircraftType: aircraftType || user.fleet,
    assignedUserId: user.id,
    role: user.role,
    position: user.position,
    base: base || user.base,
    airline: user.airline,
    status,
  };
}

function createDayStatus(id, userId, date, type) {
  return {
    id,
    userId,
    date,
    type,
    label: type === "reserve" ? "Reserve" : "Day Off",
  };
}

function createDefaultProfile() {
  return {
    role: "Pilot",
    position: "Captain",
    base: "POS",
    fleet: "A320",
    airline: "Caribbean Connect",
    employeeId: "",
    email: "crew@crewflow.demo",
  };
}

function createBlankState() {
  return {
    profile: null,
    users: [],
    flights: [],
    dayStatuses: [],
    openTimePosts: [],
    swapRequests: [],
    notifications: [],
    auditLog: [],
    rules: { ...DEFAULT_RULES },
    calendarMode: "month",
    currentMonth: "",
    selectedDate: "",
    selectedMyFlightId: "",
    marketplaceFilters: {
      date: "",
      base: "all",
      fleet: "all",
      departureWindow: "all",
      tripLength: "all",
      layover: "",
    },
    banner: null,
  };
}

function createSeedState(profile) {
  const cleanProfile = sanitizeProfile(profile);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const today = new Date();
  const selectedDate = toIsoDate(
    new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      Math.min(today.getDate(), daysInMonth(monthStart)),
    ),
  );

  const me = createUser("me", cleanProfile, {
    name: "You",
    employeeId: cleanProfile.employeeId || "DEMO-001",
    email: cleanProfile.email,
    seniority: 11,
  });
  const peerA = createUser("peer1", cleanProfile, { seniority: 18 });
  const peerB = createUser("peer2", cleanProfile, { seniority: 13 });
  const peerC = createUser("peer3", cleanProfile, { seniority: 9 });
  const crossBasePeer = createUser("peer4", cleanProfile, {
    base: nextBase(cleanProfile.base),
    seniority: 22,
  });
  const crossFleetPeer = createUser("peer5", cleanProfile, {
    fleet: nextFleet(cleanProfile.fleet),
    seniority: 7,
  });
  const positionMismatchPeer = createUser("peer6", cleanProfile, {
    position:
      cleanProfile.role === "Pilot"
        ? cleanProfile.position === "Captain"
          ? "First Officer"
          : "Captain"
        : "Flight Attendant",
    seniority: 15,
  });
  const otherAirlinePeer = createUser("peer7", cleanProfile, {
    airline: "Northern Skies",
    seniority: 16,
  });
  const hiddenRolePeer =
    cleanProfile.role === "Pilot"
      ? createUser("peer8", cleanProfile, {
          role: "Flight Attendant",
          position: "Flight Attendant",
          fleet: cleanProfile.fleet,
          seniority: 12,
        })
      : createUser("peer8", cleanProfile, {
          role: "Pilot",
          position: "Captain",
          seniority: 12,
        });

  const users = [
    me,
    peerA,
    peerB,
    peerC,
    crossBasePeer,
    crossFleetPeer,
    positionMismatchPeer,
    otherAirlinePeer,
    hiddenRolePeer,
  ];

  const myFlightSpecs = [
    { offset: 2, routeIndex: 0, flightNumber: "CC101" },
    { offset: 4, routeIndex: 2, flightNumber: "CC203" },
    { offset: 7, routeIndex: 1, flightNumber: "CC317" },
    { offset: 10, routeIndex: 4, flightNumber: "CC148" },
    { offset: 14, routeIndex: 0, flightNumber: "CC254" },
    { offset: 17, routeIndex: 2, flightNumber: "CC309" },
    {
      offset: 21,
      routeIndex: 3,
      flightNumber: "CC411",
      departureTime: "16:10",
      arrivalTime: "17:20",
    },
    { offset: 24, routeIndex: 0, flightNumber: "CC522" },
    { offset: 27, routeIndex: 1, flightNumber: "CC610" },
  ];

  const flights = [];
  myFlightSpecs.forEach((spec, index) => {
    flights.push(
      createFlight({
        id: `f-me-${index + 1}`,
        date: toIsoDate(dateAtOffset(monthStart, spec.offset)),
        user: me,
        routeIndex: spec.routeIndex,
        flightNumber: spec.flightNumber,
        departureTime: spec.departureTime,
        arrivalTime: spec.arrivalTime,
      }),
    );
  });

  const peerSpecs = [
    { user: peerA, offset: 4, routeIndex: 0, flightNumber: "CC183" },
    { user: peerA, offset: 11, routeIndex: 1, flightNumber: "CC295" },
    { user: peerA, offset: 19, routeIndex: 2, flightNumber: "CC334" },
    {
      user: peerA,
      offset: 24,
      routeIndex: 0,
      flightNumber: "CC544",
      departureTime: "09:10",
      arrivalTime: "12:55",
    },
    { user: peerB, offset: 7, routeIndex: 3, flightNumber: "CC321" },
    {
      user: peerB,
      offset: 14,
      routeIndex: 2,
      flightNumber: "CC402",
      departureTime: "13:50",
      arrivalTime: "14:55",
    },
    {
      user: peerB,
      offset: 21,
      routeIndex: 0,
      flightNumber: "CC488",
      departureTime: "08:35",
      arrivalTime: "12:25",
    },
    {
      user: peerB,
      offset: 22,
      routeIndex: 4,
      flightNumber: "CC490",
      departureTime: "05:40",
      arrivalTime: "06:05",
    },
    { user: peerC, offset: 10, routeIndex: 4, flightNumber: "CC192" },
    { user: peerC, offset: 17, routeIndex: 0, flightNumber: "CC303" },
    {
      user: peerC,
      offset: 28,
      routeIndex: 1,
      flightNumber: "CC633",
      departureTime: "09:25",
      arrivalTime: "14:55",
    },
    { user: crossBasePeer, offset: 25, routeIndex: 0, flightNumber: "CC710" },
    { user: crossFleetPeer, offset: 28, routeIndex: 0, flightNumber: "CC820" },
    { user: positionMismatchPeer, offset: 24, routeIndex: 2, flightNumber: "CC913" },
    { user: otherAirlinePeer, offset: 19, routeIndex: 0, flightNumber: "NS101" },
    { user: hiddenRolePeer, offset: 12, routeIndex: 2, flightNumber: "OT205" },
  ];

  peerSpecs.forEach((spec, index) => {
    flights.push(
      createFlight({
        id: `f-peer-${index + 1}`,
        date: toIsoDate(dateAtOffset(monthStart, spec.offset)),
        user: spec.user,
        routeIndex: spec.routeIndex,
        flightNumber: spec.flightNumber,
        base: spec.user.base,
        aircraftType: spec.user.fleet,
        departureTime: spec.departureTime,
        arrivalTime: spec.arrivalTime,
      }),
    );
  });

  const dayStatuses = [
    createDayStatus("d-1", me.id, toIsoDate(dateAtOffset(monthStart, 8)), "reserve"),
    createDayStatus("d-2", me.id, toIsoDate(dateAtOffset(monthStart, 12)), "off"),
    createDayStatus("d-3", me.id, toIsoDate(dateAtOffset(monthStart, 18)), "reserve"),
    createDayStatus("d-4", me.id, toIsoDate(dateAtOffset(monthStart, 26)), "off"),
    createDayStatus("d-5", peerA.id, toIsoDate(dateAtOffset(monthStart, 20)), "reserve"),
    createDayStatus("d-6", peerB.id, toIsoDate(dateAtOffset(monthStart, 16)), "off"),
  ];

  const openTimePosts = [
    {
      id: "ot-1",
      flightId: "f-peer-3",
      postedByUserId: peerA.id,
      status: "open",
      bids: [],
      postedAt: `${toIsoDate(dateAtOffset(monthStart, 18))}T08:00`,
    },
    {
      id: "ot-2",
      flightId: "f-peer-8",
      postedByUserId: peerB.id,
      status: "open",
      bids: [],
      postedAt: `${toIsoDate(dateAtOffset(monthStart, 20))}T13:10`,
    },
    {
      id: "ot-3",
      flightId: "f-peer-12",
      postedByUserId: crossBasePeer.id,
      status: "open",
      bids: [],
      postedAt: `${toIsoDate(dateAtOffset(monthStart, 23))}T10:20`,
    },
    {
      id: "ot-4",
      flightId: "f-peer-13",
      postedByUserId: crossFleetPeer.id,
      status: "open",
      bids: [],
      postedAt: `${toIsoDate(dateAtOffset(monthStart, 25))}T09:45`,
    },
  ];

  const swapRequests = [
    {
      id: "sr-1",
      requesterId: peerA.id,
      targetUserId: me.id,
      requesterFlightId: "f-peer-4",
      targetFlightId: "f-me-8",
      status: "pending",
      createdAt: `${toIsoDate(dateAtOffset(monthStart, 22))}T15:30`,
      notes: "Same-day Miami turn. Should keep both pairings legal.",
    },
  ];

  const notifications = [
    {
      id: "n-1",
      type: "swap_request",
      title: `${peerA.name} proposed a swap`,
      body: "Review the request for your flight on the 24th. The legality engine will re-check both rosters before approval.",
      relatedId: "sr-1",
      createdAt: `${toIsoDate(dateAtOffset(monthStart, 22))}T15:30`,
      read: false,
    },
    {
      id: "n-2",
      type: "market_match",
      title: "New open time matches your qualification",
      body: "Two same-base duties are available this week.",
      relatedId: "ot-1",
      createdAt: `${toIsoDate(dateAtOffset(monthStart, 19))}T09:10`,
      read: false,
    },
    {
      id: "n-3",
      type: "system",
      title: "Roster legality check complete",
      body: "Your current schedule meets the default crew duty policy.",
      relatedId: "",
      createdAt: `${toIsoDate(dateAtOffset(monthStart, 1))}T07:00`,
      read: true,
    },
  ];

  const auditLog = [
    {
      id: "a-1",
      time: `${toIsoDate(dateAtOffset(monthStart, 1))}T07:00`,
      action: "Profile created",
      detail: `${cleanProfile.role} ${cleanProfile.position} based in ${cleanProfile.base} on ${cleanProfile.fleet}.`,
    },
    {
      id: "a-2",
      time: `${toIsoDate(dateAtOffset(monthStart, 18))}T08:00`,
      action: "Open time posted",
      detail: `${peerA.name} released ${flights.find((flight) => flight.id === "f-peer-3").flightNumber}.`,
    },
    {
      id: "a-3",
      time: `${toIsoDate(dateAtOffset(monthStart, 22))}T15:30`,
      action: "Swap request received",
      detail: `${peerA.name} requested ${flights.find((flight) => flight.id === "f-me-8").flightNumber}.`,
    },
  ];

  const upcomingFlight =
    flights.find(
      (flight) => flight.assignedUserId === me.id && flight.date >= selectedDate,
    ) || flights.find((flight) => flight.assignedUserId === me.id);

  return {
    profile: cleanProfile,
    users,
    flights,
    dayStatuses,
    openTimePosts,
    swapRequests,
    notifications,
    auditLog,
    rules: { ...DEFAULT_RULES },
    calendarMode: "month",
    currentMonth: toIsoDate(monthStart).slice(0, 7),
    selectedDate,
    selectedMyFlightId: upcomingFlight ? upcomingFlight.id : "",
    marketplaceFilters: {
      date: "",
      base: "all",
      fleet: "all",
      departureWindow: "all",
      tripLength: "all",
      layover: "",
    },
    banner: {
      type: "info",
      text: "Demo roster loaded. Every request runs through the legality engine before it can be approved.",
    },
  };
}

window.CrewFlowData = {
  ROLE_OPTIONS,
  PILOT_POSITIONS,
  BASE_OPTIONS,
  FLEET_OPTIONS,
  DEFAULT_RULES,
  createDefaultProfile,
  createBlankState,
  createSeedState,
};
