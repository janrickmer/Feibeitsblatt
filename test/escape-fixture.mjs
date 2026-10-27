// escape-fixture.mjs – Gegenseite der Escape-Room-Schnittstelle (v1) für Tests: Prüfsumme, Hülle und Link-Kodierung genau wie im
// Quelltext eines Escape-Rooms. Unabhängige Kopie – die Tests vergleichen sie mit dem Block ESCAPE in index.html.
export function fbEscapeHash(str){ // cyrb53-Variante wie saveHash der Vorlage jg6, 64 Bit als 16 Hex-Zeichen
  let h1=0xdeadbeef^str.length, h2=0x41c6ce57^str.length;
  for(let i=0;i<str.length;i++){ const ch=str.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677); }
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');
}
// Daten → Hülle {kind, v, d, s} (d = JSON-Text der Daten, s = Prüfsumme über "FbEscape|v1|" + d)
export function escHull(data) {
  const d = JSON.stringify(data);
  return { kind: "feibeitsblatt-escape", v: 1, d, s: fbEscapeHash("FbEscape|v1|" + d) };
}
// Link-Kodierung des Raums: UTF-8 → Base64url ohne „=“
export function b64url(str){
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
