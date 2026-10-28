'use client';

export default function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>&larr; Prev</button>
      <span className="muted">Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next &rarr;</button>
    </div>
  );
}
