const API = {
  label: "https://api.fda.gov/drug/label.json",
  drugsFda: "https://api.fda.gov/drug/drugsfda.json",
  dailyMedSearch: "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json",
  rems: "https://www.fda.gov/drugs/risk-evaluation-and-mitigation-strategies-rems"
};

const $ = (id) => document.getElementById(id);

// Safe Fetch Wrapper
async function safeFetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn(`Fetch failed for URL (${url}):`, err);
    return null;
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  const searchForm = $("searchForm");
  
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      searchDrug($("drugInput").value.trim());
    });
  }

  document.querySelectorAll(".example").forEach(btn => {
    btn.addEventListener("click", () => {
      $("drugInput").value = btn.dataset.drug;
      searchDrug(btn.dataset.drug);
    });
  });
});

function setStatus(message, type = "") {
  $("status").textContent = message;
  $("status").className = `status ${type}`.trim();
}

function clearStatus() {
  $("status").className = "status hidden";
  $("status").textContent = "";
}

function first(value, fallback = "") {
  return Array.isArray(value) ? (value[0] || fallback) : (value || fallback);
}

// Global Text Cleaning Utility
function cleanText(value) {
  if (value == null) return "";
  
  let str = Array.isArray(value) ? value.join(" ") : String(value);

  return str
    // Remove HTML tags
    .replace(/<[^>]*>/g, " ")
    // Remove broken reference links like "[see Warnings and Precautions ( )]" or "[see 17]"
    .replace(/\[\s*see\s+[^\]]*?\]/gi, "")
    // Remove section citations in parentheses like "( 4 )" or "( 5.1 )"
    .replace(/\(\s*\d+(\.\d+)?\s*\)/g, "")
    // Remove leading section titles like "4 CONTRAINDICATIONS", "1 INDICATIONS AND USAGE", etc.
    .replace(/^\s*\d+(\.\d+)?\s+[A-Z\s]{3,30}\b/g, "")
    .replace(/\b\d+(\.\d+)?\s+[A-Z\s]{3,30}\b/g, "")
    // Clean spaces before punctuation
    .replace(/\s+([.,;:?!])/g, "$1")
    // Normalize spaces and newlines
    .replace(/\s+/g, " ")
    .trim();
}

// Formats raw text or arrays into cleaned, deduplicated bullet lists
function formatAsBullets(rawInput) {
  const cleaned = cleanText(rawInput);

  if (!cleaned) {
    return '<p class="muted">No information returned.</p>';
  }

  // Split on periods followed by spaces, inline bullet points, or numbers
  const rawItems = cleaned
    .split(/(?<=\.)\s+|•|\s\*\s/)
    .map(item => item.trim())
    .filter(item => item.length > 5);

  // Deduplicate sentences
  const uniqueItems = [];
  const seen = new Set();

  for (const item of rawItems) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  if (uniqueItems.length === 0) {
    return `<p>${cleaned}</p>`;
  }

  const listItems = uniqueItems
    .map(item => `<li>${item}</li>`)
    .join("");

  return `<ul class="label-bullet-list">${listItems}</ul>`;
}

async function searchDrug(drug) {
  if (!drug) return;

  clearStatus();
  $("results").classList.add("hidden");
  setStatus(`Searching FDA label data for "${drug}"...`);

  try {
    const genericUrl = `${API.label}?search=openfda.generic_name:"${encodeURIComponent(drug)}"&limit=10`;
    let labelData = await safeFetchJson(genericUrl);

    if (!labelData?.results?.length) {
      const brandUrl = `${API.label}?search=openfda.brand_name:"${encodeURIComponent(drug)}"&limit=10`;
      labelData = await safeFetchJson(brandUrl);
    }

    if (!labelData?.results?.length) {
      throw new Error(`No FDA label records were found for "${drug}".`);
    }

    const record = chooseBestLabel(labelData.results, drug);
    const generic = first(record.openfda?.generic_name, drug);

    const [dailyMed, drugsFda] = await Promise.all([
      fetchDailyMed(generic),
      fetchDrugsFda(record)
    ]);

    render(record, dailyMed, drugsFda, drug);

    clearStatus();
    $("results").classList.remove("hidden");
  } catch (error) {
    console.error("Search Error:", error);
    setStatus(error.message || "Unable to retrieve FDA data.", "error");
  }
}

function chooseBestLabel(records, drug) {
  const term = drug.toLowerCase();

  const scored = records.map(r => {
    let score = 0;
    const g = (r.openfda?.generic_name || []).join(" ").toLowerCase();
    const b = (r.openfda?.brand_name || []).join(" ").toLowerCase();

    if (g === term) score += 10;
    if (b === term) score += 12;
    if (g.includes(term)) score += 5;
    if (b.includes(term)) score += 5;
    if (r.boxed_warning) score += 1;
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].r;
}

async function fetchDailyMed(generic) {
  const url = `${API.dailyMedSearch}?drug_name=${encodeURIComponent(generic)}&pagesize=5&page=1`;
  return await safeFetchJson(url);
}

async function fetchDrugsFda(record) {
  const app = first(record.openfda?.application_number) || first(record.application_number);

  if (app) {
    return await safeFetchJson(`${API.drugsFda}?search=application_number:"${encodeURIComponent(app)}"&limit=5`);
  }

  const generic = first(record.openfda?.generic_name);
  if (!generic) return null;

  return await safeFetchJson(`${API.drugsFda}?search=products.active_ingredients.name:"${encodeURIComponent(generic)}"&limit=5`);
}

function render(record, dailyMed, drugsFda, searchedDrug) {
  const of = record.openfda || {};

  const generic = first(of.generic_name, searchedDrug);
  const brand = first(of.brand_name, "FDA Label");
  const manufacturer = first(of.manufacturer_name, "Manufacturer not returned");
  const setId = first(of.spl_set_id, first(record.set_id));
  const appNumber = first(of.application_number, first(record.application_number));

  $("drugGeneric").textContent = generic;
  $("drugBrand").textContent = brand;
  $("drugManufacturer").textContent = manufacturer;

  // Boxed Warning
  const boxed = record.boxed_warning;
  $("boxedBadge").classList.toggle("hidden", !boxed);
  $("boxedWarning").innerHTML = formatAsBullets(boxed);

  // Apply formatAsBullets to ALL sections directly
  $("indications").innerHTML = formatAsBullets(record.indications_and_usage || record.indications_and_usage_table);
  $("contraindications").innerHTML = formatAsBullets(record.contraindications);
  
  const dosageRaw = record.dosage_and_administration || record.dosage_and_administration_table;
  $("dosage").innerHTML = formatAsBullets(dosageRaw);
  renderMaximumDose(cleanText(dosageRaw));

  $("warnings").innerHTML = formatAsBullets(record.warnings_and_cautions || record.warnings || record.precautions);

  // Specific Populations
  $("pediatric").innerHTML = formatAsBullets(record.pediatric_use || record.use_in_specific_populations);
  $("geriatric").innerHTML = formatAsBullets(record.geriatric_use || record.use_in_specific_populations);
  $("renal").innerHTML = formatAsBullets(record.renal_impairment || record.use_in_specific_populations);
  $("hepatic").innerHTML = formatAsBullets(record.hepatic_impairment || record.use_in_specific_populations);
  $("pregnancy").innerHTML = formatAsBullets(record.pregnancy || record.use_in_specific_populations);
  $("lactation").innerHTML = formatAsBullets(record.lactation || record.use_in_specific_populations);

  // Metadata
  const effectiveDate = first(record.effective_time, record.effective_date);
  $("effectiveDate").textContent = formatDate(effectiveDate);

  $("setId").textContent = setId || "—";
  $("applicationNumber").textContent = appNumber || "—";

  $("dosageForm").textContent = first(of.dosage_form, "—");
  $("route").textContent = first(of.route, "—");

  // External Links
  const dailyMedSetId = dailyMed?.data?.[0]?.[0] || dailyMed?.results?.[0]?.setid;
  const dailyMedTitle = dailyMed?.data?.[0]?.[1] || dailyMed?.results?.[0]?.title;

  const dailyMedUrl = dailyMedSetId
    ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${dailyMedSetId}`
    : `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(generic)}`;

  $("dailyMedSource").href = dailyMedUrl;
  $("dailymedIndications").href = dailyMedUrl;

  $("labelSource").href = `${API.label}?search=openfda.generic_name:"${encodeURIComponent(generic)}"`;

  const drugsFdaApp = drugsFda?.results?.[0]?.application_number || appNumber || "";
  $("drugsFdaSource").href = drugsFdaApp
    ? `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${encodeURIComponent(drugsFdaApp.replace(/[^0-9]/g, ''))}`
    : `https://www.accessdata.fda.gov/scripts/cder/daf/`;

  $("remsSearch").href = `${API.rems}`;

  renderRems(record, generic);

  $("sourceSummary").textContent = `Search term: ${searchedDrug} • FDA label record: ${setId || "not returned"}`
    + (dailyMedTitle ? ` • DailyMed: ${dailyMedTitle}` : "");
}

function renderMaximumDose(dosageText) {
  const box = $("maxDose");
  if (!dosageText) {
    box.classList.add("hidden");
    return;
  }
  
  const sentences = dosageText.match(/[^.!?]*(?:maximum|max dose|max daily|not exceed)[^.!?]*[.!?]?/gi) || [];

  if (sentences.length) {
    box.textContent = "FDA dosage text mentioning a maximum: " + sentences.slice(0, 3).join(" ");
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

function renderRems(record, generic) {
  const combined = [
    record.risk_evaluation_and_mitigation_strategy,
    record.rems,
    record.warnings_and_cautions
  ].filter(Boolean).map(cleanText).join("\n");

  const hit = /REMS|risk evaluation and mitigation strategy/i.test(combined);

  $("remsResult").innerHTML = hit
    ? `<strong>REMS-related language found in the FDA label.</strong>
       <p class="small-note">Open the FDA REMS resource below to verify current program requirements.</p>`
    : `<strong>No REMS-specific language was identified in this label record.</strong>
       <p class="small-note">Verify against the official FDA REMS database using the link below.</p>`;
}

function formatDate(value) {
  if (!value) return "—";
  const s = String(value);
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(4,6)}/${s.slice(6,8)}/${s.slice(0,4)}`;
  }
  return s;
}
