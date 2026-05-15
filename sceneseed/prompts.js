// SceneSeed — bundled prompt templates for show creation
//
// A starter set of common improv prompts. Hosts pick one in the show form's
// "Prompt template" select to fill the promptText field, then can edit if
// they want. Templates are static (no Firestore round-trip) — adding new
// ones is just a code change here.

export const PROMPT_TEMPLATES = [
  // Core categories
  { label: 'Location',                     text: 'Give us a location.' },
  { label: 'Relationship',                 text: 'Give us a relationship.' },
  { label: 'Object',                       text: 'Give us an object.' },
  { label: 'Occupation',                   text: 'Give us an occupation.' },
  { label: 'Emotion',                      text: 'Give us an emotion.' },
  { label: 'Genre',                        text: 'Give us a genre.' },
  { label: 'One-word suggestion',          text: 'Give us a one-word suggestion.' },
  { label: 'Personal confession (stage-safe)', text: 'Give us a personal confession — but please keep it stage-safe.' },
  // Extras
  { label: 'Word you heard today',         text: 'Give us a word you heard today.' },
  { label: 'Minor inconvenience',          text: 'Give us a minor inconvenience.' },
  { label: "Job that shouldn't exist",     text: "Give us a job that shouldn't exist." },
  { label: 'Hobby',                        text: 'Give us a hobby.' },
  { label: 'Fear',                         text: 'Give us a fear.' },
  { label: 'Guilty pleasure',              text: 'Give us a guilty pleasure.' },
  { label: 'Advice you ignored',           text: 'Give us a piece of advice you ignored.' },
  { label: 'Dream you remember',           text: 'Give us a dream you remember.' },
  { label: 'Song lyric',                   text: 'Give us a song lyric.' },
  { label: 'Something you saw today',      text: 'Give us something you saw on the way here.' },
  { label: 'Embarrassing moment',          text: 'Give us an embarrassing moment from your week.' },
  { label: 'Thing you Googled this week',  text: "Give us something you Googled this week (G-rated, please)." },
  // Final-line / call-back categories useful for round 4 of a multi-round show
  { label: 'Final line of dialogue',       text: 'Give us a final line of dialogue.' },
  { label: 'Title for the show',           text: 'Give us a title for the show.' }
];

// Helper: populate a <select> element with the templates as <option>s.
// The first option stays as a placeholder ("Pick a template…").
export function populatePromptTemplateSelect(selectEl) {
  // Clear out any previous options except the placeholder if present.
  while (selectEl.options.length > 1) selectEl.remove(1);
  for (const t of PROMPT_TEMPLATES) {
    const opt = document.createElement('option');
    opt.value = t.text;
    opt.textContent = t.label;
    selectEl.appendChild(opt);
  }
}
