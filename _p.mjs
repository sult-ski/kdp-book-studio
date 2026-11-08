import fs from 'fs';
const f='src/config/kdp-specs.json'; let t=fs.readFileSync(f,'utf8');
const tail = String.raw`\s*([:.\-–—]\s*[^\n]{0,60})?$`;
const a = String.raw`\b[^\n]{0,60}$",`; if(!t.includes(a)) throw 'a';
t = t.replace(a, tail + '",');
const b = String.raw`part\s+(1|one|i))\b",`; if(!t.includes(b)) throw 'b';
t = t.replace(b, String.raw`part\s+(1|one|i))` + tail + '",' + (t.includes('\r\n')?'\r\n':'\n') + '      "_headingNote": "A heading is the whole line: \\"Chapter 1\\", or \\"Chapter 1: Title\\" / \\"Chapter 1 - Title\\". A prose line such as \\"CHAPTER 1 COVERS THE eighty years...\\" is not a heading.",');
const s = JSON.parse(t).content.structure;
const H = new RegExp(s.chapterHeading,'imu'), F = new RegExp(s.firstChapter,'imu');
for (const [l, h] of [['Chapter 1',1],['Chapter 1: The Storm',1],['CHAPTER ONE',1],['Chapter 7 — Home',1],['CHAPTER 1 COVERS THE eighty years before',0],['Chapter 7 shows that',0]]) {
  if (F.test(l) !== (h===1 && /1|one/i.test(l)) && /1|one/i.test(l)) throw 'F '+l; if (H.test(l) !== !!h) throw 'H '+l; }
fs.writeFileSync(f,t); console.log('ok', s.firstChapter);
