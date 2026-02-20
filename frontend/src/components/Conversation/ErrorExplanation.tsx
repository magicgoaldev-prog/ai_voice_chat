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
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="text-xs text-green-700 hover:text-green-900 font-medium"
      >
        {isOpen ? 'Hide explanation ▲' : 'Show explanation ▼'}
      </button>
      {isOpen && (
        <div className="mt-1 p-2 bg-green-50 rounded text-xs text-green-800">
          {explanation}
        </div>
      )}
    </div>
  );
}
