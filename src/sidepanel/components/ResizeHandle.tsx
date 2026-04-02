import { useCallback, useRef } from "react";
import styles from "./ResizeHandle.module.css";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ResizeHandle({
  direction,
  onResize,
  onResizeEnd,
  collapsed,
  onToggleCollapse,
}: ResizeHandleProps) {
  const startPos = useRef(0);
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsed) return;
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;

      const cursorStyle = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.cursor = cursorStyle;
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragging.current) return;
        const currentPos =
          direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPos.current;
        startPos.current = currentPos;
        onResize(delta);
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        onResizeEnd?.();
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [direction, onResize, onResizeEnd, collapsed],
  );

  if (collapsed) {
    return (
      <div
        className={`${styles.handle} ${styles.horizontal} ${styles.collapsedHandle}`}
        onClick={onToggleCollapse}
        data-testid="resize-handle-collapsed"
      >
        <span className={styles.grip}>&#9654;</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.handle} ${styles[direction]}`}
      onMouseDown={handleMouseDown}
      data-testid={`resize-handle-${direction}`}
    >
      {onToggleCollapse && (
        <button
          className={styles.collapseButton}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          data-testid="collapse-toggle"
          title="Toggle keys panel"
        >
          &#9664;
        </button>
      )}
      <span className={styles.grip}>
        {direction === "horizontal" ? "\u22EE" : "\u22EF"}
      </span>
    </div>
  );
}
