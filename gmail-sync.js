// Builds the Google Apps Script that logs Gmail activity with contacts and applications.
// The user pastes it into script.google.com; it runs hourly in their own Google account.
// It only ever asks Gmail for mail in the Networking and Jobs folders, reads only message
// headers (From/To/Cc/Bcc/date) with read-only Gmail access, and sends just the matches to
// Supabase.

(function () {
  function code({ supabaseUrl, supabaseKey, token }) {
    return `// Job Central — Gmail sync
// Checks two Gmail folders every hour: Networking (people become contacts, emails are logged
// in their history) and Jobs (emails are shown under the matching application).
// Only reads who an email was from/to and when. Never reads, sends, or deletes email content,
// and never looks at mail outside those two folders.
// To stop syncing: in the app, go to Settings › Gmail sync › Disconnect.

const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
const SUPABASE_KEY = ${JSON.stringify(supabaseKey)};
const SYNC_TOKEN = ${JSON.stringify(token)};
// The Gmail folders (labels) to read. Nothing else is searched.
const NETWORKING_FOLDER = 'Networking';
const JOBS_FOLDER = 'Jobs';

// Run this once. It schedules the hourly check and runs the first one.
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  sync();
  console.log('All set! Your Networking and Jobs folders will be checked every hour.');
}

function sync() {
  const contacts = new Set(rpc_('gmail_sync_contacts', { p_token: SYNC_TOKEN }));
  const me = gmail_('profile').emailAddress.toLowerCase();
  const tz = Session.getScriptTimeZone();
  const day = (m) => Utilities.formatDate(new Date(m.at), tz, 'yyyy-MM-dd');

  // Networking folder: everyone who isn't a contact yet becomes one, then emails to or from contacts are logged.
  const networking = folderMessages_(NETWORKING_FOLDER);
  const people = {};
  networking.forEach((m) => people_(m, me).forEach((p) => {
    if (!contacts.has(p.email)) people[p.email] = p;
  }));
  const newPeople = Object.keys(people).map((k) => people[k]);
  const added = newPeople.length ? rpc_('gmail_sync_add_contacts', { p_token: SYNC_TOKEN, p_people: newPeople }) : 0;
  newPeople.forEach((p) => contacts.add(p.email));

  const events = [];
  networking.forEach((m) => {
    people_(m, me).filter((p) => contacts.has(p.email))
      .forEach((p) => events.push({ id: m.id, email: p.email, dir: m.sent ? 'out' : 'in', date: day(m) }));
  });
  const logged = events.length ? rpc_('gmail_sync_log', { p_token: SYNC_TOKEN, p_events: events }) : 0;

  // Jobs folder: match each email to an application by company, and log it there.
  const apps = rpc_('gmail_sync_applications', { p_token: SYNC_TOKEN }).map((a) => ({ id: a.id, key: companyKey_(a.company) }))
    .filter((a) => a.key.length >= 3);
  const jobs = folderMessages_(JOBS_FOLDER);
  const jobEvents = [];
  jobs.forEach((m) => {
    people_(m, me).forEach((p) => {
      const app = matchApp_(p, apps);
      if (app) jobEvents.push({ id: m.id, application_id: app.id, email: p.email, dir: m.sent ? 'out' : 'in', date: day(m) });
    });
  });
  const jobLogged = jobEvents.length ? rpc_('gmail_sync_log_application_emails', { p_token: SYNC_TOKEN, p_events: jobEvents }) : 0;

  console.log('Networking: ' + networking.length + ' emails, added ' + added + ' contacts, logged ' + logged + ' entries. ' +
    'Jobs: ' + jobs.length + ' emails, ' + jobLogged + ' newly matched to applications.');
}

// Every message (last 30 days) in a folder, including your own replies in those conversations.
function folderMessages_(folder) {
  const q = encodeURIComponent('label:' + folder.replace(/\\s+/g, '-') + ' newer_than:30d -in:drafts');
  let ids = [];
  let pageToken = '';
  do {
    const page = gmail_('threads?maxResults=500&q=' + q + (pageToken ? '&pageToken=' + pageToken : ''));
    ids = ids.concat((page.threads || []).map((t) => t.id));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  const out = [];
  ids.forEach((id) => {
    const t = gmail_('threads/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc');
    (t.messages || []).forEach((m) => {
      const labels = m.labelIds || [];
      if (['DRAFT', 'TRASH', 'SPAM'].some((l) => labels.indexOf(l) >= 0)) return;
      out.push(message_(m));
    });
  });
  return out;
}

// Only the From/To/Cc/Bcc headers and date are used — never the subject or body.
function message_(m) {
  const headers = {};
  (m.payload.headers || []).forEach((h) => {
    const k = h.name.toLowerCase();
    headers[k] = headers[k] ? headers[k] + ',' + h.value : h.value;
  });
  return { id: m.id, at: Number(m.internalDate), headers: headers, labels: m.labelIds || [] };
}

// The other people on a message: recipients if you sent it, otherwise the sender.
function people_(m, me) {
  const from = parse_(m.headers.from)[0];
  m.sent = (from && from.email === me) || m.labels.indexOf('SENT') >= 0;
  const list = m.sent ? parse_([m.headers.to, m.headers.cc, m.headers.bcc].join(',')) : (from ? [from] : []);
  return list.filter((p) => p.email !== me);
}

// "Acme, Inc." -> "acme"; used to compare company names with email domains and sender names.
function companyKey_(s) {
  const skip = { inc: 1, llc: 1, ltd: 1, corp: 1, corporation: 1, co: 1, company: 1, group: 1, the: 1, plc: 1 };
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((w) => w && !skip[w]).join('');
}

// Email providers and job boards whose domain says nothing about the employer.
const GENERIC_DOMAINS = ['gmail', 'googlemail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'aol', 'proton', 'protonmail',
  'greenhouse', 'lever', 'workday', 'myworkdayjobs', 'icims', 'ashbyhq', 'smartrecruiters', 'jobvite', 'linkedin',
  'indeed', 'glassdoor', 'ziprecruiter', 'wellfound', 'handshake', 'bamboohr', 'taleo', 'successfactors'];

// The application whose company matches this person's email domain (acme.com) or display name ("Acme Recruiting").
function matchApp_(person, apps) {
  const parts = person.email.split('@')[1].split('.');
  const second = parts.length >= 3 && ['co', 'com', 'org', 'ac'].indexOf(parts[parts.length - 2]) >= 0 ? 3 : 2;
  const root = parts[Math.max(0, parts.length - second)];
  const useDomain = GENERIC_DOMAINS.indexOf(root) < 0;
  const name = companyKey_(person.name);
  let best = null;
  apps.forEach((a) => {
    const byDomain = useDomain && (root === a.key || (root.length >= 4 && a.key.indexOf(root) === 0));
    const byName = name.indexOf(a.key) >= 0;
    if ((byDomain || byName) && (!best || a.key.length > best.key.length)) best = a;
  });
  return best;
}

// "Jane Doe" <jane@x.com>, bob@y.com  ->  [{name: 'Jane Doe', email: 'jane@x.com'}, {name: '', email: 'bob@y.com'}]
function parse_(s) {
  const out = [];
  const re = /(?:"?([^"<>,@]*?)"?\\s*<)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,})>?/gi;
  let match;
  while ((match = re.exec(String(s || '')))) out.push({ name: (match[1] || '').trim(), email: match[2].toLowerCase() });
  return out;
}

function gmail_(path) {
  const res = UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Gmail error: ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function rpc_(name, body) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Job Central error: ' + res.getContentText());
  return JSON.parse(res.getContentText() || 'null');
}
`;
  }

  function manifest(timeZone) {
    return JSON.stringify({
      timeZone,
      runtimeVersion: "V8",
      exceptionLogging: "STACKDRIVER",
      oauthScopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/script.external_request",
        "https://www.googleapis.com/auth/script.scriptapp",
      ],
    }, null, 2);
  }

  window.gmailSync = { code, manifest };
})();
