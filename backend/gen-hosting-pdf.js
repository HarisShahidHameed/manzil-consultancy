const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, '..', 'Manzil-Hosting-Cost-Comparison.pdf');
const doc = new PDFDocument({ size: 'A4', margin: 40 });
doc.pipe(fs.createWriteStream(outPath));

const pageWidth = doc.page.width - 80;

function title(text) {
  doc.fontSize(18).fillColor('#1a1a2e').font('Helvetica-Bold').text(text, { align: 'left' });
  doc.moveDown(0.3);
}
function subtitle(text) {
  doc.fontSize(10).fillColor('#555555').font('Helvetica').text(text);
  doc.moveDown(0.8);
}
function sectionHeader(text) {
  doc.moveDown(0.6);
  doc.fontSize(13).fillColor('#1a1a2e').font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
}
function para(text) {
  doc.fontSize(9.5).fillColor('#333333').font('Helvetica').text(text, { align: 'left', lineGap: 2 });
  doc.moveDown(0.4);
}

// ---- Header ----
title('Manzil — Server Hosting Cost Comparison');
subtitle(`Prepared for client review  |  Region: Europe  |  Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`);

para('Sizing basis: up to 15 concurrent users, 5,000–10,000 database records per year (Node.js/Express API + PostgreSQL + React frontend). This is a light workload — the smallest production-grade tier from each provider is sufficient with comfortable headroom for growth.');

// ---- Table: Compute/VPS comparison ----
sectionHeader('Compute (Server) Comparison');

const headers = ['Provider', 'Plan', 'vCPU', 'RAM', 'SSD', 'Est. Cost/mo'];
const colWidths = [95, 120, 40, 50, 55, 90];
const rows = [
  ['Hetzner', 'CX22', '2', '4 GB', '40 GB', '~$5'],
  ['DigitalOcean', 'Basic Droplet', '1', '2 GB', '50 GB', '~$12'],
  ['Contabo', 'VPS S', '4', '8 GB', '150 GB', '~$7'],
  ['AWS EC2', 't4g.small (ARM) + 20GB EBS', '2', '2 GB', '20 GB', '~$14'],
];

function drawTableRow(y, cells, opts = {}) {
  const { bold = false, bg = null, height = 22 } = opts;
  let x = 40;
  if (bg) {
    doc.rect(40, y, pageWidth, height).fill(bg);
  }
  doc.fillColor(bold ? '#ffffff' : '#222222').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
  cells.forEach((cell, i) => {
    doc.text(cell, x + 6, y + 6, { width: colWidths[i] - 10, align: 'left' });
    x += colWidths[i];
  });
  return y + height;
}

let y = doc.y + 4;
y = drawTableRow(y, headers, { bold: true, bg: '#1a1a2e' });

rows.forEach((row, idx) => {
  const bg = idx % 2 === 0 ? '#f4f4f8' : '#ffffff';
  y = drawTableRow(y, row, { bg });
});

// table border
doc.rect(40, doc.y + 4 - (rows.length + 1) * 22, pageWidth, (rows.length + 1) * 22).stroke('#cccccc');

doc.y = y + 10;

para('Notes: Hetzner offers the best price-to-performance ratio for this workload. AWS EC2 pricing above excludes data transfer and snapshot backup costs (adds roughly $2–3/mo). All plans include enough headroom to handle 5–10x the current expected load without resizing.');

// ---- Storage section ----
sectionHeader('File / Document Storage — Amazon S3');
para('For storing uploaded documents, PDFs, and case files, Amazon S3 is recommended as the sole storage solution regardless of which provider hosts the application server. S3 is used purely for object storage (files), decoupled from the compute layer, and offers industry-standard durability, security, and lifecycle management.');

const s3Headers = ['Component', 'Estimated Usage', 'Est. Cost/mo'];
const s3ColWidths = [160, 195, 95];
const s3Rows = [
  ['Storage (S3 Standard)', '~5 GB documents', '~$0.12'],
  ['PUT/COPY/POST requests', '~2,000 requests/mo', '~$0.01'],
  ['GET requests', '~5,000 requests/mo', '~$0.002'],
  ['Data transfer out', '~1 GB/mo', '~$0.09'],
];

function drawS3Row(y, cells, opts = {}) {
  const { bold = false, bg = null, height = 22 } = opts;
  let x = 40;
  if (bg) doc.rect(40, y, pageWidth, height).fill(bg);
  doc.fillColor(bold ? '#ffffff' : '#222222').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
  cells.forEach((cell, i) => {
    doc.text(cell, x + 6, y + 6, { width: s3ColWidths[i] - 10, align: 'left' });
    x += s3ColWidths[i];
  });
  return y + height;
}

let ys = doc.y + 4;
ys = drawS3Row(ys, s3Headers, { bold: true, bg: '#1a1a2e' });
s3Rows.forEach((row, idx) => {
  const bg = idx % 2 === 0 ? '#f4f4f8' : '#ffffff';
  ys = drawS3Row(ys, row, { bg });
});
doc.rect(40, ys - (s3Rows.length + 1) * 22, pageWidth, (s3Rows.length + 1) * 22).stroke('#cccccc');
doc.y = ys + 10;

para('Total estimated S3 cost at this scale: well under $1/mo. Cost scales automatically with actual usage — no wasted capacity, no manual resizing.');

// ---- Total recommendation ----
sectionHeader('Recommended Package & Total Monthly Cost');

const recRows = [
  ['Server (Hetzner CX22)', '~$5.00'],
  ['Object Storage (AWS S3)', '~$0.25'],
  ['Domain + SSL (Let\'s Encrypt)', 'Free (domain billed separately/yearly)'],
  ['Automated backups (off-site)', '~$1.00'],
];
const recColWidths = [260, 190];
let yr = doc.y + 4;
recRows.forEach((row, idx) => {
  const bg = idx % 2 === 0 ? '#f4f4f8' : '#ffffff';
  doc.rect(40, yr, pageWidth, 22).fill(bg);
  doc.fillColor('#222222').font('Helvetica').fontSize(9.5);
  doc.text(row[0], 46, yr + 6, { width: recColWidths[0] - 10 });
  doc.text(row[1], 46 + recColWidths[0], yr + 6, { width: recColWidths[1] - 10 });
  yr += 22;
});
doc.rect(40, yr - recRows.length * 22, pageWidth, recRows.length * 22).stroke('#cccccc');
doc.y = yr + 6;

doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a2e').text('Total estimated: ~$6–7/month', { align: 'left' });

// ---- Security measures ----
sectionHeader('Included Security Measures');
const secItems = [
  'SSH key-only authentication (no password login)',
  'UFW firewall — only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open',
  'Nginx reverse proxy with free Let\'s Encrypt SSL/TLS certificate',
  'Database bound to localhost only — never publicly exposed',
  'fail2ban — automatic blocking of brute-force login attempts',
  'Automatic OS security updates (unattended-upgrades)',
  'Nightly encrypted database backups stored off-server',
  'Non-root deployment user with least-privilege access',
];
doc.fontSize(9.5).font('Helvetica').fillColor('#333333');
secItems.forEach((item) => {
  doc.text(`•  ${item}`, { indent: 10, lineGap: 3 });
});

doc.end();
console.log('PDF written to', outPath);
