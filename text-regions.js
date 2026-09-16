// Prefer complete AI text blocks while retaining local OCR outside them.
export function isDiagramLabel(region, images = []) {
  const text=String(region.sourceText||region.text||'').replace(/\$/g,'').trim();
  // Only standalone labels: never discard a condition, question, or equation.
  if(!/^(?:[A-Za-zΑ-ω][A-Za-z0-9′']{0,2}|\d+(?:\.\d+)?°?)(?:\s+(?:[A-Za-zΑ-ω][A-Za-z0-9′']{0,2}|\d+(?:\.\d+)?°?))*$/.test(text))return false;
  const r=region.inkBox||region,cx=r.x+r.w/2,cy=r.y+r.h/2;
  return images.some(image=>cx>=image.x&&cx<=image.x+image.w&&cy>=image.y&&cy<=image.y+image.h);
}
export function mergeTextRegions(ai, fallback, images = []) {
  const boxes = [];
  for (const region of [...ai, ...fallback]) {
    if(isDiagramLabel(region,images))continue;
    if (region.w <= 20 || region.h <= 12) continue;
    if (fallback.includes(region) && ai.some(block => {
      const width = Math.max(0, Math.min(block.x + block.w, region.x + region.w) - Math.max(block.x, region.x));
      const height = Math.max(0, Math.min(block.y + block.h, region.y + region.h) - Math.max(block.y, region.y));
      // Local OCR adds generous padding around each line, which can exceed an AI paragraph box.
      const centerY = region.y + region.h / 2;
      return width * height / (region.w * region.h) >= .45 ||
        (width / region.w > .8 && centerY >= block.y - 16 && centerY <= block.y + block.h + 16);
    })) continue;
    if (boxes.some(block => Math.abs((block.x + block.w / 2) - (region.x + region.w / 2)) < Math.max(16, Math.min(block.w, region.w) * .25) &&
      Math.abs((block.y + block.h / 2) - (region.y + region.h / 2)) < Math.max(12, Math.min(block.h, region.h) * .3))) continue;
    boxes.push({...region, sourceText: region.sourceText || region.text || ''});
  }
  return boxes;
}
