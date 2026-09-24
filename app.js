// Job Networking Contacts: UI.
// Routes: #/ (list), #/new, #/contact/<id>

(function () {
  const METHODS = ["Email", "LinkedIn", "Phone call", "Text", "In person", "Other"];
  const EMAIL_STATUSES = [["unchecked", "Not checked"], ["verified", "Verified"], ["bounced", "Bounced"]];

  const app = document.getElementById("app");
  const userArea = document.getElementById("user-area");
  const banner = document.getElementById("banner");

  const backend = window.createBackend();
  const state = {
    contacts: [],
    interactions: [],
    filters: { q: "", contacted: "any", replied: "any", tag: "" },
    sort: { key: "name", dir: 1 },
    flash: "",
  };

  // ---------- helpers ----------

  const esc = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  const options = (list, selected) =>
    list.map((o) => {
      const [value, label] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
    }).join("");

  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const fullName = (c) => [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");

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

  // Newest first; ties broken by when the entry was logged.
  const byNewest = (a, b) =>
    b.happened_on.localeCompare(a.happened_on) || String(b.created_at).localeCompare(String(a.created_at));

  function historyFor(contactId) {
    return state.interactions.filter((i) => i.contact_id === contactId).sort(byNewest);
  }

  // Contacted / Replied are derived from the history log.
  function summary(c) {
    const h = historyFor(c.id);
    const outreach = h.filter((i) => i.kind === "outreach");
    const replies = h.filter((i) => i.kind === "reply");
    return { history: h, outreach, replies, lastOut: outreach[0] || null, lastReply: replies[0] || null };
  }

  function allTags() {
    const set = new Set();
    state.contacts.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input, select, textarea").forEach((el) => (el.disabled = busy));
  }

  async function run(action, form) {
    if (form) setBusy(form, true);
    try {
      return await action();
    } catch (err) {
      alert("Something went wrong: " + err.message);
      throw err;
    } finally {
      if (form) setBusy(form, false);
    }
  }

  // ---------- filtering / sorting ----------

  function filteredContacts() {
    const { q, contacted, replied, tag } = state.filters;
    const needle = q.trim().toLowerCase();
    const rows = state.contacts.map((c) => ({ c, s: summary(c) })).filter(({ c, s }) => {
      if (contacted === "yes" && !s.lastOut) return false;
      if (contacted === "no" && s.lastOut) return false;
      if (replied === "yes" && !s.lastReply) return false;
      if (replied === "no" && s.lastReply) return false;
      if (replied === "waiting" && !(s.lastOut && (!s.lastReply || s.lastReply.happened_on < s.lastOut.happened_on))) return false;
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
        case "replied": return s.lastReply ? s.lastReply.happened_on : "";
        case "email": return preferredEmail(c);
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

  function exportContacts() {
    const header = [
      "First Name", "Middle Name", "Last Name", "Job Title", "Company", "Location", "LinkedIn",
      "Personal Email", "Personal Email Status", "Work Email", "Work Email Status", "Preferred Email",
      "Phone", "Contacted", "Times Contacted", "Last Contacted On", "Last Contacted Via",
      "Replied", "Times Replied", "Last Replied On", "Last Replied Via",
      "Referred By", "Event Met At", "Notes", "Tags", "Added On",
    ];
    const rows = filteredContacts().map(({ c, s }) => [
      c.first_name, c.middle_name, c.last_name, c.job_title, c.company, c.location, c.linkedin_url,
      c.personal_email, c.personal_email ? statusLabel(c.personal_email_status) : "",
      c.work_email, c.work_email ? statusLabel(c.work_email_status) : "", preferredEmail(c),
      c.phone, s.lastOut ? "Yes" : "No", s.outreach.length, s.lastOut ? s.lastOut.happened_on : "",
      s.lastOut ? s.lastOut.method : "", s.lastReply ? "Yes" : "No", s.replies.length,
      s.lastReply ? s.lastReply.happened_on : "", s.lastReply ? s.lastReply.method : "",
      c.referred_by, c.event_met_at, c.notes, (c.tags || []).join("; "),
      c.created_at ? c.created_at.slice(0, 10) : "",
    ]);
    downloadCsv(`contacts-${todayISO()}.csv`, header, rows);
  }

  function exportHistory() {
    const header = ["Contact", "Company", "Type", "Date", "Method", "Note"];
    const rows = [];
    filteredContacts().forEach(({ c, s }) => {
      [...s.history].reverse().forEach((i) => rows.push([
        fullName(c), c.company, i.kind === "outreach" ? "Outreach" : "Reply", i.happened_on, i.method, i.note,
      ]));
    });
    downloadCsv(`contact-history-${todayISO()}.csv`, header, rows);
  }

  // ---------- views ----------

  function renderNotConfigured() {
    app.innerHTML = `
      <div class="center-box">
        <h1>Almost ready</h1>
        <p>This app isn't connected to its database yet.</p>
        <p class="muted small">To try it with sample data, open <a href="?demo#/">demo mode</a>.</p>
      </div>`;
  }

  function renderLogin() {
    userArea.innerHTML = "";
    app.innerHTML = `
      <div class="center-box">
        <h1>Sign in</h1>
        <form id="login">
          <div><label for="email">Email</label><input id="email" type="email" autocomplete="username" required></div>
          <div><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>
          <p class="error" id="login-err"></p>
          <button class="primary" type="submit">Sign in</button>
        </form>
      </div>`;
    const form = document.getElementById("login");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setBusy(form, true);
      try {
        await backend.signIn(form.email.value.trim(), form.pw.value);
        await start();
      } catch (err) {
        document.getElementById("login-err").textContent = err.message;
        setBusy(form, false);
      }
    });
  }

  function renderList() {
    const f = state.filters;
    const rows = filteredContacts();
    const tags = allTags();
    const arrow = (key) => (state.sort.key === key ? (state.sort.dir > 0 ? " ▲" : " ▼") : "");
    const cols = [
      ["name", "Name"], ["job_title", "Job Title"], ["company", "Company"], ["contacted", "Contacted"],
      ["replied", "Replied"], ["email", "Email"], ["tags", "Tags"],
    ];
    const fmtTouch = (i) => (i ? `<span class="yes">Yes</span> <span class="small">${esc(fmtDate(i.happened_on))} · ${esc(i.method)}</span>` : `<span class="no">No</span>`);

    app.innerHTML = `
      <div class="toolbar">
        <div class="grow"><label for="q">Search</label><input id="q" type="search" placeholder="Name, company, notes, tags…" value="${esc(f.q)}"></div>
        <div><label for="f-contacted">Contacted</label><select id="f-contacted">${options([["any", "Any"], ["yes", "Yes"], ["no", "No"]], f.contacted)}</select></div>
        <div><label for="f-replied">Replied</label><select id="f-replied">${options([["any", "Any"], ["yes", "Yes"], ["no", "No"], ["waiting", "Waiting for reply"]], f.replied)}</select></div>
        <div><label for="f-tag">Tag</label><select id="f-tag">${options([["", "All tags"], ...tags], f.tag)}</select></div>
        <div class="actions">
          <a class="button primary" href="#/new">+ Add contact</a>
          <button id="exp-contacts" title="Download the contacts shown below as a spreadsheet">Export contacts (CSV)</button>
          <button id="exp-history" title="Download every outreach and reply for the contacts shown below">Export history (CSV)</button>
        </div>
      </div>
      <p class="muted small">${rows.length} of ${state.contacts.length} contact${state.contacts.length === 1 ? "" : "s"}</p>
      ${state.contacts.length === 0
        ? `<p>No contacts yet. <a href="#/new">Add your first contact</a>.</p>`
        : `<div class="table-wrap"><table>
            <thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}">${l}${arrow(k)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map(({ c, s }) => {
              const email = preferredEmail(c);
              const st = email === c.work_email ? c.work_email_status : c.personal_email_status;
              return `<tr data-id="${esc(c.id)}">
                <td data-label="Name">${esc(fullName(c))}</td>
                <td data-label="Job Title">${esc(c.job_title)}</td>
                <td data-label="Company">${esc(c.company)}</td>
                <td data-label="Contacted">${fmtTouch(s.lastOut)}</td>
                <td data-label="Replied">${fmtTouch(s.lastReply)}</td>
                <td data-label="Email"><span class="st-${esc(st)}">${esc(email)}</span></td>
                <td data-label="Tags">${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>`}`;

    const q = document.getElementById("q");
    q.addEventListener("input", () => {
      f.q = q.value;
      const pos = q.selectionStart;
      renderList();
      const again = document.getElementById("q");
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    for (const [id, key] of [["f-contacted", "contacted"], ["f-replied", "replied"], ["f-tag", "tag"]]) {
      document.getElementById(id).addEventListener("change", (e) => { f[key] = e.target.value; renderList(); });
    }
    app.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
      renderList();
    }));
    app.querySelectorAll("tbody tr").forEach((tr) =>
      tr.addEventListener("click", () => (location.hash = "#/contact/" + tr.dataset.id)));
    document.getElementById("exp-contacts").addEventListener("click", exportContacts);
    document.getElementById("exp-history").addEventListener("click", exportHistory);
  }

  function emailBlock(which, label, c) {
    const email = c[which + "_email"] || "";
    const status = c[which + "_email_status"] || "unchecked";
    return `
      <div>
        <label for="${which}_email">${label}</label>
        <div class="email-row">
          <input id="${which}_email" name="${which}_email" type="email" value="${esc(email)}">
          <select name="${which}_email_status" aria-label="${label} status">${options(EMAIL_STATUSES, status)}</select>
        </div>
      </div>`;
  }

  function renderContact(id) {
    const existing = id ? state.contacts.find((c) => c.id === id) : null;
    if (id && !existing) {
      app.innerHTML = `<p>That contact wasn't found. <a href="#/">Back to contacts</a></p>`;
      return;
    }
    const c = existing || { tags: [], personal_email_status: "unchecked", work_email_status: "unchecked" };
    let tags = [...(c.tags || [])];
    const text = (name, label, type = "text", extra = "") =>
      `<div${extra}><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(c[name])}"></div>`;
    const flash = state.flash;
    state.flash = "";

    app.innerHTML = `
      <p><a href="#/">← All contacts</a></p>
      <h1>${existing ? esc(fullName(c)) : "New contact"}</h1>
      ${flash ? `<p class="flash">${esc(flash)}</p>` : ""}
      ${existing ? historySection(c) : ""}
      <form id="contact-form" autocomplete="off">
        <fieldset><legend>Person</legend><div class="grid">
          <div><label for="first_name">First name *</label><input id="first_name" name="first_name" required value="${esc(c.first_name)}"></div>
          ${text("middle_name", "Middle name")}
          ${text("last_name", "Last name")}
          ${text("job_title", "Job title")}
          ${text("company", "Company")}
          ${text("location", "Location / city")}
          ${text("linkedin_url", "LinkedIn profile", "url", ' class="wide"')}
        </div></fieldset>

        <fieldset><legend>Contact info</legend><div class="grid">
          ${emailBlock("personal", "Personal email", c)}
          ${emailBlock("work", "Work email", c)}
          ${text("phone", "Phone number", "tel")}
        </div>
        <div class="radio-row">
          <span class="muted small">Preferred email:</span>
          ${[["personal", "Personal"], ["work", "Work"], ["", "No preference"]].map(([v, l]) =>
            `<label><input type="radio" name="preferred_email" value="${v}"${(c.preferred_email || "") === v ? " checked" : ""}> ${l}</label>`).join("")}
        </div></fieldset>

        <fieldset><legend>Context</legend><div class="grid">
          ${text("referred_by", "Referred by")}
          ${text("event_met_at", "Event met at")}
          <div class="wide"><label for="notes">Additional notes</label><textarea id="notes" name="notes">${esc(c.notes)}</textarea></div>
          <div class="wide">
            <label for="tag-input">Tags</label>
            <div id="tag-list"></div>
            <input id="tag-input" list="tag-options" placeholder="Type a tag and press Enter">
            <datalist id="tag-options">${allTags().map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
          </div>
        </div></fieldset>

        <div class="form-actions">
          <button class="primary" type="submit">${existing ? "Save changes" : "Save contact"}</button>
          <a href="#/">Cancel</a>
          <span class="spacer"></span>
          ${existing ? `<button type="button" class="danger" id="delete-contact">Delete contact</button>` : ""}
        </div>
      </form>`;

    // Tags
    const tagList = document.getElementById("tag-list");
    const tagInput = document.getElementById("tag-input");
    const drawTags = () => {
      tagList.innerHTML = tags.map((t, i) =>
        `<span class="tag">${esc(t)}<button type="button" data-i="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join("");
    };
    const addTag = () => {
      tagInput.value.split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => {
        const known = allTags().find((x) => x.toLowerCase() === t.toLowerCase());
        const tag = known || t;
        if (!tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag);
      });
      tagInput.value = "";
      drawTags();
    };
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
    });
    tagInput.addEventListener("change", addTag);
    tagList.addEventListener("click", (e) => {
      const i = e.target.dataset && e.target.dataset.i;
      if (i != null) { tags.splice(Number(i), 1); drawTags(); }
    });
    drawTags();

    // Save
    const form = document.getElementById("contact-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      addTag();
      const fd = new FormData(form);
      const data = { id: existing ? existing.id : undefined, tags };
      for (const [k, v] of fd.entries()) data[k] = typeof v === "string" ? v.trim() : v;
      data.preferred_email = data.preferred_email || null;
      if (data.linkedin_url) data.linkedin_url = safeUrl(data.linkedin_url) || data.linkedin_url;
      const saved = await run(() => backend.saveContact(data), form);
      if (existing) {
        Object.assign(existing, saved);
        state.flash = "Saved.";
        renderContact(existing.id);
        window.scrollTo(0, 0);
      } else {
        state.contacts.push(saved);
        state.flash = "Contact saved. Log your outreach and replies below.";
        location.hash = "#/contact/" + saved.id;
      }
    });

    if (existing) {
      document.getElementById("delete-contact").addEventListener("click", async () => {
        if (!confirm(`Delete ${fullName(existing)} and their whole history? This can't be undone.`)) return;
        await run(() => backend.deleteContact(existing.id), form);
        state.contacts = state.contacts.filter((x) => x.id !== existing.id);
        state.interactions = state.interactions.filter((x) => x.contact_id !== existing.id);
        location.hash = "#/";
      });
      wireHistory(existing);
    }
  }

  function historySection(c) {
    const s = summary(c);
    const line = (i, none) => (i ? `<span class="yes">Yes</span> — ${esc(fmtDate(i.happened_on))} via ${esc(i.method)}` : `<span class="no">${none}</span>`);
    const li = safeUrl(c.linkedin_url);
    return `
      <div class="status-summary">
        <div><div class="muted small">Contacted (${s.outreach.length})</div>${line(s.lastOut, "Not yet")}</div>
        <div><div class="muted small">Replied (${s.replies.length})</div>${line(s.lastReply, "No reply yet")}</div>
        ${preferredEmail(c) ? `<div><div class="muted small">Preferred email</div><a href="mailto:${esc(preferredEmail(c))}">${esc(preferredEmail(c))}</a></div>` : ""}
        ${li ? `<div><div class="muted small">LinkedIn</div><a href="${esc(li)}" target="_blank" rel="noopener">Open profile ↗</a></div>` : ""}
      </div>
      <fieldset><legend>Outreach &amp; reply history</legend>
        <form id="history-form" class="add-history">
          <div><label for="h-kind">What happened</label><select id="h-kind" name="kind">${options([["outreach", "I reached out"], ["reply", "They replied"]])}</select></div>
          <div><label for="h-date">Date</label><input id="h-date" name="happened_on" type="date" required value="${todayISO()}"></div>
          <div><label for="h-method">How</label><select id="h-method" name="method">${options(METHODS)}</select></div>
          <div class="note"><label for="h-note">Note (optional)</label><input id="h-note" name="note" placeholder="e.g. Asked about the PM role"></div>
          <button class="primary" type="submit">Add</button>
        </form>
        ${s.history.length
          ? `<ul class="history">${s.history.map((i) => `
              <li>
                <span class="kind ${i.kind}">${i.kind === "outreach" ? "Reached out" : "Replied"}</span>
                <span class="what"><strong>${esc(fmtDate(i.happened_on))}</strong> · ${esc(i.method)}${i.note ? ` — ${esc(i.note)}` : ""}</span>
                <button class="link" data-del="${esc(i.id)}" title="Remove this entry" aria-label="Remove this entry">×</button>
              </li>`).join("")}</ul>`
          : `<p class="muted small">Nothing logged yet.</p>`}
      </fieldset>`;
  }

  function wireHistory(c) {
    const form = document.getElementById("history-form");
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
      renderContact(c.id);
    });
    app.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
      if (!confirm("Remove this history entry?")) return;
      await run(() => backend.deleteInteraction(btn.dataset.del));
      state.interactions = state.interactions.filter((x) => x.id !== btn.dataset.del);
      renderContact(c.id);
    }));
  }

  // ---------- routing / startup ----------

  function route() {
    const hash = location.hash || "#/";
    const m = hash.match(/^#\/contact\/(.+)$/);
    if (hash === "#/new") renderContact(null);
    else if (m) renderContact(decodeURIComponent(m[1]));
    else renderList();
  }

  async function start() {
    const user = await backend.currentUser();
    if (!user) return renderLogin();
    if (backend.demo) {
      banner.innerHTML = `Demo mode: sample data, saved only in this browser. <a href="${location.pathname}">Leave demo</a>`;
    } else {
      userArea.innerHTML = `<span class="muted small">${esc(user.email)}</span> <button class="link" id="sign-out">Sign out</button>`;
      document.getElementById("sign-out").addEventListener("click", async () => {
        await backend.signOut();
        state.loaded = false;
        state.contacts = [];
        state.interactions = [];
        renderLogin();
      });
    }
    try {
      Object.assign(state, await backend.loadAll());
    } catch (err) {
      app.innerHTML = `<p class="error">Couldn't load your contacts: ${esc(err.message)}</p><p><button onclick="location.reload()">Try again</button></p>`;
      return;
    }
    state.loaded = true;
    route();
  }

  window.addEventListener("hashchange", () => { if (state.loaded) route(); });
  if (!backend) renderNotConfigured();
  else start();
})();
