/** 0-based position in source text */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  start: SourcePosition;
  end: SourcePosition;
}

export function pos(line: number, column: number, offset: number): SourcePosition {
  return { line, column, offset };
}

export function span(start: SourcePosition, end: SourcePosition): SourceSpan {
  return { start, end };
}
