const env = require('../config/env');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime(date, tzOffsetMinutes = 330) {
  const localDate = new Date(date.getTime() + tzOffsetMinutes * 60000);
  let hours = localDate.getUTCHours();
  const minutes = localDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minsStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minsStr} ${ampm}`;
}

function formatDateLabel(date, now = new Date(), tzOffsetMinutes = 330) {
  const localTrip = new Date(date.getTime() + tzOffsetMinutes * 60000);
  const localNow = new Date(now.getTime() + tzOffsetMinutes * 60000);

  const tripDay = localTrip.toISOString().slice(0, 10);
  const nowDay = localNow.toISOString().slice(0, 10);

  const yesterdayDate = new Date(localNow.getTime() - 86400000);
  const yesterdayDay = yesterdayDate.toISOString().slice(0, 10);

  if (tripDay === nowDay) return 'Today';
  if (tripDay === yesterdayDay) return 'Yesterday';

  const month = MONTH_NAMES[localTrip.getUTCMonth()];
  const day = localTrip.getUTCDate();
  return `${day} ${month}`;
}

function inferTripMetadata(trip, now = new Date()) {
  const startDate = trip.startTime ? new Date(trip.startTime) : (trip.endTime ? new Date(trip.endTime.getTime() - (trip.durationMins || 15) * 60000) : new Date());
  const localDate = new Date(startDate.getTime() + (env.tzOffsetMinutes || 330) * 60000);
  const hour = localDate.getUTCHours();
  const dist = Number(trip.distanceKm || 0);
  const dur = Number(trip.durationMins || 1);
  const avgSpeed = Number(trip.avgSpeedKmh || 24);
  const topSpeed = Number(trip.topSpeedKmh || 50);
  const mode = String(trip.ridingMode || 'City');
  const eff = Number(trip.efficiencyKmPerPct || 1.9);

  let title = 'City Ride';
  let tag = 'CITY RIDE';

  if (dist >= 20.0) {
    title = 'Long Range Journey';
    tag = 'LONG RANGE';
  } else if (eff >= 2.0 && dist >= 3.0) {
    title = 'High Efficiency Glide';
    tag = 'ECO CHAMP';
  } else if (mode.toLowerCase() === 'power' || mode.toLowerCase() === 'sport') {
    title = 'Power Throttle Ride';
    tag = 'POWER RUN';
  } else if (dist < 2.0 && dur <= 6) {
    title = 'Quick Local Errand';
    tag = 'QUICK RUN';
  } else if (hour >= 5 && hour < 11) {
    title = 'Morning Commute';
    tag = 'COMMUTE';
  } else if (hour >= 11 && hour < 16) {
    title = 'Midday Trip';
    tag = 'CITY RIDE';
  } else if (hour >= 16 && hour < 20) {
    title = 'Evening Commute';
    tag = 'COMMUTE';
  } else if (hour >= 20 && hour < 23) {
    title = 'Night Cruise';
    tag = 'NIGHT GLIDE';
  } else {
    title = 'Late Night Ride';
    tag = 'NIGHT OWL';
  }

  const dateLabel = formatDateLabel(startDate, now, env.tzOffsetMinutes || 330);
  const timeStr = formatTime(startDate, env.tzOffsetMinutes || 330);
  const speedOrMode = avgSpeed > 0 ? `Avg ${Math.round(avgSpeed)} km/h` : `${mode} Mode`;
  const sessionSummary = `${dateLabel} • ${timeStr} (${dur}m) • ${speedOrMode}`;

  // Economics & Environmental calculations
  const petrolPrice = env.petrolPriceInr || 104.0;
  const mileage = env.petrolKmPerLiter || 42.0;
  const fuelSavedLiters = dist / Math.max(10, mileage);
  const moneySaved = Math.max(0, Math.round((fuelSavedLiters * petrolPrice) - (dist * 0.22)));
  const co2Saved = Math.round(fuelSavedLiters * 2.2 * 10) / 10;

  const isDefaultTitle = !trip.title || trip.title === 'Ride Session' || trip.title.startsWith('TRIP_');
  const isDefaultTag = !trip.tag || trip.tag === 'COMMUTE' || trip.tag === 'AI Auto';

  return {
    title: isDefaultTitle ? title : trip.title,
    tag: isDefaultTag ? tag : trip.tag,
    sessionSummary: (!trip.sessionSummary || trip.sessionSummary.includes('Indiranagar') || trip.sessionSummary.includes('➔')) ? sessionSummary : trip.sessionSummary,
    moneySavedInr: trip.moneySavedInr || moneySaved,
    co2SavedKg: trip.co2SavedKg || co2Saved
  };
}

module.exports = {
  formatTime,
  formatDateLabel,
  inferTripMetadata
};
