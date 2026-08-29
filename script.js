const API = {
  label: "https://api.fda.gov/drug/label.json",
  drugsFda: "https://api.fda.gov/drug/drugsfda.json",
  dailyMedSearch: "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json",
  remsDatabase: "https://www.accessdata.fda.gov/scripts/cder/rems/index.cfm"
};

const $ = (id) => document.getElementById(id);

// Safe Fetch Wrapper to handle CORS and network failures gracefully
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

// Bind DOM Events on load
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

// Cleans FDA artifacts, empty brackets, section headers, and citations globally
function cleanText(value) {
  if (value == null) return "";
  
  let str = Array.isArray(value) ? value.join(" ") : String(value);

  return str
    // 1. Remove HTML tags
    .replace(/<[^>]*>/g, " ")
    // 2. Remove empty reference links like "[see Warnings and Precautions ( )]" or "[see 17]"
    .replace(/\[\s*see\s+[^\]]*?\]/gi, "")
    // 3. Remove section citations in parentheses like "( 4 )" or "( 5.1 )"
    .replace(/\(\s*\d+(\.\d+)?\s*\)/g, "")
    // 4. Remove section headers like "4 CONTRAINDICATIONS" or "1 INDICATIONS AND USAGE"
    .replace(/^\s*\d+(\.\d+)?\s+[A-Z\s]{3,30}\b/g, "")
    .replace(/\b\d+(\.\d+)?\s+[A-Z\s]{3,30}\b/g, "")
    // 5. Clean up extra space before punctuation
    .replace(/\s+([.,;:?!])/g, "$1")
    // 6. Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// Converts raw text/arrays into a clean, deduplicated bulleted list
function formatAsBullets(rawInput) {
  const cleaned = cleanText(rawInput);

  if (!cleaned) {
    return '<p class="muted">No information returned.</p>';
  }

  // Split on periods, inline bullets, or asterisk lists
  const rawItems = cleaned
    .split(/(?<=\.)\s+|•|\s\*\s/)
    .map(item => item.trim())
    .filter(item => item.length > 5); // Ignore small orphan fragments

  // Deduplicate identical sentences across the section
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
    // 1. Search generic name first
    const genericUrl = `${API.label}?search=openfda.generic_name:"${encodeURIComponent(drug)}"&limit=10`;
    let labelData = await safeFetchJson(genericUrl);

    // 2. Fall back to brand name search
    if (!labelData?.results?.length) {
      const brandUrl = `${API.label}?search=openfda.brand_name:"${encodeURIComponent(drug)}"&limit=10`;
      labelData = await safeFetchJson(brandUrl);
    }

    if (!labelData?.results?.length) {
      throw new Error(`No FDA label records were found for "${drug}".`);
    }

    const record = chooseBestLabel(labelData.results, drug);
    const generic = first(record.openfda?.generic_name, drug);

    // 3. Execute parallel lookup requests
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

  // Boxed Warning Section
  const boxed = record.boxed_warning;
  $("boxedBadge").classList.toggle("hidden", !boxed);
  $("boxedWarning").innerHTML = formatAsBullets(boxed);

  // Render Label Sections
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

  $("remsSearch").href = `${API.remsDatabase}`;

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

// Dynamic REMS Detection & Query Generation
function renderRems(record, generic) {
  const container = $("remsResult");
  const cleanGeneric = (generic || "").toLowerCase().trim();

  // 1. Check for explicit REMS fields in openFDA JSON
  const remsFields = [
    record.risk_evaluation_and_mitigation_strategy,
    record.rems,
    record.risk_evaluation_and_mitigation_strategy_rems
  ].filter(Boolean);

  if (remsFields.length > 0) {
    container.innerHTML = `
      <div class="rems-badge rems-active">Active REMS Program Requirements Found</div>
      <div style="margin-top: 0.5rem;">${formatAsBullets(remsFields.join(" "))}</div>
      <p class="small-note" style="margin-top: 0.5rem;">
        Verify active status on the <a href="${API.remsDatabase}" target="_blank" rel="noopener">Official FDA REMS Portal</a>.
      </p>
    `;
    return;
  }

  // 2. Dynamically scan Warning section for REMS requirements
  const warningText = cleanText(record.warnings_and_cautions || record.warnings);
  const match = warningText.match(/[^.!?]*\bREMS\b[^.!?]*[.!?]?/gi);

  if (match && match.length > 0) {
    const liveSearchUrl = `https://www.accessdata.fda.gov/scripts/cder/rems/index.cfm?event=IndivRems.page&DrugName=${encodeURIComponent(generic)}`;
    container.innerHTML = `
      <div class="rems-badge rems-warning">REMS Mentioned in FDA Label</div>
      <p style="margin: 0.5rem 0;">"${cleanText(match[0])}"</p>
      <a href="${liveSearchUrl}" target="_blank" rel="noopener" class="rems-link-btn">
        Search Live FDA REMS Database for ${generic} &rarr;
      </a>
    `;
    return;
  }

  // 3. Fallback when no REMS text is found in label
  const fallbackSearchUrl = `https://www.accessdata.fda.gov/scripts/cder/rems/index.cfm?event=IndivRems.page&DrugName=${encodeURIComponent(generic)}`;
  container.innerHTML = `
    <div class="rems-badge rems-none">No REMS Program Listed in Label</div>
    <p style="margin: 0.5rem 0;" class="muted">
      This label record does not explicitly mandate a Risk Evaluation and Mitigation Strategy (REMS).
    </p>
    <a href="${fallbackSearchUrl}" target="_blank" rel="noopener" class="small-note">
      Check live FDA database to confirm &rarr;
    </a>
  `;
}

function formatDate(value) {
  if (!value) return "—";
  const s = String(value);
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(4,6)}/${s.slice(6,8)}/${s.slice(0,4)}`;
  }
  return s;
}
