// Data layer. Two interchangeable backends with the same interface:
//   - Supabase (the real app, requires sign-in)
//   - Demo (browser-only sample data, opened with ?demo in the URL)

(function () {
  const CONTACT_FIELDS = [
    "first_name", "middle_name", "last_name", "job_title", "company", "location",
    "linkedin_url", "personal_email", "personal_email_status", "work_email",
    "work_email_status", "preferred_email", "phone", "referred_by", "event_met_at",
    "notes", "tags",
  ];
  const INTERACTION_FIELDS = ["contact_id", "kind", "method", "happened_on", "note"];

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
        const [contacts, interactions] = await Promise.all([
          fetchAll("contacts", "created_at"),
          fetchAll("interactions", "happened_on"),
        ]);
        return { contacts, interactions };
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
        if (saved && saved.contacts) return saved;
      } catch (e) { /* fall through to sample data */ }
      return sampleData();
    }
    let state = load();
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* demo only */ }
    }

    function sampleData() {
      const a = uid(), b = uid(), c = uid();
      const blank = { middle_name: "", location: "", linkedin_url: "", phone: "", referred_by: "",
        event_met_at: "", notes: "", work_email: "", personal_email: "",
        personal_email_status: "unchecked", work_email_status: "unchecked", preferred_email: null, tags: [] };
      return {
        contacts: [
          { ...blank, id: a, first_name: "Priya", last_name: "Shah", job_title: "Engineering Manager",
            company: "Acme Corp", location: "Seattle, WA", work_email: "priya@acme.example",
            work_email_status: "verified", preferred_email: "work", referred_by: "Jordan Lee",
            event_met_at: "Women in Tech Mixer", notes: "Hiring for Q4 platform team.",
            tags: ["alumni", "hiring"], created_at: now() },
          { ...blank, id: b, first_name: "Marcus", middle_name: "T", last_name: "Nguyen",
            job_title: "Recruiter", company: "Globex", personal_email: "marcus@mail.example",
            personal_email_status: "bounced", phone: "+1 555 010 2233", tags: ["recruiter"], created_at: now() },
          { ...blank, id: c, first_name: "Elena", last_name: "Rossi", company: "Initech",
            linkedin_url: "https://www.linkedin.com/in/example", tags: ["fintech"], created_at: now() },
        ],
        interactions: [
          { id: uid(), contact_id: a, kind: "outreach", method: "LinkedIn", happened_on: "2026-09-10", note: "Intro message", created_at: now() },
          { id: uid(), contact_id: a, kind: "reply", method: "Email", happened_on: "2026-09-12", note: "Happy to chat next week", created_at: now() },
          { id: uid(), contact_id: b, kind: "outreach", method: "Email", happened_on: "2026-09-15", note: "", created_at: now() },
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
      async loadAll() { return JSON.parse(JSON.stringify({ contacts: state.contacts, interactions: state.interactions })); },
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
