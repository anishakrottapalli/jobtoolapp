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
  const q = encodeURIComponent('after:' + Math.floor(since / 1000) + ' -in:spam -in:trash -in:drafts -in:chats');

  let ids = [];
  let pageToken = '';
  do {
    const page = gmail_('messages?maxResults=500&q=' + q + (pageToken ? '&pageToken=' + pageToken : ''));
    ids = ids.concat((page.messages || []).map((m) => m.id));
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  const events = [];
  let newest = since;
  ids.forEach((id) => {
    const m = gmail_('messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc');
    const at = Number(m.internalDate);
    if (at <= since) return;
    newest = Math.max(newest, at);
    const headers = {};
    (m.payload.headers || []).forEach((h) => {
      const k = h.name.toLowerCase();
      headers[k] = headers[k] ? headers[k] + ',' + h.value : h.value;
    });
    const date = Utilities.formatDate(new Date(at), tz, 'yyyy-MM-dd');
    const from = addresses_(headers.from)[0];
    if (from === me || (m.labelIds || []).indexOf('SENT') >= 0) {
      addresses_([headers.to, headers.cc, headers.bcc].join(','))
        .filter((a) => contacts.has(a))
        .forEach((a) => events.push({ id: id, email: a, dir: 'out', date: date }));
    } else if (contacts.has(from)) {
      events.push({ id: id, email: from, dir: 'in', date: date });
    }
  });

  const logged = events.length ? rpc_('gmail_sync_log', { p_token: SYNC_TOKEN, p_events: events }) : 0;
  props.setProperty('since', String(newest));
  console.log('Checked ' + ids.length + ' emails, logged ' + logged + ' new entries.');
}

function addresses_(s) {
  return (String(s || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi) || []).map((a) => a.toLowerCase());
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
