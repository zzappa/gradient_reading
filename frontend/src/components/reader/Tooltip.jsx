import { useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Tooltip({ anchorRef, children }) {
  const tooltipRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false });

  useLayoutEffect(() => {
    if (!anchorRef.current || !tooltipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const flip = anchor.top - tooltip.height - 8 < 0;

    setPos({
      top: flip
        ? anchor.bottom + window.scrollY + 6
        : anchor.top + window.scrollY - tooltip.height - 6,
      left: Math.max(8, Math.min(
        anchor.left + anchor.width / 2 - tooltip.width / 2,
        window.innerWidth - tooltip.width - 8
      )),
      flip,
    });
  }, [anchorRef]);

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-50 px-3 py-2 bg-bg border border-border rounded-lg shadow-lg max-w-[260px] animate-in fade-in duration-150"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>,
    document.body
  );
}
