import { Session } from '@flok-editor/session';
import { pastamirror, Frame } from './main.js';
import { clearGlobalError, setError, clearLocalError } from './error.js';
import { getSettings, getUserColorFromUserHue } from './settings.js';
import { subscribeToChat, unsubscribeFromChat } from './chat.js';
import { StrudelSession } from './strudel-panel.js';
// @ts-ignore
// import { PASTAGANG_ROOM_NAME } from 'https://www.pastagang.cc/pastagang.js';
const urlSearchParams = new URLSearchParams(window.location.search);
const roomNameFromUrl = urlSearchParams.get('room');
const PASTAGANG_ROOM_NAME = roomNameFromUrl ?? 'twirlgang';

export function getRoomName() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('song')) return params.get('song');

  const settings = getSettings();
  if (!settings.customRoomEnabled) return PASTAGANG_ROOM_NAME;
  return settings.customRoomName;
}

/** @type {Session | null} */
let _session = null;
export function getSession() {
  if (!_session) _session = makeSession();
  return _session;
}

export function refreshSession() {
  // https://github.com/pastagang/nudel/issues/102
  const keysIterator = pastamirror.currentEditors?.keys();
  for (const key of keysIterator) {
    pastamirror.deleteEditor(key);
  }
  _session = makeSession();
  return _session;
}

function makeSession() {
  if (_session) {
    _session.destroy();
  }

  const roomName = getRoomName();
  const session = new Session(roomName, {
    hostname: 'flok.cc',
    isSecure: true,
  });

  session.on('sync', () => {
    // If session is empty, create documents
    const documents = session.getDocuments();
    if (documents.length === 0) {
      session.setActiveDocuments([{ id: '1', target: 'strudel' }]);
      // session.setActiveDocuments([{ id: '2', target: 'strudel' }]);
      // session.setActiveDocuments([{ id: '3', target: 'strudel' }]);
      // session.setActiveDocuments([{ id: '4', target: 'strudel' }]);
    }

    const lowestIdDoc = documents.reduce((prev, current) => {
      return prev.id < current.id ? prev : current;
    });

    const doc = lowestIdDoc;
    window['doc'] = doc;

    // const playButton = document.getElementById('about-yes-button');
    // if (playButton) {
    //   playButton.classList.remove('loading');
    // }
  });

  session.on('change', (documents) => {
    const lowestIdDoc = documents.reduce((prev, current) => {
      return prev.id < current.id ? prev : current;
    });

    const doc = lowestIdDoc;
    window['doc'] = doc;
    if (doc.target !== 'strudel') {
      doc.target = 'strudel';
    }
    // doc.target = 'strudel';
    // documents.map((doc) => {
    if (!pastamirror.currentEditors.has(doc.id)) {
      pastamirror.createEditor(doc);
    }
    // });
    // https://github.com/pastagang/nudel/issues/102 ???
    const keysIterator = pastamirror.currentEditors?.keys();
    let deletedSomething = false;
    for (const key of keysIterator) {
      if (lowestIdDoc.id !== key) {
        pastamirror.deleteEditor(key);
      }
      deletedSomething = true;
    }
    if (deletedSomething) {
      session.setActiveDocuments([doc]);
    }

    setTimeout(() => {
      Frame.strudel?.contentWindow.postMessage({
        type: 'eval',
        msg: {
          body: StrudelSession.getScopeInjection(),
          from: 0,
          to: 0,
          docId: window['doc'].id,
          target: 'strudel',
          mode: 'web',
        },
      });
    }, 1000);
  });

  session.on('pubsub:open', () => {
    clearGlobalError();
    // session._pubSubClient seems to take a while to be defined..
    // this might or might not be a good place to make sure its ready
    // the event might call multiple times so... do i need to unsub???
    subscribeToChat();
  });
  session.on('pubsub:close', () => {
    // untested
    setError('Disconnected from Server...');
    // unsub session:pastagang:chat here?
    // lets try (?)
    unsubscribeFromChat();
  });
  // js
  session.on('eval:js', (msg) => new Function(msg.body)());
  // hydra
  session.on('eval:hydra', (msg) => {
    Frame.hydra?.contentWindow.postMessage({ type: 'eval', msg });
  });
  // shader
  session.on('eval:shader', (msg) => Frame.shader?.contentWindow.postMessage({ type: 'eval', msg }));
  // strudel
  session.on('eval:strudel', (msg) => {
    // console.log(msg);
    return Frame.strudel?.contentWindow.postMessage({ type: 'eval', msg });
  });
  // kabelsalat
  session.on('eval:kabelsalat', (msg) => Frame.kabelsalat?.contentWindow.postMessage({ type: 'eval', msg }));

  // clear local error when new eval comes in
  session.on('eval', (msg) => clearLocalError(msg.docId));

  session.initialize();

  // console.log(Frame.strudel);

  const settings = getSettings();
  session.user = getUserName();
  session.userColor = getUserColorFromUserHue(settings.userHue);

  return session;
}

export function getUserName() {
  return 'ghost';
}
