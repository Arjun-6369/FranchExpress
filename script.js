const BASE_WEIGHT = 300; // grams
const BASE_RATE   = 25;  // rupees
const STEP_RATE   = 7;   // rupees per extra 300 g
const MAX_COUNT   = 10000;

let startPrefix, startLast, padLen, count, idx, entries, lastDate, lastCustomer;

const $ = id => document.getElementById(id);

/* ---------- rate ---------- */
function calcRate(weight) {
  if (!weight || weight <= 0) return 0;
  if (weight <= BASE_WEIGHT) return BASE_RATE;
  return BASE_RATE + Math.ceil((weight - BASE_WEIGHT) / BASE_WEIGHT) * STEP_RATE;
}

/* ---------- pod number logic ---------- */
// Pod number for row i: first 10 digits go up by 1, last digit cycles 0-6.
function podAt(i) {
  const prefix = startPrefix + BigInt(i);
  const last   = (startLast + BigInt(i)) % 7n;
  return prefix.toString().padStart(padLen, "0") + last.toString();
}

/* ---------- screens ---------- */
function show(id) {
  ["setup", "entry", "done"].forEach(s => { $(s).hidden = (s !== id); });
}

function startEntry() {
  const startStr    = $("podStart").value.trim();
  const endStr      = $("podEnd").value.trim();
  const dateVal     = $("topDate").value;
  const customerVal = $("topCustomer").value.trim();

  if (!dateVal) { alert("Please select a date first."); return; }
  if (!customerVal) { alert("Please enter the customer name first."); return; }
  if (startStr.length < 2 || endStr.length < 2) {
    alert("Please enter both the starting and ending pod numbers.");
    return;
  }
  if (startStr.length !== endStr.length) {
    alert("The starting and ending pod numbers should have the same number of digits. Please check what you typed.");
    return;
  }

  const sPrefix = BigInt(startStr.slice(0, -1));
  const sLast   = BigInt(startStr.slice(-1));
  const ePrefix = BigInt(endStr.slice(0, -1));

  if (sLast > 6n) {
    alert("The last digit of the starting pod number can only be 0 to 6.");
    return;
  }
  if (ePrefix < sPrefix) {
    alert("Ending pod number must be greater than or equal to the starting pod number.");
    return;
  }
  if (ePrefix - sPrefix + 1n > BigInt(MAX_COUNT)) {
    alert("That range is more than " + MAX_COUNT + " pods.");
    return;
  }

  startPrefix = sPrefix;
  startLast   = sLast;
  padLen      = startStr.length - 1;     // keeps leading zeros of the prefix
  count       = Number(ePrefix - sPrefix + 1n);

  // the last bill should match what was typed; if not, ask before going on
  const expectedEnd = podAt(count - 1);
  if (expectedEnd !== endStr) {
    const ok = confirm(
      "With this starting number, the last bill would be " + expectedEnd +
      ", but you typed " + endStr + ".\n\nContinue with " + count + " bills?"
    );
    if (!ok) return;
  }

  entries      = new Array(count).fill(null);
  idx          = 0;
  lastDate     = dateVal;
  lastCustomer = customerVal;

  show("entry");
  loadRow();
}

function loadRow() {
  const e = entries[idx];
  const pod = podAt(idx);

  $("progress").textContent = "Pod " + (idx + 1) + " of " + count;
  const pct = Math.round((idx / count) * 100);
  $("percent").textContent = pct + "%";
  $("barFill").style.width = pct + "%";

  $("rowPod").value        = pod;
  $("podShow").textContent = pod;
  $("rowCustomer").value   = e ? e.customer : lastCustomer;
  $("rowDate").value       = e ? e.date : lastDate;
  $("rowArea").value       = e ? e.area : "";
  $("rowWeight").value     = e ? e.weight : "";
  showRate();

  $("backBtn").disabled = (idx === 0);
  $("nextBtn").textContent = (idx === count - 1) ? "Add & finish" : "Add & next";
  updateSummary();
  $("rowArea").focus();
}

function showRate() {
  const w = parseFloat($("rowWeight").value);
  const r = w > 0 ? calcRate(w) : 0;
  $("rowRate").value = r || "";
  $("rateShow").textContent = "₹" + r;
}

/* ---------- actions ---------- */
function addAndNext(ev) {
  ev.preventDefault();
  const weight = parseFloat($("rowWeight").value);
  if (!(weight > 0)) { alert("Please enter the weight."); return; }

  entries[idx] = {
    pod:      $("rowPod").value,
    customer: $("rowCustomer").value.trim(),
    date:     $("rowDate").value,
    area:     $("rowArea").value.trim(),
    weight:   weight,
    rate:     calcRate(weight)
  };
  lastDate     = $("rowDate").value;              // next pod starts with the date just used
  lastCustomer = $("rowCustomer").value.trim();   // and the customer name just used
  moveNext();
}

function skipPod() {
  if (entries[idx] && !confirm("This pod already has an entry. Remove it and skip?")) return;
  entries[idx] = null;
  moveNext();
}

function moveNext() {
  if (idx === count - 1) { finish(); return; }
  idx++;
  loadRow();
}

function goBack() {
  if (idx > 0) { idx--; loadRow(); }
}

/* ---------- totals ---------- */
function stats() {
  const saved = entries.filter(Boolean);
  return {
    saved: saved.length,
    skipped: count - saved.length,
    total: saved.reduce((s, e) => s + e.rate, 0)
  };
}

function updateSummary() {
  const s = stats();
  $("sumSaved").textContent = s.saved;
  $("sumTotal").textContent = "₹" + s.total;
}

function finish() {
  const s = stats();
  $("doneSaved").textContent   = s.saved;
  $("doneSkipped").textContent = s.skipped;
  $("doneTotal").textContent   = "₹" + s.total;
  show("done");
}

function reviewLast() {
  idx = count - 1;
  show("entry");
  loadRow();
}

/* ---------- save to the Spring Boot server ---------- */
async function submitAll() {
  const data = entries.filter(Boolean);
  if (!data.length) { alert("There are no bills to save."); return; }

  const payload = data.map(e => ({
    podNumber:    e.pod,
    customerName: e.customer,
    billDate:     e.date,
    area:         e.area,
    weight:       e.weight
  }));

  try {
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      alert(body.saved + " bills saved.");
      newBatch();
    } else if (res.status === 409) {
      alert(body.message + "\nFor example: " + body.duplicates.slice(0, 5).join(", "));
    } else {
      alert("Could not save the bills. " + (body.message || "Error " + res.status));
    }
  } catch (err) {
    alert("Cannot reach the server. Is the Spring Boot app running?");
  }
}

function newBatch() {
  show("setup");
  $("podStart").value    = "";
  $("podEnd").value      = "";
  $("topCustomer").value = "";   // a new batch usually means a new customer
}