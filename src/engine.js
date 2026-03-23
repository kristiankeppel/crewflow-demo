const { DEFAULT_RULES } = window.CrewFlowData;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(value) {
  return value.slice(0, 10);
}

function parseDate(value) {
  return new Date(value);
}

function diffHours(startValue, endValue) {
  const start = typeof startValue === "string" ? parseDate(startValue) : startValue;
  const end = typeof endValue === "string" ? parseDate(endValue) : endValue;
  return Number(((end.getTime() - start.getTime()) / 36e5).toFixed(1));
}

function dayDistance(leftDate, rightDate) {
  const left = new Date(`${leftDate}T00:00`);
  const right = new Date(`${rightDate}T00:00`);
  return Math.round((right.getTime() - left.getTime()) / DAY_MS);
}

function uniqueMessages(messages) {
  return [...new Set(messages)];
}

function buildProjectedFlights(state, userId, removeIds = [], addFlights = []) {
  return state.flights
    .filter(
      (flight) =>
        flight.assignedUserId === userId && !removeIds.includes(flight.id),
    )
    .concat(addFlights.map((flight) => ({ ...flight, assignedUserId: userId })))
    .sort(
      (left, right) =>
        parseDate(left.departureTime).getTime() - parseDate(right.departureTime).getTime(),
    );
}

function buildWorkingDates(state, userId, flights) {
  const workingDates = new Set(flights.map((flight) => flight.date));

  state.dayStatuses
    .filter((status) => status.userId === userId && status.type === "reserve")
    .forEach((status) => workingDates.add(status.date));

  return [...workingDates].sort();
}

function isSameAirlineAndRole(viewer, owner) {
  return viewer.airline === owner.airline && viewer.role === owner.role;
}

function validateQualification(user, flight, rules) {
  const errors = [];

  if (user.airline !== flight.airline) {
    errors.push("Different airline rosters cannot be mixed.");
  }
  if (user.role !== flight.role) {
    errors.push("Pilots and flight attendants cannot trade or pick up each other's duties.");
  }
  if (user.role === "Pilot" && user.position !== flight.position) {
    errors.push(`This duty is limited to ${flight.position}s.`);
  }
  if (user.fleet !== flight.aircraftType) {
    errors.push(`Aircraft qualification mismatch: ${flight.aircraftType} required.`);
  }
  if (!rules.allowCrossBase && user.base !== flight.base) {
    errors.push(`Base restriction: only ${flight.base} crew can operate this duty while cross-base trading is disabled.`);
  }

  return errors;
}

function validateProjectedRoster(state, userId, removeIds = [], addFlights = []) {
  const rules = state.rules;
  const projectedFlights = buildProjectedFlights(state, userId, removeIds, addFlights);
  const errors = [];

  projectedFlights.forEach((flight) => {
    if (flight.totalDutyHours > rules.maxDutyHoursPerDay) {
      errors.push(
        `${flight.flightNumber} exceeds the daily duty limit at ${flight.totalDutyHours}h.`,
      );
    }
  });

  const dutyByDate = new Map();
  projectedFlights.forEach((flight) => {
    const current = dutyByDate.get(flight.date) || 0;
    dutyByDate.set(flight.date, Number((current + flight.totalDutyHours).toFixed(1)));
  });

  dutyByDate.forEach((hours, date) => {
    if (hours > rules.maxDutyHoursPerDay) {
      errors.push(`Daily duty exceeds ${rules.maxDutyHoursPerDay}h on ${date}.`);
    }
  });

  for (let index = 1; index < projectedFlights.length; index += 1) {
    const previous = projectedFlights[index - 1];
    const current = projectedFlights[index];
    const restGap = diffHours(previous.dutyEnd, current.dutyStart);

    if (restGap < rules.minRestHours) {
      errors.push(
        `Minimum rest violated between ${previous.flightNumber} and ${current.flightNumber}: ${restGap}h available, ${rules.minRestHours}h required.`,
      );
    }
  }

  projectedFlights.forEach((anchorFlight) => {
    const sevenDayTotal = projectedFlights.reduce((total, flight) => {
      const dayGap = dayDistance(flight.date, anchorFlight.date);
      return dayGap >= 0 && dayGap < 7 ? total + flight.blockHours : total;
    }, 0);
    const twentyEightDayTotal = projectedFlights.reduce((total, flight) => {
      const dayGap = dayDistance(flight.date, anchorFlight.date);
      return dayGap >= 0 && dayGap < 28 ? total + flight.blockHours : total;
    }, 0);

    if (sevenDayTotal > rules.maxFlightHours7Days) {
      errors.push(
        `Rolling 7-day flight time would reach ${sevenDayTotal.toFixed(1)}h on ${anchorFlight.date}.`,
      );
    }
    if (twentyEightDayTotal > rules.maxFlightHours28Days) {
      errors.push(
        `Rolling 28-day flight time would reach ${twentyEightDayTotal.toFixed(1)}h on ${anchorFlight.date}.`,
      );
    }
  });

  const workingDates = buildWorkingDates(state, userId, projectedFlights);
  let streak = 1;
  for (let index = 1; index < workingDates.length; index += 1) {
    if (dayDistance(workingDates[index - 1], workingDates[index]) === 1) {
      streak += 1;
      if (streak > rules.maxConsecutiveDays) {
        errors.push(
          `Consecutive duty limit exceeded with a ${streak}-day streak ending ${workingDates[index]}.`,
        );
      }
    } else {
      streak = 1;
    }
  }

  const [year, month] = state.currentMonth.split("-").map(Number);
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const workedThisMonth = workingDates.filter(
    (date) => date.slice(0, 7) === state.currentMonth,
  ).length;
  const daysOff = totalDaysInMonth - workedThisMonth;
  if (daysOff < rules.minDaysOffPerMonth) {
    errors.push(
      `Required days off not met: projected month would only have ${daysOff} off days.`,
    );
  }

  return uniqueMessages(errors);
}

function scoreSwap(myFlight, candidateFlight, validation) {
  let score = validation.eligible ? 100 : 20;

  if (myFlight.date === candidateFlight.date) {
    score += 35;
  }
  if (myFlight.departureAirport === candidateFlight.departureAirport) {
    score += 10;
  }
  if (myFlight.arrivalAirport === candidateFlight.arrivalAirport) {
    score += 10;
  }

  const departureGap = Math.abs(
    diffHours(myFlight.departureTime, candidateFlight.departureTime),
  );
  score += Math.max(0, 24 - departureGap * 4);

  if (candidateFlight.tripLengthDays === myFlight.tripLengthDays) {
    score += 12;
  }

  return Number(score.toFixed(1));
}

function formatHours(value) {
  return `${Number(value).toFixed(1)}h`;
}

function getUserById(state, userId) {
  return state.users.find((user) => user.id === userId);
}

function getFlightById(state, flightId) {
  return state.flights.find((flight) => flight.id === flightId);
}

function getUserFlights(state, userId) {
  return state.flights
    .filter((flight) => flight.assignedUserId === userId)
    .sort(
      (left, right) =>
        parseDate(left.departureTime).getTime() - parseDate(right.departureTime).getTime(),
    );
}

function getFlightsForDate(state, userId, date) {
  return getUserFlights(state, userId).filter((flight) => flight.date === date);
}

function getStatusesForDate(state, userId, date) {
  return state.dayStatuses.filter(
    (status) => status.userId === userId && status.date === date,
  );
}

function getScheduleMetrics(state, userId) {
  const userFlights = getUserFlights(state, userId);
  const pendingIncoming = state.swapRequests.filter(
    (request) => request.targetUserId === userId && request.status === "pending",
  ).length;
  const matchingOpenTime = getVisibleMarketplacePosts(state, userId).filter(
    (post) => post.validation.eligible,
  ).length;
  const legalityErrors = validateProjectedRoster(state, userId);

  return {
    dutyCount: userFlights.length,
    pendingIncoming,
    matchingOpenTime,
    legalityErrors,
    legal: legalityErrors.length === 0,
  };
}

function isFlightOffered(state, flightId) {
  return state.openTimePosts.some(
    (post) => post.flightId === flightId && post.status === "open",
  );
}

function validateOpenTimeClaim(state, userId, flightId) {
  const user = getUserById(state, userId);
  const flight = getFlightById(state, flightId);
  const errors = [];

  if (!user || !flight) {
    return {
      eligible: false,
      errors: ["Flight data is unavailable."],
    };
  }

  if (flight.assignedUserId === userId) {
    errors.push("You already own this duty.");
  }

  errors.push(...validateQualification(user, flight, state.rules));
  errors.push(...validateProjectedRoster(state, userId, [], [flight]));

  return {
    eligible: errors.length === 0,
    errors: uniqueMessages(errors),
  };
}

function validateSwapProposal(
  state,
  requesterId,
  requesterFlightId,
  targetFlightId,
) {
  const requester = getUserById(state, requesterId);
  const requesterFlight = getFlightById(state, requesterFlightId);
  const targetFlight = getFlightById(state, targetFlightId);
  const targetUser = targetFlight ? getUserById(state, targetFlight.assignedUserId) : null;
  const errors = [];

  if (!requester || !requesterFlight || !targetFlight || !targetUser) {
    return {
      eligible: false,
      errors: ["Swap data is incomplete."],
      requesterErrors: [],
      targetErrors: [],
    };
  }

  if (requesterFlight.assignedUserId !== requesterId) {
    errors.push("Requester can only trade duties assigned to them.");
  }
  if (targetFlight.assignedUserId === requesterId) {
    errors.push("Choose another crew member's duty for a swap.");
  }
  if (!isSameAirlineAndRole(requester, targetUser)) {
    errors.push("Only crew within the same airline and role group can swap.");
  }

  const requesterQualificationErrors = validateQualification(
    requester,
    targetFlight,
    state.rules,
  );
  const targetQualificationErrors = validateQualification(
    targetUser,
    requesterFlight,
    state.rules,
  );

  const requesterRosterErrors = validateProjectedRoster(state, requesterId, [requesterFlightId], [
    targetFlight,
  ]);
  const targetRosterErrors = validateProjectedRoster(
    state,
    targetUser.id,
    [targetFlightId],
    [requesterFlight],
  );

  const requesterErrors = uniqueMessages([
    ...requesterQualificationErrors,
    ...requesterRosterErrors,
  ]);
  const targetErrors = uniqueMessages([
    ...targetQualificationErrors,
    ...targetRosterErrors,
  ]);

  return {
    eligible: errors.length === 0 && requesterErrors.length === 0 && targetErrors.length === 0,
    errors: uniqueMessages(errors),
    requesterErrors,
    targetErrors,
  };
}

function getVisibleMarketplacePosts(state, userId) {
  const viewer = getUserById(state, userId);
  if (!viewer) {
    return [];
  }

  return state.openTimePosts
    .filter((post) => post.status === "open")
    .map((post) => {
      const flight = getFlightById(state, post.flightId);
      const owner = flight ? getUserById(state, flight.assignedUserId) : null;

      if (!flight || !owner || !isSameAirlineAndRole(viewer, owner)) {
        return null;
      }

      return {
        post,
        flight,
        owner,
        validation: validateOpenTimeClaim(state, userId, flight.id),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        parseDate(left.flight.departureTime).getTime() -
        parseDate(right.flight.departureTime).getTime(),
    );
}

function countHiddenMarketplacePosts(state, userId) {
  const viewer = getUserById(state, userId);
  if (!viewer) {
    return 0;
  }

  return state.openTimePosts.filter((post) => {
    if (post.status !== "open") {
      return false;
    }
    const flight = getFlightById(state, post.flightId);
    const owner = flight ? getUserById(state, flight.assignedUserId) : null;
    return !flight || !owner || !isSameAirlineAndRole(viewer, owner);
  }).length;
}

function getSwapCandidates(state, userId, myFlightId) {
  const myFlight = getFlightById(state, myFlightId);
  const viewer = getUserById(state, userId);

  if (!myFlight || !viewer) {
    return [];
  }

  return state.flights
    .filter(
      (flight) =>
        flight.id !== myFlightId &&
        flight.assignedUserId !== userId &&
        flight.role === viewer.role &&
        flight.airline === viewer.airline,
    )
    .map((flight) => {
      const owner = getUserById(state, flight.assignedUserId);
      const validation = validateSwapProposal(state, userId, myFlightId, flight.id);
      return {
        flight,
        owner,
        validation,
        score: scoreSwap(myFlight, flight, validation),
      };
    })
    .sort((left, right) => right.score - left.score);
}

function getRecommendedSwaps(state, userId, myFlightId) {
  const candidates = getSwapCandidates(state, userId, myFlightId);
  return candidates.slice(0, 4);
}

function getIncomingSwapRequests(state, userId) {
  return state.swapRequests
    .filter((request) => request.targetUserId === userId && request.status === "pending")
    .map((request) => ({
      request,
      requester: getUserById(state, request.requesterId),
      requesterFlight: getFlightById(state, request.requesterFlightId),
      targetFlight: getFlightById(state, request.targetFlightId),
      validation: validateSwapProposal(
        state,
        request.requesterId,
        request.requesterFlightId,
        request.targetFlightId,
      ),
    }))
    .sort(
      (left, right) =>
        parseDate(right.request.createdAt).getTime() -
        parseDate(left.request.createdAt).getTime(),
    );
}

function getOutgoingSwapRequests(state, userId) {
  return state.swapRequests
    .filter((request) => request.requesterId === userId && request.status === "pending")
    .map((request) => ({
      request,
      targetUser: getUserById(state, request.targetUserId),
      requesterFlight: getFlightById(state, request.requesterFlightId),
      targetFlight: getFlightById(state, request.targetFlightId),
    }));
}

function getDaySwapMatches(state, userId, date) {
  const myFlights = getFlightsForDate(state, userId, date);
  return myFlights.reduce((matches, flight) => {
    const sameDayCandidates = getSwapCandidates(state, userId, flight.id).filter(
      (candidate) => candidate.flight.date === date,
    );
    return matches.concat(sameDayCandidates);
  }, []);
}

function getNotifications(state) {
  return [...state.notifications].sort(
    (left, right) =>
      parseDate(right.createdAt).getTime() - parseDate(left.createdAt).getTime(),
  );
}

function summarizeValidation(validation) {
  const messages = [
    ...validation.errors,
    ...validation.requesterErrors,
    ...validation.targetErrors,
  ].filter(Boolean);

  return uniqueMessages(messages);
}

window.CrewFlowEngine = {
  formatHours,
  getUserById,
  getFlightById,
  getUserFlights,
  getFlightsForDate,
  getStatusesForDate,
  getScheduleMetrics,
  isFlightOffered,
  validateOpenTimeClaim,
  validateSwapProposal,
  getVisibleMarketplacePosts,
  countHiddenMarketplacePosts,
  getSwapCandidates,
  getRecommendedSwaps,
  getIncomingSwapRequests,
  getOutgoingSwapRequests,
  getDaySwapMatches,
  getNotifications,
  summarizeValidation,
};
