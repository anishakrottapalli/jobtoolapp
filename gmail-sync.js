// Builds the Google Apps Script that logs Gmail activity with contacts.
// The user pastes it into script.google.com; it runs hourly in their own Google account,
// reads only message headers (From/To/Cc/Bcc/date) with read-only Gmail access, and sends
// just the matches to known contacts to Supabase.

(function () {
  function code({ supabaseUrl, supabaseKey, token }) {
    return `// Networking Contacts — Gmail sync
// Checks Gmail every hour and logs emails to/from people in your Networking Contacts app.
// Only reads who an email was from/to and when. Never reads, sends, or deletes email content.
// To stop syncing: in the app, go to Settings › Gmail sync › Disconnect.

const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
const SUPABASE_KEY = ${JSON.stringify(supabaseKey)};
const SYNC_TOKEN = ${JSON.stringify(token)};
// Put this Gmail label on an email to add the people on it as contacts.
const LABEL = 'Networking';

// Run this once. It schedules the hourly check and runs the first one.
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyHours(1).create();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('since')) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    props.setProperty('since', String(start.getTime()));
  }
  sync();
  console.log('All set! Gmail will be checked every hour.');
}

function sync() {
  const props = PropertiesService.getScriptProperties();
  const since = Number(props.getProperty('since') || Date.now() - 86400000);
  const contacts = new Set(rpc_('gmail_sync_contacts', { p_token: SYNC_TOKEN }));
  const me = gmail_('profile').emailAddress.toLowerCase();
  const tz = Session.getScriptTimeZone();

  // 1. Everyone on an email you gave the LABEL (last 30 days) who isn't a contact yet becomes one.
  const labeled = listIds_('label:' + LABEL.replace(/\\s+/g, '-') + ' newer_than:30d -in:drafts').map(message_);
  const people = {};
  labeled.forEach((m) => people_(m, me).forEach((p) => {
    if (!contacts.has(p.email)) people[p.email] = p;
  }));
  const newPeople = Object.keys(people).map((k) => people[k]);
  const added = newPeople.length ? rpc_('gmail_sync_add_contacts', { p_token: SYNC_TOKEN, p_people: newPeople }) : 0;
  newPeople.forEach((p) => contacts.add(p.email));

  // 2. Log new emails (and labeled ones) to or from contacts.
  const recent = listIds_('after:' + Math.floor(since / 1000) + ' -in:spam -in:trash -in:drafts -in:chats')
    .map(message_).filter((m) => m.at > since);
  const seen = {};
  const events = [];
  let newest = since;
  recent.concat(labeled).forEach((m) => {
    if (seen[m.id]) return;
    seen[m.id] = true;
    if (m.at > since) newest = Math.max(newest, m.at);
    const date = Utilities.formatDate(new Date(m.at), tz, 'yyyy-MM-dd');
    people_(m, me).filter((p) => contacts.has(p.email))
      .forEach((p) => events.push({ id: m.id, email: p.email, dir: m.sent ? 'out' : 'in', date: date }));
  });

  const logged = events.length ? rpc_('gmail_sync_log', { p_token: SYNC_TOKEN, p_events: events }) : 0;
  props.setProperty('since', String(newest));
  console.log('Checked ' + recent.length + ' new emails. Added ' + added + ' contacts, logged ' + logged + ' entries.');
}

function listIds_(query) {
  const q = encodeURIComponent(query);
  let ids = [];
  let pageToken = '';
  do {
    const page = gmail_('messages?maxResults=500&q=' + q + (pageToken ? '&pageToken=' + pageToken : ''));
    ids = ids.concat((page.messages || []).map((m) => m.id));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return ids;
}

// Only the From/To/Cc/Bcc headers and date are fetched — never the subject or body.
function message_(id) {
  const m = gmail_('messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc');
  const headers = {};
  (m.payload.headers || []).forEach((h) => {
    const k = h.name.toLowerCase();
    headers[k] = headers[k] ? headers[k] + ',' + h.value : h.value;
  });
  return { id: id, at: Number(m.internalDate), headers: headers, labels: m.labelIds || [] };
}

// The other people on a message: recipients if you sent it, otherwise the sender.
function people_(m, me) {
  const from = parse_(m.headers.from)[0];
  m.sent = (from && from.email === me) || m.labels.indexOf('SENT') >= 0;
  const list = m.sent ? parse_([m.headers.to, m.headers.cc, m.headers.bcc].join(',')) : (from ? [from] : []);
  return list.filter((p) => p.email !== me);
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
  if (res.getResponseCode() >= 300) throw new Error('Networking Contacts error: ' + res.getContentText());
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
