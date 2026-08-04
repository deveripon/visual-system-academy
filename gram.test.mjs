import { Prism } from 'prism-react-renderer';
import fs from 'fs';

const SHELL = {
  comment: { pattern: /(^[ \t]*)#.*/m, lookbehind: true, greedy: true },
  string: [
    { pattern: /"(?:[^"\\\n]|\\.)*"/, greedy: true },
    { pattern: /'(?:[^'\\\n]|\\.)*'/, greedy: true },
  ],
  function: {
    pattern: /(^[ \t]*\$[ \t]+|[|;&][ \t]*)(?:(?:sudo|doas|watch|time|xargs)[ \t]+)*[a-z][\w./-]*/m,
    lookbehind: true,
  },
  prompt: { pattern: /^[ \t]*\$(?=[ \t])/m, alias: 'punctuation' },
  property: { pattern: /(^|[ \t])--?[A-Za-z][\w-]*/, lookbehind: true },
  variable: /\$(?:\{[^}]*\}|\w+)/,
};
Prism.languages.bash = SHELL;

globalThis.window = {};
for (const f of fs.readdirSync('content/src')) { try { eval(fs.readFileSync('content/src/'+f,'utf8')); } catch(e){} }
const steps = [].concat(window.STEPS_A||[], window.STEPS_B||[], window.STEPS_C||[]);
const bash = []; for (const s of steps) for (const c of s.code||[]) if (c.lang==='bash') bash.push(c.code);

const C = { comment:'\x1b[90m', string:'\x1b[32m', prompt:'\x1b[36m', function:'\x1b[33m', property:'\x1b[34m', variable:'\x1b[31m' };
function show(code){
  let out='';
  for (const t of Prism.tokenize(code, SHELL)) {
    if (typeof t === 'string') out += t;
    else out += (C[t.type]||'\x1b[37m') + (typeof t.content==='string'?t.content:JSON.stringify(t.content)) + '\x1b[0m';
  }
  return out;
}
for (const i of [0,3,21,22,40,60,10,55]) { console.log('──────'); console.log(show(bash[i])); }
let n=0, bad=[];
for (const s of steps) for (const c of s.code||[]) {
  const g = Prism.languages[c.lang];
  if (!g) { bad.push(c.lang); continue; }
  try { Prism.tokenize(c.code, g); n++; } catch(e){ console.log('THROW', c.lang, s.id, e.message); }
}
console.log('tokenized ok:', n, 'missing grammars:', [...new Set(bad)]);
