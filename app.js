// Networking Contacts: UI.
// Routes: #/ (contacts), #/contact/<id>, #/contact/<id>/edit, #/new, #/import, #/tags, #/export, #/settings

(function () {
  const METHODS = ["Email", "LinkedIn", "Phone call", "Text", "In person", "Other"];
  const EMAIL_STATUSES = [["unchecked", "Not checked"], ["verified", "Verified"], ["bounced", "Bounced"]];
  const LI_STATUSES = [["none", "Not connected"], ["following", "Following"], ["requested", "Request sent"], ["connected", "Connected"]];
  // History entry (kind "linkedin") logged when the status changes; stored in the method column.
  const LI_EVENT = { following: "Followed", requested: "Request sent", connected: "Connected" };
  const LI_EVENT_TEXT = { Followed: "Followed on LinkedIn", "Request sent": "Sent a LinkedIn connection request", Connected: "Connected on LinkedIn" };
  const STATUS_FILTERS = [["all", "All"], ["notcontacted", "Not contacted"], ["contacted", "Contacted"], ["waiting", "Waiting"], ["replied", "Replied"]];

  const root = document.getElementById("root");
  const backend = window.createBackend();
  const state = {
    contacts: [],
    interactions: [],
    user: null,
    displayName: "",
    filters: { q: "", status: "all", tag: "" },
    sort: { key: "name", dir: 1 },
    flash: "",
    logOpen: false,
    loaded: false,
    route: { page: "contacts" },
    importPlan: null,
  };

  // ---------- icons (inline stroke SVG) ----------

  const svg = (size, body, sw = 1.75) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const I = {
    logo: (s = 16) => svg(s, '<circle cx="7" cy="12" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9.7 10.7 14.3 8.3M9.7 13.3l4.6 2.4"/>', 2),
    users: (s = 17) => svg(s, '<path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="9" cy="8" r="4"/><path d="M22 20v-1a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75"/>'),
    tag: (s = 17) => svg(s, '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    download: (s = 17) => svg(s, '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
    upload: (s = 17) => svg(s, '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
    settings: (s = 17) => svg(s, '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    chevron: (s = 14) => svg(s, '<path d="m6 9 6 6 6-6"/>', 2),
    search: (s = 16) => svg(s, '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    plus: (s = 16) => svg(s, '<path d="M12 5v14M5 12h14"/>', 2.25),
    menu: (s = 18) => svg(s, '<path d="M4 7h16M4 12h16M4 17h16"/>', 2),
    dots: (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`,
    close: (s = 15) => svg(s, '<path d="M18 6 6 18M6 6l12 12"/>', 2),
    pencil: (s = 15) => svg(s, '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'),
    eye: (s = 15) => svg(s, '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    check: (s = 13) => svg(s, '<path d="m5 12 5 5 9-10"/>', 2.5),
    alert: (s = 11) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h0"/>', 2.5),
    trash: (s = 14) => svg(s, '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    signout: (s = 15) => svg(s, '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'),
    // contact methods
    Email: (s = 13) => svg(s, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', 2),
    LinkedIn: (s = 13) => svg(s, '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 2),
    "Phone call": (s = 13) => svg(s, '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', 2),
    Text: (s = 13) => svg(s, '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>', 2),
    "In person": (s = 13) => svg(s, '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>', 2),
    Other: (s = 13) => svg(s, '<circle cx="12" cy="12" r="8"/>', 2),
  };
  const methodIcon = (m) => (I[m] || I.Other)(13);

  // ---------- helpers ----------

  const esc = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  const options = (list, selected) =>
    list.map((o) => {
      const [value, label] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
    }).join("");

  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoOf(new Date());
  function weekStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function parseISO(iso) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const fmtDate = (iso) => (iso ? parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
  const daysSince = (iso) => Math.max(0, Math.round((parseISO(todayISO()) - parseISO(iso)) / 86400000));

  const fullName = (c) => [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");
  const initials = (c) => ((c.first_name || "")[0] || "").toUpperCase() + ((c.last_name || "")[0] || "").toUpperCase();

  function preferredEmail(c) {
    if (c.preferred_email === "work" && c.work_email) return c.work_email;
    if (c.preferred_email === "personal" && c.personal_email) return c.personal_email;
    return c.work_email || c.personal_email || "";
  }

  function safeUrl(url) {
    if (!url) return "";
    const u = /^https?:\/\//i.test(url) ? url : "https://" + url;
    try { return new URL(u).href; } catch (e) { return ""; }
  }

  const byNewest = (a, b) =>
    b.happened_on.localeCompare(a.happened_on) || String(b.created_at).localeCompare(String(a.created_at));

  // Contacted / Replied / Waiting are all derived from the history log.
  function summary(c) {
    const history = state.interactions.filter((i) => i.contact_id === c.id).sort(byNewest);
    const outreach = history.filter((i) => i.kind === "outreach");
    const replies = history.filter((i) => i.kind === "reply");
    const lastOut = outreach[0] || null;
    const lastReply = replies[0] || null;
    const waiting = !!lastOut && (!lastReply || lastReply.happened_on < lastOut.happened_on);
    return { history, outreach, replies, lastOut, lastReply, waiting };
  }

  function allTags() {
    const counts = new Map();
    state.contacts.forEach((c) => (c.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
  }
  const tagNames = () => allTags().map(([t]) => t);

  function nameFromEmail(email) {
    const first = String(email || "").split("@")[0].split(/[._\-\d]+/)[0] || "there";
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem("jobtoolapp:" + key));
      localStorage.setItem("jobtoolapp:" + key, JSON.stringify(value));
    } catch (e) { return null; }
  }

  function setBusy(el, busy) {
    el.querySelectorAll("button, input, select, textarea").forEach((x) => (x.disabled = busy));
  }

  async function run(action, el) {
    if (el) setBusy(el, true);
    try {
      return await action();
    } catch (err) {
      alert("Something went wrong: " + err.message);
      throw err;
    } finally {
      if (el) setBusy(el, false);
    }
  }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  // ---------- filtering / sorting ----------

  function filteredContacts() {
    const { q, status, tag } = state.filters;
    const needle = q.trim().toLowerCase();
    const rows = state.contacts.map((c) => ({ c, s: summary(c) })).filter(({ c, s }) => {
      if (status === "notcontacted" && s.lastOut) return false;
      if (status === "contacted" && !s.lastOut) return false;
      if (status === "waiting" && !s.waiting) return false;
      if (status === "replied" && !s.lastReply) return false;
      if (tag && !(c.tags || []).includes(tag)) return false;
      if (needle) {
        const hay = [
          fullName(c), c.company, c.job_title, c.location, c.personal_email, c.work_email, c.phone,
          c.referred_by, c.event_met_at, c.notes, (c.tags || []).join(" "),
          ...s.history.map((i) => i.note),
        ].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const { key, dir } = state.sort;
    const val = ({ c, s }) => {
      switch (key) {
        case "name": return (c.last_name || c.first_name || "") + " " + c.first_name;
        case "contacted": return s.lastOut ? s.lastOut.happened_on : "";
        case "replied": return s.waiting ? "0" + s.lastOut.happened_on : s.lastReply ? "1" + s.lastReply.happened_on : "";
        case "tags": return (c.tags || []).join(",");
        default: return c[key] || "";
      }
    };
    rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (!va && vb) return 1; // blanks always last
      if (va && !vb) return -1;
      return dir * va.localeCompare(vb, undefined, { sensitivity: "base", numeric: true });
    });
    return rows;
  }

  // ---------- CSV export ----------

  function csvCell(v) {
    let s = String(v == null ? "" : v);
    // Stop spreadsheet apps from treating text as a formula (phone numbers like +1 555 are fine).
    if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s().-]*$/.test(s))) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, header, rows) {
    const text = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const statusLabel = (s) => (EMAIL_STATUSES.find(([v]) => v === s) || [, ""])[1];
  const liLabel = (s) => (LI_STATUSES.find(([v]) => v === s) || LI_STATUSES[0])[1];
  const kindLabel = { outreach: "Outreach", reply: "Reply", linkedin: "LinkedIn" };
  const everyone = () => state.contacts.map((c) => ({ c, s: summary(c) }));

  function exportContacts(list) {
    const header = [
      "First Name", "Middle Name", "Last Name", "Job Title", "Company", "Location", "LinkedIn", "LinkedIn Status",
      "Personal Email", "Personal Email Status", "Work Email", "Work Email Status", "Preferred Email",
      "Phone", "Contacted", "Times Contacted", "Last Contacted On", "Last Contacted Via",
      "Replied", "Times Replied", "Last Replied On", "Last Replied Via",
      "Referred By", "Event Met At", "Notes", "Tags", "Added On",
    ];
    const rows = list.map(({ c, s }) => [
      c.first_name, c.middle_name, c.last_name, c.job_title, c.company, c.location, c.linkedin_url,
      liLabel(c.linkedin_status), c.personal_email, c.personal_email ? statusLabel(c.personal_email_status) : "",
      c.work_email, c.work_email ? statusLabel(c.work_email_status) : "", preferredEmail(c),
      c.phone, s.lastOut ? "Yes" : "No", s.outreach.length, s.lastOut ? s.lastOut.happened_on : "",
      s.lastOut ? s.lastOut.method : "", s.lastReply ? "Yes" : "No", s.replies.length,
      s.lastReply ? s.lastReply.happened_on : "", s.lastReply ? s.lastReply.method : "",
      c.referred_by, c.event_met_at, c.notes, (c.tags || []).join("; "),
      c.created_at ? c.created_at.slice(0, 10) : "",
    ]);
    downloadCsv(`contacts-${todayISO()}.csv`, header, rows);
  }

  function exportHistory(list) {
    const header = ["Contact", "Company", "Type", "Date", "Method", "Note"];
    const rows = [];
    list.forEach(({ c, s }) => {
      [...s.history].reverse().forEach((i) => rows.push([
        fullName(c), c.company, kindLabel[i.kind] || i.kind, i.happened_on, i.method, i.note,
      ]));
    });
    downloadCsv(`contact-history-${todayISO()}.csv`, header, rows);
  }

  // ---------- CSV import ----------

  function parseCsv(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ""));
  }

  // Column names we recognize (lowercase, letters and digits only).
  const IMPORT_COLUMNS = {
    first_name: ["firstname", "first", "givenname"],
    middle_name: ["middlename", "middle"],
    last_name: ["lastname", "last", "surname", "familyname"],
    full_name: ["name", "fullname", "contactname", "contact"],
    job_title: ["jobtitle", "title", "position", "role"],
    company: ["company", "companyname", "organization", "organisation", "employer"],
    location: ["location", "city"],
    linkedin_url: ["linkedin", "linkedinurl", "linkedinprofile", "url", "profileurl"],
    linkedin_status: ["linkedinstatus", "connectionstatus"],
    connected_on: ["connectedon"],
    personal_email: ["personalemail", "email", "emailaddress", "email1"],
    personal_email_status: ["personalemailstatus"],
    work_email: ["workemail", "businessemail", "email2"],
    work_email_status: ["workemailstatus"],
    preferred_email: ["preferredemail"],
    phone: ["phone", "phonenumber", "mobile", "cell"],
    referred_by: ["referredby", "referral", "referrer"],
    event_met_at: ["eventmetat", "event", "metat"],
    notes: ["notes", "note", "additionalnotes"],
    tags: ["tags", "tag", "labels"],
    last_contacted_on: ["lastcontactedon", "contactedon"],
    last_contacted_via: ["lastcontactedvia", "contactedvia", "contactmethod"],
    last_replied_on: ["lastrepliedon", "repliedon"],
    last_replied_via: ["lastrepliedvia", "repliedvia", "replymethod"],
  };
  const COLUMN_LABELS = {
    first_name: "First name", middle_name: "Middle name", last_name: "Last name", full_name: "Full name",
    job_title: "Job title", company: "Company", location: "Location", linkedin_url: "LinkedIn",
    linkedin_status: "LinkedIn status", connected_on: "Connected on (LinkedIn)",
    personal_email: "Personal email", personal_email_status: "Personal email status", work_email: "Work email",
    work_email_status: "Work email status", preferred_email: "Preferred email", phone: "Phone",
    referred_by: "Referred by", event_met_at: "Event met at", notes: "Notes", tags: "Tags",
    last_contacted_on: "Last contacted date", last_contacted_via: "Last contacted method",
    last_replied_on: "Last replied date", last_replied_via: "Last replied method",
  };
  const normHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
  function columnFor(h) {
    const n = normHeader(h);
    return Object.keys(IMPORT_COLUMNS).find((k) => IMPORT_COLUMNS[k].includes(n)) || null;
  }

  function toISODate(v) {
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const t = Date.parse(v);
    return isNaN(t) ? null : isoOf(new Date(t));
  }
  const toMethod = (v) => METHODS.find((m) => m.toLowerCase() === String(v || "").trim().toLowerCase()) ||
    (/phone|call/i.test(v) ? "Phone call" : /sms|text/i.test(v) ? "Text" : /person|coffee|meet/i.test(v) ? "In person" : "Other");
  const toStatus = (v) => (/verif/i.test(v) ? "verified" : /bounc/i.test(v) ? "bounced" : "unchecked");
  const toLiStatus = (v) => (!v || /not|none/i.test(v) ? "none" : /request|pending|sent/i.test(v) ? "requested"
    : /connect/i.test(v) ? "connected" : /follow/i.test(v) ? "following" : "none");

  function planImport(text) {
    const rows = parseCsv(text);
    // Some exports (e.g. LinkedIn) put a few lines of notes above the header row.
    const headerAt = rows.slice(0, 10).findIndex((r) => r.some((h) => ["first_name", "full_name"].includes(columnFor(h))));
    if (headerAt < 0) return { error: "Couldn't find a name column. The first row should have headings like \"First Name\" and \"Last Name\", or \"Name\"." };
    const cols = rows[headerAt].map(columnFor);
    const known = new Map(tagNames().map((t) => [t.toLowerCase(), t]));
    const seenEmails = new Set();
    const seenNames = new Set();
    state.contacts.forEach((c) => {
      [c.personal_email, c.work_email].filter(Boolean).forEach((e) => seenEmails.add(e.toLowerCase()));
      seenNames.add((fullName(c) + "|" + (c.company || "")).toLowerCase());
    });

    const items = [];
    let noName = 0, dupes = 0;
    for (const r of rows.slice(headerAt + 1)) {
      const rec = {};
      cols.forEach((k, i) => {
        const v = (r[i] || "").trim().replace(/^'(?=[=+\-@])/, "");
        if (k && v && !(k in rec)) rec[k] = v;
      });
      if (!rec.first_name && rec.full_name) {
        const parts = rec.full_name.split(/\s+/);
        rec.first_name = parts.shift();
        if (parts.length && !rec.last_name) rec.last_name = parts.pop();
        if (parts.length && !rec.middle_name) rec.middle_name = parts.join(" ");
      }
      if (!rec.first_name) { noName++; continue; }

      const contact = {
        first_name: rec.first_name, middle_name: rec.middle_name || "", last_name: rec.last_name || "",
        job_title: rec.job_title || "", company: rec.company || "", location: rec.location || "",
        linkedin_url: rec.linkedin_url ? safeUrl(rec.linkedin_url) || rec.linkedin_url : "",
        linkedin_status: rec.connected_on ? "connected" : toLiStatus(rec.linkedin_status),
        personal_email: rec.personal_email || "", personal_email_status: toStatus(rec.personal_email_status),
        work_email: rec.work_email || "", work_email_status: toStatus(rec.work_email_status),
        preferred_email: null, phone: rec.phone || "", referred_by: rec.referred_by || "",
        event_met_at: rec.event_met_at || "", notes: rec.notes || "",
        tags: [...new Set(String(rec.tags || "").split(/[;,]/).map((t) => t.trim()).filter(Boolean)
          .map((t) => known.get(t.toLowerCase()) || t))],
      };
      const pref = String(rec.preferred_email || "").toLowerCase();
      if (pref && (pref === contact.work_email.toLowerCase() || pref === "work")) contact.preferred_email = "work";
      else if (pref && (pref === contact.personal_email.toLowerCase() || pref === "personal")) contact.preferred_email = "personal";

      const emails = [contact.personal_email, contact.work_email].filter(Boolean).map((e) => e.toLowerCase());
      const nameKey = (fullName(contact) + "|" + contact.company).toLowerCase();
      if (emails.some((e) => seenEmails.has(e)) || seenNames.has(nameKey)) { dupes++; continue; }
      emails.forEach((e) => seenEmails.add(e));
      seenNames.add(nameKey);

      const interactions = [];
      const connectedOn = toISODate(rec.connected_on);
      if (connectedOn) interactions.push({ kind: "linkedin", happened_on: connectedOn, method: "Connected", note: "Imported" });
      const outOn = toISODate(rec.last_contacted_on);
      if (outOn) interactions.push({ kind: "outreach", happened_on: outOn, method: toMethod(rec.last_contacted_via), note: "Imported" });
      const repOn = toISODate(rec.last_replied_on);
      if (repOn) interactions.push({ kind: "reply", happened_on: repOn, method: toMethod(rec.last_replied_via), note: "Imported" });
      items.push({ contact, interactions });
    }
    const recognized = [...new Set(cols.filter(Boolean))].map((k) => COLUMN_LABELS[k]);
    const ignored = rows[headerAt].filter((h, i) => !cols[i] && h.trim());
    return { items, noName, dupes, recognized, ignored };
  }

  // ---------- small render pieces ----------

  function outBadge(s) {
    return s.lastOut
      ? `<span class="badge yes" title="${esc(fmtDate(s.lastOut.happened_on))}">${methodIcon(s.lastOut.method)} Yes · ${esc(s.lastOut.method)}</span>`
      : `<span class="badge">No</span>`;
  }
  function replyBadge(s) {
    if (s.waiting) {
      const d = daysSince(s.lastOut.happened_on);
      return `<span class="badge warn" title="Last reached out ${esc(fmtDate(s.lastOut.happened_on))}">Waiting · ${d === 0 ? "today" : d + "d"}</span>`;
    }
    if (s.lastReply) {
      return `<span class="badge solid" title="${esc(fmtDate(s.lastReply.happened_on))}">${I.check()} Yes · ${esc(s.lastReply.method)}</span>`;
    }
    return `<span class="badge">No</span>`;
  }
  function liMark(c) {
    const s = c.linkedin_status;
    if (!s || s === "none") return "";
    return `<span class="li-mark ${s}" title="LinkedIn: ${esc(liLabel(s))}"><span class="sr-only">LinkedIn: ${esc(liLabel(s))}</span>in</span>`;
  }
  const pills = (tags) => (tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join("");

  // ---------- shell ----------

  function renderShell() {
    const collapsed = store("collapsed") || {};
    const section = (id, label, items) => `
      <div class="nav-section${collapsed[id] ? " collapsed" : ""}" data-section="${id}">
        <button class="nav-head" aria-expanded="${!collapsed[id]}"><span>${label}</span>${I.chevron()}</button>
        ${items}
      </div>`;
    root.innerHTML = `
      <div class="shell">
        <div class="nav-scrim"></div>
        <nav class="sidebar" aria-label="Main">
          <a class="brand" href="#/"><span class="brand-mark">${I.logo()}</span>Networking</a>
          ${section("workspace", "Workspace", `
            <a class="nav-item" data-nav="contacts" href="#/">${I.users()}<span>Contacts</span><span class="count mono" id="nav-count"></span></a>
            <a class="nav-item" data-nav="tags" href="#/tags">${I.tag()}<span>Tags</span></a>
            <a class="nav-item" data-nav="export" href="#/export">${I.download()}<span>Export</span></a>`)}
          ${section("account", "Account", `
            <a class="nav-item" data-nav="settings" href="#/settings">${I.settings()}<span>Settings</span></a>`)}
          <div class="user-chip">
            <span class="avatar me" id="me-initials"></span>
            <div class="who"><span id="me-name"></span><span>${esc(state.user.email)}</span></div>
          </div>
        </nav>
        <div class="main-col">
          <header class="topbar">
            <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu">${I.menu()}</button>
            <label class="search">${I.search()}
              <span class="sr-only">Search contacts</span>
              <input id="search" type="search" placeholder="Search contacts" autocomplete="off">
              <span class="kbd">/</span>
            </label>
            <span class="spacer"></span>
            <a class="btn primary" href="#/new" aria-label="Add Contact">${I.plus()}<span class="add-label">Add Contact</span></a>
          </header>
          ${backend.demo ? `<div class="demo-banner">Demo mode: sample data, saved only in this browser. <a href="${location.pathname}">Leave demo</a></div>` : ""}
          <main class="page" id="page"></main>
        </div>
      </div>
      <div id="overlay"></div>`;

    $$(".nav-head").forEach((btn) => btn.addEventListener("click", () => {
      const sec = btn.parentElement;
      sec.classList.toggle("collapsed");
      const now = store("collapsed") || {};
      now[sec.dataset.section] = sec.classList.contains("collapsed");
      btn.setAttribute("aria-expanded", String(!now[sec.dataset.section]));
      store("collapsed", now);
    }));
    const shell = $(".shell");
    $("#menu-btn").addEventListener("click", () => shell.classList.add("nav-open"));
    $(".nav-scrim").addEventListener("click", () => shell.classList.remove("nav-open"));
    $$(".nav-item").forEach((a) => a.addEventListener("click", () => shell.classList.remove("nav-open")));

    const search = $("#search");
    search.value = state.filters.q;
    search.addEventListener("input", () => {
      state.filters.q = search.value;
      if (state.route.page !== "contacts") location.hash = "#/";
      else renderRows();
    });
    updateShell();
  }

  function updateShell() {
    $("#nav-count").textContent = state.contacts.length || "";
    $("#me-name").textContent = state.displayName;
    $("#me-initials").textContent = state.displayName.slice(0, 2).toUpperCase();
    $$(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.nav === state.route.page));
  }

  // ---------- pages ----------

  function renderPage() {
    const page = $("#page");
    const p = state.route.page;
    if (p === "tags") renderTagsPage(page);
    else if (p === "export") renderExportPage(page);
    else if (p === "settings") renderSettingsPage(page);
    else renderContactsPage(page);
    updateShell();
  }

  function takeFlash() {
    const f = state.flash;
    state.flash = "";
    return f ? `<div class="flash" role="status">${esc(f)}</div>` : "";
  }

  function stats() {
    const all = everyone();
    const monday = weekStart();
    const mondayISO = isoOf(monday);
    const contacted = all.filter(({ s }) => s.lastOut).length;
    const replied = all.filter(({ s }) => s.lastOut && s.lastReply).length;
    return {
      total: all.length,
      addedThisWeek: state.contacts.filter((c) => c.created_at && new Date(c.created_at) >= monday).length,
      contacted,
      replied,
      rate: contacted ? Math.round((replied / contacted) * 100) : null,
      contactedThisWeek: all.filter(({ s }) => s.outreach.some((i) => i.happened_on >= mondayISO)).length,
      pending: all.filter(({ s }) => s.waiting).length,
      mondayLabel: monday.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    };
  }

  // What you did today, counted from history entries dated today and contacts added today.
  function todayActivity() {
    const t = todayISO();
    const today = state.interactions.filter((i) => i.happened_on === t);
    const out = today.filter((i) => i.kind === "outreach");
    const li = today.filter((i) => i.kind === "linkedin");
    return {
      emails: out.filter((i) => i.method === "Email").length,
      liMessages: out.filter((i) => i.method === "LinkedIn").length,
      otherOut: out.filter((i) => i.method !== "Email" && i.method !== "LinkedIn").length,
      replies: today.filter((i) => i.kind === "reply").length,
      liRequests: li.filter((i) => i.method === "Request sent" || i.method === "Followed").length,
      liConnected: li.filter((i) => i.method === "Connected").length,
      added: state.contacts.filter((c) => c.created_at && isoOf(new Date(c.created_at)) === t).length,
    };
  }

  const CHEERS = [
    // [minimum actions, messages]
    [10, ["Outstanding hustle today. Take a second to be proud of that.", "Double digits! That's the kind of day that lands interviews.", "You showed up in a big way today. Well done."]],
    [6, ["Great work today — that's real momentum.", "You're on a roll. Keep this energy going.", "Strong day. Every one of these is a door you opened."]],
    [3, ["Solid day — you're putting yourself out there.", "Nice work. Consistency like this adds up fast.", "Good progress today. Your network is growing."]],
    [1, ["Good start! Every message is a door opening.", "You got moving today — that's the hardest part.", "One step at a time. Nice work getting started."]],
    [0, ["A fresh day. One message is all it takes to get going.", "Nothing logged yet today. Who's one person you could reach out to?", "Today's a blank page. A quick note to one contact counts."]],
  ];

  function cheer(a) {
    const actions = a.emails + a.liMessages + a.otherOut + a.liRequests + a.added;
    const [, lines] = CHEERS.find(([min]) => actions >= min);
    const dayNum = Math.floor(parseISO(todayISO()).getTime() / 86400000);
    let msg = lines[dayNum % lines.length];
    const heard = a.replies + a.liConnected;
    if (heard && !actions) msg = heard === 1 ? "Someone got back to you today — go keep that conversation going." : `${heard} people got back to you today. That's what all the outreach is for.`;
    else if (heard) msg += heard === 1 ? " Plus, someone got back to you!" : ` Plus, ${heard} people got back to you!`;
    return msg;
  }

  function todayCard() {
    const a = todayActivity();
    const tile = (n, label) => `<div class="today-tile${n ? "" : " zero"}"><span class="n">${n}</span><span class="l">${label}</span></div>`;
    return `
      <section class="card today" aria-label="Today's activity">
        <div class="today-msg">
          <span class="label">Today</span>
          <p>${esc(cheer(a))}</p>
        </div>
        <div class="today-tiles">
          ${tile(a.emails, a.emails === 1 ? "Email sent" : "Emails sent")}
          ${tile(a.liMessages, a.liMessages === 1 ? "LinkedIn message" : "LinkedIn messages")}
          ${tile(a.otherOut, "Calls, texts &amp; in person")}
          ${tile(a.liRequests, "LinkedIn requests &amp; follows")}
          ${tile(a.replies + a.liConnected, a.replies + a.liConnected === 1 ? "Reply or new connection" : "Replies &amp; new connections")}
          ${tile(a.added, a.added === 1 ? "New contact" : "New contacts")}
        </div>
      </section>`;
  }

  function renderContactsPage(page) {
    const st = stats();
    const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    page.innerHTML = `
      ${takeFlash()}
      <div class="page-head">
        <div><div class="date">${esc(today)}</div><h1>Welcome back, ${esc(state.displayName)}</h1></div>
        <div class="actions">
          <a class="btn" href="#/new">${I.plus(15)} Add Contact</a>
          <button class="btn" id="qa-export" title="Download the contacts shown below">${I.download(15)} Export CSV</button>
          <a class="btn" href="#/import">${I.upload(15)} Import</a>
        </div>
      </div>
      ${todayCard()}
      <div class="stats">
        <div class="card stat"><span class="label">Total Contacts</span><span class="value">${st.total}</span>
          <span class="sub">${st.addedThisWeek ? `+${st.addedThisWeek} added this week` : "None added this week"}</span></div>
        <div class="card stat"><span class="label">Reply Rate</span><span class="value">${st.rate == null ? "—" : st.rate + "%"}</span>
          <div class="meter"><div style="width:${st.rate || 0}%"></div></div>
          <span class="sub">${st.contacted ? `${st.replied} of ${st.contacted} contacted replied` : "Log outreach to see this"}</span></div>
        <div class="card stat"><span class="label">Contacted This Week</span><span class="value">${st.contactedThisWeek}</span>
          <span class="sub">Since ${esc(st.mondayLabel)}</span></div>
        <div class="card stat"><span class="label">Pending Follow-ups</span><span class="value${st.pending ? " warn" : ""}">${st.pending}</span>
          <span class="sub">Contacted, no reply yet</span></div>
      </div>
      <section class="card table-card" aria-label="Contacts">
        <div class="table-head">
          <h2>Contacts <span id="shown-count"></span></h2>
          <div class="filters">
            ${STATUS_FILTERS.map(([v, l]) => `<button class="chip${state.filters.status === v ? " on" : ""}" data-status="${v}" aria-pressed="${state.filters.status === v}">${l}</button>`).join("")}
            <select class="select" id="tag-filter" aria-label="Filter by tag">${options([["", "All tags"], ...tagNames()], state.filters.tag)}</select>
          </div>
        </div>
        <div id="rows"></div>
      </section>`;

    $$(".chip", page).forEach((b) => b.addEventListener("click", () => {
      state.filters.status = b.dataset.status;
      $$(".chip", page).forEach((x) => {
        x.classList.toggle("on", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      renderRows();
    }));
    $("#tag-filter").addEventListener("change", (e) => { state.filters.tag = e.target.value; renderRows(); });
    $("#qa-export").addEventListener("click", () => exportContacts(filteredContacts()));
    renderRows();
  }

  function renderRows() {
    const box = $("#rows");
    if (!box) return;
    const rows = filteredContacts();
    const total = state.contacts.length;
    $("#shown-count").textContent = rows.length === total ? String(total) : `${rows.length} of ${total}`;
    const activeId = state.route.id;
    const arrow = (k) => (state.sort.key === k ? (state.sort.dir > 0 ? " ↑" : " ↓") : "");
    const head = (k, l, cls = "") => `<button class="${cls}" data-sort="${k}">${l}${arrow(k)}</button>`;

    if (!total) {
      box.innerHTML = `<div class="empty"><p>No contacts yet.</p><a class="btn primary" href="#/new">${I.plus()} Add your first contact</a>
        <p style="margin-top:14px">or <a href="#/import">import a spreadsheet</a></p></div>`;
      return;
    }
    box.innerHTML = `
      <div class="grid-row head">
        ${head("name", "Name")}${head("company", "Company")}${head("contacted", "Contacted")}${head("replied", "Replied")}
        <span class="col-ref">${head("referred_by", "Referred By")}</span>${head("tags", "Tags")}<span></span>
      </div>
      ${rows.length ? rows.map(({ c, s }) => `
        <div class="grid-row item${c.id === activeId ? " active" : ""}" data-id="${esc(c.id)}">
          <div class="who-cell">
            <span class="avatar">${esc(initials(c))}</span>
            <div class="names"><b>${esc(fullName(c))}${liMark(c)}</b><span>${esc(c.job_title)}${c.company ? `<span class="m-co">${c.job_title ? " · " : ""}${esc(c.company)}</span>` : ""}</span></div>
          </div>
          <div class="cell col-company">${esc(c.company)}</div>
          <div class="col-out">${outBadge(s)}</div>
          <div class="col-rep">${replyBadge(s)}</div>
          <div class="cell dim col-ref">${esc(c.referred_by)}</div>
          <div class="tags-cell col-tags">${pills(c.tags)}</div>
          <div class="col-menu"><button class="icon-btn" data-menu="${esc(c.id)}" aria-label="Actions for ${esc(fullName(c))}" aria-haspopup="menu">${I.dots()}</button></div>
        </div>`).join("") : `<div class="empty"><p>No contacts match these filters.</p></div>`}`;

    $$("[data-sort]", box).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
      renderRows();
    }));
    $$(".grid-row.item", box).forEach((row) => row.addEventListener("click", (e) => {
      if (e.target.closest("[data-menu]")) return;
      location.hash = "#/contact/" + row.dataset.id;
    }));
    $$("[data-menu]", box).forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      openRowMenu(b, b.dataset.menu);
    }));
  }

  function closeRowMenu() {
    const m = $(".row-menu");
    if (m) m.remove();
  }
  function openRowMenu(anchor, id) {
    closeRowMenu();
    const menu = document.createElement("div");
    menu.className = "row-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <button role="menuitem" data-go="#/contact/${esc(id)}">${I.eye()} View details</button>
      <button role="menuitem" data-go="#/contact/${esc(id)}/edit">${I.pencil()} Edit</button>
      <button role="menuitem" data-go="#/contact/${esc(id)}" data-log="1">${I.plus(15)} Log outreach</button>`;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + 6 + menu.offsetHeight > window.innerHeight ? r.top - menu.offsetHeight - 6 : r.bottom + 6;
    menu.style.top = top + "px";
    menu.style.left = Math.max(8, r.right - menu.offsetWidth) + "px";
    $$("button", menu).forEach((b) => b.addEventListener("click", () => {
      state.logOpen = !!b.dataset.log;
      closeRowMenu();
      location.hash = b.dataset.go;
    }));
    menu.querySelector("button").focus();
  }

  function renderTagsPage(page) {
    const tags = allTags();
    const untagged = state.contacts.filter((c) => !(c.tags || []).length).length;
    page.innerHTML = `
      <div class="page-head"><div><h1>Tags</h1></div></div>
      ${tags.length ? `<div class="tag-grid">
        ${tags.map(([t, n]) => `<a class="card tag-card" href="#/" data-tag="${esc(t)}"><b>${esc(t)}</b><span>${n} contact${n === 1 ? "" : "s"}</span></a>`).join("")}
      </div>` : `<div class="card empty"><p>No tags yet. Add tags when you create or edit a contact, like "alumni" or "fintech".</p></div>`}
      ${untagged && tags.length ? `<p class="muted">${untagged} contact${untagged === 1 ? " has" : "s have"} no tags.</p>` : ""}`;
    $$("[data-tag]", page).forEach((a) => a.addEventListener("click", () => {
      state.filters = { q: "", status: "all", tag: a.dataset.tag };
      $("#search").value = "";
    }));
  }

  function renderExportPage(page) {
    const n = state.contacts.length;
    page.innerHTML = `
      <div class="page-head"><div><h1>Export</h1></div></div>
      <div class="card option-card">
        <div><h2>Contacts spreadsheet</h2><p>One row per contact with every field, plus when you last reached out and when they last replied. Opens in Excel or Google Sheets.</p></div>
        <button class="btn primary" id="ex-contacts"${n ? "" : " disabled"}>${I.download(15)} Download contacts (${n})</button>
      </div>
      <div class="card option-card">
        <div><h2>Full outreach history</h2><p>One row for every outreach and reply you've logged, with the date, method and note.</p></div>
        <button class="btn" id="ex-history"${state.interactions.length ? "" : " disabled"}>${I.download(15)} Download history (${state.interactions.length})</button>
      </div>
      <p class="muted">To export only some contacts, filter the Contacts list and use its Export CSV button.</p>`;
    $("#ex-contacts").addEventListener("click", () => exportContacts(everyone()));
    $("#ex-history").addEventListener("click", () => exportHistory(everyone()));
  }

  function renderSettingsPage(page) {
    page.innerHTML = `
      ${takeFlash()}
      <div class="page-head"><div><h1>Settings</h1></div></div>
      <form class="card settings-card" id="settings-form">
        <div class="field"><label for="display-name">Your name (shown in "Welcome back")</label>
          <input id="display-name" name="display_name" required maxlength="60" value="${esc(state.displayName)}"></div>
        <div class="field"><span class="label">Signed in as</span><span>${esc(state.user.email)}</span></div>
        <div class="actions"><button class="btn primary" type="submit">Save</button></div>
      </form>
      <div class="card settings-card" id="sync-card" style="max-width:760px"><span class="muted">Loading Gmail sync…</span></div>
      <div class="card settings-card">
        <div class="field"><span class="label">Sign out of this device</span></div>
        <div class="actions"><button class="btn" id="sign-out">${I.signout()} Sign out</button></div>
      </div>`;
    const form = $("#settings-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.display_name.value.trim();
      await run(() => backend.setDisplayName(name), form);
      state.displayName = name;
      state.flash = "Saved.";
      renderPage();
    });
    $("#sign-out").addEventListener("click", async () => {
      await backend.signOut();
      location.hash = "#/";
      location.reload();
    });
    renderSyncCard();
  }

  // ---------- Gmail sync ----------

  function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    return fmtDate(isoOf(new Date(iso)));
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function renderSyncCard(setup) {
    const box = $("#sync-card");
    if (!box) return;
    const intro = `<h2 style="margin:0;font-size:16px;font-weight:600">Gmail sync</h2>
      <p class="muted" style="margin:0">Every hour, emails you send to people in your contacts are logged as "You reached out · Email", and their emails to you as "They replied · Email". Only who and when is read — never the email itself — using read-only access.</p>`;
    if (backend.demo) {
      box.innerHTML = intro + `<p class="muted" style="margin:0">Not available in demo mode.</p>`;
      return;
    }
    if (setup) {
      renderSyncSetup(box, intro, setup);
      return;
    }
    let status;
    try {
      status = await backend.getSyncStatus();
    } catch (err) {
      box.innerHTML = intro + `<p class="error" style="margin:0">Couldn't check Gmail sync: ${esc(err.message)}</p>`;
      return;
    }
    const line = !status ? `<span class="badge">Not connected</span>`
      : status.last_sync_at ? `<span class="badge yes">${I.check()} Connected</span> <span class="muted">Last checked ${esc(timeAgo(status.last_sync_at))}</span>`
      : `<span class="badge warn">Waiting for first check</span> <span class="muted">Finish the steps in Google, then refresh this page.</span>`;
    box.innerHTML = `${intro}<div>${line}</div>
      <div class="actions">
        <button class="btn${status ? "" : " primary"}" id="sync-setup">${status ? "Set up again" : "Set up Gmail sync"}</button>
        ${status ? `<button class="btn danger" id="sync-disconnect">Disconnect</button>` : ""}
      </div>`;
    $("#sync-setup").addEventListener("click", async () => {
      if (status && !confirm("This replaces your current connection code. You'll need to paste the new script into Google again. Continue?")) return;
      const token = newToken();
      await run(async () => backend.registerSyncToken(await sha256Hex(token)), box);
      renderSyncCard({ token, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    });
    const dis = $("#sync-disconnect");
    if (dis) dis.addEventListener("click", async () => {
      if (!confirm("Stop logging Gmail activity? Entries already logged stay in your contacts' history.")) return;
      await run(() => backend.disconnectSync(), box);
      renderSyncCard();
    });
  }

  function renderSyncSetup(box, intro, setup) {
    const cfg = window.APP_CONFIG;
    const zones = [...new Set([setup.timeZone, "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"])];
    const script = window.gmailSync.code({ supabaseUrl: cfg.supabaseUrl, supabaseKey: cfg.supabaseKey, token: setup.token });
    const manifest = window.gmailSync.manifest(setup.timeZone);
    const step = (n, body) => `<li style="margin-bottom:14px"><b>Step ${n}.</b> ${body}</li>`;
    box.innerHTML = `${intro}
      <ol style="margin:0;padding-left:18px;line-height:1.5">
        ${step(1, `<a href="https://script.google.com/create" target="_blank" rel="noopener">Open a new Google Apps Script project ↗</a> (signed in as the Gmail account you network from).`)}
        ${step(2, `Select everything in the editor, delete it, and paste this:
          <textarea class="input mono" readonly rows="5" id="sync-code" style="height:auto;margin-top:6px;font-size:12px">${esc(script)}</textarea>
          <button class="btn" data-copy="sync-code" style="margin-top:6px">Copy script</button>`)}
        ${step(3, `Click the gear icon (<b>Project Settings</b>) on the left and tick <b>Show "appsscript.json" manifest file in editor</b>. Go back to the editor (the <b>&lt; &gt;</b> icon), open <b>appsscript.json</b>, replace everything in it with this:
          <textarea class="input mono" readonly rows="5" id="sync-manifest" style="height:auto;margin-top:6px;font-size:12px">${esc(manifest)}</textarea>
          <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
            <button class="btn" data-copy="sync-manifest">Copy settings</button>
            <label class="muted" style="font-size:12px">Dates use timezone
              <select class="select" id="sync-tz">${options(zones, setup.timeZone)}</select></label>
          </span>`)}
        ${step(4, `Click the <b>Save</b> icon. In the dropdown next to <b>Debug</b> at the top, choose <b>setup</b>, then click <b>Run</b>.`)}
        ${step(5, `Google asks for permission: <b>Review permissions</b> → pick your account → on "Google hasn't verified this app" click <b>Advanced</b> → <b>Go to Untitled project (unsafe)</b> → <b>Allow</b>. That warning shows for every personal script; this one is only yours.`)}
        ${step(6, `The log at the bottom should say <b>All set!</b> Come back here and refresh — it will show <b>Connected</b>.`)}
      </ol>
      <p class="muted" style="margin:0;font-size:12px">The script contains a private connection code for your contacts. Don't share it. If it's ever exposed, use "Set up again" to replace it.</p>
      <div class="actions"><button class="btn" id="sync-done">Done</button></div>`;
    $$("[data-copy]", box).forEach((b) => b.addEventListener("click", async () => {
      const ta = $("#" + b.dataset.copy, box);
      try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand("copy"); }
      const label = b.textContent;
      b.textContent = "Copied ✓";
      setTimeout(() => (b.textContent = label), 1500);
    }));
    $("#sync-tz", box).addEventListener("change", (e) => {
      $("#sync-manifest", box).value = window.gmailSync.manifest(e.target.value);
    });
    $("#sync-done", box).addEventListener("click", () => renderSyncCard());
  }

  // ---------- side panel ----------

  function renderOverlay() {
    const box = $("#overlay");
    const { panel, id } = state.route;
    if (!panel) {
      box.innerHTML = "";
      document.body.style.overflow = "";
      return;
    }
    const contact = id ? state.contacts.find((c) => c.id === id) : null;
    if (id && !contact) {
      box.innerHTML = "";
      state.flash = "That contact wasn't found.";
      location.hash = "#/";
      return;
    }
    document.body.style.overflow = "hidden";
    box.innerHTML = `<div class="backdrop" data-close></div><aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title"></aside>`;
    const el = $(".panel", box);
    if (panel === "view") renderContactView(el, contact);
    else if (panel === "edit") renderContactForm(el, contact);
    else if (panel === "import") renderImport(el);
    $$("[data-close]", box).forEach((b) => b.addEventListener("click", closePanel));
    const focusable = $("[autofocus]", el) || $(".panel-head .icon-btn:last-child", el);
    if (focusable) focusable.focus();
  }

  function closePanel() {
    state.logOpen = false;
    location.hash = "#/";
  }

  const closeBtn = `<button class="icon-btn" data-close aria-label="Close">${I.close()}</button>`;
  const kv = (label, value, cls = "") =>
    `<div class="kv"><span>${label}</span>${value ? `<span class="${cls}">${value}</span>` : `<span class="none">—</span>`}</div>`;

  function emailRow(c, which, label) {
    const email = c[which + "_email"];
    if (!email) return "";
    const status = c[which + "_email_status"];
    const preferred = preferredEmail(c) === email && (c.preferred_email === which || !(c.personal_email && c.work_email));
    return `<div class="email-item">
      <div class="kv"><span>${label}</span><a href="mailto:${esc(email)}" class="${status === "bounced" ? "bounced" : ""}">${esc(email)}</a></div>
      ${preferred && c.preferred_email ? `<span class="badge sm solid">Preferred</span>` : ""}
      ${status === "verified" ? `<span class="badge sm yes">${I.check(11)} Verified</span>` : ""}
      ${status === "bounced" ? `<span class="badge sm warn">${I.alert()} Bounced</span>` : ""}
    </div>`;
  }

  function renderContactView(el, c) {
    const s = summary(c);
    const flash = takeFlash();
    const sub = [c.job_title, c.company, c.location].filter(Boolean).join(" · ");
    const li = safeUrl(c.linkedin_url);
    const emails = emailRow(c, "work", "Work") + emailRow(c, "personal", "Personal");
    let repliedBox;
    if (s.waiting) {
      const d = daysSince(s.lastOut.happened_on);
      repliedBox = `<span class="v warn">Waiting · ${d === 0 ? "today" : d + (d === 1 ? " day" : " days")}</span><span class="s">${s.lastReply ? "Last replied " + esc(fmtDate(s.lastReply.happened_on)) : "No reply yet"}</span>`;
    } else if (s.lastReply) {
      repliedBox = `<span class="v">Yes · ${esc(s.lastReply.method)}</span><span class="s">${esc(fmtDate(s.lastReply.happened_on))}</span>`;
    } else {
      repliedBox = `<span class="v">No</span><span class="s">${s.lastOut ? "" : "Not contacted yet"}</span>`;
    }

    el.innerHTML = `
      <div class="panel-head">
        <span class="avatar lg">${esc(initials(c))}</span>
        <div class="title"><h2 id="panel-title">${esc(fullName(c))}</h2>${sub ? `<span>${esc(sub)}</span>` : ""}</div>
        <a class="icon-btn" href="#/contact/${esc(c.id)}/edit" aria-label="Edit contact">${I.pencil()}</a>
        ${closeBtn}
      </div>
      <div class="panel-body">
        ${flash}
        <div class="cols-2">
          <div class="status-box"><span class="l">Contacted${s.outreach.length ? ` · ${s.outreach.length} time${s.outreach.length === 1 ? "" : "s"}` : ""}</span>
            ${s.lastOut ? `<span class="v">Yes · ${esc(s.lastOut.method)}</span><span class="s">${esc(fmtDate(s.lastOut.happened_on))}</span>` : `<span class="v">No</span><span class="s">Nothing logged yet</span>`}</div>
          <div class="status-box"><span class="l">Replied${s.replies.length ? ` · ${s.replies.length} time${s.replies.length === 1 ? "" : "s"}` : ""}</span>${repliedBox}</div>
        </div>

        <section class="section"><h3>Name</h3>
          <div class="cols-3">${kv("First", esc(c.first_name))}${kv("Middle", esc(c.middle_name))}${kv("Last", esc(c.last_name))}</div>
        </section>

        <section class="section"><h3>Email</h3>
          ${emails ? `<div class="email-list">${emails}</div>` : `<span class="muted">No email added</span>`}
        </section>

        <section class="cols-2">
          ${kv("Phone", c.phone ? `<a href="tel:${esc(c.phone)}" class="mono">${esc(c.phone)}</a>` : "")}
          ${kv("Referred by", esc(c.referred_by))}
          ${kv("Event met at", esc(c.event_met_at))}
          ${kv("Location", esc(c.location))}
        </section>

        <section class="section"><h3>LinkedIn</h3>
          <div class="seg" role="group" aria-label="LinkedIn status">
            ${LI_STATUSES.map(([v, l]) => `<button type="button" data-li="${v}" aria-pressed="${(c.linkedin_status || "none") === v}">${l}</button>`).join("")}
          </div>
          <span class="muted" style="font-size:12px">${li ? `<a href="${esc(li)}" target="_blank" rel="noopener">View LinkedIn profile ↗</a> · ` : ""}Changing this adds a dated entry to their history.</span>
        </section>

        <section class="section"><h3>Notes</h3>
          ${c.notes ? `<p class="notes-box">${esc(c.notes)}</p>` : `<span class="muted">No notes</span>`}
        </section>

        <section class="section"><h3>Tags</h3>
          ${(c.tags || []).length ? `<div class="tags-cell" style="flex-wrap:wrap">${pills(c.tags)}</div>` : `<span class="muted">No tags</span>`}
        </section>

        <section class="section" id="history"><h3>History</h3>
          ${state.logOpen ? `
          <form class="log-form" id="log-form">
            <div class="field"><label for="h-kind">What happened</label><select id="h-kind" name="kind" autofocus>${options([["outreach", "I reached out"], ["reply", "They replied"]])}</select></div>
            <div class="field"><label for="h-date">Date</label><input id="h-date" name="happened_on" type="date" required value="${todayISO()}" max="${todayISO()}"></div>
            <div class="field wide"><label for="h-method">How</label><select id="h-method" name="method">${options(METHODS)}</select></div>
            <div class="field wide"><label for="h-note">Note (optional)</label><input id="h-note" name="note" placeholder="e.g. Asked about the PM role"></div>
            <div class="btns"><button type="button" class="btn ghost" id="log-cancel">Cancel</button><button class="btn primary" type="submit">Add to history</button></div>
          </form>` : ""}
          ${s.history.length ? `<div class="timeline">${s.history.map((i) => `
            <div class="tl-item">
              <span class="tl-dot ${i.kind}"></span>
              <div class="what"><b>${i.kind === "linkedin" ? esc(LI_EVENT_TEXT[i.method] || "LinkedIn · " + i.method)
                : `${i.kind === "outreach" ? "You reached out" : "They replied"} · ${esc(i.method)}`}</b>
                <span>${esc(fmtDate(i.happened_on))}${i.note ? " · " + esc(i.note) : ""}</span></div>
              <button class="icon-btn" data-del="${esc(i.id)}" aria-label="Remove this entry" title="Remove this entry">${I.trash()}</button>
            </div>`).join("")}</div>` : state.logOpen ? "" : `<span class="muted">Nothing logged yet.</span>`}
        </section>
      </div>
      <div class="panel-foot">
        <button class="btn primary lg grow" id="log-open"${state.logOpen ? " disabled" : ""}>${I.plus()} Log outreach or reply</button>
        <a class="btn lg" href="#/contact/${esc(c.id)}/edit">Edit</a>
      </div>`;

    $("#log-open", el).addEventListener("click", () => {
      state.logOpen = true;
      renderContactView(el, c);
      $("#h-kind", el).focus();
    });
    const form = $("#log-form", el);
    if (form) {
      $("#log-cancel", el).addEventListener("click", () => { state.logOpen = false; renderContactView(el, c); });
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const entry = {
          contact_id: c.id,
          kind: form.kind.value,
          happened_on: form.happened_on.value,
          method: form.method.value,
          note: form.note.value.trim(),
        };
        const saved = await run(() => backend.addInteraction(entry), form);
        state.interactions.push(saved);
        state.logOpen = false;
        state.flash = "Added to history.";
        renderContactView(el, c);
        renderPage();
      });
    }
    $$("[data-li]", el).forEach((btn) => btn.addEventListener("click", async () => {
      const next = btn.dataset.li;
      if ((c.linkedin_status || "none") === next) return;
      const group = btn.parentElement;
      const saved = await run(() => backend.saveContact({ ...c, linkedin_status: next }), group);
      Object.assign(c, saved);
      if (LI_EVENT[next]) {
        const entry = await run(() => backend.addInteraction({
          contact_id: c.id, kind: "linkedin", method: LI_EVENT[next], happened_on: todayISO(), note: "",
        }), group);
        state.interactions.push(entry);
      }
      state.flash = `LinkedIn: ${liLabel(next)}.`;
      renderContactView(el, c);
      renderPage();
    }));
    $$("[data-del]", el).forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Remove this history entry?")) return;
      await run(() => backend.deleteInteraction(btn.dataset.del), el);
      state.interactions = state.interactions.filter((x) => x.id !== btn.dataset.del);
      renderContactView(el, c);
      renderPage();
    }));
  }

  function renderContactForm(el, existing) {
    const c = existing || { tags: [], personal_email_status: "unchecked", work_email_status: "unchecked" };
    let tags = [...(c.tags || [])];
    const text = (name, label, type = "text", extra = "") =>
      `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(c[name])}"${extra}></div>`;
    const email = (which, label) => `
      <div class="field"><label for="f-${which}_email">${label}</label>
        <div class="email-edit">
          <input id="f-${which}_email" name="${which}_email" type="email" value="${esc(c[which + "_email"])}">
          <select name="${which}_email_status" aria-label="${label} status">${options(EMAIL_STATUSES, c[which + "_email_status"] || "unchecked")}</select>
        </div></div>`;

    el.innerHTML = `
      <div class="panel-head">
        <div class="title"><h2 id="panel-title">${existing ? "Edit contact" : "New contact"}</h2>${existing ? `<span>${esc(fullName(c))}</span>` : ""}</div>
        ${existing ? `<a class="icon-btn" href="#/contact/${esc(c.id)}" aria-label="Cancel editing">${I.close()}</a>` : closeBtn}
      </div>
      <form class="panel-body" id="contact-form" autocomplete="off" novalidate>
        <section class="section"><h3>Name</h3>
          <div class="cols-3">
            ${text("first_name", "First *", "text", " required autofocus")}
            ${text("middle_name", "Middle")}
            ${text("last_name", "Last")}
          </div>
          <p class="error" id="name-err" hidden>First name is required.</p>
        </section>
        <section class="section"><h3>Work</h3>
          <div class="cols-2">
            ${text("job_title", "Job title")}${text("company", "Company")}
            ${text("location", "Location / city")}${text("linkedin_url", "LinkedIn profile", "url", ' placeholder="linkedin.com/in/…"')}
          </div>
          <div class="field"><label for="f-linkedin_status">LinkedIn status</label>
            <select id="f-linkedin_status" name="linkedin_status">${options(LI_STATUSES, c.linkedin_status || "none")}</select></div>
          <span class="muted" style="font-size:12px">Setting it here just records where things stand. To log a change with today's date, use the LinkedIn buttons on the contact's page.</span>
        </section>
        <section class="section"><h3>Email</h3>
          ${email("work", "Work email")}
          ${email("personal", "Personal email")}
          <div class="field"><span class="label">Preferred email</span>
            <div class="radio-row">
              ${[["work", "Work"], ["personal", "Personal"], ["", "No preference"]].map(([v, l]) =>
                `<label><input type="radio" name="preferred_email" value="${v}"${(c.preferred_email || "") === v ? " checked" : ""}> ${l}</label>`).join("")}
            </div>
          </div>
        </section>
        <section class="section"><h3>Details</h3>
          <div class="cols-2">
            ${text("phone", "Phone number", "tel")}${text("referred_by", "Referred by")}
          </div>
          ${text("event_met_at", "Event met at")}
          <div class="field"><label for="f-notes">Additional notes</label><textarea id="f-notes" name="notes">${esc(c.notes)}</textarea></div>
          <div class="field"><label for="tag-input">Tags</label>
            <div class="tag-editor" id="tag-editor">
              <span id="tag-list" style="display:contents"></span>
              <input id="tag-input" list="tag-options" placeholder="Type a tag, press Enter">
            </div>
            <datalist id="tag-options">${tagNames().map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
          </div>
        </section>
      </form>
      <div class="panel-foot">
        <button class="btn primary lg grow" type="submit" form="contact-form">${existing ? "Save changes" : "Save contact"}</button>
        ${existing ? `<button class="btn lg danger" type="button" id="delete-contact">${I.trash()} Delete</button>` : `<button class="btn lg" type="button" data-close>Cancel</button>`}
      </div>`;

    // Tags
    const tagList = $("#tag-list", el);
    const tagInput = $("#tag-input", el);
    const drawTags = () => {
      tagList.innerHTML = tags.map((t, i) =>
        `<span class="pill">${esc(t)}<button type="button" data-i="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join("");
    };
    const addTag = () => {
      const known = tagNames();
      tagInput.value.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => {
        const tag = known.find((x) => x.toLowerCase() === t.toLowerCase()) || t;
        if (!tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag);
      });
      tagInput.value = "";
      drawTags();
    };
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
      else if (e.key === "Backspace" && !tagInput.value && tags.length) { tags.pop(); drawTags(); }
    });
    tagInput.addEventListener("change", addTag);
    tagList.addEventListener("click", (e) => {
      const i = e.target.dataset && e.target.dataset.i;
      if (i != null) { tags.splice(Number(i), 1); drawTags(); }
    });
    $("#tag-editor", el).addEventListener("click", (e) => { if (e.target.id === "tag-editor") tagInput.focus(); });
    drawTags();

    // Save
    const form = $("#contact-form", el);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      addTag();
      if (!form.first_name.value.trim()) {
        $("#name-err", el).hidden = false;
        form.first_name.focus();
        return;
      }
      const fd = new FormData(form);
      const data = { id: existing ? existing.id : undefined, tags };
      for (const [k, v] of fd.entries()) data[k] = typeof v === "string" ? v.trim() : v;
      data.preferred_email = data.preferred_email || null;
      if (data.linkedin_url) data.linkedin_url = safeUrl(data.linkedin_url) || data.linkedin_url;
      const saved = await run(() => backend.saveContact(data), el);
      if (existing) {
        Object.assign(existing, saved);
        state.flash = "Saved.";
      } else {
        state.contacts.push(saved);
        state.flash = "Contact saved. Log your first outreach below.";
        state.logOpen = true;
      }
      location.hash = "#/contact/" + saved.id;
    });

    if (existing) {
      $("#delete-contact", el).addEventListener("click", async () => {
        if (!confirm(`Delete ${fullName(existing)} and their whole history? This can't be undone.`)) return;
        await run(() => backend.deleteContact(existing.id), el);
        state.contacts = state.contacts.filter((x) => x.id !== existing.id);
        state.interactions = state.interactions.filter((x) => x.contact_id !== existing.id);
        state.flash = `Deleted ${fullName(existing)}.`;
        location.hash = "#/";
      });
    }
  }

  function renderImport(el) {
    const plan = state.importPlan;
    el.innerHTML = `
      <div class="panel-head">
        <div class="title"><h2 id="panel-title">Import contacts</h2><span>From a spreadsheet saved as CSV</span></div>
        ${closeBtn}
      </div>
      <div class="panel-body">
        <label class="drop" id="drop">
          ${I.upload(22)}
          <span>Choose a <b>.csv</b> file, or drop it here</span>
          <span class="btn">Choose file</span>
          <input type="file" id="file" accept=".csv,text/csv" class="sr-only">
        </label>
        <div class="section"><h3>What works</h3>
          <p class="muted" style="margin:0">A file exported from this app, a LinkedIn connections export, or any spreadsheet whose first row has headings like
          First Name, Last Name, Company, Email, Phone, Tags. Contacts already in your list (same email, or same name and company) are skipped.
          Excel and Google Sheets can save as CSV under File › Save as / Download.</p>
        </div>
        <div id="plan">${plan ? planHtml(plan) : ""}</div>
      </div>
      <div class="panel-foot">
        <button class="btn primary lg grow" id="do-import"${plan && plan.items && plan.items.length ? "" : " disabled"}>
          ${plan && plan.items && plan.items.length ? `Import ${plan.items.length} contact${plan.items.length === 1 ? "" : "s"}` : "Import"}</button>
        <button class="btn lg" type="button" data-close>Cancel</button>
      </div>`;

    const load = (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.importPlan = planImport(String(reader.result));
        state.importPlan.fileName = file.name;
        renderImport(el);
        $$("[data-close]", el).forEach((b) => b.addEventListener("click", closePanel));
      };
      reader.readAsText(file);
    };
    $("#file", el).addEventListener("change", (e) => load(e.target.files[0]));
    const drop = $("#drop", el);
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); load(e.dataTransfer.files[0]); });
    $("#do-import", el).addEventListener("click", async () => {
      const result = await run(() => backend.importContacts(plan.items), el);
      state.contacts.push(...result.contacts);
      state.interactions.push(...result.interactions);
      state.flash = `Imported ${result.contacts.length} contact${result.contacts.length === 1 ? "" : "s"}.`;
      state.importPlan = null;
      location.hash = "#/";
    });
  }

  function planHtml(p) {
    if (p.error) return `<p class="error">${esc(p.fileName)}: ${esc(p.error)}</p>`;
    const skipped = [];
    if (p.dupes) skipped.push(`${p.dupes} already in your contacts`);
    if (p.noName) skipped.push(`${p.noName} without a first name`);
    return `<div class="card import-summary" style="padding:14px 16px">
      <b>${esc(p.fileName)}</b>
      <span>${p.items.length} new contact${p.items.length === 1 ? "" : "s"} ready to import${skipped.length ? ` · skipping ${skipped.join(", ")}` : ""}.</span>
      <span class="muted">Columns used:</span><ul>${p.recognized.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      ${p.ignored.length ? `<span class="muted">Ignored: ${esc(p.ignored.join(", "))}</span>` : ""}
    </div>`;
  }

  // ---------- auth screens ----------

  function renderNotConfigured() {
    root.innerHTML = `
      <div class="auth"><div class="card auth-card">
        <span class="brand"><span class="brand-mark">${I.logo()}</span>Networking</span>
        <h1>Almost ready</h1>
        <p class="muted">This app isn't connected to its database yet. To try it with sample data, open <a href="?demo#/">demo mode</a>.</p>
      </div></div>`;
  }

  function renderLogin() {
    root.innerHTML = `
      <div class="auth"><form class="card auth-card" id="login">
        <span class="brand"><span class="brand-mark">${I.logo()}</span>Networking</span>
        <h1>Sign in</h1>
        <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <p class="error" id="login-err" role="alert"></p>
        <button class="btn primary lg" type="submit">Sign in</button>
        <p class="muted" style="margin:0;font-size:12px">You'll stay signed in on this device.</p>
      </form></div>`;
    const form = $("#login");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setBusy(form, true);
      try {
        await backend.signIn(form.email.value.trim(), form.pw.value);
        await start();
      } catch (err) {
        $("#login-err").textContent = err.message;
        setBusy(form, false);
      }
    });
  }

  // ---------- routing / startup ----------

  function parseRoute() {
    const h = (location.hash || "#/").slice(1);
    let m;
    if ((m = h.match(/^\/contact\/([^/]+)\/edit$/))) return { page: "contacts", panel: "edit", id: decodeURIComponent(m[1]) };
    if ((m = h.match(/^\/contact\/([^/]+)$/))) return { page: "contacts", panel: "view", id: decodeURIComponent(m[1]) };
    if (h === "/new") return { page: "contacts", panel: "edit" };
    if (h === "/import") return { page: "contacts", panel: "import" };
    if (h === "/tags") return { page: "tags" };
    if (h === "/export") return { page: "export" };
    if (h === "/settings") return { page: "settings" };
    return { page: "contacts" };
  }

  function route() {
    const prev = state.route;
    state.route = parseRoute();
    closeRowMenu();
    if (prev.panel === "import" && state.route.panel !== "import") state.importPlan = null;
    if (state.route.panel !== "view") state.logOpen = state.route.panel === "view" && state.logOpen;
    // Re-render the page underneath only when it changed or the panel closed (data may have changed).
    if (prev.page !== state.route.page || !state.route.panel || !$("#rows")) renderPage();
    else renderRows();
    renderOverlay();
  }

  async function start() {
    const user = await backend.currentUser();
    if (!user) return renderLogin();
    state.user = user;
    state.displayName = (user.user_metadata && user.user_metadata.display_name) || nameFromEmail(user.email);
    root.innerHTML = `<p class="boot">Loading your contacts…</p>`;
    try {
      Object.assign(state, await backend.loadAll());
    } catch (err) {
      root.innerHTML = `<div class="auth"><div class="card auth-card"><p class="error">Couldn't load your contacts: ${esc(err.message)}</p>
        <button class="btn" onclick="location.reload()">Try again</button></div></div>`;
      return;
    }
    state.loaded = true;
    state.loadedAt = Date.now();
    state.route = parseRoute();
    renderShell();
    renderPage();
    renderOverlay();
  }

  window.addEventListener("hashchange", () => { if (state.loaded) route(); });
  // Pick up entries logged elsewhere (Gmail sync, another device) when returning to the tab.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !state.loaded || state.route.panel || state.route.page === "settings"
      || Date.now() - state.loadedAt < 5 * 60000) return;
    try {
      Object.assign(state, await backend.loadAll());
      state.loadedAt = Date.now();
      if (!state.route.panel && !$(".row-menu")) renderPage();
    } catch (e) { /* keep showing what we have */ }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".row-menu")) closeRowMenu(); });
  window.addEventListener("resize", closeRowMenu);
  document.addEventListener("scroll", closeRowMenu, true);
  document.addEventListener("keydown", (e) => {
    if (!state.loaded) return;
    if (e.key === "Escape") {
      if ($(".row-menu")) closeRowMenu();
      else if (state.route.panel) closePanel();
      else $(".shell") && $(".shell").classList.remove("nav-open");
    } else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !state.route.panel) {
      e.preventDefault();
      $("#search").focus();
    }
  });

  if (!backend) renderNotConfigured();
  else start();
})();
