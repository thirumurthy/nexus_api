/**
 * Ampere Nexus Official Maintenance & Service Lifecycle Engine
 * Based on Ampere Electric Scooter Maintenance Guide India (2026 Edition)
 * Reference: https://ampere-electric.com/blog/electric-scooter-maintenance-guide-india-2026
 */

const MILESTONES_CONFIG = [
  {
    km: 1000,
    serviceNumber: 1,
    title: '1st Service (Initial Bedding & Fit)',
    intervalLabel: '1,000 km / 1 Month',
    checklist: [
      { item: 'Fasteners & Chassis', desc: 'Recheck and torque-fit all bolt and nut connections across frame, fork, and swingarm.' },
      { item: 'Electrical & Controls', desc: 'Comprehensive inspection of headlamp, indicators, brake lights, horn, and handlebar switches.' },
      { item: 'Brake Bedding', desc: 'Check brake lever free-play, cable tension, and front disc pad seating.' },
      { item: 'Wheel Alignment', desc: 'Initial wheel alignment check and tyre pressure balancing.' },
      { item: 'Nex.IO Software', desc: 'Initial TFT cluster diagnostics and OTA software integrity check.' }
    ]
  },
  {
    km: 5000,
    serviceNumber: 2,
    title: '2nd Service (Safety & Wear Check)',
    intervalLabel: '5,000 km / 6 Months',
    checklist: [
      { item: 'Brake Pads & Shoes', desc: 'Inspect front disc pad thickness (ensure >=2 mm) and rear drum shoe wear.' },
      { item: 'Suspension Inspection', desc: 'Inspect front telescopic fork and twin rear shock absorbers for smooth damping and oil leaks.' },
      { item: 'Tyres & Tread', desc: 'Inspect tyre tread depth (minimum 2 mm), sidewall integrity, and embedded stones.' },
      { item: 'Battery Diagnostic', desc: 'BMS automated health scan, cell balance verification, and terminal inspection.' },
      { item: 'Brake Cable Tension', desc: 'Lubricate and adjust front and rear CBS brake cables.' }
    ]
  },
  {
    km: 10000,
    serviceNumber: 3,
    title: '3rd Service (Annual Comprehensive)',
    intervalLabel: '10,000 km / 1 Year',
    checklist: [
      { item: 'Brake Fluid Flush', desc: 'Inspect brake fluid clarity; flush and replenish DOT4 brake fluid (Nexus front disc).' },
      { item: 'Battery Pack Health', desc: 'Deep diagnostic on 3.3 kWh LFP pack, cell balance (delta V < 15 mV), and capacity retention.' },
      { item: 'Motor & Controller', desc: 'Check BLDC hub/PMSM motor wiring, controller heat sink, and phase cable torque.' },
      { item: 'Wiring Harness', desc: 'Inspect all visible wiring harnesses for rubbing, abrasion, or loose weather-sealed plugs.' },
      { item: 'Drum Brake Cleaning', desc: 'Disassemble rear drum, clean out accumulated brake dust, and adjust return springs.' }
    ]
  },
  {
    km: 15000,
    serviceNumber: 4,
    title: '4th Service (Chassis & Wheel Alignment)',
    intervalLabel: '15,000 km / 18 Months',
    checklist: [
      { item: 'Tyres & Alignment', desc: 'Check uneven tyre wear patterns; perform complete front-to-rear wheel alignment.' },
      { item: 'Tyre Replacement Assessment', desc: 'Assess tread depth against 2 mm safety threshold; recommend tyre change if worn.' },
      { item: 'Suspension Bushings', desc: 'Inspect swingarm pivot bushings and fork seals; grease steering head bearings.' },
      { item: 'Brake System Overhaul', desc: 'Replace front brake pads if under 2 mm; check CBS balance and lever firmness.' }
    ]
  },
  {
    km: 20000,
    serviceNumber: 5,
    title: '5th Service (Deep Powertrain Diagnostics)',
    intervalLabel: '20,000 km / 2 Years',
    checklist: [
      { item: 'Battery & Motor Performance', desc: 'Full dyno/telemetry test of motor torque delivery and regenerative braking power curve.' },
      { item: 'LFP Pack Health Assessment', desc: 'Diagnostic check for capacity retention (rated for >90% retention at 5 years).' },
      { item: 'Controller & BMS Recalibration', desc: 'Calibrate state-of-charge tracking algorithms and thermal throttle curves.' },
      { item: 'Brake Fluid Replacement', desc: 'Mandatory 2-year brake fluid flush and system bleed.' }
    ]
  },
  {
    km: 25000,
    serviceNumber: 6,
    title: '6th Service (Major Lifecycle Milestone)',
    intervalLabel: '25,000 km / 30 Months',
    checklist: [
      { item: 'Comprehensive Multi-Point Check', desc: 'All checklist items from 1st through 5th services consolidated into full inspection.' },
      { item: 'Tyre Replacement', desc: 'Replace front and rear 12-inch tubeless tyres (standard 25,000–35,000 km interval).' },
      { item: 'Disc Rotor Inspection', desc: 'Inspect front disc rotor for scoring, grooves, or runout warp; skim or replace if out of spec.' },
      { item: 'Motor Bearings & Seals', desc: 'Inspect motor wheel bearings for free rotation and water-tight seal integrity.' },
      { item: 'Nex.IO Major OTA Update', desc: 'Apply latest Nex.IO firmware patch and battery management algorithms.' }
    ]
  }
];

function generateMilestones(currentOdometer) {
  const odo = Math.max(0, Number(currentOdometer) || 0);
  const milestones = [];

  // 1. Fixed milestones (1k, 5k, 10k, 15k, 20k, 25k)
  for (const m of MILESTONES_CONFIG) {
    milestones.push({
      milestoneKm: m.km,
      serviceNumber: m.serviceNumber,
      title: m.title,
      intervalLabel: m.intervalLabel,
      checklist: m.checklist
    });
  }

  // 2. Extend recurring 5,000 km milestones if odometer is approaching or beyond 25k
  const highestDefined = 25000;
  const targetMax = Math.max(highestDefined + 10000, Math.ceil((odo + 5000) / 5000) * 5000);
  let nextKm = highestDefined + 5000;
  let serviceNo = 7;

  while (nextKm <= targetMax) {
    milestones.push({
      milestoneKm: nextKm,
      serviceNumber: serviceNo,
      title: `${serviceNo}th Service (Periodic Major)`,
      intervalLabel: `${nextKm.toLocaleString()} km`,
      checklist: [
        { item: 'Comprehensive Multi-Point Check', desc: 'Full safety review following all Ampere recommended inspection protocols.' },
        { item: 'Brake Pads & CBS Tuning', desc: 'Inspect front disc pads and rear drum wear; adjust CBS lever proportioning.' },
        { item: 'LFP Battery Capacity Scan', desc: 'Annual dealer battery health test and cell balance trimming.' },
        { item: 'Suspension & Chassis Torque', desc: 'Inspect suspension damping, swingarm bushings, and frame fastener torques.' },
        { item: 'Nex.IO Firmware Integrity', desc: 'Check over-the-air software updates and cluster telemetry.' }
      ]
    });
    nextKm += 5000;
    serviceNo += 1;
  }

  // 3. Mark status: COMPLETED, UPCOMING, FUTURE
  let upcomingFound = false;
  return milestones.map((m) => {
    let status = 'FUTURE';
    let isNext = false;
    let kmRemaining = 0;

    if (odo >= m.milestoneKm) {
      status = 'COMPLETED';
      kmRemaining = 0;
    } else if (!upcomingFound) {
      status = 'UPCOMING';
      isNext = true;
      upcomingFound = true;
      kmRemaining = Math.max(0, m.milestoneKm - odo);
    } else {
      status = 'FUTURE';
      kmRemaining = m.milestoneKm - odo;
    }

    return {
      ...m,
      status,
      isNext,
      kmRemaining: Math.round(kmRemaining * 10) / 10
    };
  });
}

const OWNER_CHECKLIST = {
  weeklyTasks: [
    {
      title: 'Tyre Pressure (Cold)',
      description: 'Check tyre pressure when tyres are cold. Front: 28 PSI, Rear: 32 PSI (or placard spec). Under-inflation lowers range by 5–10%.'
    },
    {
      title: 'Tread & Sidewalls',
      description: 'Inspect tread for embedded stones, cuts, or uneven wear. Ensure minimum tread depth remains above 2 mm.'
    },
    {
      title: 'Body, Seat & Display Wipe',
      description: 'Wipe body, seat, and TFT cluster with a clean damp cloth. Avoid harsh pressure washers or caustic soaps.'
    },
    {
      title: 'Charging Port Condition',
      description: 'Check that charging socket is completely clean, dry, and sealed with rubber flap before and after rides.'
    },
    {
      title: 'Lights & Horn Check',
      description: 'Test headlamp high/low beam, front & rear turn indicators, brake lights, and electric horn response.'
    }
  ],
  monthlyTasks: [
    {
      area: 'Fasteners & Bolts',
      task: 'Check for loose handlebar, rear-view mirror, seat hinge, and footboard bolts. Re-tighten if play is detected.'
    },
    {
      area: 'Brakes & Levers',
      task: 'Check lever travel, cable smoothness, and listen for squealing/grinding noises during progressive braking.'
    },
    {
      area: 'Charger & Cables',
      task: 'Inspect charger cord and 15A wall plug for cuts, kinks, bent pins, or thermal discoloration marks.'
    },
    {
      area: 'Wiring & Connectors',
      task: 'Inspect visible wiring harness under deck and behind fork for rubbing, pinches, or loose connectors.'
    },
    {
      area: 'Motor & Wheels',
      task: 'Place scooter on center stand, spin front and rear wheels by hand, and listen for smooth rotation with no bearing grinding.'
    },
    {
      area: 'Suspension & Shocks',
      task: 'Look for hydraulic oil leaks on front forks or rear dampers; test for smooth, progressive bump absorption.'
    }
  ]
};

const EV_VS_PETROL_COMPARISON = {
  title: 'Why Electric Scooters Have a Lower Maintenance Burden',
  summary: 'A petrol scooter engine contains 100+ moving parts requiring lubrication, spark replacement, and fuel system tuning. An electric motor has a single moving part — the rotor. Ampere owners typically spend 60–70% less on maintenance over five years (₹15,000–₹20,000 savings in maintenance + ₹1,20,000+ in fuel savings).',
  items: [
    { item: 'Engine Oil Change', petrol: 'Every 3,000–5,000 km', ev: 'Not applicable (Zero oil changes)' },
    { item: 'Spark Plug Replacement', petrol: 'Every 10,000–15,000 km', ev: 'Not applicable' },
    { item: 'Air Filter Cleaning / Replacement', petrol: 'Every 5,000–8,000 km', ev: 'Not applicable' },
    { item: 'Coolant Flush', petrol: 'Every 20,000 km', ev: 'Not applicable' },
    { item: 'Brake Pad Inspection', petrol: 'Every 5,000–8,000 km', ev: 'Every 5,000–8,000 km (Front Disc)' },
    { item: 'Brake Fluid Replacement', petrol: 'Every 2 years', ev: 'Every 2 years (Nexus disc variant)' },
    { item: 'Tyre Pressure Check', petrol: 'Monthly', ev: 'Monthly (Cold check)' },
    { item: 'Tyre Replacement', petrol: 'Every 25,000–35,000 km', ev: 'Every 25,000–35,000 km (12" Tubeless Alloy)' },
    { item: 'Software & Diagnostics', petrol: 'Manual dealer only', ev: 'Over-The-Air via Nex.IO Platform' },
    { item: 'Battery Health Check', petrol: 'Lead-acid swap 2-3 yrs', ev: 'Annual Ampere diagnostic (LFP 5-Yr / 75,000 km warranty)' }
  ]
};

const BATTERY_CARE_GUIDE = {
  chemistry: 'Safe, Long-Life Lithium Iron Phosphate (LFP 16S)',
  capacity: '3.3 kWh Dual-Cell Modular Pack',
  dailyHabits: [
    'Charge to 80–90% for daily commuting — reduces cell stress and optimizes lifespan.',
    'Avoid letting battery drop below 10–15% regularly — deep discharges accelerate degradation.',
    'A full 100% charge the night before a long ride is fine; avoid leaving it at 100% parked in direct sun.',
    'Charge at room temperature where possible — avoid charging in direct noon summer sunlight.',
    'Always use the official Ampere-certified charger for optimal BMS handshake.'
  ],
  longTermCare: [
    'If storing scooter for >2 weeks, maintain charge between 40–60%.',
    'Run a complete charge/discharge cycle every 2–4 weeks if not in regular use.',
    'Annual battery diagnostic at authorized Ampere service center verifies cell balance (<15 mV delta) and capacity retention.',
    'Under normal use, Ampere LFP batteries retain ~90–93% of original capacity by year 5 (backed by 5-Yr / 75,000 km warranty).'
  ]
};

const SAFETY_AND_SEASONAL_TIPS = {
  brakes: {
    title: 'Disc & Drum Brake Maintenance',
    content: 'Ampere Nexus features front disc with rear drum and CBS (Combined Braking System). Inspect front pad thickness every 5,000 km and replace when under 2 mm. Check brake fluid clarity annually.'
  },
  tyres: {
    title: 'Tyre Care & Efficiency',
    content: 'Nexus runs on 12-inch tubeless alloy wheels. Under-inflated tyres increase rolling resistance by up to 10%. Check cold pressure monthly and replace tyres when tread depth falls below 2 mm.'
  },
  monsoon: {
    title: 'Monsoon Preparedness (June – Sept)',
    content: 'Ampere Nexus has IP67 dust & water resistance. Always dry the charging socket completely with a dry cloth before plugging in. Clean the front brake disc regularly to prevent water film slip. Never pressure-wash directly into connectors or battery vent compartments.'
  }
};

const FAQS = [
  {
    q: 'How often does an Ampere electric scooter need servicing?',
    a: 'A brake, tyre, and safety inspection every 5,000 km and an annual comprehensive service every 10,000 km. Battery health diagnostics are performed during the annual visit. Software updates are delivered wirelessly via Nex.IO.'
  },
  {
    q: 'Do I need to change engine oil in my Ampere scooter?',
    a: 'No. Electric scooters have no internal combustion engine and therefore require zero oil changes, spark plug replacements, or air filter maintenance. This makes servicing 60–70% cheaper than petrol scooters.'
  },
  {
    q: 'How long does an Ampere LFP battery last?',
    a: 'Under typical daily use, LFP chemistry retains approximately 90–93% of original capacity by Year 5. Ampere covers the battery with a 5-year or 75,000 km manufacturer warranty.'
  },
  {
    q: 'Is it safe to charge an Ampere scooter in the rain?',
    a: 'Riding in the rain is safe thanks to IP67 ingress protection, but do NOT plug in while the socket is wet. Dry the charging socket and connector thoroughly with a dry cloth before connecting the charger, and charge in a sheltered space.'
  },
  {
    q: 'What should I do if my Ampere Nexus shows a battery warning?',
    a: 'The Nex.IO platform will display a fault code on the 7-inch TFT cluster. Note down the code and contact the nearest authorized Ampere service center. Many minor calibration faults can be resolved via an OTA software update.'
  }
];

function buildMaintenanceReport(currentOdometer) {
  const odo = Math.max(0, Number(currentOdometer) || 0);
  const timeline = generateMilestones(odo);
  const nextMilestone = timeline.find((m) => m.isNext) || timeline[0];

  return {
    currentOdometerKm: Math.round(odo * 10) / 10,
    nextMilestoneKm: nextMilestone ? nextMilestone.milestoneKm : 1000,
    kmUntilNextService: nextMilestone ? nextMilestone.kmRemaining : 0,
    nextServiceTitle: nextMilestone ? nextMilestone.title : 'Initial Service',
    nextServiceChecklist: nextMilestone ? nextMilestone.checklist : [],
    timeline,
    ownerChecklist: OWNER_CHECKLIST,
    evVsPetrol: EV_VS_PETROL_COMPARISON,
    batteryCare: BATTERY_CARE_GUIDE,
    safetyTips: SAFETY_AND_SEASONAL_TIPS,
    faqs: FAQS,
    sourceUrl: 'https://ampere-electric.com/blog/electric-scooter-maintenance-guide-india-2026'
  };
}

module.exports = {
  buildMaintenanceReport,
  generateMilestones,
  OWNER_CHECKLIST,
  EV_VS_PETROL_COMPARISON,
  BATTERY_CARE_GUIDE,
  SAFETY_AND_SEASONAL_TIPS,
  FAQS
};
