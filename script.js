const API = {
  label: "https://api.fda.gov/drug/label.json",
  drugsFda: "https://api.fda.gov/drug/drugsfda.json",
  dailyMedSearch: "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json",
  remsDatabase: "https://www.accessdata.fda.gov/scripts/cder/rems/index.cfm"
};

// Comprehensive Active FDA REMS Registry Map (Generic Family Key)
const FDA_REMS_REGISTRY = {
  "isotretinoin": {
    program: "iPLEDGE REMS Program",
    url: "https://www.ipledgeprogram.com/",
    desc: "Mandatory program to prevent fetal exposure and severe birth defects."
  },
  "clozapine": {
    program: "Clozapine REMS",
    url: "https://www.clozapinerems.com/",
    desc: "Monitors and mitigates the risk of severe neutropenia via absolute neutrophil count (ANC) tracking."
  },
  "fentanyl": {
    program: "TIRF (Transmucosal Immediate-Release Fentanyl) REMS",
    url: "https://www.tirfremsaccess.com/",
    desc: "Mitigates the risk of misuse, abuse, addiction, and overdose."
  },
  "lenalidomide": {
    program: "Revlimid REMS",
    url: "https://www.revlimidrems.com/",
    desc: "Prevents embryo-fetal exposure during treatment."
  },
  "thalidomide": {
    program: "THALOMID REMS",
    url: "https://www.thalomidrems.com/",
    desc: "Strict contraception and pregnancy testing controls to prevent severe birth defects."
  },
  "pomalidomide": {
    program: "POMALYST REMS",
    url: "https://www.pomalystrems.com/",
    desc: "Mandatory risk management to prevent fetal exposure."
  },
  "mycophenolate": {
    program: "Mycophenolate REMS",
    url: "https://www.mycophenolaterems.com/",
    desc: "Educates providers and patients on pregnancy prevention and congenital malformations."
  },
  "buprenorphine": {
    program: "BTOD REMS Program",
    url: "https://www.btodrems.com/",
    desc: "Ensures benefits of transmucosal buprenorphine outweigh accidental exposure and addiction risks."
  },
  "olanzapine": {
    program: "Zyprexa Relprevv REMS",
    url: "https://www.zyprexarelprevvrems.com/",
    desc: "Monitors patients for Post-injection Delirium Sedation Syndrome (PDSS)."
  },
  "sodium oxybate": {
    program: "Xyrem / Xywav REMS",
    url: "https://www.xyremxywavrems.com/",
    desc: "Mitigates central nervous system depression, abuse, and misuse."
  },
  "almotriptan": { program: "Shared System REMS", url: API.remsDatabase, desc: "Shared safety requirements." },
  "bosentan": { program: "Opsumit / Tracleer REMS", url: API.remsDatabase, desc: "Monitors risk of hepatotoxicity and embryo-fetal toxicity." },
  "ambrisentan": { program: "LETAIRIS REMS", url: API.remsDatabase, desc: "Prevents embryo-fetal toxicity." },
  "riociguat": { program: "ADEMPAS REMS", url: API.remsDatabase, desc: "Mandatory pregnancy testing and prescribing restriction." },
  "macitentan": { program: "OPSUMIT REMS", url: API.remsDatabase, desc: "Prevents embryo-fetal exposure." },
  "esketamine": { program: "SPRAVATO REMS", url: "https://www.spravatoremshcp.com/", desc: "Monitors sedation and dissociation post-administration." },
  "capmatinib": { program: "FDA REMS Oversight", url: API.remsDatabase, desc: "Monitors embryo-fetal toxicity." }
};

const $ = (id) => document.getElementById(id);

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

function cleanText(value) {
  if (value == null) return "";
  let str = Array.isArray(value) ? value.join(" ") : String(value);

  return str
    .replace(/<[^>]*>/g, " ")
    .replace(/\[\s*see\s+[^\]]*?\]/gi, "")
    .replace(/\(\s*\d+(\.\d+)?\s*\)/g, "")
    .replace(/^\s*\d+(\.\d+)?\s+[A-Z\s]{3,30}\b/g, "")
    .replace(/\b\d+(\.\d+)?\s+[A-Z\s]{3,30}\b/g, "")
    .replace(/\s+([.,;:?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAsBullets(rawInput) {
  const cleaned = cleanText(rawInput);
  if (!cleaned) return '<p class="muted">No information returned.</p>';

  const rawItems = cleaned
    .split(/(?<=\.)\s+|•|\s\*\s/)
    .map(item => item.trim())
    .filter(item => item.length > 5);

  const uniqueItems = [];
  const seen = new Set();

  for (const item of rawItems) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  if (uniqueItems.length === 0) return `<p>${cleaned}</p>`;

  return `<ul class="label-bullet-list">${uniqueItems.map(item => `<li>${item}</li>`).join("")}</ul>`;
}

async function searchDrug(drug) {
  if (!drug) return;

  clearStatus();
  $("results").classList.add("hidden");
  setStatus(`Searching FDA and NLM data for "${drug}"...`);

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
    const setId = first(record.openfda?.spl_set_id, first(record.set_id));

    // Parallel API queries to NLM DailyMed and FDA Drugs@FDA
    const [dailyMed, dailyMedRems, drugsFda] = await Promise.all([
      fetchDailyMed(generic),
      fetchDailyMedRems(generic, setId),
      fetchDrugsFda(record)
    ]);

    render(record, dailyMed, dailyMedRems, drugsFda, drug);

    clearStatus();
    $("results").classList.remove("hidden");
  } catch (error) {
    console.error("Search Error:", error);
    setStatus(error.message || "Unable to retrieve FDA/NLM data.", "error");
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

// Queries NLM DailyMed SPL Search
async function fetchDailyMed(generic) {
  const url = `${API.dailyMedSearch}?drug_name=${encodeURIComponent(generic)}&pagesize=5&page=1`;
  return await safeFetchJson(url);
}

// Explicit NLM DailyMed API call to look for REMS SPL documents
async function fetchDailyMedRems(generic, setId) {
  if (setId) {
    const urlBySetId = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${setId}.json`;
    const res = await safeFetchJson(urlBySetId);
    if (res?.data?.document_type?.toLowerCase().includes("rems")) {
      return res.data;
    }
  }

  // Fallback NLM search for explicit REMS SPL documents by drug name
  const remsUrl = `${API.dailyMedSearch}?drug_name=${encodeURIComponent(generic)}&doctype=REMS&pagesize=1`;
  const searchRes = await safeFetchJson(remsUrl);
  return searchRes?.data?.[0] || null;
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

function render(record, dailyMed, dailyMedRems, drugsFda, searchedDrug) {
  const of = record.openfda || {};

  const generic = first(of.generic_name, searchedDrug);
  const brand = first(of.brand_name, "FDA Label");
  const manufacturer = first(of.manufacturer_name, "Manufacturer not returned");
  const setId = first(of.spl_set_id, first(record.set_id));
  const appNumber = first(of.application_number, first(record.application_number));

  $("drugGeneric").textContent = generic;
  $("drugBrand").textContent = brand;
  $("drugManufacturer").textContent = manufacturer;

  const boxed = record.boxed_warning;
  $("boxedBadge").classList.toggle("hidden", !boxed);
  $("boxedWarning").innerHTML = formatAsBullets(boxed);

  $("indications").innerHTML = formatAsBullets(record.indications_and_usage || record.indications_and_usage_table);
  $("contraindications").innerHTML = formatAsBullets(record.contraindications);
  
  const dosageRaw = record.dosage_and_administration || record.dosage_and_administration_table;
  $("dosage").innerHTML = formatAsBullets(dosageRaw);
  renderMaximumDose(cleanText(dosageRaw));

  $("warnings").innerHTML = formatAsBullets(record.warnings_and_cautions || record.warnings || record.precautions);

  $("pediatric").innerHTML = formatAsBullets(record.pediatric_use || record.use_in_specific_populations);
  $("geriatric").innerHTML = formatAsBullets(record.geriatric_use || record.use_in_specific_populations);
  $("renal").innerHTML = formatAsBullets(record.renal_impairment || record.use_in_specific_populations);
  $("hepatic").innerHTML = formatAsBullets(record.hepatic_impairment || record.use_in_specific_populations);
  $("pregnancy").innerHTML = formatAsBullets(record.pregnancy || record.use_in_specific_populations);
  $("lactation").innerHTML = formatAsBullets(record.lactation || record.use_in_specific_populations);

  const effectiveDate = first(record.effective_time, record.effective_date);
  $("effectiveDate").textContent = formatDate(effectiveDate);

  $("setId").textContent = setId || "—";
  $("applicationNumber").textContent = appNumber || "—";
  $("dosageForm").textContent = first(of.dosage_form, "—");
  $("route").textContent = first(of.route, "—");

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

  // Process multi-source REMS verification
  renderRemsMultiSource(record, generic, dailyMedRems);

  $("sourceSummary").textContent = `Search term: ${searchedDrug} • FDA label record: ${setId || "not returned"}`
    + (dailyMedTitle ? ` • DailyMed: ${dailyMedTitle}` : "");
}

function renderMaximumDose(dosageText) {
  const box = $("maxDose");
  if (!dosageText) {
    box.classList.add("hidden");
    return;
  }
  
  const sentences = dosageText.match(/[^.&*!]*(?:maximum|max dose|max daily|not exceed)[^.!?]*[.!?]?/gi) || [];

  if (sentences.length) {
    box.textContent = "FDA dosage text mentioning a maximum: " + sentences.slice(0, 3).join(" ");
    box.classList.remove("hidden");
  } else {
    box.classList.add("hidden");
  }
}

// Multi-Source REMS Resolver: Checks Local FDA Registry, NLM DailyMed SPL, openFDA fields, and text
function renderRemsMultiSource(record, generic, dailyMedRems) {
  const container = $("remsResult");
  const cleanGeneric = (generic || "").toLowerCase().trim();

  // Source 1: Check match against Generic FDA REMS Registry Map (e.g. isotretinoin -> iPLEDGE)
  let matchedKey = Object.keys(FDA_REMS_REGISTRY).find(k => cleanGeneric.includes(k));
  if (matchedKey) {
    const registryData = FDA_REMS_REGISTRY[matchedKey];
    container.innerHTML = `
      <div class="rems-badge rems-active">Active Mandatory FDA REMS Program</div>
      <h4 style="margin: 0.5rem 0 0.2rem 0; font-size: 1.05rem;">${registryData.program}</h4>
      <p style="margin: 0 0 0.5rem 0;">${registryData.desc}</p>
      <a href="${registryData.url}" target="_blank" rel="noopener" class="rems-link-btn">
        Access ${registryData.program} Portal &rarr;
      </a>
    `;
    return;
  }

  // Source 2: NLM DailyMed REMS SPL Document Response
  if (dailyMedRems) {
    const splTitle = dailyMedRems.title || dailyMedRems[1] || "REMS Document";
    const setId = dailyMedRems.setid || dailyMedRems[0];
    const nlmUrl = setId ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}` : API.remsDatabase;

    container.innerHTML = `
      <div class="rems-badge rems-active">REMS Document Identified on NLM DailyMed</div>
      <h4 style="margin: 0.5rem 0 0.2rem 0; font-size: 1.05rem;">${splTitle}</h4>
      <p style="margin: 0 0 0.5rem 0;">The National Library of Medicine (NLM) catalogs active REMS documentation for this product.</p>
      <a href="${nlmUrl}" target="_blank" rel="noopener" class="rems-link-btn">
        View NLM REMS Document &rarr;
      </a>
    `;
    return;
  }

  // Source 3: Explicit REMS JSON field in openFDA Label
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
        Verify requirements on the <a href="${API.remsDatabase}" target="_blank" rel="noopener">Official FDA REMS Database</a>.
      </p>
    `;
    return;
  }

  // Source 4: Scan warnings text for REMS references
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

  // Source 5: Fallback when no sources detect REMS requirements
  const fallbackUrl = `https://www.accessdata.fda.gov/scripts/cder/rems/index.cfm?event=IndivRems.page&DrugName=${encodeURIComponent(generic)}`;
  container.innerHTML = `
    <div class="rems-badge rems-none">No REMS Program Identified</div>
    <p style="margin: 0.5rem 0;" class="muted">
      Neither openFDA, NLM DailyMed, nor label warnings list active REMS requirements for this search.
    </p>
    <a href="${fallbackUrl}" target="_blank" rel="noopener" class="small-note">
      Verify directly on FDA.gov &rarr;
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
