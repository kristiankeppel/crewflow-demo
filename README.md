# CrewFlow Demo

CrewFlow is a responsive crew scheduling prototype for airline pilots and flight attendants. It focuses on the core user journeys from your requirements:

- onboard by role, position, base, fleet, airline, and email
- view a monthly or weekly schedule
- inspect full flight details and day-level opportunities
- post duties into open time
- request open-time pickups
- propose, accept, and decline swaps
- block illegal actions with a rule-driven legality engine

## Stack

This project is intentionally dependency-free so it can run in a very bare environment:

- `index.html`
- `styles.css`
- `src/data.js`
- `src/engine.js`
- `src/app.js`

The business rules are separated from the UI so the legality engine can be lifted into a backend service later.

## Run

Open [index.html](/Users/kristian/Documents/Flight Schedule/index.html) in a browser.

No build step or package install is required.

## What’s Included

The demo covers:

- role-aware onboarding for Pilot / Flight Attendant
- Captain vs First Officer restrictions
- base and fleet compatibility checks
- monthly and weekly calendar views
- detailed duty information with duty/rest timing
- open time marketplace with filters
- swap center with recommended matches
- notifications and audit trail
- editable policy controls for rest, duty, flight time, days off, and cross-base rules

The legality engine validates:

- minimum rest between duties
- maximum duty time per day
- rolling 7-day and 28-day flight hour limits
- consecutive working day limits
- minimum days off per month
- role, position, fleet, airline, and base restrictions

## Suggested Next Steps

To productionize this, the next logical move is:

1. Move `src/engine.js` into a backend API service so approvals cannot be bypassed client-side.
2. Replace seeded data with PostgreSQL-backed users, flights, swap requests, and open-time postings.
3. Add authentication and role-scoped APIs.
4. Add push notifications and real-time request updates.
5. Split the UI into reusable components in React Native / React for mobile and web parity.
