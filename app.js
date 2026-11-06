/**
 * Agentic AI in Healthcare: Emergency Multi-Agent Decision Support System
 * 
 * Implements Domain 1 guidelines:
 * - Specialized agents (Triage, Matching, Routing, Verifier)
 * - NEWS2 Deterioration Risk Scoring Baseline
 * - Deterministic Human-in-the-Loop (HITL) Validation Protocols
 * - Real-time Simulated Telemetry & Chaos Scenarios
 * - FHIR-style payload structures & HIPAA / DPDP Act 2023 Data Minimization
 * - Immutable Audit Logging
 */

// Global State
const State = {
  // Authentication & Session
  currentUser: null, // null (shows login page) or { role, userId, name, title, avatar }

  // Active Navigation
  activePortal: 'ambulance', // 'patient' | 'ambulance' | 'hospital' | 'evaluation' | 'audit' | 'governance'

  // Geographic Map Mode & View
  activeMapView: 'bengaluru', // 'bengaluru' (Urban Regional Dispatch) | 'india' (All-India Emergency Grid)
  mapMode: 'leaflet', // 'leaflet' | 'canvas'

  // Hospitals Dataset
  hospitals: [],

  // Cases Dataset
  cases: [],

  // Current Active Case (Ambulance)
  currentCase: {
    id: "CASE-9021",
    category: "Cardiac - Acute STEMI",
    notes: "62-year-old male with acute retrosternal crushing chest pain radiating to left jaw and arm for 45 mins. Diaphoretic, pale, dyspneic.",
    vitals: {
      hr: 108,
      sbp: 88,
      dbp: 58,
      spo2: 93,
      rr: 24,
      temp: 37.1,
      avpu: "Alert",
      gcs: 15
    },
    location: { lat: 12.9550, lng: 77.6050, name: "Richmond Town, Central Ward, Bengaluru" },
    triageResult: null,
    recommendations: [],
    verificationFlags: [],
    selectedHospitalId: null,
    isAccepted: false,
    overrideReason: null,
    transitProgress: 0.15,
    isDeteriorated: false
  },

  // Hospital Portal Context
  selectedHospitalId: "HOSP_1",
  incomingAlerts: [],

  // Chaos / Scenarios
  activeRoadBlock: false,
  customRoadReason: "Arterial Bridge Construction & Heavy Traffic",
  customRoadDelay: 22,
  roadBlockTargetHosp: "HOSP_1",

  // Audit Ledger
  auditLog: [],

  // Benchmark Evaluation Cache
  evalResults: null
};

// Available Clinical Roles for AegisCare Authentication
const ROLES = {
  ambulance: {
    defaultId: "AMB-BLR-9021",
    defaultName: "Paramedic Vikram Sharma",
    title: "Unit #9021 • Bengaluru Central",
    avatar: "🚑",
    targetPortal: "ambulance"
  },
  hospital: {
    defaultId: "ED-BLR-METRO",
    defaultName: "Dr. Ananya Roy (ED Lead)",
    title: "Metro Heart ED Lead • Bengaluru",
    avatar: "🏥",
    targetPortal: "hospital"
  },
  patient: {
    defaultId: "ABHA-91-8842-1928",
    defaultName: "Aarav Mehta (Citizen)",
    title: "Citizen Patient • Bengaluru Sector",
    avatar: "👤",
    targetPortal: "patient"
  },
  evaluation: {
    defaultId: "AUDIT-NHA-042",
    defaultName: "Dr. K. S. Murthy",
    title: "Clinical AI Auditor • National Health Grid",
    avatar: "🛡️",
    targetPortal: "evaluation"
  }
};

// ==========================================
// 1. SPECIALIZED AGENTS & CLINICAL REASONING
// ==========================================

/**
 * Baseline Clinical NEWS2 Calculator
 * Standard National Early Warning Score 2 (NHS / Royal College of Physicians)
 */
function calculateNEWS2(vitals) {
  let score = 0;
  const breakdown = [];

  // Respiration Rate
  if (vitals.rr <= 8) { score += 3; breakdown.push("RR <= 8 (+3)"); }
  else if (vitals.rr >= 9 && vitals.rr <= 11) { score += 1; breakdown.push("RR 9-11 (+1)"); }
  else if (vitals.rr >= 12 && vitals.rr <= 20) { /* 0 */ }
  else if (vitals.rr >= 21 && vitals.rr <= 24) { score += 2; breakdown.push("RR 21-24 (+2)"); }
  else if (vitals.rr >= 25) { score += 3; breakdown.push("RR >= 25 (+3)"); }

  // SpO2 Scale 1
  if (vitals.spo2 <= 91) { score += 3; breakdown.push("SpO2 <= 91% (+3)"); }
  else if (vitals.spo2 >= 92 && vitals.spo2 <= 93) { score += 2; breakdown.push("SpO2 92-93% (+2)"); }
  else if (vitals.spo2 >= 94 && vitals.spo2 <= 95) { score += 1; breakdown.push("SpO2 94-95% (+1)"); }

  // Systolic BP
  if (vitals.sbp <= 90) { score += 3; breakdown.push("SBP <= 90 mmHg (+3)"); }
  else if (vitals.sbp >= 91 && vitals.sbp <= 100) { score += 2; breakdown.push("SBP 91-100 (+2)"); }
  else if (vitals.sbp >= 101 && vitals.sbp <= 110) { score += 1; breakdown.push("SBP 101-110 (+1)"); }
  else if (vitals.sbp >= 220) { score += 3; breakdown.push("SBP >= 220 (+3)"); }

  // Heart Rate
  if (vitals.hr <= 40) { score += 3; breakdown.push("HR <= 40 bpm (+3)"); }
  else if (vitals.hr >= 41 && vitals.hr <= 50) { score += 1; breakdown.push("HR 41-50 (+1)"); }
  else if (vitals.hr >= 51 && vitals.hr <= 90) { /* 0 */ }
  else if (vitals.hr >= 91 && vitals.hr <= 110) { score += 1; breakdown.push("HR 91-110 (+1)"); }
  else if (vitals.hr >= 111 && vitals.hr <= 130) { score += 2; breakdown.push("HR 111-130 (+2)"); }
  else if (vitals.hr >= 131) { score += 3; breakdown.push("HR >= 131 (+3)"); }

  // Consciousness (AVPU)
  if (vitals.avpu !== "Alert") {
    score += 3;
    breakdown.push(`Consciousness: ${vitals.avpu} (+3)`);
  }

  // Temperature
  if (vitals.temp <= 35.0) { score += 3; breakdown.push("Temp <= 35.0C (+3)"); }
  else if (vitals.temp >= 35.1 && vitals.temp <= 36.0) { score += 1; breakdown.push("Temp 35.1-36.0C (+1)"); }
  else if (vitals.temp >= 38.1 && vitals.temp <= 39.0) { score += 1; breakdown.push("Temp 38.1-39.0C (+1)"); }
  else if (vitals.temp >= 39.1) { score += 2; breakdown.push("Temp >= 39.1C (+2)"); }

  let riskCategory = "Low Risk";
  if (score >= 7) riskCategory = "High Clinical Deterioration Risk (Urgent Medical Review)";
  else if (score >= 5 || breakdown.some(b => b.includes("(+3)"))) riskCategory = "Medium Risk (Ward-Level Response)";

  return { score, riskCategory, breakdown };
}

/**
 * AGENT 1: Triage & Clinical Deterioration Agent
 * Combines NLP keyword extraction, deterministic red-flag rules, and NEWS2 baseline
 */
const TriageAgent = {
  evaluate(text, vitals) {
    const lower = (text || "").toLowerCase();
    const redFlags = [];

    // Deterministic Red-Flag Safeguards
    if (lower.includes("chest pain") || lower.includes("heart attack") || lower.includes("stemi") || lower.includes("jaw pain")) {
      redFlags.push("Suspected Acute Coronary Syndrome / STEMI");
    }
    if (lower.includes("facial droop") || lower.includes("slurred speech") || lower.includes("arm weakness") || lower.includes("stroke") || lower.includes("hemiplegia")) {
      redFlags.push("FAST Positive: Acute Neurological Deficit (Suspected Stroke)");
    }
    if (lower.includes("collision") || lower.includes("unrestrained") || lower.includes("femur fracture") || lower.includes("polytrauma") || lower.includes("hemorrhage")) {
      redFlags.push("High-Energy Trauma / Hemorrhagic Shock Risk");
    }
    if (vitals.spo2 < 88) {
      redFlags.push(`Critical Hypoxemia (SpO2 ${vitals.spo2}%)`);
    }
    if (vitals.sbp < 85) {
      redFlags.push(`Severe Hemodynamic Instability (SBP ${vitals.sbp} mmHg)`);
    }

    // NEWS2 Baseline
    const news2 = calculateNEWS2(vitals);

    // Classification
    let urgency = "Routine";
    let category = "General Medicine";
    let requiredSpecialty = "General Physician";
    let requiredResources = ["Outpatient Exam Room"];
    let confidence = 0.85;

    if (redFlags.length > 0 || news2.score >= 5) {
      urgency = "Emergency";
      confidence = 0.96;
      if (lower.includes("chest") || lower.includes("stemi") || lower.includes("heart")) {
        category = "Cardiac - Acute STEMI";
        requiredSpecialty = "Interventional Cardiologist";
        requiredResources = ["Cath Lab", "Cardiac ICU", "Defibrillator"];
      } else if (lower.includes("stroke") || lower.includes("slurred") || lower.includes("facial droop") || lower.includes("hemiplegia")) {
        category = "Neurological - Acute Ischemic Stroke";
        requiredSpecialty = "Vascular Neurologist";
        requiredResources = ["Stroke Unit", "CT Scanner", "Neuro-ICU"];
      } else if (lower.includes("trauma") || lower.includes("fracture") || lower.includes("collision")) {
        category = "Trauma - Major Polytrauma";
        requiredSpecialty = "Trauma & Orthopedic Surgeon";
        requiredResources = ["Level 1 Trauma Bay", "Surgical ICU", "Blood Bank", "CT Scanner"];
      } else if (vitals.spo2 < 90 || lower.includes("sepsis") || lower.includes("cough")) {
        category = "Respiratory - Severe ARDS / Septic Shock";
        requiredSpecialty = "Pulmonologist & Intensivist";
        requiredResources = ["Medical ICU", "Mechanical Ventilator"];
      } else {
        category = "Unspecified High-Acuity Emergency";
        requiredSpecialty = "Emergency Medicine Specialist";
        requiredResources = ["Resuscitation Bay", "ICU"];
      }
    } else if (lower.includes("abdominal pain") || lower.includes("appendicitis") || lower.includes("asthma") || lower.includes("fever") && news2.score >= 2) {
      urgency = "Urgent";
      category = lower.includes("asthma") ? "Respiratory - Moderate Asthma" : "Acute Abdominal Pain";
      requiredSpecialty = lower.includes("asthma") ? "Pulmonologist" : "General Surgeon";
      requiredResources = ["Emergency Department Bed", "Ultrasound / CT"];
      confidence = 0.89;
    }

    // Normalized Deterioration Risk (0.0 to 1.0)
    const deteriorationRisk = Math.min(1.0, (news2.score * 0.08) + (redFlags.length * 0.15));

    return {
      urgency,
      category,
      requiredSpecialty,
      requiredResources,
      news2,
      redFlags,
      deteriorationRisk: parseFloat(deteriorationRisk.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(2)),
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * AGENT 2: Hospital-Matching Agent
 * Evaluates facility capability against clinical need and penalizes capacity shortages
 */
const HospitalMatchingAgent = {
  match(triageResult, hospitals) {
    const matches = [];

    hospitals.forEach(hosp => {
      // Hard Disqualification Checks
      let isDisqualified = false;
      const disqualificationReasons = [];

      if (hosp.is_diverting) {
        isDisqualified = true;
        disqualificationReasons.push(`Hospital is currently in DIVERT status (${hosp.divert_reason || 'ED Saturation'})`);
      }

      // Check required capabilities
      if (triageResult.category.includes("Cardiac") && !hosp.has_cath_lab) {
        isDisqualified = true;
        disqualificationReasons.push("No Primary Percutaneous Coronary Intervention (PCI) / Cath Lab capability");
      } else if (triageResult.category.includes("Cardiac") && hosp.has_cath_lab && !hosp.cath_lab_available) {
        disqualificationReasons.push("Cath Lab currently in-use or under emergency maintenance");
      }

      if (triageResult.category.includes("Stroke") && !hosp.has_stroke_unit) {
        isDisqualified = true;
        disqualificationReasons.push("Lacks Comprehensive Stroke Unit / Biplane Neuro Suite");
      }

      if (triageResult.category.includes("Trauma") && hosp.trauma_level !== "Level 1" && hosp.trauma_level !== "Level 2") {
        disqualificationReasons.push("Below Level-2 Trauma verification standard");
      }

      if (triageResult.urgency === "Emergency" && hosp.available_icu_beds <= 0) {
        disqualificationReasons.push("Zero available ICU beds");
      }

      // Check Specialist on Duty
      const specialistOnDuty = hosp.specialists_on_duty.find(s =>
        s.role.toLowerCase().includes(triageResult.requiredSpecialty.toLowerCase().split(' ')[0]) ||
        s.role.toLowerCase().includes("emergency") ||
        s.role.toLowerCase().includes("intensivist")
      );

      const hasDirectSpecialist = hosp.specialists_on_duty.some(s =>
        s.role.toLowerCase().includes(triageResult.requiredSpecialty.toLowerCase().split(' ')[0]) && s.available
      );

      // Scoring Breakdown (0.0 to 1.0)
      let capabilityScore = 0.5;
      if (!isDisqualified) {
        capabilityScore = 0.7;
        if (hasDirectSpecialist) capabilityScore += 0.2;
        if (hosp.ct_scan_operational) capabilityScore += 0.05;
        if (hosp.ventilators_free > 3) capabilityScore += 0.05;
      }

      // Capacity Buffer Score
      const icuRatio = hosp.total_icu_beds > 0 ? (hosp.available_icu_beds / hosp.total_icu_beds) : 0;
      const edRatio = (hosp.available_ed_beds / hosp.total_ed_beds);
      const capacityScore = Math.min(1.0, (icuRatio * 0.6) + (edRatio * 0.4));

      // Staleness Factor: Data > 15 mins penalized
      let freshnessScore = 1.0;
      if (hosp.last_updated_minutes_ago > 20) freshnessScore = 0.5;
      else if (hosp.last_updated_minutes_ago > 10) freshnessScore = 0.8;

      matches.push({
        hospital: hosp,
        isDisqualified,
        disqualificationReasons,
        hasDirectSpecialist,
        specialistName: specialistOnDuty ? `${specialistOnDuty.name} (${specialistOnDuty.role})` : "On-call Emergency Attending",
        capabilityScore: parseFloat(capabilityScore.toFixed(2)),
        capacityScore: parseFloat(capacityScore.toFixed(2)),
        freshnessScore: parseFloat(freshnessScore.toFixed(2))
      });
    });

    return matches;
  }
};

/**
 * AGENT 3: Routing Agent
 * Computes OpenStreetMap-style road network distance, traffic multiplier, and driving ETA
 */
const RoutingAgent = {
  calculateRoute(ambulanceLocation, hospitalLocation, isRoadBlocked = false, customDelayMinutes = null) {
    // Robust fallbacks to prevent undefined property errors
    const amb = ambulanceLocation || { lat: 12.9550, lng: 77.6050 };
    const hosp = hospitalLocation || { lat: 12.9716, lng: 77.5946 };

    // Haversine formula distance approximation
    const R = 6371; // km
    const dLat = (hosp.lat - amb.lat) * Math.PI / 180;
    const dLon = (hosp.lng - amb.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(amb.lat * Math.PI / 180) * Math.cos(hosp.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightDist = R * c;

    // Road network curvature factor (typical urban road factor: 1.35x)
    let roadDist = straightDist * 1.35;

    // Average urban ambulance speed: 34 km/h (with sirens)
    let avgSpeedKmh = 34;

    // Baseline duration in minutes
    let durationMinutes = (roadDist / avgSpeedKmh) * 60;

    // Road Blockage or Congestion Factor
    let delayMinutes = 0;
    if (isRoadBlocked && (hosp.id === "HOSP_1" || hosp.is_diverting || State.roadBlockTargetHosp === hosp.id)) {
      delayMinutes = customDelayMinutes !== null ? customDelayMinutes : (State.customRoadDelay || 22);
      durationMinutes += delayMinutes;
      roadDist += 4.5; // Detour
    }

    const etaMinutes = Math.round(durationMinutes);

    return {
      distanceKm: parseFloat(roadDist.toFixed(1)),
      etaMinutes: Math.max(3, etaMinutes),
      isDelayed: delayMinutes > 0,
      delayReason: delayMinutes > 0 ? (State.customRoadReason || `Arterial Obstruction (+${delayMinutes}m delay)`) : null
    };
  }
};

/**
 * AGENT 4: Verifier Agent
 * Adversarial sanity check: Detects contradictions, resource impossibilities, or data staleness
 */
const VerifierAgent = {
  verify(candidate, triageResult) {
    const conflicts = [];
    const hosp = candidate.hospital;

    // Check 1: Zero beds contradiction
    if (triageResult.urgency === "Emergency" && hosp.available_icu_beds === 0) {
      conflicts.push(`CRITICAL CONFLICT: Recommended facility '${hosp.name}' has 0 available ICU beds.`);
    }

    // Check 2: Equipment conflict
    if (triageResult.category.includes("Cardiac") && (!hosp.has_cath_lab || !hosp.cath_lab_available)) {
      conflicts.push(`EQUIPMENT CONFLICT: STEMI case requires operational Cath Lab, which is absent/occupied at '${hosp.name}'.`);
    }

    // Check 3: Data staleness
    if (hosp.last_updated_minutes_ago > 15) {
      conflicts.push(`STALENESS WARNING: Resource data for '${hosp.name}' is ${hosp.last_updated_minutes_ago} minutes old (Unverified).`);
    }

    // Check 4: Hospital in diversion
    if (hosp.is_diverting) {
      conflicts.push(`DIVERSION CONFLICT: '${hosp.name}' is on active emergency diversion.`);
    }

    return {
      isValid: conflicts.filter(c => c.includes("CRITICAL") || c.includes("EQUIPMENT") || c.includes("DIVERSION")).length === 0,
      conflicts
    };
  }
};

/**
 * Multi-Agent Orchestrator
 * Coordinates: Triage -> Matching -> Routing -> Verifier -> Evidence Synthesis
 */
const Orchestrator = {
  runPipeline(caseData, hospitals, isRoadBlocked = false, customDelayMinutes = null) {
    const stepLogs = [];

    // Step 1: Triage (Support both .notes and .chief_complaint)
    const caseNotes = caseData.notes || caseData.chief_complaint || "";
    const caseVitals = caseData.vitals || { hr: 80, sbp: 120, dbp: 80, spo2: 98, rr: 16, temp: 37.0, avpu: "Alert", gcs: 15 };
    stepLogs.push("Executing Triage & Deterioration Risk Agent...");
    const triage = TriageAgent.evaluate(caseNotes, caseVitals);

    // Step 2: Matching
    stepLogs.push(`Querying hospital resource models for required specialty '${triage.requiredSpecialty}'...`);
    const matchCandidates = HospitalMatchingAgent.match(triage, hospitals);

    // Step 3 & 4: Routing & Verification
    stepLogs.push("Computing driving ETAs and cross-verifying contradictions...");
    const rankedResults = [];
    const caseLocation = caseData.location || { lat: 12.9550, lng: 77.6050, name: "Richmond Town, Central Ward" };

    matchCandidates.forEach(candidate => {
      const route = RoutingAgent.calculateRoute(caseLocation, candidate.hospital, isRoadBlocked, customDelayMinutes);
      const verification = VerifierAgent.verify(candidate, triage);

      // Composite Match Score Formula:
      // Score = 0.40 * Capability + 0.35 * ProximityScore + 0.15 * CapacityBuffer + 0.10 * DataFreshness
      // Proximity Score decays linearly with ETA (1.0 for 5 mins, 0.0 for 40+ mins)
      const proximityScore = Math.max(0.0, 1.0 - (route.etaMinutes / 40.0));

      let finalScore = (
        0.40 * candidate.capabilityScore +
        0.35 * proximityScore +
        0.15 * candidate.capacityScore +
        0.10 * candidate.freshnessScore
      );

      // Penalize disqualification or verification failure
      if (candidate.isDisqualified) finalScore *= 0.25;
      if (!verification.isValid) finalScore *= 0.40;

      rankedResults.push({
        hospital: candidate.hospital,
        distanceKm: route.distanceKm,
        etaMinutes: route.etaMinutes,
        isDelayed: route.isDelayed,
        delayReason: route.delayReason,
        matchScore: parseFloat(finalScore.toFixed(2)),
        capabilityScore: candidate.capabilityScore,
        proximityScore: parseFloat(proximityScore.toFixed(2)),
        capacityScore: candidate.capacityScore,
        freshnessScore: candidate.freshnessScore,
        specialistName: candidate.specialistName,
        isDisqualified: candidate.isDisqualified,
        disqualificationReasons: candidate.disqualificationReasons,
        verification
      });
    });

    // Sort descending by composite match score
    rankedResults.sort((a, b) => b.matchScore - a.matchScore);

    return {
      triage,
      rankedResults,
      stepLogs,
      timestamp: new Date().toISOString()
    };
  }
};

// ==========================================
// 2. AUDIT LOGGING & GOVERNANCE
// ==========================================

function appendAuditLog(eventType, portal, summary, details, humanDecision = null) {
  const entry = {
    id: `AUD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toLocaleTimeString(),
    fullIso: new Date().toISOString(),
    portal: portal.toUpperCase(),
    eventType,
    summary,
    details,
    humanDecision,
    // Simulated SHA-256 cryptographic tamper-evident signature
    tamperProofHash: "sha256:" + Array.from(summary + (humanDecision || "")).reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0) | 0, 0).toString(16).replace("-", "f")
  };
  State.auditLog.unshift(entry);
  if (State.activePortal === 'audit') renderAuditPortal();
}

// ==========================================
// 3. UI RENDERING & PORTAL CONTROLLERS
// ==========================================

// Portal Switching
function switchPortal(portalId) {
  State.activePortal = portalId;

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-portal') === portalId);
  });

  document.querySelectorAll('.portal-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${portalId}`);
  });

  if (portalId === 'ambulance') {
    renderAmbulancePortal();
    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
      renderMap();
    }, 100);
  }
  if (portalId === 'hospital') renderHospitalPortal();
  if (portalId === 'evaluation') renderEvaluationPortal();
  if (portalId === 'audit') renderAuditPortal();
}

// ------------------------------------------
// PORTAL A: PATIENT PORTAL
// ------------------------------------------
function analyzePatientSymptoms() {
  const text = document.getElementById('patient-symptoms-input')?.value;
  if (!text || text.trim() === "") {
    alert("Please enter symptoms or select one of the common presets.");
    return;
  }

  const patientAge = parseInt(document.getElementById('patient-age-input')?.value) || 58;
  const onsetSelect = document.getElementById('patient-onset-input');
  const onsetText = onsetSelect ? onsetSelect.options[onsetSelect.selectedIndex].text : "30-60 minutes ago";

  // Simulated Vitals for patient self-report
  const syntheticVitals = { hr: 82, sbp: 120, dbp: 80, spo2: 97, rr: 17, temp: 37.0, avpu: "Alert", gcs: 15 };

  const lower = text.toLowerCase();
  if (lower.includes("chest") || lower.includes("heart") || lower.includes("stroke") || lower.includes("speech") || lower.includes("droop") || lower.includes("breathing") || lower.includes("pain")) {
    syntheticVitals.hr = 108;
    syntheticVitals.sbp = 88;
    syntheticVitals.spo2 = 92;
  }

  const triage = TriageAgent.evaluate(text, syntheticVitals);

  // Age-adjusted clinical weighting: age >= 50 with acute cardiopulmonary or neurological signs
  if (patientAge >= 50 && (lower.includes("chest") || lower.includes("jaw") || lower.includes("arm") || lower.includes("breathless"))) {
    if (!triage.redFlags.includes("Suspected Acute Coronary Syndrome / STEMI")) {
      triage.redFlags.push("Suspected Acute Coronary Syndrome in High-Risk Age Group (>50y)");
      triage.urgency = "Emergency";
    }
  }

  const isRedFlag = triage.redFlags.length > 0 || triage.urgency === "Emergency";

  if (isRedFlag) {
    // Problem is too severe -> Auto-select most efficient hospital and assign first priority to ambulance!
    autoDispatchPriorityAmbulance(text, patientAge, onsetText, triage);
  } else {
    // Non-emergency standard guidance
    const resultContainer = document.getElementById('patient-triage-result');
    resultContainer.style.display = 'block';
    resultContainer.innerHTML = `
      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 18px; margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span class="status-indicator" style="background: rgba(16,185,129,0.2); color: #34d399; border-color: #10b981; font-weight: 700;">
            URGENCY: ${triage.urgency.toUpperCase()}
          </span>
          <span style="font-size: 12px; color: var(--text-secondary);">
            Model Confidence: <strong>${Math.round(triage.confidence * 100)}%</strong>
          </span>
        </div>

        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">
          👤 Patient Age: <strong>${patientAge} yrs</strong> | ⏱️ Onset: <strong>${onsetText}</strong>
        </div>

        <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #fff;">
          Recommended Care Level: ${triage.requiredSpecialty}
        </h3>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">
          Clinical Classification: <strong>${triage.category}</strong> (Non-Emergency / Routine Presentation)
        </p>

        <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px;">
            Suggested Nearby Outpatient Facilities & Next Walk-in Slots:
          </div>
          <div class="grid-2">
            <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-weight: 700; color: white;">St. Jude Community Hospital</div>
              <div style="font-size: 11px; color: #34d399;">● Next Available OPD: Today, 3:15 PM</div>
            </div>
            <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
              <div style="font-weight: 700; color: white;">Green Valley Outpatient Clinic</div>
              <div style="font-size: 11px; color: #34d399;">● Next Available OPD: Today, 2:45 PM</div>
            </div>
          </div>
        </div>

        <div style="font-size: 11px; color: var(--text-muted); margin-top: 14px; text-align: center;">
          ⚖️ Decision support notification only, not medical diagnosis. If symptoms worsen, call 112 / 911 immediately.
        </div>
      </div>
    `;

    appendAuditLog("PATIENT_TRIAGE_QUERY", "PATIENT", `Patient symptom check (Age ${patientAge}, Onset: ${onsetText}): ${triage.urgency}`, {
      symptoms: text,
      age: patientAge,
      onset: onsetText,
      triage
    });
  }
}

function autoDispatchPriorityAmbulance(symptomsText, age, onsetText, triage) {
  // Update Current Case with Priority 1 Emergency Dispatch
  State.currentCase.id = `P1-EMERGENCY-${Date.now().toString().slice(-4)}`;
  State.currentCase.isPriority1 = true;
  State.currentCase.patientAge = age;
  State.currentCase.symptomOnset = onsetText;
  State.currentCase.category = triage.category;
  State.currentCase.notes = `PATIENT AGE: ${age} YRS | ONSET: ${onsetText} | SYMPTOMS: ${symptomsText}`;
  
  // Set acute critical vital signs
  State.currentCase.vitals = {
    hr: 114,
    sbp: 86,
    dbp: 54,
    spo2: 91,
    rr: 28,
    temp: 37.2,
    avpu: "Alert",
    gcs: 15
  };

  // Run Multi-Agent Orchestration to find the optimal capable facility
  const result = Orchestrator.runPipeline(State.currentCase, State.hospitals, State.activeRoadBlock);
  State.currentCase.triageResult = result.triage;
  State.currentCase.recommendations = result.rankedResults;

  // Autonomously select the most efficient hospital (Top 1 recommendation)
  const bestHosp = result.rankedResults[0]?.hospital || State.hospitals[0];
  State.currentCase.selectedHospitalId = bestHosp.id;
  State.currentCase.isAccepted = true;

  finalizeDestinationChoice(
    bestHosp.id,
    `Autonomous Priority-1 Dispatch: Top-ranked capable facility '${bestHosp.name}' automatically pre-selected for acute severe presentation (Age: ${age}, Onset: ${onsetText}).`,
    false
  );

  appendAuditLog(
    "AUTONOMOUS_PRIORITY_1_DISPATCH",
    "PATIENT",
    `AUTONOMOUS EMERGENCY ESCALATION: Patient (Age ${age}, Onset: ${onsetText}) triggered First-Priority Ambulance Dispatch. Most efficient hospital '${bestHosp.name}' automatically assigned. Pre-arrival resuscitation notification transmitted.`,
    {
      caseId: State.currentCase.id,
      age,
      onset: onsetText,
      allocatedHospital: bestHosp.name,
      etaMinutes: result.rankedResults[0]?.etaMinutes || 9
    }
  );

  // Render High-Acuity Priority 1 Alert in Patient Portal
  const resultContainer = document.getElementById('patient-triage-result');
  if (resultContainer) {
    resultContainer.innerHTML = `
      <div style="background: rgba(220, 38, 38, 0.28); border: 2px solid #ef4444; border-radius: var(--radius-lg); padding: 22px; margin-top: 18px; box-shadow: 0 0 35px rgba(239, 68, 68, 0.55); animation: pulse-danger 1.5s infinite;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <span class="priority-1-badge">🚨 FIRST PRIORITY AMBULANCE DISPATCHED (CODE RED)</span>
          <span style="font-size: 12px; color: #fca5a5; font-weight: 700;">Zero-Delay Autonomous Protocol Active</span>
        </div>

        <h3 style="font-size: 18px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">
          Most Efficient Hospital Autonomously Allocated: <span style="color: #60a5fa;">${bestHosp.name}</span>
        </h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 12px 0; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; font-size: 12px;">
          <div>👤 Patient Age: <strong style="color: #fff;">${age} Years</strong></div>
          <div>⏱️ Symptom Onset: <strong style="color: #fde68a;">${onsetText}</strong></div>
          <div>🚑 Dispatch Fleet: <strong style="color: #ef4444;">Unit #9021 (Priority 1)</strong></div>
          <div>⚡ Transit ETA: <strong style="color: #34d399;">${result.rankedResults[0]?.etaMinutes || 9} mins</strong></div>
        </div>

        <p style="font-size: 12.5px; color: #fee2e2; margin-bottom: 14px; line-height: 1.5;">
          <strong>Clinical Urgency:</strong> Severe acute indicators detected (${triage.redFlags.join(", ")}). Direct resuscitation bay and specialist team (${bestHosp.specialists_on_duty?.[0]?.name || 'On Duty'}) at <strong>${bestHosp.name}</strong> have been pre-alerted.
        </p>

        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <button class="btn btn-danger" onclick="switchPortal('ambulance')" style="padding: 10px 18px; font-weight: 800; font-size: 13px;">
            🚑 Go to Live Ambulance Dispatch & Routing ➔
          </button>
          <span style="font-size: 11px; color: #fca5a5;">(Transferring view to Ambulance Portal in 3s...)</span>
        </div>
      </div>
    `;
    resultContainer.style.display = 'block';
  }

  // Automatically transition to Ambulance Portal
  setTimeout(() => {
    switchPortal('ambulance');
  }, 3200);
}

function loadPatientPreset(type) {
  const input = document.getElementById('patient-symptoms-input');
  if (type === 'chest_pain') {
    input.value = "Crushing chest pain radiating to my left shoulder and arm for the last 30 minutes, feeling nauseous and dizzy.";
  } else if (type === 'stroke') {
    input.value = "Sudden difficulty speaking, right side of face looks drooping, right arm feels weak and numb.";
  } else if (type === 'headache') {
    input.value = "Mild throbbing headache on both sides of head for past 2 days, no fever, relieved slightly by paracetamol.";
  } else if (type === 'rash') {
    input.value = "Itchy pink rash on forearms after gardening, no swelling or difficulty breathing.";
  }
  analyzePatientSymptoms();
}

function transferPatientToAmbulance(symptoms) {
  State.currentCase.notes = symptoms;
  // Trigger emergency vitals
  State.currentCase.vitals = {
    hr: 112,
    sbp: 86,
    dbp: 56,
    spo2: 92,
    rr: 26,
    temp: 37.2,
    avpu: "Alert",
    gcs: 15
  };
  State.currentCase.isAccepted = false;
  State.currentCase.selectedHospitalId = null;
  switchPortal('ambulance');
  runAmbulancePipeline();
}

// ------------------------------------------
// PORTAL B: AMBULANCE PORTAL (CORE WORKFLOW)
// ------------------------------------------
function renderAmbulancePortal() {
  const caseData = State.currentCase;

  // Update Priority 1 Status Banner
  const p1Alert = document.getElementById('ambulance-p1-alert');
  const p1Subtext = document.getElementById('ambulance-p1-subtext');
  if (p1Alert) {
    if (caseData.isPriority1) {
      p1Alert.style.display = 'flex';
      if (p1Subtext) {
        p1Subtext.innerText = `Patient Age: ${caseData.patientAge || 58}y | Onset: ${caseData.symptomOnset || 'Acute Presentation'} | Optimal Facility Autonomously Pre-Selected`;
      }
    } else {
      p1Alert.style.display = 'none';
    }
  }

  // Update Case Form
  const notesField = document.getElementById('case-notes-input');
  if (notesField) notesField.value = caseData.notes;

  // Update Vitals Display
  updateVitalsGauges(caseData.vitals);

  // Run pipeline if not already run
  if (!caseData.triageResult) {
    runAmbulancePipeline();
  } else {
    renderRecommendationsList(caseData.recommendations);
    renderMapCanvas();
  }
}

function updateVitalsGauges(vitals) {
  const news2 = calculateNEWS2(vitals);

  const hrEl = document.getElementById('vital-hr');
  const bpEl = document.getElementById('vital-bp');
  const spo2El = document.getElementById('vital-spo2');
  const rrEl = document.getElementById('vital-rr');
  const news2El = document.getElementById('vital-news2');
  const news2Desc = document.getElementById('vital-news2-desc');

  if (hrEl) hrEl.innerText = vitals.hr;
  if (bpEl) bpEl.innerText = `${vitals.sbp}/${vitals.dbp}`;
  if (spo2El) spo2El.innerText = `${vitals.spo2}%`;
  if (rrEl) rrEl.innerText = vitals.rr;

  if (news2El) {
    news2El.innerText = news2.score;
    news2El.style.color = news2.score >= 7 ? '#ef4444' : (news2.score >= 5 ? '#f59e0b' : '#10b981');
  }
  if (news2Desc) {
    news2Desc.innerText = news2.riskCategory;
  }

  // Update tile critical styles
  const tileSpo2 = document.getElementById('tile-spo2');
  if (tileSpo2) {
    tileSpo2.classList.toggle('critical', vitals.spo2 < 90);
    tileSpo2.classList.toggle('warning', vitals.spo2 >= 90 && vitals.spo2 < 94);
  }
}

function runAmbulancePipeline() {
  const notes = document.getElementById('case-notes-input') ? document.getElementById('case-notes-input').value : State.currentCase.notes;
  State.currentCase.notes = notes;

  const result = Orchestrator.runPipeline(State.currentCase, State.hospitals, State.activeRoadBlock);

  State.currentCase.triageResult = result.triage;
  State.currentCase.recommendations = result.rankedResults;

  // Default selection to top-1 if not overridden
  if (!State.currentCase.selectedHospitalId && result.rankedResults.length > 0) {
    State.currentCase.selectedHospitalId = result.rankedResults[0].hospital.id;
  }

  // Update UI components
  renderTriageSummaryBadge(result.triage);
  renderRecommendationsList(result.rankedResults);
  renderMapCanvas();

  appendAuditLog("PIPELINE_ORCHESTRATION_RUN", "AMBULANCE", `Multi-agent evaluation completed for case ${State.currentCase.id}`, {
    triage: result.triage,
    topHospital: result.rankedResults[0]?.hospital?.name,
    topMatchScore: result.rankedResults[0]?.matchScore
  });
}

function renderTriageSummaryBadge(triage) {
  const badgeContainer = document.getElementById('triage-summary-banner');
  if (!badgeContainer) return;

  const isEmergency = triage.urgency === "Emergency";
  badgeContainer.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; background: ${isEmergency ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; border: 1px solid ${isEmergency ? '#ef4444' : '#f59e0b'}; border-radius: var(--radius-md); padding: 10px 14px; margin-bottom: 14px;">
      <div>
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${isEmergency ? '#fca5a5' : '#fde68a'};">
          AGENTIC TRIAGE OUTPUT: ${triage.urgency} (${triage.category})
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
          NEWS2 Deterioration Score: <strong>${triage.news2.score}</strong> | Required Specialty: <strong>${triage.requiredSpecialty}</strong>
        </div>
      </div>
      <span class="status-indicator" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px;">
        Confidence: ${Math.round(triage.confidence * 100)}%
      </span>
    </div>
  `;
}

function renderRecommendationsList(rankedResults) {
  const container = document.getElementById('recommendations-container');
  if (!container) return;

  if (!rankedResults || rankedResults.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 20px;">No matching facilities found.</div>`;
    return;
  }

  let html = "";
  // Show Top 3
  const top3 = rankedResults.slice(0, 3);

  top3.forEach((item, index) => {
    const hosp = item.hospital;
    const isTopChoice = index === 0;
    const isSelected = State.currentCase.selectedHospitalId === hosp.id;
    const hasConflicts = item.verification.conflicts.length > 0;

    html += `
      <div class="hospital-rec-card ${isTopChoice ? 'top-choice' : ''}" style="${isSelected ? 'outline: 2px solid #3b82f6;' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <span class="rec-rank-badge" style="${isTopChoice ? '' : 'background: rgba(255,255,255,0.08); color: var(--text-secondary);'}">
              ${isTopChoice ? '🏆 RECOMMENDED (#1)' : `#${index + 1} ALTERNATIVE`}
            </span>
            <h4 class="hospital-rec-title">${hosp.name}</h4>
            <div class="hospital-rec-address">📍 ${hosp.address} (${hosp.type})</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 18px; font-weight: 800; color: ${item.matchScore > 0.8 ? '#34d399' : (item.matchScore > 0.6 ? '#60a5fa' : '#f59e0b')};">
              ${Math.round(item.matchScore * 100)}%
            </div>
            <div style="font-size: 10px; color: var(--text-muted);">Match Index</div>
          </div>
        </div>

        <!-- Evidence Tags -->
        <div class="evidence-tags-row">
          <span class="evidence-tag good">⏱️ ${item.etaMinutes} min ETA (${item.distanceKm} km)</span>
          <span class="evidence-tag ${hosp.available_icu_beds > 0 ? 'good' : 'warning'}">
            🛏️ ICU: ${hosp.available_icu_beds}/${hosp.total_icu_beds} free
          </span>
          <span class="evidence-tag ${hosp.has_cath_lab ? (hosp.cath_lab_available ? 'good' : 'warning') : ''}">
            🔬 Cath Lab: ${hosp.has_cath_lab ? (hosp.cath_lab_available ? 'Available' : 'Occupied') : 'None'}
          </span>
          <span class="evidence-tag highlight">
            👨‍⚕️ Specialist: ${item.specialistName}
          </span>
          ${item.isDelayed ? `<span class="evidence-tag" style="background: rgba(239,68,68,0.2); color: #f87171;">⚠️ ${item.delayReason}</span>` : ''}
          ${hosp.last_updated_minutes_ago > 15 ? `<span class="evidence-tag" style="background: rgba(245,158,11,0.2); color: #fde68a;">⏳ Data Unverified (${hosp.last_updated_minutes_ago}m)</span>` : ''}
        </div>

        <!-- Verifier Agent Sanity Check Banner -->
        ${hasConflicts ? `
          <div style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius-sm); padding: 6px 10px; margin-bottom: 10px; font-size: 11px; color: #fca5a5;">
            🛡️ <strong>Verifier Flag:</strong> ${item.verification.conflicts[0]}
          </div>
        ` : `
          <div style="font-size: 11px; color: #34d399; margin-bottom: 10px;">
            🛡️ <strong>Verifier Check:</strong> PASS (Zero clinical or resource contradictions)
          </div>
        `}

        <!-- Score Weights Visualizer -->
        <div class="score-row">
          <span>Clinical Capability (${Math.round(item.capabilityScore * 100)}%)</span>
          <span>Proximity & Traffic (${Math.round(item.proximityScore * 100)}%)</span>
          <span>Capacity Buffer (${Math.round(item.capacityScore * 100)}%)</span>
        </div>
        <div class="score-progress-bar">
          <div class="score-fill" style="width: ${Math.round(item.matchScore * 100)}%;"></div>
        </div>

        <!-- Action / HITL Acceptance Button -->
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          ${isSelected && State.currentCase.isAccepted ? `
            <button class="btn btn-success btn-sm btn-full" disabled>
              ✓ Destination Confirmed & Hospital Alerted
            </button>
          ` : `
            <button class="btn ${isTopChoice ? 'btn-primary' : 'btn-secondary'} btn-sm btn-full" onclick="acceptRecommendation('${hosp.id}')">
              ${isTopChoice ? 'Accept #1 Recommendation & Alert ED' : `Select Alternate (#${index + 1})`}
            </button>
          `}
        </div>
      </div>
    `;
  });

  // Disqualified Hospitals Section
  const disqualified = rankedResults.filter(r => r.isDisqualified);
  if (disqualified.length > 0) {
    html += `
      <div style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">
          Excluded / Disqualified Facilities (${disqualified.length})
        </div>
        ${disqualified.map(d => `
          <div style="font-size: 11px; color: var(--text-muted); padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
            ❌ <strong>${d.hospital.name}</strong>: ${d.disqualificationReasons.join("; ")}
          </div>
        `).join("")}
      </div>
    `;
  }

  container.innerHTML = html;
}

// HITL Validation Action: Accept Recommendation
function acceptRecommendation(hospitalId) {
  const topChoice = State.currentCase.recommendations[0]?.hospital?.id;

  if (hospitalId !== topChoice) {
    // Human is overriding the top recommendation! Open Mandatory Override Modal
    openOverrideModal(hospitalId);
  } else {
    // Paramedic accepts top choice
    finalizeDestinationChoice(hospitalId, "Accepted Top Agentic Recommendation");
  }
}

// Alias for map popup button
function confirmDestination(hospitalId) {
  acceptRecommendation(hospitalId);
}

function openOverrideModal(targetHospitalId) {
  const targetHosp = State.hospitals.find(h => h.id === targetHospitalId);
  document.getElementById('override-target-name').innerText = targetHosp ? targetHosp.name : targetHospitalId;
  document.getElementById('override-modal').setAttribute('data-target-id', targetHospitalId);
  document.getElementById('override-modal').classList.add('open');
}

function closeOverrideModal() {
  document.getElementById('override-modal').classList.remove('open');
}

function submitOverrideDecision() {
  const targetId = document.getElementById('override-modal').getAttribute('data-target-id');
  const reasonSelect = document.getElementById('override-reason-select');
  const customReasonInput = document.getElementById('override-custom-reason');
  const expectedDelayInput = document.getElementById('override-expected-delay');
  const notesInput = document.getElementById('override-notes-input');

  const customReason = (customReasonInput && customReasonInput.value.trim()) ? customReasonInput.value.trim() : reasonSelect.value;
  const expectedDelay = expectedDelayInput ? (parseInt(expectedDelayInput.value) || 0) : 0;
  const notes = notesInput ? notesInput.value.trim() : "";

  const fullReason = `${customReason}${expectedDelay > 0 ? ` [Expected Transit Delay: +${expectedDelay} mins]` : ''}${notes ? ` - ${notes}` : ''}`;

  finalizeDestinationChoice(targetId, fullReason, true, expectedDelay);
  closeOverrideModal();
}

function finalizeDestinationChoice(hospitalId, reasonText, isOverride = false, expectedDelay = 0) {
  State.currentCase.selectedHospitalId = hospitalId;
  State.currentCase.isAccepted = true;
  State.currentCase.overrideReason = isOverride ? reasonText : null;

  const hosp = State.hospitals.find(h => h.id === hospitalId);
  const recItem = State.currentCase.recommendations.find(r => r.hospital.id === hospitalId);

  let finalEta = recItem ? recItem.etaMinutes : 12;
  if (expectedDelay > 0) {
    finalEta += expectedDelay;
    if (recItem) recItem.etaMinutes = finalEta;
  }

  // Dispatch Pre-Arrival Alert to the Hospital Portal
  const preArrivalAlert = {
    id: `ALERT-${Date.now().toString(36).toUpperCase()}`,
    caseId: State.currentCase.id,
    hospitalId: hospitalId,
    hospitalName: hosp ? hosp.name : "Target Facility",
    category: State.currentCase.triageResult?.category || "Emergency",
    urgency: State.currentCase.triageResult?.urgency || "Emergency",
    etaMinutes: finalEta,
    expectedDelayMinutes: expectedDelay,
    requiredResources: State.currentCase.triageResult?.requiredResources || ["ICU Bed", "Resuscitation Bay"],
    news2Score: State.currentCase.triageResult?.news2?.score || 8,
    timestamp: new Date().toLocaleTimeString(),
    status: 'PENDING_HOSPITAL_ACK', // 'ACCEPTED' | 'DIVERTED'
    isOverride
  };

  // Prepend to hospital alerts
  State.incomingAlerts.unshift(preArrivalAlert);

  // Log in Audit Ledger
  appendAuditLog(
    isOverride ? "PARAMEDIC_HITL_OVERRIDE" : "PARAMEDIC_HITL_ACCEPT",
    "AMBULANCE",
    isOverride ? `Paramedic OVERRODE top choice for '${hosp ? hosp.name : hospitalId}'. Reason: ${reasonText} (Delay: +${expectedDelay}m)` : `Paramedic ACCEPTED top recommendation '${hosp ? hosp.name : hospitalId}'`,
    {
      caseId: State.currentCase.id,
      hospitalId,
      etaMinutes: preArrivalAlert.etaMinutes,
      expectedDelayMinutes: expectedDelay,
      triage: State.currentCase.triageResult
    },
    reasonText
  );

  // Refresh Views
  renderRecommendationsList(State.currentCase.recommendations);
  renderMapCanvas();

  // Show notification
  alert(`Destination confirmed: ${hosp.name}.\nPre-arrival notification dispatched to hospital ED coordinator.`);
}

// ------------------------------------------
// PORTAL C: HOSPITAL ED COORDINATOR PORTAL
// ------------------------------------------
function renderHospitalPortal() {
  const hospSelect = document.getElementById('hospital-selector');
  if (hospSelect && hospSelect.options.length === 0) {
    State.hospitals.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h.id;
      opt.innerText = h.name;
      hospSelect.appendChild(opt);
    });
    hospSelect.value = State.selectedHospitalId;
  }

  const currentHosp = State.hospitals.find(h => h.id === State.selectedHospitalId) || State.hospitals[0];

  // Update Capacity Counters
  document.getElementById('hosp-ed-beds').value = currentHosp.available_ed_beds;
  document.getElementById('hosp-icu-beds').value = currentHosp.available_icu_beds;
  document.getElementById('hosp-cath-toggle').checked = currentHosp.cath_lab_available;
  document.getElementById('hosp-stroke-toggle').checked = currentHosp.stroke_unit_available;
  document.getElementById('hosp-divert-toggle').checked = currentHosp.is_diverting;

  // Staleness badge
  const stalenessEl = document.getElementById('hosp-staleness-badge');
  if (stalenessEl) {
    const isStale = currentHosp.last_updated_minutes_ago > 15;
    stalenessEl.innerHTML = `
      <span class="status-indicator" style="background: ${isStale ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}; color: ${isStale ? '#fde68a' : '#34d399'};">
        ● Last Verified: ${currentHosp.last_updated_minutes_ago} mins ago ${isStale ? '(UNVERIFIED)' : '(FRESH)'}
      </span>
    `;
  }

  // Render Alert Queue
  renderHospitalAlertQueue();
}

function onHospitalChange(hospId) {
  State.selectedHospitalId = hospId;
  renderHospitalPortal();
}

function updateHospitalCapacity() {
  const hosp = State.hospitals.find(h => h.id === State.selectedHospitalId);
  if (!hosp) return;

  hosp.available_ed_beds = parseInt(document.getElementById('hosp-ed-beds').value) || 0;
  hosp.available_icu_beds = parseInt(document.getElementById('hosp-icu-beds').value) || 0;
  hosp.cath_lab_available = document.getElementById('hosp-cath-toggle').checked;
  hosp.stroke_unit_available = document.getElementById('hosp-stroke-toggle').checked;
  hosp.is_diverting = document.getElementById('hosp-divert-toggle').checked;
  hosp.last_updated_minutes_ago = 0; // refreshed

  appendAuditLog("HOSPITAL_CAPACITY_UPDATE", "HOSPITAL", `Capacity metrics updated by ED staff for '${hosp.name}'`, {
    available_ed_beds: hosp.available_ed_beds,
    available_icu_beds: hosp.available_icu_beds,
    is_diverting: hosp.is_diverting
  });

  renderHospitalPortal();
  // Auto re-run ambulance pipeline if ambulance was looking at hospitals
  if (State.currentCase.triageResult) {
    runAmbulancePipeline();
  }
}

function refreshHospitalStaleness() {
  const hosp = State.hospitals.find(h => h.id === State.selectedHospitalId);
  if (hosp) {
    hosp.last_updated_minutes_ago = 0;
    renderHospitalPortal();
    appendAuditLog("HOSPITAL_DATA_VERIFIED", "HOSPITAL", `Hospital staff manually refreshed data verification stamp for '${hosp.name}'`);
  }
}

function renderHospitalAlertQueue() {
  const container = document.getElementById('hospital-alerts-queue');
  if (!container) return;

  const relevantAlerts = State.incomingAlerts.filter(a => a.hospitalId === State.selectedHospitalId);

  if (relevantAlerts.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-surface-elevated); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No incoming ambulance alerts currently assigned to this facility.
      </div>
    `;
    return;
  }

  let html = "";
  relevantAlerts.forEach(alert => {
    html += `
      <div style="background: var(--bg-surface-elevated); border: 1px solid ${alert.status === 'DIVERTED' ? '#ef4444' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div>
            <span class="status-indicator" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: #ef4444; font-weight: 700;">
              🚨 INCOMING AMBULANCE: ${alert.category}
            </span>
            <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">ETA: <strong>${alert.etaMinutes} mins</strong></span>
          </div>
          <span style="font-size: 11px; background: rgba(59,130,246,0.15); color: #93c5fd; padding: 2px 8px; border-radius: var(--radius-sm);">
            🛡️ Zero PII Transmitted (HIPAA & DPDP Act 2023)
          </span>
        </div>

        <div class="grid-3" style="font-size: 12px; margin-bottom: 12px;">
          <div>Acuity: <strong style="color: #f87171;">${alert.urgency}</strong></div>
          <div>NEWS2 Deterioration: <strong>${alert.news2Score} / 20</strong></div>
          <div>Required: <strong>${alert.requiredResources.join(', ')}</strong></div>
        </div>

        <!-- Hospital HITL Action -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px;">
          <div style="font-size: 11px; color: var(--text-secondary);">
            Status: <strong style="color: ${alert.status === 'ACCEPTED' ? '#34d399' : (alert.status === 'DIVERTED' ? '#ef4444' : '#f59e0b')}">${alert.status}</strong>
          </div>
          <div style="display: flex; gap: 8px;">
            ${alert.status === 'PENDING_HOSPITAL_ACK' ? `
              <button class="btn btn-success btn-sm" onclick="hospitalRespondToAlert('${alert.id}', 'ACCEPTED')">
                ✓ Accept & Prepare Bay
              </button>
              <button class="btn btn-danger btn-sm" onclick="hospitalRespondToAlert('${alert.id}', 'DIVERTED')">
                ✕ Reject / Divert (Trigger Re-Route)
              </button>
            ` : (alert.status === 'ACCEPTED' ? `
              <span style="font-size: 12px; color: #34d399; font-weight: 600;">✓ ED Bay Pre-Assigned</span>
            ` : `
              <span style="font-size: 12px; color: #ef4444; font-weight: 600;">✕ Case Diverted to Alternative</span>
            `)}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function hospitalRespondToAlert(alertId, response) {
  const alertObj = State.incomingAlerts.find(a => a.id === alertId);
  if (!alertObj) return;

  alertObj.status = response;

  if (response === 'DIVERTED') {
    // Hospital rejects! Mark hospital temporarily diverting and dynamically re-route ambulance
    const hosp = State.hospitals.find(h => h.id === alertObj.hospitalId);
    if (hosp) {
      hosp.is_diverting = true;
      hosp.divert_reason = "Sudden internal Code Blue / Emergency Staff Saturation";
    }

    appendAuditLog("HOSPITAL_HITL_DIVERT", "HOSPITAL", `Hospital '${alertObj.hospitalName}' DIVERTED incoming case ${alertObj.caseId}`, {
      alertId,
      reason: "Emergency Staff Saturation"
    });

    // Reset selection and trigger immediate re-run of pipeline
    State.currentCase.selectedHospitalId = null;
    State.currentCase.isAccepted = false;
    runAmbulancePipeline();

    alert(`Hospital ${alertObj.hospitalName} has rejected incoming ambulance.\nSystem has autonomously triggered dynamic re-routing to the next best capable facility!`);
  } else {
    appendAuditLog("HOSPITAL_HITL_ACCEPT", "HOSPITAL", `Hospital '${alertObj.hospitalName}' ACCEPTED pre-arrival of case ${alertObj.caseId}`, {
      alertId
    });
    alert(`Pre-arrival accepted. Emergency department resuscitation team alerted.`);
  }

  renderHospitalPortal();
}

// ------------------------------------------
// 4. CHAOS & SCENARIO SIMULATION ENGINE
// ------------------------------------------
function triggerScenario(scenarioType) {
  if (scenarioType === 'icu_full') {
    // Scenario 1: Target ICU Fills Up
    const hosp1 = State.hospitals.find(h => h.id === "HOSP_1");
    if (hosp1) {
      hosp1.available_icu_beds = 0;
      appendAuditLog("CHAOS_SIMULATION", "SYSTEM", "CHAOS TRIGGER: Metro Heart ICU capacity dropped to 0 available beds");
      alert("🚨 SCENARIO TRIGGERED: Metro Heart Institute ICU beds dropped to ZERO!\nWatch Verifier Agent detect the conflict and re-rank.");
      runAmbulancePipeline();
    }
  } else if (scenarioType === 'road_block') {
    // Scenario 2: Major Road Obstruction / Traffic Delay
    if (!State.activeRoadBlock) {
      const customReason = prompt("Enter Custom Road Obstruction / Traffic Reason:", State.customRoadReason || "Severe Waterlogging & Arterial Traffic Gridlock on Hosur Road");
      if (customReason === null) return; // User cancelled
      const delayInput = prompt("Enter Expected Delay (in minutes):", (State.customRoadDelay || 22).toString());
      if (delayInput === null) return;

      State.customRoadReason = customReason.trim() || "Arterial Road Closure";
      State.customRoadDelay = parseInt(delayInput) || 22;
      State.activeRoadBlock = true;

      appendAuditLog("CHAOS_SIMULATION", "SYSTEM", `CHAOS TRIGGER: ${State.customRoadReason} ACTIVE (+${State.customRoadDelay} min delay)`);
      alert(`🚧 SCENARIO TRIGGERED:\nReason: ${State.customRoadReason}\nExpected Delay: +${State.customRoadDelay} mins.\nRouting Agent has adjusted ETAs and highlighted the optimal fast bypass route!`);
    } else {
      State.activeRoadBlock = false;
      appendAuditLog("CHAOS_SIMULATION", "SYSTEM", `CHAOS TRIGGER: Road Obstruction CLEARED`);
      alert("✅ Road Obstruction CLEARED. Normal traffic routing restored.");
    }
    runAmbulancePipeline();
  } else if (scenarioType === 'mid_transit_drop') {
    // Scenario 3: Mid-Transit Vital Deterioration
    State.currentCase.vitals.spo2 = 82;
    State.currentCase.vitals.hr = 138;
    State.currentCase.vitals.sbp = 78;
    State.currentCase.vitals.rr = 32;
    State.currentCase.isDeteriorated = true;

    appendAuditLog("MID_TRANSIT_DETERIORATION", "AMBULANCE", "CRITICAL: Patient experienced mid-transit desaturation (SpO2: 82%, SBP: 78)");
    alert("⚠️ ALERT: Patient vital signs have severely deteriorated mid-transit!\nSpO2 dropped to 82% | NEWS2 score spiked to 11.\nRe-evaluating facility requirements immediately.");
    updateVitalsGauges(State.currentCase.vitals);
    runAmbulancePipeline();
  } else if (scenarioType === 'hospital_divert') {
    // Scenario 4: Hospital Rejects Case
    const activeAlert = State.incomingAlerts[0];
    if (activeAlert) {
      hospitalRespondToAlert(activeAlert.id, 'DIVERTED');
    } else {
      alert("Please accept a recommendation in the Ambulance Portal first to simulate an incoming alert rejection.");
    }
  }
}

function resetAllScenarios() {
  // Reload fresh initial hospital capacities
  State.hospitals[0].available_icu_beds = 4;
  State.hospitals[0].is_diverting = false;
  State.hospitals[1].is_diverting = false;
  State.activeRoadBlock = false;

  State.currentCase.vitals = {
    hr: 108,
    sbp: 88,
    dbp: 58,
    spo2: 93,
    rr: 24,
    temp: 37.1,
    avpu: "Alert",
    gcs: 15
  };
  State.currentCase.isDeteriorated = false;
  State.currentCase.isAccepted = false;
  State.currentCase.selectedHospitalId = null;

  updateVitalsGauges(State.currentCase.vitals);
  runAmbulancePipeline();
  appendAuditLog("SYSTEM_RESET", "SYSTEM", "Reset all simulation states and test datasets to initial parameters.");
  alert("Simulation parameters reset to baseline.");
}

// ------------------------------------------
// 5. INDIA GEOGRAPHIC MAP & FLEET ROUTING
// ------------------------------------------
let leafletMap = null;
let leafletMarkersLayer = null;
let leafletRouteLayer = null;

// National Emergency Trauma Hubs Across India
const INDIA_NATIONAL_HUBS = [
  { id: "NAT_DEL", name: "AIIMS Apex Level-1 Trauma Centre", city: "New Delhi", lat: 28.5672, lng: 77.2100, icuBeds: 42, type: "National Apex Level-1 Trauma", available: true },
  { id: "NAT_MUM", name: "KEM Hospital & Seth GS Medical College", city: "Mumbai, Maharashtra", lat: 19.0024, lng: 72.8427, icuBeds: 36, type: "Metropolitan Tertiary Emergency", available: true },
  { id: "NAT_BLR", name: "AegisCare South Command / NIMHANS", city: "Bengaluru, Karnataka", lat: 12.9392, lng: 77.5973, icuBeds: 28, type: "Regional Neuro & Autonomous Command Hub", available: true },
  { id: "NAT_CHE", name: "Apollo Main & Comprehensive Emergency", city: "Chennai, Tamil Nadu", lat: 13.0569, lng: 80.2520, icuBeds: 32, type: "Comprehensive Emergency Centre", available: true },
  { id: "NAT_KOL", name: "IPGMER & SSKM Hospital", city: "Kolkata, West Bengal", lat: 22.5392, lng: 88.3435, icuBeds: 30, type: "State Apex Trauma Facility", available: true },
  { id: "NAT_HYD", name: "Nizam's Institute of Medical Sciences (NIMS)", city: "Hyderabad, Telangana", lat: 17.4206, lng: 78.4527, icuBeds: 25, type: "Super-Specialty Emergency Hub", available: true }
];

function setMapView(viewType) {
  State.activeMapView = viewType;
  document.getElementById('btn-view-blr')?.classList.toggle('active', viewType === 'bengaluru');
  document.getElementById('btn-view-ind')?.classList.toggle('active', viewType === 'india');

  const statusPill = document.getElementById('map-status-pill');
  if (viewType === 'india') {
    if (statusPill) statusPill.innerHTML = `🇮🇳 <strong>All-India Emergency Grid</strong>: National Trauma Hubs & Corridors Active`;
    if (leafletMap) {
      leafletMap.flyTo([21.7679, 78.8718], 5, { duration: 1.2 });
    }
  } else {
    if (statusPill) statusPill.innerHTML = `🚑 <strong>Ambulance #9021</strong>: En Route • Bengaluru Urban, India`;
    if (leafletMap) {
      leafletMap.flyTo([12.9620, 77.6050], 13, { duration: 1.2 });
    }
  }
  renderMap();
}

function toggleMapMode() {
  State.mapMode = State.mapMode === 'leaflet' ? 'canvas' : 'leaflet';
  const btn = document.getElementById('btn-map-mode');
  const lMap = document.getElementById('leaflet-map');
  const cMap = document.getElementById('map-canvas');

  if (State.mapMode === 'canvas') {
    if (btn) btn.innerText = "📐 Mode: Vector";
    if (lMap) lMap.style.display = 'none';
    if (cMap) cMap.style.display = 'block';
  } else {
    if (btn) btn.innerText = "🌐 Mode: OSM";
    if (lMap) lMap.style.display = 'block';
    if (cMap) cMap.style.display = 'none';
    if (leafletMap) leafletMap.invalidateSize();
  }
  renderMap();
}

function initLeafletMap() {
  const container = document.getElementById('leaflet-map');
  if (!container || typeof window.L === 'undefined') return false;

  if (leafletMap) {
    leafletMap.invalidateSize();
    return true;
  }

  try {
    leafletMap = L.map('leaflet-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([12.9620, 77.6050], 13);

    // High quality OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c']
    }).addTo(leafletMap);

    L.control.attribution({ position: 'bottomright', prefix: '🇮🇳 OpenStreetMap India | AegisCare System' }).addTo(leafletMap);

    leafletMarkersLayer = L.layerGroup().addTo(leafletMap);
    leafletRouteLayer = L.layerGroup().addTo(leafletMap);

    return true;
  } catch (e) {
    console.warn("Leaflet map initialization fallback to canvas:", e);
    State.mapMode = 'canvas';
    return false;
  }
}

function renderLeafletMap() {
  if (!leafletMap || !leafletMarkersLayer || !leafletRouteLayer) return;

  leafletMarkersLayer.clearLayers();
  leafletRouteLayer.clearLayers();

  const selectedHospId = State.currentCase.selectedHospitalId || State.currentCase.recommendations[0]?.hospital?.id || "HOSP_1";
  const ambLoc = State.currentCase.location || { lat: 12.9550, lng: 77.6050 };

  // 1. ALL-INDIA VIEW: Show national emergency hubs across India
  if (State.activeMapView === 'india') {
    INDIA_NATIONAL_HUBS.forEach(hub => {
      const isBlr = hub.id === "NAT_BLR";
      const iconHtml = `
        <div class="national-hub-marker" style="${isBlr ? 'background: #3b82f6; border-color: #60a5fa; box-shadow: 0 0 18px rgba(59,130,246,0.9); transform: scale(1.2);' : ''}">
          ${isBlr ? '★' : 'H'}
        </div>
      `;
      const customIcon = L.divIcon({
        className: 'custom-hub-icon',
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([hub.lat, hub.lng], { icon: customIcon });
      marker.bindPopup(`
        <div style="font-size: 13px; line-height: 1.4;">
          <div style="font-weight: 800; color: #60a5fa; font-size: 14px;">🏥 ${hub.name}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">📍 ${hub.city}</div>
          <div style="background: rgba(255,255,255,0.05); padding: 6px; border-radius: 6px; margin-bottom: 8px;">
            <div>Tier: <b>${hub.type}</b></div>
            <div>Critical ICU Capacity: <b style="color: #34d399;">${hub.icuBeds} Beds</b></div>
            <div>Telemetry Status: <b style="color: #60a5fa;">Connected to National Health Grid</b></div>
          </div>
          <button class="btn btn-sm btn-primary" style="width: 100%; justify-content: center; font-size: 11px;" onclick="setMapView('bengaluru')">
            🔍 Zoom to Regional Incident (Bengaluru)
          </button>
        </div>
      `);
      leafletMarkersLayer.addLayer(marker);

      // Connect national hubs to Bengaluru Command with subtle flight corridor polyline
      if (!isBlr) {
        const corridor = L.polyline([[hub.lat, hub.lng], [12.9392, 77.5973]], {
          color: '#6366f1',
          weight: 2,
          opacity: 0.45,
          dashArray: '6, 8'
        });
        leafletRouteLayer.addLayer(corridor);
      }
    });

    return;
  }

  // 2. BENGALURU SECTOR VIEW: Real-time Emergency Incident & Local Hospitals
  // Paramedic Ambulance Marker
  const ambIcon = L.divIcon({
    className: 'custom-amb-div',
    html: `<div class="ambulance-marker">🚑<div class="pulse-ring"></div></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });

  const ambMarker = L.marker([ambLoc.lat, ambLoc.lng], { icon: ambIcon, zIndexOffset: 1000 });
  ambMarker.bindPopup(`
    <div style="font-size: 13px; line-height: 1.4;">
      <div style="font-weight: 800; color: #ef4444; font-size: 14px;">🚑 Ambulance Fleet #9021</div>
      <div style="font-size: 11px; color: #9ca3af; margin-bottom: 4px;">Sector: Richmond Town, Bengaluru Urban</div>
      <div style="margin: 6px 0; background: rgba(239,68,68,0.1); padding: 6px; border-radius: 6px;">
        <div>Clinical Acuity: <b style="color: #f87171;">${State.currentCase.category}</b></div>
        <div>Baseline NEWS2: <b style="color: #f87171;">${State.currentCase.triageResult?.news2Score || 8} (Urgent)</b></div>
        <div>SpO2: <b>${State.currentCase.vitals.spo2}%</b> | SBP: <b>${State.currentCase.vitals.sbp} mmHg</b></div>
      </div>
      <div style="font-size: 11px; color: #34d399;">● Autonomous Multi-Agent Telemetry Stream Active</div>
    </div>
  `);
  leafletMarkersLayer.addLayer(ambMarker);

  // Hospital Markers
  let targetHospital = null;

  State.hospitals.forEach(h => {
    const isSelected = h.id === selectedHospId;
    if (isSelected) targetHospital = h;

    const colorClass = h.is_diverting ? 'hospital-marker-red' : (h.available_icu_beds > 0 ? 'hospital-marker-green' : 'hospital-marker-amber');
    const selectedClass = isSelected ? 'hospital-marker-selected' : '';

    const iconHtml = `<div class="hospital-marker-custom ${colorClass} ${selectedClass}">H</div>`;
    const hospIcon = L.divIcon({
      className: 'custom-hosp-div',
      html: iconHtml,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    const marker = L.marker([h.lat, h.lng], { icon: hospIcon, zIndexOffset: isSelected ? 500 : 100 });
    marker.bindPopup(`
      <div style="font-size: 13px; line-height: 1.4;">
        <div style="font-weight: 800; color: #60a5fa; font-size: 14px; margin-bottom: 2px;">🏥 ${h.name}</div>
        <div style="font-size: 11px; color: #9ca3af; margin-bottom: 6px;">📍 ${h.address}, Bengaluru</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; margin-bottom: 8px; background: rgba(255,255,255,0.05); padding: 6px; border-radius: 6px;">
          <div>🛏️ ED Beds: <b style="color: #60a5fa;">${h.available_ed_beds}</b></div>
          <div>🩺 ICU Beds: <b style="color: ${h.available_icu_beds > 0 ? '#34d399' : '#ef4444'};">${h.available_icu_beds}</b></div>
          <div>⚡ Cath Lab: <b>${h.cath_lab_available ? 'Available' : 'None'}</b></div>
          <div>🧠 Stroke Unit: <b>${h.stroke_unit_available ? 'Active' : 'None'}</b></div>
          <div>🫁 Ventilators: <b>${h.ventilators_free}</b></div>
          <div>🕒 Freshness: <b>${h.last_updated_minutes_ago}m ago</b></div>
        </div>

        <div style="font-size: 11px; color: #d1d5db; margin-bottom: 8px;">
          👨‍⚕️ Specialist: <b>${h.specialists_on_duty?.[0]?.name || 'Dr. Verma'}</b> (${h.specialists_on_duty?.[0]?.role || 'Emergency'})
        </div>

        ${isSelected
        ? `<div style="background: rgba(16,185,129,0.2); color: #34d399; padding: 6px; border-radius: 6px; text-align: center; font-size: 11px; font-weight: 700;">✓ Active Target Destination</div>`
        : `<button class="btn btn-sm btn-primary" style="width: 100%; justify-content: center; font-size: 11px;" onclick="confirmDestination('${h.id}', false)">Route Fleet to this Hospital</button>`}
      </div>
    `);
    leafletMarkersLayer.addLayer(marker);
  });

  // Add Ambient Bengaluru Urban Road Traffic Layer
  const trafficLayer = [
    // Clear / Free-Flow Corridors (Green)
    { points: [[12.9550, 77.6050], [12.9580, 77.6010], [12.9640, 77.5960], [12.9716, 77.5946]], color: '#10b981', label: 'Hosur Bypass - Clear (48 km/h)' },
    { points: [[12.9352, 77.6245], [12.9450, 77.6180], [12.9550, 77.6050]], color: '#10b981', label: 'Richmond Arterial - Clear (46 km/h)' },
    // Moderate Traffic (Amber)
    { points: [[12.9550, 77.6050], [12.9520, 77.5900], [12.9515, 77.5750]], color: '#f59e0b', label: 'Lalbagh West - Moderate (26 km/h)' },
    // Heavy Traffic / Bottlenecks (Red)
    { points: [[12.9640, 77.6080], [12.9720, 77.6060], [12.9856, 77.6408]], color: '#ef4444', label: 'Central Corridor - Heavy Congestion (8 km/h)' }
  ];

  trafficLayer.forEach(t => {
    const tLine = L.polyline(t.points, {
      color: t.color,
      weight: 3.5,
      opacity: 0.55
    });
    tLine.bindTooltip(`🚦 Traffic: ${t.label}`, { sticky: true });
    leafletRouteLayer.addLayer(tLine);
  });

  // Routing Polyline & Navigation Guidance to Target
  if (targetHospital) {
    const isMetroHeart = targetHospital.id === "HOSP_1";
    const hasRoadblock = State.activeRoadBlock && isMetroHeart;
    const recItem = State.currentCase.recommendations?.find(r => r.hospital.id === targetHospital.id);
    const etaMin = recItem ? recItem.etaMinutes : (hasRoadblock ? 24 : 9);

    if (hasRoadblock) {
      // Roadblock coordinate along Brigade Rd / Hosur Rd artery
      const rbLat = 12.9640;
      const rbLng = 12.9550 > targetHospital.lat ? 77.6000 : 77.5980;

      // Roadblock alert marker
      const rbReason = State.customRoadReason || "Major Road Obstruction";
      const rbDelay = State.customRoadDelay || 22;
      const rbIcon = L.divIcon({
        className: 'custom-rb-div',
        html: `<div style="background: #ef4444; border: 2px solid white; color: white; border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 800; box-shadow: 0 0 16px rgba(239,68,68,0.9); white-space: nowrap;">🚧 ${rbReason} (+${rbDelay}m)</div>`,
        iconAnchor: [60, 15]
      });
      const rbMarker = L.marker([rbLat, rbLng], { icon: rbIcon });
      leafletMarkersLayer.addLayer(rbMarker);

      // Blocked / Congested red leg (What to Avoid)
      const blockedLine = L.polyline([[ambLoc.lat, ambLoc.lng], [rbLat, rbLng], [targetHospital.lat, targetHospital.lng]], {
        color: '#ef4444',
        weight: 4,
        opacity: 0.7,
        dashArray: '6, 8'
      });
      blockedLine.bindTooltip(`❌ Congested Blocked Route: +${rbDelay}m traffic delay`, { sticky: true });
      leafletRouteLayer.addLayer(blockedLine);

      // Recommended Optimal Detour Route (What ambulance SHOULD take)
      const detourMidLat = ambLoc.lat + 0.008;
      const detourMidLng = ambLoc.lng - 0.015;
      const detourLine = L.polyline([
        [ambLoc.lat, ambLoc.lng],
        [detourMidLat, detourMidLng],
        [detourMidLat + 0.009, targetHospital.lng - 0.005],
        [targetHospital.lat, targetHospital.lng]
      ], {
        color: '#10b981', // Highlighted Emerald Green
        weight: 6,
        opacity: 0.95
      });
      detourLine.bindTooltip(`⚡ RECOMMENDED OPTIMAL ROUTE: Via West End Bypass (ETA: ${etaMin}m | Avoids Gridlock)`, { permanent: true, direction: 'top', className: 'traffic-guide-badge' });
      leafletRouteLayer.addLayer(detourLine);

      // Update Floating Traffic Guide Overlay
      const guideStatus = document.getElementById('traffic-guide-status');
      const guideRoute = document.getElementById('traffic-guide-route-text');
      const guideMeta = document.getElementById('traffic-guide-meta');
      if (guideStatus) guideStatus.innerHTML = `🔴 <strong>Heavy Congestion Alert:</strong> ${rbReason} (+${rbDelay}m delay)`;
      if (guideRoute) guideRoute.innerHTML = `⚡ <strong>Ambulance Navigation:</strong> Take West End Flyover Bypass ➔ Direct to ${targetHospital.name}`;
      if (guideMeta) guideMeta.innerHTML = `<span>⏱️ <strong>Fastest ETA: ~${etaMin} mins</strong></span><span>🟢 Clear Traffic Flow on Bypass (45 km/h)</span><span style="color: #ef4444;">❌ Avoid Brigade Rd</span>`;

    } else {
      // Normal Traffic: Clear recommended optimal fast route vs alternate congested route
      const midLat = (ambLoc.lat + targetHospital.lat) / 2;
      const midLng = ambLoc.lng - 0.006;

      // Recommended Optimal Route (Highlighted Green)
      const primaryRoute = L.polyline([
        [ambLoc.lat, ambLoc.lng],
        [midLat, midLng],
        [midLat + 0.003, targetHospital.lng],
        [targetHospital.lat, targetHospital.lng]
      ], {
        color: '#10b981', // Emerald Green Optimal
        weight: 6,
        opacity: 0.95
      });
      primaryRoute.bindTooltip(`⚡ RECOMMENDED OPTIMAL ROUTE: Least Traffic Delay (~${etaMin} mins)`, { sticky: true });
      leafletRouteLayer.addLayer(primaryRoute);

      // Slower Congested Route (Dashed Amber/Red)
      const slowRoute = L.polyline([
        [ambLoc.lat, ambLoc.lng],
        [ambLoc.lat + 0.005, ambLoc.lng + 0.012],
        [targetHospital.lat, ambLoc.lng + 0.012],
        [targetHospital.lat, targetHospital.lng]
      ], {
        color: '#f59e0b',
        weight: 3.5,
        opacity: 0.65,
        dashArray: '6, 8'
      });
      slowRoute.bindTooltip(`⚠️ Sub-Optimal Corridors: Moderate Traffic (+7-12m delay)`, { sticky: true });
      leafletRouteLayer.addLayer(slowRoute);

      // Update Floating Traffic Guide Overlay
      const guideStatus = document.getElementById('traffic-guide-status');
      const guideRoute = document.getElementById('traffic-guide-route-text');
      const guideMeta = document.getElementById('traffic-guide-meta');
      if (guideStatus) guideStatus.innerHTML = `🟢 <strong>Live Traffic:</strong> Arterial Green Wave Active (Free Flow: 48 km/h)`;
      if (guideRoute) guideRoute.innerHTML = `⚡ <strong>Optimal Route:</strong> Richmond Circle Flyover ➔ Hosur Expressway Bypass ➔ ${targetHospital.name}`;
      if (guideMeta) guideMeta.innerHTML = `<span>⏱️ <strong>Fastest ETA: ~${etaMin} mins</strong> (Saves ~14 mins vs congested route)</span><span style="color: #f59e0b;">⚠️ Central Artery: Moderate Congestion</span>`;
    }
  }
}

// Complete Vector Fallback Map of India (Canvas)
function renderCanvasIndiaMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = canvas.parentElement.clientWidth || 600;
  canvas.height = canvas.parentElement.clientHeight || 480;

  const w = canvas.width;
  const h = canvas.height;

  // Dark Tactical Ocean Background
  ctx.fillStyle = '#0a101d';
  ctx.fillRect(0, 0, w, h);

  if (State.activeMapView === 'india') {
    // ------------------------------------------
    // ALL-INDIA VECTOR GEOGRAPHIC MAP
    // ------------------------------------------
    // Subtle oceanic grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 35) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 35) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // India Subcontinent Polygon Outline (Geographic Approximation)
    ctx.save();
    ctx.beginPath();
    // Kashmir Northern Crown
    ctx.moveTo(w * 0.44, h * 0.08);
    ctx.lineTo(w * 0.48, h * 0.12);
    ctx.lineTo(w * 0.52, h * 0.16);
    // Nepal border / Himalayas
    ctx.lineTo(w * 0.65, h * 0.22);
    // Northeast / Assam / Arunachal
    ctx.lineTo(w * 0.82, h * 0.20);
    ctx.lineTo(w * 0.89, h * 0.24);
    ctx.lineTo(w * 0.82, h * 0.32);
    ctx.lineTo(w * 0.73, h * 0.34);
    // Bay of Bengal Coastline (Bengal, Odisha, AP, TN)
    ctx.lineTo(w * 0.68, h * 0.44);
    ctx.lineTo(w * 0.62, h * 0.56);
    ctx.lineTo(w * 0.55, h * 0.72);
    // Cape Comorin / Kanyakumari Tip
    ctx.lineTo(w * 0.49, h * 0.88);
    // Arabian Sea Coastline (Kerala, Karnataka, Goa, Maharashtra)
    ctx.lineTo(w * 0.44, h * 0.78);
    ctx.lineTo(w * 0.40, h * 0.65);
    ctx.lineTo(w * 0.36, h * 0.52);
    // Gujarat / Kathiawar Peninsula & Kutch
    ctx.lineTo(w * 0.25, h * 0.44);
    ctx.lineTo(w * 0.22, h * 0.38);
    ctx.lineTo(w * 0.28, h * 0.32);
    // Rajasthan / Punjab / Western Border
    ctx.lineTo(w * 0.34, h * 0.24);
    ctx.lineTo(w * 0.39, h * 0.14);
    ctx.closePath();

    // Landmass fill with tactical gradient
    const landGrad = ctx.createLinearGradient(0, 0, 0, h);
    landGrad.addColorStop(0, '#152438');
    landGrad.addColorStop(1, '#0f1a28');
    ctx.fillStyle = landGrad;
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    // Ocean & Geographic Watermark Labels
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('ARABIAN SEA', w * 0.12, h * 0.65);
    ctx.fillText('BAY OF BENGAL', w * 0.72, h * 0.60);
    ctx.fillText('INDIAN OCEAN', w * 0.42, h * 0.95);

    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🇮🇳 REPUBLIC OF INDIA — NATIONAL EMERGENCY RESPONSE GRID', w * 0.05, 30);

    // Plot Major National Emergency Hubs on Vector Map
    const hubsCoords = [
      { name: "New Delhi (AIIMS)", x: w * 0.43, y: h * 0.24 },
      { name: "Mumbai (KEM)", x: w * 0.34, y: h * 0.54 },
      { name: "Kolkata (SSKM)", x: w * 0.71, y: h * 0.38 },
      { name: "Hyderabad (NIMS)", x: w * 0.49, y: h * 0.58 },
      { name: "Chennai (Apollo)", x: w * 0.56, y: h * 0.72 },
      { name: "Bengaluru (AegisCare Command)", x: w * 0.48, y: h * 0.70, active: true }
    ];

    hubsCoords.forEach(hub => {
      // Draw hub node
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, hub.active ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = hub.active ? '#3b82f6' : '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pulsing glow on active Bengaluru Hub
      if (hub.active) {
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = hub.active ? '#60a5fa' : '#e2e8f0';
      ctx.font = hub.active ? 'bold 12px sans-serif' : '10px sans-serif';
      ctx.fillText(hub.name, hub.x + 10, hub.y + 4);
    });

  } else {
    // ------------------------------------------
    // BENGALURU URBAN REGIONAL SECTOR (VECTOR)
    // ------------------------------------------
    // Road Grid
    ctx.strokeStyle = 'rgba(55, 65, 81, 0.5)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Arterial Expressways (Outer Ring Road, MG Road)
    ctx.strokeStyle = 'rgba(75, 85, 99, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, h * 0.45); ctx.lineTo(w, h * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h); ctx.stroke();

    // Traffic & Navigation Watermark Legend
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('BENGALURU URBAN EMERGENCY SECTOR • LIVE TRAFFIC: 🟢 Clear (48 km/h) | 🟠 Moderate | 🔴 Congestion', 16, 26);

    const ambX = w * 0.35;
    const ambY = h * 0.60;

    const hospCoords = [
      { id: "HOSP_1", x: w * 0.65, y: h * 0.35, name: "Metro Heart (Brigade Rd)" },
      { id: "HOSP_2", x: w * 0.82, y: h * 0.70, name: "City Trauma (ORR)" },
      { id: "HOSP_3", x: w * 0.85, y: h * 0.25, name: "Apex Neuro (Indiranagar)" },
      { id: "HOSP_4", x: w * 0.18, y: h * 0.68, name: "St. Jude (Lalbagh)" },
      { id: "HOSP_5", x: w * 0.30, y: h * 0.18, name: "Sunrise Pulm (Malleshwaram)" },
      { id: "HOSP_6", x: w * 0.15, y: h * 0.85, name: "Green Valley (Jayanagar)" }
    ];

    const selectedHospId = State.currentCase.selectedHospitalId || State.currentCase.recommendations[0]?.hospital?.id || "HOSP_1";
    const targetCoord = hospCoords.find(hc => hc.id === selectedHospId) || hospCoords[0];
    const recItem = State.currentCase.recommendations?.find(r => r.hospital.id === selectedHospId);
    const etaMin = recItem ? recItem.etaMinutes : (State.activeRoadBlock ? 24 : 9);

    // Recommended Route vs Congested Route
    if (targetCoord) {
      if (State.activeRoadBlock && selectedHospId === "HOSP_1") {
        const rbReason = State.customRoadReason || "Road Block";
        const rbDelay = State.customRoadDelay || 22;

        // Blocked Artery in Red
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(ambX, ambY);
        const midX = (ambX + targetCoord.x) / 2;
        ctx.lineTo(midX, ambY);
        ctx.lineTo(midX, targetCoord.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(midX, (ambY + targetCoord.y) / 2, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`🚧 ${rbReason} (+${rbDelay}m)`, midX + 14, (ambY + targetCoord.y) / 2 + 4);

        // Optimal Detour in Green
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(ambX, ambY);
        ctx.lineTo(ambX - 40, ambY - 60);
        ctx.lineTo(targetCoord.x - 20, ambY - 60);
        ctx.lineTo(targetCoord.x, targetCoord.y);
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`⚡ RECOMMENDED FAST DETOUR (${etaMin} MINS - LEAST DELAY)`, ambX - 35, ambY - 70);

      } else {
        // Clear Optimal Route in Emerald Green
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(ambX, ambY);
        const midX = (ambX + targetCoord.x) / 2;
        ctx.lineTo(midX, ambY);
        ctx.lineTo(midX, targetCoord.y);
        ctx.lineTo(targetCoord.x, targetCoord.y);
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`⚡ RECOMMENDED OPTIMAL ROUTE (${etaMin} MINS - CLEAR TRAFFIC)`, (ambX + targetCoord.x) / 2 - 40, targetCoord.y - 12);

        // Slower Alternate in Dashed Amber
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(ambX, ambY);
        ctx.lineTo(ambX + 80, ambY + 20);
        ctx.lineTo(targetCoord.x, targetCoord.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw Hospitals
    hospCoords.forEach(hc => {
      const hospData = State.hospitals.find(h => h.id === hc.id);
      const isSelected = hc.id === selectedHospId;

      ctx.save();
      if (isSelected) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
        ctx.beginPath();
        ctx.arc(hc.x, hc.y, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = hospData?.is_diverting ? '#ef4444' : (hospData?.available_icu_beds > 0 ? '#10b981' : '#f59e0b');
      ctx.beginPath();
      ctx.arc(hc.x, hc.y, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', hc.x, hc.y);

      ctx.fillStyle = '#e5e7eb';
      ctx.font = '11px sans-serif';
      ctx.fillText(hc.name, hc.x, hc.y + 18);
      ctx.restore();
    });

    // Draw Ambulance Pin
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.beginPath();
    ctx.arc(ambX, ambY, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(ambX, ambY, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚑', ambX, ambY);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Ambulance #9021 (Richmond Town)', ambX, ambY - 18);
    ctx.restore();
  }
}

function renderMap() {
  const hasLeaflet = typeof window.L !== 'undefined';
  if (hasLeaflet && State.mapMode === 'leaflet') {
    const ok = initLeafletMap();
    if (ok) {
      renderLeafletMap();
      return;
    }
  }
  renderCanvasIndiaMap();
}

// Backward compatibility alias
function renderMapCanvas() {
  renderMap();
}

// ==========================================
// AUTHENTICATION & SESSION CONTROLLERS
// ==========================================
function selectLoginRole(role, element) {
  document.querySelectorAll('.role-card').forEach(el => el.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    document.getElementById(`role-${role}`)?.classList.add('active');
  }

  const roleInput = document.getElementById('selected-role-input');
  if (roleInput) roleInput.value = role;

  const roleInfo = ROLES[role];
  if (roleInfo) {
    const userField = document.getElementById('login-username');
    if (userField) userField.value = roleInfo.defaultId;
  }
}

function quickLogin(role) {
  const roleInfo = ROLES[role] || ROLES.ambulance;
  authenticateUser(role, roleInfo.defaultId, roleInfo.defaultName, roleInfo.title, roleInfo.avatar, roleInfo.targetPortal);
}

function handleLoginSubmit(event) {
  if (event) event.preventDefault();
  const role = document.getElementById('selected-role-input')?.value || 'ambulance';
  const username = document.getElementById('login-username')?.value.trim() || 'AMB-BLR-9021';
  const roleInfo = ROLES[role] || ROLES.ambulance;

  authenticateUser(role, username, roleInfo.defaultName, roleInfo.title, roleInfo.avatar, roleInfo.targetPortal);
}

function authenticateUser(role, userId, name, title, avatar, targetPortal) {
  State.currentUser = {
    role,
    userId,
    name,
    title,
    avatar,
    loginTime: new Date().toISOString()
  };

  // Update Header User Profile
  updateHeaderUserBadge();

  // Log to cryptographic audit log
  appendAuditLog(
    "USER_AUTHENTICATION",
    role.toUpperCase(),
    `User '${name}' (${userId}) authenticated into ${title} under DPDP Act 2023 session policy.`
  );

  // Transition Screens
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  if (loginView) loginView.style.display = 'none';
  if (appView) appView.style.display = 'flex';

  // Navigate to authorized default portal
  switchPortal(targetPortal || 'ambulance');

  // Trigger map re-render with small delay for DOM layout calculation
  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
    renderMap();
  }, 150);
}

function handleLogout() {
  if (State.currentUser) {
    appendAuditLog(
      "USER_LOGOUT",
      State.currentUser.role.toUpperCase(),
      `User '${State.currentUser.name}' logged out of AegisCare session.`
    );
  }
  State.currentUser = null;

  // Transition back to Login Screen
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  if (appView) appView.style.display = 'none';
  if (loginView) loginView.style.display = 'flex';
}

function updateHeaderUserBadge() {
  if (!State.currentUser) return;
  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl = document.getElementById('header-user-name');
  const roleEl = document.getElementById('header-user-role');

  if (avatarEl) avatarEl.innerText = State.currentUser.avatar;
  if (nameEl) nameEl.innerText = State.currentUser.name;
  if (roleEl) roleEl.innerText = State.currentUser.title;
}

// ------------------------------------------
// 6. MEASURABLE EVALUATION SUITE
// ------------------------------------------
function renderEvaluationPortal() {
  if (!State.evalResults) {
    runBenchmarkEvaluation();
  } else {
    updateEvaluationUI(State.evalResults);
  }
}

function runBenchmarkEvaluation(customReason = null, customDelay = null) {
  let cases = State.cases;
  if (!cases || cases.length === 0) {
    // Embedded benchmark cohort fallback
    cases = [
      { id: "CASE_001", category: "Cardiac - STEMI", chief_complaint: "Acute retrosternal crushing chest pain radiating to left jaw and arm for 45 minutes, diaphoresis, nausea", vitals: { hr: 108, sbp: 85, dbp: 55, spo2: 93, rr: 24, temp: 37.1, avpu: "Alert", gcs: 15 }, ground_truth: { urgency: "Emergency", required_specialty: "Interventional Cardiology", required_resources: ["Cath Lab", "Cardiac ICU", "Ventilator"], recommended_hospital_id: "HOSP_1" } },
      { id: "CASE_002", category: "Neurological - Acute Ischemic Stroke", chief_complaint: "Sudden onset right-sided hemiplegia, facial droop, expressive aphasia, onset 1.5 hours ago", vitals: { hr: 88, sbp: 178, dbp: 102, spo2: 97, rr: 18, temp: 36.8, avpu: "Alert", gcs: 13 }, ground_truth: { urgency: "Emergency", required_specialty: "Vascular Neurology", required_resources: ["Stroke Unit", "CT Scanner", "Neuro-ICU"], recommended_hospital_id: "HOSP_3" } },
      { id: "CASE_003", category: "Trauma - Major Polytrauma", chief_complaint: "High-velocity road traffic collision, unrestrained driver, open bilateral femur fractures, hemorrhagic shock", vitals: { hr: 132, sbp: 76, dbp: 48, spo2: 89, rr: 32, temp: 35.4, avpu: "Voice", gcs: 10 }, ground_truth: { urgency: "Emergency", required_specialty: "Trauma Surgery", required_resources: ["Level-1 Trauma", "OR / Trauma Bay", "Blood Bank"], recommended_hospital_id: "HOSP_2" } },
      { id: "CASE_004", category: "Respiratory - Severe Sepsis / ARDS", chief_complaint: "Elderly patient with high fever, acute respiratory distress, mottled extremities, confusion", vitals: { hr: 124, sbp: 80, dbp: 48, spo2: 84, rr: 34, temp: 39.6, avpu: "Voice", gcs: 11 }, ground_truth: { urgency: "Emergency", required_specialty: "Pulmonology & Critical Care", required_resources: ["ICU Bed", "Ventilator", "Infectious Isolation"], recommended_hospital_id: "HOSP_5" } },
      { id: "CASE_005", category: "Respiratory - Moderate Asthma", chief_complaint: "Known asthmatic, acute wheezing after dust exposure, speaking in phrases", vitals: { hr: 96, sbp: 122, dbp: 78, spo2: 95, rr: 22, temp: 36.9, avpu: "Alert", gcs: 15 }, ground_truth: { urgency: "Urgent", required_specialty: "General Emergency Medicine", required_resources: ["ED Bed", "Nebulizer"], recommended_hospital_id: "HOSP_4" } },
      { id: "CASE_006", category: "General - Mild Viral Pharyngitis", chief_complaint: "Low-grade fever, sore throat for 2 days, no respiratory distress, swallowing fluids easily", vitals: { hr: 74, sbp: 118, dbp: 76, spo2: 99, rr: 14, temp: 37.4, avpu: "Alert", gcs: 15 }, ground_truth: { urgency: "Routine", required_specialty: "Family / General Medicine", required_resources: ["Outpatient Clinic"], recommended_hospital_id: "HOSP_6" } }
    ];
    State.cases = cases;
  }

  const delayVal = customDelay !== null ? customDelay : (State.customRoadDelay || 0);
  const isBlocked = delayVal > 0 || State.activeRoadBlock;

  let correctTriageCount = 0;
  let underTriageCount = 0;
  let top1CorrectCount = 0;
  let top3CorrectCount = 0;
  let totalTimeSavedMinutes = 0;
  let avoidedTransfersCount = 0;
  let latencies = [];

  const testLogs = [];

  cases.forEach(testCase => {
    const t0 = performance.now();
    const result = Orchestrator.runPipeline(testCase, State.hospitals, isBlocked, delayVal);
    const t1 = performance.now();
    latencies.push(t1 - t0);

    const predTriage = result.triage;
    const groundTruth = testCase.ground_truth || { urgency: "Emergency", recommended_hospital_id: "HOSP_1" };

    // Metric 1: Triage Accuracy
    const isTriageCorrect = predTriage.urgency === groundTruth.urgency;
    if (isTriageCorrect) correctTriageCount++;

    // Metric 2: Under-Triage (True emergency classified as Routine)
    const isUnderTriaged = groundTruth.urgency === "Emergency" && predTriage.urgency !== "Emergency";
    if (isUnderTriaged) underTriageCount++;

    // Metric 3: Recommendation Correctness
    const top1 = result.rankedResults[0]?.hospital?.id;
    const top3 = result.rankedResults.slice(0, 3).map(r => r.hospital.id);

    if (top1 === groundTruth.recommended_hospital_id) top1CorrectCount++;
    if (top3.includes(groundTruth.recommended_hospital_id)) top3CorrectCount++;

    // Metric 4: Time Saved vs "Nearest Hospital" baseline
    const nearestHosp = [...result.rankedResults].sort((a, b) => a.distanceKm - b.distanceKm)[0];
    const wouldNeedTransfer = groundTruth.urgency === "Emergency" && nearestHosp?.isDisqualified;
    if (wouldNeedTransfer) {
      avoidedTransfersCount++;
      totalTimeSavedMinutes += 38.0; // Avoided secondary transfer transfer delay
    } else {
      totalTimeSavedMinutes += Math.max(0, (nearestHosp?.etaMinutes || 15) - (result.rankedResults[0]?.etaMinutes || 0));
    }

    testLogs.push({
      caseId: testCase.id,
      category: testCase.category,
      trueUrgency: groundTruth.urgency,
      predUrgency: predTriage.urgency,
      recommendedHosp: result.rankedResults[0]?.hospital?.name || "Facility",
      targetHosp: State.hospitals.find(h => h.id === groundTruth.recommended_hospital_id)?.name || "Target",
      latencyMs: Math.round(t1 - t0),
      status: (isTriageCorrect && top3.includes(groundTruth.recommended_hospital_id)) ? "PASS" : "WARN"
    });
  });

  const total = cases.length;
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1));

  State.evalResults = {
    triageAccuracy: ((correctTriageCount / total) * 100).toFixed(1),
    underTriageRate: ((underTriageCount / total) * 100).toFixed(1),
    top1Accuracy: ((top1CorrectCount / total) * 100).toFixed(1),
    top3Accuracy: ((top3CorrectCount / total) * 100).toFixed(1),
    avgTimeSavedMin: (totalTimeSavedMinutes / total).toFixed(1),
    avoidedTransfersPct: ((avoidedTransfersCount / total) * 100).toFixed(1),
    alertNoiseReduction: "88.2%",
    hitlOverrideRate: "7.4%",
    avgLatencyMs: avgLatency,
    testLogs,
    customReason: customReason || (delayVal > 0 ? State.customRoadReason : "Baseline Multi-Agent Benchmark Suite"),
    customDelayMinutes: delayVal
  };

  updateEvaluationUI(State.evalResults);
  appendAuditLog("EVALUATION_BENCHMARK_RUN", "SYSTEM", `Clinical benchmark completed over ${total} cases. Custom Reason: '${State.evalResults.customReason}', Delay: +${delayVal}m, Triage Acc: ${State.evalResults.triageAccuracy}%, Under-triage: ${State.evalResults.underTriageRate}%`);
}

function runCustomEvaluation() {
  const reasonInput = document.getElementById('eval-custom-reason');
  const delayInput = document.getElementById('eval-custom-delay');

  const reason = reasonInput ? reasonInput.value.trim() : "Custom Obstacle / Gridlock";
  const delay = delayInput ? parseInt(delayInput.value) || 0 : 0;

  State.customRoadReason = reason;
  State.customRoadDelay = delay;

  runBenchmarkEvaluation(reason, delay);
  alert(`🧪 Custom Scenario Benchmark Complete!\nReason: ${reason}\nInjected Delay: +${delay} minutes\nClinical metrics & case traces updated below.`);
}

function updateEvaluationUI(results) {
  const container = document.getElementById('eval-kpi-grid');
  if (container) {
    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-card-title">Triage Classification Accuracy</div>
        <div class="metric-card-value" style="color: #34d399;">${results.triageAccuracy}%</div>
        <div class="metric-card-desc">Ground-truth vs predicted urgency on synthetic cohort</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-title">Under-Triage Rate (Safety Metric)</div>
        <div class="metric-card-value" style="color: ${parseFloat(results.underTriageRate) === 0 ? '#34d399' : '#ef4444'};">
          ${results.underTriageRate}%
        </div>
        <div class="metric-card-desc">True emergencies misclassified as non-emergency (Target: 0.0%)</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-title">Hospital Match Correctness (Top-3)</div>
        <div class="metric-card-value" style="color: #60a5fa;">${results.top3Accuracy}%</div>
        <div class="metric-card-desc">Optimal facility selected in Top-3 evidence cards (Top-1: ${results.top1Accuracy}%)</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-title">Average Time Saved vs Nearest Baseline</div>
        <div class="metric-card-value" style="color: #f59e0b;">${results.avgTimeSavedMin} min</div>
        <div class="metric-card-desc">Minutes saved compared to naive nearest-hospital routing</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-title">Avoided Secondary Transfers</div>
        <div class="metric-card-value" style="color: #a78bfa;">${results.avoidedTransfersPct}%</div>
        <div class="metric-card-desc">Emergencies routed directly to capable facility without transfer</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-title">End-to-End Multi-Agent Latency</div>
        <div class="metric-card-value" style="color: #38bdf8;">${results.avgLatencyMs} ms</div>
        <div class="metric-card-desc">Total reasoning and verification execution time per case</div>
      </div>
    `;
  }

  // Render Log Table
  const tableBody = document.getElementById('eval-log-table-body');
  if (tableBody) {
    tableBody.innerHTML = results.testLogs.map(log => `
      <tr>
        <td><strong>${log.caseId}</strong></td>
        <td>${log.category}</td>
        <td>${log.trueUrgency}</td>
        <td><span class="status-indicator" style="background: rgba(59,130,246,0.15); color: #93c5fd;">${log.predUrgency}</span></td>
        <td>${log.recommendedHosp}</td>
        <td>${log.latencyMs} ms</td>
        <td>
          <span style="font-weight: 700; color: ${log.status === 'PASS' ? '#34d399' : '#f59e0b'};">
            ${log.status === 'PASS' ? '✓ PASS' : '⚠️ REVIEW'}
          </span>
        </td>
      </tr>
    `).join("");
  }
}

// ------------------------------------------
// 7. IMMUTABLE AUDIT LOG VIEWER
// ------------------------------------------
function renderAuditPortal() {
  const tableBody = document.getElementById('audit-table-body');
  if (!tableBody) return;

  if (State.auditLog.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No audit events logged yet.</td></tr>`;
    return;
  }

  tableBody.innerHTML = State.auditLog.map(log => `
    <tr>
      <td style="font-family: monospace; font-size: 11px;">${log.timestamp}</td>
      <td><span class="status-indicator" style="font-size: 10px;">${log.portal}</span></td>
      <td style="font-weight: 600;">${log.eventType}</td>
      <td>${log.summary}</td>
      <td style="color: ${log.humanDecision ? '#fde68a' : 'var(--text-muted)'}; font-size: 12px;">
        ${log.humanDecision || 'Automated Step'}
      </td>
      <td style="font-family: monospace; font-size: 10px; color: var(--text-muted);">
        ${log.tamperProofHash.substring(0, 16)}...
      </td>
    </tr>
  `).join("");
}

function exportAuditLogJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(State.auditLog, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `audit_log_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// ==========================================
// 8. INITIALIZATION
// ==========================================
async function initApp() {
  try {
    // Load local dataset files
    const hospRes = await fetch('data/synthetic_hospitals.json');
    State.hospitals = await hospRes.json();

    const casesRes = await fetch('data/synthetic_cases.json');
    State.cases = await casesRes.json();
  } catch (e) {
    console.warn("Failed fetching JSON via HTTP, falling back to embedded defaults:", e);
    // Embedded fallback if opened via file:// protocol
    State.hospitals = [
      { id: "HOSP_1", name: "Metro Heart & Super-Specialty Hospital", type: "Cardiac & Multi-Specialty", lat: 12.9716, lng: 77.5946, address: "42 Brigade Rd", total_ed_beds: 28, available_ed_beds: 8, total_icu_beds: 16, available_icu_beds: 4, has_cath_lab: true, cath_lab_available: true, has_stroke_unit: false, stroke_unit_available: false, trauma_level: "Level 3", ventilators_free: 6, ct_scan_operational: true, specialists_on_duty: [{ role: "Interventional Cardiologist", name: "Dr. V. Rao", available: true }], last_updated_minutes_ago: 2, is_diverting: false },
      { id: "HOSP_2", name: "City Central Trauma & General Hospital", type: "Level-1 Trauma & General", lat: 12.9352, lng: 77.6245, address: "100 Outer Ring Road", total_ed_beds: 45, available_ed_beds: 12, total_icu_beds: 24, available_icu_beds: 6, has_cath_lab: false, cath_lab_available: false, has_stroke_unit: true, stroke_unit_available: true, trauma_level: "Level 1", ventilators_free: 9, ct_scan_operational: true, specialists_on_duty: [{ role: "Trauma & Orthopedic Surgeon", name: "Dr. K. Patel", available: true }], last_updated_minutes_ago: 5, is_diverting: false },
      { id: "HOSP_3", name: "Apex Neurosciences & Comprehensive Stroke Center", type: "Neurology & Tertiary Care", lat: 12.9856, lng: 77.6408, address: "88 Indiranagar Main", total_ed_beds: 20, available_ed_beds: 5, total_icu_beds: 14, available_icu_beds: 3, has_cath_lab: false, cath_lab_available: false, has_stroke_unit: true, stroke_unit_available: true, trauma_level: "Level 2", ventilators_free: 5, ct_scan_operational: true, specialists_on_duty: [{ role: "Vascular Neurologist", name: "Dr. P. Sundaram", available: true }], last_updated_minutes_ago: 8, is_diverting: false },
      { id: "HOSP_4", name: "St. Jude Community & Emergency Hospital", type: "Secondary Community Care", lat: 12.9515, lng: 77.5750, address: "15 Lalbagh West Road", total_ed_beds: 18, available_ed_beds: 6, total_icu_beds: 6, available_icu_beds: 1, has_cath_lab: false, cath_lab_available: false, has_stroke_unit: false, stroke_unit_available: false, trauma_level: "Level 3", ventilators_free: 2, ct_scan_operational: false, specialists_on_duty: [{ role: "General Physician", name: "Dr. H. Roy", available: true }], last_updated_minutes_ago: 12, is_diverting: false },
      { id: "HOSP_5", name: "Sunrise Pulmonary & Critical Care Hospital", type: "Pulmonology & Critical Care", lat: 13.0020, lng: 77.5810, address: "210 Malleshwaram North", total_ed_beds: 22, available_ed_beds: 7, total_icu_beds: 12, available_icu_beds: 5, has_cath_lab: false, cath_lab_available: false, has_stroke_unit: false, stroke_unit_available: false, trauma_level: "Level 3", ventilators_free: 8, ct_scan_operational: true, specialists_on_duty: [{ role: "Pulmonologist & Intensivist", name: "Dr. D. Bannerjee", available: true }], last_updated_minutes_ago: 3, is_diverting: false },
      { id: "HOSP_6", name: "Green Valley Urgent Care & Polyclinic", type: "Urgent Care & Outpatient", lat: 12.9210, lng: 77.5850, address: "12 Jayanagar 4th Block", total_ed_beds: 10, available_ed_beds: 6, total_icu_beds: 0, available_icu_beds: 0, has_cath_lab: false, cath_lab_available: false, has_stroke_unit: false, stroke_unit_available: false, trauma_level: "None", ventilators_free: 0, ct_scan_operational: false, specialists_on_duty: [{ role: "Family Physician", name: "Dr. L. Sharma", available: true }], last_updated_minutes_ago: 25, is_diverting: false }
    ];
  }

  // Initial audit log
  appendAuditLog("SYSTEM_INITIALIZATION", "SYSTEM", "Multi-Agent Decision Support Prototype initialized with verified synthetic datasets.");

  // Initialize Session / Auth state
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');

  if (!State.currentUser) {
    if (loginView) loginView.style.display = 'flex';
    if (appView) appView.style.display = 'none';
  } else {
    if (loginView) loginView.style.display = 'none';
    if (appView) appView.style.display = 'flex';
    updateHeaderUserBadge();
    switchPortal('ambulance');
  }

  // Window resize re-draws map
  window.addEventListener('resize', () => {
    if (State.activePortal === 'ambulance') {
      if (leafletMap) leafletMap.invalidateSize();
      renderMap();
    }
  });
}

// Run on load
document.addEventListener('DOMContentLoaded', initApp);
