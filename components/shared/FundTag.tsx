// The small uppercase navy pill that names a fund or vehicle. Lifted out of the
// portfolio cards so Fund Performance's Top positions can use the SAME tag —
// a fund should look like the same object wherever it appears.
//
// A tag is one unit: it never breaks across lines inside its own pill (the
// parent wraps whole tags instead), and one wider than its row truncates with
// an ellipsis rather than overflowing the card.
export default function FundTag({ fund }: { fund: string }) {
  return (
    <span
      className="inline-block max-w-full truncate px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      title={fund}
      style={{ backgroundColor: 'rgba(2,58,81,0.08)', color: '#023a51' }}
    >
      {fund}
    </span>
  )
}
