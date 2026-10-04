// Data layer. Two interchangeable backends with the same interface:
//   - Supabase (the real app, requires sign-in)
//   - Demo (browser-only sample data, opened with ?demo in the URL)

(function () {
  const CONTACT_FIELDS = [
    "first_name", "middle_name", "last_name", "job_title", "company", "location",
    "linkedin_url", "linkedin_status", "personal_email", "personal_email_status", "work_email",
    "work_email_status", "phone", "referred_by", "event_met_at",
    "notes", "tags",
  ];
  const INTERACTION_FIELDS = ["contact_id", "kind", "method", "happened_on", "note"];
  const APPLICATION_FIELDS = [
    "position_title", "company", "location", "job_url", "status", "date_applied", "rejection_date",
    "interview_dates", "resume_track", "notes", "resume_text", "cover_letter", "application_answers",
    "questions", "resume_tailored", "resume_file_path", "resume_file_name",
  ];
  const OUTREACH_FIELDS = ["application_id", "group_id", "name", "title_company", "update_text", "sort_order"];
  const safeFileName = (name) => name.replace(/[^\w.\-]+/g, "_").slice(-120);

  function pick(obj, fields) {
    const out = {};
    for (const f of fields) if (f in obj) out[f] = obj[f];
    return out;
  }

  function supabaseBackend(cfg) {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    const check = ({ data, error }) => {
      if (error) throw new Error(error.message);
      return data;
    };
    return {
      demo: false,
      async currentUser() {
        const { data } = await sb.auth.getSession();
        return data.session ? data.session.user : null;
      },
      async signIn(email, password) {
        check(await sb.auth.signInWithPassword({ email, password }));
      },
      async signOut() {
        await sb.auth.signOut();
      },
      async setDisplayName(name) {
        check(await sb.auth.updateUser({ data: { display_name: name } }));
      },
      // Gmail sync (see supabase/migrations/003_gmail_sync.sql)
      async getSyncStatus() {
        const rows = check(await sb.from("sync_tokens").select("created_at, last_sync_at"));
        return rows[0] || null;
      },
      async registerSyncToken(tokenHash) {
        check(await sb.rpc("register_sync_token", { p_token_hash: tokenHash }));
      },
      async disconnectSync() {
        const { data } = await sb.auth.getUser();
        check(await sb.from("sync_tokens").delete().eq("user_id", data.user.id));
      },
      async loadAll() {
        // Supabase returns at most 1000 rows per request, so page through.
        const fetchAll = async (table, order) => {
          const out = [];
          for (let from = 0; ; from += 1000) {
            const page = check(await sb.from(table).select("*").order(order).order("id").range(from, from + 999));
            out.push(...page);
            if (page.length < 1000) return out;
          }
        };
        const [contacts, interactions, applications, outreach, outreachGroups] = await Promise.all([
          fetchAll("contacts", "created_at"),
          fetchAll("interactions", "happened_on"),
          // Tolerate a database that hasn't had the applications migration yet.
          fetchAll("applications", "created_at").catch(() => []),
          fetchAll("application_outreach", "created_at").catch(() => []),
          fetchAll("application_outreach_groups", "created_at").catch(() => []),
        ]);
        return { contacts, interactions, applications, outreach, outreachGroups };
      },
      async saveApplication(a) {
        const row = pick(a, APPLICATION_FIELDS);
        if (a.id) return check(await sb.from("applications").update(row).eq("id", a.id).select().single());
        return check(await sb.from("applications").insert(row).select().single());
      },
      async deleteApplication(id) {
        check(await sb.from("applications").delete().eq("id", id));
      },
      // Small personal records grouped by section (see 009_items.sql).
      async listItems(section) {
        return check(await sb.from("items").select("id, data, created_at").eq("section", section).order("created_at"));
      },
      async saveItem(section, data, id) {
        if (id) return check(await sb.from("items").update({ data }).eq("id", id).select("id, data, created_at").single());
        return check(await sb.from("items").insert({ section, data }).select("id, data, created_at").single());
      },
      async deleteItem(id) {
        check(await sb.from("items").delete().eq("id", id));
      },
      // Per-application outreach log (see 010_application_outreach.sql). updated_at is set by the database.
      async saveOutreach(o) {
        const row = pick(o, OUTREACH_FIELDS);
        if (o.id) return check(await sb.from("application_outreach").update(row).eq("id", o.id).select().single());
        return check(await sb.from("application_outreach").insert(row).select().single());
      },
      async deleteOutreach(id) {
        check(await sb.from("application_outreach").delete().eq("id", id));
      },
      async reorderOutreach(list) {
        await Promise.all(list.map((o) => sb.from("application_outreach").update({ sort_order: o.sort_order }).eq("id", o.id).then(check)));
      },
      async saveOutreachGroup(g) {
        const row = { application_id: g.application_id, name: g.name, sort_order: g.sort_order };
        if (g.id) return check(await sb.from("application_outreach_groups").update(row).eq("id", g.id).select().single());
        return check(await sb.from("application_outreach_groups").insert(row).select().single());
      },
      // Deleting a group also deletes its entries (the database cascades).
      async deleteOutreachGroup(id) {
        check(await sb.from("application_outreach_groups").delete().eq("id", id));
      },
      async reorderOutreachGroups(list) {
        await Promise.all(list.map((g) => sb.from("application_outreach_groups").update({ sort_order: g.sort_order }).eq("id", g.id).then(check)));
      },
      // Emails from the Jobs folder matched to an application (see 008_application_emails.sql).
      async listApplicationEmails(appId) {
        return check(await sb.from("application_emails").select("direction, counterpart, happened_on")
          .eq("application_id", appId).order("happened_on", { ascending: false }));
      },
      // Files live in the private "documents" bucket, under the user's own folder:
      // <user>/<application>/ for the tailored resume, <user>/<application>/<folder>/ for others (e.g. "prep").
      async uploadFile(appId, file, folder) {
        const { data } = await sb.auth.getUser();
        const dir = [data.user.id, appId, folder].filter(Boolean).join("/");
        const path = `${dir}/${Date.now()}-${safeFileName(file.name)}`;
        check(await sb.storage.from("documents").upload(path, file, { contentType: file.type || undefined }));
        return path;
      },
      // Files in an application's folder, newest first: [{ path, name, updated }]
      async listFiles(appId, folder) {
        const { data } = await sb.auth.getUser();
        const dir = `${data.user.id}/${appId}/${folder}`;
        const items = check(await sb.storage.from("documents").list(dir, { sortBy: { column: "created_at", order: "desc" } }));
        return items.filter((x) => x.id).map((x) => ({
          path: `${dir}/${x.name}`, name: x.name.replace(/^\d+-/, ""), updated: x.updated_at || x.created_at,
        }));
      },
      async fileUrl(path) {
        return check(await sb.storage.from("documents").createSignedUrl(path, 300)).signedUrl;
      },
      async removeFile(path) {
        check(await sb.storage.from("documents").remove([path]));
      },
      async importContacts(items) {
        // items: [{ contact, interactions: [...] }]
        const created = [];
        const createdInteractions = [];
        for (let i = 0; i < items.length; i += 200) {
          const chunk = items.slice(i, i + 200);
          const rows = check(await sb.from("contacts").insert(chunk.map((it) => pick(it.contact, CONTACT_FIELDS))).select());
          created.push(...rows);
          const ints = [];
          rows.forEach((row, j) => chunk[j].interactions.forEach((x) => ints.push({ ...pick(x, INTERACTION_FIELDS), contact_id: row.id })));
          if (ints.length) createdInteractions.push(...check(await sb.from("interactions").insert(ints).select()));
        }
        return { contacts: created, interactions: createdInteractions };
      },
      async saveContact(c) {
        const row = pick(c, CONTACT_FIELDS);
        if (c.id) return check(await sb.from("contacts").update(row).eq("id", c.id).select().single());
        return check(await sb.from("contacts").insert(row).select().single());
      },
      async deleteContact(id) {
        check(await sb.from("contacts").delete().eq("id", id));
      },
      async addInteraction(i) {
        return check(await sb.from("interactions").insert(pick(i, INTERACTION_FIELDS)).select().single());
      },
      async deleteInteraction(id) {
        check(await sb.from("interactions").delete().eq("id", id));
      },
    };
  }

  function demoBackend() {
    const KEY = "jobtoolapp-demo";
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    const now = () => new Date().toISOString();

    function load() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && saved.contacts) return { applications: sampleData().applications, outreach: [], outreachGroups: [], ...saved };
      } catch (e) { /* fall through to sample data */ }
      return sampleData();
    }
    let state = load();
    const demoFiles = {};
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* demo only */ }
    }

    function sampleData() {
      const a = uid(), b = uid(), c = uid(), app1 = uid(), g1 = uid(), g2 = uid();
      const blank = { middle_name: "", location: "", linkedin_url: "", linkedin_status: "none", phone: "", referred_by: "",
        event_met_at: "", notes: "", work_email: "", personal_email: "",
        personal_email_status: "unchecked", work_email_status: "unchecked", tags: [] };
      return {
        contacts: [
          { ...blank, id: a, first_name: "Priya", last_name: "Shah", job_title: "Engineering Manager",
            company: "Acme Corp", location: "Seattle, WA", work_email: "priya@acme.example",
            work_email_status: "verified", referred_by: "Jordan Lee", linkedin_status: "connected",
            event_met_at: "Women in Tech Mixer", notes: "Hiring for Q4 platform team.",
            tags: ["alumni", "hiring"], created_at: now() },
          { ...blank, id: b, first_name: "Marcus", middle_name: "T", last_name: "Nguyen",
            job_title: "Recruiter", company: "Globex", personal_email: "marcus@mail.example",
            personal_email_status: "bounced", phone: "+1 555 010 2233", tags: ["recruiter"], created_at: now() },
          { ...blank, id: c, first_name: "Elena", last_name: "Rossi", company: "Initech",
            linkedin_url: "https://www.linkedin.com/in/example", tags: ["fintech"], created_at: now() },
        ],
        interactions: [
          { id: uid(), contact_id: a, kind: "linkedin", method: "Connected", happened_on: "2026-09-08", note: "", created_at: now() },
          { id: uid(), contact_id: a, kind: "outreach", method: "LinkedIn", happened_on: "2026-09-10", note: "Intro message", created_at: now() },
          { id: uid(), contact_id: a, kind: "reply", method: "Email", happened_on: "2026-09-12", note: "Happy to chat next week", created_at: now() },
          { id: uid(), contact_id: b, kind: "outreach", method: "Email", happened_on: "2026-09-15", note: "", created_at: now() },
        ],
        applications: [
          { id: app1, position_title: "Associate Product Manager", company: "Acme Corp", location: "Seattle, WA",
            job_url: "https://jobs.example.com/apm", status: "completed", date_applied: "2026-09-02", rejection_date: null,
            interview_dates: ["2026-09-18", "2026-09-25"], resume_track: "product", notes: "Referred by Priya.", created_at: now() },
          { id: uid(), position_title: "Creative Operations Coordinator", company: "Globex", location: "Remote",
            job_url: "", status: "completed", date_applied: "2026-06-20", rejection_date: null,
            interview_dates: [], resume_track: "ea_creative_ops", notes: "", created_at: now() },
          { id: uid(), position_title: "Content Operations Specialist", company: "Initech", location: "New York, NY",
            job_url: "", status: "completed", date_applied: "2026-09-05", rejection_date: "2026-09-20",
            interview_dates: [], resume_track: "content_media_ops", notes: "", created_at: now() },
          { id: uid(), position_title: "Product Analyst", company: "Umbrella", location: "Los Angeles, CA",
            job_url: "", status: "to_start", date_applied: null, rejection_date: null,
            interview_dates: [], resume_track: null, notes: "", created_at: now() },
        ],
        outreachGroups: [
          { id: g1, application_id: app1, name: "Warm outreach", sort_order: 0, created_at: now() },
          { id: g2, application_id: app1, name: "Direct outreach to Acme Corp team", sort_order: 1, created_at: now() },
        ],
        outreach: [
          { id: uid(), application_id: app1, group_id: g1, name: "Priya Shah", title_company: "Engineering Manager, Acme Corp",
            update_text: "referral submitted and confirmed", sort_order: 0, created_at: now(), updated_at: now() },
          { id: uid(), application_id: app1, group_id: g2, name: "Dana Lee", title_company: "Hiring Manager",
            update_text: "email sent 9/3; LinkedIn connected", sort_order: 0, created_at: now(), updated_at: now() },
        ],
      };
    }

    return {
      demo: true,
      async currentUser() {
        return { email: "demo@example.com", user_metadata: { display_name: state.displayName || "Demo" } };
      },
      async signIn() {},
      async signOut() {},
      async setDisplayName(name) { state.displayName = name; persist(); },
      async getSyncStatus() { return null; },
      async registerSyncToken() { throw new Error("Gmail sync isn't available in demo mode."); },
      async disconnectSync() {},
      async loadAll() {
        return JSON.parse(JSON.stringify({ contacts: state.contacts, interactions: state.interactions, applications: state.applications, outreach: state.outreach || [], outreachGroups: state.outreachGroups || [] }));
      },
      async saveApplication(a) {
        const row = pick(a, APPLICATION_FIELDS);
        if (a.id) {
          const existing = state.applications.find((x) => x.id === a.id);
          Object.assign(existing, row, { updated_at: now() });
          persist();
          return { ...existing };
        }
        const created = { interview_dates: [], ...row, id: uid(), created_at: now(), updated_at: now() };
        state.applications.push(created);
        persist();
        return { ...created };
      },
      async deleteApplication(id) {
        state.applications = state.applications.filter((x) => x.id !== id);
        state.outreach = (state.outreach || []).filter((x) => x.application_id !== id);
        state.outreachGroups = (state.outreachGroups || []).filter((x) => x.application_id !== id);
        persist();
      },
      async saveOutreach(o) {
        const row = pick(o, OUTREACH_FIELDS);
        state.outreach = state.outreach || [];
        if (o.id) {
          const existing = state.outreach.find((x) => x.id === o.id);
          const changed = ["group_id", "name", "title_company", "update_text"].some((k) => k in row && row[k] !== existing[k]);
          Object.assign(existing, row, changed ? { updated_at: now() } : {});
          persist();
          return { ...existing };
        }
        const created = { ...row, id: uid(), created_at: now(), updated_at: now() };
        state.outreach.push(created);
        persist();
        return { ...created };
      },
      async deleteOutreach(id) {
        state.outreach = (state.outreach || []).filter((x) => x.id !== id);
        persist();
      },
      async reorderOutreach(list) {
        for (const o of list) Object.assign(state.outreach.find((x) => x.id === o.id), { sort_order: o.sort_order });
        persist();
      },
      async saveOutreachGroup(g) {
        state.outreachGroups = state.outreachGroups || [];
        if (g.id) {
          const existing = state.outreachGroups.find((x) => x.id === g.id);
          Object.assign(existing, { name: g.name, sort_order: g.sort_order });
          persist();
          return { ...existing };
        }
        const created = { id: uid(), application_id: g.application_id, name: g.name, sort_order: g.sort_order, created_at: now() };
        state.outreachGroups.push(created);
        persist();
        return { ...created };
      },
      async deleteOutreachGroup(id) {
        state.outreachGroups = (state.outreachGroups || []).filter((x) => x.id !== id);
        state.outreach = (state.outreach || []).filter((x) => x.group_id !== id);
        persist();
      },
      async reorderOutreachGroups(list) {
        for (const g of list) Object.assign(state.outreachGroups.find((x) => x.id === g.id), { sort_order: g.sort_order });
        persist();
      },
      async listApplicationEmails() { return []; },
      async listItems(section) {
        return (state.items || []).filter((x) => x.section === section).map(({ id, data, created_at }) => ({ id, data, created_at }));
      },
      async saveItem(section, data, id) {
        state.items = state.items || [];
        let row = id && state.items.find((x) => x.id === id);
        if (row) row.data = data;
        else state.items.push((row = { id: uid(), section, data, created_at: now() }));
        persist();
        return { id: row.id, data: row.data, created_at: row.created_at };
      },
      async deleteItem(id) {
        state.items = (state.items || []).filter((x) => x.id !== id);
        persist();
      },
      // Demo mode keeps files in memory for this visit only.
      async uploadFile(appId, file, folder) {
        const path = ["demo", appId, folder, `${Date.now()}-${safeFileName(file.name)}`].filter(Boolean).join("/");
        demoFiles[path] = URL.createObjectURL(file);
        return path;
      },
      async listFiles(appId, folder) {
        const dir = `demo/${appId}/${folder}/`;
        return Object.keys(demoFiles).filter((p) => p.startsWith(dir)).reverse()
          .map((path) => ({ path, name: path.slice(dir.length).replace(/^\d+-/, ""), updated: null }));
      },
      async fileUrl(path) {
        if (!demoFiles[path]) throw new Error("Files uploaded in demo mode only last until the page reloads.");
        return demoFiles[path];
      },
      async removeFile(path) { delete demoFiles[path]; },
      async importContacts(items) {
        const out = { contacts: [], interactions: [] };
        for (const it of items) {
          const c = { ...pick(it.contact, CONTACT_FIELDS), id: uid(), created_at: now(), updated_at: now() };
          state.contacts.push(c);
          out.contacts.push({ ...c });
          for (const x of it.interactions) {
            const i = { ...pick(x, INTERACTION_FIELDS), contact_id: c.id, id: uid(), created_at: now() };
            state.interactions.push(i);
            out.interactions.push({ ...i });
          }
        }
        persist();
        return out;
      },
      async saveContact(c) {
        const row = pick(c, CONTACT_FIELDS);
        if (c.id) {
          const existing = state.contacts.find((x) => x.id === c.id);
          Object.assign(existing, row, { updated_at: now() });
          persist();
          return { ...existing };
        }
        const created = { ...row, id: uid(), created_at: now(), updated_at: now() };
        state.contacts.push(created);
        persist();
        return { ...created };
      },
      async deleteContact(id) {
        state.contacts = state.contacts.filter((x) => x.id !== id);
        state.interactions = state.interactions.filter((x) => x.contact_id !== id);
        persist();
      },
      async addInteraction(i) {
        const created = { ...pick(i, INTERACTION_FIELDS), id: uid(), created_at: now() };
        state.interactions.push(created);
        persist();
        return { ...created };
      },
      async deleteInteraction(id) {
        state.interactions = state.interactions.filter((x) => x.id !== id);
        persist();
      },
    };
  }

  window.createBackend = function () {
    if (new URLSearchParams(location.search).has("demo")) return demoBackend();
    const cfg = window.APP_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase) return null;
    return supabaseBackend(cfg);
  };
})();
