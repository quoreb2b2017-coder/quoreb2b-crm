/** Capture the payslip DOM as a clean single-page A4 PDF (no overlapping text). */

const A4_CSS_PX = 794; // ~210mm at 96dpi

function waitFrames(n = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

async function waitImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          // Cached / already decoded
          setTimeout(done, 2500);
        }),
    ),
  );
}

function buildCaptureHost(source: HTMLElement): {
  host: HTMLDivElement;
  clone: HTMLElement;
} {
  const host = document.createElement('div');
  host.setAttribute('data-payslip-pdf-host', '1');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${A4_CSS_PX}px`,
    margin: '0',
    padding: '0',
    background: '#ffffff',
    zIndex: '-1',
    pointerEvents: 'none',
    overflow: 'visible',
  });

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('salary-slip--pdf');
  clone.removeAttribute('id');
  Object.assign(clone.style, {
    width: `${A4_CSS_PX}px`,
    maxWidth: `${A4_CSS_PX}px`,
    margin: '0',
    boxShadow: 'none',
    borderRadius: '0',
  });

  host.appendChild(clone);
  document.body.appendChild(host);
  return { host, clone };
}

export async function downloadPayslipPdf(
  element: HTMLElement | null,
  fileName: string,
): Promise<void> {
  if (!element) {
    throw new Error('Payslip not ready');
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const { host, clone } = buildCaptureHost(element);

  try {
    await waitImages(clone);
    await waitFrames(3);

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: A4_CSS_PX,
      windowWidth: A4_CSS_PX,
      scrollX: 0,
      scrollY: 0,
      foreignObjectRendering: false,
      onclone: (_doc, clonedEl) => {
        clonedEl.classList.add('salary-slip--pdf');
        // Kill common html2canvas letter-spacing / flex bugs on the clone tree
        clonedEl.querySelectorAll<HTMLElement>('*').forEach((node) => {
          const cs = (clonedEl.ownerDocument?.defaultView ?? window).getComputedStyle(node);
          if (cs.letterSpacing && cs.letterSpacing !== 'normal' && cs.letterSpacing !== '0px') {
            node.style.letterSpacing = 'normal';
          }
        });
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin * 2;

    const imgW = canvas.width;
    const imgH = canvas.height;
    const ratio = Math.min(maxW / imgW, maxH / imgH);
    const w = imgW * ratio;
    const h = imgH * ratio;

    // If content still taller than one page after fit, split across pages
    if (h <= maxH + 0.1) {
      const x = (pageWidth - w) / 2;
      pdf.addImage(imgData, 'JPEG', x, margin, w, h, undefined, 'FAST');
    } else {
      // Prefer full width; paginate vertically
      const renderW = maxW;
      const renderH = (imgH * renderW) / imgW;
      const pageContentH = maxH;
      const totalPages = Math.ceil(renderH / pageContentH);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        const srcY = (page * pageContentH * imgH) / renderH;
        const srcH = Math.min((pageContentH * imgH) / renderH, imgH - srcY);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = imgW;
        sliceCanvas.height = Math.max(1, Math.round(srcH));
        const ctx = sliceCanvas.getContext('2d');
        if (!ctx) throw new Error('PDF canvas failed');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          Math.round(srcY),
          imgW,
          Math.round(srcH),
          0,
          0,
          imgW,
          Math.round(srcH),
        );
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
        const sliceH = (sliceCanvas.height * renderW) / sliceCanvas.width;
        pdf.addImage(sliceData, 'JPEG', margin, margin, renderW, sliceH, undefined, 'FAST');
      }
    }

    const safe = fileName.replace(/[^\w.\- ]+/g, '_').trim() || 'salary-slip';
    pdf.save(safe.endsWith('.pdf') ? safe : `${safe}.pdf`);
  } finally {
    host.remove();
  }
}

export function payslipFileName(periodLabel: string, employeeName: string) {
  return `Payslip_${periodLabel.replace(/\s+/g, '-')}_${employeeName.replace(/\s+/g, '-')}`;
}

export async function downloadPayslipFromRef(
  ref: { current: HTMLElement | null },
  fileName: string,
) {
  return downloadPayslipPdf(ref.current, fileName);
}
