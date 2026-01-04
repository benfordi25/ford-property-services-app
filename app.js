const $ = (id) => document.getElementById(id);
const state = { before: [], after: [] };

// ---------------- Photos UI ----------------
function clearThumbs(el) { el.innerHTML = ""; }

function appendThumbs(files, arr, thumbsEl) {
  [...files].forEach((f) => {
    arr.push(f);
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = URL.createObjectURL(f);
    thumbsEl.appendChild(img);
  });
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
function nl2br(s="") { return esc(s).replace(/\n/g, "<br>"); }

beforeGallery.onclick = () => beforePick.click();
beforeCamera.onclick  = () => beforeCam.click();
afterGallery.onclick  = () => afterPick.click();
afterCamera.onclick   = () => afterCam.click();

beforePick.onchange = (e) => appendThumbs(e.target.files, state.before, beforeThumbs);
beforeCam.onchange  = (e) => appendThumbs(e.target.files, state.before, beforeThumbs);
afterPick.onchange  = (e) => appendThumbs(e.target.files, state.after, afterThumbs);
afterCam.onchange   = (e) => appendThumbs(e.target.files, state.after, afterThumbs);

// ---------------- Signature Pad ----------------
const canvas = $("sig");
const ctx = canvas.getContext("2d");
let drawing = false;
let strokes = [];
let currentStroke = null;

function redrawSig() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  // white background for clean PDF
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = "#0b1220";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strokes.forEach((stroke) => {
    if (stroke.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
    ctx.stroke();
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);

  redrawSig();
}
window.addEventListener("resize", resizeCanvas);
setTimeout(resizeCanvas, 60);

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : null;
  const clientX = t ? t.clientX : e.clientX;
  const clientY = t ? t.clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  currentStroke = [];
  strokes.push(currentStroke);
  currentStroke.push(getPos(e));
  redrawSig();
}
function moveDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  currentStroke.push(getPos(e));
  redrawSig();
}
function endDraw(e) {
  if (!drawing) return;
  e.preventDefault();
  drawing = false;
}

canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mouseleave", endDraw);

canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", moveDraw, { passive: false });
canvas.addEventListener("touchend", endDraw, { passive: false });

sigClear.onclick = () => { strokes = []; redrawSig(); };
sigUndo.onclick = () => { strokes.pop(); redrawSig(); };

function signatureDataUrl() {
  const hasInk = strokes.some(s => s.length > 1);
  if (!hasInk) return "";
  return canvas.toDataURL("image/png");
}

// ---------------- Image embedding for PDF ----------------
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function filesToDataURLs(files, limit = 6) {
  const out = [];
  for (const f of files.slice(0, limit)) out.push(await fileToDataURL(f));
  return out;
}

function photoGridHTML(dataUrls) {
  if (!dataUrls.length) return `<div class="empty">No photos added</div>`;
  return dataUrls.map(src => `<div class="ph"><img src="${src}"></div>`).join("");
}

// ---------------- Report ID: UK Date + Random (changes every time) ----------------
function ukDateParts(d=new Date()){
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = d.getFullYear();
  return { dd, mm, yyyy };
}
function randomCode(len=5){
  const chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let out = "";
  const arr = new Uint32Array(len);
  if (crypto?.getRandomValues) crypto.getRandomValues(arr);
  else for (let i=0;i<len;i++) arr[i] = Math.floor(Math.random()*0xffffffff);
  for (let i=0;i<len;i++) out += chars[arr[i] % chars.length];
  return out;
}
function makeReportId(){
  const {dd, mm, yyyy} = ukDateParts(new Date());
  return `FPS-${dd}-${mm}-${yyyy}-${randomCode(5)}`;
}

// ---------------- Clear ----------------
clearBtn.onclick = () => {
  ["agent","address","ref","date","works","attachments"].forEach(id => $(id).value = "");
  beforeTick.checked = false;
  afterTick.checked = false;

  state.before.length = 0;
  state.after.length = 0;

  beforePick.value = ""; beforeCam.value = "";
  afterPick.value  = ""; afterCam.value  = "";

  clearThumbs(beforeThumbs);
  clearThumbs(afterThumbs);

  strokes = [];
  redrawSig();
};

// ---------------- Professional PDF Export (with logo + Condition Report) ----------------
pdfBtn.onclick = async () => {
  const beforeImgs = await filesToDataURLs(state.before, 6);
  const afterImgs  = await filesToDataURLs(state.after, 6);
  const sig = signatureDataUrl();

  const reportId = makeReportId();
  const finalised = new Date().toLocaleString("en-GB");

  // absolute URL so the print window can load it
  const logoUrl = new URL("logo.png", window.location.href).href;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Popup blocked. Please allow popups for this site, then try again.");
    return;
  }

  const reportHtml = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Condition Report</title>
<style>
  :root { --brand:#0b4aa2; --border:#cfd7e6; --muted:#5b667a; }
  body{font-family:Arial,Helvetica,sans-serif;margin:22px;color:#111}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}
  .brand{display:flex;align-items:center;gap:12px}
  .brand img{height:46px;width:auto;border:1px solid var(--border);border-radius:10px;padding:6px 8px;background:#fff}
  .brand .name{font-size:16px;font-weight:800;margin:0}
  .brand .sub{margin:4px 0 0;color:var(--muted);font-size:12px}
  .pill{border:1px solid var(--border);padding:8px 10px;border-radius:10px;font-size:12px;color:#111}
  .stamp{border:2px solid var(--brand); color:var(--brand); padding:6px 10px; border-radius:10px; font-weight:800; font-size:12px; text-align:center}
  .section{border:1px solid var(--border);border-radius:12px;padding:12px;margin:12px 0}
  .stitle{font-size:12px;font-weight:800;color:#111;margin:0 0 10px;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse}
  td{border:1px solid var(--border);padding:10px;vertical-align:top}
  td .lbl{font-size:11px;color:var(--muted);margin-bottom:4px}
  td .val{font-size:13px;font-weight:700;min-height:18px}
  .ticks{display:flex;gap:18px;flex-wrap:wrap}
  .tick{font-size:13px;font-weight:800}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .ph{border:1px solid var(--border);border-radius:10px;overflow:hidden;height:150px}
  .ph img{width:100%;height:100%;object-fit:cover}
  .empty{font-size:12px;color:var(--muted)}
  .sigbox{border:1px solid var(--border);border-radius:10px;padding:10px}
  .sigbox img{width:100%;height:110px;object-fit:contain}
  .foot{margin-top:10px;color:var(--muted);font-size:11px}
  @media print { .noprint{display:none} }
</style>
</head>
<body>

<div class="hdr">
  <div class="brand">
    <img src="${logoUrl}" alt="Ford Property Services logo">
    <div>
      <p class="name">FORD PROPERTY SERVICES</p>
      <p class="sub">Condition Report</p>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
    <div class="stamp">FINAL / COMPLETED</div>
    <div class="pill"><b>Report ID:</b> ${reportId}</div>
    <div class="pill"><b>Finalised:</b> ${esc(finalised)}</div>
  </div>
</div>

<div class="section">
  <p class="stitle">Job Details</p>
  <table>
    <tr>
      <td>
        <div class="lbl">Letting Agent</div>
        <div class="val">${esc(agent.value) || "&nbsp;"}</div>
      </td>
      <td>
        <div class="lbl">Job Reference</div>
        <div class="val">${esc(ref.value) || "&nbsp;"}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <div class="lbl">Property Address</div>
        <div class="val">${esc(address.value) || "&nbsp;"}</div>
      </td>
    </tr>
    <tr>
      <td>
        <div class="lbl">Date Completed</div>
        <div class="val">${esc(date.value || "") || "&nbsp;"}</div>
      </td>
      <td>
        <div class="lbl">Completed By</div>
        <div class="val">Ford Property Services</div>
      </td>
    </tr>
  </table>
</div>

<div class="section">
  <p class="stitle">Photo Evidence</p>
  <div class="ticks">
    <div class="tick">Before photos taken: ${beforeTick.checked ? "✔" : "✘"}</div>
    <div class="tick">After photos taken: ${afterTick.checked ? "✔" : "✘"}</div>
  </div>
</div>

<div class="section">
  <p class="stitle">Works / Condition Notes</p>
  <table>
    <tr><td><div class="val" style="font-weight:600">${nl2br(works.value) || "&nbsp;"}</div></td></tr>
  </table>
</div>

<div class="section">
  <p class="stitle">Before Photos (up to 6)</p>
  <div class="grid">${photoGridHTML(beforeImgs)}</div>
</div>

<div class="section">
  <p class="stitle">After Photos (up to 6)</p>
  <div class="grid">${photoGridHTML(afterImgs)}</div>
</div>

<div class="section">
  <p class="stitle">Extra Attachments</p>
  <table>
    <tr>
      <td>
        <div class="lbl">Photo / Video files attached to email</div>
        <div class="val" style="font-weight:600">${nl2br(attachments.value) || "&nbsp;"}</div>
      </td>
    </tr>
  </table>
</div>

<div class="section">
  <p class="stitle">Signature</p>
  <table>
    <tr>
      <td style="width:65%">
        <div class="lbl">Signed on device</div>
        <div class="sigbox">
          ${sig ? `<img src="${sig}" alt="Signature">` : `<div class="empty">No signature added</div>`}
        </div>
      </td>
      <td>
        <div class="lbl">Sign-off</div>
        <div class="val" style="font-weight:600">Finalised: ${esc(finalised)}</div>
        <div class="val" style="font-weight:600">Report ID: ${reportId}</div>
      </td>
    </tr>
  </table>
</div>

<div class="foot noprint">
  Android will open Print → choose <b>Save as PDF</b> → then share the saved file.
</div>

</body>
</html>`;

  w.document.open();
  w.document.write(reportHtml);
  w.document.close();

  setTimeout(() => w.print(), 900);
};
