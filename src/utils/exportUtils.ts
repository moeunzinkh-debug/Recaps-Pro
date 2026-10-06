import { Project, CutItem } from '../types';

export function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatSrtTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function parseTimecodeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(timeStr) || 0;
}

export function exportToTxt(project: Project): void {
  const title = project.analysis?.detectedTitle || project.name;
  const fullText = project.analysis?.recapScript?.fullText || '';
  const content = `=====================================================
RECAP STUDIO AI - SCRIPT EXPORT
Title: ${title}
Episode: ${project.analysis?.detectedEpisode || 'N/A'}
Genre: ${project.analysis?.genre || 'N/A'}
Language: ${project.settings.language}
Tone: ${project.settings.narrationTone}
Estimated Duration: ${project.analysis?.estimatedNarrationDuration || 'N/A'}
Word Count: ${project.analysis?.wordCount || 0}
Export Date: ${new Date().toLocaleString()}
=====================================================

FULL RECAP SCRIPT:

${fullText}

=====================================================
VIDEO CUT GUIDE:
=====================================================

${(project.analysis?.cutGuide || [])
  .map(
    (cut) => `CUT #${cut.cutNumber} [${cut.category}]
Recap Timeline:   ${cut.recapStart} - ${cut.recapEnd}
Original Video:   ${cut.originalStart} - ${cut.originalEnd}${cut.isApproximate ? ' (Approximate)' : ''}
Visual:           ${cut.visual}
Narration:        "${cut.narration}"
Reason:           ${cut.reason}
-----------------------------------------------------`
  )
  .join('\n\n')}
`;

  downloadFile(content, `${sanitizeFilename(title)}_Recap_Script.txt`, 'text/plain;charset=utf-8');
}

export function exportToCsv(project: Project): void {
  const cuts = project.analysis?.cutGuide || [];
  const headers = ['Cut #', 'Category', 'Recap Start', 'Recap End', 'Original Start', 'Original End', 'Scene Description', 'Narration', 'Reason', 'Approximate'];
  const rows = cuts.map((c) => [
    c.cutNumber,
    `"${escapeCsv(c.category)}"`,
    `"${c.recapStart}"`,
    `"${c.recapEnd}"`,
    `"${c.originalStart}"`,
    `"${c.originalEnd}"`,
    `"${escapeCsv(c.visual)}"`,
    `"${escapeCsv(c.narration)}"`,
    `"${escapeCsv(c.reason)}"`,
    c.isApproximate ? 'Yes' : 'No',
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const title = project.analysis?.detectedTitle || project.name;
  downloadFile(csvContent, `${sanitizeFilename(title)}_Cut_Guide.csv`, 'text/csv;charset=utf-8');
}

export function exportToJson(project: Project): void {
  const dataStr = JSON.stringify(project, null, 2);
  const title = project.analysis?.detectedTitle || project.name;
  downloadFile(dataStr, `${sanitizeFilename(title)}_Project.json`, 'application/json;charset=utf-8');
}

export function exportToSrt(project: Project): void {
  const cuts = project.analysis?.cutGuide || [];
  let srtContent = '';

  cuts.forEach((cut, idx) => {
    const startStr = formatSrtTimecode(cut.recapStartSec);
    const endStr = formatSrtTimecode(cut.recapEndSec);
    srtContent += `${idx + 1}\n${startStr} --> ${endStr}\n${cut.narration}\n\n`;
  });

  const title = project.analysis?.detectedTitle || project.name;
  downloadFile(srtContent, `${sanitizeFilename(title)}_Subtitles.srt`, 'text/plain;charset=utf-8');
}

export function exportToDoc(project: Project): void {
  const title = project.analysis?.detectedTitle || project.name;
  const fullText = project.analysis?.recapScript?.fullText || '';
  const cuts = project.analysis?.cutGuide || [];

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #111; max-width: 800px; margin: 40px auto; }
        h1 { color: #d97706; border-bottom: 2px solid #f59e0b; padding-bottom: 8px; }
        h2 { color: #2563eb; margin-top: 30px; }
        .meta { background: #f3f4f6; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
        .cut-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; margin-bottom: 15px; background: #fafafa; }
        .badge { display: inline-block; padding: 3px 8px; background: #e0e7ff; color: #3730a3; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .times { font-weight: bold; color: #4b5563; }
        .narration { font-style: italic; color: #1f2937; margin: 8px 0; }
      </style>
    </head>
    <body>
      <h1>Recap Studio AI: ${title}</h1>
      <div class="meta">
        <p><strong>Genre:</strong> ${project.analysis?.genre || 'N/A'} | <strong>Language:</strong> ${project.settings.language} | <strong>Tone:</strong> ${project.settings.narrationTone}</p>
        <p><strong>Estimated Duration:</strong> ${project.analysis?.estimatedNarrationDuration || 'N/A'} | <strong>Word Count:</strong> ${project.analysis?.wordCount || 0}</p>
        <p><strong>Synopsis:</strong> ${project.analysis?.synopsis || 'N/A'}</p>
      </div>

      <h2>FULL RECAP SCRIPT</h2>
      <div style="white-space: pre-line; background: #fff; padding: 20px; border-left: 4px solid #f59e0b; border-radius: 4px;">
        ${fullText}
      </div>

      <h2>VIDEO CUT GUIDE & TIMELINE</h2>
      ${cuts
        .map(
          (cut) => `
        <div class="cut-card">
          <div style="display: flex; justify-content: space-between;">
            <strong>CUT #${cut.cutNumber}</strong>
            <span class="badge">${cut.category}</span>
          </div>
          <p class="times">
            <strong>Recap:</strong> ${cut.recapStart} - ${cut.recapEnd} &nbsp;|&nbsp;
            <strong>Original Video:</strong> ${cut.originalStart} - ${cut.originalEnd} ${cut.isApproximate ? '(Approximate)' : ''}
          </p>
          <p><strong>Visual:</strong> ${cut.visual}</p>
          <p class="narration">"${cut.narration}"</p>
          <p style="font-size: 13px; color: #6b7280;"><strong>Reason:</strong> ${cut.reason}</p>
        </div>
      `
        )
        .join('')}
    </body>
    </html>
  `;

  downloadFile(htmlContent, `${sanitizeFilename(title)}_Recap_Document.doc`, 'application/msword;charset=utf-8');
}

function escapeCsv(text: string): string {
  if (!text) return '';
  return text.replace(/"/g, '""');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\u1780-\u17FF-]/g, '_').substring(0, 50);
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
