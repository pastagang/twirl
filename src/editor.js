import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching } from '@codemirror/language';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { keymap, lineNumbers } from '@codemirror/view';
import { evalKeymap, flashField, remoteEvalFlash } from '@flok-editor/cm-eval';
import { vim } from '@replit/codemirror-vim';
import { highlightExtension, highlightMiniLocations, updateMiniLocations } from '@strudel/codemirror';
import { EditorView, minimalSetup } from 'codemirror';
import { yCollab } from 'y-codemirror.next';
import './style.css';
import theme from './strudel-theme.js';
import { getSettings } from './settings.js';
import { insertNewline } from '@codemirror/commands';
import { nudelAlert } from './alert.js';
import { strudelAutocomplete } from './strudel-autocomplete.js';
import { getDrawContext, getTheme, setTheme } from '@strudel/draw';
import { drawTimeScope, analysers } from '@strudel/webaudio';
import { Pattern } from '@strudel/core';

// we need to access these variables from the strudel iframe:
window.highlightMiniLocations = highlightMiniLocations; // we cannot import this for some reason
window.updateMiniLocations = updateMiniLocations; // we cannot import this for some reason

const SLIDES = [
  '',
  'My name is Lu\n',
  'I am not dead\n',
  'I am not dead yet\n',
  'But one day I will be\n',
  'I am going to die\n',
  'For now I am alive\n',
  'Which means\n',
  'I can be here\n',
  'Live\n',
  'Speaking to you now\n',
  'Live\n',
  'Right now\n',
  'Which means\n',
  'Anything can happen\n',
  'Except...\n',
  "That's not really\ntrue, is it?",
  'I mean sure\n',
  "I'm standing here\n",
  'Live\n',
  'Right now\n',
  "But I'm giving you\n",
  'A highly rehearsed\n',
  'Pre-scripted talk\n',
  "This doesn't feel live\nto me",
  'This may as well be\n a recording',
  'That you watch\n',
  'Two weeks from now\n',
];

// Gets around an issue with chat positioning
let backspaceWasPressed = false;
addEventListener('keyup', (e) => {
  if (e.key === 'Backspace') {
    backspaceWasPressed = false;
  }
});

let slideId = parseInt(localStorage.getItem('twirl_slide_number') ?? '0');
if (isNaN(slideId)) {
  slideId = 0;
  localStorage.setItem('twirl_slide_number', '0');
}
// console.log('id', slideId);
function setSlide(id) {
  slideId = id;
  if (slideId >= SLIDES.length) {
    slideId = SLIDES.length - 1;
  } else if (slideId < 0) {
    slideId = 0;
  }
  localStorage.setItem('twirl_slide_number', id);
  const editor = window['view'];
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: SLIDES[slideId].toUpperCase() } });
  // requestAnimationFrame(() => {
  // editor.dispatch({ changes: { from: SLIDES[slideId], to: editor.state.doc.length, insert: 'ok' } });
  // });
}

let presentationMode = localStorage.getItem('twirl_presentation_mode') === 'true';

addEventListener(
  'keydown',
  (e) => {
    // toggle presentation mode
    if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
      presentationMode = !presentationMode;
      localStorage.setItem('twirl_presentation_mode', presentationMode.toString());
      e.preventDefault();
      return;
    }

    if ((presentationMode && e.key === 'ArrowRight') || (e.key === '.' && (e.ctrlKey || e.metaKey))) {
      setSlide(slideId + 1);
      e.preventDefault();
      return;
    }

    if ((presentationMode && e.key === 'ArrowLeft') || (e.key === ',' && (e.ctrlKey || e.metaKey))) {
      setSlide(slideId - 1);
      e.preventDefault();
    }
  },
  { passive: false },
);

// let fontSize = 50;

// function tickFontSize() {
//   const elem = window['elem'];
//   const view = window['view'];
//   if (!elem || !view) {
//     setTimeout(tickFontSize, 1000);
//     return;
//   }

//   const { width, height } = view.contentDOM.getBoundingClientRect();
//   let scale = window.innerWidth / width;
//   if (scale > 1.03) {
//     scale *= 1.5;
//   } else if (scale < 0.9) {
//     scale /= 1.5;
//   } else {
//     scale = 1;
//   }
//   fontSize = scale * fontSize;
//   elem.style.fontSize = `${fontSize}px`;
//   console.log('tickFontSize', fontSize);

//   setTimeout(tickFontSize, 1000);
// }
// tickFontSize();

let fontSize = parseFloat(localStorage.getItem('twirl_font_size') ?? '50');
if (isNaN(fontSize)) {
  fontSize = 50;
  localStorage.setItem('twirl_font_size', fontSize.toFixed(2));
}
setTimeout(() => {
  const elem = window['elem'];
  elem.style.fontSize = fontSize + 'px';
  // elem.style.transform = `scale(${window.innerWidth / elem.clientWidth})`;
}, 1000);
addEventListener(
  'keydown',
  (e) => {
    const elem = window['elem'];
    if (e.key === '=' && (e.ctrlKey || e.metaKey)) {
      fontSize *= 1.25;
      localStorage.setItem('twirl_font_size', fontSize.toFixed(2));
      elem.style.fontSize = fontSize + 'px';
      e.preventDefault();
    } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
      fontSize /= 1.25;
      localStorage.setItem('twirl_font_size', fontSize.toFixed(2));
      elem.style.fontSize = fontSize + 'px';
      e.preventDefault();
    }
  },
  { passive: false },
);

// const oldTheme = getTheme();
// setTheme({
//   ...oldTheme,
//   foreground: 'red',
// });
export class PastaMirror {
  supportedTargets = ['strudel', 'hydra', 'shader', 'kabelsalat', 'js'];
  editorViews = new Map();
  currentEditors = new Map();
  extensions = {
    lineWrapping: (on) => (on ? EditorView.lineWrapping : EditorView.lineWrapping),
    lineNumbers: (on) => (on ? lineNumbers() : []),
    closeBrackets: (on) => (on ? closeBrackets() : []),
    strudelAutocomplete: (on) =>
      on ? autocompletion({ override: [strudelAutocomplete] }) : autocompletion({ override: [] }),
  };
  strudelOnlyExtensions = ['strudelAutocomplete'];
  compartments = {};

  constructor() {
    this.compartments = Object.fromEntries(Object.keys(this.extensions).map((key) => [key, new Compartment()]));
    window['editor'] = this;
  }

  createEditor(doc) {
    const initialSettings = Object.keys(this.compartments).map((key) => {
      const isStrudelOnly = this.strudelOnlyExtensions.includes(key);
      const enabled = getSettings()[key] && (!isStrudelOnly || doc.target === 'strudel');
      const extension = this.extensions[key](enabled);
      return this.compartments[key].of(extension);
    });
    if (!['1', '2', '3', '4', '5', '6', '7', '8'].includes(doc.id)) {
      console.warn(`ignoring doc with id "${doc.id}"`);
      return;
    }

    const state = EditorState.create({
      doc: doc.content,
      extensions: [
        minimalSetup,
        theme,
        this.flokBasicSetup(doc),
        javascript(),
        getSettings().vimMode ? vim() : [],
        // on input event
        // EditorView.updateListener.of((update) => {
        //   const changes = update.changes;
        //   if (changes.empty) return;
        //   const view = window['view'];
        //   if (!view) return;

        //   // Get width and height of the editor
        //   const { width, height } = view.contentDOM.getBoundingClientRect();
        //   console.log('editor size', width, height);

        //   const elem = window['elem'];
        //   const scale = window.innerWidth / width;
        //   // elem.style.transform = `scale(${scale})`;
        //   elem.style.fontSize = `${scale * 50}px`;
        // }),
        // bracket matching
        bracketMatching({ brackets: '()[]{}<>' }),
        ...initialSettings,

        Prec.highest(
          keymap.of([
            // Disable Undo/Redo
            //~~~~~~~~~~~~~~~~~~~~~~~
            // Try keeping undo disabled in your algorave!
            // Set yourself free. The results may surprise you.
            //
            // https://www.youtube.com/watch?v=mKE-aMVR0E4
            //~~~~~~~~~~~~~~~~~~~~~~~
            { key: 'Mod-z', preventDefault: true, run: () => true }, // Disable Undo (Ctrl+Z / Cmd+Z)
            { key: 'Mod-Shift-z', preventDefault: true, run: () => true }, // Disable Redo (Ctrl+Shift+Z / Cmd+Shift+Z)
            { key: 'Mod-y', preventDefault: true, run: () => true }, // Disable Redo (Ctrl+Y)
            // stop pane
            ...['Ctrl-.', 'Alt-.'].map((key) => ({
              key,
              run: () => {
                if (doc.target === 'strudel') {
                  doc.evaluate('$: silence', { from: null, to: null });
                } else if (doc.target === 'kabelsalat') {
                  doc.evaluate('n(0).out()', { from: null, to: null });
                  if (window.strudel) {
                    window.strudel.setDocPattern(doc.id, window.strudelWindow.silence);
                  }
                } else if (doc.target === 'hydra') {
                  console.log('todo: implement hydra stop command');
                }
                return true;
              },
            })),
            ...[
              // no idea if these are right lol
              // just guessing
              'Backspace',
              'Shift-Backspace',
              'Ctrl-Backspace',
              'Mod-Backspace',
              'Meta-Backspace',
              'Cmd-Backspace',
            ].map((key) => ({
              key,
              run: () => {
                let from = view.state.selection.main.from;
                let to = view.state.selection.main.to;

                // if there is no selection, send the character before the caret to the chat
                if (view.state.selection.main.empty) {
                  from -= 1;
                  const char = view.state.sliceDoc(from, to).trim();
                  if (char === '') return false;
                  if (backspaceWasPressed) {
                    from -= 1;
                  }
                  backspaceWasPressed = true;
                  // sendChatMessage({
                  //   docId: doc.id,
                  //   message: char,
                  //   from,
                  //   user: doc.session.user,
                  //   color: doc.session.userColor.color,
                  // });

                  return false;
                }

                const message = view.state.sliceDoc(from, to).trim();
                // sendChatMessage({
                //   docId: doc.id,
                //   message,
                //   from,
                //   user: doc.session.user,
                //   color: doc.session.userColor.color,
                // });

                return false;
              },
            })),
            // Disable Backspace
            // chat current line..
            ...['Shift-Enter', 'Ctrl-x', 'Mod-x'].map((key) => ({
              key,
              run: (view) => {
                let from = view.state.selection.main.from;
                let to = view.state.selection.main.to;

                // if there is no selection, delete the current line
                // if there is a selection, delete the selection
                if (view.state.selection.main.empty) {
                  const { head } = view.state.selection.main;
                  const line = view.state.doc.lineAt(head);
                  from = line.from;
                  to = line.to + 1;
                }

                // Ensure the removal works when the cursor is on the last line
                // see: #80
                to = Math.min(to, view.state.doc.length);
                const message = view.state.sliceDoc(from, to).trim();

                // sendChatMessage({
                //   docId: doc.id,
                //   message,
                //   from,
                //   user: doc.session.user,
                //   color: doc.session.userColor.color,
                // });

                if (key === 'Shift-Enter') {
                  const transaction = view.state.update({
                    changes: { from, to, insert: '' },
                  });
                  view.dispatch(transaction);
                  return true;
                }

                return false;
              },
            })),
            // overrides Enter to disable auto indenting..
            // feel free to remove this again if it annoys you
            // this is GREAT
            {
              key: 'Enter',
              run: (view) => {
                insertNewline(view);
                return true;
              },
            },
            {
              // any key except Ctrl-? or Shift-? or etc
              any: (_view, key) => {
                if (!getSettings().pastingMode) return false;
                if (key.ctrlKey || key.altKey || key.metaKey) {
                  return false;
                }

                const allowlist = [
                  'Enter',
                  'Backspace',
                  'Delete',
                  'ArrowUp',
                  'ArrowDown',
                  'ArrowLeft',
                  'ArrowRight',
                  'Shift-ArrowRight',
                  'Shift-ArrowLeft',
                  'Shift-ArrowUp',
                  'Shift-ArrowDown',
                  'Shift',
                  'Escape',
                ];

                if (allowlist.includes(key.key)) {
                  return false;
                }

                if (getSettings().vimMode) {
                  nudelAlert(
                    "<h2>typing is disabled</h2><p>but you're mad enough to use vim mode anyway so i'll let this one slide...</p>",
                  );
                  return false;
                }

                nudelAlert(
                  '<h2>typing is disabled</h2><p>to enable typing, turn off <strong>PASTING MODE</strong> in the settings.</p>',
                );
                return true;
              },
            },
          ]),
        ),
      ],
    });

    const slotsEl = document.querySelector('.slots');
    if (!slotsEl) throw new Error('slots element not found');

    slotsEl.addEventListener('pointerdown', (e) => {
      //this.editorViews.get(doc.id)?.focus();
    });

    const side = parseInt(doc.id) % 2 == 0 ? 'right' : 'left';

    slotsEl.insertAdjacentHTML(
      'beforeend',
      `<div class="slot ${side}" id="slot-${doc.id}">
    <div class="editor"></div>
  </div>`,
    );

    // const tabsEl = document.querySelector(`.tabs .${side}`);
    // if (!tabsEl) throw new Error('tabs element not found');
    // tabsEl.insertAdjacentHTML(
    //   'beforeend',
    //   `<button class="tab ${side}" id="tab-${doc.id}">
    //         ${doc.id} ${doc.target}
    //   </button>`,
    // );

    document.querySelector(`#tab-${doc.id}`)?.addEventListener('click', () => {
      // tabsEl.querySelectorAll('.tab').forEach((tab) => {
      //   tab.classList.remove('active');
      // });
      document.querySelector(`#tab-${doc.id}`)?.classList.add('active');
      this.editorViews.get(doc.id)?.focus();

      slotsEl.querySelectorAll(`.slot.${side}`).forEach((slot) => {
        slot.classList.remove('active');
      });
      slotsEl.querySelector(`#slot-${doc.id}`)?.classList.add('active');
    });

    const editorEl = document.querySelector(`#slot-${doc.id} .editor`);
    if (!editorEl) throw new Error('editor element not found');
    const view = new EditorView({
      state,
      parent: editorEl,
    });
    this.editorViews.set(doc.id, view);

    window['elem'] = editorEl;
    window['view'] = view;

    // jsdoc to say its a select element
    // const targetEl = document.querySelector(`#slot-${doc.id} .target`);
    // if (!targetEl) throw new Error('target element not found');
    // if (!this.supportedTargets.includes(doc.target)) {
    //   targetEl.insertAdjacentHTML('beforeend', `<option value="${doc.target}">? ${doc.target} ?</option>`);
    //   console.warn(`unsupported target "${doc.target}" in doc "${doc.id}". evaluations will be ignored`);
    // }
    // targetEl.value = doc.target;

    // targetEl.addEventListener('change', (e) => {
    //   doc.target = e.target?.['value'];
    // });
    // doc.session.on(`change-target:${doc.id}`, () => {
    //   targetEl.value = doc.target;
    // });

    // const runButton = document.querySelector(`#slot-${doc.id} .run`);
    // if (!runButton) throw new Error('run button not found');
    // runButton.addEventListener('click', () => {
    //   doc.evaluate(doc.content, { from: 0, to: doc.content.length });
    // });

    this.currentEditors.set(doc.id, { state, doc, view });
  }

  flokBasicSetup(doc) {
    doc.collabCompartment = new Compartment(); // yeah this is dirty
    const text = doc.getText();
    const web = true;

    // TODO: automatically set scrollIntoView, based on mode
    // set to true in boxed mode, but only when boxed mode is actually visible
    // we don't want cursor tracking on mobile!
    const scrollIntoView = getSettings().trackRemoteCursors2;
    const collab = yCollab(text, doc.session.awareness);
    return [
      flashField(),
      highlightExtension,
      remoteEvalFlash(doc),
      Prec.high(evalKeymap(doc, { web, defaultMode: 'document' })),
      //collab,
      doc.collabCompartment.of(collab),
    ];
  }

  deleteEditor(id) {
    this.editorViews.delete(id);
    this.currentEditors.delete(id);
    document.querySelector(`#slot-${id}`)?.remove();
  }

  reconfigureExtension(key, value, view) {
    view.dispatch({
      effects: this.compartments[key]?.reconfigure(this.extensions[key](value)),
    });
  }

  //--
  // CURRENTLY UNCALLED FUNCTIONS
  // enableRemoteCursorTracking(session) {
  //   const docs = session.getDocuments();
  //   console.log('enable', docs);

  //   docs.forEach((doc) => {
  //     const collab = yCollab(text, doc.session.awareness, {
  //       // undoManager,
  //       showLocalCaret: true,
  //       scrollIntoView: true,
  //     });
  //     // const ext = doc.collabCompartment.of(collab);

  //     view.dispatch({
  //       effects: doc.collabCompartment.reconfigure(collab),
  //     });
  //   });

  //   // walk over
  //   /* view.dispatch({
  //     effects: this.reconfigure(this.extensions[key](value)),
  //   }); */
  // }
  // disableRemoteCursorTracking(session) {
  //   console.log('disable', session); /* view.dispatch({
  //     effects: this.reconfigure(this.extensions[key](value)),
  //   }); */
  // }

  updateExtensions({ previous, next }) {
    const appliedSettings = previous;
    const settings = next;
    const keys = Object.keys(this.extensions);
    for (let index in keys) {
      const key = keys[index];
      if (!key) continue;
      for (let [_, view] of this.editorViews) {
        if (settings[key] !== appliedSettings[key]) {
          // console.log('reconfigure', key, settings[key]);
          this.reconfigureExtension(key, settings[key], view);
        }
      }
    }
  }
}
