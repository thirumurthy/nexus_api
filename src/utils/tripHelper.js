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

/**
 * Intelligently groups and clusters raw fragmented telemetry trip segments into
 * true single rides over the last 1 week of data:
 * - Restricts scope strictly to 7 days (1 week).
 * - Deduplicates multi-channel or simultaneous sync inserts.
 * - Detects battery charging events (SoC increase > 2%): hard ride boundary.
 * - Detects idle parking pauses (gap between syncs > 25 mins): hard ride boundary.
 * - Merges consecutive in-ride periodic sync fragments (gaps <= 25 mins, continuous discharge)
 *   into a single, consolidated journey.
 * - Synthesizes comprehensive energy dynamics, duration, speeds, and contextual AI tags.
 */
function clusterRawTrips(rawTrips, now = Date.now()) {
  if (!rawTrips || rawTrips.length === 0) return [];

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const minTime = now - ONE_WEEK_MS;

  // Filter last 7 days & sort ascending chronologically
  const inWeek = rawTrips
    .filter(t => new Date(t.endTime || t.startTime || 0).getTime() >= minTime)
    .sort((a, b) => new Date(a.endTime || a.startTime).getTime() - new Date(b.endTime || b.startTime).getTime());

  if (inWeek.length === 0) return [];

  // Pass 1: Deduplicate multi-channel or instant duplicate syncs (< 25s apart)
  const deduped = [];
  for (let i = 0; i < inWeek.length; i++) {
    const cur = inWeek[i];
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1];
      const curTime = new Date(cur.endTime || cur.startTime).getTime();
      const prevTime = new Date(prev.endTime || prev.startTime).getTime();
      const timeDiff = Math.abs(curTime - prevTime);
      const distDiff = Math.abs(Number(cur.distanceKm || 0) - Number(prev.distanceKm || 0));
      if (timeDiff < 25_000 && distDiff < 0.25) {
        continue; // Drop duplicate sync
      }
    }
    deduped.push(cur);
  }

  // Pass 2: Group into clusters based on Charge Events and Idle Gaps
  const clusters = [];
  let curCluster = [];

  for (let i = 0; i < deduped.length; i++) {
    const seg = deduped[i];
    const sStartSoc = Number(seg.startSoc ?? seg.soc_percent ?? 50);
    const sEndSoc = Number(seg.endSoc ?? seg.soc_percent ?? 50);
    const sDist = Number(seg.distanceKm || 0);

    // If segment itself is a stationary charge event (e.g. 50% -> 100% with <= 0.3km)
    const isChargingSession = (sEndSoc > (sStartSoc + 3)) && (sDist <= 0.3);
    if (isChargingSession) {
      if (curCluster.length > 0) {
        clusters.push(curCluster);
        curCluster = [];
      }
      continue;
    }

    if (curCluster.length === 0) {
      curCluster.push(seg);
      continue;
    }

    const prevSeg = curCluster[curCluster.length - 1];
    const prevEndTime = new Date(prevSeg.endTime || prevSeg.startTime).getTime();
    const curEndTime = new Date(seg.endTime || seg.startTime).getTime();
    const gapEndToEndMins = (curEndTime - prevEndTime) / 60000;

    const prevEndSoc = Number(prevSeg.endSoc ?? prevSeg.startSoc ?? 50);
    const curStartSoc = Number(seg.startSoc ?? seg.endSoc ?? 50);

    // Has a battery recharge happened between trips? (Battery percentage increased)
    const isCharged = curStartSoc > (prevEndSoc + 2);

    // If charged or parked gap > 25 mins, this starts a new separate ride!
    if (isCharged || gapEndToEndMins > 25) {
      clusters.push(curCluster);
      curCluster = [seg];
    } else {
      curCluster.push(seg);
    }
  }
  if (curCluster.length > 0) {
    clusters.push(curCluster);
  }

  // Pass 3: Synthesize each cluster into a single coherent ride entity
  const synthesized = clusters.map(cluster => {
    const first = cluster[0];
    const last = cluster[cluster.length - 1];

    const totalDist = Number(cluster.reduce((sum, s) => sum + Number(s.distanceKm || 0), 0).toFixed(1));
    const startSoc = Number(first.startSoc ?? first.soc_percent ?? 80);
    const endSoc = Number(last.endSoc ?? last.soc_percent ?? Math.max(10, startSoc - Math.round(totalDist / 1.9)));
    const batteryUsed = Math.max(0, startSoc - endSoc);

    const firstStartTime = new Date(first.startTime || first.endTime || 0).getTime();
    const lastEndTime = new Date(last.endTime || last.startTime || 0).getTime();
    const spanMins = Math.round((lastEndTime - firstStartTime) / 60000);
    const activeDur = cluster.reduce((sum, s) => sum + Number(s.durationMins || 0), 0);
    const durationMins = Math.max(Math.max(5, activeDur), spanMins > 0 ? spanMins : activeDur);

    const topSpeed = Math.max(...cluster.map(s => Number(s.topSpeedKmh || s.maxSpeedKmh || 45)));
    const calculatedAvgSpeed = durationMins > 0 ? Number(((totalDist / (durationMins / 60.0))).toFixed(1)) : 24.0;
    const avgSpeed = Math.min(topSpeed, Math.max(15.0, calculatedAvgSpeed));

    // Dominant / highest power riding mode
    const modes = cluster.map(s => String(s.ridingMode || 'City'));
    const mode = modes.includes('Sport') ? 'Sport' : modes.includes('Power') ? 'Power' : modes.includes('City') ? 'City' : modes.includes('ECO') ? 'ECO' : 'Eco';

    const efficiency = batteryUsed > 0 ? Number((totalDist / batteryUsed).toFixed(2)) : 1.94;
    const energyKwh = Number((totalDist * 0.038).toFixed(2));
    const regenKwh = Number((totalDist * 0.006).toFixed(2));

    const meta = inferTripMetadata({
      startTime: new Date(firstStartTime),
      endTime: new Date(lastEndTime),
      durationMins,
      distanceKm: totalDist,
      avgSpeedKmh: avgSpeed,
      topSpeedKmh: topSpeed,
      ridingMode: mode,
      efficiencyKmPerPct: efficiency
    }, new Date(now));

    return {
      trip_id: first.tripId || `CLUSTERED_${firstStartTime}`,
      title: meta.title,
      tag: meta.tag,
      session_summary: meta.sessionSummary,
      distance_km: totalDist,
      duration_mins: durationMins,
      avg_speed_kmh: avgSpeed,
      top_speed_kmh: topSpeed,
      battery_used_pct: batteryUsed,
      start_soc: startSoc,
      end_soc: endSoc,
      riding_mode: mode,
      efficiency_km_per_pct: efficiency,
      energy_consumed_kwh: energyKwh,
      regen_recaptured_kwh: regenKwh,
      money_saved_inr: meta.moneySavedInr,
      co2_saved_kg: meta.co2SavedKg,
      start_time: new Date(firstStartTime),
      end_time: new Date(lastEndTime),
      segments_merged: cluster.length,
      ai_critique: cluster.length > 1 ? `Intelligently consolidated ${cluster.length} continuous telemetry segments into one unified ride.` : ''
    };
  }).filter(c => c.distance_km >= 0.4 || c.battery_used_pct >= 1); // Filter standalone sub-400m zero-energy jitter

  // Order descending (newest first)
  return synthesized.reverse();
}

module.exports = {
  formatTime,
  formatDateLabel,
  inferTripMetadata,
  clusterRawTrips
};
