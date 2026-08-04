import { Prism } from 'prism-react-renderer';
import fs from 'fs';

const SHELL = {
  comment: { pattern: /(^[ \t]*)#.*/m, lookbehind: true, greedy: true },
  string: [
    { pattern: /"(?:[^"\\\n]|\\.)*"/, greedy: true },
    { pattern: /'(?:[^'\\\n]|\\.)*'/, greedy: true },
  ],
  prompt: { pattern: /^[ \t]*\$(?=[ \t])/m, alias: 'punctuation' },
  function: { pattern: /(^[ \t]*|[|;&]{1,2}[ \t]*|\bsudo[ \t]+|\bwatch[ \t]+)[a-z][\w.-]*/m, lookbehind: true },
  keyword: /\b(?:sudo|watch)\b/,
  property: { pattern: /(^|[ \t])--?[A-Za-z][\w-]*/, lookbehind: true },
  variable: /\$(?:\{[^}]*\}|\w+)/,
};
Prism.languages.bash = SHELL;
Prism.languages.shell = SHELL;

globalThis.window = {};
for (const f of fs.readdirSync('content/src')) { try { eval(fs.readFileSync('content/src/'+f,'utf8')); } catch(e){} }
const steps = [].concat(window.STEPS_A||[], window.STEPS_B||[], window.STEPS_C||[]);
const bash = []; for (const s of steps) for (const c of s.code||[]) if (c.lang==='bash') bash.push(c.code);

const C = { comment:'\x1b[90m', string:'\x1b[32m', prompt:'\x1b[36m', function:'\x1b[33m', keyword:'\x1b[35m', property:'\x1b[34m', variable:'\x1b[31m' };
function show(code){
  const toks = Prism.tokenize(code, SHELL);
  let out='';
  for (const t of toks) {
    if (typeof t === 'string') out += t;
    else out += (C[t.type]||'\x1b[37m') + (typeof t.content==='string'?t.content:JSON.stringify(t.content)) + '\x1b[0m';
  }
  return out;
}
for (const b of [bash[0], bash[3], bash[21], bash[22], bash[40], bash[60]]) {
  console.log('────────────────');
  console.log(show(b));
}
// crash check: every block, every lang
let n=0;
for (const s of steps) for (const c of s.code||[]) {
  const g = Prism.languages[c.lang];
  if (!g) { console.log('NO GRAMMAR', c.lang); continue; }
  try { Prism.tokenize(c.code, g); n++; } catch(e){ console.log('THROW', c.lang, s.id, e.message); }
}
console.log('tokenized ok:', n);
