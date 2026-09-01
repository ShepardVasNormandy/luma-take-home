interface PaginationFooterProps {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}

export function PaginationFooter({ page, pageSize, total, noun, onPage }: PaginationFooterProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="pagination-footer">
      <span>
        {start}–{end} of {total} {noun}
      </span>
      <span className="pager">
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹
        </button>
        <button
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          ›
        </button>
      </span>
    </div>
  );
}
