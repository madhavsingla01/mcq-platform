import { memo, useEffect, useRef } from 'react';
import { Check, Flag } from 'lucide-react';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Grid, useGridRef } from 'react-window';
import { useQuizStore } from '../../../store/quizStore';

const COLLAPSED_CELL_SIZE = 50;
const EXPANDED_CELL_SIZE = 60;

const getColumnCount = (width, cellSize) => Math.max(1, Math.floor(width / cellSize) || 1);

const NavigatorCell = memo(function NavigatorCell({
  answers,
  ariaAttributes,
  collapsed,
  columnCount,
  columnIndex,
  currentIndex,
  markedForReview,
  questions,
  rowIndex,
  setCurrentIndex,
  style,
}) {
  const index = rowIndex * columnCount + columnIndex;

  if (index >= questions.length) {
    return null;
  }

  const question = questions[index];
  const isCurrent = index === currentIndex;
  const isAnswered = Boolean(answers[question._id]?.selectedAnswer);
  const isFlagged = markedForReview.includes(question._id);
  const buttonSize = collapsed ? 'w-9 h-9 text-xs' : 'w-10 h-10 text-sm';

  return (
    <div style={style} className="flex items-center justify-center" {...ariaAttributes}>
      <button
        type="button"
        onClick={() => setCurrentIndex(index)}
        title={`Question ${index + 1}`}
        className={`relative ${buttonSize} rounded-full flex items-center justify-center font-medium transition-all duration-150 outline-none ${
          isCurrent
            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-600 z-10'
            : isAnswered
              ? 'bg-white text-zinc-900 border border-zinc-200'
              : 'bg-white text-zinc-500 border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'
        }`}
      >
        <span>{index + 1}</span>

        {isFlagged && !collapsed && (
          <span
            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center shadow-sm ${
              isCurrent ? 'bg-white text-amber-500' : 'bg-amber-100 text-amber-600'
            }`}
          >
            <Flag className="w-2 h-2 fill-current" />
          </span>
        )}

        {!isFlagged && isAnswered && !isCurrent && !collapsed && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-zinc-800 rounded-full flex items-center justify-center ring-2 ring-[#fcfcfc]">
            <Check className="w-2 h-2 text-white stroke-[3]" />
          </span>
        )}
      </button>
    </div>
  );
});

function NavigatorSidebar({ collapsed = false }) {
  const {
    answers = {},
    currentIndex = 0,
    markedForReview = [],
    questions = [],
    setCurrentIndex,
  } = useQuizStore();
  const gridRef = useGridRef();
  const columnCountRef = useRef(1);
  const cellSize = collapsed ? COLLAPSED_CELL_SIZE : EXPANDED_CELL_SIZE;

  useEffect(() => {
    if (currentIndex < 0 || currentIndex >= questions.length) {
      return;
    }

    const columnCount = columnCountRef.current;

    gridRef.current?.scrollToCell({
      behavior: 'smooth',
      columnAlign: 'center',
      columnIndex: currentIndex % columnCount,
      rowAlign: 'center',
      rowIndex: Math.floor(currentIndex / columnCount),
    });
  }, [currentIndex, gridRef, questions.length]);

  const renderGrid = ({ height, width }) => {
    if (!height || !width) {
      return null;
    }

    const columnCount = getColumnCount(width, cellSize);
    const rowCount = Math.ceil(questions.length / columnCount);
    columnCountRef.current = columnCount;

    return (
      <Grid
        cellComponent={NavigatorCell}
        cellProps={{
          answers,
          collapsed,
          columnCount,
          currentIndex,
          markedForReview,
          questions,
          setCurrentIndex,
        }}
        className="custom-scrollbar"
        columnCount={columnCount}
        columnWidth={width / columnCount}
        defaultHeight={height}
        defaultWidth={width}
        gridRef={gridRef}
        rowCount={rowCount}
        rowHeight={cellSize}
        style={{ height, width }}
      />
    );
  };

  if (collapsed) {
    return (
      <div className="h-full bg-[#fcfcfc] border-r border-zinc-200 flex flex-col items-center py-2">
        <div className="flex-1 w-full overflow-hidden">
          <AutoSizer renderProp={renderGrid} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#fcfcfc] border-r border-zinc-200 flex flex-col">
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Navigator</h2>
      </div>

      <div className="flex-1 w-full overflow-hidden p-2">
        <AutoSizer renderProp={renderGrid} />
      </div>
    </div>
  );
}

export default memo(NavigatorSidebar);
