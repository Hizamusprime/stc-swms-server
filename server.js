const express = require('express');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
 
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());
 
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
 
// ─── Hazard Library ───────────────────────────────────────────────────────────
const SWMS_HAZARDS = [
  { id: "h01", task: "Deploying traffic control signs & devices", hazard: "Manual handling - lifting heavy signs", risk: "Musculoskeletal injury", control_measures: "Use correct lifting technique; team-lift items >15kg; inspect signs for sharp edges before handling", responsible: "All Workers" },
  { id: "h02", task: "Stopping & releasing traffic with lollipop", hazard: "Moving vehicles failing to stop", risk: "Struck-by injury / fatality", control_measures: "Maintain safe escape route at all times; wear Class D hi-vis PPE; never step into live lane", responsible: "Traffic Controller" },
  { id: "h03", task: "Working adjacent to live traffic", hazard: "High-speed vehicle entering work zone", risk: "Serious injury / fatality", control_measures: "Install TMA where required; maintain correct taper distances per TMP; wear Class D PPE", responsible: "Site Supervisor" },
  { id: "h04", task: "Setting up taper with cones", hazard: "Worker struck by passing vehicle", risk: "Struck-by injury", control_measures: "Work from vehicle where possible; never turn back to traffic; deploy cones in direction of travel", responsible: "Traffic Controller" },
  { id: "h05", task: "Communicating via radio", hazard: "Radio failure / miscommunication", risk: "Head-on collision", control_measures: "Test radios before shift; use backup hand signals; establish clear communication protocol", responsible: "All Workers" },
  { id: "h06", task: "Working night shifts", hazard: "Reduced visibility", risk: "Vehicle strike", control_measures: "Use illuminated signs; additional reflective PPE; ensure adequate lighting in work zone", responsible: "Site Supervisor" },
  { id: "h07", task: "Extended shift - fatigue management", hazard: "Fatigue impairing reaction time", risk: "Critical error / incident", control_measures: "Maximum shift hours per policy; rotate controllers every 2hrs; report fatigue to supervisor", responsible: "All Workers" },
  { id: "h08", task: "Working in extreme heat", hazard: "Heat stress / dehydration", risk: "Heat exhaustion", control_measures: "Access to shade and water at all times; monitor for heat illness symptoms; buddy system", responsible: "Site Supervisor" },
  { id: "h09", task: "Managing pedestrian access", hazard: "Pedestrian entering live traffic", risk: "Serious injury / fatality", control_measures: "Install pedestrian barriers and safe walkways; maintain clear signage; monitor at all times", responsible: "Traffic Controller" },
  { id: "h10", task: "Working near plant & machinery", hazard: "Being struck by reversing plant", risk: "Crush injury / fatality", control_measures: "Establish exclusion zones; use spotter for reversing; maintain visual contact with operators", responsible: "Site Supervisor" },
  { id: "h11", task: "Emergency vehicle approach", hazard: "Unable to clear path in time", risk: "Delayed emergency response", control_measures: "Know emergency procedure before shift; clear path immediately; inform supervisor", responsible: "All Workers" },
  { id: "h12", task: "Managing distracted or aggressive drivers", hazard: "Driver abuse or non-compliance", risk: "Vehicle collision / assault", control_measures: "Step back to safe position; do not engage aggressively; report all incidents to supervisor", responsible: "Traffic Controller" },
  { id: "h13", task: "Wet weather operations", hazard: "Vehicles skidding; slippery surfaces", risk: "Vehicle collision; slip injury", control_measures: "Increase buffer distances; check footwear grip; consider stopping works if unsafe", responsible: "Site Supervisor" },
  { id: "h14", task: "Incorrect signage placement", hazard: "Drivers not adequately warned", risk: "Vehicle collision", control_measures: "Pre-start sign check against TMP; verify all signs face correct direction before opening traffic", responsible: "Site Supervisor" },
  { id: "h15", task: "End-of-shift pack-up", hazard: "Retrieving signs from live lane", risk: "Struck-by injury", control_measures: "Remove devices in correct order per TMP; always face oncoming traffic; use vehicle as shield", responsible: "Traffic Controller" }
];
 
// ─── Fixed PPE & HRCW values for traffic control ─────────────────────────────
const STANDARD_PPE = [
  "Class D (Level 3) Hi-Visibility vest or jacket – mandatory at all times on site",
  "Safety helmet / hard hat where overhead risk exists",
  "Steel-capped safety boots (AS/NZS 2210.3)",
  "UV-protective safety glasses / sunglasses during daylight hours",
  "Gloves when handling signs, devices or cones"
];
 
const STANDARD_HRCW = [
  "Roadway work – work on or adjacent to a public road (WHS Regulation 2017 – Schedule 1)",
  "Traffic management – controlling the movement of vehicles at or near the workplace",
  "Exposure to moving traffic – sustained proximity to live lanes throughout the shift",
  "Night or low-light work – where natural light is insufficient for safe operations",
  "Extreme weather exposure – working outdoors in high heat, rain or wind conditions"
];
 
// ─── HTML Template builder ────────────────────────────────────────────────────
function buildSWMSHtml(job, selectedHazards, signatures = []) {
  const fmt = (v) => v || '—';
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-AU') : '—';
  const fmtTime = (t) => t ? t.slice(0, 5) : '—';
 
  const hazardRows = selectedHazards.map((h, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${h.task}</td>
      <td>${h.hazard}</td>
      <td><span class="risk-badge risk-high">${h.risk}</span></td>
      <td>${h.control_measures}</td>
      <td>${h.responsible}</td>
    </tr>
  `).join('');
 
  const ppeRows = STANDARD_PPE.map(p => `<li>${p}</li>`).join('');
  const hrcwRows = STANDARD_HRCW.map(h => `<li>${h}</li>`).join('');
 
  const sigRows = signatures.length > 0
    ? signatures.map(s => `
        <tr>
          <td>${fmt(s.staff_name)}</td>
          <td>${s.signature_url ? `<img src="${s.signature_url}" style="height:40px;" alt="sig"/>` : ''}</td>
          <td>${fmtDate(s.signed_at)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#999;">No signatures yet</td></tr>';
 
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: white; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #f59e0b; padding-bottom: 12px; margin-bottom: 16px; }
  .company-name { font-size: 20px; font-weight: 900; color: #f59e0b; letter-spacing: 1px; }
  .doc-title { font-size: 14px; font-weight: bold; color: #1a1a1a; text-align: right; }
  .doc-meta { font-size: 10px; color: #666; text-align: right; }
  .section { margin-bottom: 18px; }
  .section-title { background: #1a1a1a; color: #f59e0b; font-weight: bold; font-size: 11px; padding: 6px 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ddd; }
  .info-cell { padding: 6px 10px; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd; }
  .info-cell:nth-child(even) { border-right: none; }
  .info-label { font-size: 9px; color: #888; text-transform: uppercase; font-weight: bold; }
  .info-value { font-size: 11px; color: #1a1a1a; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f59e0b; color: #1a1a1a; font-weight: bold; padding: 7px 6px; text-align: left; border: 1px solid #ddd; }
  td { padding: 6px; border: 1px solid #ddd; vertical-align: top; line-height: 1.4; }
  tr:nth-child(even) td { background: #fafafa; }
  .risk-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; }
  .risk-high { background: #fee2e2; color: #dc2626; }
  ul.plain { list-style: none; padding: 0; }
  ul.plain li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
  ul.plain li::before { content: "✓ "; color: #f59e0b; font-weight: bold; }
  .footer { margin-top: 20px; border-top: 2px solid #f59e0b; padding-top: 8px; font-size: 9px; color: #888; display: flex; justify-content: space-between; }
  .legend { font-size: 9px; color: #666; margin-top: 4px; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
 
<!-- HEADER -->
<div class="header">
  <div>
    <div class="company-name">SAFETY TRAFFIC CONTROL</div>
    <div style="font-size:10px;color:#666;">ABN: 89 740 423 914 | Phone: 0433 264 319</div>
    <div style="font-size:10px;color:#666;">jobs@safetytrafficcontrol.com.au</div>
  </div>
  <div>
    <div class="doc-title">SAFE WORK METHOD STATEMENT</div>
    <div class="doc-meta">SWMS No: ${fmt(job.swms_id)}</div>
    <div class="doc-meta">Job ID: ${fmt(job.job_id)}</div>
    <div class="doc-meta">Issued: ${fmtDate(job.created_at)}</div>
  </div>
</div>
 
<!-- SECTION 1: JOB DETAILS -->
<div class="section">
  <div class="section-title">1. Job Details</div>
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Project / Site</div><div class="info-value">${fmt(job.location)}</div></div>
    <div class="info-cell"><div class="info-label">Job Type</div><div class="info-value">${fmt(job.job_type)}</div></div>
    <div class="info-cell"><div class="info-label">Date of Works</div><div class="info-value">${fmtDate(job.start_date)}</div></div>
    <div class="info-cell"><div class="info-label">Hours</div><div class="info-value">${fmtTime(job.start_time)} – ${fmtTime(job.finish_time)}</div></div>
    <div class="info-cell"><div class="info-label">Client</div><div class="info-value">${fmt(job.client_name)}</div></div>
    <div class="info-cell"><div class="info-label">Site Supervisor</div><div class="info-value">${fmt(job.site_supervisor) || fmt(job.client_name)}</div></div>
    <div class="info-cell"><div class="info-label">Crew Size</div><div class="info-value">${fmt(job.crew_size)} controllers</div></div>
    <div class="info-cell"><div class="info-label">Vehicles</div><div class="info-value">${fmt(job.vehicles)} vehicle(s)</div></div>
  </div>
</div>
 
<!-- SECTION 2: SCOPE OF WORKS -->
<div class="section">
  <div class="section-title">2. Scope of Works</div>
  <div style="padding:8px;border:1px solid #ddd;font-size:11px;line-height:1.6;">
    Traffic control activities including Stop/Slow operations, lane and shoulder closures, mobile traffic control,
    ${job.requires_tpc ? 'night works, ' : ''}emergency call-outs, and setup/removal of temporary traffic signage.
    ${job.notes ? '<br/><br/><strong>Additional notes:</strong> ' + job.notes : ''}
  </div>
</div>
 
<!-- SECTION 3: LEGISLATION & REFERENCES -->
<div class="section">
  <div class="section-title">3. Legislation, Standards & References</div>
  <div style="padding:8px;border:1px solid #ddd;font-size:10px;line-height:1.8;">
    Work Health and Safety Act 2011 (NSW) &nbsp;|&nbsp;
    WHS Regulation 2017 (NSW) &nbsp;|&nbsp;
    TfNSW Traffic Control at Work Sites Manual &nbsp;|&nbsp;
    Australian Standard AS 1742 series &nbsp;|&nbsp;
    NSW Codes of Practice
  </div>
</div>
 
<!-- SECTION 4: HIGH RISK CONSTRUCTION WORK -->
<div class="section">
  <div class="section-title">4. High Risk Construction Work</div>
  <ul class="plain" style="border:1px solid #ddd;padding:8px 8px 8px 12px;">
    ${hrcwRows}
  </ul>
</div>
 
<!-- SECTION 5: HAZARD IDENTIFICATION & CONTROL MEASURES -->
<div class="section">
  <div class="section-title">5. Hazard Identification & Control Measures</div>
  <table>
    <thead>
      <tr>
        <th style="width:3%">#</th>
        <th style="width:18%">Task</th>
        <th style="width:17%">Hazard</th>
        <th style="width:13%">Risk</th>
        <th style="width:37%">Control Measures</th>
        <th style="width:12%">Responsible</th>
      </tr>
    </thead>
    <tbody>
      ${hazardRows}
    </tbody>
  </table>
</div>
 
<!-- SECTION 6: PPE REQUIREMENTS -->
<div class="section">
  <div class="section-title">6. Personal Protective Equipment (PPE)</div>
  <ul class="plain" style="border:1px solid #ddd;padding:8px 8px 8px 12px;">
    ${ppeRows}
  </ul>
</div>
 
<!-- SECTION 7: EMERGENCY PROCEDURES -->
<div class="section">
  <div class="section-title">7. Emergency Procedures</div>
  <div style="padding:8px;border:1px solid #ddd;font-size:10px;line-height:1.7;">
    Emergency contact numbers available on site at all times. First aid kit accessible and location known to all workers.
    Emergency services access maintained at all times. All incidents and near misses to be reported immediately to the Site Supervisor.
    <strong>Emergency: 000</strong>
  </div>
</div>
 
<!-- SECTION 8: WORKER ACKNOWLEDGEMENT / SIGNATURES -->
<div class="section">
  <div class="section-title">8. Worker Acknowledgement</div>
  <p style="font-size:10px;margin-bottom:8px;padding:6px;background:#fffbeb;border:1px solid #f59e0b;">
    By signing below, I confirm I have read, understood and will comply with this Safe Work Method Statement.
  </p>
  <table>
    <thead>
      <tr>
        <th>Worker Name</th>
        <th>Signature</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${sigRows}
      <!-- Extra blank rows for on-site signing -->
      <tr><td style="height:40px;">&nbsp;</td><td></td><td></td></tr>
      <tr><td style="height:40px;">&nbsp;</td><td></td><td></td></tr>
    </tbody>
  </table>
</div>
 
<!-- FOOTER -->
<div class="footer">
  <span>Safety Traffic Control | ABN: 89 740 423 914 | jobs@safetytrafficcontrol.com.au</span>
  <span>SWMS: ${fmt(job.swms_id)} | Generated: ${new Date().toLocaleDateString('en-AU')}</span>
</div>
 
</body>
</html>`;
}
 
// ─── GET /hazards — return full hazard list for app ───────────────────────────
app.get('/hazards', (req, res) => {
  res.json(SWMS_HAZARDS);
});
 
// ─── POST /generate-swms ──────────────────────────────────────────────────────
// Called by app when staff submits their 5+ task selections
// Body: { job_id, selected_hazard_ids, staff_id }
app.post('/generate-swms', async (req, res) => {
  const { job_id, selected_hazard_ids, staff_id } = req.body;
 
  if (!job_id || !selected_hazard_ids || selected_hazard_ids.length < 5) {
    return res.status(400).json({ error: 'job_id and at least 5 selected_hazard_ids required' });
  }
 
  try {
    // 1. Fetch job from Supabase
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .single();
 
    if (jobErr || !job) {
      return res.status(404).json({ error: 'Job not found', detail: jobErr });
    }
 
    // 2. Filter selected hazards (preserve order of selection)
    const selectedHazards = selected_hazard_ids
      .map(id => SWMS_HAZARDS.find(h => h.id === id))
      .filter(Boolean);
 
    // 3. Fetch existing signatures for this job (if any)
    const { data: signatures } = await supabase
      .from('signatures')
      .select('*, staff:staff_id(name)')
      .eq('job_id', job_id)
      .eq('document_type', 'swms');
 
    const sigData = (signatures || []).map(s => ({
      staff_name: s.staff?.name || 'Worker',
      signature_url: s.signature_url,
      signed_at: s.signed_at
    }));
 
    // 4. Build HTML
    const html = buildSWMSHtml(job, selectedHazards, sigData);
 
    // 5. Generate PDF via Puppeteer
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
    });
    await browser.close();
 
    // 6. Upload to Supabase Storage
    const fileName = `swms/${job.job_id}/swms_${Date.now()}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });
 
    if (uploadErr) {
      return res.status(500).json({ error: 'Storage upload failed', detail: uploadErr });
    }
 
    // 7. Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName);
 
    const swms_url = urlData.publicUrl;
 
    // 8. Save selections to job_swms_selections table
    await supabase.from('job_swms_selections').upsert({
      job_id,
      staff_id,
      hazard_ids: selected_hazard_ids,
      submitted_at: new Date().toISOString()
    }, { onConflict: 'job_id' });
 
    // 9. Update jobs record with swms_url
    await supabase
      .from('jobs')
      .update({ swms_url })
      .eq('id', job_id);
 
    res.json({ success: true, swms_url, job_id });
 
  } catch (err) {
    console.error('SWMS generation error:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});
 
// ─── POST /regenerate-swms-signatures ────────────────────────────────────────
// Called after a new worker signs — rebuilds PDF with all current signatures
app.post('/regenerate-swms-signatures', async (req, res) => {
  const { job_id } = req.body;
  if (!job_id) return res.status(400).json({ error: 'job_id required' });
 
  try {
    // Fetch job
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', job_id)
      .single();
    if (jobErr || !job) return res.status(404).json({ error: 'Job not found' });
 
    // Fetch selections
    const { data: selection } = await supabase
      .from('job_swms_selections')
      .select('hazard_ids')
      .eq('job_id', job_id)
      .single();
 
    if (!selection) return res.status(404).json({ error: 'No SWMS selections found for this job' });
 
    const selectedHazards = selection.hazard_ids
      .map(id => SWMS_HAZARDS.find(h => h.id === id))
      .filter(Boolean);
 
    // Fetch all signatures
    const { data: signatures } = await supabase
      .from('signatures')
      .select('*, staff:staff_id(name)')
      .eq('job_id', job_id)
      .eq('document_type', 'swms');
 
    const sigData = (signatures || []).map(s => ({
      staff_name: s.staff?.name || 'Worker',
      signature_url: s.signature_url,
      signed_at: s.signed_at
    }));
 
    // Rebuild HTML + PDF
    const html = buildSWMSHtml(job, selectedHazards, sigData);
 
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }
    });
    await browser.close();
 
    // Overwrite same file in storage
    const fileName = `swms/${job.job_id}/swms_final.pdf`;
    await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });
 
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName);
 
    const swms_url = urlData.publicUrl;
 
    await supabase.from('jobs').update({ swms_url }).eq('id', job_id);
 
    res.json({ success: true, swms_url });
  } catch (err) {
    console.error('Regenerate error:', err);
    res.status(500).json({ error: err.message });
  }
});
 
// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));
 
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SWMS server running on port ${PORT}`));
