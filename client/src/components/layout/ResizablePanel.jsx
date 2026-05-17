import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const COLLAPSE_THRESHOLD = 160;

/**
 * Horizontal resizable split panel with drag handle.
 * Children: [mainContent, sidePanel]
 */
export default function ResizablePanel({
  children,
  sideWidth = 320,
  minSideWidth = MIN_WIDTH,
  maxSideWidth = MAX_WIDTH,
  collapsed = false,
  side = 'right',
  onWidthChange,
  onCollapseChange,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(sideWidth);
  const [currentWidth, setCurrentWidth] = useState(collapsed ? 0 : sideWidth);
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setIsCollapsed(collapsed);
    if (!collapsed) {
      setCurrentWidth(sideWidth);
    }
  }, [collapsed, sideWidth]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = currentWidth || sideWidth;
    setDragging(true);

    const handleMouseMove = (moveEvent) => {
      if (!isDragging.current) return;

      const delta = side === 'right'
        ? startX.current - moveEvent.clientX
        : moveEvent.clientX - startX.current;

      const newWidth = Math.max(0, startWidth.current + delta);

      if (newWidth < COLLAPSE_THRESHOLD) {
        setCurrentWidth(0);
        setIsCollapsed(true);
      } else {
        const clamped = Math.min(Math.max(newWidth, minSideWidth), maxSideWidth);
        setCurrentWidth(clamped);
        setIsCollapsed(false);
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      setDragging(false);

      const finalWidth = isCollapsed ? 0 : currentWidth;
      onWidthChange?.(finalWidth);
      onCollapseChange?.(finalWidth < COLLAPSE_THRESHOLD);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [currentWidth, sideWidth, side, minSideWidth, maxSideWidth, isCollapsed, onWidthChange, onCollapseChange]);

  // Touch support
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    isDragging.current = true;
    startX.current = touch.clientX;
    startWidth.current = currentWidth || sideWidth;
    setDragging(true);

    const handleTouchMove = (moveEvent) => {
      if (!isDragging.current) return;
      const moveTouch = moveEvent.touches[0];
      const delta = side === 'right'
        ? startX.current - moveTouch.clientX
        : moveTouch.clientX - startX.current;

      const newWidth = Math.max(0, startWidth.current + delta);

      if (newWidth < COLLAPSE_THRESHOLD) {
        setCurrentWidth(0);
        setIsCollapsed(true);
      } else {
        const clamped = Math.min(Math.max(newWidth, minSideWidth), maxSideWidth);
        setCurrentWidth(clamped);
        setIsCollapsed(false);
      }
    };

    const handleTouchEnd = () => {
      isDragging.current = false;
      setDragging(false);
      onWidthChange?.(currentWidth);
      onCollapseChange?.(currentWidth < COLLAPSE_THRESHOLD);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }, [currentWidth, sideWidth, side, minSideWidth, maxSideWidth, onWidthChange, onCollapseChange]);

  const mainContent = Array.isArray(children) ? children[0] : children;
  const sideContent = Array.isArray(children) ? children[1] : null;

  return (
    <>
      <div
        ref={containerRef}
        className={`resizable-panel-container ${className} ${dragging ? 'is-dragging' : ''}`}
        style={style}
      >
        <div className="resizable-panel-main">
          {mainContent}
        </div>

        <div
          className={`resizable-panel-handle ${isCollapsed ? 'collapsed' : ''}`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
        >
          <div className="resizable-panel-handle-line" />
        </div>

        <div
          className={`resizable-panel-side ${isCollapsed ? 'collapsed' : ''}`}
          style={{
            width: isCollapsed ? 0 : currentWidth,
            minWidth: isCollapsed ? 0 : undefined,
            transition: dragging ? 'none' : 'width 0.2s ease',
          }}
        >
          {!isCollapsed && sideContent}
        </div>
      </div>

      <style>{resizablePanelStyles}</style>
    </>
  );
}

const resizablePanelStyles = `
  .resizable-panel-container {
    display: flex;
    min-height: 0;
    width: 100%;
    position: relative;
  }

  .resizable-panel-container.is-dragging {
    user-select: none;
    cursor: col-resize;
  }

  .resizable-panel-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .resizable-panel-handle {
    width: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: col-resize;
    position: relative;
    z-index: 5;
    touch-action: none;
  }

  .resizable-panel-handle:hover .resizable-panel-handle-line,
  .is-dragging .resizable-panel-handle-line {
    background: var(--color-primary);
    opacity: 0.6;
    width: 3px;
  }

  .resizable-panel-handle-line {
    width: 2px;
    height: 40px;
    border-radius: 2px;
    background: var(--color-border);
    transition: all 0.15s ease;
  }

  .resizable-panel-handle.collapsed {
    cursor: e-resize;
  }

  .resizable-panel-side {
    flex-shrink: 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .resizable-panel-side.collapsed {
    width: 0 !important;
    overflow: hidden;
  }

  @media (max-width: 1024px) {
    .resizable-panel-handle {
      display: none;
    }

    .resizable-panel-side {
      display: none;
    }

    .resizable-panel-container {
      flex-direction: column;
    }
  }
`;
