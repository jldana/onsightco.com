// app.js — screen navigation, capture flow, geolocation, save, reminders.

const HOME_SCREEN = "screen-home";
const NAV_STACK = [HOME_SCREEN];

let draft = null; // in-progress entry being built during collection

// ---------------------------------------------------------------- helpers

function $(id) { return document.getElementById(id); }

function showToast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), ms);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------- nav

function goTo(screenId, opts = {}) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screenId).classList.add("active");

  if (!opts.replace) {
    if (NAV_STACK[NAV_STACK.length - 1] !== screenId) NAV_STACK.push(screenId);
  }

  $("back-btn").style.display = screenId === HOME_SCREEN ? "none" : "inline-block";

  const titles = {
    "screen-home": "Waterwatch",
    "screen-videos": "Instructional Videos",
    "screen-info": "More Information",
    "screen-collect": "Collect a Sample",
    "screen-pending": "My Entries",
  };
  $("header-title").textContent = titles[screenId] || "Waterwatch";

  if (screenId === "screen-pending") renderEntries();
  if (screenId === "screen-home") refreshHomeBanner();
  if (screenId === "screen-collect" && !opts.keepDraft) resetCollectFlow();
}

document.addEventListener("click", (e) => {
  const navBtn = e.target.closest("[data-nav]");
  if (navBtn) goTo(navBtn.dataset.nav);
});

$("back-btn").addEventListener("click", () => {
  NAV_STACK.pop();
  const prev = NAV_STACK[NAV_STACK.length - 1] || HOME_SCREEN;
  goTo(prev, { replace: true });
});

// ---------------------------------------------------------------- collection flow

function resetCollectFlow() {
  draft = {
    createdAt: new Date().toISOString(),
    lat: null,
    lon: null,
    accuracy: null,
    rearPhoto: null,
    frontPhoto: null,
    algaeColor: "",
    weather: "",
    notes: "",
    uploaded: false,
  };

  $("rear-preview").style.display = "none";
  $("rear-placeholder").style.display = "block";
  $("rear-box").classList.remove("filled");
  $("step1-next").disabled = true;

  $("front-preview").style.display = "none";
  $("front-placeholder").style.display = "block";
  $("front-box").classList.remove("filled");
  $("step2-next").disabled = true;

  $("field-algae-color").value = "";
  $("field-weather").value = "";
  $("field-notes").value = "";

  $("meta-loc").textContent = "Locating…";
  $("meta-acc").textContent = "—";
  $("meta-time").textContent = "—";

  showCollectStep(1);
}

function showCollectStep(n) {
  document.querySelectorAll(".collect-step").forEach((s) => (s.style.display = "none"));
  $(`step-${n}`).style.display = "block";
  document.querySelectorAll("#step-indicator .dot").forEach((dot) => {
    const step = Number(dot.dataset.step);
    dot.classList.toggle("done", step < n);
    dot.classList.toggle("current", step === n);
  });
  if (n === 3) captureLocation();
}

// -- Step 1: rear camera
$("rear-capture-btn").addEventListener("click", () => $("rear-input").click());
$("rear-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  draft.rearPhoto = file;
  $("rear-preview").src = await blobToDataURL(file);
  $("rear-preview").style.display = "block";
  $("rear-placeholder").style.display = "none";
  $("rear-box").classList.add("filled");
  $("step1-next").disabled = false;
});
$("step1-next").addEventListener("click", () => showCollectStep(2));

// -- Step 2: front camera
$("front-capture-btn").addEventListener("click", () => $("front-input").click());
$("front-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  draft.frontPhoto = file;
  $("front-preview").src = await blobToDataURL(file);
  $("front-preview").style.display = "block";
  $("front-placeholder").style.display = "none";
  $("front-box").classList.add("filled");
  $("step2-next").disabled = false;
});
$("step2-back").addEventListener("click", () => showCollectStep(1));
$("step2-next").addEventListener("click", () => showCollectStep(3));

// -- Step 3: observations + geolocation
function captureLocation() {
  draft.createdAt = new Date().toISOString();
  $("meta-time").textContent = fmtTime(draft.createdAt);

  if (!("geolocation" in navigator)) {
    $("meta-loc").textContent = "Unsupported";
    $("meta-loc").classList.add("warn");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      draft.lat = pos.coords.latitude;
      draft.lon = pos.coords.longitude;
      draft.accuracy = pos.coords.accuracy;
      $("meta-loc").textContent = `${draft.lat.toFixed(5)}, ${draft.lon.toFixed(5)}`;
      $("meta-acc").textContent = `±${Math.round(draft.accuracy)} m`;
    },
    (err) => {
      $("meta-loc").textContent = "Unavailable (" + err.message + ")";
      $("meta-loc").classList.add("warn");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

$("step3-back").addEventListener("click", () => showCollectStep(2));

$("save-entry-btn").addEventListener("click", async () => {
  draft.algaeColor = $("field-algae-color").value;
  draft.weather = $("field-weather").value;
  draft.notes = $("field-notes").value.trim();

  const btn = $("save-entry-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const entry = {
      createdAt: draft.createdAt,
      lat: draft.lat,
      lon: draft.lon,
      accuracy: draft.accuracy,
      rearPhoto: draft.rearPhoto,
      frontPhoto: draft.frontPhoto,
      algaeColor: draft.algaeColor,
      weather: draft.weather,
      notes: draft.notes,
      uploaded: false,
      reminderAt: getReminderTime(draft.createdAt),
    };
    await DB.addEntry(entry);
    scheduleUploadReminder(entry);
    showCollectStep(4);
  } catch (err) {
    console.error(err);
    showToast("Couldn't save entry — try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Entry";
  }
});

$("collect-another-btn").addEventListener("click", () => resetCollectFlow());

// ---------------------------------------------------------------- reminders
//
// There's no backend/push service yet, so this is a best-effort, client-only
// reminder: if the tab stays open, a timed Notification fires later that
// day. Regardless of whether the tab stays open, every app launch checks
// IndexedDB for anything still unuploaded and surfaces a banner on the home
// screen — so the reminder is never lost, just possibly silent until the
// app is reopened. A real push-based reminder needs a backend.

function getReminderTime(createdAtIso) {
  const created = new Date(createdAtIso);
  const reminder = new Date(created);
  reminder.setHours(18, 0, 0, 0); // 6:00 PM same day
  if (reminder <= created) reminder.setTime(created.getTime() + 4 * 60 * 60 * 1000); // else +4h
  return reminder.toISOString();
}

function scheduleUploadReminder(entry) {
  if (!("Notification" in window)) return;

  const fire = () => {
    if (Notification.permission === "granted") {
      new Notification("Waterwatch reminder", {
        body: "You have a sample entry waiting to be uploaded.",
        icon: "icons/icon-192.png",
      });
    }
  };

  const delay = new Date(entry.reminderAt).getTime() - Date.now();
  if (delay <= 0) return;

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
  // Best-effort: only fires if this tab/app stays open until reminderAt.
  setTimeout(fire, Math.min(delay, 2 ** 31 - 1));
}

async function refreshHomeBanner() {
  const all = await DB.getAllEntries();
  const pending = all.filter((e) => !e.uploaded);
  const banner = $("pending-banner");
  const subLabel = $("pending-sub");

  if (pending.length === 0) {
    banner.style.display = "none";
    subLabel.textContent = "View saved & pending uploads";
    return;
  }

  const overdue = pending.filter((e) => new Date(e.reminderAt) <= new Date());
  banner.style.display = "flex";
  $("pending-banner-text").textContent = overdue.length
    ? `${overdue.length} ${overdue.length === 1 ? "entry needs" : "entries need"} uploading`
    : `${pending.length} ${pending.length === 1 ? "entry" : "entries"} saved, not uploaded yet`;
  subLabel.textContent = `${pending.length} pending upload${pending.length === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- entries list

async function renderEntries() {
  const list = $("entries-list");
  const all = await DB.getAllEntries();

  if (all.length === 0) {
    list.innerHTML = `<div class="empty-state">No entries yet. Collect your first sample to see it here.</div>`;
    return;
  }

  list.innerHTML = "";
  for (const entry of all) {
    const card = document.createElement("div");
    card.className = "entry-card";

    const thumbUrl = entry.rearPhoto ? await blobToDataURL(entry.rearPhoto) : "";
    const locText = entry.lat != null ? `${entry.lat.toFixed(4)}, ${entry.lon.toFixed(4)}` : "No location";

    card.innerHTML = `
      <div class="row">
        ${thumbUrl ? `<img src="${thumbUrl}" alt="" />` : ""}
        <div class="meta">
          <strong>${fmtTime(entry.createdAt)}</strong>
          ${locText}<br/>
          ${entry.algaeColor ? "Algae: " + entry.algaeColor : "No algae noted"}${entry.weather ? " · " + entry.weather : ""}
          <div style="margin-top:6px;">
            <span class="status-pill ${entry.uploaded ? "uploaded" : "pending"}">
              ${entry.uploaded ? "Uploaded" : "Pending"}
            </span>
          </div>
        </div>
      </div>
      <div class="entry-actions">
        ${entry.uploaded ? "" : `<button data-action="upload" data-id="${entry.id}">Upload now</button>`}
        <button data-action="delete" data-id="${entry.id}">Delete</button>
      </div>
    `;
    list.appendChild(card);
  }
}

$("entries-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === "delete") {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    await DB.deleteEntry(id);
    showToast("Entry deleted.");
    renderEntries();
    refreshHomeBanner();
  }

  if (action === "upload") {
    btn.disabled = true;
    btn.textContent = "Uploading…";
    const entry = await DB.getEntry(id);
    await DB.uploadEntry(entry); // simulated — no backend configured yet
    showToast("Entry marked as uploaded (no backend connected yet).");
    renderEntries();
    refreshHomeBanner();
  }
});

// ---------------------------------------------------------------- boot

window.addEventListener("load", async () => {
  // Register service worker for offline support.
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (err) {
      console.warn("Service worker registration failed:", err);
    }
  }

  await refreshHomeBanner();

  // Re-arm best-effort reminders for anything still pending from earlier
  // (covers the case where the app was closed and reopened).
  const all = await DB.getAllEntries();
  all.filter((e) => !e.uploaded).forEach(scheduleUploadReminder);

  setTimeout(() => {
    $("loading-screen").classList.add("hidden");
  }, 900);
});
