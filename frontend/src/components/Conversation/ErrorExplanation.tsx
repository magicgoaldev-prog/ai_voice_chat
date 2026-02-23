interface ErrorExplanationProps {
  explanation: string;
  isOpen: boolean;
  onToggle: () => void;
}

export default function ErrorExplanation({
  explanation,
  isOpen,
  onToggle,
}: ErrorExplanationProps) {
  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 transition-colors"
      >
        {isOpen ? (
          <>
            <span>Hide explanation</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 14l5-5 5 5z" />
            </svg>
          </>
        ) : (
          <>
            <span>Show explanation</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </>
        )}
      </button>
      {isOpen && (
        <div className="mt-2 p-3 bg-emerald-50/80 border border-emerald-200/60 rounded-lg text-xs text-emerald-900 leading-relaxed shadow-sm">
          {explanation}
        </div>
      )}
    </div>
  );
}
